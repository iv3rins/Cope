import assert from 'node:assert/strict';
import test from 'node:test';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import { AssetEventTriggerRuleRepository, EventTriggerServiceImpl } from '../src/engine/impl/event-trigger-service';
import type { StoryEvent, StoryRepository } from '../src/engine/graph';
import type { PlayerProfile } from '../src/engine/profile';

function player(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'player-1', gameId: 'Tester', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'ASIA', age: 22, currentTeamId: 'team-1', currentContractId: 'contract-1', role: 'AWPER',
    attributes: { aim: 70, gameSense: 65, leadership: 50, clutch: 68, consistency: 58, teamConflict: 20 },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 20 },
    career: { totalKills: 0, rating2: 0.94, headshotPercentage: 50, mapsPlayed: 60, clutchWon: 3, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 40, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
    ...overrides,
  };
}

function story(id: string, worldlineId = 'rookie'): StoryEvent {
  return { id, title: id, description: id, worldlineId, type: 'MANDATORY', period: 'NORMAL', phase: 'POST_TOURNAMENT', conditions: [{ type: 'WORLDLINE', worldlineId }], options: [], autoEffects: [] };
}

function repository(events: readonly StoryEvent[]): StoryRepository {
  return {
    findEvent: async (eventId) => events.find((event) => event.id === eventId) ?? null,
    findWorldline: async () => null,
  };
}

const fact = { type: 'LOW_FINAL_RATING_STREAK' as const, playerId: 'player-1', tournamentIds: ['a', 'b', 'c'], ratings: [0.9, 0.92, 0.95], threshold: 1 };

test('loads valid rules, filters worldlines and sorts by priority', async () => {
  const stories = repository([story('low-warning'), story('grinder-warning', 'grinder')]);
  const rules = new AssetEventTriggerRuleRepository(async () => ({ schemaVersion: 1, rules: [
    { id: 'low', name: 'low', factType: 'LOW_FINAL_RATING_STREAK', conditions: [{ type: 'WORLDLINE', worldlineId: 'rookie' }, { type: 'RATING_STREAK', minimum: 3 }], eventId: 'low-warning', priority: 90, oncePerCareer: true },
    { id: 'wrong-worldline', name: 'wrong', factType: 'LOW_FINAL_RATING_STREAK', conditions: [], eventId: 'grinder-warning', priority: 100, oncePerCareer: true },
  ] }), stories);
  const service = new EventTriggerServiceImpl(rules, new ConditionEvaluatorImpl());
  const events = await service.evaluate({ player: player(), fact });
  assert.deepEqual(events.map((event) => event.eventId), ['low-warning']);
  assert.equal(events[0]?.forced, true);
});

test('missing and malformed assets degrade to no triggers', async () => {
  const stories = repository([]);
  const missing = new EventTriggerServiceImpl(new AssetEventTriggerRuleRepository(async () => null, stories), new ConditionEvaluatorImpl());
  assert.deepEqual(await missing.evaluate({ player: player(), fact }), []);
  const malformed = new EventTriggerServiceImpl(new AssetEventTriggerRuleRepository(async () => ({ schemaVersion: 99, rules: [] }), stories), new ConditionEvaluatorImpl());
  assert.deepEqual(await malformed.evaluate({ player: player(), fact }), []);
});

test('once-per-career rules are idempotent after marking', async () => {
  const event = story('low-warning');
  const rules = new AssetEventTriggerRuleRepository(async () => ({ schemaVersion: 1, rules: [
    { id: 'low', name: 'low', factType: 'LOW_FINAL_RATING_STREAK', conditions: [{ type: 'RATING_STREAK', minimum: 3 }], eventId: event.id, priority: 90, oncePerCareer: true },
  ] }), repository([event]));
  const service = new EventTriggerServiceImpl(rules, new ConditionEvaluatorImpl());
  const first = await service.evaluate({ player: player(), fact });
  assert.equal(first.length, 1);
  await service.markTriggered(first[0]!.triggerId, 'player-1');
  assert.deepEqual(await service.evaluate({ player: player(), fact }), []);
});

test('contract termination facts can map to a free-agency story', async () => {
  const freeAgentStory: StoryEvent = { ...story('free-agent-first-day'), conditions: [{ type: 'FREE_AGENCY', expected: true }] };
  const rules = new AssetEventTriggerRuleRepository(async () => ({ schemaVersion: 1, rules: [
    { id: 'terminated', name: 'terminated', factType: 'CONTRACT_TERMINATED', conditions: [{ type: 'FREE_AGENCY', expected: true }], eventId: freeAgentStory.id, priority: 100, oncePerCareer: false },
  ] }), repository([freeAgentStory]));
  const service = new EventTriggerServiceImpl(rules, new ConditionEvaluatorImpl());
  const freeAgent = player({ currentTeamId: null, currentContractId: null, freeAgencyStatus: 'FREE_AGENT' });
  const contract = { id: 'contract-1', playerId: freeAgent.id, teamId: 'team-1', startedAt: '2026-01-01', endsAt: '2026-02-01', salaryPerMonth: 500, status: 'TERMINATED' as const, buyoutAmount: 0 };
  const events = await service.evaluate({ player: freeAgent, fact: { type: 'CONTRACT_TERMINATED', playerId: freeAgent.id, contract } });
  assert.deepEqual(events.map((event) => event.eventId), ['free-agent-first-day']);
});

test('missing target stories and mismatched player facts are skipped', async () => {
  const rules = new AssetEventTriggerRuleRepository(async () => ({ schemaVersion: 1, rules: [
    { id: 'missing', name: 'missing', factType: 'LOW_FINAL_RATING_STREAK', conditions: [], eventId: 'missing-event', priority: 90, oncePerCareer: false },
  ] }), repository([]));
  const service = new EventTriggerServiceImpl(rules, new ConditionEvaluatorImpl());
  assert.deepEqual(await service.evaluate({ player: player(), fact }), []);
  assert.deepEqual(await service.evaluate({ player: player(), fact: { ...fact, playerId: 'other' } }), []);
});
