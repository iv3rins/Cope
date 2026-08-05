import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import type { CareerGameDependencies } from '../src/engine/game';
import type { StoryEngine, StoryEvent } from '../src/engine/graph';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';

function player(): PlayerProfile {
  return {
    id: 'player-1', gameId: 'Tester', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'ASIA', age: 22, currentTeamId: 'team-1', currentContractId: null, role: 'AWPER',
    attributes: { aim: 70, gameSense: 65, leadership: 50, clutch: 68, consistency: 58, teamConflict: 20 },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 20 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 50, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

const postEvent: StoryEvent = { id: 'forced-post', title: 'Forced', description: 'Forced', worldlineId: 'rookie', type: 'MANDATORY', period: 'NORMAL', phase: 'POST_TOURNAMENT', conditions: [], options: [], autoEffects: [] };
const transferEvent: StoryEvent = { id: 'transfer-confirmation', title: 'Transfer', description: 'Transfer', worldlineId: 'rookie', type: 'CHOICE', system: true, consumesTransferOffer: true, period: 'TRANSFER_WINDOW', phase: 'POST_TOURNAMENT', conditions: [], options: [], autoEffects: [] };
const preEvent: StoryEvent = { id: 'random-pre', title: 'Random', description: 'Random', worldlineId: 'rookie', type: 'CHOICE', period: 'NORMAL', phase: 'PRE_TOURNAMENT', conditions: [], options: [], autoEffects: [] };

function envelope(): CareerSaveEnvelope {
  return {
    format: 'COPE_CAREER_SAVE', version: 1,
    state: {
      schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 1,
      player: player(), contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [],
      seasonNarrativeEventCount: 4,
      pendingSystemEvents: [{ triggerId: 'forced:1', playerId: 'player-1', eventId: postEvent.id, period: 'NORMAL', fact: { type: 'PLAYER_BANKRUPT', playerId: 'player-1', balance: -1 }, matchedConditions: [], forced: true }],
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

function storyEngine(): StoryEngine {
  return {
    successChancePolicy: { adjust: ({ baseChance }) => baseChance },
    findAvailableEvents: async ({ period, phase }) => period === 'TRANSFER_WINDOW' ? [transferEvent] : phase === 'POST_TOURNAMENT' ? [postEvent] : [preEvent],
    decide: async () => { throw new Error('not used'); },
  };
}

function game(state: MemoryState): CareerGameImpl {
  const dependencies = {
    playerId: 'player-1', difficultyMode: 'HARDCORE', stateRepository: state,
    hltv: {} as CareerGameDependencies['hltv'], progression: {} as CareerGameDependencies['progression'], dailyActions: {} as CareerGameDependencies['dailyActions'], economy: {} as CareerGameDependencies['economy'], triggers: {} as CareerGameDependencies['triggers'], retirement: {} as CareerGameDependencies['retirement'], retirementSummary: {} as CareerGameDependencies['retirementSummary'],
  } satisfies CareerGameDependencies;
  return new CareerGameImpl(dependencies, { story: storyEngine(), random: { next: () => 0.2 } });
}

test('incompatible windows retain queued system events and exhausted narrative quota blocks random events', async () => {
  const state = new MemoryState(envelope());
  const career = game(state);
  assert.equal(await career.findCareerEvent('PRE_TOURNAMENT'), null);
  assert.equal(state.value.state.pendingSystemEvents?.length, 1);
  assert.equal(state.value.state.seasonNarrativeEventCount, 4);
});

test('pending transfer offer system event bypasses narrative quota without consuming it', async () => {
  const value = envelope();
  const pendingTransferOffer = { offerId: 'offer-1', teamId: 'team-2', teamName: 'Team 2', tier: 'T2' as const, salaryPerMonth: 1000, buyoutAmount: 0, roleOffer: 'STARTER' as const, contract: { salaryPerMonth: 1000, buyoutAmount: 0, lengthMonths: 12, role: 'STARTER' as const, expectedPlaytimePercentage: 80 }, source: 'CONFIGURED_TARGET' as const, createdAt: value.state.currentDate, expiresAt: '2026-02-01T00:00:00.000Z' };
  const state = new MemoryState({ ...value, state: { ...value.state, pendingSystemEvents: [], pendingTransferOffer } });
  const event = await game(state).findCareerEvent('TRANSFER_WINDOW');
  assert.equal(event?.id, transferEvent.id);
  assert.equal(state.value.state.seasonNarrativeEventCount, 4);
});

test('compatible system events bypass narrative quota and only remove the displayed queue item', async () => {
  const value = envelope();
  value.state.pendingSystemEvents?.length;
  const second = { ...value.state.pendingSystemEvents![0]!, triggerId: 'other:2', eventId: 'other-event', period: 'OFFSEASON' as const };
  const state = new MemoryState({ ...value, state: { ...value.state, pendingSystemEvents: [...value.state.pendingSystemEvents!, second] } });
  const event = await game(state).findCareerEvent('POST_TOURNAMENT');
  assert.equal(event?.id, postEvent.id);
  assert.equal(state.value.state.seasonNarrativeEventCount, 4);
  assert.deepEqual(state.value.state.pendingSystemEvents?.map((item) => item.triggerId), ['other:2']);
});
