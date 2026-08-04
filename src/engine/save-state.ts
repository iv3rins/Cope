import type { VrsInviteSnapshot } from '../hltv/team';
import type { TournamentEdition, TournamentIntervention, TournamentResult } from '../hltv/tournament';
import type { Top20Ranking } from '../hltv/top20';
import type { NpcPlayerProfile } from './npc';
import type { PlayerContract } from './contract';
import type { PlayerProfile } from './profile';
import type { Worldline } from './graph';
import type { TransferOffer } from '../hltv/transfer-targets';

/** 赛季主舞台状态；持久化后由组合根决定渲染哪个 phase。 */
export type CareerSeasonPhase = 'READY' | 'ACTIVE' | 'EVENT' | 'REPORT' | 'OFFSEASON' | 'RETIRED';
export type CareerTournamentPhase = 'PRE' | 'IN' | 'POST';

/** 事件完成后的恢复目标，禁止 UI 根据事件标题或窗口自行推断。 */
export type CareerEventResume = 'START_SEASON' | 'CONTINUE_SEASON' | 'CONTINUE_REPORT';

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
  readonly salaryExpense: number;
  readonly netBalanceDelta: number;
  readonly mapsPlayed: number;
  readonly kills: number;
  readonly clutchWon: number;
  /** 年度第二半年结算时，榜单公示已经完成。 */
  readonly top20Published?: boolean;
  readonly top20Ranking?: Top20Ranking | null;
}

/**
 * 第一版完整生涯状态.
 * 所有字段必须是可 JSON 序列化的纯数据，不得把 Service、Repository、Map、Set 或函数写入存档。
 */
export interface CareerGameState {
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly currentDate: string;
  readonly season: number;
  readonly careerHalf: number;
  /** Legacy saves omit these fields and are normalized by the season orchestrator. */
  readonly seasonPhase?: CareerSeasonPhase;
  readonly tournamentCursor?: number;
  readonly eventResume?: CareerEventResumeState | null;
  readonly tournamentResults?: readonly TournamentResult[];
  /** 当前赛事内部阶段；赛事结果结算后保留 POST，便于赛后事件读取上下文。 */
  readonly tournamentPhase?: CareerTournamentPhase | null;
  /** 当前赛事内的比赛/阶段游标，至少从 0（首场）开始。 */
  readonly tournamentMatchCursor?: number;
  readonly activeTournamentId?: string | null;
  readonly halfSeasonSettlement?: HalfSeasonSettlement | null;

  readonly player: PlayerProfile;
  readonly contracts: readonly PlayerContract[];
  /** Current real-team invitation context referenced by story effects. */
  readonly pendingTransferOffer?: TransferOffer | null;
  readonly npcPlayers: readonly NpcPlayerProfile[];

  readonly worldlines: readonly Worldline[];
  readonly currentStoryEventId: string | null;
  readonly completedEventIds: readonly string[];
  /** 重复事件按年度记录，避免同一年度连续抽到同一事件。 */
  readonly repeatableEventHistory?: readonly { readonly eventId: string; readonly season: number }[];
  /** 本半年已展示的剧情事件数；硬核模式最多 4 个。 */
  readonly storyEventsThisHalf?: number;

  /** 当前半年由赛事服务自动生成的完整赛历。 */
  readonly scheduledTournaments: readonly TournamentEdition[];
  /** 已完成赛事 ID；赛历中的其余赛事按 calendarOrder 继续推进。 */
  readonly unsettledTournamentIds: readonly string[];
  readonly pendingTournamentInterventions: readonly TournamentIntervention[];
  /** VRS snapshot locked at season start; later ranking changes cannot rewrite invitations. */
  readonly activeVrsSnapshot: VrsInviteSnapshot | null;
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
