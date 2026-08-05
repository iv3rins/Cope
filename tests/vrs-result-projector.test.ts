import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchSimulationResult } from '../src/hltv/match';
import type { TournamentResult, TournamentTier } from '../src/hltv/tournament';
import { VrsResultProjector } from '../src/hltv/vrs-result-projector';

const rules = {
  rulesVersion: 'test-v1',
  winPointsByTier: { MAJOR: 36, T1: 24, T2: 14, QUALIFIER: 6, UNRANKED: 3 } satisfies Record<TournamentTier, number>,
  lossMultiplier: 0.35,
  upsetRankPointFactor: 0.4,
  maximumUpsetBonus: 20,
};

function result(tier: TournamentTier, editionId = `${tier}-event`): TournamentResult {
  const match: MatchSimulationResult = {
    matchId: `${editionId}-match`, stage: 'GROUP', winnerTeamId: `${tier}-winner`, loserTeamId: `${tier}-loser`,
    scores: [{ teamId: `${tier}-winner`, mapsWon: 2, roundsWon: 26 }, { teamId: `${tier}-loser`, mapsWon: 0, roundsWon: 12 }],
    mapsPlayed: ['Mirage', 'Nuke'], playerPerformances: [], teamRanks: { [`${tier}-winner`]: 40, [`${tier}-loser`]: 10 }, resourceConflictPenalties: {}, upset: true, randomRoll: 0,
  };
  return { editionId, seriesId: editionId, season: 2026, eventName: editionId, teamId: `${tier}-winner`, tier, honorClass: 'MEDIUM', placement: 'CHAMPION', title: true, qualificationSource: 'DIRECT_VRS', vrsSnapshotId: 'snapshot', upset: { occurred: true, chance: 0.2, roll: 0, forcedByInterventionId: null, contributingInterventionIds: [] }, consumedInterventions: [], matchResults: [match], teamPlacements: [], playerPerformances: [], honors: [] };
}

test('T1/T2/预选赛事逐场更新胜负双方的动态 VRS 积分', () => {
  const projector = new VrsResultProjector(rules);
  let state: import('../src/hltv/vrs-result-projector').VrsResultProjectionState = { pointsByTeam: {}, appliedResultIds: [] };
  for (const tier of ['T1', 'T2', 'QUALIFIER'] as const) state = projector.apply(state, result(tier));
  assert.ok(state.pointsByTeam['T1-winner']! > state.pointsByTeam['T2-winner']!);
  assert.ok(state.pointsByTeam['T2-winner']! > state.pointsByTeam['QUALIFIER-winner']!);
  for (const tier of ['T1', 'T2', 'QUALIFIER'] as const) {
    assert.ok(state.pointsByTeam[`${tier}-winner`]! > 0);
    assert.ok(state.pointsByTeam[`${tier}-loser`]! < 0);
  }
});

test('同一赛事结果重复投影保持幂等', () => {
  const projector = new VrsResultProjector(rules);
  const first = projector.apply({ pointsByTeam: {}, appliedResultIds: [] }, result('T1'));
  assert.deepEqual(projector.apply(first, result('T1')), first);
});

test('爆冷奖励有上限且排名缺失时仍安全投影', () => {
  const projector = new VrsResultProjector(rules);
  const ranked = projector.apply({ pointsByTeam: {}, appliedResultIds: [] }, result('T2', 'ranked'));
  const missingRanks = { ...result('T2', 'missing'), matchResults: result('T2', 'missing').matchResults.map((match) => ({ ...match, teamRanks: { [match.winnerTeamId]: null, [match.loserTeamId]: null } })) };
  const plain = projector.apply({ pointsByTeam: {}, appliedResultIds: [] }, missingRanks);
  assert.equal(ranked.pointsByTeam['T2-winner'], rules.winPointsByTier.T2 + Math.min(rules.maximumUpsetBonus, 30 * rules.upsetRankPointFactor));
  assert.equal(plain.pointsByTeam['T2-winner'], rules.winPointsByTier.T2);
});
