/**
 * 故事包深度审计（只读）：校验全部事件 JSON 的契约合规性。
 * 覆盖：period/条件/效果白名单、next 引用、worldlineId、ID 唯一性、文案数量、
 * TEAM_TRANSFER 真实队伍、manifest 对齐、可执行字段。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EVENTS = join(ROOT, 'assets/story/events');
const WLS = join(ROOT, 'assets/story/worldlines');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'assets/story/manifest.json'), 'utf8'));

const ALLOWED_PERIODS = new Set(['NORMAL', 'OFFSEASON', 'TRANSFER_WINDOW', 'AFTER_TOP20', 'FINAL_DECISIVE_MOMENT']);
const ALLOWED_EFFECTS = new Set(['ATTRIBUTE_CHANGE', 'PLAYER_STAT_CHANGE', 'TEAM_TRANSFER', 'ROLE_CHANGE', 'WORLDLINE_CHANGE', 'FLAG_ADD', 'FLAG_REMOVE', 'TROPHY_CHANGE', 'CAREER_STAT_CHANGE']);
const ALLOWED_CONDITIONS = new Set(['ATTRIBUTE', 'PLAYER_STAT', 'AGE', 'FLAG', 'TEAM', 'WORLDLINE', 'COMPLETED_EVENT', 'GAME_MODE', 'RANDOM', 'ALL', 'ANY', 'NONE']);
const TEAMS = JSON.parse(readFileSync(join(ROOT, 'assets/teams/teams.json'), 'utf8'));
const teamIds = new Set((Array.isArray(TEAMS) ? TEAMS : TEAMS.teams ?? []).map((t) => t.id));
// academy 队伍是独立数据文件（字段为 teamId）
try {
  const ACADEMY = JSON.parse(readFileSync(join(ROOT, 'assets/academy/academy-teams.json'), 'utf8').replace(/^\uFEFF/, ''));
  for (const t of ACADEMY.teams ?? []) teamIds.add(t.teamId);
} catch { /* academy 文件缺失时忽略 */ }

const errors = [];
const events = [];
for (const f of readdirSync(EVENTS).filter((n) => n.endsWith('.json')).sort()) {
  const e = JSON.parse(readFileSync(join(EVENTS, f), 'utf8'));
  events.push(e);
}

const worldlines = [];
for (const f of readdirSync(WLS).filter((n) => n.endsWith('.json')).sort()) {
  worldlines.push(JSON.parse(readFileSync(join(WLS, f), 'utf8')));
}
const wlIds = new Set(worldlines.map((w) => w.id));
const evtIds = new Set(events.map((e) => e.id));
const seen = new Set();

for (const e of events) {
  if (seen.has(e.id)) errors.push(`重复 ID: ${e.id}`);
  seen.add(e.id);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`${e.id}: id 非 kebab-case`);
  if (!wlIds.has(e.worldlineId)) errors.push(`${e.id}: worldlineId 不存在 ${e.worldlineId}`);
  if (!ALLOWED_PERIODS.has(e.period)) errors.push(`${e.id}: period 不允许 ${e.period}`);
  if (!['CHOICE', 'MANDATORY'].includes(e.type)) errors.push(`${e.id}: type 非法 ${e.type}`);
  if (e.options.length < 1) errors.push(`${e.id}: 无选项`);

  const walkCond = (c, path) => {
    if (!ALLOWED_CONDITIONS.has(c?.type)) { errors.push(`${path}: 条件类型非法 ${c?.type}`); return; }
    if (['ALL', 'ANY', 'NONE'].includes(c.type)) c.conditions?.forEach((x, i) => walkCond(x, `${path}[${i}]`));
  };
  e.conditions.forEach((c, i) => walkCond(c, `${e.id}.conds[${i}]`));

  const checkFx = (fx, path) => fx.forEach((x) => {
    if (!ALLOWED_EFFECTS.has(x.type)) errors.push(`${path}: 效果类型非法 ${x.type}`);
    if (x.type === 'TEAM_TRANSFER' && !teamIds.has(x.teamId)) errors.push(`${path}: TEAM_TRANSFER 队伍不存在 ${x.teamId}`);
  });

  e.autoEffects.forEach((x, i) => checkFx([x], `${e.id}.autoFx[${i}]`));
  for (const o of e.options) {
    if (!o.id || !o.label) errors.push(`${e.id}: 选项缺 id/label`);
    o.requirements?.forEach((c, i) => walkCond(c, `${e.id}.${o.id}.reqs[${i}]`));
    checkFx(o.outcome.successEffects ?? [], `${e.id}.${o.id}.s.fx`);
    checkFx(o.outcome.failureEffects ?? [], `${e.id}.${o.id}.f.fx`);
    for (const key of ['successMessages', 'failureMessages']) {
      const msgs = o.outcome[key] ?? [];
      // 可选字段：缺失时回退 event-feedback.json；存在时必须为 2-4 条非空字符串
      if (msgs.length > 0 && (msgs.length < 2 || msgs.length > 4)) errors.push(`${e.id}.${o.id}.${key}: 需 2-4 条（实际 ${msgs.length}）`);
      msgs.forEach((m) => { if (typeof m !== 'string' || !m.trim()) errors.push(`${e.id}.${o.id}.${key}: 空消息`); });
    }
    for (const key of ['successNextEventId', 'failureNextEventId']) {
      const next = o.outcome[key];
      if (next) {
        if (!evtIds.has(next)) errors.push(`${e.id}.${o.id}.${key}: 指向不存在事件 ${next}`);
        else {
          const target = events.find((x) => x.id === next);
          if (target.worldlineId !== e.worldlineId) errors.push(`${e.id}.${o.id}.${key}: 跨世界线 ${next}`);
          if (e.repeatable && target.repeatable) errors.push(`${e.id}.${o.id}.${key}: 可重复事件串联可重复事件（循环风险） ${next}`);
        }
      }
    }
  }
  // 可执行字段检查
  const raw = readFileSync(join(EVENTS, `${e.id}.json`), 'utf8');
  if (/Math\.random|eval\(|new Function|require\(|process\./i.test(raw)) errors.push(`${e.id}: 含可执行字段`);
}

// worldline 引用检查
for (const w of worldlines) {
  if (!evtIds.has(w.startEventId)) errors.push(`世界线 ${w.id}: startEventId 不存在 ${w.startEventId}`);
  for (const id of w.eventIds) if (!evtIds.has(id)) errors.push(`世界线 ${w.id}: eventIds 引用不存在 ${id}`);
}

// manifest 对齐
const evFiles = readdirSync(EVENTS).filter((n) => n.endsWith('.json')).sort();
const wlFiles = readdirSync(WLS).filter((n) => n.endsWith('.json')).sort();
if (JSON.stringify([...MANIFEST.events].sort()) !== JSON.stringify(evFiles)) errors.push('manifest.events 与目录不一致');
if (JSON.stringify([...MANIFEST.worldlines].sort()) !== JSON.stringify(wlFiles)) errors.push('manifest.worldlines 与目录不一致');

console.log(`事件 ${events.length} · 世界线 ${worldlines.length}`);
console.log(errors.length ? `❌ ${errors.length} 个问题：\n` + errors.map((e) => '  - ' + e).join('\n') : '✅ 全部契约校验通过');
process.exit(errors.length ? 1 : 0);
