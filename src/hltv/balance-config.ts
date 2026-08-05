import type { PlayerAttributes } from '../engine/profile';
import type { TeamTier } from './team';

export interface HotStreakBalanceConfig {
  readonly probability: number;
  readonly minimumBoost: number;
  readonly maximumBoost: number;
  readonly ceiling: number;
}

export interface RatingBalanceConfig {
  readonly base: number;
  readonly abilityDivisor: number;
  readonly conditionFactor: number;
  readonly rollSpan: number;
  readonly clampMinimum: number;
  readonly clampMaximum: number;
  readonly aggregateCeiling: number;
  readonly hotStreak: HotStreakBalanceConfig;
}

export interface ProdigyEasterEggConfig {
  readonly partialProbability: number;
  readonly almostAllProbability: number;
  readonly partialAttributeCount: number;
  readonly almostAllAttributes: readonly (keyof PlayerAttributes)[];
}

export type StartupTalentTier = 'GENIUS' | 'ORDINARY';
export type StartupRole = 'ENTRY' | 'AWP' | 'IGL' | 'SUPPORT' | 'LURK';
export interface StartupStorylineWeight { readonly id: string; readonly weight: number; }
export interface StartupTalentBandConfig {
  readonly attributes: Readonly<Record<StartupRole, PlayerAttributes>>;
  readonly storylines: readonly StartupStorylineWeight[];
}
export interface StartupContractTermsConfig {
  readonly salaryPerMonth: number;
  readonly buyoutAmount: number;
  readonly lengthMonths: number;
  readonly role: 'STARTER' | 'SUBSTITUTE';
  readonly expectedPlaytimePercentage: number;
}
export interface TalentBalanceConfig {
  readonly geniusProbability: number;
  readonly genius: StartupTalentBandConfig;
  readonly ordinary: StartupTalentBandConfig;
  readonly maxedStartTier: readonly Extract<TeamTier, 'T1' | 'T2'>[];
  readonly maxedStartContracts: Readonly<Record<Extract<TeamTier, 'T1' | 'T2'>, StartupContractTermsConfig>>;
  readonly powerFantasyGuaranteedMax: boolean;
  readonly powerFantasyHighTierProbability: number;
}

export interface BalanceConfig {
  readonly schemaVersion: number;
  readonly rating: RatingBalanceConfig;
  readonly prodigy: ProdigyEasterEggConfig;
  readonly talent: TalentBalanceConfig;
}

const POSITIVE_ATTRIBUTE_KEYS: readonly (keyof PlayerAttributes)[] = ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'];
const ALL_ATTRIBUTE_KEYS: readonly (keyof PlayerAttributes)[] = [...POSITIVE_ATTRIBUTE_KEYS, 'teamConflict'];
const STARTUP_ROLES: readonly StartupRole[] = ['ENTRY', 'AWP', 'IGL', 'SUPPORT', 'LURK'];

const DEFAULT_GENIUS_ATTRIBUTES: Readonly<Record<StartupRole, PlayerAttributes>> = {
  ENTRY: { aim: 76, gameSense: 62, leadership: 48, clutch: 64, consistency: 60, teamConflict: 18 },
  AWP: { aim: 78, gameSense: 65, leadership: 46, clutch: 70, consistency: 62, teamConflict: 17 },
  IGL: { aim: 68, gameSense: 78, leadership: 80, clutch: 62, consistency: 65, teamConflict: 14 },
  SUPPORT: { aim: 70, gameSense: 72, leadership: 58, clutch: 60, consistency: 76, teamConflict: 13 },
  LURK: { aim: 74, gameSense: 75, leadership: 50, clutch: 72, consistency: 66, teamConflict: 16 },
};
const DEFAULT_ORDINARY_ATTRIBUTES: Readonly<Record<StartupRole, PlayerAttributes>> = {
  ENTRY: { aim: 50, gameSense: 44, leadership: 36, clutch: 44, consistency: 42, teamConflict: 26 },
  AWP: { aim: 52, gameSense: 46, leadership: 35, clutch: 49, consistency: 43, teamConflict: 25 },
  IGL: { aim: 45, gameSense: 54, leadership: 55, clutch: 43, consistency: 45, teamConflict: 23 },
  SUPPORT: { aim: 46, gameSense: 50, leadership: 42, clutch: 42, consistency: 52, teamConflict: 21 },
  LURK: { aim: 49, gameSense: 52, leadership: 38, clutch: 51, consistency: 46, teamConflict: 24 },
};

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
  schemaVersion: 2,
  rating: { base: 0.72, abilityDivisor: 210, conditionFactor: 0.01, rollSpan: 0.24, clampMinimum: 0.55, clampMaximum: 1.75, aggregateCeiling: 1.35, hotStreak: { probability: 0.012, minimumBoost: 0.35, maximumBoost: 0.55, ceiling: 1.65 } },
  prodigy: { partialProbability: 0.001, almostAllProbability: 0.0005, partialAttributeCount: 2, almostAllAttributes: ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'] },
  talent: {
    geniusProbability: 0.5,
    genius: { attributes: DEFAULT_GENIUS_ATTRIBUTES, storylines: [{ id: 'prodigy', weight: 1 }, { id: 'comeback', weight: 1 }] },
    ordinary: { attributes: DEFAULT_ORDINARY_ATTRIBUTES, storylines: [{ id: 'grinder', weight: 1 }, { id: 'journeyman', weight: 1 }, { id: 'matchfixing', weight: 1 }, { id: 'rookie', weight: 1 }] },
    maxedStartTier: ['T2', 'T1'],
    maxedStartContracts: {
      T1: { salaryPerMonth: 18000, buyoutAmount: 90000, lengthMonths: 6, role: 'SUBSTITUTE', expectedPlaytimePercentage: 35 },
      T2: { salaryPerMonth: 3500, buyoutAmount: 18000, lengthMonths: 12, role: 'STARTER', expectedPlaytimePercentage: 85 },
    },
    powerFantasyGuaranteedMax: true,
    powerFantasyHighTierProbability: 0.25,
  },
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null; }
function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function requireFinite(record: Readonly<Record<string, unknown>>, key: string, path: string): number { const value = record[key]; if (!finiteNumber(value)) throw new Error(`Balance config: ${path}.${key} must be a finite number.`); return value; }
function requireProbability(record: Readonly<Record<string, unknown>>, key: string, path: string): number { const value = requireFinite(record, key, path); if (value < 0 || value > 1) throw new Error(`Balance config: ${path}.${key} must be in [0, 1].`); return value; }

