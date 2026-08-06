import type { AgeProgressionResult } from './progression';
import type { VrsInviteSnapshot } from '../hltv/team';
import type { TournamentEdition, TournamentIntervention, TournamentProgressState, TournamentResult, TournamentStandInAssignment, TournamentStandInOffer } from '../hltv/tournament';
import type { Top20Ranking } from '../hltv/top20';
import type { NpcPlayerProfile } from './npc';
import type { PlayerContract } from './contract';
import type { PlayerProfile } from './profile';

/** 旧存档缺失剧情指标时的中性值；MENTALITY/BALANCE 分别由 player.morale/life.balance 提供。 */
export const LEGACY_NARRATIVE_METRIC_DEFAULT = 50;
import type { Worldline } from './graph';
import type { TransferOffer } from '../hltv/transfer-targets';

/** 赛季主舞台状态；持久化后由组合根决定渲染哪个 phase。 */
export type CareerSeasonPhase = 'READY' | 'ACTIVE' | 'EVENT' | 'REPORT' | 'OFFSEASON' | 'RETIRED';
export type CareerTournamentPhase = 'PRE' | 'IN' | 'POST';

/** 事件完成后的恢复目标，禁止 UI 根据事件标题或窗口自行推断。 */
export type CareerEventResume = 'START_SEASON' | 'CONTINUE_SEASON' | 'CONTINUE_REPORT' | 'CONTINUE_OFFSEASON' | 'CONTINUE_TRANSFER_WINDOW';

export interface CareerEventResumeState {
  readonly mode: CareerEventResume;
  readonly eventId: string;
  readonly tournamentId: string | null;
}

/** 半年结算的事实快照；具体聚合规则由赛季服务在后续工单实现。 */
export interface HalfSeasonSettlement {
  readonly season: number;
  readonly half: 1 | 2;
  readonly tournamentIds: readonly string[];
  readonly totalPrizeMoney: number;
  /** 玩家合同工资收入，按本阶段覆盖月份结算。 */
  readonly salaryIncome: number;
  /** 旧存档兼容字段；新结算不再把工资视为支出。 */
  readonly salaryExpense?: number;
  readonly expenses: number;
  readonly currency: 'USD';
  readonly netBalanceDelta: number;
  readonly mapsPlayed: number;
  readonly kills: number;
  readonly clutchWon: number;
  /** 年度成长审计；仅跨年结算存在。 */
  readonly progression?: AgeProgressionResult | null;
  /** 第二半年结算前的合同到期预警。 */
  readonly contractExpiryWarning?: { readonly contractId: string; readonly teamId: string; readonly endsAt: string } | null;
  /** 年度第二半年结算时，榜单公示已经完成。 */
  readonly top20Published?: boolean;
  readonly top20Ranking?: Top20Ranking | null;
}

/**
 * 第一版完整生涯状态.
 * 所有字段必须是可 JSON 序列化的纯数据，不得把 Service、Repository、Map、Set 或函数写入存档。
 */
export interface StandInLedgerEntry {
  readonly offerId: string;
  readonly season: number;
  readonly half: 1 | 2;
  readonly status: 'ISSUED' | 'COMPLETED' | 'REJECTED' | 'EXPIRED';
  readonly teamId: string;
  readonly occurredAt: string;
}

