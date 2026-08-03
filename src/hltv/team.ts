/**
 * HLTV 战队上下文接口。
 * 本文件只定义战队、阵容和排名数据的形状；数据可以来自本地 JSON、数据库或远程抓取器。
 */

export type HltvTeamId = string;
export type HltvPlayerId = string;
export type CompetitionRegion = 'EUROPE' | 'AMERICAS' | 'ASIA' | 'OCEANIA' | 'MIDDLE_EAST' | 'AFRICA';
export type TeamTier = 'T1' | 'T2' | 'T3';
export type RankingSource = 'HLTV' | 'VRS' | 'MANUAL' | 'SIMULATION';

/** 不保存绝对 URL，资源如何映射由实现层负责。 */
export interface TeamLogo {
  readonly assetId: string;
  readonly relativePath: string;
  readonly alt: string;
}

/** 战队静态身份信息。 */
export interface HltvTeam {
  readonly id: HltvTeamId;
  readonly name: string;
  readonly shortName?: string;
  readonly countryCode?: string;
  readonly region: CompetitionRegion;
  readonly tier: TeamTier;
  readonly active: boolean;
  readonly logo?: TeamLogo;
}

/** 一个选手在战队阵容中的席位。 */
export interface TeamRosterSlot {
  readonly playerId: HltvPlayerId;
  readonly role: string;
  readonly active: boolean;
  readonly joinedAt?: string;
  readonly leftAt?: string;
}

/** 某一时点的 VRS 排名记录。 */
export interface VrsRankingEntry {
  readonly teamId: HltvTeamId;
  readonly rank: number;
  readonly points: number;
  readonly source: RankingSource;
  readonly observedAt: string;
}

export interface VrsRanking {
  readonly id: string;
  readonly rulesVersion: string;
  readonly observedAt: string;
  readonly entries: readonly VrsRankingEntry[];
}

/** 赛事邀请使用的冻结排名，创建后不得因实时 VRS 波动而改变。 */
export interface VrsInviteSnapshot {
  readonly id: string;
  readonly season: number;
  readonly half: 1 | 2;
  readonly frozenAt: string;
  readonly sourceRankingId: string;
  readonly rulesVersion: string;
  readonly entries: readonly VrsInviteSnapshotEntry[];
}

export interface VrsInviteSnapshotEntry extends VrsRankingEntry {
  readonly snapshotRank: number;
}

/** 战队读取端口。实现可对接 assets、数据库或 HLTV 数据抓取层。 */
export interface HltvTeamRepository {
  findById(teamId: HltvTeamId): Promise<HltvTeam | null>;
  findActive(): Promise<readonly HltvTeam[]>;
  findRoster(teamId: HltvTeamId, at: string): Promise<readonly TeamRosterSlot[]>;
}

/** 实时 VRS 数据源端口。 */
export interface VrsRankingProvider {
  getCurrent(): Promise<VrsRanking>;
}

/** 邀请快照持久化端口。 */
export interface VrsSnapshotRepository {
  findById(snapshotId: string): Promise<VrsInviteSnapshot | null>;
  save(snapshot: VrsInviteSnapshot): Promise<void>;
}
