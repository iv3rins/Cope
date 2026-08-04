import type { HltvPlayerId, HltvTeamId, CompetitionRegion, TeamTier } from '../hltv/team';
import type { GameDifficultyMode } from './mode';
import type { CareerTournamentRecord } from './retirement';

/** 选手出生地区与 HLTV 赛事地区共用同一组稳定代码。 */
export type PlayerOriginRegion = CompetitionRegion;

/** Engine 管理玩家自身的生涯状态；HLTV 中的真实赛事数据不放入该聚合。 */
export type PartTimeJob = 'NONE' | 'STUDENT' | 'NET_CAFE_CASHIER' | 'ELO_BOOSTER' | 'SMALL_STREAMER';
export type PlayerRole = 'IGL' | 'AWPER' | 'ENTRY_FRAGGER' | 'SUPPORT' | 'LURKER';
/** 生涯合同之外的归属状态；缺失时由旧存档迁移逻辑按 currentTeamId 推导。 */
export type FreeAgencyStatus = 'UNSIGNED' | 'SIGNED' | 'FREE_AGENT';
export type TransferWindowState = 'CLOSED' | 'OPEN' | 'PENDING_DECISION';
export type PlayerReleaseReason = 'CONTRACT_EXPIRED' | 'NON_RENEWAL' | 'MUTUAL_TERMINATION' | 'TEAM_REBUILD' | 'NO_ROSTER_SPACE' | 'BUYOUT_FAILED' | 'FORCED_RELEASE';
export type PlayerAttribute = 'AIM' | 'GAME_SENSE' | 'LEADERSHIP' | 'CLUTCH' | 'CONSISTENCY' | 'TEAM_CONFLICT';

export interface PlayerAttributes {
  readonly aim: number;
  readonly gameSense: number;
  readonly leadership: number;
  readonly clutch: number;
  readonly consistency: number;
  /** 越低越好，和其他属性方向相反。 */
  readonly teamConflict: number;
}

export interface PlayerLifeState {
  readonly balance: number;
  readonly currentJob: PartTimeJob;
  readonly incomePerWeek: number;
  readonly expensePerWeek: number;
  readonly stress: number;
}

export interface PlayerCareerStats {
  readonly totalKills: number;
  readonly rating2: number;
  readonly headshotPercentage: number;
  readonly mapsPlayed: number;
  readonly clutchWon: number;
  readonly careerEarnings: number;
  readonly teamHistory: readonly HltvTeamId[];
}

export interface PlayerTrophies {
  readonly majorChampionships: number;
  readonly otherSTierTitles: number;
  readonly mvpAwards: number;
  readonly evpAwards: number;
  readonly top20Records: readonly { readonly year: number; readonly rank: number }[];
}

export interface PlayerFlag {
  readonly id: string;
  readonly name: string;
  readonly category: 'MENTAL' | 'ACHIEVEMENT' | 'EVENT' | 'CAREER' | 'CUSTOM';
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 可序列化的选手生涯快照。 */
export interface PlayerProfile {
  readonly id: HltvPlayerId;
  readonly gameId: string;
  readonly nationality: string;
  /** 生涯体验模式；必须作为档案字段持久化，不能只保存在运行时配置中。 */
  readonly difficultyMode: GameDifficultyMode;
  /** 是否已经完成退役结算。 */
  readonly isRetired: boolean;
  /** 退役时间；未退役时为空。 */
  readonly retiredAt?: string;
  /** 玩家参加过的每一届赛事归档，供退役总结和历史页面使用。 */
  readonly tournamentArchive: readonly CareerTournamentRecord[];
  /** 出生地区；影响初始属性、年龄成长和地区 Flag。 */
  readonly originRegion: PlayerOriginRegion;
  readonly age: number;
  readonly currentTeamId: HltvTeamId | null;
  /** Current team tier is optional for legacy saves and derived from real team assets when absent. */
  readonly currentTeamTier?: TeamTier;
  /** 当前自由球员字段为可选，保证旧版本 JSON 存档可直接反序列化。 */
  readonly freeAgencyStatus?: FreeAgencyStatus;
  readonly freeAgencySince?: string;
  readonly releaseReason?: PlayerReleaseReason;
  readonly transferWindowState?: TransferWindowState;
  /** 当前有效合同由合同仓储维护，档案只保存当前合同 ID。 */
  readonly currentContractId: string | null;
  readonly role: PlayerRole;
  readonly attributes: PlayerAttributes;
  readonly life: PlayerLifeState;
  readonly career: PlayerCareerStats;
  readonly trophies: PlayerTrophies;
  readonly morale: number;
  readonly energy: number;
  readonly worldlineId: string;
  readonly completedEventIds: readonly string[];
  readonly flags: readonly PlayerFlag[];
  readonly schemaVersion: number;
}

/** PlayerProfile 的读写端口，存档位置由实现决定。 */
export interface PlayerProfileRepository {
  findById(playerId: HltvPlayerId): Promise<PlayerProfile | null>;
  save(profile: PlayerProfile): Promise<void>;
}