export interface CareerGameState {
  readonly schemaVersion: number;
  readonly randomSeed?: string;
  readonly randomCursor?: number;
  readonly talentTier?: 'GENIUS' | 'ORDINARY';
  readonly savedAt: string;
  readonly currentDate: string;
  readonly season: number;
  readonly careerHalf: number;
  /** Legacy saves omit these fields and are normalized by the season orchestrator. */
  readonly seasonPhase?: CareerSeasonPhase;
  readonly tournamentCursor?: number;
  readonly eventResume?: CareerEventResumeState | null;
  readonly tournamentResults?: readonly TournamentResult[];
  /** 预选赛独立归档；地图与击杀计入生涯累计，但不进入正式赛事归档和 TOP20 证据。 */
  readonly qualificationResults?: readonly TournamentResult[];
  /** 当前赛事内部阶段；赛事结果结算后保留 POST，便于赛后事件读取上下文。 */
  readonly tournamentPhase?: CareerTournamentPhase | null;
  /** 当前赛事内的比赛/阶段游标，至少从 0（首场）开始。 */
  readonly tournamentMatchCursor?: number;
  readonly activeTournamentId?: string | null;
  /** Opaque, serializable state owned by TournamentService. CareerGame must not inspect payload. */
  readonly activeTournamentState?: TournamentProgressState | null;
  readonly halfSeasonSettlement?: HalfSeasonSettlement | null;
  /** 最近一次跨年成长审计，供下一阶段报告展示。 */
  readonly latestAgeProgression?: AgeProgressionResult | null;

  readonly player: PlayerProfile;
  readonly contracts: readonly PlayerContract[];
  /** Current real-team invitation context referenced by story effects. */
  readonly pendingTransferOffer?: TransferOffer | null;
  readonly pendingStandInOffer?: TournamentStandInOffer | null;
  readonly standInAssignment?: TournamentStandInAssignment | null;
  readonly standInLedger?: readonly StandInLedgerEntry[];
  readonly npcPlayers: readonly NpcPlayerProfile[];

  readonly worldlines: readonly Worldline[];
  readonly currentStoryEventId: string | null;
  readonly completedEventIds: readonly string[];
  /** 重复事件按年度记录，避免同一年度连续抽到同一事件。 */
  readonly repeatableEventHistory?: readonly { readonly eventId: string; readonly season: number }[];
  /** Random narrative events shown in this season. System-triggered events do not consume this quota. */
  readonly seasonNarrativeEventCount?: number;
  /** Tournament cursor where the last quota-consuming event was shown; used to enforce narrative pacing. */
  readonly lastNarrativeTournamentCursor?: number;
  /** Legacy half-season counter retained for save migration only. */
  readonly storyEventsThisHalf?: number;
  readonly pendingSystemEvents?: readonly import('./event-trigger').TriggeredEvent[];

  /** 当前半年由赛事服务自动生成的完整赛历。 */
  readonly scheduledTournaments: readonly TournamentEdition[];
  /** 已完成赛事 ID；赛历中的其余赛事按 calendarOrder 继续推进。 */
  readonly unsettledTournamentIds: readonly string[];
  readonly pendingTournamentInterventions: readonly TournamentIntervention[];
  /** VRS snapshot locked at season start; later ranking changes cannot rewrite invitations. */
  readonly activeVrsSnapshot: VrsInviteSnapshot | null;
  /** Persistent result-driven VRS point adjustments, applied when the next half-season snapshot is frozen. */
  readonly vrsPointsByTeam?: Readonly<Record<string, number>>;
  /** Idempotency ledger for tournament results already projected into VRS points. */
  readonly vrsAppliedResultIds?: readonly string[];
  readonly vrsProjectionRulesVersion?: string;
}

export interface CareerSaveEnvelope {
  readonly format: 'COPE_CAREER_SAVE';
  readonly version: number;
  readonly checksum?: string;
  readonly state: CareerGameState;
}

/** 完整状态仓储；实现可以是 localStorage、IndexedDB、文件或服务端。 */
export interface CareerGameStateRepository {
  load(slotId: string): Promise<CareerSaveEnvelope | null>;
  save(slotId: string, envelope: CareerSaveEnvelope): Promise<void>;
  listSlots(): Promise<readonly string[]>;
  delete(slotId: string): Promise<void>;
}

/** 存档迁移和结构校验接口，避免旧版本存档直接强转为新类型。 */
export interface CareerSaveMigrationService {
  validate(envelope: CareerSaveEnvelope): Promise<{ readonly valid: boolean; readonly errors: readonly string[] }>;
  migrate(envelope: CareerSaveEnvelope, targetVersion: number): Promise<CareerSaveEnvelope>;
}
