import type { HltvPlayerId, HltvTeam, HltvTeamId, HltvTeamRepository, TeamRosterSlot } from './team';

export interface TeamRosterAssetPlayer {
  readonly playerId: HltvPlayerId;
  readonly nickname: string;
  readonly role: string;
  readonly active: boolean;
}

export interface TeamRosterAssetEntry {
  readonly teamId: HltvTeamId;
  readonly teamName: string;
  readonly region: HltvTeam['region'];
  readonly tier: HltvTeam['tier'];
  readonly vrsRank: number | null;
  readonly players: readonly TeamRosterAssetPlayer[];
}

export interface TeamRosterAsset {
  readonly schemaVersion: number;
  readonly observedAt: string;
  readonly teams: readonly TeamRosterAssetEntry[];
}

export type TeamRosterAssetReader = () => Promise<TeamRosterAsset | null>;

export class AssetTeamRepository implements HltvTeamRepository {
  public constructor(private readonly reader: TeamRosterAssetReader) {}

  public async findById(teamId: HltvTeamId): Promise<HltvTeam | null> {
    const team = (await this.reader())?.teams.find((candidate) => candidate.teamId === teamId);
    return team ? this.toTeam(team) : null;
  }

  public async findActive(): Promise<readonly HltvTeam[]> {
    return (await this.reader())?.teams.map((team) => this.toTeam(team)) ?? [];
  }

  public async findRoster(teamId: HltvTeamId, _at: string): Promise<readonly TeamRosterSlot[]> {
    const team = (await this.reader())?.teams.find((candidate) => candidate.teamId === teamId);
    if (!team) return [];
    const activePlayers = team.players.filter((player) => player.active);
    // A T1 match roster is exactly five active players; incomplete assets are unavailable.
    if (team.tier === 'T1' && (activePlayers.length !== 5 || new Set(activePlayers.map((player) => player.playerId)).size !== 5)) return [];
    return team.players.map((player) => ({ playerId: player.playerId, role: player.role, active: player.active }));
  }

  private toTeam(team: TeamRosterAssetEntry): HltvTeam {
    return { id: team.teamId, name: team.teamName, region: team.region, tier: team.tier, active: true };
  }
}
