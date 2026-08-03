import { describe, expect, it } from 'vitest';
import { ConditionEvaluatorImpl } from '../../src/engine/impl/condition-evaluator';
import { PlayerProgressionServiceImpl } from '../../src/engine/impl/player-progression-service';
import { RetirementSummaryServiceImpl } from '../../src/engine/impl/retirement-summary-service';
import { StoryEngineImpl } from '../../src/engine/impl/story-engine';
import { TournamentServiceImpl } from '../../src/hltv/tournament-service-impl';
import { Top20RankingServiceImpl } from '../../src/hltv/top20-ranking-service-impl';
import type { ConditionContext, EventCondition } from '../../src/engine/condition';
import type { GameClock, RandomSource } from '../../src/engine/runtime';
import type { PlayerProgressionRuleRepository, RegionOriginRule } from '../../src/engine/progression';
import type { PlayerProfile } from '../../src/engine/profile';
import type { StoryEventDirectory } from '../../src/engine/impl/story-repository';
import type { StoryEvent, StorySuccessChancePolicy } from '../../src/engine/graph';
import type { TournamentEdition, TournamentIntervention } from '../../src/hltv/tournament';
import type { Top20Rules, Top20SeasonEvidence, Top20TournamentEvidence } from '../../src/hltv/top20';

class MockRandomSource implements RandomSource {
  private index = 0;
  public constructor(private readonly values: readonly number[]) {}
  public next(): number {
    const value = this.values[this.index % this.values.length];
    if (value === undefined) throw new Error('MockRandomSource requires at least one value.');
    this.index += 1;
    return value;
  }
}

class MockGameClock implements GameClock {
  public constructor(private readonly value = '2026-01-01T00:00:00.000Z') {}
  public now(): string { return this.value; }
}

const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 'player-1', gameId: 'PlayLikeS1mple', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 20, currentTeamId: 'team-1', currentContractId: null,
  role: 'ENTRY_FRAGGER',
  attributes: { aim: 50, gameSense: 50, leadership: 50, clutch: 50, consistency: 50, teamConflict: 20 },
  life: { balance: 100, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 10 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: ['team-1'] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 80, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  ...overrides,
});

const delta = (attribute: 'AIM' | 'GAME_SENSE', value: number, source: 'AGE_BASE' | 'REGION_BONUS' = 'AGE_BASE') => ({ attribute, delta: value, source });

const originRule: RegionOriginRule = {
  region: 'ASIA', name: 'Asia', initialAttributeDeltas: [delta('AIM', 5, 'REGION_BONUS')],
  agePhaseAttributeDeltas: {
    DEVELOPMENT: [delta('AIM', 2, 'REGION_BONUS')],
    PEAK: [],
    GRADUAL_DECLINE: [delta('AIM', -1, 'REGION_BONUS')],
    SHARP_DECLINE: [delta('AIM', -3, 'REGION_BONUS')],
  },
  originFlags: [{ id: 'ORIGIN_ASIA', name: 'Asia origin', category: 'CUSTOM' }],
};

const progressionRules: PlayerProgressionRuleRepository = {
  findAgeRule: async (phase) => ({
    phase, minimumAge: 0, maximumAge: null,
    baseAttributeDeltas: phase === 'DEVELOPMENT' ? [delta('AIM', 3)] : phase === 'GRADUAL_DECLINE' ? [delta('AIM', -2)] : phase === 'SHARP_DECLINE' ? [delta('AIM', -5)] : [],
  }),
  findOriginRule: async () => originRule,
};

const modeRule = {
  mode: 'HARDCORE' as const, initialBalanceBonus: 25, initialMoraleBonus: 5, initialEnergyBonus: -5,
  storySuccessChanceBonus: 0, suppressExtremeNegativeMandatoryEvents: false,
};

describe('PlayerProgressionServiceImpl', () => {
  it('creates an immutable profile with mode resources, origin deltas and flags', async () => {
    const service = new PlayerProgressionServiceImpl(progressionRules);
    const before = profile();
    const result = await service.createProfile({ profile: before, difficultyMode: 'HARDCORE', originRule, modeRule });

    expect(result).not.toBe(before);
    expect(result.attributes.aim).toBe(55);
    expect(result.life.balance).toBe(125);
    expect(result.morale).toBe(65);
    expect(result.energy).toBe(75);
    expect(result.flags.map((flag) => flag.id)).toEqual(['ORIGIN_ASIA']);
    expect(before.attributes.aim).toBe(50);
  });

  it('applies development, peak and decline rules over multiple age years', async () => {
    const service = new PlayerProgressionServiceImpl(progressionRules);
    const result = await service.advanceAge({ profile: profile({ age: 20 }), originRule, years: 11 });

    expect(result.previousAge).toBe(20);
    expect(result.currentAge).toBe(31);
    expect(result.phase).toBe('SHARP_DECLINE');
    expect(result.profile.attributes.aim).toBe(22);
    expect(result.appliedDeltas).toHaveLength(12);
    expect(result.profile).not.toBe(profile());
  });
});

