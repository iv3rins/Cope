import type { NpcPlayerProfile } from '../npc';
import type { TeamStrengthAssessment, TeamWeakness, TransferCandidate, TransferMarketDecision, TransferMarketResult, TransferMarketService } from '../transfer-market';
import type { TeamRosterSlot } from '../../hltv/team';

/** Deterministic AI manager that projects NPC transfers without mutating external repositories. */
export class NpcTransferMarketServiceImpl implements TransferMarketService {
  public async assessTeam(input: { readonly teamId: string; readonly at: string }): Promise<TeamStrengthAssessment> {
    return this.assessment(input.teamId, input.at, []);
  }

  public async findCandidates(input: { readonly teamId: string; readonly weaknesses: readonly TeamWeakness[]; readonly maxResults: number }): Promise<readonly TransferCandidate[]> {
    void input;
    return [];
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
    const candidate = players.filter((player) => player.availability === 'AVAILABLE').sort((left, right) => this.strength(right) - this.strength(left) || left.id.localeCompare(right.id))[0];
    if (!candidate) return { teamId: input.teamId, assessment, decisions: [], signedContracts: [], releasedPlayerIds: [], npcPlayers: players };
    const signed = players.map((player) => player.id === candidate.id ? { ...player, currentTeamId: input.teamId, availability: 'SIGNED' as const, career: { ...player.career, teamHistory: player.career.teamHistory.includes(input.teamId) ? player.career.teamHistory : [...player.career.teamHistory, input.teamId] } } : player);
    const decision = await this.signCandidate({ teamId: input.teamId, candidate: { playerId: candidate.id, source: 'NPC', player: candidate, estimatedStrength: this.strength(candidate), fitScore: this.strength(candidate), expectedSalaryPerMonth: 0, buyoutCost: 0 }, occurredAt: input.at });
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
