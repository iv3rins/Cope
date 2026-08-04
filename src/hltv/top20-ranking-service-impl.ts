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
      .sort((left, right) => this.compareCandidates(left, right));

    const remaining = [...candidates];
    const entries = [];
    for (let rank = 1; rank <= 20 && remaining.length > 0; rank += 1) {
      const thresholdIndex = remaining.findIndex((candidate) => this.qualifiesForRank(candidate, rank));
      const index = thresholdIndex >= 0 ? thresholdIndex : 0;
      const candidate = remaining.splice(index, 1)[0];
      if (candidate) entries.push({ ...candidate, rank, thresholdFallback: thresholdIndex < 0 });
    }
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
    const panelScore = Math.max(0, (annualRating - 1) * 300 + (adr - 70) * 2);
    const majorMvpBonus = tournaments.reduce((total, event) => total + event.honors.reduce((bonus, honor) => {
      if (honor.type !== 'MVP') return bonus;
      return bonus + (honor.honorClass === 'MAJOR' ? 3500 : honor.honorClass === 'SUPER_ELITE' ? 2200 : 0);
    }, 0), 0);
    const majorPlayoffChoke = tournaments.some((event) => event.tier === 'MAJOR' && event.majorPlayoffChoke);
    const eligible = t1MajorMaps >= rules.minimumT1MajorMaps;
    const highHonors = tournaments.flatMap((event) => event.honors).filter((honor) => ['ELITE', 'SUPER_ELITE', 'MAJOR'].includes(honor.honorClass));
    const mvp = tournaments.flatMap((event) => event.honors).filter((honor) => honor.type === 'MVP').length;
    const evp = tournaments.flatMap((event) => event.honors).filter((honor) => honor.type === 'EVP').length;
    const vp = tournaments.flatMap((event) => event.honors).filter((honor) => honor.type === 'VP').length;
    const highMvpEvp = highHonors.filter((honor) => honor.type === 'MVP' || honor.type === 'EVP').length;
    const highEvp = highHonors.filter((honor) => honor.type === 'EVP').length;
    const majorSuperEliteEvp = highHonors.filter((honor) => honor.type === 'EVP' && ['SUPER_ELITE', 'MAJOR'].includes(honor.honorClass)).length;
    const hasTopMvp = tournaments.some((event) => event.honors.some((honor) => honor.type === 'MVP' && ['SUPER_ELITE', 'MAJOR'].includes(honor.honorClass)));
    const pressureBonus = (playoffRating >= 1.2 ? 0.08 : 0) + (top5Rating >= 1.15 ? 0.05 : 0);
    const disasterPenalty = (majorPlayoffChoke ? 0.15 : 0) + (top5Maps > 0 && top5Rating < 0.95 ? 0.1 : 0) + (finalRating !== null && finalRating < 0.9 ? 0.1 : 0);

    // APS follows the reference model: honors + panel score + elite MVP bonuses, adjusted by pressure evidence.
    // HLTV-style selection uses the sample-size rule as an eligibility gate, then ranks
    // eligible players by the full-season evidence. Keep the score visible for ineligible
    // players so the report can explain why they missed the list without flattening their data.
    const apsBase = honorsScore + panelScore + majorMvpBonus;
    const aps = Math.max(0, apsBase * (1 + pressureBonus - disasterPenalty));
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
      eliteMvpBonus: majorMvpBonus,
      pressureBonus,
      disasterPenalty,
      aps,
      mvp,
      evp,
      vp,
      highMvpEvp,
      highEvp,
      majorSuperEliteEvp,
      hasTopMvp,
    };
  }

  private qualifiesForRank(candidate: Top20Candidate, rank: number): boolean {
    const metrics = candidate.metrics;
    if (!metrics.eligible) return false;
    if (rank === 1) return metrics.aps >= 4500 && metrics.annualRating >= 1.3 && metrics.hasTopMvp === true && metrics.playoffRating >= metrics.annualRating && metrics.top5Rating >= 1.15;
    if (rank <= 3) return metrics.aps >= 3500 && metrics.annualRating >= 1.25 && (metrics.highMvpEvp ?? 0) >= 2;
    if (rank <= 5) return metrics.aps >= 2800 && metrics.annualRating >= 1.2 && (metrics.highEvp ?? 0) >= 4 && (metrics.majorSuperEliteEvp ?? 0) >= 1;
    if (rank <= 10) return metrics.aps >= 2000 && metrics.annualRating >= 1.15 && (metrics.highMvpEvp ?? 0) >= 3;
    const edgeAudit = Number((metrics.evp ?? 0) >= 2) + Number((metrics.vp ?? 0) >= 5) + Number(metrics.playoffRating >= 1.05) >= 2;
    if (rank <= 15) return metrics.aps >= 1500 && metrics.annualRating >= 1.12 && (metrics.highMvpEvp ?? 0) >= 1 && edgeAudit;
    return metrics.aps >= 1200 && metrics.annualRating >= 1.1 && ((metrics.highMvpEvp ?? 0) >= 1 || metrics.t1MajorMaps >= 80) && edgeAudit;
  }

  private compareCandidates(left: Top20Candidate, right: Top20Candidate): number {
    return Number(right.metrics.eligible) - Number(left.metrics.eligible)
      || right.metrics.aps - left.metrics.aps
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
