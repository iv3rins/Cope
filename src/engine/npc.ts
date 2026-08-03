import type { HltvPlayerId, CompetitionRegion } from '../hltv/team';
import type { PlayerAttributes, PlayerCareerStats, PlayerFlag, PlayerRole } from './profile';

/** NPC 来源，用于区分真实基准选手、历史生成选手和程序生成选手。 */
export type NpcOrigin = 'BASELINE_TOP20' | 'GENERATED_ACADEMY' | 'GENERATED_PUG_STAR' | 'MIGRATED';
export type NpcAvailability = 'AVAILABLE' | 'SIGNED' | 'RETIRED' | 'INACTIVE';

/** NPC 选手档案只保留模拟所需字段，不复用完整 PlayerProfile 聚合。 */
export interface NpcPlayerProfile {
  readonly id: HltvPlayerId;
  readonly nickname: string;
  readonly realName?: string;
  readonly countryCode: string;
  readonly originRegion: CompetitionRegion;
  readonly age: number;
  readonly role: PlayerRole;
  readonly attributes: PlayerAttributes;
  readonly career: PlayerCareerStats;
  readonly flags: readonly PlayerFlag[];
  readonly currentTeamId: string | null;
  readonly availability: NpcAvailability;
  readonly origin: NpcOrigin;
  readonly generationSeed: number;
}

/** 用于生成下一代 NPC 的模板，不直接绑定具体队伍。 */
export interface NpcGenerationProfile {
  readonly origin: NpcOrigin;
  readonly countryPool: readonly string[];
  readonly region: CompetitionRegion;
  readonly ageRange: readonly [number, number];
  readonly roleWeights: Readonly<Partial<Record<PlayerRole, number>>>;
  readonly attributeRange: Readonly<Partial<Record<keyof PlayerAttributes, readonly [number, number]>>>;
  readonly talentLevel: 'ACADEMY' | 'REGIONAL_STAR' | 'INTERNATIONAL_PROSPECT';
}

export interface NpcGenerationResult {
  readonly season: number;
  readonly generated: readonly NpcPlayerProfile[];
  readonly retiredNpcIds: readonly HltvPlayerId[];
}

/** NPC 仓储是 TOP20 生态、转会市场和赛事阵容的共同数据源。 */
export interface NpcPlayerRepository {
  findById(playerId: HltvPlayerId): Promise<NpcPlayerProfile | null>;
  listAll(): Promise<readonly NpcPlayerProfile[]>;
  listAvailable(input?: { readonly role?: PlayerRole; readonly region?: CompetitionRegion }): Promise<readonly NpcPlayerProfile[]>;
  save(player: NpcPlayerProfile): Promise<void>;
  remove(playerId: HltvPlayerId): Promise<void>;
}

/** 每年生成青训天才、路人王并淘汰退役 NPC，维持世界生态数量。 */
export interface NpcGenerationService {
  generateSeason(input: { readonly season: number; readonly targetPopulation: number; readonly profiles: readonly NpcGenerationProfile[] }): Promise<NpcGenerationResult>;
  retireExpired(input: { readonly season: number; readonly minimumAge: number }): Promise<readonly HltvPlayerId[]>;
}
