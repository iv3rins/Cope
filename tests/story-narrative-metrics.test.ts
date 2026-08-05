import assert from 'node:assert/strict';
import test from 'node:test';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import { StoryEngineImpl } from '../src/engine/impl/story-engine';
import { StoryRepositoryImpl, type StoryEventPackReader } from '../src/engine/impl/story-repository';
import type { StoryEvent } from '../src/engine/graph';
import type { PlayerProfile } from '../src/engine/profile';

const profile: PlayerProfile = {
  id: 'metrics-player', gameId: 'Metrics', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 18, currentTeamId: null, currentContractId: null, role: 'ENTRY_FRAGGER',
  attributes: { aim: 60, gameSense: 55, leadership: 40, clutch: 50, consistency: 52, teamConflict: 20 },
  life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 10 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 70, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
};

const event: StoryEvent = {
  id: 'metric-event', title: 'metric', description: 'metric', worldlineId: 'rookie', type: 'CHOICE', period: 'NORMAL', conditions: [], autoEffects: [],
  options: [{ id: 'go', label: 'go', requirements: [], outcome: { successEffects: [
    { type: 'NARRATIVE_METRIC_CHANGE', metric: 'FAME', delta: 80 },
    { type: 'NARRATIVE_METRIC_CHANGE', metric: 'TEAM_STATUS', delta: -80 },
    { type: 'NARRATIVE_METRIC_CHANGE', metric: 'MENTALITY', delta: 50 },
    { type: 'NARRATIVE_METRIC_CHANGE', metric: 'BALANCE', delta: 100 },
  ], failureEffects: [] } }],
};

const reader = (events: readonly StoryEvent[]): StoryEventPackReader => ({ readEvents: async () => events, readWorldlines: async () => [] });
const context = { player: profile, currentTeamId: null, opponentTeamId: null, randomRoll: 0, difficultyMode: 'HARDCORE' as const, currentDate: '2026-01-01T00:00:00.000Z' };

test('旧档剧情指标按中性值求值，MENTALITY/BALANCE 映射既有字段', () => {
  const evaluator = new ConditionEvaluatorImpl();
  assert.equal(evaluator.matches({ type: 'NARRATIVE_METRIC', metric: 'FAME', minimum: 50, maximum: 50 }, context), true);
  assert.equal(evaluator.matches({ type: 'NARRATIVE_METRIC', metric: 'MENTALITY', minimum: 60 }, context), true);
  assert.equal(evaluator.matches({ type: 'NARRATIVE_METRIC', metric: 'BALANCE', minimum: 500 }, context), true);
});

test('TRANSFER_OFFER 仅在相对生涯时间未过期时匹配', () => {
  const evaluator = new ConditionEvaluatorImpl();
  const offer = { offerId: 'offer', teamId: 't2', teamName: 'T2', tier: 'T2' as const, salaryPerMonth: 1, buyoutAmount: 0, roleOffer: 'STARTER' as const, source: 'CONFIGURED_TARGET' as const, createdAt: '2026-01-01', expiresAt: '2026-01-10' };
  assert.equal(evaluator.matches({ type: 'TRANSFER_OFFER', expected: true }, { ...context, currentDate: '2026-01-05', pendingTransferOffer: offer }), true);
  assert.equal(evaluator.matches({ type: 'TRANSFER_OFFER', expected: true }, { ...context, currentDate: '2026-01-10', pendingTransferOffer: offer }), false);
  assert.equal(evaluator.matches({ type: 'TRANSFER_OFFER', expected: true }, { ...context, currentDate: 'invalid', pendingTransferOffer: offer }), false);
});


test('NARRATIVE_METRIC_CHANGE 生效、0..100 clamp 且不重复资金和心态状态', async () => {
  const repository = new StoryRepositoryImpl(reader([event]));
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  const result = await engine.decide({ profile, decision: { eventId: event.id, optionId: 'go', randomRoll: 0 } });
  assert.equal(result.profile.narrativeMetrics?.FAME, 100);
  assert.equal(result.profile.narrativeMetrics?.TEAM_STATUS, 0);
  assert.equal(result.profile.narrativeMetrics?.FORM, 50);
  assert.equal(result.profile.morale, 100);
  assert.equal(result.profile.life.balance, 600);
  assert.equal('MENTALITY' in (result.profile.narrativeMetrics ?? {}), false);
  assert.equal('BALANCE' in (result.profile.narrativeMetrics ?? {}), false);
});

test('StoryRepository 拒绝深层非法 PLAYER_STAT_CHANGE:TEAM_CONFLICT', async () => {
  const malformed = structuredClone(event) as unknown as { options: Array<{ outcome: { successEffects: unknown[] } }> };
  malformed.options[0]!.outcome.successEffects = [{ type: 'PLAYER_STAT_CHANGE', stat: 'TEAM_CONFLICT', delta: 10 }];
  const repository = new StoryRepositoryImpl(reader([malformed as unknown as StoryEvent]));
  assert.equal(await repository.findEvent(event.id), null);
  assert.deepEqual(await repository.listEvents(), []);
});
