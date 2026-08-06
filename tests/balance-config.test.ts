import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { DEFAULT_BALANCE_CONFIG, validateBalanceConfig } from '../src/hltv/balance-config';
import { MatchSimulationServiceImpl } from '../src/hltv/match-simulation-service-impl';
import type { MatchPlayerSnapshot, MatchSimulationInput } from '../src/hltv/match';
import type { PlayerProfile } from '../src/engine/profile';

const root = process.cwd();
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
(globalThis as unknown as { window: Record<string, unknown> }).window = {};
const { applyProdigyEasterEgg } = await import('../src/browser-entry');
after(() => {
  if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
  else (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
});

function samplePlayer(overrides: Partial<MatchPlayerSnapshot> = {}): MatchPlayerSnapshot {
  return {
    playerId: 'p1', teamId: 'team-a', nickname: 'p1', role: 'AWPER',
    aim: 70, gameSense: 65, leadership: 50, clutch: 60, consistency: 62, teamConflict: 15,
    morale: 70, energy: 75, age: 21,
    ...overrides,
  };
}

function sampleInput(players: readonly MatchPlayerSnapshot[], randomRoll = 0.5): MatchSimulationInput {
  return {
    matchId: 'balance-test-match', tournamentId: 'balance-test', stage: 'GROUP', format: 'BO3',
    left: { teamId: 'team-a', playerIds: players.filter((p) => p.teamId === 'team-a').map((p) => p.playerId), isPlayerTeam: true },
    right: { teamId: 'team-b', playerIds: players.filter((p) => p.teamId === 'team-b').map((p) => p.playerId), isPlayerTeam: false },
    players,
    mapPool: ['Mirage', 'Inferno', 'Nuke'],
    pressure: 58,
    teamRanks: { 'team-a': 60, 'team-b': 20 },
    randomRoll,
  };
}

test('balance 配置 JSON 可加载并通过 schema 校验', async () => {
  const payload = JSON.parse(await readFile(join(root, 'assets/balance/performance.json'), 'utf8')) as unknown;
  const config = validateBalanceConfig(payload);
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.prodigy.partialProbability, 0.001);
  assert.equal(config.talent.geniusProbability, 0.5);
  assert.equal(config.talent.genius.storylines.length, 7, '天才池应含 7 条故事线');
  assert.equal(config.talent.ordinary.storylines.length, 5, '平凡池应含 5 条故事线');
  assert.equal(config.talent.maxedStartContracts.T1.role, 'SUBSTITUTE');
  assert.equal(config.talent.powerFantasyHighTierProbability, 0.25);
  assert.equal(config.narrative.maxEventsPerSeason, 2);
  assert.equal(config.narrative.minimumTournamentGap, 1);
  assert.ok(config.rating.hotStreak.ceiling >= 1.5, '爆种上限应允许 1.5+ 的单场表现');
  assert.ok(config.rating.aggregateCeiling < config.rating.hotStreak.ceiling, '全年聚合上限应低于单场爆种上限');
});

test('balance 配置校验拒绝非法载荷', () => {
  assert.throws(() => validateBalanceConfig({ schemaVersion: 1, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: DEFAULT_BALANCE_CONFIG.talent }), /schemaVersion/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: { ...DEFAULT_BALANCE_CONFIG.rating, base: 'x' }, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: DEFAULT_BALANCE_CONFIG.talent, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /rating\.base/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: { ...DEFAULT_BALANCE_CONFIG.prodigy, almostAllProbability: 0.9 }, talent: DEFAULT_BALANCE_CONFIG.talent, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /almostAllProbability/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: { ...DEFAULT_BALANCE_CONFIG.prodigy, partialAttributeCount: 1, almostAllAttributes: ['teamConflict'] }, talent: DEFAULT_BALANCE_CONFIG.talent, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /unknown attribute/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: { ...DEFAULT_BALANCE_CONFIG.talent, geniusProbability: 2 }, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /geniusProbability/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: { ...DEFAULT_BALANCE_CONFIG.talent, maxedStartContracts: { ...DEFAULT_BALANCE_CONFIG.talent.maxedStartContracts, T1: { ...DEFAULT_BALANCE_CONFIG.talent.maxedStartContracts.T1, lengthMonths: 0 } } }, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /maxedStartContracts\.T1/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: { ...DEFAULT_BALANCE_CONFIG.talent, powerFantasyHighTierProbability: 2 }, narrative: DEFAULT_BALANCE_CONFIG.narrative }), /powerFantasyHighTierProbability/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: DEFAULT_BALANCE_CONFIG.talent, narrative: { ...DEFAULT_BALANCE_CONFIG.narrative, maxEventsPerSeason: -1 } }), /maxEventsPerSeason/);
  assert.throws(() => validateBalanceConfig({ schemaVersion: 2, rating: DEFAULT_BALANCE_CONFIG.rating, prodigy: DEFAULT_BALANCE_CONFIG.prodigy, talent: DEFAULT_BALANCE_CONFIG.talent, narrative: { ...DEFAULT_BALANCE_CONFIG.narrative, minimumTournamentGap: 1.5 } }), /minimumTournamentGap/);
});

