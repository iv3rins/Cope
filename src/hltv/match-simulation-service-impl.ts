import type {
  MatchPlayerPerformance,
  MatchPlayerSnapshot,
  MatchSimulationInput,
  MatchSimulationResult,
  MatchSimulationService,
} from './match';

/** Deterministic match simulator shared by every tournament format. */
export class MatchSimulationServiceImpl implements MatchSimulationService {
  public async simulate(input: MatchSimulationInput): Promise<MatchSimulationResult> {
    this.assertRoll(input.randomRoll);
    const penalties = this.resourceConflictPenalties(input.players);
    const performances = input.players.map((player, index) => this.performance(player, penalties[player.playerId] ?? 0, input.pressure, this.roll(input.randomRoll, index + 1)));
    const leftStrength = this.teamStrength(input.left.playerIds, performances);
    const rightStrength = this.teamStrength(input.right.playerIds, performances);
    const leftWon = leftStrength + (input.randomRoll - 0.5) * 18 >= rightStrength;
    const winner = leftWon ? input.left : input.right;
    const loser = leftWon ? input.right : input.left;
    const maps = input.format === 'BO1' ? 1 : input.format === 'BO5' ? (Math.abs(leftStrength - rightStrength) < 5 ? 5 : 4) : (Math.abs(leftStrength - rightStrength) < 7 ? 3 : 2);
    const winnerMaps = input.format === 'BO1' ? 1 : input.format === 'BO5' ? 3 : 2;
    const loserMaps = maps - winnerMaps;
    const winnerRank = input.teamRanks[winner.teamId];
    const loserRank = input.teamRanks[loser.teamId];
    return {
      matchId: input.matchId,
      stage: input.stage,
      winnerTeamId: winner.teamId,
      loserTeamId: loser.teamId,
      scores: [{ teamId: winner.teamId, mapsWon: winnerMaps, roundsWon: winnerMaps * 13 }, { teamId: loser.teamId, mapsWon: loserMaps, roundsWon: Math.max(6, loserMaps * 13 + 9) }],
      mapsPlayed: Array.from({ length: maps }, (_, index) => input.mapPool[index % Math.max(1, input.mapPool.length)] ?? `Map ${index + 1}`),
      playerPerformances: performances.map((performance) => ({ ...performance, maps })),
      teamRanks: { ...input.teamRanks },
      resourceConflictPenalties: penalties,
      upset: winnerRank !== null && winnerRank !== undefined && loserRank !== null && loserRank !== undefined ? winnerRank > loserRank : false,
      randomRoll: input.randomRoll,
    };
  }

  private performance(player: MatchPlayerSnapshot, conflictPenalty: number, pressure: number, roll: number): MatchPlayerPerformance {
    const ability = player.aim * 0.28 + player.gameSense * 0.22 + player.clutch * 0.14 + player.consistency * 0.2 + player.leadership * 0.08 - player.teamConflict * 0.08;
    const condition = (player.morale - 50) * 0.05 + (player.energy - 50) * 0.04;
    const pressurePenalty = Math.max(0, pressure - player.clutch) * 0.0018;
    const rawRating = 0.72 + ability / 210 + condition / 100 + (roll - 0.5) * 0.24 - conflictPenalty - pressurePenalty;
    const rating = this.clamp(rawRating, 0.55, 1.75);
    const adr = this.clamp(43 + rating * 31 + (roll - 0.5) * 8, 45, 108);
    const kast = this.clamp(48 + rating * 19 + (roll - 0.5) * 5, 50, 88);
    return {
      playerId: player.playerId,
      teamId: player.teamId,
      maps: 0,
      kills: Math.max(0, Math.round(38 * rating)),
      deaths: Math.max(1, Math.round(36 * (1.32 - rating * 0.28))),
      assists: Math.max(0, Math.round(8 + player.gameSense * 0.08)),
      rating2_0: rating,
      adr,
      kast,
      headshotPercentage: this.clamp(32 + player.aim * 0.25 + (roll - 0.5) * 12, 20, 78),
      firstKills: Math.max(0, Math.round(player.role === 'ENTRY_FRAGGER' ? 7 * rating : 4 * rating)),
      firstDeaths: Math.max(0, Math.round(player.role === 'ENTRY_FRAGGER' ? 6 / Math.max(0.7, rating) : 3 / Math.max(0.7, rating))),
      clutchesWon: Math.max(0, Math.round(player.clutch * rating / 38)),
      impactScore: this.clamp(rating + (player.role === 'ENTRY_FRAGGER' ? 0.04 : 0), 0.5, 1.9),
    };
  }

  private resourceConflictPenalties(players: readonly MatchPlayerSnapshot[]): Readonly<Record<string, number>> {
    const byTeam = new Map<string, MatchPlayerSnapshot[]>();
    for (const player of players) byTeam.set(player.teamId, [...(byTeam.get(player.teamId) ?? []), player]);
    const penalties: Record<string, number> = {};
    for (const roster of byTeam.values()) {
      const roleCounts = new Map<string, number>();
      for (const player of roster) roleCounts.set(player.role, (roleCounts.get(player.role) ?? 0) + 1);
      for (const player of roster) {
        const duplicates = Math.max(0, (roleCounts.get(player.role) ?? 1) - 1);
        penalties[player.playerId] = Math.min(0.12, duplicates * 0.035 + player.teamConflict * 0.0005);
      }
    }
    return penalties;
  }

  private teamStrength(ids: readonly string[], performances: readonly MatchPlayerPerformance[]): number {
    const selected = performances.filter((performance) => ids.includes(performance.playerId));
    return selected.length ? selected.reduce((sum, performance) => sum + performance.rating2_0, 0) / selected.length * 100 : 0;
  }

  private roll(seed: number, salt: number): number {
    const value = Math.sin((seed + 1) * 10000 + salt * 97) * 43758.5453;
    return value - Math.floor(value);
  }

  private assertRoll(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('randomRoll must be in [0, 1).');
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }
}
