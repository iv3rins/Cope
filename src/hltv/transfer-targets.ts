import type { CompetitionRegion, HltvTeamId, TeamTier } from './team';
import type { PlayerProfile, PlayerRole } from '../engine/profile';

export type TransferAvailability = 'RECOMMENDED' | 'PERSUADABLE' | 'UNREACHABLE';
export type TransferRisk = 'LOW' | 'MEDIUM' | 'HIGH' | string;

export interface TransferTargetRecord {
  readonly teamId: HltvTeamId;
  readonly teamName: string;
  readonly region: CompetitionRegion;
  readonly tier: TeamTier;
  readonly minimumRank: number;
  readonly maximumRank: number;
  readonly requiredAttributes: Readonly<Partial<Record<'aim' | 'gameSense' | 'leadership' | 'clutch' | 'consistency', number>>>;
  readonly requiredRoles?: readonly PlayerRole[];
  readonly salaryPerMonth: number;
  readonly buyoutAmount: number;
  readonly reason: string;
  readonly minimumAge?: number;
  readonly maximumAge?: number;
  readonly requiredTeamConflictMaximum?: number;
  readonly freeAgentOnly?: boolean;
  readonly currentTeamTierExcluded?: TeamTier;
  readonly roleOffer?: 'STARTER' | 'SUBSTITUTE';
  readonly contractLengthMonths?: number;
  /** Hard career gates. Fit scoring remains informative even when a gate is missed. */
  readonly minimumRecentRating?: number;
  readonly minimumCareerMaps?: number;
  readonly minimumT1MajorMaps?: number;
  readonly preferredRegions?: readonly CompetitionRegion[];
  readonly risk?: TransferRisk;
  readonly expectedPlaytimePercentage?: number;
}

export interface TransferTargetAsset { readonly schemaVersion: number; readonly targets: readonly TransferTargetRecord[]; }

export interface TransferOffer {
  readonly offerId: string; readonly teamId: HltvTeamId; readonly teamName: string; readonly tier: TeamTier;
  readonly salaryPerMonth: number; readonly buyoutAmount: number; readonly roleOffer: 'STARTER' | 'SUBSTITUTE' | 'SHORT_TERM';
  /** Normalized terms snapshot. Optional for legacy save compatibility. */
  readonly contract?: TransferContractDto;
  readonly source: 'VRS_STANDINGS' | 'CONFIGURED_TARGET'; readonly createdAt: string; readonly expiresAt: string;
}

export interface TransferContractDto {
  readonly salaryPerMonth: number; readonly buyoutAmount: number; readonly lengthMonths: number;
  readonly role: 'STARTER' | 'SUBSTITUTE'; readonly expectedPlaytimePercentage: number;
}

export interface TransferTargetView extends TransferTargetRecord {
  readonly eligible: boolean;
  readonly unmetRequirements: readonly string[];
  readonly offerType?: 'STANDARD' | 'SHORT_TERM' | 'SUBSTITUTE';
  readonly fitScore: number;
  readonly interestScore: number;
  readonly availability: TransferAvailability;
  readonly reasons: readonly string[];
  readonly risks: readonly string[];
  readonly contract: TransferContractDto;
}

export interface TransferTargetListInput {
  readonly player: PlayerProfile;
  readonly snapshotRanks: Readonly<Record<HltvTeamId, number>>;
  readonly currentTeamTier?: TeamTier;
  /** Stable market/window identity. The same marketKey reproduces each team's independent interest. */
  readonly marketKey?: string;
  /** Legacy input, validated for compatibility but never shared as a team-wide decision roll. */
  readonly randomRoll?: number;
  readonly invitationWindow?: 'NORMAL' | 'TRANSFER_WINDOW' | 'OFFSEASON';
  /** Internal consumers such as stand-in matching may opt out of the player-market top-four cap. */
  readonly maxResults?: number;
}
export interface TransferTargetService { list(input: TransferTargetListInput): Promise<readonly TransferTargetView[]>; }
