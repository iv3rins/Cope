import type { PlayerAttribute, PlayerAttributes, PlayerFlag, PlayerProfile } from '../profile';
import type { GameDifficultyMode, GameModeRule } from '../mode';
import type {
  AgePhase,
  AgeProgressionResult,
  AttributeDelta,
  PlayerProgressionRuleRepository,
  PlayerProgressionService,
  RegionOriginRule,
} from '../progression';

const ATTRIBUTE_KEYS: Readonly<Record<PlayerAttribute, keyof PlayerAttributes>> = {
  AIM: 'aim',
  GAME_SENSE: 'gameSense',
  LEADERSHIP: 'leadership',
  CLUTCH: 'clutch',
  CONSISTENCY: 'consistency',
  TEAM_CONFLICT: 'teamConflict',
};

const MIN_ATTRIBUTE_VALUE = 0;
const MAX_ATTRIBUTE_VALUE = 100;
const MIN_VITAL_VALUE = 0;
const MAX_VITAL_VALUE = 100;

type MutablePlayerAttributes = {
  -readonly [Key in keyof PlayerAttributes]: PlayerAttributes[Key];
};

export class PlayerProgressionServiceImpl implements PlayerProgressionService {
  public constructor(private readonly rules: PlayerProgressionRuleRepository) {}

  public async createProfile(input: {
    readonly profile: PlayerProfile;
    readonly difficultyMode: GameDifficultyMode;
    readonly originRule: RegionOriginRule;
    readonly modeRule: GameModeRule;
  }): Promise<PlayerProfile> {
    const { difficultyMode, originRule, modeRule } = input;
    const profile = this.copyProfile(input.profile);

    if (profile.difficultyMode !== difficultyMode) {
      throw new Error('PlayerProfile difficultyMode must match the requested difficulty mode.');
    }
    if (modeRule.mode !== difficultyMode) {
      throw new Error('GameModeRule mode must match the requested difficulty mode.');
    }
    if (profile.originRegion !== originRule.region) {
      throw new Error('PlayerProfile originRegion must match the RegionOriginRule region.');
    }

    return {
      ...profile,
      attributes: this.applyDeltas(profile.attributes, originRule.initialAttributeDeltas),
      life: {
        ...profile.life,
        balance: profile.life.balance + modeRule.initialBalanceBonus,
      },
      morale: this.clampVital(profile.morale + modeRule.initialMoraleBonus),
      energy: this.clampVital(profile.energy + modeRule.initialEnergyBonus),
      flags: this.mergeFlags(profile.flags, originRule.originFlags),
    };
  }

  public async advanceAge(input: {
    readonly profile: PlayerProfile;
    readonly originRule: RegionOriginRule;
    readonly years?: number;
  }): Promise<AgeProgressionResult> {
    const profile = this.copyProfile(input.profile);
    const years = input.years ?? 1;
    if (!Number.isInteger(years) || years < 1) {
      throw new RangeError('years must be a positive integer.');
    }
    if (profile.originRegion !== input.originRule.region) {
      throw new Error('PlayerProfile originRegion must match the RegionOriginRule region.');
    }

    let age = profile.age;
    let attributes = { ...profile.attributes };
    let phase = this.getAgePhase(age);
    const appliedDeltas: AttributeDelta[] = [];

    for (let year = 0; year < years; year += 1) {
      age += 1;
      phase = this.getAgePhase(age);
      const ageRule = await this.rules.findAgeRule(phase);
      const baseDeltas = ageRule?.baseAttributeDeltas ?? [];
      const regionalDeltas = input.originRule.agePhaseAttributeDeltas[phase] ?? [];
      const deltas = [...baseDeltas, ...regionalDeltas];

      attributes = this.applyDeltas(attributes, deltas);
      appliedDeltas.push(...deltas.map((delta) => ({ ...delta })));
    }

    const flags = this.mergeFlags(profile.flags, input.originRule.originFlags);
    const grantedFlags = flags.filter((flag) => !profile.flags.some((existing) => existing.id === flag.id));

    return {
      previousAge: profile.age,
      currentAge: age,
      phase,
      appliedDeltas,
      grantedFlags,
      profile: {
        ...profile,
        age,
        attributes,
        flags,
      },
    };
  }

  public getAgePhase(age: number): AgePhase {
    if (!Number.isFinite(age) || age < 0) {
      throw new RangeError('age must be a non-negative finite number.');
    }
    if (age < 21) return 'DEVELOPMENT';
    if (age <= 25) return 'PEAK';
    if (age <= 29) return 'GRADUAL_DECLINE';
    return 'SHARP_DECLINE';
  }

  private applyDeltas(attributes: PlayerAttributes, deltas: readonly AttributeDelta[]): PlayerAttributes {
    const next: MutablePlayerAttributes = { ...attributes };
    for (const delta of deltas) {
      if (!Number.isFinite(delta.delta)) continue;
      const key = ATTRIBUTE_KEYS[delta.attribute];
      if (!key) continue;
      next[key] = this.clampAttribute(next[key] + delta.delta);
    }
    return next;
  }

  private mergeFlags(existing: readonly PlayerFlag[], additions: readonly PlayerFlag[]): readonly PlayerFlag[] {
    const flags = existing.map((flag) => this.copyFlag(flag));
    const existingIds = new Set(flags.map((flag) => flag.id));
    for (const flag of additions) {
      if (!existingIds.has(flag.id)) {
        flags.push(this.copyFlag(flag));
        existingIds.add(flag.id);
      }
    }
    return flags;
  }

  private copyFlag(flag: PlayerFlag): PlayerFlag {
    return flag.metadata
      ? { ...flag, metadata: { ...flag.metadata } }
      : { ...flag };
  }

  private copyProfile(profile: PlayerProfile): PlayerProfile {
    return JSON.parse(JSON.stringify(profile)) as PlayerProfile;
  }

  private clampAttribute(value: number): number {
    return Math.min(MAX_ATTRIBUTE_VALUE, Math.max(MIN_ATTRIBUTE_VALUE, value));
  }

  private clampVital(value: number): number {
    return Math.min(MAX_VITAL_VALUE, Math.max(MIN_VITAL_VALUE, value));
  }
}
