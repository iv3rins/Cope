import type { DailyActionService } from '../daily-action';
import type { EventPeriod, StoryDecision, StoryDecisionResult, StoryEngine, StoryEvent } from '../graph';
import type { CareerGame, CareerGameDependencies } from '../game';
import type { PlayerProfile } from '../profile';
import type { AgeProgressionResult, PlayerProgressionRuleRepository, RegionOriginRule } from '../progression';
import type { CareerTournamentRecord, RetirementSummary } from '../retirement';
import type { CareerSaveEnvelope } from '../save-state';
import type { GameClock, RandomSource } from '../runtime';
import type { TournamentEdition, TournamentResult, TournamentService } from '../../hltv/tournament';
import type { VrsInviteSnapshot } from '../../hltv/team';

export class CareerGameConfigurationError extends Error {
  public constructor(dependency: string) { super(`CareerGame is missing required runtime dependency: ${dependency}.`); this.name = 'CareerGameConfigurationError'; }
}

export interface CareerGameRuntimeServices {
  readonly story?: StoryEngine;
  readonly progressionRules?: PlayerProgressionRuleRepository;
  readonly dailyActions?: DailyActionService;
  readonly tournaments?: TournamentService;
  readonly vrsSnapshot?: (input: { readonly season: number; readonly half: 1 | 2 }) => Promise<VrsInviteSnapshot>;
  readonly clock?: GameClock;
  readonly random?: RandomSource;
}

export class CareerGameImpl implements CareerGame {
  public constructor(private readonly dependencies: CareerGameDependencies, private readonly runtime: CareerGameRuntimeServices = {}) {}

  public async getProfile(): Promise<PlayerProfile> { return (await this.requireSave()).state.player; }

