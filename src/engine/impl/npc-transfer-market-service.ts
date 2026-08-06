import type { NpcPlayerProfile } from '../npc';
import type { TeamStrengthAssessment, TeamWeakness, TransferCandidate, TransferMarketDecision, TransferMarketResult, TransferMarketService } from '../transfer-market';
import type { TeamRosterSlot } from '../../hltv/team';
import type { PlayerRole } from '../profile';

/** Deterministic AI manager that projects NPC transfers without mutating external repositories. */
export class NpcTransferMarketServiceImpl implements TransferMarketService {
  public async assessTeam(input: { readonly teamId: string; readonly at: string }): Promise<TeamStrengthAssessment> {
    return this.assessment(input.teamId, input.at, []);
  }

  public async findCandidates(input: { readonly teamId: string; readonly weaknesses: readonly TeamWeakness[]; readonly maxResults: number; readonly npcPlayers?: readonly NpcPlayerProfile[] }): Promise<readonly TransferCandidate[]> {
    const pool = input.npcPlayers ?? [];
    const candidates = pool.filter((player) => player.availability === 'AVAILABLE' && player.currentTeamId === null);
    const requiredRoles = new Set<PlayerRole>();
    for (const weakness of input.weaknesses) {
      if (weakness === 'NO_AWPer') requiredRoles.add('AWPER');
      if (weakness === 'NO_IGL') requiredRoles.add('IGL');
    }
    const ranked = candidates
      .map((player) => {
        const roleFits = requiredRoles.size === 0 || requiredRoles.has(player.role);
        const fitScore = this.fitScore(player, requiredRoles);
        return { player, roleFits, fitScore, strength: this.strength(player) };
      })
      .sort((left, right) => Number(right.roleFits) - Number(left.roleFits) || right.fitScore - left.fitScore || right.strength - left.strength || left.player.id.localeCompare(right.player.id))
      .slice(0, input.maxResults);
    return ranked.map((entry) => ({ playerId: entry.player.id, source: 'NPC' as const, player: entry.player, estimatedStrength: entry.strength, fitScore: entry.fitScore, expectedSalaryPerMonth: this.salaryFor(entry.player), buyoutCost: 0 }));
  }

  private fitScore(player: NpcPlayerProfile, requiredRoles: ReadonlySet<PlayerRole>): number {
    const roleScore = requiredRoles.has(player.role) ? 25 : 0;
    const strengthScore = this.strength(player);
    const ageScore = player.age <= 24 ? 5 : player.age <= 29 ? 2 : 0;
    return Math.round((roleScore + strengthScore * 0.6 + ageScore) * 10) / 10;
  }

  private salaryFor(player: NpcPlayerProfile): number {
    const base = this.strength(player);
    if (base >= 85) return 18000;
    if (base >= 70) return 3500;
    return 900;
  }

  public async releasePlayer(input: { readonly teamId: string; readonly playerId: string; readonly reason: string; readonly occurredAt: string }): Promise<TransferMarketDecision> {
    return { id: `npc-release-${input.teamId}-${input.playerId}-${input.occurredAt}`, teamId: input.teamId, type: 'RELEASE', playerId: input.playerId, source: 'NPC', reason: input.reason, assessment: this.assessment(input.teamId, input.occurredAt, []), occurredAt: input.occurredAt };
  }

  public async signCandidate(input: { readonly teamId: string; readonly candidate: TransferCandidate; readonly occurredAt: string }): Promise<TransferMarketDecision> {
    return { id: `npc-sign-${input.teamId}-${input.candidate.playerId}-${input.occurredAt}`, teamId: input.teamId, type: 'SIGN', playerId: input.candidate.playerId, source: input.candidate.source, reason: '阵容短板与候选角色匹配。', assessment: this.assessment(input.teamId, input.occurredAt, []), occurredAt: input.occurredAt };
  }

  public async runManagerWindow(input: { readonly teamId: string; readonly at: string; readonly maxMoves: number; readonly npcPlayers?: readonly NpcPlayerProfile[] }): Promise<TransferMarketResult> {
    const players = [...(input.npcPlayers ?? [])];
    const roster = players.filter((player) => player.currentTeamId === input.teamId && player.availability !== 'RETIRED');
    const assessment = this.assessment(input.teamId, input.at, roster);
    if (input.maxMoves <= 0 || roster.length >= 5) return { teamId: input.teamId, assessment, decisions: [], signedContracts: [], releasedPlayerIds: [], npcPlayers: players };
    const [candidate] = await this.findCandidates({ teamId: input.teamId, weaknesses: assessment.weaknesses, maxResults: 1, npcPlayers: players });
    if (!candidate) return { teamId: input.teamId, assessment, decisions: [], signedContracts: [], releasedPlayerIds: [], npcPlayers: players };
    const signed = players.map((player) => player.id === candidate.playerId ? { ...player, currentTeamId: input.teamId, availability: 'SIGNED' as const, career: { ...player.career, teamHistory: player.career.teamHistory.includes(input.teamId) ? player.career.teamHistory : [...player.career.teamHistory, input.teamId] } } : player);
    const decision = await this.signCandidate({ teamId: input.teamId, candidate, occurredAt: input.at });
    return { teamId: input.teamId, assessment, decisions: [decision], signedContracts: [], releasedPlayerIds: [], npcPlayers: signed };
  }

  private assessment(teamId: string, evaluatedAt: string, players: readonly NpcPlayerProfile[]): TeamStrengthAssessment {
    const roster: readonly TeamRosterSlot[] = players.map((player) => ({ playerId: player.id, role: player.role, active: true }));
    const roles = new Set(players.map((player) => player.role));
    const weaknesses: TeamWeakness[] = [];
    if (players.length < 5) weaknesses.push('INCOMPLETE_ROSTER');
    if (!roles.has('AWPER')) weaknesses.push('NO_AWPer');
    if (!roles.has('IGL')) weaknesses.push('NO_IGL');
    const overallStrength = players.length ? players.reduce((sum, player) => sum + this.strength(player), 0) / players.length : 0;
    if (overallStrength < 60) weaknesses.push('LOW_FIREPOWER');
    return { teamId, overallStrength, weaknesses, evaluatedRoster: roster, agingPlayerIds: players.filter((player) => player.age >= 30).map((player) => player.id), evaluatedAt };
  }

  private strength(player: NpcPlayerProfile): number {
    return (player.attributes.aim + player.attributes.gameSense + player.attributes.clutch + player.attributes.consistency) / 4;
  }
}
