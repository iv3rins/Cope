import type { HltvTeamId } from '../hltv/team';
import type { TournamentId, TournamentInterventionType } from '../hltv/tournament';
import type { EventCondition } from './condition';
import type { PlayerAttribute, PlayerFlag, PlayerProfile, PlayerRole } from './profile';
import type { ForceContractTerminationEffect } from './contract';
import type { GameDifficultyMode } from './mode';

/** 生涯剧情图接口：只描述内容和状态转换，不包含具体渲染与存储实现。 */
export type EventPeriod = 'FINAL_DECISIVE_MOMENT' | 'OFFSEASON' | 'TRANSFER_WINDOW' | 'AFTER_TOP20' | 'NORMAL';
export type StoryEventType = 'CHOICE' | 'MANDATORY';
export type PlayerMutableStat = 'MORALE' | 'ENERGY' | 'BALANCE' | 'STRESS' | 'RATING2';
export type CareerStat = 'TOTAL_KILLS' | 'MAPS_PLAYED' | 'CLUTCH_WON' | 'CAREER_EARNINGS';

export interface AttributeChangeEffect {
  readonly type: 'ATTRIBUTE_CHANGE';
  readonly attribute: PlayerAttribute;
  readonly delta: number;
}

export interface PlayerStatChangeEffect {
  readonly type: 'PLAYER_STAT_CHANGE';
  readonly stat: PlayerMutableStat;
  readonly delta: number;
}

export interface TeamTransferEffect {
  readonly type: 'TEAM_TRANSFER';
  readonly teamId: HltvTeamId;
  readonly salaryPerMonth?: number;
}

export interface RoleChangeEffect {
  readonly type: 'ROLE_CHANGE';
  readonly role: PlayerRole;
}

export interface WorldlineChangeEffect {
  readonly type: 'WORLDLINE_CHANGE';
  readonly worldlineId: string;
}

export interface FlagChangeEffect {
  readonly type: 'FLAG_ADD' | 'FLAG_REMOVE';
  readonly flagId: string;
  readonly flag?: PlayerFlag;
}

export interface TrophyChangeEffect {
  readonly type: 'TROPHY_CHANGE';
  readonly trophy: 'MAJOR' | 'S_TIER' | 'MVP' | 'EVP';
  readonly delta: number;
}

export interface CareerStatChangeEffect {
  readonly type: 'CAREER_STAT_CHANGE';
  readonly stat: CareerStat;
  readonly delta: number;
}

export interface AdvanceStoryEffect {
  readonly type: 'ADVANCE_STORY';
  readonly eventId: string;
}

/**
 * 将剧情选择投射为本届赛事的局势修正。
 * Engine 只声明修正意图，不能直接改写赛事名次；HLTV TournamentService 负责消费它并产出爆冷判定。
 */
export interface TournamentInterventionEffect {
  readonly type: 'TOURNAMENT_INTERVENTION';
  readonly editionId: TournamentId;
  readonly interventionType: TournamentInterventionType;
  readonly delta?: number;
  readonly opponentTeamId?: HltvTeamId | null;
  readonly forceUpset?: boolean | null;
  readonly description: string;
}

export type EventEffect = AttributeChangeEffect | PlayerStatChangeEffect | TeamTransferEffect | RoleChangeEffect | WorldlineChangeEffect | FlagChangeEffect | TrophyChangeEffect | CareerStatChangeEffect | AdvanceStoryEffect | TournamentInterventionEffect | ForceContractTerminationEffect;

export interface SuccessChanceModifier {
  readonly attribute: PlayerAttribute;
  readonly perPoint: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface SuccessChance {
  readonly baseChance: number;
  readonly modifiers: readonly SuccessChanceModifier[];
}

export interface EventOutcome {
  readonly successEffects: readonly EventEffect[];
  readonly failureEffects: readonly EventEffect[];
  readonly successNextEventId?: string;
  readonly failureNextEventId?: string;
}

export interface StoryEventOption {
  readonly id: string;
  readonly label: string;
  /** 快捷模式过滤；未填写时由 requirements 中的 GAME_MODE 条件决定。 */
  readonly allowedModes?: readonly GameDifficultyMode[];
  readonly requirements: readonly EventCondition[];
  readonly successChance?: SuccessChance;
  readonly outcome: EventOutcome;
}

export interface StoryEvent {
  readonly id: string;
  readonly title: string;
  /** 事件级模式过滤；例如心理崩溃事件只允许 HARDCORE。 */
  readonly allowedModes?: readonly GameDifficultyMode[];
  readonly description: string;
  readonly worldlineId: string;
  readonly type: StoryEventType;
  readonly period: EventPeriod;
  readonly conditions: readonly EventCondition[];
  readonly options: readonly StoryEventOption[];
  readonly autoEffects: readonly EventEffect[];
}

export interface Worldline {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly startEventId: string;
  readonly eventIds: readonly string[];
}

/** 一次事件决策必须记录 roll，确保结果可复现。 */
export interface StoryDecision {
  readonly eventId: string;
  readonly optionId: string;
  readonly randomRoll: number;
}

export interface StoryDecisionResult {
  readonly profile: PlayerProfile;
  readonly succeeded: boolean;
  readonly appliedEffects: readonly EventEffect[];
  /** 从 TOURNAMENT_INTERVENTION 效果构建并已登记的赛事修正 ID。 */
  readonly appliedTournamentInterventionIds: readonly string[];
  /** 本次事件触发并成功执行的合同终止记录 ID。 */
  readonly terminatedContractId: string | null;
  readonly nextEventId: string | null;
}

export interface StoryRepository {
  findEvent(eventId: string): Promise<StoryEvent | null>;
  findWorldline(worldlineId: string): Promise<Worldline | null>;
}

/** 模式成功率策略只调整最终成功率，不改变 StoryEvent 原始配置。 */
export interface StorySuccessChancePolicy {
  adjust(input: {
    readonly mode: GameDifficultyMode;
    readonly baseChance: SuccessChance | undefined;
  }): SuccessChance | undefined;
}

/** StoryEngine 的最小注入依赖；策略由外部装配，避免把爽文逻辑写死在事件实现中。 */
export interface StoryEngineDependencies {
  readonly successChancePolicy: StorySuccessChancePolicy;
}

export interface StoryEngine {
  /** 当前策略负责根据 profile.difficultyMode 调整所有选项的最终成功率。 */
  readonly successChancePolicy: StorySuccessChancePolicy;
  findAvailableEvents(input: { readonly profile: PlayerProfile; readonly period: EventPeriod; readonly randomRoll: number }): Promise<readonly StoryEvent[]>;
  /** 执行事件选项，并将其中的 TOURNAMENT_INTERVENTION 效果登记到赛事模块。 */
  decide(input: { readonly profile: PlayerProfile; readonly decision: StoryDecision }): Promise<StoryDecisionResult>;
}