describe('ConditionEvaluatorImpl', () => {
  const evaluator = new ConditionEvaluatorImpl();
  const context = (roll: number): ConditionContext => ({ player: profile({ attributes: { ...profile().attributes, aim: 80 } }), currentTeamId: 'team-1', opponentTeamId: 'team-2', randomRoll: roll, difficultyMode: 'HARDCORE' });

  it.each([
    [{ type: 'ATTRIBUTE', attribute: 'AIM', minimum: 75 }, 0.5, true],
    [{ type: 'ATTRIBUTE', attribute: 'AIM', maximum: 79 }, 0.5, false],
    [{ type: 'RANDOM', chance: 0.5 }, 0.49, true],
    [{ type: 'RANDOM', chance: 0.5 }, 0.5, false],
  ])('evaluates basic conditions', (condition, roll, expected) => {
    expect(evaluator.matches(condition as EventCondition, context(roll))).toBe(expected);
  });

  it('evaluates nested ALL and ANY conditions', () => {
    const all: EventCondition = { type: 'ALL', conditions: [{ type: 'ATTRIBUTE', attribute: 'AIM', minimum: 75 }, { type: 'TEAM', teamId: 'team-1' }] };
    const any: EventCondition = { type: 'ANY', conditions: [{ type: 'ATTRIBUTE', attribute: 'AIM', maximum: 10 }, { type: 'RANDOM', chance: 0.8 }] };
    expect(evaluator.matches(all, context(0.2))).toBe(true);
    expect(evaluator.matches(any, context(0.2))).toBe(true);
    expect(evaluator.matches({ type: 'ALL', negate: true, conditions: [all] }, context(0.2))).toBe(false);
  });
});

describe('StoryEngineImpl', () => {
  const event: StoryEvent = {
    id: 'first-trial', title: 'First trial', description: 'A test', worldlineId: 'rookie', type: 'CHOICE', period: 'NORMAL', conditions: [], autoEffects: [],
    options: [{ id: 'train', label: 'Train', requirements: [], successChance: { baseChance: 0.5, modifiers: [] }, outcome: {
      successEffects: [{ type: 'ATTRIBUTE_CHANGE', attribute: 'AIM', delta: 10 }], failureEffects: [{ type: 'ATTRIBUTE_CHANGE', attribute: 'AIM', delta: -10 }], successNextEventId: 'next-event', failureNextEventId: 'failure-event',
    } }],
  };
  const repository: StoryEventDirectory = { findEvent: async (id) => id === event.id ? event : null, findWorldline: async () => null, listEvents: async () => [event] };
  const policy: StorySuccessChancePolicy = { adjust: ({ baseChance }) => baseChance };
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: policy });

  it('applies success and returns a new profile with next event', async () => {
    const before = profile();
    const result = await engine.decide({ profile: before, decision: { eventId: 'first-trial', optionId: 'train', randomRoll: 0.2 } });
    expect(result.succeeded).toBe(true);
    expect(result.profile.attributes.aim).toBe(60);
    expect(result.nextEventId).toBe('next-event');
    expect(result.profile).not.toBe(before);
    expect(before.attributes.aim).toBe(50);
  });

  it('applies failure at the boundary roll', async () => {
    const result = await engine.decide({ profile: profile(), decision: { eventId: 'first-trial', optionId: 'train', randomRoll: 0.5 } });
    expect(result.succeeded).toBe(false);
    expect(result.profile.attributes.aim).toBe(40);
    expect(result.nextEventId).toBe('failure-event');
  });
});

const edition: TournamentEdition = {
  id: 'event-1', seriesId: 'series-1', name: 'Demo Major', season: 2026, half: 1, calendarOrder: 1, tier: 'MAJOR', honorClass: 'MAJOR', node: 'MAIN_EVENT', teamId: 'team-1', qualificationSource: 'DIRECT_VRS', vrsSnapshotId: null, snapshotRank: 1, rosterLockCareerHalf: 1, targetEditionId: null,
};

