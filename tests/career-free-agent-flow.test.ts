import assert from 'node:assert/strict';
import test from 'node:test';
import { CareerGameImpl } from '../src/engine/impl/career-game';
import type { CareerGameDependencies } from '../src/engine/game';
import type { PlayerProfile } from '../src/engine/profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../src/engine/save-state';
import type { StoryEngine } from '../src/engine/graph';
import type { TournamentEdition, TournamentResult, TournamentService } from '../src/hltv/tournament';
import type { VrsInviteSnapshot } from '../src/hltv/team';

const profile = (value: number, status: 'FREE_AGENT' | 'UNSIGNED' = 'FREE_AGENT'): PlayerProfile => ({
  id: 'free-player', gameId: 'FreePlayer', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 20, currentTeamId: null, currentContractId: null,
  freeAgencyStatus: status, role: 'AWPER', attributes: { aim: value, gameSense: value, leadership: value, clutch: value, consistency: value, teamConflict: 0 },
  life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: value, energy: value, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
});

class State implements CareerGameStateRepository {
  constructor(public value: CareerSaveEnvelope) {}
  async load() { return structuredClone(this.value); }
  async save(_slot: string, value: CareerSaveEnvelope) { this.value = structuredClone(value); }
  async listSlots() { return ['free-player']; }
  async delete() {}
}

const snapshot: VrsInviteSnapshot = { id: 'snapshot', season: 2026, half: 1, frozenAt: '2026-01-01', sourceRankingId: 'rank', rulesVersion: 'v1', entries: [
  { teamId: 't1', rank: 5, snapshotRank: 5, points: 1000, source: 'VRS', observedAt: '2026-01-01' },
  { teamId: 't2', rank: 20, snapshotRank: 20, points: 500, source: 'VRS', observedAt: '2026-01-01' },
  { teamId: 't3', rank: 40, snapshotRank: 40, points: 100, source: 'VRS', observedAt: '2026-01-01' },
] };
const edition = (teamId: string): TournamentEdition => ({ id: `${teamId}-cup`, seriesId: 'test-series', name: 'Test Cup', season: 2026, half: 1, calendarOrder: 1, tier: 'T1', honorClass: 'ELITE', node: 'MAIN_EVENT', teamId, qualificationSource: 'DIRECT_VRS', vrsSnapshotId: 'snapshot', snapshotRank: 5, rosterLockCareerHalf: 1, targetEditionId: null });
const result = (e: TournamentEdition): TournamentResult => ({ editionId: e.id, seriesId: e.seriesId, season: 2026, eventName: e.name, teamId: e.teamId, tier: 'T1', honorClass: 'ELITE', placement: 'GROUP_EXIT', title: false, prizeMoney: 10_000, teamPrizeMoney: 10_000, qualificationSource: 'DIRECT_VRS', vrsSnapshotId: 'snapshot', upset: { occurred: false, chance: 0, roll: 0, forcedByInterventionId: null, contributingInterventionIds: [] }, consumedInterventions: [], matchResults: [], teamPlacements: [{ teamId: e.teamId, placement: 'GROUP_EXIT', title: false, rosterPlayerIds: ['free-player'] }], playerPerformances: [{ playerId: 'free-player', teamId: e.teamId, maps: 1, kills: 10, deaths: 10, assists: 2, rating: 1, playoffMaps: 0, playoffRating: 0, top5Maps: 0, top5Rating: 0, finalMaps: 0, finalRating: null, honor: null }], honors: [] });

const tournaments: TournamentService = {
  createCalendar: async ({ teamId }) => [edition(teamId)], decideQualification: async () => { throw new Error('unused'); },
  lockRoster: async ({ edition: e, roster, careerHalf, substitutePlayerId }) => ({ editionId: e.id, teamId: e.teamId, lockedAtCareerHalf: careerHalf, roster, substitutePlayerId: substitutePlayerId ?? null }),
  applyIntervention: async (intervention) => ({ type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: '2026-01-01', intervention }), findPendingInterventions: async () => [],
  start: async ({ edition: e }) => ({ status: 'COMPLETED', state: null, lifecycleHook: 'POST_TOURNAMENT', uiData: {}, result: result(e) }),
  advance: async () => { throw new Error('unused'); }, simulate: async ({ edition: e }) => result(e),
  settle: async ({ result: r }) => ({ type: 'TOURNAMENT_COMPLETED', occurredAt: '2026-01-01', result: r }),
};

