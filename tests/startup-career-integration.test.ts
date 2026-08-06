import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { InMemoryStateRepository } from '../src/engine/impl/in-memory-state-repository';
import type { BalanceConfig } from '../src/hltv/balance-config';

const root = process.cwd();
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
let balanceOverride: BalanceConfig | null = null;
let simulationRulesOverride: unknown | null = null;

(globalThis as unknown as { window: Record<string, unknown> }).window = {};
globalThis.fetch = (async (input: string | URL | Request) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const assetPath = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
  try {
    const content = await readFile(join(root, assetPath), 'utf8');
    const payload = assetPath === 'assets/balance/performance.json' && balanceOverride
      ? balanceOverride
      : assetPath === 'assets/top20/simulation-rules.json' && simulationRulesOverride
        ? simulationRulesOverride
        : JSON.parse(content) as unknown;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;

after(() => {
  balanceOverride = null;
  simulationRulesOverride = null;
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
  else (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
});

const { initCareerGame, rollStoryline, rollTalentTier } = await import('../src/browser-entry');
const repository = InMemoryStateRepository.getInstance();
const baseBalance = JSON.parse(await readFile(join(root, 'assets/balance/performance.json'), 'utf8')) as BalanceConfig;
const manifest = JSON.parse(await readFile(join(root, 'assets/story/manifest.json'), 'utf8')) as { worldlines: string[] };
const worldlines = await Promise.all(manifest.worldlines.map(async (file) => JSON.parse(
  await readFile(join(root, 'assets/story/worldlines', file), 'utf8'),
) as { id: string; startEventId: string }));
const worldlineById = new Map(worldlines.map((worldline) => [worldline.id, worldline]));
const positiveAttributes = ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'] as const;
let slotSequence = 0;
const slot = (label: string) => `startup-career-integration-${label}-${++slotSequence}`;

function worldlineForSeed(seed: string, balance: BalanceConfig = baseBalance): string {
  const talent = rollTalentTier(seed, balance.talent);
  const band = talent === 'GENIUS' ? balance.talent.genius : balance.talent.ordinary;
  return rollStoryline(seed, band.storylines);
}

function seedsCoveringEveryWorldline(): Map<string, string> {
  const found = new Map<string, string>();
  for (let index = 0; index < 100_000 && found.size < worldlines.length; index += 1) {
    const seed = `worldline-search-${index}`;
    const id = worldlineForSeed(seed);
    if (worldlineById.has(id) && !found.has(id)) found.set(id, seed);
  }
  assert.equal(found.size, worldlines.length, `未能覆盖全部故事线，实际命中：${[...found.keys()].join(', ')}`);
  return found;
}

async function removeSlots(slotIds: readonly string[]): Promise<void> {
  await Promise.all(slotIds.map((slotId) => repository.delete(slotId)));
}

test('两级天赋池可命中全部六条 worldline，并连接各自的 SEASON_START 起始事件', async () => {
  const seeds = seedsCoveringEveryWorldline();
  const slotIds: string[] = [];
  try {
    for (const worldline of worldlines) {
      const gameId = slot(`worldline-${worldline.id}`);
      slotIds.push(gameId);
      const game = await initCareerGame({
        gameId,
        randomSeed: seeds.get(worldline.id)!,
        realName: worldline.id,
        role: 'AWP',
        region: 'EUROPE',
        mode: 'HARDCORE',
      });
      const profile = await game.getProfile();
      const envelope = await repository.load(gameId);
      assert.ok(envelope);
      assert.equal(profile.worldlineId, worldline.id);
      assert.equal(envelope.state.currentStoryEventId, worldline.startEventId);
      const event = await game.findCareerEvent('SEASON_START');
      assert.ok(event, `${worldline.id} 应在 SEASON_START 返回起始事件`);
      assert.equal(event.id, worldline.startEventId);
      assert.equal(event.worldlineId, worldline.id);
    }
  } finally {
    await removeSlots(slotIds);
  }
});

test('POWER_FANTASY 新档保证五项正面属性中至少一项达到 100', async () => {
  const gameId = slot('power-fantasy');
  try {
    const game = await initCareerGame({ gameId, realName: 'power', role: 'SUPPORT', region: 'ASIA', mode: 'POWER_FANTASY' });
    const profile = await game.getProfile();
    assert.ok(positiveAttributes.some((attribute) => profile.attributes[attribute] === 100), JSON.stringify(profile.attributes));
  } finally {
    await repository.delete(gameId);
  }
});

test('POWER_FANTASY 可由 JSON 独立概率获得 T1/T2 起步合同', async () => {
  const gameId = slot('power-high-tier');
  balanceOverride = { ...baseBalance, talent: { ...baseBalance.talent, powerFantasyHighTierProbability: 1 } };
  try {
    const game = await initCareerGame({ gameId, realName: 'power-tier', role: 'AWP', region: 'EUROPE', mode: 'POWER_FANTASY' });
    const profile = await game.getProfile();
    assert.ok(profile.currentTeamTier === 'T1' || profile.currentTeamTier === 'T2');
  } finally {
    balanceOverride = null;
    await repository.delete(gameId);
  }
});

test('强制天才与满天赋概率后，新档直接取得 T1/T2 合同，T1 仅给替补或短约', async () => {
  const gameId = slot('forced-genius');
  balanceOverride = {
    ...baseBalance,
    prodigy: { ...baseBalance.prodigy, almostAllProbability: 1, partialProbability: 1 },
    talent: { ...baseBalance.talent, geniusProbability: 1 },
  };
  try {
    const game = await initCareerGame({ gameId, realName: 'genius', role: 'ENTRY', region: 'EUROPE', mode: 'HARDCORE' });
    const profile = await game.getProfile();
    const envelope = await repository.load(gameId);
    assert.ok(envelope);
    assert.ok(profile.currentTeamTier === 'T1' || profile.currentTeamTier === 'T2');
    const contract = envelope.state.contracts.find((candidate) => candidate.id === profile.currentContractId && candidate.status === 'ACTIVE');
    assert.ok(contract);
    if (profile.currentTeamTier === 'T1') {
      const months = (Date.parse(contract.endsAt) - Date.parse(contract.startedAt)) / (1000 * 60 * 60 * 24 * 31);
      assert.ok(contract.role === 'SUBSTITUTE' || months <= 6, `T1 合同必须是替补或不超过六个月的短约：${JSON.stringify(contract)}`);
    }
  } finally {
    balanceOverride = null;
    await repository.delete(gameId);
  }
});

test('TOP20 跨赛季按年龄淘汰老将并引入虚拟新秀，且同赛季结果确定', async () => {
  const gameId = slot('top20-ecosystem');
  try {
    await initCareerGame({ gameId, realName: 'top20', role: 'AWP', region: 'EUROPE', mode: 'HARDCORE' });
    const engine = (globalThis as unknown as { window: { COPEEngine: { findTop20(season: number): Promise<import('../src/hltv/top20').Top20Ranking> } } }).window.COPEEngine;
    const baseline = await engine.findTop20(2026);
    const future = await engine.findTop20(2040);
    const repeated = await engine.findTop20(2040);
    assert.ok(baseline.entries.some((entry) => entry.identity.playerId === 'real-zywoo'));
    assert.equal(future.entries.some((entry) => entry.identity.playerId === 'real-zywoo'), false, '39 岁真实老将应退出 2040 榜单');
    assert.ok(future.entries.some((entry) => entry.identity.source === 'VIRTUAL'), '未来榜单应出现虚拟新秀');
    assert.notDeepEqual(future.entries.map((entry) => entry.identity.playerId), baseline.entries.map((entry) => entry.identity.playerId));
    assert.deepEqual(repeated, future, '同一赛季投影必须确定且可重复');
  } finally {
    await repository.delete(gameId);
  }
});

test('TOP20 simulation-rules 损坏或数值越界时启动即暴露配置错误', async () => {
  const invalidRules = [
    { schemaVersion: 1, honorPool: null },
    { schemaVersion: 1, honorPool: { mvp: -1, evp: 1, vp: 1 }, evidenceProjection: {}, virtualGeneration: {}, realPlayerDecay: {} },
    {
      schemaVersion: 1,
      honorPool: { mvp: 1, evp: 1, vp: 1 },
      evidenceProjection: { ratingFloor: 0.55, adrBase: 70, adrRatingFactor: 15, kastBase: 65, kastRatingFactor: 15, playoffMapRatio: 1.1, top5MapRatio: 0.3, finalMapRatio: 0.1, minimumPlayoffMaps: 2.5, minimumTop5Maps: 3, minimumFinalMaps: 1 },
      virtualGeneration: { baseProbability: 0.5, prodigyProbability: 0.5, prodigyPotential: 0.9, risingPotential: 0.8, baselinePotential: 0.7, annualDebutWindow: 4 },
      realPlayerDecay: { peakThroughAge: 30, gradualDeclineEndAge: 27, gradualDeclinePerYear: 0.03, veteranBaseMultiplier: 0.9, veteranDeclinePerYear: 0.04, careerGraceYears: 4, careerDeclinePerYear: 0.01, careerDeclineCap: 0.1, minimumMultiplier: 0.5 },
    },
  ];
  for (const [index, invalidRule] of invalidRules.entries()) {
    const gameId = slot(`top20-invalid-rules-${index}`);
    simulationRulesOverride = invalidRule;
    try {
      await assert.rejects(() => initCareerGame({ gameId, realName: 'invalid', role: 'AWP', region: 'EUROPE', mode: 'HARDCORE' }), /TOP20 simulation rules are invalid/);
    } finally {
      simulationRulesOverride = null;
      await repository.delete(gameId);
    }
  }
});

test('loadGame 加载旧档时保留 worldlineId 与 currentStoryEventId，不按回退 seed 重抽', async () => {
  const target = worldlines[0]!;
  const targetSeed = seedsCoveringEveryWorldline().get(target.id)!;
  let gameId = slot('legacy');
  while (worldlineForSeed(gameId) === target.id) gameId = slot('legacy');
  try {
    await initCareerGame({ gameId, randomSeed: targetSeed, realName: 'legacy', role: 'IGL', region: 'AMERICAS', mode: 'HARDCORE' });
    const created = await repository.load(gameId);
    assert.ok(created);
    assert.equal(created.state.player.worldlineId, target.id);
    assert.equal(created.state.currentStoryEventId, target.startEventId);

    const { randomSeed: _removedForLegacySave, ...legacyState } = created.state;
    await repository.save(gameId, { ...created, state: legacyState });
    assert.notEqual(worldlineForSeed(gameId), target.id, '测试前提：旧档回退 slot seed 会抽到另一条故事线');

    const engine = (globalThis as unknown as { window: { COPEEngine: { loadGame(slotId: string): ReturnType<typeof initCareerGame> } } }).window.COPEEngine;
    const loaded = await engine.loadGame(gameId);
    const loadedProfile = await loaded.getProfile();
    const loadedEnvelope = await repository.load(gameId);
    assert.ok(loadedEnvelope);
    assert.equal(loadedProfile.worldlineId, target.id);
    assert.equal(loadedEnvelope.state.currentStoryEventId, target.startEventId);
  } finally {
    await repository.delete(gameId);
  }
});
