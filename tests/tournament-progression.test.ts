import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchSimulationServiceImpl } from '../src/hltv/match-simulation-service-impl';
import { TournamentServiceImpl } from '../src/hltv/tournament-service-impl';
import type { TournamentEdition, TournamentSimulationContext } from '../src/hltv/tournament';

const clock = { now: () => '2026-06-01T00:00:00.000Z' };
const random = { next: () => 0.42 };
const roster = [
  { playerId: 'career-player', role: 'AWPER', active: true },
  { playerId: 'teammate-2', role: 'AWPER', active: true },
  { playerId: 'teammate-3', role: 'ENTRY_FRAGGER', active: true },
  { playerId: 'teammate-4', role: 'SUPPORT', active: true },
  { playerId: 'teammate-5', role: 'IGL', active: true },
] as const;

function edition(tier: TournamentEdition['tier']): TournamentEdition {
  return {
    id: `${tier.toLowerCase()}-2026-team`,
    seriesId: `${tier.toLowerCase()}-series`,
    name: `${tier} Event`,
    season: 2026,
    half: 1,
    calendarOrder: 1,
    tier,
    honorClass: tier === 'MAJOR' ? 'MAJOR' : 'ELITE',
    node: 'MAIN_EVENT',
    simulationMode: tier === 'MAJOR' ? 'SWISS' : 'FAST',
    teamId: 'career-team',
    qualificationSource: 'DIRECT_VRS',
    vrsSnapshotId: 'snapshot-1',
    snapshotRank: 4,
    rosterLockCareerHalf: 1,
    targetEditionId: null,
    format: 'BO3',
    prizePool: 1_000_000,
  };
}

function context(value: TournamentEdition): TournamentSimulationContext {
  return {
    editionId: value.id,
    baseTeamStrength: 78,
    baseOpponentStrength: { opponent: 80, 'opponent-2': 82, 'opponent-3': 84, 'opponent-4': 86, 'opponent-5': 88 },
    interventions: [],
    upsetRoll: 0.31,
  };
}

function service(): TournamentServiceImpl {
  return new TournamentServiceImpl({ playerId: 'career-player', clock, random, matches: new MatchSimulationServiceImpl() });
}

test('Fast mode exposes lifecycle hooks and emits uniform match facts', async () => {
  const tournament = edition('T1');
  const simulator = service();
  const started = await simulator.start({ edition: tournament, context: context(tournament), roster });
  assert.equal(started.lifecycleHook, 'PRE_TOURNAMENT');
  assert.ok(started.state);

  const inTournament = await simulator.advance({ edition: tournament, context: context(tournament), roster, state: started.state });
  assert.equal(inTournament.lifecycleHook, 'IN_TOURNAMENT');
  assert.ok(inTournament.state);

  const completed = await simulator.advance({ edition: tournament, context: context(tournament), roster, state: inTournament.state });
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.lifecycleHook, 'POST_TOURNAMENT');
  assert.ok((completed.result?.matchResults.length ?? 0) >= 1 && (completed.result?.matchResults.length ?? 0) <= 3);
  assert.ok(completed.result?.matchResults.every((match) => match.playerPerformances.length === 10));
  assert.ok(completed.result?.playerPerformances.every((performance) => performance.rating <= 1.35 && (performance.adr ?? 0) <= 95));
  assert.equal(completed.result?.teamPrizeMoney, completed.result?.prizeMoney);
  assert.equal(completed.result?.playerPrizeIncome, undefined);
  assert.ok(completed.result?.matchResults.some((match) => Object.values(match.resourceConflictPenalties).some((penalty) => penalty > 0.01)));
  const placements = completed.result?.teamPlacements ?? [];
  assert.ok(placements.length >= 2);
  const hasFinal = completed.result?.matchResults.some((match) => match.stage === 'FINAL') ?? false;
  assert.equal(placements.filter((entry) => entry.title).length, hasFinal ? 1 : 0);
  const inheritedRoster = placements.find((entry) => entry.teamId === tournament.teamId)?.rosterPlayerIds ?? [];
  assert.deepEqual([...inheritedRoster].sort(), roster.map((slot) => slot.playerId).sort());
  const mvps = completed.result?.honors.filter((honor) => honor.type === 'MVP') ?? [];
  assert.ok(mvps.length <= 1);
  if (mvps[0]) {
    const performance = completed.result?.playerPerformances.find((entry) => entry.playerId === mvps[0]?.playerId);
    const mvpPlacement = placements.find((entry) => entry.teamId === performance?.teamId)?.placement;
    assert.ok(mvpPlacement === 'CHAMPION' || (mvpPlacement === 'RUNNER_UP' && (performance?.rating ?? 0) >= 1.25));
  }
});

