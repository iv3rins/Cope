import type { MatchSimulationResult } from './match';
import type { HltvPlayerId, HltvTeamId, TeamRosterSlot, VrsInviteSnapshot } from './team';

/** HLTV 赛事与资格赛接口。该模块不关心生涯事件、UI 或存档。 */
export type TournamentId = string;
export type TournamentTier = 'QUALIFIER' | 'UNRANKED' | 'T2' | 'T1' | 'MAJOR';
export type TournamentNode = 'QUALIFIER' | 'MAIN_EVENT';
export type MatchFormat = 'BO1' | 'BO3' | 'BO5';
export type QualificationSource = 'DIRECT_VRS' | 'PUBLIC_QUALIFIER' | 'SNAPSHOT_REPLACEMENT' | 'OPEN_ENTRY' | 'REGIONAL_SLOT';
export type QualificationStatus = 'DIRECT' | 'QUALIFIER_PENDING' | 'QUALIFIED' | 'QUALIFIER_EXIT';
export type TournamentPlacement = 'CHAMPION' | 'RUNNER_UP' | 'SEMIFINAL' | 'QUARTERFINAL' | 'GROUP_EXIT' | 'QUALIFIED' | 'QUALIFIER_EXIT';
export type HonorType = 'MVP' | 'EVP' | 'VP';
export type HonorClass = 'NONE' | 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE' | 'MAJOR';
/** 赛事中期由剧情事件触发的影响类别。 */
export type TournamentInterventionType = 'TEAM_STRENGTH' | 'OPPONENT_STRENGTH' | 'UPSET_CHANCE' | 'FORCE_UPSET';
export type TournamentSimulationMode = 'FAST' | 'SWISS';
export type TournamentProgressStatus = 'ONGOING' | 'COMPLETED' | 'QUALIFIER_EXIT';
export type TournamentLifecycleHook = 'PRE_TOURNAMENT' | 'IN_TOURNAMENT' | 'POST_TOURNAMENT';

/** 长期赛事配置，例如 IEM Cologne。 */
export interface TournamentSeries {
  readonly id: string;
  readonly organizerId: string;
  readonly nameTemplate: string;
  readonly tier: TournamentTier;
  readonly honorClass: HonorClass;
  readonly ranked: boolean;
  readonly formats: readonly MatchFormat[];
  readonly pressure: number;
}

/** 一个赛季内实际发生的一届赛事。 */
export interface TournamentEdition {
  readonly id: TournamentId;
  readonly seriesId: string;
  /** Optional presentation metadata retained in the immutable edition snapshot. */
  readonly city?: string;
  readonly prizePool?: number;
  readonly format?: MatchFormat;
  readonly name: string;
  readonly season: number;
  readonly half: 1 | 2;
  readonly calendarOrder: number;
  readonly tier: TournamentTier;
  readonly honorClass: HonorClass;
  readonly node: TournamentNode;
  /** Major uses interactive Swiss progression; other events use an automatically advanced Fast lifecycle. */
  readonly simulationMode?: TournamentSimulationMode;
  readonly teamId: HltvTeamId;
  readonly qualificationSource: QualificationSource;
  readonly vrsSnapshotId: string | null;
  readonly snapshotRank: number | null;
  readonly rosterLockCareerHalf: number;
  readonly targetEditionId: TournamentId | null;
  /** Qualification is a property of this locked calendar row; failed qualifiers remain in the calendar. */
  readonly qualificationStatus?: QualificationStatus;
}

/** 资格结算中保留概率与掷骰，支持展示、审计与存档回放。 */
export interface QualificationDecision {
  readonly editionId: TournamentId;
  readonly teamId: HltvTeamId;
  readonly qualified: boolean;
  readonly source: QualificationSource;
  readonly chance?: number;
  readonly roll?: number;
  readonly reasons: Readonly<Record<string, number | string | boolean>>;
}

export interface TournamentStandInOffer {
  readonly offerId: string;
  readonly edition: TournamentEdition;
  readonly teamId: HltvTeamId;
  readonly teamName: string;
  readonly tier?: import('./team').TeamTier;
  readonly reason?: string;
  readonly appearanceFee: number;
  readonly perMapBonus: number;
  readonly prizeSharePercentage: number;
  readonly status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  readonly createdAt: string;
  readonly targetRole: import('../engine/profile').PlayerRole;
  readonly expectedPlaytimePercentage: number;
  readonly risk: import('./transfer-targets').TransferRisk;
  readonly expiresAt: string;
}

export interface TournamentStandInAssignment {
  readonly offerId: string;
  readonly editionId: TournamentId;
  readonly teamId: HltvTeamId;
  readonly playerId: HltvPlayerId;
  readonly appearanceFee: number;
  readonly perMapBonus: number;
  readonly prizeSharePercentage: number;
  readonly targetRole?: import('../engine/profile').PlayerRole;
}

