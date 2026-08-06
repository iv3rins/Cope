import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { tierForRank } from '../src/hltv/team';
import { tierForRank as apiTierForRank } from '../src/api/team-tier';
import { TournamentServiceImpl } from '../src/hltv/tournament-service-impl';
import type { VrsInviteSnapshot } from '../src/hltv/team';
import type { MatchSimulationResult, MatchSimulationService } from '../src/hltv/match';

const snapshot = (rank: number): VrsInviteSnapshot => ({
  id: `snapshot-${rank}`, season: 2026, half: 1, frozenAt: '2026-01-01', sourceRankingId: 'ranking', rulesVersion: 'v1',
  entries: [{ teamId: 'career-team', rank, snapshotRank: rank, points: 1000, source: 'VRS', observedAt: '2026-01-01' }],
});

const calendarReader = async () => ({ schemaVersion: 1 as const, organizers: { org: 'ORG' }, editions: [
  { id: 't1', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'T1', tier: 'T1' as const, honorClass: 'SUPER_ELITE' as const, format: 'BO3' as const, prizePool: 1 },
  { id: 't1-second', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'T1 Second', tier: 'T1' as const, honorClass: 'ELITE' as const, format: 'BO3' as const, prizePool: 1 },
  { id: 't2', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'T2', tier: 'T2' as const, honorClass: 'MEDIUM' as const, format: 'BO3' as const, prizePool: 1, eligibleTeamTiers: ['T2', 'T3'] as const, fallbackQualificationSource: 'PUBLIC_QUALIFIER' as const },
  { id: 'major', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'Major', tier: 'MAJOR' as const, honorClass: 'MAJOR' as const, format: 'BO3' as const, prizePool: 1, directInviteMaxRank: 64, fallbackQualificationSource: 'PUBLIC_QUALIFIER' as const },
] });

function service(matches?: MatchSimulationService) {
  return new TournamentServiceImpl({ playerId: 'career-player', random: { next: () => 0 }, clock: { now: () => '2026-01-01' }, matches: matches ?? { simulate: async () => { throw new Error('unused'); } }, calendarReader });
}

test('roster tier and VRS rank stay aligned with teams standings data', async () => {
  const root = join(import.meta.dirname, '..', 'assets', 'teams');
  const rosters = JSON.parse(await readFile(join(root, 'rosters.json'), 'utf8')) as { teams: readonly { teamId: string; tier: string; vrsRank: number }[] };
  const teams = JSON.parse(await readFile(join(root, 'teams.json'), 'utf8')) as { teams: readonly { id: string; standings: { bestRank: number } | null }[] };
  for (const roster of rosters.teams.filter((entry) => entry.teamId === 'tyloo' || entry.teamId === 'rareatom')) {
    const rank = teams.teams.find((team) => team.id === roster.teamId)?.standings?.bestRank;
    if (rank === undefined) continue;
    assert.equal(roster.vrsRank, rank, roster.teamId);
    assert.equal(roster.tier, tierForRank(rank), roster.teamId);
  }
});

test('tierForRank has one compatible 12/32 boundary source', () => {
  for (const [rank, tier] of [[1, 'T1'], [12, 'T1'], [13, 'T2'], [32, 'T2'], [33, 'T3'], [Infinity, 'T3']] as const) {
    assert.equal(tierForRank(rank), tier);
    assert.equal(apiTierForRank(rank), tier);
  }
});

test('ordinary T1 directly invites only top 12 while Major includes only snapshot top 32', async () => {
  const rank12 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(12) });
  assert.equal(rank12.find((event) => event.tier === 'T1')?.qualificationSource, 'DIRECT_VRS');
  const rank13 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(13) });
  assert.equal(rank13.find((event) => event.tier === 'T1')?.qualificationSource, 'PUBLIC_QUALIFIER');
  assert.equal(rank13.find((event) => event.tier === 'MAJOR')?.qualificationStatus, 'DIRECT');
  assert.equal(rank13.find((event) => event.tier === 'MAJOR')?.qualificationSource, 'DIRECT_VRS');
  const rank32 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(32) });
  assert.ok(rank32.some((event) => event.tier === 'MAJOR'));
  const rank33 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(33) });
  assert.equal(rank33.some((event) => event.tier === 'MAJOR'), false);
  assert.ok([...rank12, ...rank13, ...rank32].filter((event) => event.tier === 'MAJOR').every((event) => event.node === 'MAIN_EVENT' && event.qualificationSource === 'DIRECT_VRS' && event.qualificationStatus === 'DIRECT'));
});

