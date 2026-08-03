/**
 * 战队静态资源读取层（纯函数 + 缓存）。
 *
 * 数据源：assets/teams/teams.json（由 scripts/gen_teams_json.mjs 从 standings 表生成）。
 * 本模块只负责读取与解析资源，不包含任何分级/赛事规则（见 team-tier.ts）。
 * 不做 I/O 抽象、不依赖注入 —— 读取本地 JSON 是同步且确定的，缓存后无需异步化。
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 与 scripts/gen_teams_json.mjs 生成的 teams.json 结构对齐。 */
export interface TeamStandingRecord {
  readonly rank: number;
  readonly points: number;
  readonly roster: string;
  readonly detailPath: string;
}

export interface TeamStandingsInfo {
  readonly bestRank: number;
  readonly bestPoints: number;
  readonly entries: number;
  readonly records: readonly TeamStandingRecord[];
}

export interface TeamAsset {
  /** 归一化 ID（队名去符号小写，如 "FURIA" -> "furia"） */
  readonly id: string;
  /** 展示名（表内原名，如 "FURIA" / "Natus Vincere"） */
  readonly name: string;
  /** fallback 队标中的首字母（替换 Unknown_PlayerProfile.svg 里的 <text>A</text>） */
  readonly letter: string;
  /** 队标资源路径（相对 assets/ 目录），如 teams_profile/Spirit.webp */
  readonly logo: string;
  readonly hasLogo: boolean;
  /** 文件扩展名：svg | webp | png */
  readonly ext: string;
  readonly standings: TeamStandingsInfo | null;
}

export interface TeamsIndex {
  readonly generatedFrom: string;
  readonly generatedAt: string;
  readonly count: number;
  readonly fallbackLogo: string;
  readonly teams: readonly TeamAsset[];
}

const ASSETS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');
const TEAMS_JSON_PATH = join(ASSETS_ROOT, 'teams', 'teams.json');
/** 无队标战队的默认占位图（与 teams.json 顶层 fallbackLogo 对齐） */
export const DEFAULT_FALLBACK_LOGO = join('teams', 'teams_profile', 'Unknown_PlayerProfile.svg');

let cachedIndex: TeamsIndex | null = null;

/** 读取并缓存 teams.json。文件缺失/解析失败时抛错（配置错误应尽早暴露）。 */
export function loadTeamsIndex(): TeamsIndex {
  if (cachedIndex) return cachedIndex;
  if (!existsSync(TEAMS_JSON_PATH)) {
    throw new Error(`[team-api] 找不到战队数据文件: ${TEAMS_JSON_PATH}（请先运行 scripts/gen_teams_json.mjs）`);
  }
  const raw = readFileSync(TEAMS_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw) as TeamsIndex;
  if (!Array.isArray(parsed.teams)) {
    throw new Error(`[team-api] 战队数据文件格式无效: ${TEAMS_JSON_PATH}`);
  }
  cachedIndex = parsed;
  return cachedIndex;
}

/** 清除缓存（数据文件更新后调用，便于热重载）。 */
export function invalidateTeamsCache(): void {
  cachedIndex = null;
}

/** 按归一化 ID 或展示名精确查找；找不到返回 null。 */
export function findTeam(query: string): TeamAsset | null {
  const index = loadTeamsIndex();
  const normalized = query.trim().toLowerCase();
  return (
    index.teams.find((t) => t.id === normalized) ??
    index.teams.find((t) => t.name.toLowerCase() === normalized) ??
    null
  );
}

/**
 * 解析队标的最终资源路径。
 * 返回路径统一以 assets/ 为根（如 "assets/teams/teams_profile/Spirit.webp"），
 * 由调用方决定如何映射到 HTTP URL / 文件系统。
 */
export function resolveLogoPath(team: TeamAsset): string {
  // teams.json 中 logo 形如 "teams_profile/Spirit.webp"，其根目录是 assets/teams/
  return `assets/teams/${team.logo.replace(/^\/+/, '')}`;
}

/**
 * 取回 fallback SVG 模板的文本内容（Unknown_PlayerProfile.svg）。
 * 供调用方将 <text id='letter'>A</text> 里的 A 替换为战队首字母后渲染。
 */
export function getFallbackSvgTemplate(): string {
  const fallbackPath = join(ASSETS_ROOT, 'teams', 'teams_profile', 'Unknown_PlayerProfile.svg');
  if (!existsSync(fallbackPath)) {
    throw new Error(`[team-api] 找不到 fallback 队标模板: ${fallbackPath}`);
  }
  return readFileSync(fallbackPath, 'utf8');
}

/**
 * 将 fallback SVG 模板中的占位字母替换为指定战队首字母。
 * 模板内 <text id='letter' ...>A</text> 的文本节点即占位点（letter 字段）。
 */
export function renderFallbackSvg(team: TeamAsset, template?: string): string {
  const svg = template ?? getFallbackSvgTemplate();
  return svg.replace(/>A<\/text>/, `>${team.letter}</text>`);
}
