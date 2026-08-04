/**
 * 故事事件包生成器（构建期开发工具，不进入运行时）。
 * 读取 scripts/gen-content/*.js 的事件规格，校验契约后写入：
 *   - assets/story/events/<id>.json   每个事件一个文件
 *   - assets/story/worldlines/worldline_<id>.json  同步 eventIds
 *   - assets/story/manifest.json      同步登记
 * 用法：node scripts/gen_story_events.mjs
 * 契约参考：src/engine/graph.ts / 审计结论（只允许 9 种效果、5 种 period、11 种条件）。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EVENTS_DIR = join(ROOT, 'assets/story/events');
const WL_DIR = join(ROOT, 'assets/story/worldlines');
const MANIFEST_PATH = join(ROOT, 'assets/story/manifest.json');

const ALLOWED_PERIODS = new Set(['NORMAL', 'OFFSEASON', 'TRANSFER_WINDOW', 'AFTER_TOP20', 'FINAL_DECISIVE_MOMENT']);
const ALLOWED_PHASES = new Set(['PRE_TOURNAMENT', 'IN_TOURNAMENT', 'POST_TOURNAMENT']);
const ALLOWED_EFFECTS = new Set([
  'ATTRIBUTE_CHANGE', 'PLAYER_STAT_CHANGE', 'TEAM_TRANSFER', 'ROLE_CHANGE',
  'WORLDLINE_CHANGE', 'FLAG_ADD', 'FLAG_REMOVE', 'TROPHY_CHANGE', 'CAREER_STAT_CHANGE',
]);
const ALLOWED_CONDITIONS = new Set([
  'ATTRIBUTE', 'PLAYER_STAT', 'AGE', 'FLAG', 'TEAM', 'WORLDLINE', 'COMPLETED_EVENT', 'TOP20_RANK',
  'GAME_MODE', 'RANDOM', 'ALL', 'ANY', 'NONE',
]);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warn = [];

function check(ok, message) {
  if (!ok) errors.push(message);
}

function validateCondition(cond, path) {
  if (!cond || typeof cond !== 'object') return check(false, `${path}: 条件必须为对象`);
  if (!ALLOWED_CONDITIONS.has(cond.type)) return check(false, `${path}: 条件类型不允许 ${cond.type}`);
  if ((cond.type === 'ALL' || cond.type === 'ANY' || cond.type === 'NONE') && Array.isArray(cond.conditions)) {
    cond.conditions.forEach((child, i) => validateCondition(child, `${path}.conditions[${i}]`));
  }
}

function validateEffects(fx, path) {
  for (const effect of fx) {
    check(ALLOWED_EFFECTS.has(effect.type), `${path}: 效果类型不允许 ${effect.type}`);
  }
}

/** 展开紧凑规格为完整 StoryEvent JSON。 */
function expand(spec, worldlineId, eventIndex) {
  const id = spec.id;
  check(ID_RE.test(id), `${worldlineId}/${id}: id 必须为 kebab-case`);
  check(eventIndex[id] === undefined, `重复事件 ID: ${id}`);
  check(typeof spec.title === 'string' && spec.title.trim().length > 0, `${id}: 缺少 title`);
  check(typeof spec.desc === 'string' && spec.desc.trim().length > 0, `${id}: 缺少 desc`);
  check(ALLOWED_PERIODS.has(spec.period), `${id}: period 不允许 ${spec.period}`);
  const phase = spec.phase ?? (spec.period === 'FINAL_DECISIVE_MOMENT' ? 'IN_TOURNAMENT' : spec.period === 'OFFSEASON' || spec.period === 'AFTER_TOP20' || spec.repeatable ? 'POST_TOURNAMENT' : 'PRE_TOURNAMENT');
  check(ALLOWED_PHASES.has(phase), `${id}: phase 不允许 ${phase}`);
  const weight = spec.weight ?? (spec.repeatable ? 0.35 : spec.period === 'FINAL_DECISIVE_MOMENT' ? 0.75 : 1);
  const priority = spec.priority ?? (spec.repeatable ? 10 : spec.period === 'FINAL_DECISIVE_MOMENT' ? 80 : 50);
  check(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0, `${id}: weight 必须为非负数字`);
  check(typeof priority === 'number' && Number.isInteger(priority) && priority >= 0 && priority <= 100, `${id}: priority 必须为 0-100 的整数`);
  check(Array.isArray(spec.options) && spec.options.length >= 1, `${id}: 至少一个选项`);
  (spec.conds ?? []).forEach((c, i) => validateCondition(c, `${id}.conditions[${i}]`));
  (spec.autoFx ?? []).forEach((e, i) => validateEffects([e], `${id}.autoEffects[${i}]`));

  const options = spec.options.map((option, oi) => {
    const optId = option.id;
    check(ID_RE.test(optId), `${id}: 选项 id 必须为 kebab-case: ${optId}`);
    check(typeof option.label === 'string' && option.label.trim().length > 0, `${id}/${optId}: 缺少 label`);
    (option.reqs ?? []).forEach((c, i) => validateCondition(c, `${id}/${optId}.reqs[${i}]`));
    validateEffects(option.s?.fx ?? [], `${id}/${optId}.s.fx`);
    validateEffects(option.f?.fx ?? [], `${id}/${optId}.f.fx`);
    for (const key of ['s', 'f']) {
      const out = option[key];
      if (out) {
        check(Array.isArray(out.msg) && out.msg.length >= 2 && out.msg.length <= 4, `${id}/${optId}.${key}.msg: 需 2-4 条消息`);
        for (const m of out.msg) check(typeof m === 'string' && m.trim().length > 0, `${id}/${optId}.${key}.msg: 消息为空`);
      }
    }
    return {
      id: optId,
      label: option.label,
      requirements: option.reqs ?? [],
      successChance: {
        baseChance: option.chance ?? 0.5,
        modifiers: option.mods ?? [],
      },
      outcome: {
        successEffects: option.s?.fx ?? [],
        failureEffects: option.f?.fx ?? [],
        successMessages: option.s?.msg ?? [],
        failureMessages: option.f?.msg ?? [],
        successNextEventId: option.s?.next ?? null,
        failureNextEventId: option.f?.next ?? null,
      },
    };
  });

  const event = {
    id,
    title: spec.title,
    description: spec.desc,
    worldlineId,
    type: 'CHOICE',
    ...(spec.modes ? { allowedModes: spec.modes } : {}),
    ...(spec.repeatable ? { repeatable: true } : {}),
    phase,
    weight,
    priority,
    period: spec.period,
    conditions: spec.conds ?? [],
    options,
    autoEffects: spec.autoFx ?? [],
  };

  // 可重复事件不允许串联 next（否则 preferredEventId 会造成无限事件循环，饿死赛事/赛季结算）
  if (spec.repeatable) {
    for (const option of options) {
      option.outcome.successNextEventId = null;
      option.outcome.failureNextEventId = null;
    }
  }

  // 收集 next 引用
  for (const option of options) {
    const out = option.outcome;
    for (const key of ['successNextEventId', 'failureNextEventId']) {
      const next = out[key];
      if (next) {
        if (eventIndex[next] !== undefined) {
          check(eventIndex[next] === worldlineId, `${id}: ${key} ${next} 不在同一世界线`);
        } else {
          pendingRefs.push({ from: id, next, key });
        }
      }
    }
  }
  return event;
}