test('T3 calendar keeps T2 events plus only one T1 qualifier and uses consistent qualifier nodes', async () => {
  const events = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(33) });
  assert.equal(events.filter((event) => event.tier === 'T1').length, 1);
  assert.equal(events.find((event) => event.tier === 'T1')?.seriesId, 't1');
  assert.equal(events.filter((event) => event.tier === 'T2').length, 1);
  assert.ok(events.filter((event) => event.qualificationSource === 'PUBLIC_QUALIFIER').every((event) => event.node === 'QUALIFIER' && event.qualificationStatus === 'QUALIFIER_PENDING'));
});

test('T2 calendar keeps all T2 direct-path events and caps ordinary T1 qualification at one', async () => {
  const events = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(13) });
  assert.equal(events.filter((event) => event.tier === 'T2').length, 1);
  assert.ok(events.filter((event) => event.tier === 'T1').length <= 1);
  assert.ok(events.filter((event) => event.tier === 'T1').every((event) => event.qualificationSource === 'PUBLIC_QUALIFIER'));
});
test('series projection uses mapsWon as series score and keeps optional cumulative rounds', async () => {
  const simulated: MatchSimulationResult = {
    matchId: 'match', stage: 'GROUP', winnerTeamId: 'career-team', loserTeamId: 'opponent',
    scores: [{ teamId: 'career-team', mapsWon: 2, roundsWon: 26 }, { teamId: 'opponent', mapsWon: 1, roundsWon: 21 }], mapsPlayed: ['A', 'B', 'C'],
    playerPerformances: [], teamRanks: { 'career-team': 4, opponent: 8 }, resourceConflictPenalties: {}, upset: false, randomRoll: 0,
  };
  let receivedOpponentRank: number | null | undefined;
  const simulator = service({ simulate: async (input) => {
    receivedOpponentRank = input.teamRanks.opponent;
    return { ...simulated, teamRanks: input.teamRanks };
  } });
  const edition = { id: 'event', seriesId: 'series', name: 'Event', season: 2026, half: 1 as const, calendarOrder: 1, tier: 'T1' as const, honorClass: 'LARGE' as const, node: 'MAIN_EVENT' as const, simulationMode: 'FAST' as const, teamId: 'career-team', qualificationSource: 'DIRECT_VRS' as const, vrsSnapshotId: 'snapshot', snapshotRank: 4, rosterLockCareerHalf: 1, targetEditionId: null, format: 'BO3' as const };
  const result = await simulator.simulate({ edition, context: { editionId: 'event', baseTeamStrength: 80, baseOpponentStrength: { opponent: 70 }, opponentRanks: { opponent: 27 }, interventions: [], upsetRoll: 0 } });
  assert.equal(result.seriesDetails?.[0]?.mapScores[0], '2:1（累计回合 26:21）');
  assert.equal(receivedOpponentRank, 27);
  assert.equal(result.matchResults[0]?.teamRanks.opponent, 27);
  assert.equal(result.matchResults[0]?.scores.find((score) => score.teamId === result.matchResults[0]?.winnerTeamId)?.mapsWon, 2);
});

test('forced comeback keeps winner and score teamIds consistent', async () => {
  const simulated: MatchSimulationResult = {
    matchId: 'forced', stage: 'GROUP', winnerTeamId: 'opponent', loserTeamId: 'career-team',
    scores: [{ teamId: 'opponent', mapsWon: 2, roundsWon: 26 }, { teamId: 'career-team', mapsWon: 0, roundsWon: 14 }], mapsPlayed: ['A', 'B'],
    playerPerformances: [], teamRanks: { 'career-team': 30, opponent: 1 }, resourceConflictPenalties: {}, upset: false, randomRoll: 0.9,
  };
  const simulator = service({ simulate: async () => simulated });
  const edition = { id: 'forced-event', seriesId: 'series', name: 'Event', season: 2026, half: 1 as const, calendarOrder: 1, tier: 'T1' as const, honorClass: 'LARGE' as const, node: 'MAIN_EVENT' as const, simulationMode: 'FAST' as const, teamId: 'career-team', qualificationSource: 'DIRECT_VRS' as const, vrsSnapshotId: 'snapshot', snapshotRank: 30, rosterLockCareerHalf: 1, targetEditionId: null, format: 'BO3' as const };
  const result = await simulator.simulate({ edition, context: { editionId: 'forced-event', baseTeamStrength: 40, baseOpponentStrength: { opponent: 90 }, interventions: [{ id: 'force', editionId: 'forced-event', sourceStoryEventId: 'story', sourceOptionId: 'option', type: 'FORCE_UPSET', forceUpset: true, occurredAt: '2026-01-01', description: 'force' }], upsetRoll: 0.9 } });
  for (const match of result.matchResults) {
    assert.equal(match.winnerTeamId, 'career-team');
    assert.equal(match.scores.find((score) => score.mapsWon === 2)?.teamId, match.winnerTeamId);
    assert.equal(match.scores.find((score) => score.mapsWon === 0)?.teamId, match.loserTeamId);
  }
});
