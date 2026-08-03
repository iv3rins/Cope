import type {
  Top20Candidate,
  Top20Metrics,
  Top20Ranking,
  Top20RankingService,
  Top20Rules,
  Top20SeasonEvidence,
  Top20TournamentEvidence,
} from './top20';

/** Deterministic APS calculator. No runtime state or random source is consulted. */
export class Top20RankingServiceImpl implements Top20RankingService {
  public async calculate(input: { readonly season: number; readonly rules: Top20Rules; readonly evidence: readonly Top20SeasonEvidence[] }): Promise<Top20Ranking> {
    const candidates = input.evidence
      .filter((entry) => entry.season === input.season)
      .map((evidence) => ({ identity: this.copy(evidence.player), evidence: this.copy(evidence), metrics: this.calculateMetrics(evidence, input.rules) }))
      .filter((candidate) => candidate.metrics.eligible)
      .sort((left, right) => this.compareCandidates(left, right));

    const entries = candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    return {
      season: input.season,
      rulesVersion: input.rules.version,
      entries,
      careerPlayerRank: entries.find((entry) => entry.identity.careerPlayer)?.rank ?? null,
    };
  }

  private calculateMetrics(evidence: Top20SeasonEvidence, rules: Top20Rules): Top20Metrics {
    const tournaments = evidence.tournaments.filter((event) => this.isRankedEvent(event));
    const t1MajorMaps = tournaments.reduce((total, event) => total + this.nonNegative(event.maps), 0);
    const maps = t1MajorMaps;
    const weighted = (selector: (event: Top20TournamentEvidence) => number | null | undefined, fallback = 0): number => {
      if (maps === 0) return fallback;
      return tournaments.reduce((total, event) => total + this.nonNegative(event.maps) * this.finiteOr(selector(event), fallback), 0) / maps;
    };
    const annualRating = weighted((event) => event.rating, 0);
    const playoffMaps = tournaments.reduce((total, event) => total + this.nonNegative(event.playoffMaps), 0);
    const top5Maps = tournaments.reduce((total, event) => total + this.nonNegative(event.top5Maps), 0);
    const finalMaps = tournaments.reduce((total, event) => total + this.nonNegative(event.finalMaps), 0);
    const playoffRating = this.weightedRating(tournaments, 'playoffMaps', 'playoffRating', playoffMaps);
    const top5Rating = this.weightedRating(tournaments, 'top5Maps', 'top5Rating', top5Maps);
    const finalRating = finalMaps > 0 ? this.weightedRating(tournaments, 'finalMaps', 'finalRating', finalMaps) : null;
    const adr = weighted((event) => event.adr, 0);
    const honorsScore = tournaments.reduce((total, event) => total + event.honors.reduce((honors, honor) => {
      const base = rules.honorBaseScore[honor.type] ?? 0;
      const multiplier = rules.honorClassMultiplier[honor.honorClass] ?? 0;
      return honors + this.finiteOr(base, 0) * this.finiteOr(multiplier, 0);
    }, 0), 0);
    const panelScore = tournaments.reduce((total, event) => total + (event.majorPlayoffChoke ? -0.05 : 0), 0);
    const eligible = t1MajorMaps >= rules.minimumT1MajorMaps;

    // APS rewards volume-weighted rating, high-pressure performance, honors, and penalizes major playoff chokes.
    const aps = eligible
      ? annualRating * 100 + playoffRating * 15 + top5Rating * 10 + (finalRating ?? 0) * 8 + adr * 0.1 + honorsScore + panelScore * 100
      : 0;
    return {
      eligible,
      t1MajorMaps,
      annualRating,
      overallRating: annualRating,
      adr,
      playoffRating,
      top5Rating,
      finalRating,
      honorsScore,
      panelScore,
      aps,
    };
  }

  private compareCandidates(left: Top20Candidate, right: Top20Candidate): number {
    return right.metrics.aps - left.metrics.aps
      || right.metrics.annualRating - left.metrics.annualRating
      || right.metrics.honorsScore - left.metrics.honorsScore
      || left.identity.playerId.localeCompare(right.identity.playerId);
  }

  private isRankedEvent(event: Top20TournamentEvidence): boolean {
    return event.tier === 'T1' || event.tier === 'MAJOR';
  }

  private weightedRating(
    tournaments: readonly Top20TournamentEvidence[],
    mapsKey: 'playoffMaps' | 'top5Maps' | 'finalMaps',
    ratingKey: 'playoffRating' | 'top5Rating' | 'finalRating',
    maps: number,
  ): number {
    if (maps === 0) return 0;
    return tournaments.reduce((total, event) => total + this.nonNegative(event[mapsKey]) * this.finiteOr(event[ratingKey], 0), 0) / maps;
  }

  private nonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private finiteOr(value: number | null | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
