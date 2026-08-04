import type { ConditionContext, ConditionEvaluator } from '../condition';
import type {
  EventEffect,
  EventPeriod,
  StoryDecision,
  StoryDecisionResult,
  StoryEngine,
  StoryEngineDependencies,
  StoryEvent,
  StoryEventPhase,
  StorySuccessChancePolicy,
  StoryEventOption,
  StoryContextFacts,
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
    readonly phase?: StoryEventPhase;
    readonly randomRoll: number;
    readonly facts?: StoryContextFacts;
  }): Promise<readonly StoryEvent[]> {
    if (!this.isRollInRange(input.randomRoll)) return [];
    const context = this.createContext(input.profile, input.randomRoll, input.facts);
    const events = await this.repository.listEvents();
    return events
      .filter((event) => event.worldlineId === input.profile.worldlineId)
      .filter((event) => event.period === input.period)
      .filter((event) => !input.phase || this.eventPhase(event) === input.phase)
      .filter((event) => !event.allowedModes || event.allowedModes.includes(input.profile.difficultyMode))
      .filter((event) => this.conditions.matchesAll(event.conditions, context))
      .filter((event) => event.repeatable || !input.profile.completedEventIds.includes(event.id))
      .map((event) => this.copy(event));
  }

  public async decide(input: { readonly profile: PlayerProfile; readonly decision: StoryDecision; readonly facts?: StoryContextFacts }): Promise<StoryDecisionResult> {
    const { profile, decision } = input;
    if (!this.isRollInRange(decision.randomRoll)) throw new RangeError('randomRoll must be a finite number in [0, 1).');

    const event = await this.repository.findEvent(decision.eventId);
    if (!event) throw new Error(`Story event not found: ${decision.eventId}.`);
    if (!event.repeatable && profile.completedEventIds.includes(event.id)) throw new Error(`Story event already completed: ${event.id}.`);
    if (event.allowedModes && !event.allowedModes.includes(profile.difficultyMode)) {
      throw new Error(`Story event is not available in ${profile.difficultyMode} mode.`);
    }

    const context = this.createContext(profile, decision.randomRoll, input.facts);
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
      resultMessages: this.getResultMessages(option.outcome, succeeded),
    };
  }

  private eventPhase(event: StoryEvent): StoryEventPhase {
    if (event.phase) return event.phase;
    if (event.period === 'FINAL_DECISIVE_MOMENT') return 'IN_TOURNAMENT';
    if (event.period === 'AFTER_TOP20' || event.period === 'OFFSEASON') return 'POST_TOURNAMENT';
    return 'PRE_TOURNAMENT';
  }

  private getResultMessages(outcome: StoryEventOption['outcome'], succeeded: boolean): readonly string[] {
    const messages = succeeded ? outcome.successMessages : outcome.failureMessages;
    return messages?.filter((message) => typeof message === 'string' && message.trim().length > 0).map((message) => message.trim()) ?? [];
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
    let totalKills = base.career.totalKills;
    let mapsPlayed = base.career.mapsPlayed;
    let clutchWon = base.career.clutchWon;
    let careerEarnings = base.career.careerEarnings;
    let majorChampionships = base.trophies.majorChampionships;
    let otherSTierTitles = base.trophies.otherSTierTitles;
    let mvpAwards = base.trophies.mvpAwards;
    let evpAwards = base.trophies.evpAwards;
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
        case 'TROPHY_CHANGE':
          if (!Number.isFinite(effect.delta)) break;
          if (effect.trophy === 'MAJOR') majorChampionships += effect.delta;
          if (effect.trophy === 'S_TIER') otherSTierTitles += effect.delta;
          if (effect.trophy === 'MVP') mvpAwards += effect.delta;
          if (effect.trophy === 'EVP') evpAwards += effect.delta;
          break;
        case 'CAREER_STAT_CHANGE':
          if (!Number.isFinite(effect.delta)) break;
          if (effect.stat === 'TOTAL_KILLS') totalKills += effect.delta;
          if (effect.stat === 'MAPS_PLAYED') mapsPlayed += effect.delta;
          if (effect.stat === 'CLUTCH_WON') clutchWon += effect.delta;
          if (effect.stat === 'CAREER_EARNINGS') careerEarnings += effect.delta;
          break;
        case 'ADVANCE_STORY':
          break;
        case 'TOURNAMENT_INTERVENTION':
          throw new Error('Tournament interventions require a tournament event gateway.');
        case 'FORCE_CONTRACT_TERMINATION':
          // Contract lifecycle is finalized by CareerGame after this decision.
          break;
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
      career: { ...base.career, rating2, totalKills, mapsPlayed, clutchWon, careerEarnings },
      trophies: { ...base.trophies, majorChampionships, otherSTierTitles, mvpAwards, evpAwards },
      morale,
      energy,
      flags,
      completedEventIds: base.completedEventIds.includes(completedEventId)
        ? [...base.completedEventIds]
        : [...base.completedEventIds, completedEventId],
    };
  }

  private createContext(profile: PlayerProfile, randomRoll: number, facts: StoryContextFacts = {}): ConditionContext {
    return {
      player: profile,
      currentTeamId: profile.currentTeamId,
      opponentTeamId: null,
      randomRoll,
      difficultyMode: profile.difficultyMode,
      ...facts,
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
