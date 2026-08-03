import type { ConditionContext, ConditionEvaluator } from '../condition';
import type {
  EventEffect,
  EventPeriod,
  StoryDecision,
  StoryDecisionResult,
  StoryEngine,
  StoryEngineDependencies,
  StoryEvent,
  StorySuccessChancePolicy,
  StoryEventOption,
} from '../graph';
import type { PlayerAttribute, PlayerAttributes, PlayerFlag, PlayerProfile } from '../profile';
import type { StoryEventDirectory } from './story-repository';

const ATTRIBUTE_KEYS: Readonly<Record<PlayerAttribute, keyof PlayerAttributes>> = {
  AIM: 'aim',
  GAME_SENSE: 'gameSense',
  LEADERSHIP: 'leadership',
  CLUTCH: 'clutch',
  CONSISTENCY: 'consistency',
  TEAM_CONFLICT: 'teamConflict',
};

type MutablePlayerAttributes = {
  -readonly [Key in keyof PlayerAttributes]: PlayerAttributes[Key];
};

export class StoryEngineImpl implements StoryEngine {
  public readonly successChancePolicy: StorySuccessChancePolicy;

  public constructor(
    private readonly repository: StoryEventDirectory,
    private readonly conditions: ConditionEvaluator,
    dependencies: StoryEngineDependencies,
  ) {
    this.successChancePolicy = dependencies.successChancePolicy;
  }

  public async findAvailableEvents(input: {
    readonly profile: PlayerProfile;
    readonly period: EventPeriod;
    readonly randomRoll: number;
  }): Promise<readonly StoryEvent[]> {
    if (!this.isRollInRange(input.randomRoll)) return [];
    const context = this.createContext(input.profile, input.randomRoll);
    const events = await this.repository.listEvents();
    return events
      .filter((event) => event.worldlineId === input.profile.worldlineId)
      .filter((event) => event.period === input.period)
      .filter((event) => !event.allowedModes || event.allowedModes.includes(input.profile.difficultyMode))
      .filter((event) => this.conditions.matchesAll(event.conditions, context))
      .filter((event) => !input.profile.completedEventIds.includes(event.id))
      .map((event) => this.copy(event));
  }

  public async decide(input: { readonly profile: PlayerProfile; readonly decision: StoryDecision }): Promise<StoryDecisionResult> {
    const { profile, decision } = input;
    if (!this.isRollInRange(decision.randomRoll)) throw new RangeError('randomRoll must be a finite number in [0, 1).');

    const event = await this.repository.findEvent(decision.eventId);
    if (!event) throw new Error(`Story event not found: ${decision.eventId}.`);
    if (profile.completedEventIds.includes(event.id)) throw new Error(`Story event already completed: ${event.id}.`);
    if (event.allowedModes && !event.allowedModes.includes(profile.difficultyMode)) {
      throw new Error(`Story event is not available in ${profile.difficultyMode} mode.`);
    }

    const context = this.createContext(profile, decision.randomRoll);
    if (!this.conditions.matchesAll(event.conditions, context)) throw new Error(`Story event requirements are not met: ${event.id}.`);

    const option = event.options.find((candidate) => candidate.id === decision.optionId);
    if (!option) throw new Error(`Story option not found: ${decision.optionId}.`);
    if (option.allowedModes && !option.allowedModes.includes(profile.difficultyMode)) {
      throw new Error(`Story option is not available in ${profile.difficultyMode} mode.`);
    }
    if (!this.conditions.matchesAll(option.requirements, context)) throw new Error(`Story option requirements are not met: ${option.id}.`);

    const chance = this.calculateSuccessChance(profile, option);
    const succeeded = decision.randomRoll < chance;
    const effects = [...event.autoEffects, ...(succeeded ? option.outcome.successEffects : option.outcome.failureEffects)];
    const updatedProfile = this.applyEffects(profile, effects, event.id);

    return {
      profile: updatedProfile,
      succeeded,
      appliedEffects: effects.map((effect) => this.copy(effect)),
      appliedTournamentInterventionIds: [],
      terminatedContractId: null,
      nextEventId: succeeded ? option.outcome.successNextEventId ?? null : option.outcome.failureNextEventId ?? null,
    };
  }