test('爆种时单场 rating 可达 1.5 量级（突破正常上界，聚合上限仍封顶）', async () => {
  const hotService = new MatchSimulationServiceImpl({
    ...DEFAULT_BALANCE_CONFIG.rating,
    hotStreak: { probability: 1, minimumBoost: 0.35, maximumBoost: 0.55, ceiling: 1.65 },
  });
  const players = [samplePlayer(), samplePlayer({ playerId: 'p2', teamId: 'team-b', nickname: 'p2' })];
  const hotRatings: number[] = [];
  const coolService = new MatchSimulationServiceImpl({
    ...DEFAULT_BALANCE_CONFIG.rating,
    hotStreak: { probability: 0, minimumBoost: 0.35, maximumBoost: 0.55, ceiling: 1.65 },
  });
  const coolMax = { value: 0 };
  for (let step = 1; step <= 24; step += 1) {
    const randomRoll = step / 25;
    const hotResult = await hotService.simulate(sampleInput(players, randomRoll));
    hotRatings.push(...hotResult.playerPerformances.map((performance) => performance.rating2_0));
    const coolResult = await coolService.simulate(sampleInput(players, randomRoll));
    for (const performance of coolResult.playerPerformances) coolMax.value = Math.max(coolMax.value, performance.rating2_0);
  }
  const peak = Math.max(...hotRatings);
  assert.ok(peak >= 1.5, `爆种应可达 1.5+，实际峰值 ${peak.toFixed(3)}`);
  assert.ok(hotRatings.every((rating) => rating <= 1.65), '爆种不应超过配置 ceiling 1.65');
  assert.ok(peak > coolMax.value, `爆种峰值应突破正常上界（${coolMax.value.toFixed(3)}）`);
});

test('无爆种时单场 rating 保持在正常上界内（≈1.32 全年语义）', async () => {
  const service = new MatchSimulationServiceImpl({
    ...DEFAULT_BALANCE_CONFIG.rating,
    hotStreak: { probability: 0, minimumBoost: 0.35, maximumBoost: 0.55, ceiling: 1.65 },
  });
  const players = [samplePlayer(), samplePlayer({ playerId: 'p2', teamId: 'team-b', nickname: 'p2' })];
  const result = await service.simulate(sampleInput(players));
  for (const performance of result.playerPerformances) {
    assert.ok(performance.rating2_0 <= 1.32, `非爆种场次不应超过 1.32，实际 ${performance.rating2_0}`);
  }
});

function sampleProfile(): PlayerProfile {
  return {
    id: 'egg-test' as PlayerProfile['id'], gameId: 'egg-test', nationality: 'Test', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'EUROPE', age: 16, currentTeamId: null, currentContractId: null, role: 'ENTRY_FRAGGER',
    attributes: { aim: 68, gameSense: 54, leadership: 42, clutch: 55, consistency: 52, teamConflict: 24 },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

test('彩蛋：0.05% 档点满几乎所有正面属性', () => {
  const profile = applyProdigyEasterEgg(sampleProfile(), 0.0003, DEFAULT_BALANCE_CONFIG.prodigy);
  for (const key of ['aim', 'gameSense', 'leadership', 'clutch', 'consistency']) {
    assert.equal(profile.attributes[key as keyof PlayerProfile['attributes']], 100, `${key} 应被点满`);
  }
  assert.equal(profile.attributes.teamConflict, 24, 'teamConflict 为负面属性，不应被点满');
});

test('彩蛋：0.1% 档点满一部分天赋（恰好配置数量）', () => {
  const profile = applyProdigyEasterEgg(sampleProfile(), 0.0007, DEFAULT_BALANCE_CONFIG.prodigy);
  const maxed = (['aim', 'gameSense', 'leadership', 'clutch', 'consistency'] as const).filter((key) => profile.attributes[key] === 100);
  assert.equal(maxed.length, DEFAULT_BALANCE_CONFIG.prodigy.partialAttributeCount, `应恰好点满 ${DEFAULT_BALANCE_CONFIG.prodigy.partialAttributeCount} 项`);
});

test('彩蛋：未命中时属性保持不变且结果确定性稳定', () => {
  const profile = sampleProfile();
  const untouched = applyProdigyEasterEgg(profile, 0.5, DEFAULT_BALANCE_CONFIG.prodigy);
  assert.deepEqual(untouched, profile);
  const first = applyProdigyEasterEgg(profile, 0.0007, DEFAULT_BALANCE_CONFIG.prodigy);
  const second = applyProdigyEasterEgg(profile, 0.0007, DEFAULT_BALANCE_CONFIG.prodigy);
  assert.deepEqual(first, second);
});
