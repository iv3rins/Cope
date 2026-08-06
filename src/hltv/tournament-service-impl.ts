import type { GameClock, RandomSource } from '../engine/runtime';
import type { HonorClass } from './tournament';
import type {
  QualificationDecision,
  TournamentAdvanceResult,
  TournamentCompletedFact,
  TournamentEdition,
  TournamentFactRepository,
  TournamentHonor,
  TournamentIntervention,
  TournamentInterventionAppliedFact,
  TournamentPlayerPerformance,
  TournamentProgressState,
  TournamentResult,
  TournamentRosterLock,
  TournamentService,
  TournamentSimulationContext,
  UpsetDecision,
} from './tournament';
import type { MatchPlayerSnapshot, MatchSimulationResult, MatchSimulationService } from './match';
import { tierForRank, type HltvPlayerId, type TeamRosterSlot, type VrsInviteSnapshot } from './team';
import { DEFAULT_BALANCE_CONFIG, type RatingBalanceConfig } from './balance-config';

const HONOR_CLASS_PRIORITY: Readonly<Record<HonorClass, number>> = {
  NONE: 0,
  MEDIUM: 1,
  LARGE: 2,
  ELITE: 3,
  SUPER_ELITE: 4,
  MAJOR: 5,
};

export interface TournamentCalendarAssetEdition {
  readonly id: string;
  readonly half: 1 | 2;
  readonly organizerId: string;
  readonly city: string;
  readonly nameTemplate: string;
  readonly tier: TournamentEdition['tier'];
  readonly honorClass: TournamentEdition['honorClass'];
  readonly format: TournamentEdition['format'];
  readonly prizePool: number;
  readonly major?: boolean;
  readonly eligibleTeamTiers?: readonly ('T1' | 'T2' | 'T3')[];
  readonly directInviteMaxRank?: number;
  readonly fallbackQualificationSource?: 'OPEN_ENTRY' | 'PUBLIC_QUALIFIER';
}

export interface TournamentCalendarAsset {
  readonly schemaVersion: number;
  readonly organizers: Readonly<Record<string, string>>;
  readonly editions: readonly TournamentCalendarAssetEdition[];
}

export type TournamentCalendarReader = () => Promise<TournamentCalendarAsset | null>;

export interface TournamentSimulationDependencies {
  readonly playerId: HltvPlayerId;
  readonly random: RandomSource;
  readonly clock: GameClock;
  readonly matches: MatchSimulationService;
  /** 赛事聚合（全年/平均）表现上限等平衡参数；缺省时使用内置默认。 */
  readonly balance?: RatingBalanceConfig;
  readonly playerSnapshot?: (playerId: HltvPlayerId, teamId: string) => MatchPlayerSnapshot | Promise<MatchPlayerSnapshot>;
  readonly teamRoster?: (teamId: string) => readonly TeamRosterSlot[] | Promise<readonly TeamRosterSlot[]>;
  readonly facts?: TournamentFactRepository;
  readonly calendarReader?: TournamentCalendarReader;
}

/**
 * A deterministic first-pass tournament simulator. It consumes the context roll only
 * for upset resolution; all performance samples use the injected RandomSource.
 */
export class TournamentServiceImpl implements TournamentService {
  private readonly pendingInterventions = new Map<string, readonly TournamentIntervention[]>();

  public constructor(private readonly dependencies: TournamentSimulationDependencies) {}

