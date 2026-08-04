import type { PlayerProfile } from '../engine/profile';
import type { HltvTeamId } from './team';
import type { TransferTargetAsset, TransferTargetRecord, TransferTargetService, TransferTargetView } from './transfer-targets';

export type TransferTargetAssetReader = () => Promise<TransferTargetAsset | null>;

export class TransferTargetServiceImpl implements TransferTargetService {
  public constructor(private readonly reader: TransferTargetAssetReader) {}

  public async list(input: { readonly player: PlayerProfile; readonly snapshotRanks: Readonly<Record<HltvTeamId, number>>; readonly currentTeamTier?: import('./team').TeamTier; readonly randomRoll?: number; readonly invitationWindow?: 'NORMAL' | 'TRANSFER_WINDOW' | 'OFFSEASON' }): Promise<readonly TransferTargetView[]> {
    const records = (await this.reader())?.targets ?? [];
    return records
      .filter((target) => target.teamId !== input.player.currentTeamId)
      .map((target) => {
        const rank = input.snapshotRanks[target.teamId] ?? Number.POSITIVE_INFINITY;
        const unmetRequirements = Object.entries(target.requiredAttributes)
          .filter(([attribute, minimum]) => typeof minimum === 'number' && input.player.attributes[attribute as keyof PlayerProfile['attributes']] < minimum)
          .map(([attribute, minimum]) => `${attribute}:${minimum}`);
        if (target.minimumAge !== undefined && input.player.age < target.minimumAge) unmetRequirements.push(`age>=${target.minimumAge}`);
        if (target.maximumAge !== undefined && input.player.age > target.maximumAge) unmetRequirements.push(`age<=${target.maximumAge}`);
        if (target.requiredTeamConflictMaximum !== undefined && input.player.attributes.teamConflict > target.requiredTeamConflictMaximum) unmetRequirements.push(`teamConflict<=${target.requiredTeamConflictMaximum}`);
        if (target.freeAgentOnly && input.player.freeAgencyStatus !== 'FREE_AGENT' && input.player.currentTeamId !== null) unmetRequirements.push('free-agent-only');
        if (target.currentTeamTierExcluded && input.currentTeamTier === target.currentTeamTierExcluded) unmetRequirements.push(`current-tier!=${target.currentTeamTierExcluded}`);
        const stageBlocked = this.isStageBlocked(input.currentTeamTier, target.tier, target.roleOffer);
        if (stageBlocked) unmetRequirements.push(stageBlocked);
        const windowBlocked = input.invitationWindow === 'NORMAL' && target.tier === 'T1' && target.roleOffer !== 'SUBSTITUTE';
        if (windowBlocked) unmetRequirements.push('transfer-window-required');
        const roll = input.randomRoll;
        const invitationChance = this.invitationChance(input.player.currentTeamId === null || input.player.freeAgencyStatus === 'FREE_AGENT', target.tier, target.roleOffer);
        if (roll !== undefined && (!Number.isFinite(roll) || roll < 0 || roll >= 1)) unmetRequirements.push('invalid-roll');
        if (roll !== undefined && roll >= invitationChance) unmetRequirements.push(`invitation-chance<${invitationChance.toFixed(2)}`);
        const eligible = Number.isFinite(rank) && rank >= target.minimumRank && rank <= target.maximumRank && unmetRequirements.length === 0;
        const offerType = target.roleOffer === 'SUBSTITUTE' ? 'SUBSTITUTE' : target.contractLengthMonths !== undefined && target.contractLengthMonths <= 6 ? 'SHORT_TERM' : 'STANDARD';
        return { ...target, eligible, unmetRequirements, offerType };
      })
      .sort((left, right) => Number(right.eligible) - Number(left.eligible) || left.maximumRank - right.maximumRank || left.teamName.localeCompare(right.teamName));
  }

  private isStageBlocked(current: import('./team').TeamTier | undefined, target: import('./team').TeamTier, role: TransferTargetRecord['roleOffer']): string | null {
    if (!current) return null;
    if (current === 'T3' && target === 'T1' && role !== 'SUBSTITUTE') return 't3-to-t1-substitute-only';
    if (current === 'T3' && target === 'T2' && role !== 'STARTER' && role !== 'SUBSTITUTE') return 't3-to-t2-contract-required';
    if (current === 'T2' && target === 'T1' && role !== 'SUBSTITUTE') return 't2-to-t1-substitute-only';
    return null;
  }

  private invitationChance(freeAgent: boolean, target: import('./team').TeamTier, role: TransferTargetRecord['roleOffer']): number {
    if (target === 'T1') return role === 'SUBSTITUTE' ? (freeAgent ? 0.35 : 0.2) : 0.08;
    if (target === 'T2') return freeAgent ? 0.65 : 0.5;
    return freeAgent ? 0.8 : 0.6;
  }
}
