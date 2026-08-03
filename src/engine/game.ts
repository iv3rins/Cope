import type { EngineHltvGateway } from './hltv-gateway';
import type { EventPeriod, StoryDecision, StoryDecisionResult } from './graph';
import type { PlayerProfile } from './profile';
import type { AgeProgressionResult, PlayerProgressionService } from './progression';
import type { CareerGameState, CareerGameStateRepository } from './save-state';
import type { DailyActionService } from './daily-action';
import type { EconomyTickService } from './economy';
import type { EventTriggerService } from './event-trigger';
import type { RetirementSummary, RetirementSummaryService, RetirementService } from './retirement';
import type { GameDifficultyMode } from './mode';

/** 生涯游戏的顶层应用接口，UI/命令行/测试均通过它驱动引擎。 */
export interface CareerGame {
  getProfile(): Promise<PlayerProfile>;
  advancePeriod(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<PlayerProfile>;
  /** 年龄推进会应用年龄基础曲线、出生地区修正和地区 Flag 规则。 */
  advanceAge(years?: number): Promise<AgeProgressionResult>;
  chooseStoryOption(decision: StoryDecision): Promise<StoryDecisionResult>;
  executeDailyAction(actionId: string, randomRoll: number): Promise<PlayerProfile>;
  /** 触发退役、关闭当前生涯活动并写入最终归档状态。 */
  retire(reason?: string): Promise<PlayerProfile>;
  /** 仅允许在 isRetired=true 后生成最终生涯总结面板。 */
  generateRetirementSummary(): Promise<RetirementSummary>;
  save(): Promise<void>;
}

/** 创建游戏引擎所需的依赖。具体实现通过构造函数注入，而不是直接访问全局对象。 */
export interface CareerGameDependencies {
  readonly playerId: string;
  /** 创建时明确选择体验模式，并传入档案初始化流程。 */
  readonly difficultyMode: GameDifficultyMode;
  readonly hltv: EngineHltvGateway;
  readonly progression: PlayerProgressionService;
  readonly dailyActions: DailyActionService;
  readonly economy: EconomyTickService;
  readonly triggers: EventTriggerService;
  readonly retirement: RetirementService;
  readonly retirementSummary: RetirementSummaryService;
  readonly stateRepository: CareerGameStateRepository;
}

export interface CareerGameFactory {
  create(input: CareerGameDependencies): Promise<CareerGame>;
}
