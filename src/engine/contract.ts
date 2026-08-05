import type { HltvTeamId } from '../hltv/team';
import type { EventCondition } from './condition';
import type { PlayerProfile } from './profile';

/** 选手合同是 Engine 聚合，避免将生涯人事规则泄漏到 HLTV 赛事模块。 */
export type PlayerContractStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED';
export type ContractTerminationReason = 'EVENT_DECISION' | 'ATTRIBUTE_THRESHOLD' | 'TEAM_DECISION' | 'MUTUAL_AGREEMENT' | 'EXPIRED' | 'NON_RENEWAL' | 'TEAM_REBUILD' | 'NO_ROSTER_SPACE' | 'BUYOUT_FAILED' | 'FORCED_RELEASE';
export type ContractLifecycleOperation = 'SIGN' | 'RENEW' | 'TRANSFER' | 'BUYOUT' | 'TERMINATE';

export interface PlayerContract {
  readonly id: string;
  readonly playerId: string;
  readonly teamId: HltvTeamId;
  readonly startedAt: string;
  readonly endsAt: string;
  readonly salaryPerMonth: number;
  readonly status: PlayerContractStatus;
  /** 买断金额；没有买断条款时为 0。 */
  readonly buyoutAmount: number;
  /** Squad role promised by the accepted offer. Optional for legacy saves. */
  readonly role?: 'STARTER' | 'SUBSTITUTE';
  /** Expected share of competitive maps. Optional for legacy saves. */
  readonly expectedPlaytimePercentage?: number;
  readonly termination?: ContractTermination;
}

/** 强制解约记录必须保存触发事件和满足的条件，防止无理由移除当前战队。 */
export interface ContractTermination {
  readonly reason: ContractTerminationReason;
  readonly terminatedAt: string;
  readonly sourceStoryEventId?: string;
  readonly sourceOptionId?: string;
  readonly matchedConditions: readonly EventCondition[];
  readonly note: string;
}

/**
 * 剧情中的解约效果。
 * requirements 由 StoryEngine 在执行前以当前 PlayerProfile 求值；全部成立时才会强制结束当前有效合同。
 * 例如：consistency <= 35 且 teamConflict >= 75 时，俱乐部直接解约。
 */
export interface ForceContractTerminationEffect {
  readonly type: 'FORCE_CONTRACT_TERMINATION';
  readonly requirements: readonly EventCondition[];
  readonly reason: Extract<ContractTerminationReason, 'EVENT_DECISION' | 'ATTRIBUTE_THRESHOLD' | 'TEAM_DECISION' | 'MUTUAL_AGREEMENT'>;
  readonly note: string;
}

export interface ContractTerminationResult {
  readonly profile: PlayerProfile;
  readonly contract: PlayerContract;
  readonly terminated: boolean;
  readonly rejectionReason?: 'NO_ACTIVE_CONTRACT' | 'REQUIREMENTS_NOT_MET' | 'ALREADY_TERMINATED';
}

/** 签约/续约/转会/买断共用的合同输入。 */
export interface ContractTerms {
  readonly teamId: HltvTeamId;
  readonly startedAt: string;
  readonly endsAt: string;
  readonly salaryPerMonth: number;
  readonly buyoutAmount: number;
  readonly role?: 'STARTER' | 'SUBSTITUTE';
  readonly expectedPlaytimePercentage?: number;
}

export interface ContractOperationResult {
  readonly operation: ContractLifecycleOperation;
  readonly profile: PlayerProfile;
  readonly contract: PlayerContract;
  readonly previousContract: PlayerContract | null;
  readonly fee: number;
}

export interface ContractOperationRejection {
  readonly operation: ContractLifecycleOperation;
  readonly profile: PlayerProfile;
  readonly reason: 'ALREADY_SIGNED' | 'NO_ACTIVE_CONTRACT' | 'TEAM_MISMATCH' | 'INSUFFICIENT_FUNDS' | 'BUYOUT_NOT_ALLOWED' | 'INVALID_TERMS' | 'FIRST_CONTRACT_REQUIRES_T3';
}

export type ContractOperationResponse = ContractOperationResult | ContractOperationRejection;

export interface PlayerContractRepository {
  findById(contractId: string): Promise<PlayerContract | null>;
  findActiveByPlayerId(playerId: string): Promise<PlayerContract | null>;
  listByPlayerId(playerId: string): Promise<readonly PlayerContract[]>;
  save(contract: PlayerContract): Promise<void>;
}

/** 合同服务只处理合同状态与选手离队状态，不负责 UI 弹窗或转会市场匹配。 */
export interface PlayerContractService {
  /** Current immutable contract view used by the save aggregate after an operation. */
  readonly snapshot: readonly PlayerContract[];
  /** 首次签约；已有 ACTIVE 合同时必须拒绝。 */
  sign(input: { readonly profile: PlayerProfile; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse>;
  /** 在原合同基础上延长或更新薪资。 */
  renew(input: { readonly profile: PlayerProfile; readonly contractId: string; readonly terms: Pick<ContractTerms, 'endsAt' | 'salaryPerMonth' | 'buyoutAmount'>; readonly occurredAt: string }): Promise<ContractOperationResponse>;
  /** 玩家主动转会；旧合同关闭并创建新合同。 */
  transfer(input: { readonly profile: PlayerProfile; readonly currentContractId: string; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse>;
  /** 新战队支付买断费用后完成转会。 */
  buyout(input: { readonly profile: PlayerProfile; readonly currentContractId: string; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse>;
  terminate(input: { readonly profile: PlayerProfile; readonly effect: ForceContractTerminationEffect; readonly sourceStoryEventId: string; readonly sourceOptionId: string; readonly occurredAt: string }): Promise<ContractTerminationResult>;
}