/** 锁阵结果是某届赛事的唯一代表阵容。 */
export interface TournamentRosterLock {
  readonly editionId: TournamentId;
  readonly teamId: HltvTeamId;
  readonly lockedAtCareerHalf: number;
  readonly roster: readonly TeamRosterSlot[];
  readonly substitutePlayerId: HltvPlayerId | null;
}

/** 单名选手可投影给 TOP20 的赛事表现。 */
/**
 * 赛事中期事件产生的可追溯修正。
 * - TEAM_STRENGTH：改变玩家所在战队的本届赛事战力。
 * - OPPONENT_STRENGTH：改变指定对手的本届赛事战力。
 * - UPSET_CHANCE：增减本届赛事发生爆冷的概率。
 * - FORCE_UPSET：强制本届赛事发生或不发生爆冷，适用于决定性剧情。
 *
 * 该对象由 Engine 创建并交给赛事服务消费；赛事服务必须将已消费的修正写入结果。
 */
export interface TournamentIntervention {
  readonly id: string;
  readonly editionId: TournamentId;
  readonly sourceStoryEventId: string;
  readonly sourceOptionId: string;
  readonly type: TournamentInterventionType;
  /** TEAM_STRENGTH / OPPONENT_STRENGTH / UPSET_CHANCE 使用的数值增量。 */
  readonly delta?: number;
  /** OPPONENT_STRENGTH 的目标对手；其他类型应为 null。 */
  readonly opponentTeamId?: HltvTeamId | null;
  /** FORCE_UPSET 的明确结果；其他类型应为 null。 */
  readonly forceUpset?: boolean | null;
  readonly occurredAt: string;
  readonly description: string;
}

/** 赛事模拟使用的局势快照，包含事件修正与最终爆冷掷骰。 */
export interface TournamentSimulationContext {
  readonly editionId: TournamentId;
  readonly baseTeamStrength: number;
  readonly baseOpponentStrength: Readonly<Record<HltvTeamId, number>>;
  readonly interventions: readonly TournamentIntervention[];
  /** [0, 1) 的可回放掷骰；仅在没有 FORCE_UPSET 时用于判定爆冷。 */
  readonly upsetRoll: number;
}

/** 赛事爆冷的判定与计算过程，必须随结果保留供 UI、存档和调试使用。 */
export interface UpsetDecision {
  readonly occurred: boolean;
  readonly chance: number;
  readonly roll: number | null;
  readonly forcedByInterventionId: string | null;
  readonly contributingInterventionIds: readonly string[];
}

export interface TournamentSeriesDetail {
  readonly stage: string;
  readonly format: MatchFormat;
  readonly opponentTeamId: HltvTeamId;
  readonly opponentRank: number | null;
  readonly mapScores: readonly string[];
}

/** Tournament-level honor ownership. A player performance may reference one of these honors, but ownership is decided once per tournament. */
export interface TournamentHonor {
  readonly playerId: HltvPlayerId;
  readonly type: HonorType;
  readonly honorClass: HonorClass;
}

/** Canonical team outcome settled once for the tournament and inherited by every locked roster member. */
export interface TournamentTeamPlacement {
  readonly teamId: HltvTeamId;
  readonly placement: TournamentPlacement;
  readonly title: boolean;
  readonly rosterPlayerIds: readonly HltvPlayerId[];
}

