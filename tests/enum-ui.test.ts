import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('属性渲染对超界和非法值使用 0..100 兜底而不抛错', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /Number\.isFinite\(raw\) \? Math\.max\(0, Math\.min\(100, raw\)\) : 0/);
  assert.doesNotMatch(source, /throw new Error\(`选手属性数据无效/);
});

test('统一枚举中文映射完整且 UI 不直接渲染关键英文枚举', async () => {
  const payload = JSON.parse(await readFile(new URL('assets/career/enum-ui.json', root), 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  for (const [group, keys] of Object.entries({
    modes: ['HARDCORE', 'POWER_FANTASY'],
    regions: ['ASIA', 'EUROPE', 'AMERICAS', 'OCEANIA', 'MIDDLE_EAST', 'AFRICA'],
    playerRoles: ['ENTRY_FRAGGER', 'AWPER', 'IGL', 'SUPPORT', 'LURKER'],
    tiers: ['MAJOR', 'T1', 'T2', 'T3', 'QUALIFIER'],
    honors: ['MVP', 'EVP', 'VP'],
    releaseReasons: ['CONTRACT_EXPIRED', 'FORCED_RELEASE', 'TEAM_REBUILD', 'NO_ROSTER_SPACE', 'MUTUAL_TERMINATION'],
  })) for (const key of keys) assert.ok(payload[group][key], `${group}.${key}`);
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /enumCopy\.modes\[profile\.difficultyMode\]/);
  assert.match(source, /enumCopy\.playerRoles\[profile\.role\]/);
  assert.match(source, /enumCopy\.releaseReasons\[profile\.releaseReason\]/);
  assert.match(source, /enumCopy\.placements\[result\.placement\]/);
  assert.match(source, /enumCopy\.honors\[honor\]/);
});

test('市场隐藏不可达机会并接入空状态文案', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(source, /offers\.filter\(\(offer\) => offer\.eligible && offer\.availability !== 'UNREACHABLE'\)/);
  assert.match(source, /marketCopy\.emptyLabel/);
});
