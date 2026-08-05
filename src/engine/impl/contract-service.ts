import type {
  ContractOperationResponse,
  ContractTerms,
  ForceContractTerminationEffect,
  PlayerContract,
  PlayerContractService,
  ContractTerminationResult,
} from '../contract';
import type { PlayerProfile } from '../profile';
import type { TeamTier } from '../../hltv/team';
import type { ConditionContext, ConditionEvaluator } from '../condition';

/**
 * Contract lifecycle adapter for a CareerGame save aggregate.
 * It keeps the contract rules in one place while leaving persistence to the caller.
 */
export class SaveContractService implements PlayerContractService {
  public constructor(
    contracts: readonly PlayerContract[],
    private readonly conditions: ConditionEvaluator,
    private readonly context: (profile: PlayerProfile) => ConditionContext,
    private readonly teamTier: (teamId: string) => TeamTier | undefined,
  ) {
    this.currentContracts = [...contracts];
  }

  private currentContracts: PlayerContract[];
  public get snapshot(): readonly PlayerContract[] { return this.currentContracts; }

  public async sign(input: { readonly profile: PlayerProfile; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse> {
    const active = this.activeFor(input.profile.id);
    if (active) return { operation: 'SIGN', profile: input.profile, contract: active, previousContract: active, fee: 0, reason: 'ALREADY_SIGNED' };
    const isFirstContract = input.profile.career.teamHistory.length === 0 && input.profile.currentContractId === null && !this.currentContracts.some((contract) => contract.playerId === input.profile.id);
    if (isFirstContract && this.teamTier(input.terms.teamId) !== 'T3') return { operation: 'SIGN', profile: input.profile, reason: 'FIRST_CONTRACT_REQUIRES_T3' };
    const contract = this.createContract(input.profile.id, input.terms, input.occurredAt);
    this.replace(null, contract);
    return { operation: 'SIGN', profile: this.withContract(input.profile, contract), contract, previousContract: null, fee: 0 };
  }

  public async renew(input: { readonly profile: PlayerProfile; readonly contractId: string; readonly terms: Pick<ContractTerms, 'endsAt' | 'salaryPerMonth' | 'buyoutAmount'>; readonly occurredAt: string }): Promise<ContractOperationResponse> {
    const current = this.find(input.contractId);
    if (!current || current.status !== 'ACTIVE') return this.rejection('RENEW', input.profile, 'NO_ACTIVE_CONTRACT');
    if (current.playerId !== input.profile.id) return this.rejection('RENEW', input.profile, 'TEAM_MISMATCH');
    const renewed: PlayerContract = { ...current, endsAt: input.terms.endsAt, salaryPerMonth: input.terms.salaryPerMonth, buyoutAmount: input.terms.buyoutAmount };
    this.replace(current, renewed);
    return { operation: 'RENEW', profile: this.withContract(input.profile, renewed), contract: renewed, previousContract: current, fee: 0 };
  }

  public async transfer(input: { readonly profile: PlayerProfile; readonly currentContractId: string; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse> {
    const current = this.find(input.currentContractId);
    if (!current || current.status !== 'ACTIVE') return this.rejection('TRANSFER', input.profile, 'NO_ACTIVE_CONTRACT');
    if (current.playerId !== input.profile.id || current.teamId !== input.profile.currentTeamId) return this.rejection('TRANSFER', input.profile, 'TEAM_MISMATCH');
    const previousContract = { ...current, status: 'EXPIRED' as const, endsAt: input.occurredAt };
    const next = this.createContract(input.profile.id, input.terms, input.occurredAt);
    this.replace(current, previousContract);
    this.replace(null, next);
    return { operation: 'TRANSFER', profile: this.withContract({ ...input.profile, currentTeamId: input.terms.teamId }, next), contract: next, previousContract, fee: input.terms.buyoutAmount };
  }

  public async buyout(input: { readonly profile: PlayerProfile; readonly currentContractId: string; readonly terms: ContractTerms; readonly occurredAt: string }): Promise<ContractOperationResponse> {
    return this.transfer(input);
  }

  public async expire(input: { readonly profile: PlayerProfile; readonly contractId: string; readonly occurredAt: string }): Promise<ContractOperationResponse> {
    const current = this.find(input.contractId);
    if (!current || current.status !== 'ACTIVE') return this.rejection('EXPIRE', input.profile, 'NO_ACTIVE_CONTRACT');
    if (current.playerId !== input.profile.id) return this.rejection('EXPIRE', input.profile, 'TEAM_MISMATCH');
    if (Date.parse(input.occurredAt) < Date.parse(current.endsAt)) return { operation: 'EXPIRE', profile: input.profile, reason: 'INVALID_TERMS' };
    const expired: PlayerContract = { ...current, status: 'EXPIRED', termination: { reason: 'EXPIRED', terminatedAt: input.occurredAt, matchedConditions: [], note: '合同到期后未续约。' } };
    this.replace(current, expired);
    const { currentTeamTier: _tier, freeAgencySince: _since, releaseReason: _reason, ...released } = input.profile;
    return { operation: 'EXPIRE', profile: { ...released, currentTeamId: null, currentContractId: null, freeAgencyStatus: 'FREE_AGENT', freeAgencySince: input.occurredAt, releaseReason: 'CONTRACT_EXPIRED' }, contract: expired, previousContract: current, fee: 0 };
  }

  public async terminate(input: { readonly profile: PlayerProfile; readonly effect: ForceContractTerminationEffect; readonly sourceStoryEventId: string; readonly sourceOptionId: string; readonly occurredAt: string }): Promise<ContractTerminationResult> {
    const current = this.activeFor(input.profile.id);
    if (!current) return { profile: input.profile, contract: this.find(input.profile.currentContractId ?? '') ?? this.placeholder(input.profile, input.occurredAt), terminated: false, rejectionReason: 'NO_ACTIVE_CONTRACT' };
    const context = this.context(input.profile);
    if (!this.conditions.matchesAll(input.effect.requirements, context)) return { profile: input.profile, contract: current, terminated: false, rejectionReason: 'REQUIREMENTS_NOT_MET' };
    const contract: PlayerContract = {
      ...current,
      status: 'TERMINATED',
      termination: {
        reason: input.effect.reason,
        terminatedAt: input.occurredAt,
        sourceStoryEventId: input.sourceStoryEventId,
        sourceOptionId: input.sourceOptionId,
        matchedConditions: input.effect.requirements,
        note: input.effect.note,
      },
    };
    this.replace(current, contract);
    const { currentTeamTier: _currentTeamTier, ...releasedProfile } = input.profile;
    return { profile: { ...releasedProfile, currentTeamId: null, currentContractId: null, freeAgencyStatus: 'FREE_AGENT', freeAgencySince: input.occurredAt, releaseReason: this.releaseReason(input.effect.reason) }, contract, terminated: true };
  }

  private activeFor(playerId: string): PlayerContract | null { return this.currentContracts.find((contract) => contract.playerId === playerId && contract.status === 'ACTIVE') ?? null; }
  private find(id: string): PlayerContract | null { return this.currentContracts.find((contract) => contract.id === id) ?? null; }
  private replace(previous: PlayerContract | null, next: PlayerContract): void {
    this.currentContracts = [...this.currentContracts.filter((contract) => contract.id !== previous?.id && contract.id !== next.id), next];
  }
  private createContract(playerId: string, terms: ContractTerms, occurredAt: string): PlayerContract { return { id: `contract-${playerId}-${Date.parse(occurredAt)}`, playerId, teamId: terms.teamId, startedAt: terms.startedAt, endsAt: terms.endsAt, salaryPerMonth: terms.salaryPerMonth, status: 'ACTIVE', buyoutAmount: terms.buyoutAmount, ...(terms.role ? { role: terms.role } : {}), ...(terms.expectedPlaytimePercentage !== undefined ? { expectedPlaytimePercentage: terms.expectedPlaytimePercentage } : {}) }; }
  private withContract(profile: PlayerProfile, contract: PlayerContract): PlayerProfile {
    const currentTeamTier = this.teamTier?.(contract.teamId);
    const { freeAgencySince: _freeAgencySince, releaseReason: _releaseReason, ...signedProfile } = profile;
    return { ...signedProfile, currentTeamId: contract.teamId, ...(currentTeamTier ? { currentTeamTier } : {}), currentContractId: contract.id, freeAgencyStatus: 'SIGNED', career: { ...profile.career, teamHistory: profile.career.teamHistory.includes(contract.teamId) ? profile.career.teamHistory : [...profile.career.teamHistory, contract.teamId] } };
  }
  private rejection(operation: 'RENEW' | 'TRANSFER' | 'EXPIRE', profile: PlayerProfile, reason: 'NO_ACTIVE_CONTRACT' | 'TEAM_MISMATCH'): ContractOperationResponse { return { operation, profile, reason }; }
  private placeholder(profile: PlayerProfile, occurredAt: string): PlayerContract { return { id: profile.currentContractId ?? `missing-${profile.id}`, playerId: profile.id, teamId: profile.currentTeamId ?? 'unknown', startedAt: occurredAt, endsAt: occurredAt, salaryPerMonth: 0, status: 'TERMINATED', buyoutAmount: 0 }; }
  private releaseReason(reason: ForceContractTerminationEffect['reason']): 'FORCED_RELEASE' | 'TEAM_REBUILD' | 'NO_ROSTER_SPACE' | 'MUTUAL_TERMINATION' { return reason === 'TEAM_DECISION' ? 'TEAM_REBUILD' : reason === 'MUTUAL_AGREEMENT' ? 'MUTUAL_TERMINATION' : 'FORCED_RELEASE'; }
}
