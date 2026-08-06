import type { PlayerProfile } from './profile';

/** 前端可识别的赛事主办方标识，用于匹配 assets/events 下的赛事图标。 */
export type TournamentOrganizerId =
  | 'BLAST'
  | 'ESL_T1'
  | 'PGL_T1'
  | 'PW_T1'
  | 'IEM_COLOGNE'
  | 'IEM_KATOWICE'
  | 'OTHER';

/** 退役档案中允许展示奖杯的赛事级别；T2 不产生奖杯记录。 */
export type CareerTournamentLevel = 'T1' | 'MAJOR' | 'T2';
export type CareerPlacement = 'CHAMPION' | 'RUNNER_UP' | 'SEMIFINAL' | 'QUARTERFINAL' | 'PLAYOFF' | 'GROUP_EXIT' | 'QUALIFIER_EXIT';
export type MvpLevel = 'MAJOR' | 'NORMAL' | null;

/**
 * 玩家参加过的单届赛事归档。
 * 该记录是退役总结和 TOP20 证据的稳定来源，不应在展示层重新解析赛事名称。
 */
export interface CareerTournamentRecord {
  readonly editionId: string;
  readonly year: number;
  /** 标准全称，例如 "IEM Cologne 2026"。 */
  readonly fullName: string;
  /** 前端赛事图标匹配标识。 */
  readonly organizerId: TournamentOrganizerId;
  readonly level: CareerTournamentLevel;
  readonly placement: CareerPlacement;
  readonly rating: number;
  readonly mapsPlayed: number;
  readonly champion: boolean;
  readonly mvp: MvpLevel;
  /** T1/Major 冠军的赛事图标资源标识；T2 和非冠军为 null。 */
  readonly trophyAssetId: TournamentOrganizerId | null;
}

/** 退役总结中的 TOP20 单条历史记录。 */
export interface RetirementTop20Record {
  readonly year: number;
  readonly rank: number;
}

/**
 * 奖杯陈列室条目。
 * 只有 T1 及以上赛事冠军才能进入该数组；T2 赛事不显示奖杯。
 */
export interface RetirementTrophyEntry {
  readonly editionId: string;
  readonly year: number;
  readonly fullName: string;
  readonly organizerId: TournamentOrganizerId;
  readonly level: 'T1' | 'MAJOR';
  readonly trophyAssetId: TournamentOrganizerId;
}

/** MVP 陈列室的单条记录，前端可据此匹配徽章资源。 */
export interface RetirementMvpEntry {
  readonly editionId: string;
  readonly year: number;
  readonly fullName: string;
  readonly organizerId: TournamentOrganizerId;
  readonly level: MvpLevel;
  readonly badgeAssetId: 'golden_mvp' | 'sliver_mvp';
}

/** 前端直接消费的退役总结面板 DTO，不包含 Service、Repository 或运行时对象。 */
export interface RetirementSummary {
  readonly player: {
    readonly playerId: string;
    readonly gameId: string;
    readonly retiredAt: string;
    readonly reason: string | null;
  };
  readonly top20History: readonly RetirementTop20Record[];
  readonly trophyRoom: readonly RetirementTrophyEntry[];
  readonly mvpRoom: readonly RetirementMvpEntry[];
  readonly mvpTotals: {
    /** Major MVP 对应 golden_mvp.webp。 */
    readonly major: number;
    /** 非 Major 赛事 MVP 对应 sliver_mvp.webp。 */
    readonly normal: number;
  };
  readonly careerOverview: {
    readonly averageRating: number;
    readonly totalKills: number;
    readonly totalMaps: number;
    readonly clutchWon: number;
    readonly careerEarnings: number;
    readonly majorChampionships: number;
    readonly otherSTierTitles: number;
    readonly grade: 'S' | 'A' | 'B' | 'C' | 'D';
    readonly retiredAge: number;
    readonly peakRating: number;
    readonly peakSeason: number | null;
    readonly peakSeasonRating: number;
    readonly peakSeasons: number;
    readonly tierBreakdown: Readonly<{ readonly T2: number; readonly T1: number; readonly MAJOR: number }>;
  };
}

/** 退役总结生成器，负责从档案和赛事归档构造展示 DTO。 */
export interface RetirementSummaryService {
  generate(input: { readonly player: PlayerProfile; readonly gradeRules?: readonly { readonly grade: 'S' | 'A' | 'B' | 'C' | 'D'; readonly minimumRating: number }[] }): Promise<RetirementSummary>;
}

/** 退役归档服务，负责幂等退役、写入时间和结算最终状态。 */
export interface RetirementService {
  retire(input: { readonly player: PlayerProfile; readonly reason?: string; readonly retiredAt: string }): Promise<PlayerProfile>;
}
