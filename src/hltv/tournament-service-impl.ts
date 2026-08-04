import type { GameClock, RandomSource } from '../engine/runtime';
import type {
  QualificationDecision,
  TournamentCompletedFact,
  TournamentEdition,
  TournamentFactRepository,
  TournamentIntervention,
  TournamentInterventionAppliedFact,
  TournamentPlayerPerformance,
  TournamentResult,
  TournamentRosterLock,
  TournamentService,
  TournamentSimulationContext,
  UpsetDecision,
} from './tournament';
import type { HltvPlayerId, TeamRosterSlot, VrsInviteSnapshot } from './team';

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

  public async simulate(input: { readonly edition: TournamentEdition; readonly context: TournamentSimulationContext }): Promise<TournamentResult> {
    const { edition, context } = input;
    if (edition.id !== context.editionId) throw new Error('TournamentSimulationContext editionId must match TournamentEdition id.');
    this.assertRoll(context.upsetRoll, 'upsetRoll');

    if (!Number.isFinite(context.baseTeamStrength)) throw new RangeError('baseTeamStrength must be finite.');
    const playerStrength = this.applyPlayerStrength(context.baseTeamStrength, context.interventions);
    const opponentStrengths = Object.entries(context.baseOpponentStrength).map(([teamId, strength]) => {
      if (!Number.isFinite(strength)) throw new RangeError(`Opponent strength for ${teamId} must be finite.`);
      return { teamId, strength: this.applyOpponentStrength(teamId, strength, context.interventions) };
    });
    const firstOpponent = opponentStrengths[0];
    if (!firstOpponent) throw new Error('TournamentSimulationContext must contain at least one opponent strength.');
    const strongestOpponent = opponentStrengths.reduce<{ readonly teamId: string; readonly strength: number }>(
      (strongest, candidate) => candidate.strength > strongest.strength ? candidate : strongest,
      firstOpponent,
    );
    const upset = this.decideUpset(playerStrength, strongestOpponent.strength, context);
    const won = upset.occurred || playerStrength >= strongestOpponent.strength;
    const placement = won ? 'CHAMPION' : 'RUNNER_UP';
    const maps = edition.tier === 'T2' ? (won ? 3 : 2) : (won ? 24 : 20);
    const performance = this.createPlayerPerformance(maps, playerStrength, strongestOpponent.strength, won, edition.snapshotRank);

    return {
      editionId: edition.id,
      seriesId: edition.seriesId,
      season: edition.season,
      eventName: edition.name,
      teamId: edition.teamId,
      tier: edition.tier,
      honorClass: edition.honorClass,
      placement,
      title: won,
      qualificationSource: edition.qualificationSource,
      vrsSnapshotId: edition.vrsSnapshotId,
      upset,
      consumedInterventions: context.interventions.map((intervention) => this.copy(intervention)),
      ...(edition.city ? { city: edition.city } : {}),
      prizeMoney: won ? edition.prizePool ?? 0 : edition.prizePool ? Math.round(edition.prizePool * 0.2) : 0,
      seriesDetails: [{ stage: won ? '决赛' : '淘汰赛', format: edition.format ?? 'BO3', opponentTeamId: strongestOpponent.teamId, opponentRank: null, mapScores: won ? ['13:9', '13:10'] : ['9:13', '10:13'] }],
      playerPerformances: [performance],
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
    const teamTier = snapshotRank !== null && snapshotRank <= 32 ? 'T1' : snapshotRank !== null && snapshotRank <= 120 ? 'T2' : 'T3';
    const asset = await this.dependencies.calendarReader?.() ?? null;
    if (!asset || (asset.schemaVersion !== 1 && asset.schemaVersion !== 2) || asset.editions.length === 0) return this.createFallbackCalendar(input, snapshotRank);

    return asset.editions
      .filter((candidate) => candidate.half === input.half)
      .filter((candidate) => teamTier === 'T1' ? candidate.tier === 'T1' || candidate.tier === 'MAJOR' : candidate.tier === 'T2' || candidate.tier === 'T1')
      .filter((candidate) => !candidate.major || (snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= 32))
      .map((candidate, index) => {
        const organizer = asset.organizers[candidate.organizerId] ?? candidate.organizerId;
        const isMajor = candidate.tier === 'MAJOR';
        const direct = teamTier === 'T1' && snapshotRank !== null && snapshotRank >= 1 && (isMajor ? snapshotRank <= 32 : snapshotRank <= 20);
        const qualificationSource = direct ? 'DIRECT_VRS' : isMajor ? 'OPEN_ENTRY' : candidate.tier === 'T1' ? 'PUBLIC_QUALIFIER' : 'OPEN_ENTRY';
        const qualificationStatus = direct ? 'DIRECT' : qualificationSource === 'PUBLIC_QUALIFIER' ? 'QUALIFIER_PENDING' : 'QUALIFIED';
        return {
          id: `${candidate.id}-${input.season}-h${input.half}-${input.teamId}`,
          seriesId: candidate.id,
          name: candidate.nameTemplate.replace('{organizer}', organizer).replace('{city}', candidate.city).replace('{year}', String(input.season)),
          season: input.season,
          half: input.half,
          calendarOrder: index + 1,
          tier: candidate.tier,
          honorClass: candidate.honorClass,
          node: teamTier === 'T1' || candidate.tier === 'T2' ? 'MAIN_EVENT' : candidate.tier === 'T1' ? 'QUALIFIER' : 'MAIN_EVENT',
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
    const direct = snapshotRank !== null && snapshotRank >= 1 && snapshotRank <= 32;
    const id = `fallback-${input.season}-h${input.half}-${input.teamId}`;
    const rows: TournamentEdition[] = [];
    const add = (suffix: string, name: string, tier: TournamentEdition['tier'], honorClass: TournamentEdition['honorClass'], source: TournamentEdition['qualificationSource'], status: NonNullable<TournamentEdition['qualificationStatus']>) => {
      rows.push({ id: `${id}-${suffix}`, seriesId: `fallback-${suffix}`, name, season: input.season, half: input.half, calendarOrder: rows.length + 1, tier, honorClass, node: 'MAIN_EVENT', teamId: input.teamId, qualificationSource: source, qualificationStatus: status, vrsSnapshotId: input.snapshot.id, snapshotRank, rosterLockCareerHalf: input.half, targetEditionId: null, format: 'BO3' });
    };
    add('t2-1', `区域挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t2-2', `CCT 挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t1-qualifier', `PGL 公开预选 ${input.season}`, 'T1', 'LARGE', direct ? 'DIRECT_VRS' : 'PUBLIC_QUALIFIER', direct ? 'DIRECT' : 'QUALIFIER_PENDING');
    add('t2-3', `地区杯赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    add('t2-4', `线上挑战赛 ${input.season}`, 'T2', 'MEDIUM', 'OPEN_ENTRY', 'QUALIFIED');
    if (direct) add('major', `ESL ${input.half === 1 ? '卡托维兹' : '布达佩斯'} Major ${input.season}`, 'MAJOR', 'MAJOR', 'DIRECT_VRS', 'DIRECT');
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

  public async lockRoster(input: { readonly edition: TournamentEdition; readonly roster: readonly TeamRosterSlot[]; readonly careerHalf: number }): Promise<TournamentRosterLock> {
    if (input.careerHalf !== input.edition.rosterLockCareerHalf) throw new Error('Roster can only be locked in the configured career half.');
    return {
      editionId: input.edition.id,
      teamId: input.edition.teamId,
      lockedAtCareerHalf: input.careerHalf,
      roster: input.roster.map((slot) => this.copy(slot)),
      substitutePlayerId: null,
    };
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

  private applyPlayerStrength(base: number, interventions: readonly TournamentIntervention[]): number {
    return interventions.filter((item) => item.type === 'TEAM_STRENGTH').reduce((value, item) => value + (Number.isFinite(item.delta) ? item.delta ?? 0 : 0), base);
  }

  private applyOpponentStrength(opponentId: string, base: number, interventions: readonly TournamentIntervention[]): number {
    return interventions
      .filter((item) => item.type === 'OPPONENT_STRENGTH' && item.opponentTeamId === opponentId)
      .reduce((value, item) => value + (Number.isFinite(item.delta) ? item.delta ?? 0 : 0), base);
  }

  private createPlayerPerformance(maps: number, playerStrength: number, opponentStrength: number, won: boolean, snapshotRank: number | null): TournamentPlayerPerformance {
    const normal = this.normalSample();
    const advantage = this.clamp((playerStrength - opponentStrength) / 100, -0.4, 0.4);
    const rating = this.clamp(1.02 + advantage * 0.3 + normal * 0.13 + (won ? 0.05 : -0.04), 0.3, 2.5);
    const kills = Math.max(0, Math.round(maps * 20 * (0.7 + rating * 0.3) + this.normalSample() * 4));
    const deaths = Math.max(0, Math.round(maps * 18 * (1.35 - rating * 0.3) + this.normalSample() * 3));
    const assists = Math.max(0, Math.round(maps * 5 + this.normalSample() * 2));
    const playoffMaps = Math.max(0, Math.round(maps * 0.45));
    const playoffRating = rating + (this.nextRoll() * 0.12 - 0.06);
    const finalMaps = won ? Math.max(1, Math.round(maps * 0.2)) : 0;
    const finalRating = finalMaps > 0 ? rating + (this.nextRoll() * 0.1 - 0.05) : null;
    const top5Maps = snapshotRank !== null && snapshotRank <= 20 ? Math.max(0, Math.round(maps * 0.45)) : Math.max(0, Math.round(maps * 0.25));
    const top5Rating = top5Maps > 0 ? rating + (this.nextRoll() * 0.1 - 0.05) : rating;
    return {
      playerId: this.dependencies.playerId,
      maps,
      kills,
      deaths,
      assists,
      rating,
      adr: this.clamp(68 + rating * 12 + this.normalSample() * 6, 20, 140),
      kast: this.clamp(62 + rating * 10 + this.normalSample() * 4, 20, 100),
      headshotPercentage: this.clamp(42 + this.normalSample() * 10, 0, 100),
      firstKills: Math.max(0, Math.round(maps * 4 + this.normalSample() * 2)),
      firstDeaths: Math.max(0, Math.round(maps * 4 + this.normalSample() * 2)),
      clutchesWon: Math.max(0, Math.round(maps + this.normalSample() * 1.5)),
      playoffMaps,
      playoffRating,
      top5Maps,
      top5Rating,
      finalMaps,
      finalRating,
      honor: won && rating >= 1.15 ? 'MVP' : null,
    };
  }

  /** Box-Muller transform; a new deterministic RNG value is consumed for each sample. */
  private normalSample(): number {
    const u1 = Math.max(Number.MIN_VALUE, this.nextRoll());
    const u2 = this.nextRoll();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private nextRoll(): number {
    const roll = this.dependencies.random.next();
    this.assertRoll(roll, 'RandomSource.next()');
    return roll;
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
