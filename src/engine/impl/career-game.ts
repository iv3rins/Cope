import type { DailyActionService } from '../daily-action';
import type { CareerEventWindow, EventPeriod, StoryContextFacts, StoryDecision, StoryDecisionResult, StoryEngine, StoryEvent, StoryEventPhase } from '../graph';
import type { CareerGame, CareerGameDependencies } from '../game';
import type { PlayerProfile } from '../profile';
import type { AgeProgressionResult, PlayerProgressionRuleRepository, RegionOriginRule } from '../progression';
import type { CareerTournamentRecord, RetirementSummary } from '../retirement';
import type { CareerSaveEnvelope } from '../save-state';
import type { GameClock, RandomSource } from '../runtime';
import type { TournamentEdition, TournamentResult, TournamentService } from '../../hltv/tournament';
import type { VrsInviteSnapshot } from '../../hltv/team';
import type { TransferOffer, TransferTargetService, TransferTargetView } from '../../hltv/transfer-targets';
import type { TeamTier } from '../../hltv/team';
import type { PlayerContractService, ContractTerms, PlayerContract } from '../contract';
import { SaveContractService } from './contract-service';
import { ConditionEvaluatorImpl } from './condition-evaluator';

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
  readonly transferTargets?: TransferTargetService;
  readonly contractService?: PlayerContractService;
  readonly teamTier?: (teamId: string) => TeamTier | undefined;
}

export class CareerGameImpl implements CareerGame {
  public constructor(private readonly dependencies: CareerGameDependencies, private readonly runtime: CareerGameRuntimeServices = {}) {}

  public async getProfile(): Promise<PlayerProfile> { return (await this.requireSave()).state.player; }

