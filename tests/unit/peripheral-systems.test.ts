import { describe, expect, it } from 'vitest';
import { DailyActionServiceImpl } from '../../src/engine/impl/daily-action-service';
import { CareerGameImpl } from '../../src/engine/impl/career-game';
import { InMemoryStateRepository } from '../../src/engine/impl/in-memory-state-repository';
import { PlayerProgressionServiceImpl } from '../../src/engine/impl/player-progression-service';
import { RetirementServiceImpl } from '../../src/engine/impl/retirement-service';
import { RetirementSummaryServiceImpl } from '../../src/engine/impl/retirement-summary-service';
import { TournamentServiceImpl } from '../../src/hltv/tournament-service-impl';
import type { DailyActionDefinition, DailyActionRepository } from '../../src/engine/daily-action';
import type { CareerGameDependencies } from '../../src/engine/game';
import type { PlayerProgressionRuleRepository, RegionOriginRule } from '../../src/engine/progression';
import type { PlayerProfile } from '../../src/engine/profile';
import type { CareerSaveEnvelope } from '../../src/engine/save-state';
import type { VrsInviteSnapshot } from '../../src/hltv/team';

const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 'peripheral-player', gameId: 'Peripheral', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false, tournamentArchive: [], originRegion: 'ASIA', age: 20, currentTeamId: 'academy-1', currentContractId: null, role: 'ENTRY_FRAGGER',
  attributes: { aim: 50, gameSense: 50, leadership: 50, clutch: 50, consistency: 50, teamConflict: 20 },
  life: { balance: 100, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 10 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: ['academy-1'] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 70, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1, ...overrides,
});

const actions: readonly DailyActionDefinition[] = [
  { id: 'faceit-grind', type: 'FACEIT_GRIND', name: 'Faceit', description: '', durationHours: 4, requirements: [{ stat: 'ENERGY', minimum: 20 }], allowedPeriods: ['NORMAL'] },
  { id: 'rest', type: 'REST', name: 'Rest', description: '', durationHours: 8, requirements: [], allowedPeriods: ['NORMAL'] },
];
const actionRepository: DailyActionRepository = { findById: async (id) => actions.find((action) => action.id === id) ?? null, listAvailable: async () => actions };
const originRule: RegionOriginRule = { region: 'ASIA', name: 'Asia', initialAttributeDeltas: [], agePhaseAttributeDeltas: { DEVELOPMENT: [{ attribute: 'AIM', delta: 1, source: 'REGION_BONUS' }] }, originFlags: [] };
const progressionRules: PlayerProgressionRuleRepository = { findAgeRule: async (phase) => ({ phase, minimumAge: 0, maximumAge: null, baseAttributeDeltas: phase === 'DEVELOPMENT' ? [{ attribute: 'AIM', delta: 2, source: 'AGE_BASE' }] : [] }), findOriginRule: async () => originRule };
const snapshot: VrsInviteSnapshot = { id: 'snapshot', season: 2026, half: 1, frozenAt: '2026-01-01T00:00:00.000Z', sourceRankingId: 'rankings', rulesVersion: 'v1', entries: [{ teamId: 'academy-1', rank: 16, points: 700, source: 'SIMULATION', observedAt: '2026-01-01T00:00:00.000Z', snapshotRank: 16 }] };

class Random { public next(): number { return 0.5; } }
class Clock { public now(): string { return '2030-01-01T00:00:00.000Z'; } }

describe('外围系统闭环', () => {
  it('日常行动返回新档案，并审计 Aim 与 Energy 变化', async () => {
    const result = await new DailyActionServiceImpl(actionRepository).execute({ player: profile(), actionId: 'faceit-grind', randomRoll: 0.9 });
    expect(result.completed).toBe(true);
    expect(result.player.attributes.aim).toBe(53);
    expect(result.player.energy).toBe(52);
    expect(result.appliedDeltas).toHaveLength(3);
  });

  it('年龄、赛事归档、退役和总结均通过 CareerGame 持久化', async () => {
    const repository = InMemoryStateRepository.getInstance();
    const player = profile();
    await repository.delete(player.id);
    const save: CareerSaveEnvelope = { format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 1, player, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null } };
    await repository.save(player.id, save);
    const progression = new PlayerProgressionServiceImpl(progressionRules);
    const dailyActions = new DailyActionServiceImpl(actionRepository);
    const tournaments = new TournamentServiceImpl({ playerId: player.id, random: new Random(), clock: new Clock() });
    const dependencies: CareerGameDependencies = { playerId: player.id, difficultyMode: 'HARDCORE', progression, dailyActions, stateRepository: repository, hltv: { freezeVrsSnapshot: async () => 'snapshot', applyTournamentIntervention: async () => { throw new Error('unused'); }, settleTournament: async () => {}, findTop20: async () => ({ season: 2026, rulesVersion: 'v1', entries: [], careerPlayerRank: null }), synchronizeCareerHonors: async (value) => value }, economy: { tick: async () => { throw new Error('unused'); }, isBankrupt: () => false }, triggers: { evaluate: async () => [], markTriggered: async () => {} }, retirement: new RetirementServiceImpl(), retirementSummary: new RetirementSummaryServiceImpl() };
    const game = new CareerGameImpl(dependencies, { progressionRules, dailyActions, tournaments, clock: new Clock(), random: new Random(), vrsSnapshot: async () => snapshot });

    const age = await game.advanceAge();
    expect(age.profile.age).toBe(21);
    expect((await game.getProfile()).attributes.aim).toBe(50);
    await game.advancePeriod({ period: 'FINAL_DECISIVE_MOMENT', randomRoll: 0.4 });
    expect((await game.getProfile()).tournamentArchive).toHaveLength(1);
    const retired = await game.retire('complete');
    expect(retired.isRetired).toBe(true);
    await expect(game.advancePeriod({ period: 'NORMAL', randomRoll: 0.4 })).rejects.toThrow('retired');
    const summary = await game.generateRetirementSummary();
    expect(summary.player.retiredAt).toBe('2030-01-01T00:00:00.000Z');
    expect(summary.careerOverview.totalMaps).toBeGreaterThan(0);
  });
});
