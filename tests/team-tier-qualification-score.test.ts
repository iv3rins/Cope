import assert from 'node:assert/strict';
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
  { id: 't1', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'T1', tier: 'T1' as const, honorClass: 'LARGE' as const, format: 'BO3' as const, prizePool: 1 },
  { id: 'major', half: 1 as const, organizerId: 'org', city: 'City', nameTemplate: 'Major', tier: 'MAJOR' as const, honorClass: 'MAJOR' as const, format: 'BO3' as const, prizePool: 1, major: true },
] });

function service(matches?: MatchSimulationService) {
  return new TournamentServiceImpl({ playerId: 'career-player', random: { next: () => 0 }, clock: { now: () => '2026-01-01' }, matches: matches ?? { simulate: async () => { throw new Error('unused'); } }, calendarReader });
}

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
  const rank32 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(32) });
  assert.ok(rank32.some((event) => event.tier === 'MAJOR'));
  const rank33 = await service().createCalendar({ season: 2026, half: 1, teamId: 'career-team', snapshot: snapshot(33) });
  assert.equal(rank33.some((event) => event.tier === 'MAJOR'), false);
});

test('series projection uses mapsWon as series score and keeps optional cumulative rounds', async () => {
  const simulated: MatchSimulationResult = {
    matchId: 'match', stage: 'GROUP', winnerTeamId: 'career-team', loserTeamId: 'opponent',
    scores: [{ teamId: 'career-team', mapsWon: 2, roundsWon: 26 }, { teamId: 'opponent', mapsWon: 1, roundsWon: 21 }], mapsPlayed: ['A', 'B', 'C'],
    playerPerformances: [], teamRanks: { 'career-team': 4, opponent: 8 }, resourceConflictPenalties: {}, upset: false, randomRoll: 0,
  };
  const simulator = service({ simulate: async () => simulated });
  const edition = { id: 'event', seriesId: 'series', name: 'Event', season: 2026, half: 1 as const, calendarOrder: 1, tier: 'T1' as const, honorClass: 'LARGE' as const, node: 'MAIN_EVENT' as const, simulationMode: 'FAST' as const, teamId: 'career-team', qualificationSource: 'DIRECT_VRS' as const, vrsSnapshotId: 'snapshot', snapshotRank: 4, rosterLockCareerHalf: 1, targetEditionId: null, format: 'BO3' as const };
  const result = await simulator.simulate({ edition, context: { editionId: 'event', baseTeamStrength: 80, baseOpponentStrength: { opponent: 70 }, interventions: [], upsetRoll: 0 } });
  assert.equal(result.seriesDetails?.[0]?.mapScores[0], '2:1（累计回合 26:21）');
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
