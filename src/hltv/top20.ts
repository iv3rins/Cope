import type { HltvPlayerId } from './team';
import type { HonorClass, HonorType, TournamentTier } from './tournament';

/** TOP20 只依赖已完赛证据；不得直接读取 VRS、赛事模拟器或 Engine 状态。 */
export interface Top20PlayerIdentity {
  readonly playerId: HltvPlayerId;
  readonly nickname: string;
  readonly countryCode: string;
  readonly teamName: string;
  readonly careerPlayer: boolean;
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
}

export interface Top20Metrics {
  readonly eligible: boolean;
  readonly t1MajorMaps: number;
  readonly annualRating: number;
  readonly overallRating: number;
  readonly adr: number;
  readonly playoffRating: number;
  readonly top5Rating: number;
  readonly finalRating: number | null;
  readonly honorsScore: number;
  readonly panelScore: number;
  readonly aps: number;
}

export interface Top20Candidate {
  readonly identity: Top20PlayerIdentity;
  readonly evidence: Top20SeasonEvidence;
  readonly metrics: Top20Metrics;
}

export interface Top20RankedEntry extends Top20Candidate {
  readonly rank: number;
}

export interface Top20Ranking {
  readonly season: number;
  readonly rulesVersion: string;
  readonly entries: readonly Top20RankedEntry[];
  readonly careerPlayerRank: number | null;
}

/** 将赛事事实转换为 TOP20 证据的只读投影。 */
export interface Top20EvidenceRepository {
  findSeasonEvidence(season: number): Promise<readonly Top20SeasonEvidence[]>;
}

/** TOP20 算法端口。实现可以是规则引擎、脚本或远程计算服务。 */
export interface Top20RankingService {
  calculate(input: { readonly season: number; readonly rules: Top20Rules; readonly evidence: readonly Top20SeasonEvidence[] }): Promise<Top20Ranking>;
}
