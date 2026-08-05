import type { TournamentResult, TournamentTier } from './tournament';

export interface VrsResultProjectionRules {
  readonly rulesVersion: string;
  readonly winPointsByTier: Readonly<Record<TournamentTier, number>>;
  readonly lossMultiplier: number;
  readonly upsetRankPointFactor: number;
  readonly maximumUpsetBonus: number;
}

export interface VrsResultProjectionState {
  readonly pointsByTeam: Readonly<Record<string, number>>;
  readonly appliedResultIds: readonly string[];
}

export class VrsResultProjector {
  public constructor(private readonly rules: VrsResultProjectionRules) {}

  public apply(state: VrsResultProjectionState, result: TournamentResult): VrsResultProjectionState {
    if (state.appliedResultIds.includes(result.editionId)) return state;
    const pointsByTeam = { ...state.pointsByTeam };
    const baseWinPoints = this.rules.winPointsByTier[result.tier] ?? 0;
    for (const match of result.matchResults) {
      const winnerRank = match.teamRanks[match.winnerTeamId];
      const loserRank = match.teamRanks[match.loserTeamId];
      const upsetGap = winnerRank !== null && winnerRank !== undefined && loserRank !== null && loserRank !== undefined
        ? Math.max(0, winnerRank - loserRank)
        : 0;
      const upsetBonus = Math.min(this.rules.maximumUpsetBonus, upsetGap * this.rules.upsetRankPointFactor);
      pointsByTeam[match.winnerTeamId] = this.round((pointsByTeam[match.winnerTeamId] ?? 0) + baseWinPoints + upsetBonus);
      pointsByTeam[match.loserTeamId] = this.round((pointsByTeam[match.loserTeamId] ?? 0) - baseWinPoints * this.rules.lossMultiplier);
    }
    return { pointsByTeam, appliedResultIds: [...state.appliedResultIds, result.editionId] };
  }

  public get rulesVersion(): string { return this.rules.rulesVersion; }

  private round(value: number): number { return Math.round(value * 100) / 100; }
}
