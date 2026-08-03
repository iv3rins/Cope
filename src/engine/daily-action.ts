import type { PlayerAttribute, PlayerProfile } from './profile';

/** 日常行动的类型；每个行动都消耗一个固定时间片。 */
export type DailyActionType = 'FACEIT_GRIND' | 'STREAM' | 'REST' | 'TRAIN' | 'PART_TIME_JOB' | 'REVIEW_DEMO';

/** 行动可修改的数值；具体变化必须由 DailyActionService 返回并审计。 */
export type DailyActionStat = 'ENERGY' | 'MORALE' | 'BALANCE' | 'STRESS' | 'ATTRIBUTE';

export interface DailyActionDefinition {
  readonly id: string;
  readonly type: DailyActionType;
  readonly name: string;
  readonly description: string;
  readonly durationHours: number;
  readonly requirements: readonly DailyActionRequirement[];
  readonly allowedPeriods: readonly ('NORMAL' | 'OFFSEASON' | 'TOURNAMENT_BREAK')[];
}

/** 日常行动的前置条件，例如精力不足时不能进行高强度训练。 */
export interface DailyActionRequirement {
  readonly stat: 'ENERGY' | 'MORALE' | 'BALANCE' | 'STRESS';
  readonly minimum?: number;
  readonly maximum?: number;
}

/** 行动产生的单项变化，属性变化必须明确来源。 */
export interface DailyActionDelta {
  readonly stat: DailyActionStat;
  readonly attribute?: PlayerAttribute;
  readonly delta: number;
  readonly source: 'ACTION_BASE' | 'ATTRIBUTE_CONVERSION' | 'RANDOM_OUTCOME';
}

export interface DailyActionResult {
  readonly player: PlayerProfile;
  readonly action: DailyActionDefinition;
  readonly appliedDeltas: readonly DailyActionDelta[];
  readonly randomRoll: number;
  readonly completed: boolean;
  readonly rejectionReason?: 'REQUIREMENT_NOT_MET' | 'NO_TIME_REMAINING' | 'PLAYER_UNAVAILABLE';
}

export interface DailyActionRepository {
  findById(actionId: string): Promise<DailyActionDefinition | null>;
  listAvailable(input: { readonly player: PlayerProfile; readonly period: DailyActionDefinition['allowedPeriods'][number] }): Promise<readonly DailyActionDefinition[]>;
}

/** 处理日常主动行动，以及 energy、morale、attributes 的转化。 */
export interface DailyActionService {
  listAvailable(input: { readonly player: PlayerProfile; readonly period: DailyActionDefinition['allowedPeriods'][number] }): Promise<readonly DailyActionDefinition[]>;
  execute(input: { readonly player: PlayerProfile; readonly actionId: string; readonly randomRoll: number }): Promise<DailyActionResult>;
}