  public async startSeason(): Promise<readonly TournamentEdition[]> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const state = await this.ensureSchedule(envelope.state);
    if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state: { ...state, seasonPhase: 'ACTIVE', tournamentCursor: 0, tournamentPhase: state.tournamentPhase ?? 'PRE', activeTournamentId: state.activeTournamentId ?? null, tournamentMatchCursor: state.tournamentMatchCursor ?? 0 } });
    return state.scheduledTournaments.map((edition) => this.copy(edition));
  }

  public async selectTransferTarget(teamId: string): Promise<TransferOffer> {
    const envelope = await this.requireSave();
    const targets = await this.listTransferTargets();
    const target = targets.find((candidate) => candidate.teamId === teamId && candidate.eligible);
    if (!target) throw new Error(`Transfer target is not eligible: ${teamId}.`);
    const now = this.clock().now();
    const expires = new Date(Date.parse(now));
    expires.setUTCDate(expires.getUTCDate() + 14);
    const offer: TransferOffer = { offerId: `offer-${envelope.state.player.id}-${teamId}-${Date.parse(now)}`, teamId: target.teamId, teamName: target.teamName, tier: target.tier, salaryPerMonth: target.salaryPerMonth, buyoutAmount: target.buyoutAmount, roleOffer: target.roleOffer === 'SUBSTITUTE' ? 'SUBSTITUTE' : target.contractLengthMonths && target.contractLengthMonths <= 6 ? 'SHORT_TERM' : 'STARTER', source: 'CONFIGURED_TARGET', createdAt: now, expiresAt: expires.toISOString() };
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, pendingTransferOffer: offer } });
    return this.copy(offer);
  }

  public async listTransferTargets(): Promise<readonly TransferTargetView[]> {
    const service = this.runtime.transferTargets;
    if (!service) return [];
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const snapshot = envelope.state.activeVrsSnapshot;
    const ranks = Object.fromEntries((snapshot?.entries ?? []).map((entry) => [entry.teamId, entry.snapshotRank])) as Readonly<Record<string, number>>;
    const invitationWindow = envelope.state.seasonPhase === 'OFFSEASON' || envelope.state.seasonPhase === 'REPORT' ? 'OFFSEASON' : 'NORMAL';
    return service.list({ player: envelope.state.player, snapshotRanks: ranks, currentTeamTier: envelope.state.player.currentTeamTier, randomRoll: this.nextRoll(), invitationWindow });
  }

  public async getVrsStatus(): Promise<{ readonly rank: number | null; readonly points: number | null; readonly source: import('../../hltv/team').RankingSource | null }> {
    const state = await this.ensureSchedule((await this.requireSave()).state);
    const teamId = state.player.currentTeamId;
    const entry = teamId ? state.activeVrsSnapshot?.entries.find((candidate) => candidate.teamId === teamId) : undefined;
    return { rank: entry?.snapshotRank ?? null, points: entry?.points ?? null, source: entry?.source ?? null };
  }

  public async getNextTournament(): Promise<TournamentEdition | null> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    if (!envelope.state.player.currentTeamId) return null;
    const state = await this.ensureSchedule(envelope.state);
    const cursor = state.tournamentCursor ?? 0;
    const next = state.scheduledTournaments[cursor] ?? null;
    if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state: { ...state, seasonPhase: 'ACTIVE', tournamentCursor: cursor, tournamentPhase: state.tournamentPhase ?? 'PRE', activeTournamentId: state.activeTournamentId ?? null, tournamentMatchCursor: state.tournamentMatchCursor ?? 0 } });
    return next ? this.copy(next) : null;
  }

  public async finishSeason(): Promise<import('../save-state').HalfSeasonSettlement | null> {
    const envelope = await this.requireSave();
    const state = envelope.state;
    if (state.seasonPhase === 'REPORT' && state.halfSeasonSettlement) return this.copy(state.halfSeasonSettlement);
    const results = state.tournamentResults ?? [];
    if (!state.scheduledTournaments.length || (state.tournamentCursor ?? 0) < state.scheduledTournaments.length) return null;
    const totalPrizeMoney = results.reduce((sum, result) => sum + (result.prizeMoney ?? 0), 0);
    const mapsPlayed = results.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.maps ?? 0), 0);
    const kills = results.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.kills ?? 0), 0);
    const clutchWon = results.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.clutchesWon ?? 0), 0);
    const activeContract = state.player.currentContractId ? state.contracts.find((contract) => contract.id === state.player.currentContractId && contract.status === 'ACTIVE') : null;
    const salaryPerMonth = activeContract?.salaryPerMonth ?? 0;
    const salaryExpense = Math.max(0, Math.round(salaryPerMonth * 6));
    const half = state.careerHalf === 2 ? 2 as const : 1 as const;
    const ranking = half === 2 ? await this.dependencies.hltv.findTop20(state.season) : null;
    const rankedPlayer = ranking ? await this.dependencies.hltv.synchronizeCareerHonors(state.player, ranking) : state.player;
    const settlement = { season: state.season, half, tournamentIds: results.map((result) => result.editionId), totalPrizeMoney, salaryExpense, netBalanceDelta: totalPrizeMoney - salaryExpense, mapsPlayed, kills, clutchWon, top20Published: half === 2, top20Ranking: ranking };
    const player = { ...rankedPlayer, life: { ...rankedPlayer.life, balance: rankedPlayer.life.balance + settlement.netBalanceDelta } };
    await this.saveEnvelope({ ...envelope, state: { ...state, player, seasonPhase: 'REPORT', halfSeasonSettlement: settlement } });
    return settlement;
  }

  public async findCareerEvent(window: CareerEventWindow): Promise<StoryEvent | null> {
    const story = this.runtime.story;
    if (!story) return null;
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    if (envelope.state.seasonPhase === 'EVENT' && envelope.state.eventResume?.eventId) {
      const pending = await story.findAvailableEvents({ profile: envelope.state.player, period: this.eventPeriodFor(window), phase: this.eventPhaseFor(window), randomRoll: this.nextRoll(), facts: this.storyFacts(envelope.state) });
      const current = pending.find((event) => event.id === envelope.state.eventResume?.eventId);
      if (current) return this.copy(current);
    }
    const period = this.eventPeriodFor(window);
    const phase = this.eventPhaseFor(window);
    const eventLimit = envelope.state.player.difficultyMode === 'HARDCORE' ? 4 : Number.POSITIVE_INFINITY;
    if ((envelope.state.storyEventsThisHalf ?? 0) >= eventLimit) return null;
    const events = await story.findAvailableEvents({ profile: envelope.state.player, period, phase, randomRoll: this.nextRoll(), facts: this.storyFacts(envelope.state) });
    const preferredEventId = envelope.state.currentStoryEventId;
    const repeatableHistory = envelope.state.repeatableEventHistory ?? [];
    const eligibleEvents = events.filter((candidate) => candidate.repeatable ? !repeatableHistory.some((entry) => entry.eventId === candidate.id && entry.season === envelope.state.season) : true);
    const event = (preferredEventId ? eligibleEvents.find((candidate) => candidate.id === preferredEventId) : undefined)
      ?? this.pickWeightedEvent(this.highestPriorityEvents(eligibleEvents), this.nextRoll())
      ?? null;
    if (!event) return null;
    const resume = window === 'SEASON_START' ? 'START_SEASON' : window === 'REPORT' ? 'CONTINUE_REPORT' : 'CONTINUE_SEASON';
    const state = { ...envelope.state, storyEventsThisHalf: (envelope.state.storyEventsThisHalf ?? 0) + 1, seasonPhase: 'EVENT' as const, eventResume: { mode: resume as 'START_SEASON' | 'CONTINUE_SEASON' | 'CONTINUE_REPORT', eventId: event.id, tournamentId: envelope.state.activeTournamentId ?? envelope.state.scheduledTournaments[envelope.state.tournamentCursor ?? 0]?.id ?? null } };
    await this.saveEnvelope({ ...envelope, state });
    return this.copy(event);
  }

  public async advanceTournament(): Promise<TournamentResult | null> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const state = await this.ensureSchedule(envelope.state);
    const cursor = state.tournamentCursor ?? 0;
    const edition = state.scheduledTournaments[cursor];
    if (!edition) {
      if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state });
      return null;
    }
    const service = this.runtime.tournaments;
    if (!service) throw new CareerGameConfigurationError('TournamentService');
    const activeState = state.activeTournamentId === edition.id && state.tournamentPhase === 'IN'
      ? state
      : { ...state, activeTournamentId: edition.id, tournamentPhase: 'IN' as const, tournamentMatchCursor: state.tournamentMatchCursor ?? 0 };
    if (activeState !== state) await this.saveEnvelope({ ...envelope, state: activeState });
    if (activeState.tournamentMatchCursor === 0) {
      const inTournamentEvent = await this.findCareerEvent('SEASON_END');
      if (inTournamentEvent) return null;
    }
    const qualification = edition.qualificationSource === 'PUBLIC_QUALIFIER'
      ? await service.decideQualification({ edition, snapshot: activeState.activeVrsSnapshot!, roll: this.nextRoll() })
      : null;
    if (qualification && !qualification.qualified) {
      const updatedEdition = { ...edition, qualificationStatus: 'QUALIFIER_EXIT' as const };
      const scheduledTournaments = state.scheduledTournaments.map((candidate, index) => index === cursor ? updatedEdition : candidate);
      await this.saveEnvelope({ ...envelope, state: { ...activeState, scheduledTournaments, tournamentCursor: cursor + 1, tournamentPhase: 'POST', tournamentMatchCursor: 0, activeTournamentId: edition.id, unsettledTournamentIds: activeState.unsettledTournamentIds.filter((id) => id !== edition.id) } });
      return null;
    }
    const result = await this.simulateEdition(service, edition, activeState, this.nextRoll());
    await this.dependencies.hltv.recordTop20Evidence?.({ result, player: activeState.player });
    const player = this.archiveResult(activeState.player, result);
    await this.saveEnvelope({ ...envelope, state: { ...activeState, player, tournamentResults: [...(activeState.tournamentResults ?? []), result], tournamentCursor: cursor + 1, tournamentPhase: 'POST', tournamentMatchCursor: 1, activeTournamentId: edition.id, unsettledTournamentIds: activeState.unsettledTournamentIds.filter((id) => id !== edition.id) } });
    return result;
  }

  public async advancePeriod(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<PlayerProfile> {
    this.assertRoll(input.randomRoll);
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const nextDate = this.advanceDate(envelope.state.currentDate, input.period);
    const calendarTransition = input.period === 'OFFSEASON' && envelope.state.seasonPhase === 'REPORT';
    const nextHalf = calendarTransition ? (envelope.state.careerHalf === 1 ? 2 : 1) : (new Date(Date.parse(nextDate)).getUTCMonth() < 6 ? 1 : 2);
    const nextSeason = calendarTransition && envelope.state.careerHalf === 2 ? envelope.state.season + 1 : this.nextSeason(envelope.state.currentDate, nextDate, envelope.state.season);
    const player = calendarTransition && envelope.state.careerHalf === 2
      ? (await this.dependencies.progression.advanceAge({ profile: envelope.state.player, originRule: await this.requireOriginRule(envelope.state.player.originRegion) })).profile
      : envelope.state.player;
    const state = calendarTransition
      ? { ...envelope.state, currentDate: nextDate, careerHalf: nextHalf, season: nextSeason, player, storyEventsThisHalf: 0, seasonPhase: 'ACTIVE' as const, tournamentCursor: 0, tournamentResults: [], scheduledTournaments: [], unsettledTournamentIds: [], halfSeasonSettlement: null, eventResume: null }
      : { ...envelope.state, currentDate: nextDate, careerHalf: nextHalf, season: nextSeason };
    await this.saveEnvelope({ ...envelope, state });
    return state.player;
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
    const result = await story.decide({ profile: envelope.state.player, decision, facts: this.storyFacts(envelope.state) });
    const resume = envelope.state.eventResume;
    const nextPhase = resume?.mode === 'CONTINUE_REPORT' ? 'REPORT' : resume ? 'ACTIVE' : envelope.state.seasonPhase;
    const repeatableEventHistory = result.profile.completedEventIds.includes(decision.eventId)
      ? [...(envelope.state.repeatableEventHistory ?? []).filter((entry) => !(entry.eventId === decision.eventId && entry.season === envelope.state.season)), ...(envelope.state.repeatableEventHistory ?? []).some((entry) => entry.eventId === decision.eventId && entry.season === envelope.state.season) ? [] : [{ eventId: decision.eventId, season: envelope.state.season }]]
      : [...(envelope.state.repeatableEventHistory ?? [])];
    const contractService = this.runtime.contractService ?? new SaveContractService(
      envelope.state.contracts,
      new ConditionEvaluatorImpl(),
      (profile) => ({ player: profile, currentTeamId: profile.currentTeamId, opponentTeamId: null, randomRoll: decision.randomRoll, difficultyMode: profile.difficultyMode }),
      this.runtime.teamTier,
    );
    let player = result.profile;
    let contracts = [...envelope.state.contracts];
    let terminatedContractId = result.terminatedContractId;
    for (const effect of result.appliedEffects) {
      if (effect.type === 'FORCE_CONTRACT_TERMINATION') {
        const termination = await contractService.terminate({ profile: player, effect, sourceStoryEventId: decision.eventId, sourceOptionId: decision.optionId, occurredAt: this.clock().now() });
        if (termination.terminated) {
          player = termination.profile;
          contracts = [...contractService.snapshot];
          terminatedContractId = termination.contract.id;
        }
      }
    }
    for (const effect of result.appliedEffects) {
      if (effect.type !== 'TEAM_TRANSFER') continue;
      const now = this.clock().now();
      const offer = effect.offerRef === 'CURRENT_TRANSFER_OFFER' ? envelope.state.pendingTransferOffer ?? null : null;
      if (effect.offerRef === 'CURRENT_TRANSFER_OFFER' && (!offer || Date.parse(offer.expiresAt) <= Date.parse(now))) continue;
      const targetTeamId = effect.teamId ?? offer?.teamId;
      if (!targetTeamId) continue;
      const endsAt = effect.endsAt ?? this.contractEndDate(now);
      const terms: ContractTerms = { teamId: targetTeamId, startedAt: now, endsAt, salaryPerMonth: effect.salaryPerMonth ?? offer?.salaryPerMonth ?? 0, buyoutAmount: effect.buyoutAmount ?? offer?.buyoutAmount ?? 0 };
      const currentContract = player.currentContractId
        ? contracts.find((contract) => contract.id === player.currentContractId && contract.status === 'ACTIVE') ?? null
        : null;
      const contractProfile = currentContract && currentContract.teamId !== player.currentTeamId
        ? { ...player, currentTeamId: currentContract.teamId }
        : player;
      const response = currentContract
        ? await contractService.transfer({ profile: contractProfile, currentContractId: currentContract.id, terms, occurredAt: now })
        : await contractService.sign({ profile: player, terms, occurredAt: now });
      if ('contract' in response && !('reason' in response)) {
        player = response.profile;
        contracts = [...contractService.snapshot];
      }
    }
    const activeContract = contracts.find((contract) => contract.playerId === player.id && contract.status === 'ACTIVE' && contract.teamId === player.currentTeamId) ?? null;
    if (activeContract) player = { ...player, currentContractId: activeContract.id, freeAgencyStatus: 'SIGNED' };
    const resumedTournament = resume?.tournamentId && envelope.state.activeTournamentId === resume.tournamentId;
    const nextState = {
      ...envelope.state,
      player,
      contracts,
      repeatableEventHistory,
      currentStoryEventId: result.nextEventId,
      eventResume: null,
      ...(resumedTournament ? { tournamentPhase: 'IN' as const, tournamentMatchCursor: (envelope.state.tournamentMatchCursor ?? 0) + 1 } : {}),
    };
    await this.saveEnvelope({ ...envelope, state: nextPhase ? { ...nextState, seasonPhase: nextPhase } : nextState });
    return { ...result, profile: player, terminatedContractId };
  }

  public async findAvailableStoryEvents(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<readonly StoryEvent[]> {
    if (!this.runtime.story) return [];
    const envelope = await this.requireSave();
    return this.runtime.story.findAvailableEvents({ profile: envelope.state.player, ...input, facts: this.storyFacts(envelope.state) });
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

  public async save(): Promise<void> { await this.saveEnvelope(await this.requireSave()); }

  private eventPhaseFor(window: CareerEventWindow): StoryEventPhase {
    switch (window) {
      case 'PRE_TOURNAMENT':
      case 'SEASON_START': return 'PRE_TOURNAMENT';
      case 'POST_TOURNAMENT':
      case 'REPORT':
      case 'OFFSEASON': return 'POST_TOURNAMENT';
      case 'SEASON_END': return 'IN_TOURNAMENT';
    }
  }

  private highestPriorityEvents(events: readonly StoryEvent[]): readonly StoryEvent[] {
    if (!events.length) return events;
    const priority = Math.max(...events.map((event) => typeof event.priority === 'number' && Number.isFinite(event.priority) ? event.priority : 50));
    return events.filter((event) => (typeof event.priority === 'number' && Number.isFinite(event.priority) ? event.priority : 50) === priority);
  }

  private pickWeightedEvent(events: readonly StoryEvent[], roll: number): StoryEvent | null {
    const weighted = events.map((event) => ({ event, weight: typeof event.weight === 'number' && Number.isFinite(event.weight) ? Math.max(0, event.weight) : 1 })).filter((entry) => entry.weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return null;
    let cursor = roll * total;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor < 0) return this.copy(entry.event);
    }
    const last = weighted[weighted.length - 1];
    return last ? this.copy(last.event) : null;
  }

  private eventPeriodFor(window: CareerEventWindow): EventPeriod {
    switch (window) {
      case 'SEASON_START': return 'NORMAL';
      case 'PRE_TOURNAMENT': return 'NORMAL';
      case 'POST_TOURNAMENT': return 'NORMAL';
      case 'SEASON_END': return 'FINAL_DECISIVE_MOMENT';
      case 'REPORT': return 'AFTER_TOP20';
      case 'OFFSEASON': return 'OFFSEASON';
    }
  }

  private async ensureSchedule(state: CareerSaveEnvelope['state']): Promise<CareerSaveEnvelope['state']> {
    if (state.scheduledTournaments.length || !state.player.currentTeamId) return state;
    const tournaments = this.runtime.tournaments;
    const getSnapshot = this.runtime.vrsSnapshot;
    if (!tournaments || !getSnapshot) return state;
    const snapshot = state.activeVrsSnapshot ?? await getSnapshot({ season: state.season, half: state.careerHalf as 1 | 2 });
    const scheduledTournaments = await tournaments.createCalendar({ season: state.season, half: state.careerHalf as 1 | 2, teamId: state.player.currentTeamId, snapshot });
    return { ...state, activeVrsSnapshot: snapshot, scheduledTournaments, unsettledTournamentIds: scheduledTournaments.map((edition) => edition.id) };
  }

  private async simulateTournaments(state: CareerSaveEnvelope['state'], upsetRoll: number): Promise<CareerSaveEnvelope['state']> {
    const tournaments = this.runtime.tournaments;
    const scheduledState = await this.ensureSchedule(state);
    const cursor = scheduledState.tournamentCursor ?? 0;
    const edition = scheduledState.scheduledTournaments[cursor];
    if (!tournaments || !edition) return scheduledState;
    if (edition.qualificationSource === 'PUBLIC_QUALIFIER') {
      const qualification = await tournaments.decideQualification({ edition, snapshot: scheduledState.activeVrsSnapshot!, roll: upsetRoll });
      if (!qualification.qualified) {
        const scheduledTournaments = scheduledState.scheduledTournaments.map((candidate, index) => index === cursor ? { ...candidate, qualificationStatus: 'QUALIFIER_EXIT' as const } : candidate);
        return { ...scheduledState, scheduledTournaments, tournamentCursor: cursor + 1, unsettledTournamentIds: scheduledState.unsettledTournamentIds.filter((id) => id !== edition.id) };
      }
    }
    const result = await this.simulateEdition(tournaments, edition, scheduledState, upsetRoll);
    await this.dependencies.hltv.recordTop20Evidence?.({ result, player: scheduledState.player });
    return {
      ...scheduledState,
      player: this.archiveResult(scheduledState.player, result),
      tournamentResults: [...(scheduledState.tournamentResults ?? []), result],
      tournamentCursor: cursor + 1,
      unsettledTournamentIds: scheduledState.unsettledTournamentIds.filter((id) => id !== edition.id),
    };
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
    const moraleDelta = champion ? 5 : -8;
    const energyDelta = champion ? -4 : -10;
    const stressDelta = champion ? -5 : 8;
    return { ...profile, tournamentArchive: [...profile.tournamentArchive, record], career: { ...profile.career, totalKills: profile.career.totalKills + performance.kills, mapsPlayed: profile.career.mapsPlayed + performance.maps, clutchWon: profile.career.clutchWon + (performance.clutchesWon ?? 0), careerEarnings: profile.career.careerEarnings + (result.prizeMoney ?? 0), rating2: performance.rating }, trophies: { ...profile.trophies, majorChampionships: profile.trophies.majorChampionships + major, otherSTierTitles: profile.trophies.otherSTierTitles + stier, mvpAwards: profile.trophies.mvpAwards + (mvp ? 1 : 0) }, morale: this.clamp(profile.morale + moraleDelta, 0, 100), energy: this.clamp(profile.energy + energyDelta, 0, 100), life: { ...profile.life, stress: this.clamp(profile.life.stress + stressDelta, 0, 100) } };
  }

  private storyFacts(state: CareerSaveEnvelope['state']): StoryContextFacts {
    const activeContract = state.player.currentContractId
      ? state.contracts.find((contract) => contract.id === state.player.currentContractId && contract.status === 'ACTIVE') ?? null
      : null;
    const currentTeamRank = state.player.currentTeamId
      ? state.activeVrsSnapshot?.entries.find((entry) => entry.teamId === state.player.currentTeamId)?.snapshotRank ?? null
      : null;
    const ratings = state.player.tournamentArchive.slice().reverse().map((record) => record.rating);
    let lowRatingStreak = 0;
    for (const rating of ratings) {
      if (rating >= 1) break;
      lowRatingStreak += 1;
    }
    return {
      activeContract,
      currentTeamRank,
      transferWindowOpen: state.seasonPhase === 'OFFSEASON' || state.seasonPhase === 'REPORT',
      lowRatingStreak,
      advancedMapsPlayed: state.player.tournamentArchive
        .filter((record) => record.level === 'T1' || record.level === 'MAJOR')
        .reduce((sum, record) => sum + record.mapsPlayed, 0),
    };
  }

  private contractEndDate(startedAt: string): string {
    const endsAt = new Date(Date.parse(startedAt));
    endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 2);
    return endsAt.toISOString();
  }
  private clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
  private teamStrength(profile: PlayerProfile): number { const a = profile.attributes; return (a.aim + a.gameSense + a.leadership + a.clutch + a.consistency - a.teamConflict + profile.morale + profile.energy) / 7; }
  private copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
  private async requireOriginRule(region: PlayerProfile['originRegion']): Promise<RegionOriginRule> { const rule = await this.runtime.progressionRules?.findOriginRule(region); if (!rule) throw new CareerGameConfigurationError(`RegionOriginRule for ${region}`); return rule; }
  private async requireSave(): Promise<CareerSaveEnvelope> { const value = await this.dependencies.stateRepository.load(this.dependencies.playerId); if (!value) throw new Error(`No career save exists for player ${this.dependencies.playerId}.`); return value; }
  private async saveEnvelope(envelope: CareerSaveEnvelope): Promise<void> { await this.dependencies.stateRepository.save(this.dependencies.playerId, envelope); }
  private assertActive(player: PlayerProfile): void { if (player.isRetired) throw new Error('This career is retired and can no longer advance.'); }
  private assertRoll(roll: number): void { if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError('randomRoll must be a finite number in [0, 1).'); }
  private nextRoll(): number {
    const roll = this.runtime.random?.next();
    if (roll === undefined) throw new CareerGameConfigurationError('RandomSource');
    this.assertRoll(roll);
    return roll;
  }
  private clock(): GameClock { if (!this.runtime.clock) throw new CareerGameConfigurationError('GameClock'); return this.runtime.clock; }
  private advanceDate(currentDate: string, period: EventPeriod): string { const timestamp = Date.parse(currentDate); if (Number.isNaN(timestamp)) throw new Error(`Invalid state currentDate: ${currentDate}.`); const date = new Date(timestamp); date.setUTCDate(date.getUTCDate() + (period === 'NORMAL' ? 7 : 14)); return date.toISOString(); }
  private nextSeason(currentDate: string, nextDate: string, season: number): number { return season + (new Date(Date.parse(nextDate)).getUTCFullYear() > new Date(Date.parse(currentDate)).getUTCFullYear() ? 1 : 0); }
}