  public async advancePeriod(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<PlayerProfile> {
    this.assertRoll(input.randomRoll);
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const nextDate = this.advanceDate(envelope.state.currentDate, input.period);
    const state = { ...envelope.state, currentDate: nextDate, careerHalf: new Date(Date.parse(nextDate)).getUTCMonth() < 6 ? 1 : 2, season: this.nextSeason(envelope.state.currentDate, nextDate, envelope.state.season) };
    const settled = input.period === 'FINAL_DECISIVE_MOMENT' ? await this.simulateTournaments(state, input.randomRoll) : state;
    await this.saveEnvelope({ ...envelope, state: settled });
    return settled.player;
  }

  public async advanceAge(years?: number): Promise<AgeProgressionResult> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const rule = await this.requireOriginRule(envelope.state.player.originRegion);
    const result = await this.dependencies.progression.advanceAge(years === undefined
      ? { profile: envelope.state.player, originRule: rule }
      : { profile: envelope.state.player, originRule: rule, years });
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player: result.profile } });
    return result;
  }

  public async chooseStoryOption(decision: StoryDecision): Promise<StoryDecisionResult> {
    const story = this.runtime.story;
    if (!story) throw new CareerGameConfigurationError('StoryEngine');
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const result = await story.decide({ profile: envelope.state.player, decision });
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player: result.profile, completedEventIds: [...result.profile.completedEventIds], currentStoryEventId: result.nextEventId } });
    return result;
  }

  public async findAvailableStoryEvents(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<readonly StoryEvent[]> {
    return this.runtime.story ? this.runtime.story.findAvailableEvents({ profile: await this.getProfile(), ...input }) : [];
  }

  public async executeDailyAction(actionId: string, randomRoll: number): Promise<PlayerProfile> {
    const service = this.runtime.dailyActions ?? this.dependencies.dailyActions;
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const result = await service.execute({ player: envelope.state.player, actionId, randomRoll });
    if (!result.completed) return result.player;
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player: result.player } });
    return result.player;
  }

  public async retire(reason?: string): Promise<PlayerProfile> {
    const envelope = await this.requireSave();
    const player = await this.dependencies.retirement.retire(reason === undefined
      ? { player: envelope.state.player, retiredAt: this.clock().now() }
      : { player: envelope.state.player, reason, retiredAt: this.clock().now() });
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player, currentStoryEventId: null } });
    return player;
  }

  public async generateRetirementSummary(): Promise<RetirementSummary> {
    const player = await this.getProfile();
    if (!player.isRetired) throw new Error('Retirement summary requires a retired player.');
    return this.dependencies.retirementSummary.generate({ player });
  }

  /** UI/application extension: simulates exactly one qualified edition and persists its result. */
  public async simulateTournament(input: { readonly edition: TournamentEdition; readonly randomRoll: number }): Promise<TournamentResult> {
    this.assertRoll(input.randomRoll);
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    if (!envelope.state.player.currentTeamId) throw new Error('A player must be signed to a team before entering a tournament.');
    if (input.edition.teamId !== envelope.state.player.currentTeamId) throw new Error('Tournament edition teamId must match the current player team.');
    if (envelope.state.player.tournamentArchive.some((record) => record.editionId === input.edition.id)) throw new Error('Tournament has already been completed.');
    const service = this.runtime.tournaments;
    if (!service) throw new CareerGameConfigurationError('TournamentService');
    const result = await this.simulateEdition(service, input.edition, envelope.state, input.randomRoll);
    const player = this.archiveResult(envelope.state.player, result);
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player, scheduledTournaments: [...envelope.state.scheduledTournaments, input.edition] } });
    return result;
  }

  public async save(): Promise<void> { await this.saveEnvelope(await this.requireSave()); }

  private async simulateTournaments(state: CareerSaveEnvelope['state'], upsetRoll: number): Promise<CareerSaveEnvelope['state']> {
    const tournaments = this.runtime.tournaments;
    const getSnapshot = this.runtime.vrsSnapshot;
    if (!tournaments || !getSnapshot || !state.player.currentTeamId) return state;
    const snapshot = state.activeVrsSnapshot ?? await getSnapshot({ season: state.season, half: state.careerHalf as 1 | 2 });
    const scheduled = state.scheduledTournaments.length ? state.scheduledTournaments : await tournaments.createCalendar({ season: state.season, half: state.careerHalf as 1 | 2, teamId: state.player.currentTeamId, snapshot });
    const results = await Promise.all(scheduled.filter((edition) => !state.unsettledTournamentIds.includes(edition.id)).map((edition) => this.simulateEdition(tournaments, edition, state, upsetRoll)));
    const player = results.reduce((current, result) => this.archiveResult(current, result), state.player);
    return { ...state, player, activeVrsSnapshot: snapshot, scheduledTournaments: scheduled, unsettledTournamentIds: [], pendingTournamentInterventions: [] };
  }

  private async simulateEdition(service: TournamentService, edition: TournamentEdition, state: CareerSaveEnvelope['state'], upsetRoll: number): Promise<TournamentResult> {
    const interventions = await service.findPendingInterventions(edition.id);
    const result = await service.simulate({ edition, context: { editionId: edition.id, baseTeamStrength: this.teamStrength(state.player), baseOpponentStrength: { 'sim-opponent': 70 }, interventions, upsetRoll } });
    await service.settle({ edition, result });
    return result;
  }

  private archiveResult(profile: PlayerProfile, result: TournamentResult): PlayerProfile {
    const performance = result.playerPerformances.find((item) => item.playerId === profile.id);
    if (!performance || profile.tournamentArchive.some((record) => record.editionId === result.editionId)) return profile;
    const level = result.tier === 'MAJOR' ? 'MAJOR' : result.tier === 'T1' ? 'T1' : 'T2';
    const champion = result.title;
    const major = champion && level === 'MAJOR' ? 1 : 0;
    const stier = champion && level === 'T1' ? 1 : 0;
    const mvp = performance.honor === 'MVP' ? level === 'MAJOR' ? 'MAJOR' : 'NORMAL' : null;
    const record: CareerTournamentRecord = { editionId: result.editionId, year: result.season, fullName: result.eventName, organizerId: 'OTHER', level, placement: result.placement === 'CHAMPION' ? 'CHAMPION' : 'RUNNER_UP', rating: performance.rating, mapsPlayed: performance.maps, champion, mvp, trophyAssetId: champion && level !== 'T2' ? 'OTHER' : null };
    return { ...profile, tournamentArchive: [...profile.tournamentArchive, record], career: { ...profile.career, totalKills: profile.career.totalKills + performance.kills, mapsPlayed: profile.career.mapsPlayed + performance.maps, clutchWon: profile.career.clutchWon + (performance.clutchesWon ?? 0), rating2: performance.rating }, trophies: { ...profile.trophies, majorChampionships: profile.trophies.majorChampionships + major, otherSTierTitles: profile.trophies.otherSTierTitles + stier, mvpAwards: profile.trophies.mvpAwards + (mvp ? 1 : 0) } };
  }

  private teamStrength(profile: PlayerProfile): number { const a = profile.attributes; return (a.aim + a.gameSense + a.leadership + a.clutch + a.consistency - a.teamConflict + profile.morale + profile.energy) / 7; }
  private async requireOriginRule(region: PlayerProfile['originRegion']): Promise<RegionOriginRule> { const rule = await this.runtime.progressionRules?.findOriginRule(region); if (!rule) throw new CareerGameConfigurationError(`RegionOriginRule for ${region}`); return rule; }
  private async requireSave(): Promise<CareerSaveEnvelope> { const value = await this.dependencies.stateRepository.load(this.dependencies.playerId); if (!value) throw new Error(`No career save exists for player ${this.dependencies.playerId}.`); return value; }
  private async saveEnvelope(envelope: CareerSaveEnvelope): Promise<void> { await this.dependencies.stateRepository.save(this.dependencies.playerId, envelope); }
  private assertActive(player: PlayerProfile): void { if (player.isRetired) throw new Error('This career is retired and can no longer advance.'); }
  private assertRoll(roll: number): void { if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('randomRoll must be a finite number in [0, 1).'); }
  private clock(): GameClock { if (!this.runtime.clock) throw new CareerGameConfigurationError('GameClock'); return this.runtime.clock; }
  private advanceDate(currentDate: string, period: EventPeriod): string { const timestamp = Date.parse(currentDate); if (Number.isNaN(timestamp)) throw new Error(`Invalid state currentDate: ${currentDate}.`); const date = new Date(timestamp); date.setUTCDate(date.getUTCDate() + (period === 'NORMAL' ? 7 : 14)); return date.toISOString(); }
  private nextSeason(currentDate: string, nextDate: string, season: number): number { return season + (new Date(Date.parse(nextDate)).getUTCFullYear() > new Date(Date.parse(currentDate)).getUTCFullYear() ? 1 : 0); }
}