// —— 载入内容 ——
const worldlineDefs = {
  rookie: 'rookie',
  grinder: 'grinder',
  prodigy: 'prodigy',
  comeback: 'comeback',
  matchfixing: 'matchfixing',
};
const pendingRefs = [];
const eventIndex = {}; // id -> worldlineId
const eventsByWorldline = {};

for (const [fileKey, worldlineId] of Object.entries(worldlineDefs)) {
  const module = await import(`./gen-content/${fileKey}.js`);
  const specs = module.default;
  check(Array.isArray(specs) && specs.length > 0, `${fileKey}: 无内容`);
  const events = specs.map((spec) => expand(spec, worldlineId, eventIndex));
  for (const event of events) eventIndex[event.id] = event.worldlineId;
  eventsByWorldline[worldlineId] = events;
}

// 二次校验 pending next 引用
for (const { from, next, key } of pendingRefs) {
  check(eventIndex[next] !== undefined, `${from}: ${key} 指向不存在事件 ${next}`);
  check(eventIndex[next] === eventIndex[from], `${from}: ${key} ${next} 不在同一世界线`);
}

if (errors.length) {
  console.error(`❌ 校验失败（${errors.length} 项）：`);
  for (const e of errors) console.error('  -', e);
  if (warn.length) console.warn('警告：', warn);
  process.exit(1);
}

// —— 写入事件文件 ——
mkdirSync(EVENTS_DIR, { recursive: true });
for (const events of Object.values(eventsByWorldline)) {
  for (const event of events) {
    writeFileSync(join(EVENTS_DIR, `${event.id}.json`), `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  }
}

// —— 更新世界线文件（保留 name/description/startEventId，追加 eventIds） ——
const existingWL = new Map();
for (const f of readdirSync(WL_DIR).filter((name) => name.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(WL_DIR, f), 'utf8'));
  existingWL.set(data.id, data);
}
for (const [worldlineId, events] of Object.entries(eventsByWorldline)) {
  const prev = existingWL.get(worldlineId);
  const existingIds = prev?.eventIds ?? [];
  const newIds = events.map((e) => e.id);
  const eventIds = [...existingIds.filter((id) => eventIndex[id]), ...newIds.filter((id) => !existingIds.includes(id))];
  const data = {
    id: worldlineId,
    name: prev?.name ?? worldlineId,
    description: prev?.description,
    startEventId: prev?.startEventId ?? newIds[0],
    eventIds: [...new Set(eventIds)],
  };
  writeFileSync(join(WL_DIR, `worldline_${worldlineId}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// —— 重新生成 manifest ——
const eventFiles = readdirSync(EVENTS_DIR).filter((name) => name.endsWith('.json')).sort();
const worldlineFiles = readdirSync(WL_DIR).filter((name) => name.endsWith('.json')).sort();
const manifest = { schemaVersion: 1, events: eventFiles, worldlines: worldlineFiles };
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// —— 汇总 ——
let total = 0;
console.log('✅ 生成完成');
for (const [worldlineId, events] of Object.entries(eventsByWorldline)) {
  total += events.length;
  console.log(`  ${worldlineId.padEnd(12)} ${String(events.length).padStart(3)} 个事件`);
}
console.log(`  新生成事件合计 ${total} 个 · 事件文件 ${eventFiles.length} · 世界线 ${worldlineFiles.length}`);
console.log(`  已同步 manifest.json 与 worldline 文件`);
