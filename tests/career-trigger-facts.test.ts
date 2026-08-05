import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import type { CareerGameDependencies } from '../src/engine/game';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';
import type { TriggerFact, TriggeredEvent } from '../src/engine/event-trigger';

function player(): PlayerProfile {
  return {
    id: 'player-1', gameId: 'Tester', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'ASIA', age: 29, currentTeamId: null, currentContractId: null, role: 'AWPER',
    attributes: { aim: 70, gameSense: 65, leadership: 50, clutch: 68, consistency: 58, teamConflict: 20 },
    life: { balance: -10, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 20 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 50, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

class State implements CareerGameStateRepository {
  public constructor(public value: CareerSaveEnvelope) {}
  public async load() { return structuredClone(this.value); }
  public async save(_slot: string, value: CareerSaveEnvelope) { this.value = structuredClone(value); }
  public async listSlots() { return []; }
  public async delete() {}
}

function envelope(): CareerSaveEnvelope {
  return { format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 2, player: player(), contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null } };
}

function dependencies(state: State, facts: TriggerFact[]): CareerGameDependencies {
  return {
    playerId: 'player-1', difficultyMode: 'HARDCORE', stateRepository: state,
    hltv: {} as CareerGameDependencies['hltv'],
    progression: {
      createProfile: async ({ profile: current }) => current,
      getAgePhase: () => 'PEAK',
      advanceAge: async ({ profile: current }) => ({ previousAge: current.age, currentAge: current.age + 1, profile: { ...current, age: current.age + 1 }, phase: 'PEAK', appliedDeltas: [], grantedFlags: [] }),
    },
    dailyActions: {
      listAvailable: async () => [],
      execute: async ({ player: current, randomRoll }) => ({ completed: true, player: current, action: { id: 'action', type: 'REST', name: 'Rest', description: 'Rest', durationHours: 1, requirements: [], allowedPeriods: ['NORMAL'] }, appliedDeltas: [], randomRoll }),
    },
    economy: { isBankrupt: (balance) => balance < 0, tick: async () => { throw new Error('daily action must not tick economy'); } } as CareerGameDependencies['economy'],
    triggers: {
      evaluate: async ({ player: current, fact }): Promise<readonly TriggeredEvent[]> => {
        facts.push(fact);
        return [{ triggerId: `${fact.type}:one`, playerId: current.id, eventId: 'system-event', period: 'NORMAL', fact, matchedConditions: [], forced: true }];
      },
      markTriggered: async () => {},
    },
    retirement: {} as CareerGameDependencies['retirement'], retirementSummary: {} as CareerGameDependencies['retirementSummary'],
  };
}

test('daily actions publish bankruptcy facts without applying an additional economy tick', async () => {
  const state = new State(envelope());
  const facts: TriggerFact[] = [];
  const game = new CareerGameImpl(dependencies(state, facts), { clock: { now: () => '2026-01-01T00:00:00.000Z' } });
  await game.executeDailyAction('action', 0.2);
  assert.equal(facts[0]?.type, 'PLAYER_BANKRUPT');
  assert.equal(state.value.state.player.life.balance, -10);
});

test('age progression publishes an age milestone fact', async () => {
  const state = new State(envelope());
  const facts: TriggerFact[] = [];
  const game = new CareerGameImpl(dependencies(state, facts), { progressionRules: { findAgeRule: async () => null, findOriginRule: async () => ({ region: 'ASIA', name: 'Asia', initialAttributeDeltas: [], agePhaseAttributeDeltas: {}, originFlags: [] }) } });
  await game.advanceAge();
  assert.deepEqual(facts.map((fact) => fact.type), ['AGE_MILESTONE']);
  assert.equal((facts[0] as Extract<TriggerFact, { type: 'AGE_MILESTONE' }>).age, 30);
});
