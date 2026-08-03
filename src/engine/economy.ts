import type { GameClock } from './runtime';
import type { PlayerProfile } from './profile';

/** 经济结算周期；周结算处理日常流水，月结算处理工资与月度合同收入。 */
export type EconomyTickPeriod = 'WEEK' | 'MONTH';
export type EconomyLedgerKind = 'SALARY' | 'EXPENSE' | 'PRIZE_SHARE' | 'STREAMING' | 'BONUS' | 'BUYOUT' | 'OTHER';

/** 单笔经济流水，所有金额均使用游戏内部统一货币单位。 */
export interface EconomyLedgerEntry {
  readonly id: string;
  readonly playerId: string;
  readonly period: EconomyTickPeriod;
  readonly kind: EconomyLedgerKind;
  readonly amount: number;
  readonly occurredAt: string;
  readonly sourceId?: string;
  readonly description: string;
}

/** 一次经济结算的完整结果，包含结算前后余额和破产判断。 */
export interface EconomyTickResult {
  readonly player: PlayerProfile;
  readonly period: EconomyTickPeriod;
  readonly entries: readonly EconomyLedgerEntry[];
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  readonly bankrupt: boolean;
  readonly bankruptcyReason: 'NEGATIVE_BALANCE' | 'UNPAID_EXPENSE' | null;
}

/** 经济规则端口；实现可从配置、存档或规则版本中读取固定开销。 */
export interface EconomyRuleRepository {
  getDefaultWeeklyExpense(player: PlayerProfile): Promise<number>;
  getJobIncome(player: PlayerProfile): Promise<number>;
}

/** 工资与开销的结算服务；不得直接依赖 Date 或全局存储。 */
export interface EconomyTickService {
  tick(input: {
    readonly player: PlayerProfile;
    readonly period: EconomyTickPeriod;
    readonly occurredAt?: string;
  }): Promise<EconomyTickResult>;
  isBankrupt(balance: number): boolean;
}

/** 经济流水仓储，供存档、账本审计和事件触发器查询。 */
export interface EconomyLedgerRepository {
  append(entries: readonly EconomyLedgerEntry[]): Promise<void>;
  listByPlayer(playerId: string): Promise<readonly EconomyLedgerEntry[]>;
}

/** 组合经济服务时注入的依赖集合。 */
export interface EconomyServiceDependencies {
  readonly rules: EconomyRuleRepository;
  readonly ledger: EconomyLedgerRepository;
  readonly clock: GameClock;
}