  private calculateSuccessChance(profile: PlayerProfile, option: StoryEventOption): number {
    const chance = this.successChancePolicy.adjust({ mode: profile.difficultyMode, baseChance: option.successChance });
    if (!chance) return 1;

    let result = Number.isFinite(chance.baseChance) ? chance.baseChance : 0;
    for (const modifier of chance.modifiers) {
      const attribute = profile.attributes[ATTRIBUTE_KEYS[modifier.attribute]];
      if (!Number.isFinite(attribute) || !Number.isFinite(modifier.perPoint)) continue;
      if (modifier.minimum !== undefined && attribute < modifier.minimum) continue;
      if (modifier.maximum !== undefined && attribute > modifier.maximum) continue;
      result += attribute * modifier.perPoint;
    }
    return Math.max(0, Math.min(1, result));
  }

  private applyEffects(profile: PlayerProfile, effects: readonly EventEffect[], completedEventId: string): PlayerProfile {
    const base = this.copy(profile);
    const attributes: MutablePlayerAttributes = { ...base.attributes };
    let morale = base.morale;
    let energy = base.energy;
    let balance = base.life.balance;
    let stress = base.life.stress;
    let rating2 = base.career.rating2;
    let currentTeamId = base.currentTeamId;
    let role = base.role;
    let worldlineId = base.worldlineId;
    let flags: readonly PlayerFlag[] = base.flags;

    for (const effect of effects) {
      switch (effect.type) {
        case 'ATTRIBUTE_CHANGE': {
          const key = ATTRIBUTE_KEYS[effect.attribute];
          if (Number.isFinite(effect.delta)) attributes[key] = this.clamp(attributes[key] + effect.delta, 0, 100);
          break;
        }
        case 'PLAYER_STAT_CHANGE':
          if (!Number.isFinite(effect.delta)) break;
          switch (effect.stat) {
            case 'MORALE': morale = this.clamp(morale + effect.delta, 0, 100); break;
            case 'ENERGY': energy = this.clamp(energy + effect.delta, 0, 100); break;
            case 'BALANCE': balance += effect.delta; break;
            case 'STRESS': stress = this.clamp(stress + effect.delta, 0, 100); break;
            case 'RATING2': rating2 += effect.delta; break;
          }
          break;
        case 'TEAM_TRANSFER': currentTeamId = effect.teamId; break;
        case 'ROLE_CHANGE': role = effect.role; break;
        case 'WORLDLINE_CHANGE': worldlineId = effect.worldlineId; break;
        case 'FLAG_ADD':
          if (effect.flag && !flags.some((flag) => flag.id === effect.flagId)) flags = [...flags, this.copy(effect.flag)];
          break;
        case 'FLAG_REMOVE': flags = flags.filter((flag) => flag.id !== effect.flagId); break;
        default: break;
      }
    }

    return {
      ...base,
      currentTeamId,
      role,
      worldlineId,
      attributes,
      life: { ...base.life, balance, stress },
      career: { ...base.career, rating2 },
      morale,
      energy,
      flags,
      completedEventIds: base.completedEventIds.includes(completedEventId)
        ? [...base.completedEventIds]
        : [...base.completedEventIds, completedEventId],
    };
  }

  private createContext(profile: PlayerProfile, randomRoll: number): ConditionContext {
    return {
      player: profile,
      currentTeamId: profile.currentTeamId,
      opponentTeamId: null,
      randomRoll,
      difficultyMode: profile.difficultyMode,
    };
  }

  private isRollInRange(roll: number): boolean {
    return Number.isFinite(roll) && roll >= 0 && roll < 1;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
