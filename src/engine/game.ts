import type { EngineHltvGateway } from './hltv-gateway';
import type { CareerEventWindow, EventPeriod, StoryDecision, StoryDecisionResult, StoryEvent } from './graph';
import type { PlayerProfile } from './profile';
import type { AgeProgressionResult, PlayerProgressionService } from './progression';
import type { CareerGameState, CareerGameStateRepository } from './save-state';
import type { TournamentAdvanceResult, TournamentEdition, TournamentStandInAssignment, TournamentStandInOffer } from '../hltv/tournament';
import type { TransferOffer, TransferTargetView } from '../hltv/transfer-targets';
import type { RankingSource } from '../hltv/team';
import type { DailyActionService } from './daily-action';
import type { EconomyTickService } from './economy';
import type { EventTriggerService } from './event-trigger';
import type { RetirementSummary, RetirementSummaryService, RetirementService } from './retirement';
import type { GameDifficultyMode } from './mode';

export type CareerTournamentAdvanceMode = 'NEXT_NODE' | 'UNTIL_DECISION_OR_COMPLETE';

/** 生涯游戏的顶层应用接口，UI/命令行/测试均通过它驱动引擎。 */
export interface CareerGame {
  getProfile(): Promise<PlayerProfile>;
  /** 在半年开始时锁定 VRS 快照并生成完整赛历；重复调用必须返回同一赛历。 */
  startSeason(): Promise<readonly TournamentEdition[]>;
  /** 返回由 TournamentService 自动生成且尚未完成的下一场赛事。 */
  getNextTournament(): Promise<TournamentEdition | null>;
  /** 根据冻结 VRS 快照和玩家能力返回只读转会目标；不会直接改变档案。 */
  listTransferTargets(): Promise<readonly TransferTargetView[]>;
  /** Selects one real-team invitation; selection only writes pending offer context. */
  selectTransferTarget(teamId: string): Promise<TransferOffer>;
  listStandInOffers(): Promise<readonly TournamentStandInOffer[]>;
  respondStandInOffer(offerId: string, response: 'ACCEPT' | 'REJECT' | 'WAIT'): Promise<TournamentStandInAssignment | TournamentStandInOffer | null>;
  acceptStandInOffer(offerId: string): Promise<TournamentStandInAssignment>;
  /** 返回当前冻结 VRS 中玩家队伍的模拟/真实排名。 */
  getVrsStatus(): Promise<{ readonly rank: number | null; readonly points: number | null; readonly source: RankingSource | null }>;
  /** 按赛历游标推进赛事；快速模式复用同一结算路径并在决策/资格赛结果/完赛时停止。 */
  advanceTournament(input?: { readonly mode?: CareerTournamentAdvanceMode }): Promise<TournamentAdvanceResult>;
  /** 查询当前窗口的事件；事件存在时持久化为 EVENT phase。 */
  findCareerEvent(window: CareerEventWindow): Promise<StoryEvent | null>;
  finishSeason(): Promise<import('./save-state').HalfSeasonSettlement | null>;
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
