import type { PlayerAttributes, PlayerCareerStats, PlayerFlag, PlayerRole } from '../engine/profile';
import type { HltvPlayerId } from './team';
import type { NpcGenerationProfile, NpcGenerationResult, NpcPlayerProfile, NpcGenerationService } from '../engine/npc';

export interface NpcBaselineIdentity { readonly playerId: HltvPlayerId; readonly nickname: string; readonly realName: string; readonly countryCode: string; readonly rank: number; }

export class NpcGenerationServiceImpl implements NpcGenerationService {
  public constructor(private readonly baseline: readonly NpcBaselineIdentity[], private readonly seed = 0x9e3779b9) {}

  public async generateSeason(input: { readonly season: number; readonly targetPopulation: number; readonly profiles: readonly NpcGenerationProfile[] }): Promise<NpcGenerationResult> {
    const generated: NpcPlayerProfile[] = this.baseline.slice(0, input.targetPopulation).map((identity, index) => this.baselinePlayer(identity, input.season, index));
    let index = generated.length;
    while (generated.length < input.targetPopulation && input.profiles.length > 0) {
      const template = input.profiles[index % input.profiles.length];
      if (!template) break;
      generated.push(this.generatedPlayer(template, input.season, index));
      index += 1;
    }
    return { season: input.season, generated, retiredNpcIds: [] };
  }

  public async advanceSeason(input: { readonly season: number; readonly players: readonly NpcPlayerProfile[] }): Promise<NpcGenerationResult> {
    const progressed = input.players.map((player) => {
      if (player.availability === 'RETIRED') return player;
      const age = player.age + 1;
      const delta = age <= 20 ? 1 : age <= 25 ? 0 : age <= 29 ? -1 : -2;
      const adjust = (value: number) => Math.max(0, Math.min(100, value + delta));
      const retired = age >= 34 || (age >= 31 && player.attributes.consistency < 48);
      return { ...player, age, attributes: { ...player.attributes, aim: adjust(player.attributes.aim), gameSense: adjust(player.attributes.gameSense), clutch: adjust(player.attributes.clutch), consistency: adjust(player.attributes.consistency) }, availability: retired ? 'RETIRED' as const : player.availability };
    });
    return { season: input.season, generated: [], retiredNpcIds: progressed.filter((player) => player.availability === 'RETIRED' && input.players.find((before) => before.id === player.id)?.availability !== 'RETIRED').map((player) => player.id), progressed };
  }

  public async retireExpired(input: { readonly season: number; readonly minimumAge: number }): Promise<readonly HltvPlayerId[]> { void input; return []; }

  private baselinePlayer(identity: NpcBaselineIdentity, season: number, index: number): NpcPlayerProfile {
    const rating = Math.max(72, 101 - identity.rank);
    return this.profile(identity.playerId, identity.nickname, identity.realName, identity.countryCode, 'EUROPE', 20 + (index % 8), 'ENTRY_FRAGGER', rating, 'BASELINE_TOP20', season, index);
  }

  private generatedPlayer(template: NpcGenerationProfile, season: number, index: number): NpcPlayerProfile {
    const country = template.countryPool[index % Math.max(1, template.countryPool.length)] ?? 'INT';
    const age = template.ageRange[0] + Math.abs(this.hash(`${season}:${index}`)) % Math.max(1, template.ageRange[1] - template.ageRange[0] + 1);
    const role = (Object.keys(template.roleWeights)[index % Math.max(1, Object.keys(template.roleWeights).length)] as PlayerRole | undefined) ?? 'ENTRY_FRAGGER';
    const value = template.talentLevel === 'INTERNATIONAL_PROSPECT' ? 78 : template.talentLevel === 'REGIONAL_STAR' ? 70 : 62;
    return this.profile(`npc-${season}-${index}`, `prospect_${season}_${index}`, undefined, country, template.region, age, role, value, template.origin, season, index);
  }

  private profile(id: string, nickname: string, realName: string | undefined, countryCode: string, region: NpcPlayerProfile['originRegion'], age: number, role: PlayerRole, rating: number, origin: NpcPlayerProfile['origin'], season: number, index: number): NpcPlayerProfile {
    const attributes: PlayerAttributes = { aim: rating, gameSense: rating - 2, leadership: rating - 8, clutch: rating - 3, consistency: rating - 1, teamConflict: Math.max(5, 35 - Math.floor(rating / 4)) };
    const career: PlayerCareerStats = { totalKills: 0, rating2: rating / 65, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] };
    const flags: readonly PlayerFlag[] = [];
    return { id, nickname, ...(realName ? { realName } : {}), countryCode, originRegion: region, age, role, attributes, career, flags, currentTeamId: null, availability: 'AVAILABLE', origin, generationSeed: this.hash(`${this.seed}:${season}:${index}`) };
  }

  private hash(value: string): number { let hash = this.seed; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0; }
}
