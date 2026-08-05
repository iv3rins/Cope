import type { PlayerAttributes } from '../engine/profile';

/** 单场爆种（hot streak）参数：概率 + 附加 rating 加成区间 + 爆种时上限。 */
export interface HotStreakBalanceConfig {
  readonly probability: number;
  readonly minimumBoost: number;
  readonly maximumBoost: number;
  readonly ceiling: number;
}

/** 单场 rating 公式与钳制参数（对应 match-simulation-service-impl.performance）。 */
export interface RatingBalanceConfig {
  readonly base: number;
  readonly abilityDivisor: number;
  readonly conditionFactor: number;
  readonly rollSpan: number;
  readonly clampMinimum: number;
  readonly clampMaximum: number;
  /** 赛事/全年聚合 rating 上限（单场可爆种超过，聚合平均封顶）。 */
  readonly aggregateCeiling: number;
  readonly hotStreak: HotStreakBalanceConfig;
}

/** 出生天赋彩蛋参数：小概率点满部分/几乎所有正面属性。 */
export interface ProdigyEasterEggConfig {
  /** 触发"点满一部分天赋"的概率（含 almostAll 档，分层判定：roll < almostAll 先判）。 */
  readonly partialProbability: number;
  /** 触发"点满几乎所有正面属性"的概率（更稀有档位）。 */
  readonly almostAllProbability: number;
  /** 部分档位点满的属性数量（从 almostAllAttributes 中确定性选取）。 */
  readonly partialAttributeCount: number;
  /** 可被点满的正面属性（不含 teamConflict）。 */
  readonly almostAllAttributes: readonly (keyof PlayerAttributes)[];
}

export interface BalanceConfig {
  readonly schemaVersion: number;
  readonly rating: RatingBalanceConfig;
  readonly prodigy: ProdigyEasterEggConfig;
}

/** 代码兜底默认值（与 assets/balance/performance.json 保持一致，缺失时保证可运行）。 */
export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
  schemaVersion: 1,
  rating: {
    base: 0.72,
    abilityDivisor: 210,
    conditionFactor: 0.01,
    rollSpan: 0.24,
    clampMinimum: 0.55,
    clampMaximum: 1.75,
    aggregateCeiling: 1.35,
    hotStreak: { probability: 0.012, minimumBoost: 0.35, maximumBoost: 0.55, ceiling: 1.65 },
  },
  prodigy: {
    partialProbability: 0.001,
    almostAllProbability: 0.0005,
    partialAttributeCount: 2,
    almostAllAttributes: ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'],
  },
};

const POSITIVE_ATTRIBUTE_KEYS: readonly (keyof PlayerAttributes)[] = ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireFinite(record: Readonly<Record<string, unknown>>, key: string, path: string): number {
  const value = record[key];
  if (!finiteNumber(value)) throw new Error(`Balance config: ${path}.${key} must be a finite number.`);
  return value;
}

function requireProbability(record: Readonly<Record<string, unknown>>, key: string, path: string): number {
  const value = requireFinite(record, key, path);
  if (value < 0 || value > 1) throw new Error(`Balance config: ${path}.${key} must be in [0, 1].`);
  return value;
}

/** 校验 assets/balance/performance.json 载荷；不合法时抛出配置级错误（启动即暴露）。 */
export function validateBalanceConfig(payload: unknown): BalanceConfig {
  if (!isRecord(payload) || payload.schemaVersion !== 1) throw new Error('Balance config: schemaVersion must be 1.');
  const rating = payload.rating;
  const prodigy = payload.prodigy;
  if (!isRecord(rating) || !isRecord(rating.hotStreak) || !isRecord(prodigy)) throw new Error('Balance config: missing rating or prodigy section.');
  const hotStreak = rating.hotStreak;
  const minimumBoost = requireFinite(hotStreak, 'minimumBoost', 'rating.hotStreak');
  const maximumBoost = requireFinite(hotStreak, 'maximumBoost', 'rating.hotStreak');
  const ceiling = requireFinite(hotStreak, 'ceiling', 'rating.hotStreak');
  if (minimumBoost < 0 || maximumBoost < minimumBoost) throw new Error('Balance config: hotStreak boost bounds are invalid.');
  const partialProbability = requireProbability(prodigy, 'partialProbability', 'prodigy');
  const almostAllProbability = requireProbability(prodigy, 'almostAllProbability', 'prodigy');
  if (almostAllProbability > partialProbability) throw new Error('Balance config: almostAllProbability must not exceed partialProbability.');
  const partialAttributeCount = requireFinite(prodigy, 'partialAttributeCount', 'prodigy');
  if (partialAttributeCount < 1) throw new Error('Balance config: partialAttributeCount must be a positive number.');
  const attributes = prodigy.almostAllAttributes;
  if (!Array.isArray(attributes) || attributes.length === 0) throw new Error('Balance config: almostAllAttributes must be a non-empty array.');
  for (const attribute of attributes) {
    if (typeof attribute !== 'string' || !POSITIVE_ATTRIBUTE_KEYS.includes(attribute as keyof PlayerAttributes)) throw new Error(`Balance config: unknown attribute "${String(attribute)}".`);
  }
  return {
    schemaVersion: 1,
    rating: {
      base: requireFinite(rating, 'base', 'rating'),
      abilityDivisor: requireFinite(rating, 'abilityDivisor', 'rating'),
      conditionFactor: requireFinite(rating, 'conditionFactor', 'rating'),
      rollSpan: requireFinite(rating, 'rollSpan', 'rating'),
      clampMinimum: requireFinite(rating, 'clampMinimum', 'rating'),
      clampMaximum: requireFinite(rating, 'clampMaximum', 'rating'),
      aggregateCeiling: requireFinite(rating, 'aggregateCeiling', 'rating'),
      hotStreak: { probability: requireProbability(hotStreak, 'probability', 'rating.hotStreak'), minimumBoost, maximumBoost, ceiling },
    },
    prodigy: {
      partialProbability,
      almostAllProbability,
      partialAttributeCount,
      almostAllAttributes: attributes as (keyof PlayerAttributes)[],
    },
  };
}
