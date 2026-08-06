import type { HltvPlayerId } from './team';
import type { HonorClass, HonorType, TournamentTier } from './tournament';

/** TOP20 只依赖已完赛证据；不得直接读取 VRS、赛事模拟器或 Engine 状态。 */
export interface Top20PlayerIdentity {
  readonly playerId: HltvPlayerId;
  readonly nickname: string;
  readonly countryCode: string;
  readonly teamName: string;
  readonly careerPlayer: boolean;
  readonly source?: 'REAL' | 'VIRTUAL' | 'CAREER';
}

export interface Top20HonorEvidence {
  readonly type: HonorType;
  readonly honorClass: HonorClass;
  readonly eventId: string;
  readonly eventName: string;
  readonly tier: TournamentTier;
}

export interface Top20TournamentEvidence {
  readonly eventId: string;
  readonly eventName: string;
  readonly tier: TournamentTier;
  readonly maps: number;
  readonly rating: number;
  readonly adr?: number;
  readonly kast?: number;
  readonly playoffMaps: number;
  readonly playoffRating: number;
  readonly top5Maps: number;
  readonly top5Rating: number;
  readonly finalMaps: number;
  readonly finalRating: number | null;
  readonly title: boolean;
  readonly honors: readonly Top20HonorEvidence[];
  readonly majorPlayoffChoke: boolean;
}

export interface Top20SeasonEvidence {
  readonly season: number;
  readonly player: Top20PlayerIdentity;
  readonly tournaments: readonly Top20TournamentEvidence[];
}

export interface Top20Rules {
  readonly version: string;
  readonly minimumT1MajorMaps: number;
  readonly honorBaseScore: Readonly<Record<HonorType, number>>;
  readonly honorClassMultiplier: Readonly<Record<HonorClass, number>>;
  readonly panelWeights?: {
    readonly baseData: number;
    readonly honors: number;
    readonly pressure: number;
    readonly stability: number;
    readonly teamAchievement: number;
  };
  readonly pressureCoefficients?: {
    readonly playoffRating: number;
    readonly top5Rating: number;
    readonly finalRating: number;
  };
}

export interface Top20Metrics {
  readonly eligible: boolean;
  readonly t1MajorMaps: number;
  readonly annualRating: number;
  readonly overallRating: number;
  readonly adr: number;
  readonly kast: number;
  readonly playoffRating: number;
  readonly top5Rating: number;
  readonly finalRating: number | null;
  readonly honorsScore: number;
  readonly panelScore: number;
  readonly aps: number;
  readonly eliteMvpBonus: number;
  readonly pressureBonus: number;
  readonly disasterPenalty: number;
  readonly mvp: number;
  readonly evp: number;
  readonly vp: number;
  readonly highMvpEvp: number;
  readonly highEvp: number;
  readonly majorSuperEliteEvp: number;
  readonly hasTopMvp: boolean;
}

export interface Top20Candidate {
  readonly identity: Top20PlayerIdentity;
  readonly evidence: Top20SeasonEvidence;
  readonly metrics: Top20Metrics;
}

export interface Top20RankedEntry extends Top20Candidate {
  readonly rank: number;
  /** true when the candidate filled a slot without meeting that slot's threshold. */
  readonly thresholdFallback: boolean;
  /** 数据驱动的评语（可选）；由组合根按排名/荣誉/表现特征匹配后附加。 */
  readonly quote?: import('./top20-quotes').Top20QuoteMatch;
}

export interface Top20Ranking {
  readonly season: number;
  readonly rulesVersion: string;
  readonly entries: readonly Top20RankedEntry[];
  readonly careerPlayerRank: number | null;
}

/** Static identity used to construct annual NPC evidence. */
export interface Top20IdentityRecord {
  readonly playerId: HltvPlayerId;
  readonly nickname: string;
  readonly realName?: string;
  readonly countryCode: string;
  readonly placement?: number;
  readonly teamName?: string;
  readonly teamId?: string;
  readonly teamTier?: 'T1' | 'T2' | 'T3';
  /** Stable career inputs for annual simulation; absent values use source-aware defaults. */
  readonly birthYear?: number;
  readonly careerStartYear?: number;
  readonly potential?: number;
  readonly source: 'REAL' | 'VIRTUAL';
}

/** 将赛事事实转换为 TOP20 证据的只读投影。 */
export interface Top20EvidenceRepository {
  findSeasonEvidence(season: number): Promise<readonly Top20SeasonEvidence[]>;
}

/** TOP20 算法端口。实现可以是规则引擎、脚本或远程计算服务。 */
export interface Top20RankingService {
  calculate(input: { readonly season: number; readonly rules: Top20Rules; readonly evidence: readonly Top20SeasonEvidence[] }): Promise<Top20Ranking>;
}
