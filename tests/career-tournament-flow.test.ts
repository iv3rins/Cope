import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import { MatchSimulationServiceImpl } from '../src/hltv/match-simulation-service-impl';
import { TournamentServiceImpl } from '../src/hltv/tournament-service-impl';
import type { CareerGameDependencies } from '../src/engine/game';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';
import type { TournamentEdition } from '../src/hltv/tournament';

const player: PlayerProfile = {
  id: 'career-player', gameId: 'Tester', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 22, currentTeamId: 'career-team', currentContractId: null, role: 'AWPER',
  attributes: { aim: 76, gameSense: 72, leadership: 55, clutch: 75, consistency: 70, teamConflict: 15 },
  life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 20 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 70, energy: 75, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
};

function edition(tier: 'T1' | 'MAJOR'): TournamentEdition {
  return { id: `${tier}-event`, seriesId: `${tier}-series`, name: `${tier} Event`, season: 2026, half: 1, calendarOrder: 1, tier, honorClass: tier === 'MAJOR' ? 'MAJOR' : 'ELITE', node: 'MAIN_EVENT', simulationMode: tier === 'MAJOR' ? 'SWISS' : 'FAST', teamId: 'career-team', qualificationSource: 'DIRECT_VRS', vrsSnapshotId: 'snapshot', snapshotRank: 4, rosterLockCareerHalf: 1, targetEditionId: null, format: 'BO3' };
}

class State implements CareerGameStateRepository {
  public constructor(public value: CareerSaveEnvelope) {}
  public async load() { return structuredClone(this.value); }
  public async save(_slot: string, value: CareerSaveEnvelope) { this.value = structuredClone(value); }
  public async listSlots() { return ['career-player']; }
  public async delete() {}
}

