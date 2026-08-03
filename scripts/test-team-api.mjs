// team-api 接口回归测试（node --experimental-strip-types scripts/test-team-api.mjs）
import assert from 'node:assert/strict';
import {
  getTeamLogo,
  getTeamRanking,
  listTeamsByTier,
  listAllTeams,
  resolveTeam,
  getFallbackSvgTemplate,
  renderFallbackSvg,
} from '../src/api/team-api.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, '\n    ', err.message);
    process.exitCode = 1;
  }
}

console.log('team-api tests:');

test('getTeamLogo - 有队标返回资源路径', () => {
  const r = getTeamLogo('Spirit');
  assert.equal(r.ok, true);
  assert.equal(r.value.logoPath, 'assets/teams/teams_profile/Spirit.webp');
  assert.equal(r.value.hasLogo, true);
  assert.equal(r.value.ext, 'webp');
});

test('getTeamLogo - 无队标返回 fallback + letter', () => {
  const r = getTeamLogo('FURIA');
  assert.equal(r.ok, true);
  assert.equal(r.value.logoPath, 'assets/teams/teams_profile/Unknown_PlayerProfile.svg');
  assert.equal(r.value.hasLogo, false);
  assert.equal(r.value.letter, 'F');
});

test('getTeamLogo - renderFallback=true 渲染出首字母 SVG', () => {
  const r = getTeamLogo('FURIA', true);
  assert.equal(r.ok, true);
  assert.ok(r.value.fallbackSvg.includes('>F</text>'));
  assert.ok(!r.value.fallbackSvg.includes('>A</text>'));
});

test('getTeamLogo - 支持展示名精确匹配（含空格）', () => {
  const r = getTeamLogo('Natus Vincere');
  assert.equal(r.ok, true);
  assert.equal(r.value.logoPath, 'assets/teams/teams_profile/NAVI.svg');
});

test('getTeamRanking - 返回名次/积分/分级/明细', () => {
  const r = getTeamRanking('Spirit');
  assert.equal(r.ok, true);
  assert.deepEqual(
    { rank: r.value.rank, points: r.value.points, tier: r.value.tier, entries: r.value.standingsEntries },
    { rank: 1, points: 1993, tier: 'T1', entries: 1 },
  );
  assert.equal(r.value.records[0].roster, 'donk, magixx, sh1ro, tN1R, zont1x');
});

test('分级边界: rank 9=T1 / 13=T2 / 30=T2 / 31=T3', () => {
  assert.equal(getTeamRanking('G2').value.tier, 'T1');
  assert.equal(getTeamRanking('The MongolZ').value.tier, 'T2');
  assert.equal(getTeamRanking('Wildcard').value.tier, 'T2');
  assert.equal(getTeamRanking('Sharks').value.tier, 'T3');
});

test('listTeamsByTier 数量与排序', () => {
  const t1 = listTeamsByTier('T1');
  const t2 = listTeamsByTier('T2');
  assert.equal(t1.length, 12);
  assert.equal(t2.length, 18);
  assert.equal(t1[0].displayName, 'Spirit');
  assert.equal(t1[t1.length - 1].rank, 12);
  // T2 最低名次 30
  assert.equal(t2[t2.length - 1].rank, 30);
});

test('查无战队返回结构化失败', () => {
  const r = getTeamRanking('不存在的战队');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'TEAM_NOT_FOUND');
});

test('standings 为 null 的战队（Luminosity）兜底为 T3', () => {
  const r = getTeamRanking('Luminosity');
  assert.equal(r.ok, true);
  assert.equal(r.value.rank, null);
  assert.equal(r.value.tier, 'T3');
});

test('renderFallbackSvg 直接替换模板字母', () => {
  const tmpl = getFallbackSvgTemplate();
  const svg = renderFallbackSvg({ id: 'x', name: 'X', letter: 'X', logo: '', hasLogo: false, ext: 'svg', standings: null }, tmpl);
  assert.ok(svg.includes('>X</text>'));
});

test('listAllTeams 总数 = 345', () => {
  assert.equal(listAllTeams().length, 345);
});

console.log(`\n${passed} tests passed`);
