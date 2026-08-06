import type { HltvPlayerId, HltvTeamId, TeamRosterSlot } from '../hltv/team';
import type { PlayerContract } from './contract';
import type { NpcPlayerProfile } from './npc';
import type { PlayerProfile } from './profile';

/** 战队短板类型，供 AI 经理解释为什么需要换人。 */
export type TeamWeakness = 'LOW_FIREPOWER' | 'NO_AWPer' | 'NO_IGL' | 'LOW_STABILITY' | 'AGING_CORE' | 'ROLE_CONFLICT' | 'INCOMPLETE_ROSTER';
export type TransferCandidateSource = 'PLAYER' | 'NPC';
export type TransferDecisionType = 'RELEASE' | 'SIGN' | 'TRANSFER' | 'BUYOUT' | 'REJECT';

export interface TeamStrengthAssessment {
  readonly teamId: HltvTeamId;
  readonly overallStrength: number;
  readonly weaknesses: readonly TeamWeakness[];
  readonly evaluatedRoster: readonly TeamRosterSlot[];
  readonly agingPlayerIds: readonly HltvPlayerId[];
  readonly evaluatedAt: string;
}

export interface TransferCandidate {
  readonly playerId: HltvPlayerId;
  readonly source: TransferCandidateSource;
  readonly player: PlayerProfile | NpcPlayerProfile;
  readonly estimatedStrength: number;
  readonly fitScore: number;
  readonly expectedSalaryPerMonth: number;
  readonly buyoutCost: number;
}

export interface TransferMarketDecision {
  readonly id: string;
  readonly teamId: HltvTeamId;
  readonly type: TransferDecisionType;
  readonly playerId: HltvPlayerId;
  readonly source: TransferCandidateSource;
  readonly reason: string;
  readonly assessment: TeamStrengthAssessment;
  readonly occurredAt: string;
}

export interface TransferMarketResult {
  readonly teamId: HltvTeamId;
  readonly assessment: TeamStrengthAssessment;
  readonly decisions: readonly TransferMarketDecision[];
  readonly signedContracts: readonly PlayerContract[];
  readonly releasedPlayerIds: readonly HltvPlayerId[];
  /** Atomic NPC world projection after this manager window. */
  readonly npcPlayers?: readonly NpcPlayerProfile[];
}

/** AI 战队经理从队伍短板到候选人签约的完整市场服务。 */
export interface TransferMarketService {
  assessTeam(input: { readonly teamId: HltvTeamId; readonly at: string }): Promise<TeamStrengthAssessment>;
  findCandidates(input: { readonly teamId: HltvTeamId; readonly weaknesses: readonly TeamWeakness[]; readonly maxResults: number; readonly npcPlayers?: readonly NpcPlayerProfile[] }): Promise<readonly TransferCandidate[]>;
  releasePlayer(input: { readonly teamId: HltvTeamId; readonly playerId: HltvPlayerId; readonly reason: string; readonly occurredAt: string }): Promise<TransferMarketDecision>;
  signCandidate(input: { readonly teamId: HltvTeamId; readonly candidate: TransferCandidate; readonly occurredAt: string }): Promise<TransferMarketDecision>;
  runManagerWindow(input: { readonly teamId: HltvTeamId; readonly at: string; readonly maxMoves: number; readonly npcPlayers?: readonly NpcPlayerProfile[] }): Promise<TransferMarketResult>;
}
