import type {
  DailyActionDefinition,
  DailyActionDelta,
  DailyActionRepository,
  DailyActionResult,
  DailyActionService,
} from '../daily-action';
import type { PlayerAttribute, PlayerAttributes, PlayerProfile } from '../profile';

const ATTRIBUTE_KEYS: Readonly<Record<PlayerAttribute, keyof PlayerAttributes>> = {
  AIM: 'aim', GAME_SENSE: 'gameSense', LEADERSHIP: 'leadership', CLUTCH: 'clutch', CONSISTENCY: 'consistency', TEAM_CONFLICT: 'teamConflict',
};

type MutableAttributes = { -readonly [Key in keyof PlayerAttributes]: PlayerAttributes[Key] };

export class DailyActionServiceImpl implements DailyActionService {
  public constructor(private readonly repository: DailyActionRepository) {}

  public async listAvailable(input: { readonly player: PlayerProfile; readonly period: DailyActionDefinition['allowedPeriods'][number] }): Promise<readonly DailyActionDefinition[]> {
    if (input.player.isRetired) return [];
    return this.repository.listAvailable(input);
  }

  public async execute(input: { readonly player: PlayerProfile; readonly actionId: string; readonly randomRoll: number }): Promise<DailyActionResult> {
    this.assertRoll(input.randomRoll);
    const action = await this.repository.findById(input.actionId);
    if (!action) return this.rejected(input.player, input.actionId, input.randomRoll, 'NO_TIME_REMAINING');
    if (input.player.isRetired) return this.rejected(input.player, action, input.randomRoll, 'PLAYER_UNAVAILABLE');
    if (!this.requirementsMet(input.player, action)) return this.rejected(input.player, action, input.randomRoll, 'REQUIREMENT_NOT_MET');

    const deltas = this.deltasFor(action, input.randomRoll);
    return { player: this.apply(input.player, deltas), action: this.copy(action), appliedDeltas: deltas, randomRoll: input.randomRoll, completed: true };
  }

  private rejected(player: PlayerProfile, actionOrId: DailyActionDefinition | string, randomRoll: number, reason: NonNullable<DailyActionResult['rejectionReason']>): DailyActionResult {
    const action: DailyActionDefinition = typeof actionOrId === 'string'
      ? { id: actionOrId, type: 'REST', name: actionOrId, description: '', durationHours: 0, requirements: [], allowedPeriods: [] }
      : this.copy(actionOrId);
    return { player: this.copy(player), action, appliedDeltas: [], randomRoll, completed: false, rejectionReason: reason };
  }

  private requirementsMet(player: PlayerProfile, action: DailyActionDefinition): boolean {
    return action.requirements.every((requirement) => {
      const value = requirement.stat === 'ENERGY' ? player.energy : requirement.stat === 'MORALE' ? player.morale : requirement.stat === 'BALANCE' ? player.life.balance : player.life.stress;
      return (requirement.minimum === undefined || value >= requirement.minimum)
        && (requirement.maximum === undefined || value <= requirement.maximum);
    });
  }

  private deltasFor(action: DailyActionDefinition, randomRoll: number): readonly DailyActionDelta[] {
    return (action.deltas ?? []).map((rule) => {
      if (rule.randomRange) {
        const span = Math.max(0, rule.randomRange.maximum - rule.delta);
        return { stat: rule.stat, ...(rule.attribute ? { attribute: rule.attribute } : {}), delta: rule.delta + Math.floor(randomRoll * span), source: rule.source };
      }
      if (rule.randomBonus && randomRoll >= rule.randomBonus.threshold) {
        return { stat: rule.stat, ...(rule.attribute ? { attribute: rule.attribute } : {}), delta: rule.delta + rule.randomBonus.delta, source: rule.source };
      }
      return { stat: rule.stat, ...(rule.attribute ? { attribute: rule.attribute } : {}), delta: rule.delta, source: rule.source };
    });
  }

  private apply(profile: PlayerProfile, deltas: readonly DailyActionDelta[]): PlayerProfile {
    const base = this.copy(profile);
    const attributes: MutableAttributes = { ...base.attributes };
    let energy = base.energy;
    let morale = base.morale;
    let balance = base.life.balance;
    let stress = base.life.stress;
    for (const delta of deltas) {
      if (delta.stat === 'ATTRIBUTE' && delta.attribute) attributes[ATTRIBUTE_KEYS[delta.attribute]] = this.clamp(attributes[ATTRIBUTE_KEYS[delta.attribute]] + delta.delta, 0, 100);
      if (delta.stat === 'ENERGY') energy = this.clamp(energy + delta.delta, 0, 100);
      if (delta.stat === 'MORALE') morale = this.clamp(morale + delta.delta, 0, 100);
      if (delta.stat === 'STRESS') stress = this.clamp(stress + delta.delta, 0, 100);
      if (delta.stat === 'BALANCE') balance += delta.delta;
    }
    return { ...base, attributes, energy, morale, life: { ...base.life, balance, stress } };
  }

  private assertRoll(roll: number): void {
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('randomRoll must be a finite number in [0, 1).');
  }

  private clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
  private copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}
