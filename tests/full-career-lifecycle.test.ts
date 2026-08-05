import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import { SaveContractService } from '../src/engine/impl/contract-service';
import { RetirementServiceImpl } from '../src/engine/impl/retirement-service';
import { RetirementSummaryServiceImpl } from '../src/engine/impl/retirement-summary-service';
import type { CareerGameDependencies } from '../src/engine/game';
import type { PlayerContract } from '../src/engine/contract';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';

class State implements CareerGameStateRepository {
  constructor(public value: CareerSaveEnvelope) {}
  async load() { return structuredClone(this.value); }
  async save(_slot: string, value: CareerSaveEnvelope) { this.value = structuredClone(value); }
  async listSlots() { return ['career']; }
  async delete() {}
}

const player: PlayerProfile = { id: 'career', gameId: 'Career', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false, tournamentArchive: [], originRegion: 'ASIA', age: 39, currentTeamId: 't1', currentTeamTier: 'T1', currentContractId: 'active', freeAgencyStatus: 'SIGNED', role: 'AWPER', attributes: { aim: 70, gameSense: 70, leadership: 55, clutch: 68, consistency: 65, teamConflict: 10 }, life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 }, career: { totalKills: 1000, rating2: 1.15, headshotPercentage: 50, mapsPlayed: 100, clutchWon: 10, careerEarnings: 10000, teamHistory: ['t3', 't2', 't1'] }, trophies: { majorChampionships: 1, otherSTierTitles: 1, mvpAwards: 1, evpAwards: 1, top20Records: [{ year: 2030, rank: 10 }] }, morale: 60, energy: 50, worldlineId: 'comeback', completedEventIds: [], flags: [], schemaVersion: 1 };
const contract: PlayerContract = { id: 'active', playerId: player.id, teamId: 't1', startedAt: '2047-01-01T00:00:00.000Z', endsAt: '2050-01-01T00:00:00.000Z', salaryPerMonth: 10000, buyoutAmount: 0, status: 'ACTIVE' };

test('年度推进可自然退役、终止合同并生成最终总结', async () => {
  const state = new State({ format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2047-12-31T00:00:00.000Z', currentDate: '2047-12-31T00:00:00.000Z', season: 2047, careerHalf: 2, seasonPhase: 'REPORT', player, contracts: [contract], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null } });
  const progression = { advanceAge: async ({ profile }: { profile: PlayerProfile }) => ({ profile: { ...profile, age: profile.age + 1 }, previousAge: profile.age, newAge: profile.age + 1, appliedDeltas: [], addedFlags: [], removedFlagIds: [] }) } as unknown as CareerGameDependencies['progression'];
  const deps = { playerId: player.id, difficultyMode: 'HARDCORE', stateRepository: state, progression, retirement: new RetirementServiceImpl(), retirementSummary: new RetirementSummaryServiceImpl(), hltv: {} as CareerGameDependencies['hltv'], dailyActions: {} as CareerGameDependencies['dailyActions'], economy: {} as CareerGameDependencies['economy'], triggers: { evaluate: async () => [], markTriggered: async () => {} } } satisfies CareerGameDependencies;
  const contracts = new SaveContractService([contract], new ConditionEvaluatorImpl(), (candidate) => ({ player: candidate, currentTeamId: candidate.currentTeamId, opponentTeamId: null, randomRoll: 0, difficultyMode: candidate.difficultyMode }), () => 'T1');
  const game = new CareerGameImpl(deps, { progressionRules: { findAgeRule: async () => null, findOriginRule: async () => ({ region: 'ASIA', name: 'Asia', initialAttributeDeltas: [], agePhaseAttributeDeltas: {}, originFlags: [] }) }, contractService: contracts, teamTier: () => 'T1' });
  const retired = await game.advancePeriod({ period: 'OFFSEASON', randomRoll: 0 });
  assert.equal(retired.age, 40);
  assert.equal(retired.isRetired, true);
  assert.equal(retired.currentTeamId, null);
  assert.equal(state.value.state.contracts[0]?.status, 'TERMINATED');
  const summary = await game.generateRetirementSummary();
  assert.equal(summary.player.reason, '达到职业生涯自然退役年龄');
  assert.deepEqual(summary.top20History, [{ year: 2030, rank: 10 }]);
});