  public async start(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[] }): Promise<TournamentAdvanceResult> {
    if (input.edition.id !== input.context.editionId) throw new Error('TournamentSimulationContext editionId must match TournamentEdition id.');
    const mode = input.edition.simulationMode ?? (input.edition.tier === 'MAJOR' ? 'SWISS' : 'FAST');
    const state: TournamentProgressState = {
      tournamentId: input.edition.id,
      mode,
      revision: 1,
      payload: mode === 'SWISS' ? { wins: 0, losses: 0, round: 0, matches: [] } : { step: 'PRE', matches: [] },
    };
    return { status: 'ONGOING', state, lifecycleHook: 'PRE_TOURNAMENT', uiData: { mode }, result: null };
  }

  public async advance(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[]; readonly state: TournamentProgressState }): Promise<TournamentAdvanceResult> {
    if (input.state.tournamentId !== input.edition.id) throw new Error('TournamentProgressState tournamentId must match TournamentEdition id.');
    return input.state.mode === 'SWISS' ? this.advanceSwiss(input) : this.advanceFast(input);
  }

  public async simulate(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext }): Promise<TournamentResult> {
    const { edition, context } = input;
    if (edition.id !== context.editionId) throw new Error('TournamentSimulationContext editionId must match TournamentEdition id.');
    this.assertRoll(context.upsetRoll, 'upsetRoll');
    if (!Number.isFinite(context.baseTeamStrength)) throw new RangeError('baseTeamStrength must be finite.');
    if (!Object.keys(context.baseOpponentStrength).length) throw new Error('TournamentSimulationContext must contain at least one opponent strength.');
    for (const [teamId, strength] of Object.entries(context.baseOpponentStrength)) {
      if (!Number.isFinite(strength)) throw new RangeError(`Opponent strength for ${teamId} must be finite.`);
    }
    const roster: readonly TeamRosterSlot[] = [{ playerId: this.dependencies.playerId, role: 'ENTRY_FRAGGER', active: true }];
    let progress = await this.start({ edition, context, roster });
    while (progress.status === 'ONGOING' && progress.state) progress = await this.advance({ edition, context, roster, state: progress.state });
    if (!progress.result) throw new Error('Tournament simulation completed without a result.');
    return progress.result;
  }

  private async teamRoster(teamId: string): Promise<readonly TeamRosterSlot[]> {
    return await this.dependencies.teamRoster?.(teamId) ?? [];
  }

  private async buildResult(edition: TournamentEdition, context: TournamentSimulationContext, matchResults: readonly MatchSimulationResult[], lockedRoster: readonly TeamRosterSlot[]): Promise<TournamentResult> {
    const strongestOpponent = Math.max(...matchResults.map((match) => {
      const opponentTeamId = match.winnerTeamId === edition.teamId ? match.loserTeamId : match.winnerTeamId;
      return context.baseOpponentStrength[opponentTeamId] ?? context.baseTeamStrength;
    }));
    const upset = this.decideUpset(context.baseTeamStrength, strongestOpponent, context);
    const performances = this.aggregatePerformances(matchResults);
    const teamPlacements = await this.deriveTeamPlacements(edition, matchResults, lockedRoster);
    const playerTeam = teamPlacements.find((entry) => entry.teamId === edition.teamId);
    const placement = playerTeam?.placement ?? 'GROUP_EXIT';
    const honors = this.allocateHonors(edition, teamPlacements, performances);
    const teamPrizeMoney = placement === 'CHAMPION' ? edition.prizePool ?? 0 : edition.prizePool ? Math.round(edition.prizePool * (placement === 'RUNNER_UP' ? 0.2 : placement === 'SEMIFINAL' ? 0.1 : 0.04)) : 0;
    return {
      editionId: edition.id,
      seriesId: edition.seriesId,
      season: edition.season,
      eventName: edition.name,
      teamId: edition.teamId,
      tier: edition.tier,
      honorClass: edition.honorClass,
      placement,
      title: placement === 'CHAMPION',
      qualificationSource: edition.qualificationSource,
      vrsSnapshotId: edition.vrsSnapshotId,
      upset,
      consumedInterventions: context.interventions.map((intervention) => this.copy(intervention)),
      ...(edition.city ? { city: edition.city } : {}),
      prizeMoney: teamPrizeMoney,
      teamPrizeMoney,
      seriesDetails: matchResults.map((match) => {
        const playerScore = match.scores.find((score) => score.teamId === edition.teamId);
        const opponentTeamId = match.winnerTeamId === edition.teamId ? match.loserTeamId : match.winnerTeamId;
        const opponentScore = match.scores.find((score) => score.teamId === opponentTeamId);
        const seriesScore = `${playerScore?.mapsWon ?? 0}:${opponentScore?.mapsWon ?? 0}`;
        const rounds = playerScore && opponentScore ? `（累计回合 ${playerScore.roundsWon}:${opponentScore.roundsWon}）` : '';
        return { stage: match.stage, format: edition.format ?? 'BO3', opponentTeamId, opponentRank: match.teamRanks[opponentTeamId] ?? null, mapScores: [`${seriesScore}${rounds}`] };
      }),
      matchResults: matchResults.map((match) => this.copy(match)),
      teamPlacements: teamPlacements.map((entry) => this.copy(entry)),
      playerPerformances: performances.map((performance) => ({ ...performance, honor: honors.find((honor) => honor.playerId === performance.playerId)?.type ?? null })),
      honors,
    };
  }

  public async applyIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact> {
    const existing = this.pendingInterventions.get(intervention.editionId) ?? [];
    if (!existing.some((candidate) => candidate.id === intervention.id)) {
      this.pendingInterventions.set(intervention.editionId, [...existing, this.copy(intervention)]);
    }
    return { type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: intervention.occurredAt, intervention: this.copy(intervention) };
  }

  public async findPendingInterventions(editionId: string): Promise<readonly TournamentIntervention[]> {
    return (this.pendingInterventions.get(editionId) ?? []).map((intervention) => this.copy(intervention));
  }

  public async settle(input: { readonly edition: TournamentEdition; readonly result: TournamentResult }): Promise<TournamentCompletedFact> {
    if (input.edition.id !== input.result.editionId) throw new Error('TournamentResult editionId must match TournamentEdition id.');
    this.pendingInterventions.delete(input.edition.id);
    const fact: TournamentCompletedFact = {
      type: 'TOURNAMENT_COMPLETED',
      occurredAt: this.dependencies.clock.now(),
      result: this.copy(input.result),
    };
    if (this.dependencies.facts && !(await this.dependencies.facts.hasCompleted(input.edition.id))) {
      await this.dependencies.facts.append(fact);
    }
    return fact;
  }

  public async createCalendar(input: { readonly season: number; readonly half: 1 | 2; readonly teamId: string; readonly snapshot: VrsInviteSnapshot }): Promise<readonly TournamentEdition[]> {
    const entry = input.snapshot.entries.find((candidate) => candidate.teamId === input.teamId);
    const snapshotRank = entry?.snapshotRank ?? null;
    const teamTier = snapshotRank === null ? 'T3' : tierForRank(snapshotRank);
    const asset = await this.dependencies.calendarReader?.() ?? null;
    if (!asset || (asset.schemaVersion !== 1 && asset.schemaVersion !== 2) || asset.editions.length === 0) return this.createFallbackCalendar(input, snapshotRank);

    const filtered = asset.editions
      .filter((candidate) => candidate.half === input.half)
      .filter((candidate) => candidate.eligibleTeamTiers?.length ? candidate.eligibleTeamTiers.includes(teamTier) : teamTier === 'T1'
        ? candidate.tier === 'T1' || candidate.tier === 'MAJOR'
        : teamTier === 'T2'
          ? candidate.tier === 'T2' || candidate.tier === 'T1' || candidate.tier === 'MAJOR'
          : candidate.tier === 'T2' || candidate.tier === 'T1')
      .filter((candidate) => candidate.tier !== 'MAJOR' || (snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= 32));
    const t1Cap = teamTier === 'T1' ? Number.MAX_SAFE_INTEGER : 1;
    const candidates = [
      ...filtered.filter((candidate) => candidate.tier === 'T2'),
      ...filtered.filter((candidate) => candidate.tier === 'T1').sort((left, right) => HONOR_CLASS_PRIORITY[right.honorClass] - HONOR_CLASS_PRIORITY[left.honorClass] || (right.prizePool ?? 0) - (left.prizePool ?? 0) || left.id.localeCompare(right.id)).slice(0, t1Cap),
      ...filtered.filter((candidate) => candidate.tier === 'MAJOR'),
    ].sort((left, right) => left.calendarOrder - right.calendarOrder);

    return candidates
      .map((candidate, index) => {
        const organizer = asset.organizers[candidate.organizerId] ?? candidate.organizerId;
        const isMajor = candidate.tier === 'MAJOR';
        const directInviteMaxRank = isMajor ? 32 : candidate.directInviteMaxRank ?? 12;
        const direct = snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= directInviteMaxRank;
        const fallback = isMajor ? 'DIRECT_VRS' : candidate.fallbackQualificationSource ?? (candidate.tier === 'T1' ? 'PUBLIC_QUALIFIER' : 'OPEN_ENTRY');
        const qualificationSource = direct ? 'DIRECT_VRS' : fallback;
        const qualificationStatus = isMajor || direct ? 'DIRECT' : qualificationSource === 'PUBLIC_QUALIFIER' ? 'QUALIFIER_PENDING' : 'QUALIFIED';
        return {
          id: `${candidate.id}-${input.season}-h${input.half}-${input.teamId}`,
          seriesId: candidate.id,
          name: candidate.nameTemplate.replace('{organizer}', organizer).replace('{city}', candidate.city).replace('{year}', String(input.season)),
          season: input.season,
          half: input.half,
          calendarOrder: index + 1,
          tier: candidate.tier,
          honorClass: candidate.honorClass,
          node: qualificationSource === 'PUBLIC_QUALIFIER' ? 'QUALIFIER' : 'MAIN_EVENT',
          simulationMode: candidate.tier === 'MAJOR' ? 'SWISS' : 'FAST',
          teamId: input.teamId,
          qualificationSource,
          qualificationStatus,
          vrsSnapshotId: input.snapshot.id,
          snapshotRank,
          rosterLockCareerHalf: input.half,
          targetEditionId: null,
          city: candidate.city,
          prizePool: candidate.prizePool,
          format: candidate.format ?? 'BO3',
        } satisfies TournamentEdition;
      });
  }

  private createFallbackCalendar(input: { readonly season: number; readonly half: 1 | 2; readonly teamId: string; readonly snapshot: VrsInviteSnapshot }, snapshotRank: number | null): readonly TournamentEdition[] {
    const directT1 = snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= 12;
    const majorEligible = snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= 32;
    const id = `fallback-${input.season}-h${input.half}-${input.teamId}`;
    const rows: TournamentEdition[] = [];
    const add = (suffix: string, name: string, tier: TournamentEdition['tier'], honorClass: TournamentEdition['honorClass'], source: TournamentEdition['qualificationSource'], status: NonNullable<TournamentEdition['qualificationStatus']>) => {
      rows.push({ id: `${id}-${suffix}`, seriesId: `fallback-${suffix}`, name, season: input.season, half: input.half, calendarOrder: rows.length + 1, tier, honorClass, node: 'MAIN_EVENT', simulationMode: tier === 'MAJOR' ? 'SWISS' : 'FAST', teamId: input.teamId, qualificationSource: source, qualificationStatus: status, vrsSnapshotId: input.snapshot.id, snapshotRank, rosterLockCareerHalf: input.half, targetEditionId: null, format: 'BO3' });
    };
    add('t2-1', `区域挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t2-2', `CCT 挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t1-qualifier', `PGL 公开预选 ${input.season}`, 'T1', 'LARGE', directT1 ? 'DIRECT_VRS' : 'PUBLIC_QUALIFIER', directT1 ? 'DIRECT' : 'QUALIFIER_PENDING');
    add('t2-3', `地区杯赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t2-4', `线上挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    if (majorEligible) add('major', `ESL ${input.half === 1 ? '卡托维兹' : '布达佩斯'} Major ${input.season}`, 'MAJOR', 'MAJOR', 'DIRECT_VRS', 'DIRECT');
    return rows;
  }

  public async decideQualification(input: { readonly edition: TournamentEdition; readonly snapshot: VrsInviteSnapshot; readonly roll: number }): Promise<QualificationDecision> {
    this.assertRoll(input.roll, 'roll');
    const rank = input.snapshot.entries.find((entry) => entry.teamId === input.edition.teamId)?.snapshotRank;
    const isMajor = input.edition.tier === 'MAJOR';
    const withinMajorVrs = rank !== undefined && rank >= 1 && rank <= 32;
    if (isMajor && !withinMajorVrs) {
      return { editionId: input.edition.id, teamId: input.edition.teamId, qualified: false, source: input.edition.qualificationSource, chance: 0, roll: input.roll, reasons: { snapshotRank: rank ?? 'UNRANKED', majorVrsLimit: 32, qualificationStatus: input.edition.qualificationStatus ?? 'QUALIFIER_PENDING' } };
    }
    const chance = rank !== undefined ? this.clamp(0.9 - Math.max(0, rank - 8) * 0.025, 0.15, 0.9) : 0.35;
    const qualified = input.edition.qualificationSource === 'DIRECT_VRS' || input.roll < chance;
    return { editionId: input.edition.id, teamId: input.edition.teamId, qualified, source: input.edition.qualificationSource, chance, roll: input.roll, reasons: { snapshotRank: rank ?? 'UNRANKED', qualificationChance: chance } };
  }

  public async lockRoster(input: { readonly edition: TournamentEdition; readonly roster: readonly TeamRosterSlot[]; readonly careerHalf: number; readonly substitutePlayerId?: HltvPlayerId | null; readonly targetRole?: import('../engine/profile').PlayerRole }): Promise<TournamentRosterLock> {
    if (input.careerHalf !== input.edition.rosterLockCareerHalf) throw new Error('Roster can only be locked in the configured career half.');
    const base = input.roster.length ? input.roster : await this.teamRoster(input.edition.teamId);
    const substitute = input.substitutePlayerId ?? null;
    const replacedIndex = base.findIndex((candidate) => candidate.active && (!input.targetRole || candidate.role === input.targetRole));
    const fallbackIndex = base.findIndex((candidate) => candidate.active);
    const effectiveIndex = replacedIndex >= 0 ? replacedIndex : fallbackIndex;
    const roster = substitute && !base.some((slot) => slot.playerId === substitute)
      ? [...base.map((slot, index) => index === effectiveIndex ? { ...slot, active: false } : slot), { playerId: substitute, role: input.targetRole ?? 'SUPPORT', active: true }]
      : base;
    return {
      editionId: input.edition.id,
      teamId: input.edition.teamId,
      lockedAtCareerHalf: input.careerHalf,
      roster: roster.map((slot) => this.copy(slot)),
      substitutePlayerId: substitute,
    };
  }

  private async advanceFast(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[]; readonly state: TournamentProgressState }): Promise<TournamentAdvanceResult> {
    const step = typeof input.state.payload.step === 'string' ? input.state.payload.step : 'PRE';
    const previous = this.matchResults(input.state.payload.matches);
    if (step === 'PRE') {
      return { status: 'ONGOING', state: { ...input.state, revision: input.state.revision + 1, payload: { step: 'IN', matches: previous } }, lifecycleHook: 'IN_TOURNAMENT', uiData: { mode: 'FAST' }, result: null };
    }
    const stages: readonly ('GROUP' | 'PLAYOFF' | 'FINAL')[] = ['GROUP', 'PLAYOFF', 'FINAL'];
    const matches: MatchSimulationResult[] = [...previous];
    for (let index = previous.length; index < stages.length; index += 1) {
      const stage = stages[index];
      if (!stage) continue;
      const match = await this.simulateMatch(input.edition, input.context, input.roster, stage, index);
      matches.push(match);
      if (match.winnerTeamId !== input.edition.teamId) break;
    }
    const result = await this.buildResult(input.edition, input.context, matches, input.roster);
    return { status: 'COMPLETED', state: null, lifecycleHook: 'POST_TOURNAMENT', uiData: { mode: 'FAST', matches: matches.length }, result };
  }

  private async advanceSwiss(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext; readonly roster: readonly TeamRosterSlot[]; readonly state: TournamentProgressState }): Promise<TournamentAdvanceResult> {
    const previous = this.matchResults(input.state.payload.matches);
    const round = this.nonNegativeInteger(input.state.payload.round);
    const wins = this.nonNegativeInteger(input.state.payload.wins);
    const losses = this.nonNegativeInteger(input.state.payload.losses);
    if (round === 0 && previous.length === 0) {
      return { status: 'ONGOING', state: { ...input.state, revision: input.state.revision + 1, payload: { wins, losses, round: 1, matches: previous } }, lifecycleHook: 'IN_TOURNAMENT', uiData: { mode: 'SWISS', wins, losses, round: 1 }, result: null };
    }
    const match = await this.simulateMatch(input.edition, input.context, input.roster, 'SWISS', round);
    const matches = [...previous, match];
    const nextWins = wins + Number(match.winnerTeamId === input.edition.teamId);
    const nextLosses = losses + Number(match.winnerTeamId !== input.edition.teamId);
    if (nextWins >= 3 || nextLosses >= 3) {
      if (nextWins >= 3) {
        const playoff = await this.simulateMatch(input.edition, input.context, input.roster, 'PLAYOFF', matches.length);
        matches.push(playoff);
        if (playoff.winnerTeamId === input.edition.teamId) {
          matches.push(await this.simulateMatch(input.edition, input.context, input.roster, 'FINAL', matches.length));
        }
      }
      const result = await this.buildResult(input.edition, input.context, matches, input.roster);
      return { status: 'COMPLETED', state: null, lifecycleHook: 'POST_TOURNAMENT', uiData: { mode: 'SWISS', wins: nextWins, losses: nextLosses, qualified: nextWins >= 3 }, result };
    }
    return {
      status: 'ONGOING',
      state: { ...input.state, revision: input.state.revision + 1, payload: { wins: nextWins, losses: nextLosses, round: round + 1, matches } },
      lifecycleHook: 'IN_TOURNAMENT',
      uiData: { mode: 'SWISS', wins: nextWins, losses: nextLosses, round: round + 1, eliminationMatch: nextLosses === 2, advancementMatch: nextWins === 2 },
      result: null,
    };
  }

  private async simulateMatch(edition: TournamentEdition, context: TournamentSimulationContext, roster: readonly TeamRosterSlot[], stage: 'GROUP' | 'SWISS' | 'PLAYOFF' | 'FINAL', index: number): Promise<MatchSimulationResult> {
    const opponentTeamId = Object.keys(context.baseOpponentStrength)[index % Math.max(1, Object.keys(context.baseOpponentStrength).length)] ?? `sim-opponent-${index + 1}`;
    const teamStrengthDelta = context.interventions.filter((item) => item.type === 'TEAM_STRENGTH').reduce((sum, item) => sum + (Number.isFinite(item.delta) ? item.delta ?? 0 : 0), 0);
    const opponentStrengthDelta = context.interventions.filter((item) => item.type === 'OPPONENT_STRENGTH' && item.opponentTeamId === opponentTeamId).reduce((sum, item) => sum + (Number.isFinite(item.delta) ? item.delta ?? 0 : 0), 0);
    const configuredPlayerRoster = await this.teamRoster(edition.teamId);
    const mergedPlayerRoster = [...roster, ...configuredPlayerRoster.filter((candidate) => !roster.some((slot) => slot.playerId === candidate.playerId))];
    const playerRoster = this.adjustRosterStrength(await this.completeRoster(edition.teamId, mergedPlayerRoster), context.baseTeamStrength + teamStrengthDelta);
    const opponentRoster = this.adjustRosterStrength(await this.completeRoster(opponentTeamId, await this.teamRoster(opponentTeamId)), (context.baseOpponentStrength[opponentTeamId] ?? 70) + opponentStrengthDelta);
    const players = [...playerRoster, ...opponentRoster];
    const simulated = await this.dependencies.matches.simulate({
      matchId: `${edition.id}-match-${index + 1}`,
      tournamentId: edition.id,
      stage,
      format: stage === 'FINAL' && edition.format === 'BO5' ? 'BO5' : edition.format ?? 'BO3',
      left: { teamId: edition.teamId, playerIds: playerRoster.map((player) => player.playerId), isPlayerTeam: true },
      right: { teamId: opponentTeamId, playerIds: opponentRoster.map((player) => player.playerId), isPlayerTeam: false },
      players,
      mapPool: ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Dust2', 'Anubis', 'Train'],
      pressure: edition.tier === 'MAJOR' ? 90 : edition.tier === 'T1' ? 78 : edition.tier === 'T2' ? 58 : 42,
      teamRanks: { [edition.teamId]: edition.snapshotRank, [opponentTeamId]: context.opponentRanks?.[opponentTeamId] ?? null },
      randomRoll: this.rollFromContext(context.upsetRoll, index),
    });
    const playerStrength = context.baseTeamStrength + teamStrengthDelta;
    const opponentStrength = (context.baseOpponentStrength[opponentTeamId] ?? 70) + opponentStrengthDelta;
    const upset = this.decideUpset(playerStrength, opponentStrength, { ...context, upsetRoll: simulated.randomRoll });
    const playerUnderdog = playerStrength < opponentStrength;
    const forcePlayerWin = playerUnderdog && upset.occurred;
    const forcePlayerLoss = playerUnderdog && upset.forcedByInterventionId !== null && !upset.occurred;
    const currentlyWon = simulated.winnerTeamId === edition.teamId;
    if ((forcePlayerWin && !currentlyWon) || (forcePlayerLoss && currentlyWon)) {
      return {
        ...simulated,
        winnerTeamId: simulated.loserTeamId,
        loserTeamId: simulated.winnerTeamId,
        scores: simulated.scores.map((score) => ({
          ...score,
          teamId: score.teamId === simulated.winnerTeamId ? simulated.loserTeamId : simulated.winnerTeamId,
        })),
        upset: forcePlayerWin,
      };
    }
    return { ...simulated, upset: playerUnderdog && currentlyWon };
  }

  private async completeRoster(teamId: string, roster: readonly TeamRosterSlot[]): Promise<readonly MatchPlayerSnapshot[]> {
    const active = roster.filter((slot) => slot.active).slice(0, 5);
    const roles: readonly MatchPlayerSnapshot['role'][] = ['IGL', 'AWPER', 'ENTRY_FRAGGER', 'SUPPORT', 'LURKER'];
    return Promise.all(Array.from({ length: 5 }, async (_, index) => {
      const slot = active[index];
      const playerId = slot?.playerId ?? `${teamId}-sim-${index + 1}`;
      const injected = this.dependencies.playerSnapshot ? await this.dependencies.playerSnapshot(playerId, teamId) : null;
      if (injected) return injected;
      const role = this.matchRole(slot?.role, roles[index] ?? 'SUPPORT');
      const playerBoost = playerId === this.dependencies.playerId ? 8 : 0;
      return { playerId, teamId, nickname: playerId, role, aim: 68 + playerBoost, gameSense: 66 + playerBoost, leadership: role === 'IGL' ? 78 : 58, clutch: 64 + playerBoost, consistency: 66 + playerBoost, teamConflict: 20, morale: 65, energy: 70, age: 23 };
    }));
  }

  private adjustRosterStrength(roster: readonly MatchPlayerSnapshot[], target: number): readonly MatchPlayerSnapshot[] {
    const current = roster.reduce((sum, player) => sum + player.aim + player.gameSense + player.clutch + player.consistency, 0) / Math.max(1, roster.length * 4);
    const delta = Number.isFinite(target) ? Math.max(-20, Math.min(20, target - current)) : 0;
    return roster.map((player) => ({
      ...player,
      aim: this.clamp(player.aim + delta, 0, 100),
      gameSense: this.clamp(player.gameSense + delta, 0, 100),
      clutch: this.clamp(player.clutch + delta, 0, 100),
      consistency: this.clamp(player.consistency + delta, 0, 100),
    }));
  }

  private aggregatePerformances(matches: readonly MatchSimulationResult[]): readonly TournamentPlayerPerformance[] {
    const playerIds = [...new Set(matches.flatMap((match) => match.playerPerformances).map((performance) => performance.playerId))];
    return playerIds.map((playerId) => {
      const rows = matches.flatMap((match) => match.playerPerformances.map((performance) => ({ match, performance }))).filter((row) => row.performance.playerId === playerId);
      const maps = rows.reduce((sum, row) => sum + row.performance.maps, 0);
      const weighted = (selector: (row: typeof rows[number]) => number) => maps > 0 ? rows.reduce((sum, row) => sum + selector(row) * row.performance.maps, 0) / maps : 0;
      const playoff = rows.filter((row) => row.match.stage === 'PLAYOFF' || row.match.stage === 'FINAL');
      const teamId = rows[0]?.performance.teamId ?? 'unknown-team';
      const top5 = rows.filter((row) => Object.entries(row.match.teamRanks).some(([candidateTeamId, rank]) => candidateTeamId !== teamId && rank !== null && rank <= 5));
      const finals = rows.filter((row) => row.match.stage === 'FINAL');
      const stageRating = (selected: typeof rows) => {
        const stageMaps = selected.reduce((sum, row) => sum + row.performance.maps, 0);
        return stageMaps ? selected.reduce((sum, row) => sum + row.performance.rating2_0 * row.performance.maps, 0) / stageMaps : 0;
      };
      return {
        playerId,
        teamId,
        maps,
        kills: rows.reduce((sum, row) => sum + row.performance.kills, 0),
        deaths: rows.reduce((sum, row) => sum + row.performance.deaths, 0),
        assists: rows.reduce((sum, row) => sum + row.performance.assists, 0),
        rating: Math.min(this.dependencies.balance?.aggregateCeiling ?? DEFAULT_BALANCE_CONFIG.rating.aggregateCeiling, weighted((row) => row.performance.rating2_0)),
        adr: Math.min(95, weighted((row) => row.performance.adr)),
        kast: weighted((row) => row.performance.kast),
        headshotPercentage: weighted((row) => row.performance.headshotPercentage),
        firstKills: rows.reduce((sum, row) => sum + row.performance.firstKills, 0),
        firstDeaths: rows.reduce((sum, row) => sum + row.performance.firstDeaths, 0),
        clutchesWon: rows.reduce((sum, row) => sum + row.performance.clutchesWon, 0),
        playoffMaps: playoff.reduce((sum, row) => sum + row.performance.maps, 0),
        playoffRating: stageRating(playoff),
        top5Maps: top5.reduce((sum, row) => sum + row.performance.maps, 0),
        top5Rating: stageRating(top5),
        finalMaps: finals.reduce((sum, row) => sum + row.performance.maps, 0),
        finalRating: finals.length ? stageRating(finals) : null,
        honor: null,
      };
    });
  }

  private async deriveTeamPlacements(edition: TournamentEdition, matches: readonly MatchSimulationResult[], lockedRoster: readonly TeamRosterSlot[]): Promise<TournamentResult['teamPlacements']> {
    const teams = [...new Set(matches.flatMap((match) => [match.winnerTeamId, match.loserTeamId]))];
    const placements = new Map(teams.map((teamId) => [teamId, 'GROUP_EXIT' as TournamentResult['placement']]));
    const final = [...matches].reverse().find((match) => match.stage === 'FINAL');
    if (final) {
      placements.set(final.winnerTeamId, 'CHAMPION');
      placements.set(final.loserTeamId, 'RUNNER_UP');
    } else {
      const elimination = [...matches].reverse().find((match) => match.winnerTeamId !== edition.teamId) ?? matches[matches.length - 1];
      if (elimination) placements.set(elimination.loserTeamId, elimination.stage === 'PLAYOFF' ? 'SEMIFINAL' : elimination.stage === 'SWISS' || elimination.stage === 'GROUP' ? 'GROUP_EXIT' : 'RUNNER_UP');
    }
    const result = [];
    for (const teamId of teams) {
      const simulatedPlayers = [...new Set(matches.flatMap((match) => match.playerPerformances).filter((performance) => performance.teamId === teamId).map((performance) => performance.playerId))];
      const rosterPlayerIds = teamId === edition.teamId
        ? [...new Set([...lockedRoster.map((slot) => slot.playerId), ...(await this.teamRoster(teamId)).map((slot) => slot.playerId), ...simulatedPlayers])]
        : simulatedPlayers;
      const placement = placements.get(teamId) ?? 'GROUP_EXIT';
      result.push({ teamId, placement, title: placement === 'CHAMPION', rosterPlayerIds });
    }
    return result;
  }

  private allocateHonors(edition: TournamentEdition, placements: TournamentResult['teamPlacements'], performances: readonly TournamentPlayerPerformance[]): readonly TournamentHonor[] {
    if (edition.tier === 'QUALIFIER' || edition.tier === 'UNRANKED' || edition.tier === 'T2' || !placements.some((entry) => entry.title)) return [];
    const placementByTeam = new Map(placements.map((entry) => [entry.teamId, entry.placement]));
    const ranked = [...performances].sort((left, right) => right.rating - left.rating || left.playerId.localeCompare(right.playerId));
    const championBest = ranked.find((performance) => placementByTeam.get(performance.teamId) === 'CHAMPION');
    const runnerBest = ranked.find((performance) => placementByTeam.get(performance.teamId) === 'RUNNER_UP');
    const mvp = runnerBest && runnerBest.rating >= 1.25 && (!championBest || runnerBest.rating >= championBest.rating + 0.08) ? runnerBest : championBest;
    const honors: TournamentHonor[] = mvp ? [{ playerId: mvp.playerId, type: 'MVP', honorClass: edition.honorClass }] : [];
    for (const performance of ranked) {
      const placement = placementByTeam.get(performance.teamId);
      const eligibleDepth = placement === 'CHAMPION' || placement === 'RUNNER_UP' || placement === 'SEMIFINAL' || placement === 'QUARTERFINAL';
      if (performance.playerId !== mvp?.playerId && eligibleDepth && performance.playoffMaps > 0 && performance.playoffRating >= 1.1) {
        honors.push({ playerId: performance.playerId, type: 'EVP', honorClass: edition.honorClass });
      }
    }
    return honors;
  }

  private matchResults(value: unknown): readonly MatchSimulationResult[] {
    return Array.isArray(value) ? value.map((entry) => this.copy(entry as MatchSimulationResult)) : [];
  }

  private nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  }

  private matchRole(value: string | undefined, fallback: MatchPlayerSnapshot['role']): MatchPlayerSnapshot['role'] {
    return value === 'IGL' || value === 'AWPER' || value === 'ENTRY_FRAGGER' || value === 'SUPPORT' || value === 'LURKER' ? value : fallback;
  }

  private rollFromContext(seed: number, salt: number): number {
    const value = Math.sin((seed + 1) * 10000 + salt * 131) * 43758.5453;
    return value - Math.floor(value);
  }

  private decideUpset(playerStrength: number, opponentStrength: number, context: TournamentSimulationContext): UpsetDecision {
    const forced = context.interventions.find((intervention) => intervention.type === 'FORCE_UPSET' && intervention.forceUpset !== null && intervention.forceUpset !== undefined);
    const contributingInterventionIds = context.interventions
      .filter((intervention) => intervention.type === 'UPSET_CHANCE' || intervention.type === 'FORCE_UPSET')
      .map((intervention) => intervention.id);
    const strengthGap = Math.max(-100, Math.min(100, opponentStrength - playerStrength));
    const adjustment = context.interventions
      .filter((intervention) => intervention.type === 'UPSET_CHANCE')
      .reduce((total, intervention) => total + (Number.isFinite(intervention.delta) ? intervention.delta ?? 0 : 0), 0);
    const chance = this.clamp(0.15 + strengthGap / 250 + adjustment, 0, 1);
    return forced
      ? { occurred: forced.forceUpset === true, chance, roll: null, forcedByInterventionId: forced.id, contributingInterventionIds }
      : { occurred: context.upsetRoll < chance, chance, roll: context.upsetRoll, forcedByInterventionId: null, contributingInterventionIds };
  }

  private assertRoll(roll: number, name: string): void {
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError(`${name} must return a finite number in [0, 1).`);
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
