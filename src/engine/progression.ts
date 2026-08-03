import type { PlayerAttribute, PlayerFlag, PlayerOriginRegion, PlayerProfile } from './profile';
import type { GameDifficultyMode, GameModeRule } from './mode';

/**
 * 年龄阶段是第一版能力成长的固定规则：
 * - 21 岁前：属性成长；
 * - 21 至 25 岁：职业峰值平台，基本保持不变；
 * - 26 至 29 岁：缓慢下滑；
 * - 30 岁起：断崖式下滑。
 */
export type AgePhase = 'DEVELOPMENT' | 'PEAK' | 'GRADUAL_DECLINE' | 'SHARP_DECLINE';

/** 选手出生地区。它属于 Engine 的成长规则，不等同于当前效力战队所在地区。 */
/** 单项属性在一次年龄推进中的数值改变量。 */
export interface AttributeDelta {
  readonly attribute: PlayerAttribute;
  readonly delta: number;
  /** 用于日志和调试，例如 AGE_BASE、REGION_BONUS、REGION_PENALTY。 */
  readonly source: 'AGE_BASE' | 'REGION_BONUS' | 'REGION_PENALTY';
}

/** 地区规则可同时影响初始属性、年龄成长，并授予常驻地区 Flag。 */
export interface RegionOriginRule {
  readonly region: PlayerOriginRegion;
  readonly name: string;
  /** 创建生涯时直接施加的属性修正。 */
  readonly initialAttributeDeltas: readonly AttributeDelta[];
  /** 每次年龄推进的额外修正，可为空。 */
  readonly agePhaseAttributeDeltas: Readonly<Partial<Record<AgePhase, readonly AttributeDelta[]>>>;
  /** 创建角色时授予的出生地区 Flag，例如 ORIGIN_ASIA。 */
  readonly originFlags: readonly PlayerFlag[];
}

/** 年龄曲线只定义基础变化，不携带地区、训练或事件等外部影响。 */
export interface AgeProgressionRule {
  readonly phase: AgePhase;
  readonly minimumAge: number;
  readonly maximumAge: number | null;
  readonly baseAttributeDeltas: readonly AttributeDelta[];
}

/** 一次年龄增长的完整审计记录。 */
export interface AgeProgressionResult {
  readonly previousAge: number;
  readonly currentAge: number;
  readonly phase: AgePhase;
  readonly appliedDeltas: readonly AttributeDelta[];
  readonly grantedFlags: readonly PlayerFlag[];
  readonly profile: PlayerProfile;
}

/**
 * 成长服务接口。实现必须：
 * 1. 先应用年龄基础曲线；2. 再叠加地区修正；3. 保留全部 delta 供回放。
 * PEAK 阶段的默认基础 delta 应为 0，地区规则若要产生变化必须显式声明。
 */
export interface PlayerProgressionService {
  /**
   * 创建或初始化档案时应用模式资源：初始资金、士气、精力和其他模式规则。
   * difficultyMode 必须与 profile.difficultyMode 一致；实现应拒绝不一致的输入。
   */
  createProfile(input: {
    readonly profile: PlayerProfile;
    readonly difficultyMode: GameDifficultyMode;
    readonly originRule: RegionOriginRule;
    readonly modeRule: GameModeRule;
  }): Promise<PlayerProfile>;
  advanceAge(input: { readonly profile: PlayerProfile; readonly originRule: RegionOriginRule; readonly years?: number }): Promise<AgeProgressionResult>;
  getAgePhase(age: number): AgePhase;
}

/** 年龄与地区规则仓储。便于按版本替换平衡数值而不影响 Engine 接口。 */
export interface PlayerProgressionRuleRepository {
  findAgeRule(phase: AgePhase): Promise<AgeProgressionRule | null>;
  findOriginRule(region: PlayerOriginRegion): Promise<RegionOriginRule | null>;
}