function createGame(tournament: TournamentEdition, randomRoll = 0.4) {
  const state = new State({ format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2026-01-01', currentDate: '2026-01-01', season: 2026, careerHalf: 1, player, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [tournament], unsettledTournamentIds: [tournament.id], pendingTournamentInterventions: [], activeVrsSnapshot: { id: 'snapshot', season: 2026, half: 1, frozenAt: '2026-01-01', sourceRankingId: 'ranking', rulesVersion: 'v1', entries: [{ teamId: 'career-team', rank: tournament.snapshotRank ?? 4, snapshotRank: tournament.snapshotRank ?? 4, points: 1000, source: 'VRS', observedAt: '2026-01-01' }] } } });
  const facts: string[] = [];
  const tournaments = new TournamentServiceImpl({ playerId: player.id, random: { next: () => randomRoll }, clock: { now: () => '2026-01-01' }, matches: new MatchSimulationServiceImpl(), facts: { hasCompleted: async (id) => facts.includes(id), append: async (fact) => { if (fact.type === 'TOURNAMENT_COMPLETED') facts.push(fact.result.editionId); } } });
  const dependencies = {
    playerId: player.id, difficultyMode: 'HARDCORE', stateRepository: state,
    hltv: { freezeVrsSnapshot: async () => 'snapshot', applyTournamentIntervention: async (intervention) => ({ type: 'TOURNAMENT_INTERVENTION_APPLIED' as const, occurredAt: intervention.occurredAt, intervention }), settleTournament: async () => {}, findTop20: async (season) => ({ season, rulesVersion: 'v1', entries: [], careerPlayerRank: null }), synchronizeCareerHonors: async (profile) => profile },
    progression: {} as CareerGameDependencies['progression'], dailyActions: {} as CareerGameDependencies['dailyActions'], economy: {} as CareerGameDependencies['economy'], triggers: { evaluate: async () => [], markTriggered: async () => {} }, retirement: {} as CareerGameDependencies['retirement'], retirementSummary: {} as CareerGameDependencies['retirementSummary'],
  } satisfies CareerGameDependencies;
  const game = new CareerGameImpl(dependencies, { tournaments, random: { next: () => randomRoll } });
  return { game, state, facts, tournaments };
}

test('CareerGame exposes Fast lifecycle and completes through the existing advance result', async () => {
  const { game, state, facts } = createGame(edition('T1'));
  const pre = await game.advanceTournament();
  assert.equal(pre.status, 'ONGOING');
  assert.equal(pre.lifecycleHook, 'PRE_TOURNAMENT');
  const inside = await game.advanceTournament();
  assert.equal(inside.status, 'ONGOING');
  assert.equal(inside.lifecycleHook, 'IN_TOURNAMENT');
  const completed = await game.advanceTournament();
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.result?.matchResults.length);
  assert.equal(state.value.state.tournamentCursor, 1);
  assert.deepEqual(facts, ['T1-event']);
});

test('failed public qualifiers simulate and archive independent match statistics', async () => {
  const qualifier: TournamentEdition = { ...edition('T1'), qualificationSource: 'PUBLIC_QUALIFIER', qualificationStatus: 'QUALIFIER_PENDING', snapshotRank: 100 };
  const { game, state } = createGame(qualifier, 0.99);
  let result = await game.advanceTournament();
  let advances = 0;
  while (result.status === 'ONGOING') {
    assert.equal(result.uiData.qualifier, true);
    assert.equal(result.uiData.countedInCareer, false);
    result = await game.advanceTournament();
    advances += 1;
    assert.ok(advances <= 3);
  }
  assert.equal(result.status, 'QUALIFIER_EXIT');
  const performance = result.uiData.qualifierPerformance as { maps: number; kills: number };
  assert.ok(performance.maps >= 2);
  assert.ok(performance.kills > 0);
  assert.equal(result.uiData.countedInCareer, true);
  assert.equal(result.uiData.countedInTop20, false);
  assert.equal(state.value.state.qualificationResults?.length, 1);
  assert.equal(state.value.state.player.career.mapsPlayed, performance.maps);
  assert.equal(state.value.state.player.career.totalKills, performance.kills);
  assert.equal(state.value.state.player.tournamentArchive.length, 0);
  assert.equal(state.value.state.tournamentResults?.length ?? 0, 0);
});

test('successful public qualifier is visible and main event starts only on the next advance', async () => {
  const qualifier: TournamentEdition = { ...edition('T1'), qualificationSource: 'PUBLIC_QUALIFIER', qualificationStatus: 'QUALIFIER_PENDING', snapshotRank: 13 };
  const { game, state, tournaments } = createGame(qualifier, 0);
  await tournaments.applyIntervention({ id: 'qualifier-force', editionId: `${qualifier.id}-qualifier`, sourceStoryEventId: 'test', sourceOptionId: 'win', type: 'FORCE_UPSET', forceUpset: true, occurredAt: '2026-01-01', description: 'force qualifier win' });
  let progress = await game.advanceTournament();
  let advances = 0;
  while (!(progress.uiData.qualifier === true && progress.uiData.qualified === true)) {
    assert.equal(progress.status, 'ONGOING');
    assert.equal(progress.uiData.qualifier, true);
    progress = await game.advanceTournament();
    advances += 1;
    assert.ok(advances <= 3);
  }
  assert.equal(progress.result, null);
  assert.equal(progress.uiData.mainEventNext, true);
  assert.equal(state.value.state.tournamentCursor ?? 0, 0);
  const qualifierPerformance = progress.uiData.qualifierPerformance as { maps: number; kills: number };
  assert.equal(state.value.state.player.career.mapsPlayed, qualifierPerformance.maps);
  assert.equal(state.value.state.player.career.totalKills, qualifierPerformance.kills);
  assert.equal(state.value.state.player.tournamentArchive.length, 0);
  assert.equal(state.value.state.qualificationResults?.length, 1);

  const mainEventStart = await game.advanceTournament();
  assert.equal(mainEventStart.status, 'ONGOING');
  assert.equal(mainEventStart.uiData.qualifier, undefined);
  assert.equal(mainEventStart.lifecycleHook, 'PRE_TOURNAMENT');
});

test('CareerGame exposes Swiss uiData without reading the opaque payload', async () => {
  const { game } = createGame(edition('MAJOR'));
  let progress = await game.advanceTournament();
  let turns = 0;
  while (progress.status === 'ONGOING') {
    assert.equal(progress.uiData.mode, 'SWISS');
    progress = await game.advanceTournament();
    turns += 1;
    assert.ok(turns <= 7);
  }
  assert.equal(progress.status, 'COMPLETED');
  assert.ok(progress.result);
});
