import type { CompetitionRegion, HltvTeamId } from '../hltv/team';
import type { NarrativeMetric, PlayerAttribute, PlayerProfile, PlayerRole } from './profile';
import type { PlayerContract } from './contract';
import type { GameDifficultyMode } from './mode';

/** 事件条件始终由 Engine 求值；随机值由调用方传入，避免内部使用 Math.random。 */
export type ConditionTarget = 'PLAYER' | 'CURRENT_TEAM' | 'OPPONENT_TEAM';
export type PlayerStat = 'MORALE' | 'ENERGY' | 'BALANCE' | 'STRESS' | 'RATING2';

interface ConditionBase {
  readonly target?: ConditionTarget;
  readonly negate?: boolean;
}

export interface AttributeCondition extends ConditionBase {
  readonly type: 'ATTRIBUTE';
  readonly attribute: PlayerAttribute;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface PlayerStatCondition extends ConditionBase {
  readonly type: 'PLAYER_STAT';
  readonly stat: PlayerStat;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface NarrativeMetricCondition extends ConditionBase {
  readonly type: 'NARRATIVE_METRIC';
  readonly metric: NarrativeMetric | 'MENTALITY' | 'BALANCE';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AgeCondition extends ConditionBase {
  readonly type: 'AGE';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface PlayerOriginRegionCondition extends ConditionBase {
  readonly type: 'PLAYER_ORIGIN_REGION';
  readonly regions: readonly CompetitionRegion[];
}

export interface PlayerRoleCondition extends ConditionBase {
  readonly type: 'PLAYER_ROLE';
  readonly roles: readonly PlayerRole[];
}

export interface FlagCondition extends ConditionBase {
  readonly type: 'FLAG';
  readonly flagId: string;
  readonly expected: boolean;
}

export interface TeamCondition extends ConditionBase {
  readonly type: 'TEAM';
  readonly teamId: HltvTeamId;
}

export interface WorldlineCondition extends ConditionBase {
  readonly type: 'WORLDLINE';
  readonly worldlineId: string;
}

export interface CompletedEventCondition extends ConditionBase {
  readonly type: 'COMPLETED_EVENT';
  readonly eventId: string;
}

export interface ContractCondition extends ConditionBase {
  readonly type: 'ACTIVE_CONTRACT';
  readonly expected: boolean;
}

export interface FreeAgencyCondition extends ConditionBase {
  readonly type: 'FREE_AGENCY';
  readonly expected: boolean;
}

export interface TransferWindowCondition extends ConditionBase {
  readonly type: 'TRANSFER_WINDOW';
  readonly expected: boolean;
}

export interface TransferOfferCondition extends ConditionBase {
  readonly type: 'TRANSFER_OFFER';
  readonly expected: boolean;
}

export interface TeamVrsRankCondition extends ConditionBase {
  readonly type: 'TEAM_VRS_RANK';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface RatingStreakCondition extends ConditionBase {
  readonly type: 'RATING_STREAK';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AdvancedMapsCondition extends ConditionBase {
  readonly type: 'ADVANCED_MAPS';
  readonly minimum?: number;
  readonly maximum?: number;
}

/** Match the latest annual TOP20 rank; missing rank is treated as unavailable. */
export interface Top20RankCondition extends ConditionBase {
  readonly type: 'TOP20_RANK';
  readonly minimum?: number;
  readonly maximum?: number;
}

/** 根据当前生涯模式决定事件、选项或复合条件是否可用。 */
export interface GameModeCondition extends ConditionBase {
  readonly type: 'GAME_MODE';
  readonly modes: readonly GameDifficultyMode[];
}

/** 随机条件不自行抽样，roll 由 RandomSource 或回放记录提供。 */
export interface RandomCondition extends ConditionBase {
  readonly type: 'RANDOM';
  readonly chance: number;
}

export interface CompositeCondition extends ConditionBase {
  readonly type: 'ALL' | 'ANY' | 'NONE';
  readonly conditions: readonly EventCondition[];
}

export type EventCondition = AttributeCondition | PlayerStatCondition | NarrativeMetricCondition | AgeCondition | PlayerOriginRegionCondition | PlayerRoleCondition | FlagCondition | TeamCondition | WorldlineCondition | CompletedEventCondition | ContractCondition | FreeAgencyCondition | TransferWindowCondition | TransferOfferCondition | TeamVrsRankCondition | RatingStreakCondition | AdvancedMapsCondition | Top20RankCondition | GameModeCondition | RandomCondition | CompositeCondition;

/** 条件求值所需的完整上下文，未提供的目标必须返回不可满足而非静默读取玩家。 */
export interface ConditionContext {
  readonly player: PlayerProfile;
  readonly currentTeamId: HltvTeamId | null;
  readonly opponentTeamId: HltvTeamId | null;
  readonly randomRoll: number;
  /** 冗余保存模式便于条件求值器处理配置和测试上下文。 */
  readonly difficultyMode: GameDifficultyMode;
  /** 生涯内当前时间，用于报价等时效条件；缺失时按不可验证处理。 */
  readonly currentDate?: string;
  /** Optional domain facts are supplied by the composition root; absent means unknown. */
  readonly activeContract?: PlayerContract | null;
  readonly currentTeamRank?: number | null;
  readonly transferWindowOpen?: boolean;
  readonly pendingTransferOffer?: import('../hltv/transfer-targets').TransferOffer | null;
  readonly lowRatingStreak?: number;
  readonly advancedMapsPlayed?: number;
}

export interface ConditionEvaluator {
  matches(condition: EventCondition, context: ConditionContext): boolean;
  matchesAll(conditions: readonly EventCondition[], context: ConditionContext): boolean;
}