function validateAttributes(value: unknown, path: string): Readonly<Record<StartupRole, PlayerAttributes>> {
  if (!isRecord(value)) throw new Error(`Balance config: ${path} must be an object.`);
  const result = {} as Record<StartupRole, PlayerAttributes>;
  for (const role of STARTUP_ROLES) {
    const attributes = value[role];
    if (!isRecord(attributes)) throw new Error(`Balance config: ${path}.${role} is required.`);
    const normalized = {} as Record<keyof PlayerAttributes, number>;
    for (const key of ALL_ATTRIBUTE_KEYS) {
      const amount = requireFinite(attributes, key, `${path}.${role}`);
      if (amount < 0 || amount > 100) throw new Error(`Balance config: ${path}.${role}.${key} must be in [0, 100].`);
      normalized[key] = amount;
    }
    result[role] = normalized;
  }
  return result;
}

function validateStorylines(value: unknown, path: string): readonly StartupStorylineWeight[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`Balance config: ${path} must be a non-empty array.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()) throw new Error(`Balance config: ${path}[${index}].id is required.`);
    if (ids.has(entry.id)) throw new Error(`Balance config: duplicate storyline "${entry.id}".`);
    ids.add(entry.id);
    const weight = requireFinite(entry, 'weight', `${path}[${index}]`);
    if (weight <= 0) throw new Error(`Balance config: ${path}[${index}].weight must be positive.`);
    return { id: entry.id, weight };
  });
}

function validateTalentBand(value: unknown, path: string): StartupTalentBandConfig {
  if (!isRecord(value)) throw new Error(`Balance config: missing ${path} section.`);
  return { attributes: validateAttributes(value.attributes, `${path}.attributes`), storylines: validateStorylines(value.storylines, `${path}.storylines`) };
}

function validateStartupContracts(value: unknown): TalentBalanceConfig['maxedStartContracts'] {
  if (!isRecord(value)) throw new Error('Balance config: talent.maxedStartContracts is required.');
  const result = {} as Record<'T1' | 'T2', StartupContractTermsConfig>;
  for (const tier of ['T1', 'T2'] as const) {
    const terms = value[tier];
    if (!isRecord(terms)) throw new Error(`Balance config: talent.maxedStartContracts.${tier} is required.`);
    const salaryPerMonth = requireFinite(terms, 'salaryPerMonth', `talent.maxedStartContracts.${tier}`);
    const buyoutAmount = requireFinite(terms, 'buyoutAmount', `talent.maxedStartContracts.${tier}`);
    const lengthMonths = requireFinite(terms, 'lengthMonths', `talent.maxedStartContracts.${tier}`);
    const expectedPlaytimePercentage = requireFinite(terms, 'expectedPlaytimePercentage', `talent.maxedStartContracts.${tier}`);
    if (salaryPerMonth < 0 || buyoutAmount < 0 || !Number.isSafeInteger(lengthMonths) || lengthMonths < 1 || lengthMonths > 60 || expectedPlaytimePercentage < 0 || expectedPlaytimePercentage > 100 || (terms.role !== 'STARTER' && terms.role !== 'SUBSTITUTE')) throw new Error(`Balance config: talent.maxedStartContracts.${tier} contains invalid terms.`);
    result[tier] = { salaryPerMonth, buyoutAmount, lengthMonths, expectedPlaytimePercentage, role: terms.role };
  }
  return result;
}

export function validateBalanceConfig(payload: unknown): BalanceConfig {
  if (!isRecord(payload) || payload.schemaVersion !== 2) throw new Error('Balance config: schemaVersion must be 2.');
  const rating = payload.rating, prodigy = payload.prodigy, talent = payload.talent;
  if (!isRecord(rating) || !isRecord(rating.hotStreak) || !isRecord(prodigy) || !isRecord(talent)) throw new Error('Balance config: missing rating, prodigy, or talent section.');
  const hotStreak = rating.hotStreak;
  const minimumBoost = requireFinite(hotStreak, 'minimumBoost', 'rating.hotStreak');
  const maximumBoost = requireFinite(hotStreak, 'maximumBoost', 'rating.hotStreak');
  const ceiling = requireFinite(hotStreak, 'ceiling', 'rating.hotStreak');
  if (minimumBoost < 0 || maximumBoost < minimumBoost) throw new Error('Balance config: hotStreak boost bounds are invalid.');
  const partialProbability = requireProbability(prodigy, 'partialProbability', 'prodigy');
  const almostAllProbability = requireProbability(prodigy, 'almostAllProbability', 'prodigy');
  if (almostAllProbability > partialProbability) throw new Error('Balance config: almostAllProbability must not exceed partialProbability.');
  const partialAttributeCount = requireFinite(prodigy, 'partialAttributeCount', 'prodigy');
  const attributes = prodigy.almostAllAttributes;
  if (!Array.isArray(attributes) || attributes.length === 0) throw new Error('Balance config: almostAllAttributes must be a non-empty array.');
  if (!Number.isInteger(partialAttributeCount) || partialAttributeCount < 1 || partialAttributeCount > attributes.length) throw new Error('Balance config: partialAttributeCount must be an integer within the configured attribute count.');
  for (const attribute of attributes) if (typeof attribute !== 'string' || !POSITIVE_ATTRIBUTE_KEYS.includes(attribute as keyof PlayerAttributes)) throw new Error(`Balance config: unknown attribute "${String(attribute)}".`);
  const tiers = talent.maxedStartTier;
  if (!Array.isArray(tiers) || tiers.length === 0 || tiers.some((tier) => tier !== 'T1' && tier !== 'T2')) throw new Error('Balance config: talent.maxedStartTier must contain only T1/T2.');
  if (typeof talent.powerFantasyGuaranteedMax !== 'boolean') throw new Error('Balance config: talent.powerFantasyGuaranteedMax must be boolean.');
  const abilityDivisor = requireFinite(rating, 'abilityDivisor', 'rating');
  const clampMinimum = requireFinite(rating, 'clampMinimum', 'rating');
  const clampMaximum = requireFinite(rating, 'clampMaximum', 'rating');
  const aggregateCeiling = requireFinite(rating, 'aggregateCeiling', 'rating');
  if (abilityDivisor <= 0) throw new Error('Balance config: rating.abilityDivisor must be positive.');
  if (clampMinimum > clampMaximum) throw new Error('Balance config: rating clamp bounds are invalid.');
  if (aggregateCeiling < clampMinimum || aggregateCeiling > ceiling) throw new Error('Balance config: rating ceilings are inconsistent.');
  return {
    schemaVersion: 2,
    rating: { base: requireFinite(rating, 'base', 'rating'), abilityDivisor, conditionFactor: requireFinite(rating, 'conditionFactor', 'rating'), rollSpan: requireFinite(rating, 'rollSpan', 'rating'), clampMinimum, clampMaximum, aggregateCeiling, hotStreak: { probability: requireProbability(hotStreak, 'probability', 'rating.hotStreak'), minimumBoost, maximumBoost, ceiling } },
    prodigy: { partialProbability, almostAllProbability, partialAttributeCount, almostAllAttributes: attributes as (keyof PlayerAttributes)[] },
    talent: { geniusProbability: requireProbability(talent, 'geniusProbability', 'talent'), genius: validateTalentBand(talent.genius, 'talent.genius'), ordinary: validateTalentBand(talent.ordinary, 'talent.ordinary'), maxedStartTier: tiers as Extract<TeamTier, 'T1' | 'T2'>[], maxedStartContracts: validateStartupContracts(talent.maxedStartContracts), powerFantasyGuaranteedMax: talent.powerFantasyGuaranteedMax, powerFantasyHighTierProbability: requireProbability(talent, 'powerFantasyHighTierProbability', 'talent') },
  };
}
