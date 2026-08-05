import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BALANCE_CONFIG } from '../src/hltv/balance-config';

const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
(globalThis as unknown as { window: Record<string, unknown> }).window = {};
const { deriveDeterministicRoll, rollStoryline, rollTalentTier } = await import('../src/browser-entry');
if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
else (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;

test('开局基调与故事线分配由 seed 确定且 namespace 互不干扰', () => {
  const seed = 'startup-deterministic';
  assert.equal(rollTalentTier(seed, DEFAULT_BALANCE_CONFIG.talent), rollTalentTier(seed, DEFAULT_BALANCE_CONFIG.talent));
  const tier = rollTalentTier(seed, DEFAULT_BALANCE_CONFIG.talent);
  const pool = tier === 'GENIUS' ? DEFAULT_BALANCE_CONFIG.talent.genius.storylines : DEFAULT_BALANCE_CONFIG.talent.ordinary.storylines;
  assert.equal(rollStoryline(seed, pool), rollStoryline(seed, pool));
  assert.notEqual(deriveDeterministicRoll(seed, 'startup:talent-tier'), deriveDeterministicRoll(seed, 'startup:worldline'));
});

test('大量 seed 采样接近 50/50，池内加权分布保持均匀', () => {
  const samples = Array.from({ length: 10000 }, (_, index) => `startup-sample-${index}`);
  const genius = samples.filter((seed) => rollTalentTier(seed, DEFAULT_BALANCE_CONFIG.talent) === 'GENIUS');
  const ratio = genius.length / samples.length;
  assert.ok(ratio > 0.45 && ratio < 0.55, `genius ratio=${ratio}`);
  for (const [tier, band] of [['GENIUS', DEFAULT_BALANCE_CONFIG.talent.genius], ['ORDINARY', DEFAULT_BALANCE_CONFIG.talent.ordinary]] as const) {
    const matching = samples.filter((seed) => rollTalentTier(seed, DEFAULT_BALANCE_CONFIG.talent) === tier);
    const expected = 1 / band.storylines.length;
    for (const entry of band.storylines) {
      const share = matching.filter((seed) => rollStoryline(seed, band.storylines) === entry.id).length / matching.length;
      assert.ok(Math.abs(share - expected) < 0.1, `${tier}/${entry.id} share=${share}`);
    }
  }
});

test('每个 role 的天才基线正面属性均不低于平凡基线', () => {
  for (const role of ['ENTRY', 'AWP', 'IGL', 'SUPPORT', 'LURK'] as const) {
    for (const key of ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'] as const) {
      assert.ok(DEFAULT_BALANCE_CONFIG.talent.genius.attributes[role][key] >= DEFAULT_BALANCE_CONFIG.talent.ordinary.attributes[role][key], `${role}.${key}`);
    }
  }
});