/** Serializable state owned and interpreted exclusively by TournamentService. */
export interface TournamentProgressState {
  readonly tournamentId: TournamentId;
  readonly mode: TournamentSimulationMode;
  readonly revision: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** A mode-neutral response to one tournament lifecycle advance. */
export interface TournamentAdvanceResult {
  readonly status: TournamentProgressStatus;
  readonly state: TournamentProgressState | null;
  readonly lifecycleHook: TournamentLifecycleHook | null;
  readonly uiData: Readonly<Record<string, unknown>>;
  readonly result: TournamentResult | null;
}

export interface TournamentPlayerPerformance {
  readonly playerId: HltvPlayerId;
  readonly teamId: HltvTeamId;
  readonly maps: number;
  /** 来自 MatchPlayerPerformance，供 TOP20 和荣誉结算使用。 */
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly rating: number;
  readonly adr?: number;
  readonly kast?: number;
  readonly headshotPercentage?: number;
  readonly firstKills?: number;
  readonly firstDeaths?: number;
  readonly clutchesWon?: number;
  readonly playoffMaps: number;
  readonly playoffRating: number;
  readonly top5Maps: number;
  readonly top5Rating: number;
  readonly finalMaps: number;
  readonly finalRating: number | null;
  readonly honor: HonorType | null;
}

/** 赛事模拟或外部数据录入后的最终结果。 */
export interface TournamentResult {
  readonly editionId: TournamentId;
  readonly city?: string;
  /** Legacy alias for the team's prize; new consumers should use teamPrizeMoney. */
  readonly prizeMoney?: number;
  readonly teamPrizeMoney?: number;
  /** Career-layer personal payout after roster share or stand-in terms. */
  readonly playerPrizeIncome?: number;
  readonly seriesDetails?: readonly TournamentSeriesDetail[];
  readonly seriesId: string;
  readonly season: number;
  readonly eventName: string;
  readonly teamId: HltvTeamId;
  readonly tier: TournamentTier;
  readonly honorClass: HonorClass;
  readonly placement: TournamentPlacement;
  readonly title: boolean;
  readonly qualificationSource: QualificationSource;
  readonly vrsSnapshotId: string | null;
  /** 本届赛事的爆冷判定；无爆冷也要保留判定记录。 */
  readonly upset: UpsetDecision;
  /** 已被赛事结果消费的剧情修正，禁止遗漏以保证回放一致。 */
  readonly consumedInterventions: readonly TournamentIntervention[];
  /** Both Fast and Swiss modes emit the same match-level facts. */
  readonly matchResults: readonly MatchSimulationResult[];
  /** Single source of truth for every participating team's placement and title. */
  readonly teamPlacements: readonly TournamentTeamPlacement[];
  /** All participating roster members are projected from the same tournament result. */
  readonly playerPerformances: readonly TournamentPlayerPerformance[];
  readonly honors: readonly TournamentHonor[];
}

/** 赛事模块对外发布的事实，禁止使用无类型 payload。 */
export type TournamentFact = TournamentQualifiedFact | TournamentRosterLockedFact | TournamentInterventionAppliedFact | TournamentCompletedFact;

export interface TournamentQualifiedFact {
  readonly type: 'TOURNAMENT_QUALIFIED';
  readonly occurredAt: string;
  readonly decision: QualificationDecision;
}

export interface TournamentRosterLockedFact {
  readonly type: 'TOURNAMENT_ROSTER_LOCKED';
  readonly occurredAt: string;
  readonly rosterLock: TournamentRosterLock;
}

/** Engine 在剧情事件完成后登记赛事修正，赛事结算前不可丢弃或覆盖。 */
export interface TournamentInterventionAppliedFact {
  readonly type: 'TOURNAMENT_INTERVENTION_APPLIED';
  readonly occurredAt: string;
  readonly intervention: TournamentIntervention;
}

export interface TournamentCompletedFact {
  readonly type: 'TOURNAMENT_COMPLETED';
  readonly occurredAt: string;
  readonly result: TournamentResult;
}

/** 赛事系统能力接口，具体算法和随机数来源由后续实现注入。 */
export interface TournamentService {
  createCalendar(input: { readonly season: number; readonly half: 1 | 2; readonly teamId: HltvTeamId; readonly snapshot: VrsInviteSnapshot }): Promise<readonly TournamentEdition[]>;
  decideQualification(input: { readonly edition: TournamentEdition; readonly snapshot: VrsInviteSnapshot; readonly roll: number }): Promise<QualificationDecision>;
  lockRoster(input: { readonly edition: TournamentEdition; readonly roster: readonly TeamRosterSlot[]; readonly careerHalf: number; readonly substitutePlayerId?: HltvPlayerId | null; readonly targetRole?: import('../engine/profile').PlayerRole }): Promise<TournamentRosterLock>;
  /** 登记剧情带来的赛事中期修正；同一 id 重复登记必须幂等。 */
  applyIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact>;
  /** 读取当前尚未消费的赛事修正，供赛程页展示及模拟器组装上下文。 */
  findPendingInterventions(editionId: TournamentId): Promise<readonly TournamentIntervention[]>;
  /** Starts a mode-neutral tournament lifecycle. The returned state is opaque to callers and safe to persist. */
  start(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[] }): Promise<TournamentAdvanceResult>;
  /** Advances one lifecycle node. Fast mode advances automatically through its internal matches; Swiss mode advances one Swiss round. */
  advance(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[]; readonly state: TournamentProgressState }): Promise<TournamentAdvanceResult>;
  /** Backwards-compatible full simulation for non-interactive callers. */
  simulate(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext }): Promise<TournamentResult>;
  settle(input: { readonly edition: TournamentEdition; readonly result: TournamentResult }): Promise<TournamentCompletedFact>;
}

/** 赛事事实写入端口，幂等性由实现层保证。 */
export interface TournamentFactRepository {
  hasCompleted(editionId: TournamentId): Promise<boolean>;
  append(fact: TournamentFact): Promise<void>;
}
