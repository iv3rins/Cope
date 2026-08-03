import type { EventCondition } from './condition';
import type { EventPeriod, StoryEvent } from './graph';
import type { PlayerContract } from './contract';
import type { PlayerProfile } from './profile';

/** 可触发强制事件的领域事实。后续可继续扩展经济、年龄、赛事和伤病事实。 */
export type TriggerFact =
  | LowFinalRatingFact
  | ContractTerminatedFact
  | BankruptFact
  | TournamentUpsetFact
  | AgeMilestoneFact;

export interface LowFinalRatingFact {
  readonly type: 'LOW_FINAL_RATING_STREAK';
  readonly playerId: string;
  readonly tournamentIds: readonly string[];
  readonly ratings: readonly number[];
  readonly threshold: number;
}

export interface ContractTerminatedFact {
  readonly type: 'CONTRACT_TERMINATED';
  readonly playerId: string;
  readonly contract: PlayerContract;
}

export interface BankruptFact {
  readonly type: 'PLAYER_BANKRUPT';
  readonly playerId: string;
  readonly balance: number;
}

export interface TournamentUpsetFact {
  readonly type: 'TOURNAMENT_UPSET';
  readonly playerId: string;
  readonly editionId: string;
  readonly opponentTeamId: string;
}

export interface AgeMilestoneFact {
  readonly type: 'AGE_MILESTONE';
  readonly playerId: string;
  readonly age: number;
}

/** 强制事件匹配结果，包含为什么触发以及触发哪个故事节点。 */
export interface TriggeredEvent {
  readonly triggerId: string;
  readonly playerId: string;
  readonly eventId: string;
  readonly period: EventPeriod;
  readonly fact: TriggerFact;
  readonly matchedConditions: readonly EventCondition[];
  readonly forced: true;
}

export interface EventTriggerRule {
  readonly id: string;
  readonly name: string;
  readonly factType: TriggerFact['type'];
  readonly conditions: readonly EventCondition[];
  readonly eventId: string;
  readonly priority: number;
  readonly oncePerCareer: boolean;
}

/** 事件触发规则仓储。 */
export interface EventTriggerRuleRepository {
  listByFactType(factType: TriggerFact['type']): Promise<readonly EventTriggerRule[]>;
  findEvent(eventId: string): Promise<StoryEvent | null>;
}

/**
 * 即时事件触发器：在赛事结果、合同终止、破产等事实写入后立即运行。
 * 触发器只能产生强制事件，不直接修改 PlayerProfile。
 */
export interface EventTriggerService {
  evaluate(input: { readonly player: PlayerProfile; readonly fact: TriggerFact }): Promise<readonly TriggeredEvent[]>;
  markTriggered(triggerId: string, playerId: string): Promise<void>;
}

/** 事件总线负责发布领域事实，不负责事件条件求值。 */
export interface EventBus {
  publish(fact: TriggerFact): Promise<void>;
  subscribe(handler: EventFactHandler): () => void;
}

export interface EventFactHandler {
  readonly name: string;
  handle(fact: TriggerFact): Promise<void>;
}
