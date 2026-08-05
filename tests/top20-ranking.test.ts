import assert from 'node:assert/strict';
import test from 'node:test';
import { Top20RankingServiceImpl } from '../src/hltv/top20-ranking-service-impl';
import type { Top20Rules, Top20SeasonEvidence } from '../src/hltv/top20';

const rules: Top20Rules = {
  version: 'test-fact-driven',
  minimumT1MajorMaps: 40,
  honorBaseScore: { MVP: 800, EVP: 320, VP: 96 },
  honorClassMultiplier: { NONE: 0.25, MEDIUM: 0.7, LARGE: 1, ELITE: 1.1, SUPER_ELITE: 1.3, MAJOR: 1.5 },
  panelWeights: { baseData: 0.25, honors: 0.25, pressure: 0.3, stability: 0.1, teamAchievement: 0.1 },
  pressureCoefficients: { playoffRating: 1200, top5Rating: 1300, finalRating: 350 },
};

function evidence(playerId: string, rating: number, playoffRating: number, top5Rating: number): Top20SeasonEvidence {
  return {
    season: 2026,
    player: { playerId, nickname: playerId, countryCode: 'EU', teamName: 'Team', careerPlayer: false, source: 'REAL' },
    tournaments: [{
      eventId: 'major-2026', eventName: 'Major 2026', tier: 'MAJOR', maps: 80, rating, adr: Math.min(95, 70 + (rating - 1) * 50), kast: 70,
      playoffMaps: 24, playoffRating, top5Maps: 30, top5Rating, finalMaps: 5, finalRating: playoffRating,
      title: false, honors: [], majorPlayoffChoke: false,
    }],
  };
}

test('TOP20 panel demotes inflated regular-season stats when playoff and top-five evidence is weak', async () => {
  const ranking = await new Top20RankingServiceImpl().calculate({
    season: 2026,
    rules,
    evidence: [evidence('farmer', 1.3, 0.98, 0.94), evidence('pressure-player', 1.22, 1.3, 1.27)],
  });
  assert.equal(ranking.entries[0]?.identity.playerId, 'pressure-player');
  assert.ok((ranking.entries[0]?.metrics.aps ?? 0) > (ranking.entries[1]?.metrics.aps ?? 0));
});

test('players below the minimum advanced-map threshold cannot fill a TOP20 slot', async () => {
  const shortSample = evidence('short-sample', 1.35, 1.35, 1.35);
  const ranking = await new Top20RankingServiceImpl().calculate({
    season: 2026,
    rules,
    evidence: [{ ...shortSample, tournaments: [{ ...shortSample.tournaments[0]!, maps: 20 }] }],
  });
  assert.deepEqual(ranking.entries, []);
});

test('Major MVP outweighs at least three medium-event MVPs through honor-class weighting', async () => {
  const service = new Top20RankingServiceImpl();
  const major = evidence('major-mvp', 1.2, 1.22, 1.2);
  const medium = evidence('medium-mvps', 1.2, 1.22, 1.2);
  const withMajor = { ...major, tournaments: [{ ...major.tournaments[0]!, honors: [{ type: 'MVP' as const, honorClass: 'MAJOR' as const, eventId: 'major-2026', eventName: 'Major 2026', tier: 'MAJOR' as const }] }] };
  const withMedium = { ...medium, tournaments: [{ ...medium.tournaments[0]!, honors: Array.from({ length: 3 }, (_, index) => ({ type: 'MVP' as const, honorClass: 'MEDIUM' as const, eventId: `medium-${index}`, eventName: `Medium ${index}`, tier: 'T1' as const })) }] };
  const ranking = await service.calculate({ season: 2026, rules, evidence: [withMedium, withMajor] });
  assert.equal(ranking.entries[0]?.identity.playerId, 'major-mvp');
});