test('Major progression remains opaque and advances qualified teams into playoffs', async () => {
  const tournament = edition('MAJOR');
  const simulator = service();
  let progress = await simulator.start({ edition: tournament, context: context(tournament), roster });
  let advances = 0;
  while (progress.status === 'ONGOING') {
    assert.ok(progress.state);
    assert.equal(progress.state.mode, 'SWISS');
    progress = await simulator.advance({ edition: tournament, context: context(tournament), roster, state: progress.state });
    advances += 1;
    assert.ok(advances <= 8);
  }
  assert.equal(progress.status, 'COMPLETED');
  assert.ok(progress.result);
  assert.ok(progress.result.matchResults.length >= 3 && progress.result.matchResults.length <= 7);
  const swissMatches = progress.result.matchResults.filter((match) => match.stage === 'SWISS');
  assert.ok(swissMatches.length >= 3 && swissMatches.length <= 5);
  if (progress.uiData.qualified) assert.ok(progress.result.matchResults.some((match) => match.stage === 'PLAYOFF'));
  assert.ok(progress.result.honors.filter((honor) => honor.type === 'MVP').length <= 1);
});

test('team-strength interventions affect the shared match simulation path', async () => {
  const tournament = edition('T1');
  const base = context(tournament);
  const simulator = service();
  const normal = await simulator.simulate({ edition: tournament, context: base });
  const boosted = await service().simulate({ edition: tournament, context: { ...base, interventions: [{ id: 'boost', editionId: tournament.id, sourceStoryEventId: 'story', sourceOptionId: 'option', type: 'TEAM_STRENGTH', delta: 20, occurredAt: clock.now(), description: 'boost' }] } });
  const normalRating = normal.playerPerformances.find((item) => item.playerId === 'career-player')?.rating ?? 0;
  const boostedRating = boosted.playerPerformances.find((item) => item.playerId === 'career-player')?.rating ?? 0;
  assert.ok(boostedRating > normalRating);
  assert.deepEqual(boosted.consumedInterventions.map((item) => item.id), ['boost']);
});

test('an eliminated team does not continue into later Fast stages', async () => {
  const tournament = edition('T1');
  const weakContext = { ...context(tournament), baseTeamStrength: 40, baseOpponentStrength: { opponent: 95 } };
  const result = await service().simulate({ edition: tournament, context: weakContext });
  assert.equal(result.matchResults.length, 1);
  assert.equal(result.matchResults[0]?.stage, 'GROUP');
  assert.equal(result.teamPlacements.filter((entry) => entry.title).length, 0);
  assert.equal(result.honors.some((honor) => honor.type === 'MVP'), false);
  assert.equal(result.teamPlacements.find((entry) => entry.teamId === tournament.teamId)?.placement, 'GROUP_EXIT');
});

test('真实 FINAL 才产生唯一冠军与 MVP', async () => {
  const tournament = edition('T1');
  const forced = { ...context(tournament), baseTeamStrength: 40, baseOpponentStrength: { opponent: 95 }, interventions: [{ id: 'force-run', editionId: tournament.id, sourceStoryEventId: 'story', sourceOptionId: 'win', type: 'FORCE_UPSET' as const, forceUpset: true, occurredAt: clock.now(), description: 'force final run' }] };
  const result = await service().simulate({ edition: tournament, context: forced });
  assert.ok(result.matchResults.some((match) => match.stage === 'FINAL'));
  assert.equal(result.teamPlacements.filter((entry) => entry.title).length, 1);
  assert.equal(result.teamPlacements.find((entry) => entry.title)?.placement, 'CHAMPION');
  assert.equal(result.honors.filter((honor) => honor.type === 'MVP').length, 1);
});

test('inactive substitutes inherit the settled team placement without receiving fabricated performance', async () => {
  const tournament = edition('T1');
  const rosterWithSubstitute = [...roster, { playerId: 'substitute-6', role: 'SUPPORT', active: false }] as const;
  const simulator = service();
  let progress = await simulator.start({ edition: tournament, context: context(tournament), roster: rosterWithSubstitute });
  while (progress.status === 'ONGOING' && progress.state) progress = await simulator.advance({ edition: tournament, context: context(tournament), roster: rosterWithSubstitute, state: progress.state });
  const placement = progress.result?.teamPlacements.find((entry) => entry.teamId === tournament.teamId);
  assert.ok(placement?.rosterPlayerIds.includes('substitute-6'));
  assert.equal(progress.result?.playerPerformances.some((entry) => entry.playerId === 'substitute-6'), false);
});

test('T2 events do not emit advanced honors', async () => {
  const tournament = edition('T2');
  const result = await service().simulate({ edition: tournament, context: context(tournament) });
  assert.deepEqual(result.honors, []);
  assert.ok(result.playerPerformances.every((performance) => performance.honor === null));
});
