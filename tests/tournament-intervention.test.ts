import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import type { CareerGameDependencies } from '../src/engine/game';
import type { StoryEngine, StoryEvent, StoryDecision, StoryDecisionResult } from '../src/engine/graph';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';
import type { TournamentIntervention } from '../src/hltv/tournament';

const player: PlayerProfile = {
  id: 'player-1', gameId: 'Tester', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 22, currentTeamId: 'team-1', currentContractId: null, role: 'AWPER',
  attributes: { aim: 70, gameSense: 65, leadership: 50, clutch: 68, consistency: 58, teamConflict: 20 },
  life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 20 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 50, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
};

function envelope(): CareerSaveEnvelope {
  return {
    format: 'COPE_CAREER_SAVE', version: 1,
    state: {
      schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 1,
      player, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [],
      scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null,
    },
  };
}

class MemoryState implements CareerGameStateRepository {
  public constructor(public value: CareerSaveEnvelope) {}
  public async load() { return structuredClone(this.value); }
  public async save(_slot: string, value: CareerSaveEnvelope) { this.value = structuredClone(value); }
  public async listSlots() { return ['player-1']; }
  public async delete() {}
}

test('TOURNAMENT_INTERVENTION 效果由 CareerGame 经 hltv gateway 落地并回传 id', async () => {
  const event: StoryEvent = {
    id: 'intervention-event', title: 'Intervention', description: 'Intervention', worldlineId: 'rookie', type: 'CHOICE', period: 'FINAL_DECISIVE_MOMENT',
    conditions: [], autoEffects: [],
    options: [{
      id: 'force-upset', label: 'Force Upset', requirements: [],
      outcome: { successEffects: [{ type: 'TOURNAMENT_INTERVENTION', editionId: 't1-event', interventionType: 'FORCE_UPSET', forceUpset: true, description: '决赛前士气爆发' }], failureEffects: [] },
    }],
  };
  const applied: TournamentIntervention[] = [];
  const story: StoryEngine = {
    successChancePolicy: { adjust: ({ baseChance }) => baseChance },
    findAvailableEvents: async () => [event],
    decide: async ({ profile, decision }: { profile: PlayerProfile; decision: StoryDecision }): Promise<StoryDecisionResult> => ({
      profile, succeeded: true,
      appliedEffects: [{ type: 'TOURNAMENT_INTERVENTION', editionId: 't1-event', interventionType: 'FORCE_UPSET', forceUpset: true, description: '决赛前士气爆发' }],
      appliedTournamentInterventionIds: [], terminatedContractId: null, nextEventId: null, resultMessages: [],
    }),
  };
  const state = new MemoryState(envelope());
  const dependencies = {
    playerId: 'player-1', difficultyMode: 'HARDCORE', stateRepository: state,
    hltv: { applyTournamentIntervention: async (intervention: TournamentIntervention) => { applied.push(intervention); return { type: 'TOURNAMENT_INTERVENTION_APPLIED' as const, occurredAt: intervention.occurredAt, intervention }; }, freezeVrsSnapshot: async () => 'snapshot', settleTournament: async () => {}, findTop20: async (season) => ({ season, rulesVersion: 'v1', entries: [], careerPlayerRank: null }), synchronizeCareerHonors: async (profile: PlayerProfile) => profile },
    progression: {} as CareerGameDependencies['progression'], dailyActions: {} as CareerGameDependencies['dailyActions'], economy: {} as CareerGameDependencies['economy'], triggers: {} as CareerGameDependencies['triggers'], retirement: {} as CareerGameDependencies['retirement'], retirementSummary: {} as CareerGameDependencies['retirementSummary'],
  } satisfies CareerGameDependencies;
  const game = new CareerGameImpl(dependencies, { story });

  const result = await game.chooseStoryOption({ eventId: event.id, optionId: 'force-upset', randomRoll: 0.1 });
  assert.equal(applied.length, 1, '干预效果应通过 gateway 落地一次');
  assert.equal(applied[0]!.editionId, 't1-event');
  assert.equal(applied[0]!.type, 'FORCE_UPSET');
  assert.equal(applied[0]!.forceUpset, true);
  assert.equal(applied[0]!.sourceStoryEventId, event.id);
  assert.equal(applied[0]!.sourceOptionId, 'force-upset');
  assert.equal(applied[0]!.occurredAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.appliedTournamentInterventionIds[0], applied[0]!.id, '决策结果应回传已落地的干预 id');
});