function makeGame(p: PlayerProfile, options: { phase?: 'ACTIVE' | 'REPORT'; story?: StoryEngine } = {}) {
  const state = new State({ format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2026-01-01', currentDate: '2026-01-01', season: 2026, careerHalf: 1, seasonPhase: options.phase ?? 'ACTIVE', player: p, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: snapshot } });
  const deps = { playerId: p.id, difficultyMode: 'HARDCORE', stateRepository: state, hltv: { freezeVrsSnapshot: async () => 'snapshot', applyTournamentIntervention: async (intervention) => ({ type: 'TOURNAMENT_INTERVENTION_APPLIED' as const, occurredAt: '2026-01-01', intervention }), settleTournament: async () => {}, findTop20: async (season) => ({ season, rulesVersion: 'v1', entries: [], careerPlayerRank: null }), synchronizeCareerHonors: async (x) => x }, progression: {} as CareerGameDependencies['progression'], dailyActions: {} as CareerGameDependencies['dailyActions'], economy: {} as CareerGameDependencies['economy'], triggers: { evaluate: async () => [], markTriggered: async () => {} }, retirement: {} as CareerGameDependencies['retirement'], retirementSummary: {} as CareerGameDependencies['retirementSummary'] } satisfies CareerGameDependencies;
  const game = new CareerGameImpl(deps, { tournaments, vrsSnapshot: async () => snapshot, random: { next: () => 0 }, transferTargets: { list: async ({ player: candidate }) => snapshot.entries.map((entry) => { const tier = entry.snapshotRank <= 12 ? 'T1' as const : entry.snapshotRank <= 32 ? 'T2' as const : 'T3' as const; return { teamId: entry.teamId, teamName: entry.teamId, region: 'EUROPE' as const, tier, minimumRank: tier === 'T1' ? 1 : tier === 'T2' ? 13 : 33, maximumRank: tier === 'T1' ? 12 : tier === 'T2' ? 32 : 999, requiredAttributes: {}, salaryPerMonth: 0, buyoutAmount: 0, reason: `${tier} stand-in`, eligible: tier === (candidate.attributes.aim >= 72 ? 'T1' : candidate.attributes.aim >= 58 ? 'T2' : 'T3'), unmetRequirements: [], fitScore: candidate.attributes.aim, interestScore: candidate.attributes.aim, availability: 'RECOMMENDED' as const, reasons: [`${tier} fit`], risks: [], contract: { salaryPerMonth: 0, buyoutAmount: 0, lengthMonths: 6, role: 'STARTER' as const, expectedPlaytimePercentage: 100 } }; }) }, ...(options.story ? { story: options.story } : {}) });
  return { game, state };
}

test('转会目标仅能在 REPORT/OFFSEASON 领域窗口访问', async () => {
  const active = makeGame(profile(60));
  assert.deepEqual(await active.game.listTransferTargets(), []);
  await assert.rejects(() => active.game.selectTransferTarget('t2'), /only selectable during REPORT or OFFSEASON/);
});


test('TRANSFER_WINDOW 窗口准确映射到 StoryEngine period', async () => {
  let received: string | undefined;
  const story = { successChancePolicy: { adjust: ({ baseChance }: any) => baseChance }, findAvailableEvents: async (input: any) => { received = input.period; return []; }, decide: async () => { throw new Error('unused'); } } as StoryEngine;
  const { game } = makeGame(profile(60), { phase: 'REPORT', story });
  assert.equal(await game.findCareerEvent('TRANSFER_WINDOW'), null);
  assert.equal(received, 'TRANSFER_WINDOW');
});

test('半年切换会使旧 VRS 快照失效并由现有赛历流程重新冻结', async () => {
  const { game, state } = makeGame(profile(60), { phase: 'REPORT' });
  assert.equal(state.value.state.activeVrsSnapshot?.id, 'snapshot');
  await game.advancePeriod({ period: 'OFFSEASON', randomRoll: 0 });
  assert.equal(state.value.state.careerHalf, 2);
  assert.equal(state.value.state.activeVrsSnapshot, null);
});

test('空赛历 finishSeason 仍可完成半赛季结算', async () => {
  const { game, state } = makeGame(profile(60));
  const settlement = await game.finishSeason();
  assert.ok(settlement);
  assert.deepEqual(settlement.tournamentIds, []);
  assert.equal(state.value.state.seasonPhase, 'REPORT');
});

test('stand-in 仅 FREE_AGENT 可见，UNSIGNED 不会收到邀请', async () => {
  assert.equal((await makeGame(profile(60, 'UNSIGNED')).game.listStandInOffers()).length, 0);
  assert.equal((await makeGame(profile(60)).game.listStandInOffers()).length, 1);
});

for (const [value, tier] of [[40, 'T3'], [60, 'T2'], [90, 'T1']] as const) {
  test(`属性 ${value} 的自由球员收到 ${tier} stand-in`, async () => {
    const offers = await makeGame(profile(value)).game.listStandInOffers();
    assert.equal(offers[0]?.tier, tier);
    assert.equal(offers[0]?.teamId, tier.toLowerCase());
  });
}

test('过期 stand-in 报价会被清理，且不能覆盖已有未完成赛历', async () => {
  const expired = makeGame(profile(60));
  const offer = (await expired.game.listStandInOffers())[0]!;
  expired.state.value = { ...expired.state.value, state: { ...expired.state.value.state, currentDate: offer.expiresAt } };
  const refreshed = await expired.game.listStandInOffers();
  assert.equal(refreshed.length, 1);
  assert.ok(Date.parse(refreshed[0]!.expiresAt) > Date.parse(offer.expiresAt));
  assert.equal(expired.state.value.state.pendingStandInOffer?.expiresAt, refreshed[0]!.expiresAt);

  const active = makeGame(profile(60));
  const activeOffer = (await active.game.listStandInOffers())[0]!;
  active.state.value = { ...active.state.value, state: { ...active.state.value.state, scheduledTournaments: [edition('t2')], tournamentCursor: 0 } };
  await assert.rejects(() => active.game.acceptStandInOffer(activeOffer.offerId), /cannot replace an active tournament schedule/);
});

test('stand-in 接受时重新校验自由身', async () => {
  const value = makeGame(profile(60));
  const offer = (await value.game.listStandInOffers())[0]!;
  value.state.value = { ...value.state.value, state: { ...value.state.value.state, player: { ...value.state.value.state.player, freeAgencyStatus: 'SIGNED', currentTeamId: 't3', currentContractId: 'contract' } } };
  await assert.rejects(() => value.game.acceptStandInOffer(offer.offerId), /requires an active free-agent state/);
});


test('正式队员个人赛事收入按团队奖金五分之一结算且仅累计一次', async () => {
  const signed = { ...profile(60), currentTeamId: 't2', currentContractId: 'contract', freeAgencyStatus: 'SIGNED' as const };
  const { game, state } = makeGame(signed);
  state.value = { ...state.value, state: { ...state.value.state, scheduledTournaments: [edition('t2')], unsettledTournamentIds: ['t2-cup'], tournamentCursor: 0 } };
  const completed = await game.advanceTournament();
  assert.equal(completed.result?.teamPrizeMoney, 10_000);
  assert.equal(completed.result?.playerPrizeIncome, 2_000);
  assert.notEqual(completed.result?.playerPrizeIncome, completed.result?.teamPrizeMoney);
  assert.equal(state.value.state.player.career.careerEarnings, 2_000);
  const settlement = await game.finishSeason();
  assert.equal(settlement?.totalPrizeMoney, 2_000);
  assert.equal(state.value.state.player.life.balance, 2_000);
  await game.finishSeason();
  assert.equal(state.value.state.player.life.balance, 2_000);
});

test('accept 不改变所属队/合同，getNextTournament 可用；完成后清 assignment 且半年内仍可继续邀请（最多三次）', async () => {
  const { game, state } = makeGame(profile(60));
  const offer = (await game.listStandInOffers())[0]!;
  await game.acceptStandInOffer(offer.offerId);
  assert.equal(state.value.state.player.currentTeamId, null);
  assert.equal(state.value.state.player.currentContractId, null);
  assert.equal((await game.getNextTournament())?.id, offer.edition.id);
  const completed = await game.advanceTournament();
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.result?.teamPrizeMoney, 10_000);
  assert.equal(completed.result?.playerPrizeIncome, offer.appearanceFee + offer.perMapBonus + 10_000 * offer.prizeSharePercentage / 100);
  assert.notEqual(completed.result?.playerPrizeIncome, completed.result?.teamPrizeMoney);
  assert.equal(state.value.state.player.career.careerEarnings, completed.result?.playerPrizeIncome);
  assert.equal(state.value.state.standInAssignment, null);
  assert.equal((await game.listStandInOffers()).length, 1);
  const second = (await game.listStandInOffers())[0]!;
  assert.deepEqual(await game.respondStandInOffer(second.offerId, 'WAIT'), second);
  await game.respondStandInOffer(second.offerId, 'REJECT');
  const third = await game.listStandInOffers();
  assert.equal(third.length, 1);
  await game.respondStandInOffer(third[0]!.offerId, 'REJECT');
  assert.deepEqual(await game.listStandInOffers(), []);
});
