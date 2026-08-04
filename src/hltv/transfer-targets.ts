import type { CompetitionRegion, HltvTeamId, TeamTier } from './team';
import type { PlayerProfile } from '../engine/profile';

export interface TransferTargetRecord {
  readonly teamId: HltvTeamId;
  readonly teamName: string;
  readonly region: CompetitionRegion;
  readonly tier: TeamTier;
  readonly minimumRank: number;
  readonly maximumRank: number;
  readonly requiredAttributes: Readonly<Partial<Record<'aim' | 'gameSense' | 'leadership' | 'clutch' | 'consistency', number>>>;
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
}

export interface TransferTargetAsset {
  readonly schemaVersion: number;
  readonly targets: readonly TransferTargetRecord[];
}

export interface TransferOffer {
  readonly offerId: string;
  readonly teamId: HltvTeamId;
  readonly teamName: string;
  readonly tier: TeamTier;
  readonly salaryPerMonth: number;
  readonly buyoutAmount: number;
  readonly roleOffer: 'STARTER' | 'SUBSTITUTE' | 'SHORT_TERM';
  readonly source: 'VRS_STANDINGS' | 'CONFIGURED_TARGET';
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface TransferTargetView extends TransferTargetRecord {
  readonly eligible: boolean;
  readonly unmetRequirements: readonly string[];
  readonly offerType?: 'STANDARD' | 'SHORT_TERM' | 'SUBSTITUTE';
}

export interface TransferTargetService {
  list(input: { readonly player: PlayerProfile; readonly snapshotRanks: Readonly<Record<HltvTeamId, number>>; readonly currentTeamTier?: TeamTier; readonly randomRoll?: number; readonly invitationWindow?: 'NORMAL' | 'TRANSFER_WINDOW' | 'OFFSEASON' }): Promise<readonly TransferTargetView[]>;
}
