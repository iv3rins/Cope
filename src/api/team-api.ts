/**
 * 战队接口（对外主入口，纯函数）。
 *
 * 提供：
 *   - getTeamLogo      获取战队队标（含 fallback 处理与 letter 占位字母）
 *   - getTeamRanking   获取战队排名与分级（T1/T2/T3）
 *   - 配套：listTeamsByTier / resolveTeam / listAllTeams 供 UI 与筛选使用
 *
 * 依赖 team-assets（读 JSON + 缓存）与 team-tier（分级规则）。
 * 未来若接 HTTP 层，可直接在路由中调用这些纯函数。
 */

import {
  findTeam,
  getFallbackSvgTemplate,
  loadTeamsIndex,
  renderFallbackSvg,
  resolveLogoPath,
  type TeamAsset,
} from './team-assets.ts';
import { tierForRank, type TeamTier } from './team-tier.ts';

/** 队标查询结果。 */
export interface TeamLogoResult {
  readonly teamId: string;
  readonly displayName: string;
  readonly logoPath: string;
  readonly hasLogo: boolean;
  readonly ext: string;
  /** fallback 队标中的首字母（仅 hasLogo=false 时有效） */
  readonly letter: string;
  /** 若调用方需要直接把 fallback 渲染成 SVG 字符串，可传 template；否则置空由调用方自行替换 */
  readonly fallbackSvg?: string;
}

/** 排名查询结果。 */
export interface TeamRankingResult {
  readonly teamId: string;
  readonly displayName: string;
  readonly rank: number | null; // VRS 全球榜名次（无排名记录时 null）
  readonly points: number | null; // VRS 积分（无排名记录时 null）
  readonly tier: TeamTier; // 由 rank 判定
  readonly standingsEntries: number; // 同队名在 standings 中的记录条数（换阵等）
  readonly bestRank: number | null;
  readonly bestPoints: number | null;
  /** 详细榜单记录（每条含 rank/points/roster/detailPath） */
  readonly records: ReadonlyArray<{
    readonly rank: number;
    readonly points: number;
    readonly roster: string;
    readonly detailPath: string;
  }>;
}

export interface TeamEntry extends TeamRankingResult {
  readonly letter: string;
  readonly logoPath: string;
  readonly hasLogo: boolean;
}

export interface TeamNotFoundError {
  readonly ok: false;
  readonly error: 'TEAM_NOT_FOUND';
  readonly message: string;
}

export interface TeamLookupSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type TeamLookupResult<T> = TeamLookupSuccess<T> | TeamNotFoundError;

const notFound = (query: string): TeamNotFoundError => ({
  ok: false,
  error: 'TEAM_NOT_FOUND',
  message: `未找到战队: ${query}`,
});

function assetToEntry(team: TeamAsset): TeamEntry {
  const standings = team.standings;
  return {
    teamId: team.id,
    displayName: team.name,
    rank: standings?.bestRank ?? null,
    points: standings?.bestPoints ?? null,
    tier: standings ? tierForRank(standings.bestRank) : 'T3',
    standingsEntries: standings?.entries ?? 0,
    bestRank: standings?.bestRank ?? null,
    bestPoints: standings?.bestPoints ?? null,
    records: standings?.records ?? [],
    letter: team.letter,
    logoPath: resolveLogoPath(team),
    hasLogo: team.hasLogo,
  };
}

/** 按归一化 ID 或展示名解析战队。找不到返回结构化失败。 */
export function resolveTeam(query: string): TeamLookupResult<TeamEntry> {
  const team = findTeam(query);
  return team ? { ok: true, value: assetToEntry(team) } : notFound(query);
}

/**
 * 获取战队队标。
 * - 有队标：返回资源路径（如 assets/teams/teams_profile/Spirit.webp）。
 * - 无队标：返回 Unknown_PlayerProfile.svg 路径 + letter 占位字母；
 *   若传 renderFallback=true 或需要 SVG 字符串，可额外得到渲染后的 fallbackSvg。
 */
export function getTeamLogo(query: string, renderFallback: boolean = false): TeamLookupResult<TeamLogoResult> {
  const resolved = resolveTeam(query);
  if (!resolved.ok) return resolved;
  const entry = resolved.value;
  return {
    ok: true,
    value: {
      teamId: entry.teamId,
      displayName: entry.displayName,
      logoPath: entry.logoPath,
      hasLogo: entry.hasLogo,
      ext: entry.ext ?? (entry.logoPath.endsWith('.svg') ? 'svg' : 'webp'),
      letter: entry.letter,
      ...(renderFallback ? { fallbackSvg: renderFallbackSvg({ id: entry.teamId, name: entry.displayName, letter: entry.letter, logo: '', hasLogo: false, ext: 'svg', standings: null }) } : {}),
    },
  };
}

/**
 * 获取战队排名与分级。
 * 返回 VRS 全球榜名次、积分、T1/T2/T3 分级，以及详细榜单记录。
 */
export function getTeamRanking(query: string): TeamLookupResult<TeamRankingResult> {
  const resolved = resolveTeam(query);
  if (!resolved.ok) return resolved;
  const { teamId, displayName, rank, points, tier, standingsEntries, bestRank, bestPoints, records } = resolved.value;
  return {
    ok: true,
    value: { teamId, displayName, rank, points, tier, standingsEntries, bestRank, bestPoints, records },
  };
}

/** 列出指定分级的全部战队（按名次升序，无排名的排最后）。 */
export function listTeamsByTier(tier: TeamTier): readonly TeamEntry[] {
  return loadTeamsIndex()
    .teams.map(assetToEntry)
    .filter((t) => t.tier === tier)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.displayName.localeCompare(b.displayName));
}

/** 列出全部战队（按名次升序）。 */
export function listAllTeams(): readonly TeamEntry[] {
  return loadTeamsIndex()
    .teams.map(assetToEntry)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.displayName.localeCompare(b.displayName));
}

/** 读取 fallback SVG 模板（供外部渲染无队标战队时复用）。 */
export { getFallbackSvgTemplate, renderFallbackSvg } from './team-assets.ts';
export { tierForRank, tierLabel, type TeamTier } from './team-tier.ts';