describe('TournamentServiceImpl', () => {
  it('is stable with fixed RNG and consumes strength interventions', async () => {
    const run = async () => new TournamentServiceImpl({ playerId: 'player-1', random: new MockRandomSource([0.5]), clock: new MockGameClock() }).simulate({ edition, context: {
      editionId: 'event-1', baseTeamStrength: 80, baseOpponentStrength: { 'team-2': 100 }, upsetRoll: 0.99,
      interventions: [{ id: 'boost', editionId: 'event-1', sourceStoryEventId: 'story', sourceOptionId: 'option', type: 'TEAM_STRENGTH', delta: 25, occurredAt: '2026-01-01T00:00:00.000Z', description: 'boost' } as TournamentIntervention],
    } });
    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
    expect(first.consumedInterventions[0]?.id).toBe('boost');
    expect(first.placement).toBe('CHAMPION');
    expect(first.playerPerformances[0]?.rating).toBeCloseTo(0.9319, 3);
  });

  it('keeps the stronger opponent winning when there is no sufficient intervention', async () => {
    const result = await new TournamentServiceImpl({ playerId: 'player-1', random: new MockRandomSource([0.5]), clock: new MockGameClock() }).simulate({ edition, context: {
      editionId: 'event-1', baseTeamStrength: 80, baseOpponentStrength: { 'team-2': 100 }, upsetRoll: 0.99, interventions: [],
    } });

    expect(result.placement).toBe('RUNNER_UP');
    expect(result.title).toBe(false);
  });
});

const rules: Top20Rules = { version: 'test-1', minimumT1MajorMaps: 3, honorBaseScore: { MVP: 10, EVP: 5, VP: 2 }, honorClassMultiplier: { NONE: 0, MEDIUM: 1, LARGE: 1.2, ELITE: 1.5, SUPER_ELITE: 2, MAJOR: 3 } };
const evidence = (playerId: string, rating: number, careerPlayer = false): Top20SeasonEvidence => ({ season: 2026, player: { playerId, nickname: playerId, countryCode: 'CN', teamName: 'Team', careerPlayer }, tournaments: [
  { eventId: `${playerId}-1`, eventName: 'T1', tier: 'T1', maps: 3, rating, adr: 70, playoffMaps: 2, playoffRating: rating, top5Maps: 1, top5Rating: rating, finalMaps: 1, finalRating: rating, title: false, honors: [], majorPlayoffChoke: false },
] });

describe('Top20RankingServiceImpl', () => {
  it('sorts APS descending and applies deterministic player-id tie-breaks', async () => {
    const ranking = await new Top20RankingServiceImpl().calculate({ season: 2026, rules, evidence: [evidence('zeta', 1), evidence('alpha', 1), evidence('top', 1.2, true)] });
    expect(ranking.entries.map((entry) => entry.identity.playerId)).toEqual(['top', 'alpha', 'zeta']);
    expect(ranking.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(ranking.careerPlayerRank).toBe(1);
  });
});

describe('RetirementSummaryServiceImpl', () => {
  it('rejects active players and aggregates trophy and MVP rooms', async () => {
    const service = new RetirementSummaryServiceImpl();
    await expect(service.generate({ player: profile() })).rejects.toThrow('retired');
    const retired = profile({ isRetired: true, retiredAt: '2030-01-01T00:00:00.000Z', tournamentArchive: [
      { editionId: 'major', year: 2028, fullName: 'Major', organizerId: 'PGL_T1', level: 'MAJOR', placement: 'CHAMPION', rating: 1.3, mapsPlayed: 10, champion: true, mvp: 'MAJOR', trophyAssetId: 'PGL_T1' },
      { editionId: 't1', year: 2027, fullName: 'T1', organizerId: 'BLAST', level: 'T1', placement: 'CHAMPION', rating: 1.2, mapsPlayed: 8, champion: true, mvp: 'NORMAL', trophyAssetId: 'BLAST' },
      { editionId: 't2', year: 2026, fullName: 'T2', organizerId: 'OTHER', level: 'T2', placement: 'CHAMPION', rating: 1, mapsPlayed: 5, champion: true, mvp: null, trophyAssetId: null },
    ] });
    const summary = await service.generate({ player: retired });
    expect(summary.trophyRoom.map((entry) => entry.editionId)).toEqual(['t1', 'major']);
    expect(summary.mvpRoom.map((entry) => entry.badgeAssetId)).toEqual(['sliver_mvp', 'golden_mvp']);
    expect(summary.mvpTotals).toEqual({ major: 1, normal: 1 });
  });
});
