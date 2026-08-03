#!/usr/bin/env node
// 生成 assets/teams/teams.json —— 战队维护表（供接口使用）
// 数据源：assets/teams/standings_global_2026_07_06.md（HLTV 全球战队积分榜）
// 队标：assets/teams/teams_profile/ 目录
// 用法：node scripts/gen_teams_json.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STANDINGS_MD = join(ROOT, 'assets', 'teams', 'standings_global_2026_07_06.md');
const PROFILE_DIR = join(ROOT, 'assets', 'teams', 'teams_profile');
const OUT_JSON = join(ROOT, 'assets', 'teams', 'teams.json');

// ---------- 1. 读取 standings 表 ----------
const md = readFileSync(STANDINGS_MD, 'utf8');
const rows = [];
for (const line of md.split('\n')) {
  // 匹配表格行：| rank | points | name | roster | details |
  const m = line.match(/^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\[details\]\(([^)]+)\)/);
  if (m) rows.push({ rank: +m[1], points: +m[2], name: m[3], roster: m[4], detailPath: m[5] });
}
if (rows.length === 0) {
  console.error('[gen-teams] 未能从 standings 表解析出任何战队行，请检查 markdown 格式');
  process.exit(1);
}

// ---------- 2. 读取队标文件 ----------
const files = readdirSync(PROFILE_DIR).filter((f) => !f.startsWith('.'));
const logoSet = new Set(files);
const extOf = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  return ext === 'svg' ? 'svg' : ext === 'webp' ? 'webp' : 'png' ? 'png' : ext || 'unknown';
};

// ---------- 3. 队名归一化 -> 队标文件名 ----------
// 队标文件名采用 HLTV 风格：全小写、空格/点/撇号等 -> 无分隔，去掉符号
function logoKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // 去掉所有非字母数字字符
}

// 已知特例映射（文件名 与 表内名 无法通过规则对齐的）
// 键 = 表内队名（原样），值 = teams_profile 目录中的文件名
const SPECIAL_LOGO_MAP = {
  'Natus Vincere': 'NAVI.svg',
  'Ninjas in Pyjamas': null, // 无队标，用 fallback
  '100 Thieves': '100Thieves.webp',
  'The MongolZ': 'TheMongolZ.webp',
  'Lynn Vision': 'Lynn Vision.webp',
  'G2 Ares': null,
  'MOUZ NXT': null,
};

function findLogoFile(teamName) {
  // 1) 特例映射
  if (Object.prototype.hasOwnProperty.call(SPECIAL_LOGO_MAP, teamName)) {
    const f = SPECIAL_LOGO_MAP[teamName];
    if (f && logoSet.has(f)) return f;
    return null;
  }
  // 2) 规则匹配：去扩展名后归一化比较
  const key = logoKey(teamName);
  for (const f of files) {
    if (f === 'Unknown_PlayerProfile.svg') continue;
    const stem = f.slice(0, f.lastIndexOf('.'));
    if (logoKey(stem) === key) return f;
  }
  return null;
}

// ---------- 4. 组装 ----------
// 按队名分组（同一队名可能有多条记录，如换阵后的重复队名）
const byName = new Map();
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}

const teams = [];
for (const [name, recs] of byName) {
  const best = recs.reduce((a, b) => (a.points >= b.points ? a : b));
  const logoFile = findLogoFile(name);
  const firstChar = [...name.trim()][0] || '?';
  const letter = /[a-zA-Z0-9]/.test(firstChar) ? firstChar.toUpperCase() : '?';
  teams.push({
    id: logoKey(name) || name.toLowerCase(),
    name,
    letter, // fallback 队标中的首字母（接口端替换 Unknown_PlayerProfile.svg 里的 <text>A</text>）
    logo: logoFile ? `teams_profile/${logoFile}` : 'teams_profile/Unknown_PlayerProfile.svg',
    hasLogo: !!logoFile,
    ext: logoFile ? extOf(logoFile) : 'svg',
    standings: {
      bestRank: Math.min(...recs.map((r) => r.rank)),
      bestPoints: best.points,
      entries: recs.length,
      records: recs
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({ rank: r.rank, points: r.points, roster: r.roster, detailPath: r.detailPath })),
    },
  });
}

// 额外补充：队标目录中存在、但不在当前 standings 表中的战队（防止遗漏）
const EXTRA_TEAMS = [
  { name: 'Luminosity', letter: 'L' },
];
for (const extra of EXTRA_TEAMS) {
  if (byName.has(extra.name)) continue;
  const logoFile = findLogoFile(extra.name);
  teams.push({
    id: logoKey(extra.name),
    name: extra.name,
    letter: extra.letter,
    logo: logoFile ? `teams_profile/${logoFile}` : 'teams_profile/Unknown_PlayerProfile.svg',
    hasLogo: !!logoFile,
    ext: logoFile ? extOf(logoFile) : 'svg',
    standings: null, // 不在当前 standings 表中
  });
}

// 排序：有队标的在前，无队标的在后；组内按 bestRank 升序（无 standings 的排最后）
teams.sort((a, b) => {
  if (a.hasLogo !== b.hasLogo) return a.hasLogo ? -1 : 1;
  const ra = a.standings?.bestRank ?? Infinity;
  const rb = b.standings?.bestRank ?? Infinity;
  return ra - rb;
});

const payload = {
  generatedFrom: 'standings_global_2026_07_06.md',
  generatedAt: new Date().toISOString(),
  count: teams.length,
  fallbackLogo: 'teams_profile/Unknown_PlayerProfile.svg',
  teams,
};

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');

// ---------- 5. 报告 ----------
const withLogo = teams.filter((t) => t.hasLogo);
const noLogo = teams.filter((t) => !t.hasLogo);
console.log(`[gen-teams] 战队总数: ${teams.length}`);
console.log(`[gen-teams] 有队标: ${withLogo.length} | 无队标(将用 fallback): ${noLogo.length}`);
console.log(`[gen-teams] 输出: ${relative(ROOT, OUT_JSON)}`);
console.log('\n--- 有队标的映射（用于人工核对） ---');
for (const t of withLogo) console.log(`  ${t.name.padEnd(22)} -> ${t.logo}`);
console.log('\n--- 无队标（fallback，记录首字母） ---');
for (const t of noLogo) console.log(`  ${t.name.padEnd(22)} letter=${t.letter}`);
