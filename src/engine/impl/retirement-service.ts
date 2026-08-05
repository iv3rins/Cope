import type { PlayerProfile } from '../profile';
import type { RetirementService } from '../retirement';

export class RetirementServiceImpl implements RetirementService {
  public async retire(input: { readonly player: PlayerProfile; readonly reason?: string; readonly retiredAt: string }): Promise<PlayerProfile> {
    if (Number.isNaN(Date.parse(input.retiredAt))) throw new Error('retiredAt must be a valid ISO date.');
    if (input.player.isRetired) return this.copy(input.player);
    return { ...this.copy(input.player), isRetired: true, retiredAt: input.retiredAt, ...(input.reason ? { retirementReason: input.reason } : {}), currentTeamId: null, currentContractId: null };
  }

  private copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}
