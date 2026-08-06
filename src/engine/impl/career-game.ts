import type { DailyActionService } from '../daily-action';
import type { NpcGenerationProfile, NpcGenerationService } from '../npc';
import type { TransferMarketService } from '../transfer-market';
import type { CareerEventWindow, EventPeriod, StoryContextFacts, StoryDecision, StoryDecisionResult, StoryEngine, StoryEvent, StoryEventPhase } from '../graph';
import type { CareerGame, CareerGameDependencies, CareerTournamentAdvanceMode } from '../game';
import type { PlayerProfile } from '../profile';
import type { AgeProgressionResult, PlayerProgressionRuleRepository, RegionOriginRule } from '../progression';
import type { CareerTournamentRecord, RetirementSummary } from '../retirement';
import type { CareerSaveEnvelope } from '../save-state';
import type { GameClock, RandomSource } from '../runtime';
import type { TournamentAdvanceResult, TournamentEdition, TournamentResult, TournamentService, TournamentSimulationContext, TournamentStandInAssignment, TournamentStandInOffer } from '../../hltv/tournament';
import type { VrsInviteSnapshot } from '../../hltv/team';
import type { TransferOffer, TransferTargetService, TransferTargetView } from '../../hltv/transfer-targets';
import type { TeamTier } from '../../hltv/team';
import type { PlayerContractService, ContractTerms, PlayerContract } from '../contract';
import { SaveContractService } from './contract-service';
import { ConditionEvaluatorImpl } from './condition-evaluator';

export class CareerGameConfigurationError extends Error {
  public constructor(dependency: string) { super(`CareerGame is missing required runtime dependency: ${dependency}.`); this.name = 'CareerGameConfigurationError'; }
}

export interface VrsResultProjectionPort {
  readonly rulesVersion: string;
  apply(state: { readonly pointsByTeam: Readonly<Record<string, number>>; readonly appliedResultIds: readonly string[] }, result: TournamentResult): { readonly pointsByTeam: Readonly<Record<string, number>>; readonly appliedResultIds: readonly string[] };
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
  readonly npcGeneration?: NpcGenerationService;
  readonly npcGenerationProfiles?: readonly NpcGenerationProfile[];
  readonly transferMarket?: TransferMarketService;
  readonly transferMarketTeamIds?: readonly string[];
  readonly vrsResultProjector?: VrsResultProjectionPort;
  readonly narrative?: {
    readonly maxEventsPerSeason: number;
    readonly minimumTournamentGap: number;
  };
}

export class CareerGameImpl implements CareerGame {
  public constructor(private readonly dependencies: CareerGameDependencies, private readonly runtime: CareerGameRuntimeServices = {}) {}

  public async getProfile(): Promise<PlayerProfile> { return (await this.requireSave()).state.player; }
  public async getTournamentSummary(): Promise<{ readonly official: PlayerProfile['tournamentArchive']; readonly qualifiers: readonly TournamentResult[] }> {
    const state = (await this.requireSave()).state;
    return this.copy({ official: state.player.tournamentArchive, qualifiers: state.qualificationResults ?? [] });
  }

  public async startSeason(): Promise<readonly TournamentEdition[]> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const state = await this.ensureSchedule(envelope.state);
    if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state: { ...state, seasonPhase: 'ACTIVE', tournamentCursor: 0, tournamentPhase: state.tournamentPhase ?? 'PRE', activeTournamentId: state.activeTournamentId ?? null, tournamentMatchCursor: state.tournamentMatchCursor ?? 0 } });
    return state.scheduledTournaments.map((edition) => this.copy(edition));
  }

  public async selectTransferTarget(teamId: string): Promise<TransferOffer> {
    const envelope = await this.requireSave();
    if (envelope.state.seasonPhase !== 'REPORT' && envelope.state.seasonPhase !== 'OFFSEASON') throw new Error('Transfer targets are only selectable during REPORT or OFFSEASON.');
    const targets = await this.listTransferTargets();
    const target = targets.find((candidate) => candidate.teamId === teamId && candidate.eligible);
    if (!target) throw new Error(`Transfer target is not eligible: ${teamId}.`);
    const now = envelope.state.currentDate;
    const expires = new Date(Date.parse(now));
    expires.setUTCDate(expires.getUTCDate() + 14);
    const offer: TransferOffer = { offerId: `offer-${envelope.state.player.id}-${teamId}-${Date.parse(now)}`, teamId: target.teamId, teamName: target.teamName, tier: target.tier, salaryPerMonth: target.contract.salaryPerMonth, buyoutAmount: target.contract.buyoutAmount, roleOffer: target.contract.role === 'SUBSTITUTE' ? 'SUBSTITUTE' : target.offerType === 'SHORT_TERM' ? 'SHORT_TERM' : 'STARTER', contract: this.copy(target.contract), source: 'CONFIGURED_TARGET', createdAt: now, expiresAt: expires.toISOString() };
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, pendingTransferOffer: offer } });
    return this.copy(offer);
  }

  public async listTransferTargets(): Promise<readonly TransferTargetView[]> {
    const result = await this.listTransferTargetsInternal();
    await this.save();
    return result;
  }

  private async listTransferTargetsInternal(): Promise<readonly TransferTargetView[]> {
    const service = this.runtime.transferTargets;
    if (!service) return [];
    const envelope = await this.requireSave();
    if (envelope.state.seasonPhase !== 'REPORT' && envelope.state.seasonPhase !== 'OFFSEASON') return [];
    this.assertActive(envelope.state.player);
    const snapshot = envelope.state.activeVrsSnapshot;
    const ranks = Object.fromEntries((snapshot?.entries ?? []).map((entry) => [entry.teamId, entry.snapshotRank])) as Readonly<Record<string, number>>;
    const invitationWindow = envelope.state.seasonPhase === 'REPORT' ? 'TRANSFER_WINDOW' : envelope.state.seasonPhase === 'OFFSEASON' ? 'OFFSEASON' : 'NORMAL';
    return service.list({ player: envelope.state.player, snapshotRanks: ranks, ...(envelope.state.player.currentTeamTier ? { currentTeamTier: envelope.state.player.currentTeamTier } : {}), marketKey: `${envelope.state.season}-h${envelope.state.careerHalf}-${invitationWindow}`, randomRoll: this.nextRoll(), invitationWindow });
  }

  public async listStandInOffers(): Promise<readonly TournamentStandInOffer[]> {
    const envelope = await this.requireSave();
    if (envelope.state.player.freeAgencyStatus !== 'FREE_AGENT' || envelope.state.player.currentTeamId || envelope.state.player.currentContractId) return [];
    if (envelope.state.standInAssignment) return [];
    if (envelope.state.scheduledTournaments.length > 0 && (envelope.state.tournamentCursor ?? 0) < envelope.state.scheduledTournaments.length) return [];
    const half = (envelope.state.careerHalf === 2 ? 2 : 1) as 1 | 2;
    const ledger = envelope.state.standInLedger ?? [];
    const currentLedger = ledger.filter((entry) => entry.season === envelope.state.season && entry.half === half);
    if (currentLedger.length >= 3) return [];
    if (envelope.state.pendingStandInOffer) {
      const expiresAt = Date.parse(envelope.state.pendingStandInOffer.expiresAt);
      const currentDate = Date.parse(envelope.state.currentDate);
      if (Number.isFinite(expiresAt) && Number.isFinite(currentDate) && expiresAt > currentDate) return [this.copy(envelope.state.pendingStandInOffer)];
      const expiredLedger = ledger.map((entry) => entry.offerId === envelope.state.pendingStandInOffer?.offerId && entry.status === 'ISSUED' ? { ...entry, status: 'EXPIRED' as const, occurredAt: envelope.state.currentDate } : entry);
      await this.saveEnvelope({ ...envelope, state: { ...envelope.state, pendingStandInOffer: null, standInLedger: expiredLedger } });
    }
    const tournaments = this.runtime.tournaments;
    const getSnapshot = this.runtime.vrsSnapshot;
    if (!tournaments || !getSnapshot) return [];
    const snapshot = envelope.state.activeVrsSnapshot ?? await getSnapshot({ season: envelope.state.season, half: envelope.state.careerHalf as 1 | 2 });
    const ranks = Object.fromEntries(snapshot.entries.map((entry) => [entry.teamId, entry.snapshotRank]));
    const eligibleTargets = this.runtime.transferTargets ? await this.runtime.transferTargets.list({ player: envelope.state.player, snapshotRanks: ranks, marketKey: `${envelope.state.season}-h${half}-standin-${currentLedger.length}`, invitationWindow: 'NORMAL', maxResults: Number.MAX_SAFE_INTEGER }) : [];
    const strength = this.teamStrength(envelope.state.player);
    const desiredTier: TeamTier = strength >= 72 ? 'T1' : strength >= 58 ? 'T2' : 'T3';
    const configured = eligibleTargets.filter((target) => target.eligible && target.tier === desiredTier).sort((left, right) => left.maximumRank - right.maximumRank)[0];
    const host = (configured ? snapshot.entries.find((entry) => entry.teamId === configured.teamId) : undefined)
      ?? [...snapshot.entries].filter((entry) => (entry.snapshotRank <= 12 ? 'T1' : entry.snapshotRank <= 32 ? 'T2' : 'T3') === desiredTier).sort((left, right) => left.snapshotRank - right.snapshotRank)[0];
    if (!host) return [];
    const calendar = await tournaments.createCalendar({ season: envelope.state.season, half: envelope.state.careerHalf as 1 | 2, teamId: host.teamId, snapshot });
    const edition = calendar[0];
    if (!edition) return [];
    const expires = new Date(Date.parse(envelope.state.currentDate)); expires.setUTCDate(expires.getUTCDate() + 14);
    const standInEdition = { ...edition, id: `standin-${edition.id}` };
    const sequence = currentLedger.length + 1;
    const offer: TournamentStandInOffer = { offerId: `standin-${envelope.state.season}-h${half}-${sequence}-${edition.id}-${envelope.state.player.id}`, edition: standInEdition, teamId: host.teamId, teamName: configured?.teamName ?? host.teamId, tier: desiredTier, reason: configured?.reason ?? `${desiredTier} 队伍需要临时同角色替补。`, appearanceFee: 1_000, perMapBonus: 250, prizeSharePercentage: 5, status: 'PENDING', createdAt: envelope.state.currentDate, targetRole: envelope.state.player.role, expectedPlaytimePercentage: configured?.expectedPlaytimePercentage ?? 100, risk: configured?.risk ?? 'MEDIUM', expiresAt: expires.toISOString() };
    const issued = { offerId: offer.offerId, season: envelope.state.season, half, status: 'ISSUED' as const, teamId: offer.teamId, occurredAt: envelope.state.currentDate };
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, activeVrsSnapshot: snapshot, pendingStandInOffer: offer, standInLedger: [...ledger, issued] } });
    return [this.copy(offer)];
  }

  public async respondStandInOffer(offerId: string, response: 'ACCEPT' | 'REJECT' | 'WAIT'): Promise<TournamentStandInAssignment | TournamentStandInOffer | null> {
    const envelope = await this.requireSave();
    const offer = envelope.state.pendingStandInOffer;
    if (!offer || offer.offerId !== offerId) throw new Error(`Stand-in offer is not available: ${offerId}.`);
    if (response === 'WAIT') return this.copy(offer);
    if (response === 'REJECT') {
      const standInLedger = (envelope.state.standInLedger ?? []).map((entry) => entry.offerId === offerId ? { ...entry, status: 'REJECTED' as const, occurredAt: envelope.state.currentDate } : entry);
      await this.saveEnvelope({ ...envelope, state: { ...envelope.state, pendingStandInOffer: null, standInLedger } });
      return null;
    }
    return this.acceptPendingStandInOffer(envelope, offerId);
  }

  public async acceptStandInOffer(offerId: string): Promise<TournamentStandInAssignment> {
    const result = await this.respondStandInOffer(offerId, 'ACCEPT');
    if (!result || !('editionId' in result)) throw new Error(`Stand-in offer is not available: ${offerId}.`);
    return result;
  }

  private async acceptPendingStandInOffer(envelope: CareerSaveEnvelope, offerId: string): Promise<TournamentStandInAssignment> {
    const offer = envelope.state.pendingStandInOffer;
    const expiresAt = offer ? Date.parse(offer.expiresAt) : Number.NaN;
    const currentDate = Date.parse(envelope.state.currentDate);
    if (!offer || offer.offerId !== offerId || !Number.isFinite(expiresAt) || !Number.isFinite(currentDate) || expiresAt <= currentDate) throw new Error(`Stand-in offer is not available: ${offerId}.`);
    if (envelope.state.player.freeAgencyStatus !== 'FREE_AGENT' || envelope.state.player.currentTeamId || envelope.state.player.currentContractId) throw new Error('Stand-in assignment requires an active free-agent state.');
    if (envelope.state.scheduledTournaments.length > 0 && (envelope.state.tournamentCursor ?? 0) < envelope.state.scheduledTournaments.length) throw new Error('Stand-in assignment cannot replace an active tournament schedule.');
    const assignment: TournamentStandInAssignment = { offerId, editionId: offer.edition.id, teamId: offer.teamId, playerId: envelope.state.player.id, appearanceFee: offer.appearanceFee, perMapBonus: offer.perMapBonus, prizeSharePercentage: offer.prizeSharePercentage, targetRole: offer.targetRole };
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, standInAssignment: assignment, pendingStandInOffer: null, scheduledTournaments: [offer.edition], unsettledTournamentIds: [offer.edition.id], tournamentCursor: 0, seasonPhase: 'ACTIVE' } });
    return this.copy(assignment);
  }

  public async getVrsStatus(): Promise<{ readonly rank: number | null; readonly points: number | null; readonly source: import('../../hltv/team').RankingSource | null }> {
    const envelope = await this.requireSave();
    const state = await this.ensureSchedule(envelope.state);
    if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state });
    const teamId = state.player.currentTeamId;
    const entry = teamId ? state.activeVrsSnapshot?.entries.find((candidate) => candidate.teamId === teamId) : undefined;
    return { rank: entry?.snapshotRank ?? null, points: entry?.points ?? null, source: entry?.source ?? null };
  }

  public async getNextTournament(): Promise<TournamentEdition | null> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    if (!envelope.state.player.currentTeamId && !envelope.state.standInAssignment) return null;
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
    const currentEditionIds = new Set(state.scheduledTournaments.map((edition) => edition.id));
    const results = (state.tournamentResults ?? []).filter((result) => currentEditionIds.has(result.editionId));
    const qualifierIds = new Set(state.scheduledTournaments.map((edition) => `${edition.id}-qualifier`));
    const qualificationResults = (state.qualificationResults ?? []).filter((result) => qualifierIds.has(result.editionId));
    const statisticalResults = [...results, ...qualificationResults];
    if ((state.tournamentCursor ?? 0) < state.scheduledTournaments.length) return null;
    const totalPrizeMoney = results.reduce((sum, result) => sum + (result.playerPrizeIncome ?? 0), 0);
    const mapsPlayed = statisticalResults.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.maps ?? 0), 0);
    const kills = statisticalResults.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.kills ?? 0), 0);
    const clutchWon = statisticalResults.reduce((sum, result) => sum + (result.playerPerformances.find((item) => item.playerId === state.player.id)?.clutchesWon ?? 0), 0);
    const stateDate = new Date(Date.parse(state.currentDate));
    const stateYear = state.season;
    const half = state.careerHalf === 2 ? 2 as const : 1 as const;
    const periodEnd = new Date(Date.UTC(stateYear, half === 1 ? 6 : 12, 1));
    const periodStart = new Date(Date.UTC(stateYear, half === 1 ? 0 : 6, 1));
    const salaryIncome = state.contracts.reduce((total, contract) => {
      const rawStart = new Date(Date.parse(contract.startedAt));
      const rawEnd = new Date(Date.parse(contract.termination?.terminatedAt ?? contract.endsAt));
      const contractStart = rawStart;
      const contractEnd = rawEnd;
      const effectiveStart = contractStart > periodStart ? contractStart : periodStart;
      const effectiveEnd = contractEnd < periodEnd ? contractEnd : periodEnd;
      if (effectiveEnd <= effectiveStart) return total;
      const overlapDays = Math.max(0, (effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000);
      const monthFraction = overlapDays / 30;
      return total + contract.salaryPerMonth * Math.max(0, Math.min(6, monthFraction));
    }, 0);
    const roundedSalaryIncome = Math.max(0, Math.round(salaryIncome));
    const expenses = 0;
    if (half === 2) {
      for (const result of results) {
        await this.dependencies.hltv.settleTournament({ type: 'TOURNAMENT_COMPLETED', occurredAt: state.currentDate, result });
      }
    }
    const ranking = half === 2 ? await this.dependencies.hltv.findTop20(state.season) : null;
    const rankedPlayer = ranking ? await this.dependencies.hltv.synchronizeCareerHonors(state.player, ranking) : state.player;
    const activeContract = rankedPlayer.currentContractId ? state.contracts.find((contract) => contract.id === rankedPlayer.currentContractId && contract.status === 'ACTIVE') : undefined;
    const nextYearStart = new Date(Date.UTC(state.season + 1, 0, 1)).getTime();
    const contractExpiryWarning = half === 2 && activeContract && Date.parse(activeContract.endsAt) <= nextYearStart
      ? { contractId: activeContract.id, teamId: activeContract.teamId, endsAt: activeContract.endsAt }
      : null;
    const settlement = { season: state.season, half, tournamentIds: results.map((result) => result.editionId), totalPrizeMoney, salaryIncome: roundedSalaryIncome, expenses, currency: 'USD' as const, netBalanceDelta: totalPrizeMoney + roundedSalaryIncome - expenses, mapsPlayed, kills, clutchWon, progression: state.latestAgeProgression?.currentAge === state.player.age ? state.latestAgeProgression : null, contractExpiryWarning, top20Published: half === 2, top20Ranking: ranking };
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
    const systemQueue = envelope.state.pendingSystemEvents ?? [];
    const events = await story.findAvailableEvents({ profile: envelope.state.player, period, phase, randomRoll: this.nextRoll(), facts: this.storyFacts(envelope.state) });
    const preferredEventId = envelope.state.currentStoryEventId;
    const repeatableHistory = envelope.state.repeatableEventHistory ?? [];
    const eligibleEvents = events.filter((candidate) => candidate.repeatable ? !repeatableHistory.some((entry) => entry.eventId === candidate.id && entry.season === envelope.state.season) : true);
    const forced = systemQueue.find((queued) => queued.period === period && eligibleEvents.some((candidate) => candidate.id === queued.eventId));
    const transactional = envelope.state.pendingTransferOffer
      ? eligibleEvents.filter((candidate) => candidate.system === true && candidate.consumesTransferOffer === true)
      : [];
    const quotaExempt = Boolean(forced) || transactional.length > 0;
    const narrative = this.runtime.narrative ?? { maxEventsPerSeason: 2, minimumTournamentGap: 1 };
    const eventCount = envelope.state.seasonNarrativeEventCount ?? envelope.state.storyEventsThisHalf ?? 0;
    const tournamentCursor = envelope.state.tournamentCursor ?? 0;
    const lastNarrativeCursor = envelope.state.lastNarrativeTournamentCursor;
    const gapBlocked = lastNarrativeCursor !== undefined && tournamentCursor - lastNarrativeCursor <= narrative.minimumTournamentGap;
    if (!quotaExempt && (eventCount >= narrative.maxEventsPerSeason || gapBlocked)) return null;
    const event = (forced ? eligibleEvents.find((candidate) => candidate.id === forced.eventId) : undefined)
      ?? this.pickWeightedEvent(this.highestPriorityEvents(transactional), this.nextRoll())
      ?? (preferredEventId ? eligibleEvents.find((candidate) => candidate.id === preferredEventId) : undefined)
      ?? this.pickWeightedEvent(this.highestPriorityEvents(eligibleEvents), this.nextRoll())
      ?? null;
    if (!event) return null;
    const resume: import('../save-state').CareerEventResume = window === 'SEASON_START' ? 'START_SEASON' : window === 'REPORT' ? 'CONTINUE_REPORT' : window === 'OFFSEASON' ? 'CONTINUE_OFFSEASON' : window === 'TRANSFER_WINDOW' ? 'CONTINUE_TRANSFER_WINDOW' : 'CONTINUE_SEASON';
    const state = { ...envelope.state, seasonNarrativeEventCount: quotaExempt ? (envelope.state.seasonNarrativeEventCount ?? 0) : eventCount + 1, ...(!quotaExempt ? { lastNarrativeTournamentCursor: tournamentCursor } : {}), pendingSystemEvents: forced ? systemQueue.filter((queued) => queued.triggerId !== forced.triggerId) : systemQueue, seasonPhase: 'EVENT' as const, eventResume: { mode: resume, eventId: event.id, tournamentId: envelope.state.activeTournamentId ?? envelope.state.scheduledTournaments[envelope.state.tournamentCursor ?? 0]?.id ?? null } };
    await this.saveEnvelope({ ...envelope, state });
    return this.copy(event);
  }

  public async advanceTournament(input: { readonly mode?: CareerTournamentAdvanceMode } = {}): Promise<TournamentAdvanceResult> {
    if (input.mode === 'UNTIL_DECISION_OR_COMPLETE') {
      let progress = await this.advanceTournament({ mode: 'NEXT_NODE' });
      let previousRevision = progress.state?.revision ?? -1;
      for (let steps = 0; steps < 32 && progress.status === 'ONGOING' && progress.uiData.eventRequired !== true && progress.uiData.qualifier !== true && progress.result === null; steps += 1) {
        const next = await this.advanceTournament({ mode: 'NEXT_NODE' });
        const revision = next.state?.revision ?? -1;
        if (next.status === 'ONGOING' && next.result === null && revision === previousRevision) throw new Error('Tournament fast-forward made no progress.');
        progress = next;
        previousRevision = revision;
      }
      if (progress.status === 'ONGOING' && progress.uiData.eventRequired !== true && progress.uiData.qualifier !== true && progress.result === null) throw new Error('Tournament fast-forward exceeded the 32-step safety limit.');
      return progress;
    }
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const state = await this.ensureSchedule(envelope.state);
    const cursor = state.tournamentCursor ?? 0;
    const edition = state.scheduledTournaments[cursor];
    if (!edition) {
      if (state !== envelope.state) await this.saveEnvelope({ ...envelope, state });
      return { status: 'COMPLETED', state: null, lifecycleHook: null, uiData: { noTournament: true }, result: null };
    }
    const service = this.runtime.tournaments;
    if (!service) throw new CareerGameConfigurationError('TournamentService');
    const activeState = state.activeTournamentId === edition.id && state.tournamentPhase === 'IN'
      ? state
      : { ...state, activeTournamentId: edition.id, tournamentPhase: 'IN' as const, tournamentMatchCursor: state.tournamentMatchCursor ?? 0 };
    if (activeState !== state) await this.saveEnvelope({ ...envelope, state: activeState });
    if (edition.qualificationSource === 'PUBLIC_QUALIFIER' && edition.qualificationStatus !== 'QUALIFIED') {
      const qualifierEdition: TournamentEdition = { ...edition, id: `${edition.id}-qualifier`, name: `${edition.name} 预选赛`, tier: 'QUALIFIER', honorClass: 'NONE', node: 'QUALIFIER', simulationMode: 'SWISS', qualificationStatus: 'QUALIFIER_PENDING', prizePool: 0, format: 'BO3' };
      const qualifierProgress = await this.advanceTournamentState(service, qualifierEdition, activeState, this.nextRoll());
      if (qualifierProgress.status === 'ONGOING' && qualifierProgress.state) {
        await this.saveEnvelope({ ...envelope, state: { ...activeState, activeTournamentState: qualifierProgress.state, tournamentPhase: 'IN', tournamentMatchCursor: (activeState.tournamentMatchCursor ?? 0) + 1 } });
        return { ...qualifierProgress, uiData: { ...qualifierProgress.uiData, qualifier: true, qualified: null, countedInCareer: false, countedInTop20: false } };
      }
      const qualifierResult = qualifierProgress.result;
      if (!qualifierResult) throw new Error('Qualifier simulation completed without a result.');
      const qualified = qualifierProgress.uiData?.qualified === true;
      const placement = qualified ? 'QUALIFIED' as const : 'QUALIFIER_EXIT' as const;
      const normalizedQualifierResult: TournamentResult = { ...qualifierResult, placement, title: false, teamPlacements: qualifierResult.teamPlacements.map((entry) => entry.teamId === edition.teamId ? { ...entry, placement, title: false } : entry), honors: [], prizeMoney: 0, teamPrizeMoney: 0, playerPrizeIncome: 0 };
      const updatedEdition = { ...edition, qualificationStatus: qualified ? 'QUALIFIED' as const : 'QUALIFIER_EXIT' as const };
      const scheduledTournaments = state.scheduledTournaments.map((candidate, index) => index === cursor ? updatedEdition : candidate);
      const qualifierPerformance = normalizedQualifierResult.playerPerformances.find((item) => item.playerId === activeState.player.id) ?? null;
      const qualifierPlayer = qualifierPerformance
        ? this.accumulateCareerPerformance(activeState.player, qualifierPerformance)
        : activeState.player;
      const projectedVrs = this.projectVrsResult(activeState, normalizedQualifierResult);
      const commonState = { ...activeState, ...projectedVrs, player: qualifierPlayer, scheduledTournaments, qualificationResults: [...(activeState.qualificationResults ?? []), normalizedQualifierResult], activeTournamentState: null, tournamentPhase: qualified ? 'PRE' as const : 'POST' as const, tournamentMatchCursor: 0 };
      if (qualified) {
        await this.saveEnvelope({ ...envelope, state: commonState });
        return { status: 'ONGOING', state: null, lifecycleHook: 'POST_TOURNAMENT', uiData: { mode: 'FAST', qualifier: true, qualified: true, qualifierResult: normalizedQualifierResult, qualifierPerformance, countedInCareer: true, countedInTop20: false, mainEventNext: true }, result: null };
      }
      await this.saveEnvelope({ ...envelope, state: { ...commonState, tournamentCursor: cursor + 1, activeTournamentId: edition.id, unsettledTournamentIds: activeState.unsettledTournamentIds.filter((id) => id !== edition.id) } });
      return { status: 'QUALIFIER_EXIT', state: null, lifecycleHook: 'POST_TOURNAMENT', uiData: { mode: 'FAST', qualifier: true, qualified: false, qualifierResult: normalizedQualifierResult, qualifierPerformance, countedInCareer: true, countedInTop20: false }, result: null };
    }
    const progress = await this.advanceTournamentState(service, edition, activeState, this.nextRoll());
    if (progress.status === 'ONGOING' && progress.state) {
      await this.saveEnvelope({ ...envelope, state: { ...activeState, activeTournamentState: progress.state, tournamentPhase: 'IN', tournamentMatchCursor: (activeState.tournamentMatchCursor ?? 0) + 1 } });
      if (progress.lifecycleHook === 'IN_TOURNAMENT') {
        const inTournamentEvent = await this.findCareerEvent('SEASON_END');
        if (inTournamentEvent) return { ...progress, uiData: { ...progress.uiData, eventRequired: true } };
      }
      return progress;
    }
    const rawResult = progress.result;
    if (!rawResult) return progress;
    const performance = rawResult.playerPerformances.find((item) => item.playerId === activeState.player.id);
    const teamPrizeMoney = rawResult.teamPrizeMoney ?? rawResult.prizeMoney ?? 0;
    const assignment = activeState.standInAssignment?.editionId === edition.id ? activeState.standInAssignment : null;
    const playerPrizeIncome = Math.max(0, Math.round(assignment
      ? (assignment.appearanceFee ?? 0) + (assignment.perMapBonus ?? 0) * (performance?.maps ?? 0) + teamPrizeMoney * (assignment.prizeSharePercentage ?? 0) / 100
      : performance ? teamPrizeMoney / 5 : 0));
    const result: TournamentResult = { ...rawResult, prizeMoney: teamPrizeMoney, teamPrizeMoney, playerPrizeIncome };
    const fact = await service.settle({ edition, result });
    await this.dependencies.hltv.settleTournament(fact);
    const player = this.archiveResult(activeState.player, result);
    const pendingSystemEvents = await this.tournamentTriggeredEvents(player, result, activeState.pendingSystemEvents ?? []);
    const standInCompleted = activeState.standInAssignment?.editionId === edition.id;
    const completedLedger = (activeState.standInLedger ?? []).map((entry) => standInCompleted && entry.offerId === activeState.standInAssignment?.offerId ? { ...entry, status: 'COMPLETED' as const, occurredAt: activeState.currentDate } : entry);
    const projectedVrs = this.projectVrsResult(activeState, result);
    await this.saveEnvelope({ ...envelope, state: { ...activeState, ...projectedVrs, player, pendingSystemEvents, activeTournamentState: null, tournamentResults: [...(activeState.tournamentResults ?? []), result], tournamentCursor: cursor + 1, tournamentPhase: 'POST', tournamentMatchCursor: 0, activeTournamentId: edition.id, unsettledTournamentIds: activeState.unsettledTournamentIds.filter((id) => id !== edition.id), standInLedger: completedLedger, ...(standInCompleted ? { standInAssignment: null, pendingStandInOffer: null, scheduledTournaments: [], unsettledTournamentIds: [], tournamentCursor: 0 } : {}) } });
    return { ...progress, result };
  }

  public async advancePeriod(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<PlayerProfile> {
    this.assertRoll(input.randomRoll);
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const calendarTransition = input.period === 'OFFSEASON' && (envelope.state.seasonPhase === 'REPORT' || envelope.state.seasonPhase === 'OFFSEASON');
    const nextSeason = calendarTransition && envelope.state.careerHalf === 2 ? envelope.state.season + 1 : envelope.state.season;
    const nextHalf = calendarTransition ? (envelope.state.careerHalf === 1 ? 2 : 1) : (new Date(Date.parse(envelope.state.currentDate)).getUTCMonth() < 6 ? 1 : 2);
    const nextDate = calendarTransition
      ? new Date(Date.UTC(nextSeason, nextHalf === 1 ? 0 : 6, 1)).toISOString()
      : this.advanceDate(envelope.state.currentDate, input.period);
    const ageProgression = calendarTransition && envelope.state.careerHalf === 2
      ? await this.dependencies.progression.advanceAge({ profile: envelope.state.player, originRule: await this.requireOriginRule(envelope.state.player.originRegion) })
      : null;
    let player = ageProgression?.profile ?? envelope.state.player;
    let contracts = [...envelope.state.contracts];
    let expiredContract: PlayerContract | null = null;
    const currentContract = player.currentContractId ? contracts.find((contract) => contract.id === player.currentContractId && contract.status === 'ACTIVE') : undefined;
    if (currentContract && Date.parse(currentContract.endsAt) <= Date.parse(nextDate)) {
      const contractService = this.runtime.contractService ?? new SaveContractService(contracts, new ConditionEvaluatorImpl(), (candidate) => ({ player: candidate, currentTeamId: candidate.currentTeamId, opponentTeamId: null, randomRoll: input.randomRoll, difficultyMode: candidate.difficultyMode }), this.runtime.teamTier ?? (() => undefined));
      const expiration = await contractService.expire({ profile: player, contractId: currentContract.id, occurredAt: nextDate });
      if ('contract' in expiration && !('reason' in expiration)) {
        player = expiration.profile;
        contracts = [...contractService.snapshot];
        expiredContract = expiration.contract;
      }
    }
    if (!player.isRetired && player.age >= 40) {
      player = await this.dependencies.retirement.retire({ player, reason: '达到职业生涯自然退役年龄', retiredAt: nextDate });
      contracts = contracts.map((contract) => contract.playerId === player.id && contract.status === 'ACTIVE' ? { ...contract, status: 'TERMINATED' as const, termination: { reason: 'MUTUAL_AGREEMENT' as const, terminatedAt: nextDate, matchedConditions: [], note: '选手自然退役，合同同步终止。' } } : contract);
    }
    const npcGeneration = this.runtime.npcGeneration;
    const npcProgression = calendarTransition && envelope.state.careerHalf === 2 && npcGeneration
      ? await npcGeneration.advanceSeason({ season: nextSeason, players: envelope.state.npcPlayers })
      : null;
    let worldNpcPlayers = npcProgression?.progressed ?? envelope.state.npcPlayers;
    if (calendarTransition && envelope.state.careerHalf === 2 && npcGeneration) {
      const activePopulation = worldNpcPlayers.filter((npc) => npc.availability !== 'RETIRED').length;
      const targetPopulation = Math.max(24, envelope.state.npcPlayers.filter((npc) => npc.availability !== 'RETIRED').length);
      if (activePopulation < targetPopulation) {
        const generated = await npcGeneration.generateSeason({ season: nextSeason, targetPopulation: targetPopulation - activePopulation, profiles: this.runtime.npcGenerationProfiles ?? [] });
        const known = new Set(worldNpcPlayers.map((npc) => npc.id));
        worldNpcPlayers = [...worldNpcPlayers, ...generated.generated.filter((npc) => !known.has(npc.id))];
      }
    }
    const transferMarket = this.runtime.transferMarket;
    if (calendarTransition && envelope.state.careerHalf === 2 && transferMarket) {
      const configuredTeams = this.runtime.transferMarketTeamIds ?? [];
      const dynamicTeams = worldNpcPlayers.map((npc) => npc.currentTeamId).filter((teamId): teamId is string => teamId !== null);
      for (const teamId of [...new Set([...configuredTeams, ...dynamicTeams])]) {
        const market = await transferMarket.runManagerWindow({ teamId, at: nextDate, maxMoves: 1, npcPlayers: worldNpcPlayers });
        worldNpcPlayers = market.npcPlayers ?? worldNpcPlayers;
      }
    }
    const state = calendarTransition
      ? { ...envelope.state, currentDate: nextDate, careerHalf: nextHalf, season: nextSeason, player, contracts, npcPlayers: worldNpcPlayers, ...(nextSeason !== envelope.state.season ? { seasonNarrativeEventCount: 0, lastNarrativeTournamentCursor: undefined } : {}), seasonPhase: 'ACTIVE' as const, tournamentCursor: 0, tournamentResults: envelope.state.tournamentResults ?? [], qualificationResults: envelope.state.qualificationResults ?? [], scheduledTournaments: [], unsettledTournamentIds: [], activeVrsSnapshot: null, activeTournamentState: null, halfSeasonSettlement: null, latestAgeProgression: ageProgression, eventResume: null }
      : { ...envelope.state, currentDate: nextDate, careerHalf: nextHalf, season: nextSeason, player, contracts };
    const agedPendingEvents = player.age !== envelope.state.player.age
      ? await this.enqueueTriggerFacts(player, [{ type: 'AGE_MILESTONE', playerId: player.id, age: player.age }], state.pendingSystemEvents ?? [])
      : state.pendingSystemEvents ?? [];
    const pendingSystemEvents = expiredContract
      ? await this.enqueueTriggerFacts(player, [{ type: 'CONTRACT_EXPIRED', playerId: player.id, contract: expiredContract }], agedPendingEvents)
      : agedPendingEvents;
    await this.saveEnvelope({ ...envelope, state: { ...state, player, contracts, pendingSystemEvents, ...(player.isRetired ? { currentStoryEventId: null } : {}) } });
    return player;
  }

  public async advanceAge(years?: number): Promise<AgeProgressionResult> {
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const rule = await this.requireOriginRule(envelope.state.player.originRegion);
    const result = await this.dependencies.progression.advanceAge(years === undefined
      ? { profile: envelope.state.player, originRule: rule }
      : { profile: envelope.state.player, originRule: rule, years });
    const pendingSystemEvents = await this.enqueueTriggerFacts(result.profile, [{ type: 'AGE_MILESTONE', playerId: result.profile.id, age: result.profile.age }], envelope.state.pendingSystemEvents ?? []);
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player: result.profile, pendingSystemEvents } });
    return result;
  }

  public async chooseStoryOption(decision: StoryDecision): Promise<StoryDecisionResult> {
    const story = this.runtime.story;
    if (!story) throw new CareerGameConfigurationError('StoryEngine');
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const result = await story.decide({ profile: envelope.state.player, decision, facts: this.storyFacts(envelope.state) });
    const consumedOffer = result.consumedTransferOffer === true ? envelope.state.pendingTransferOffer ?? null : null;
    if (decision.optionId.startsWith('accept-') && consumedOffer && Date.parse(consumedOffer.expiresAt) <= Date.parse(envelope.state.currentDate)) throw new Error('Current transfer offer has expired.');
    const resume = envelope.state.eventResume;
    const nextPhase = resume?.mode === 'CONTINUE_REPORT' ? 'REPORT' : resume?.mode === 'CONTINUE_OFFSEASON' || resume?.mode === 'CONTINUE_TRANSFER_WINDOW' ? 'OFFSEASON' : resume ? 'ACTIVE' : envelope.state.seasonPhase;
    const repeatableEventHistory = result.profile.completedEventIds.includes(decision.eventId)
      ? [...(envelope.state.repeatableEventHistory ?? []).filter((entry) => !(entry.eventId === decision.eventId && entry.season === envelope.state.season)), ...(envelope.state.repeatableEventHistory ?? []).some((entry) => entry.eventId === decision.eventId && entry.season === envelope.state.season) ? [] : [{ eventId: decision.eventId, season: envelope.state.season }]]
      : [...(envelope.state.repeatableEventHistory ?? [])];
    const contractService = this.runtime.contractService ?? new SaveContractService(
      envelope.state.contracts,
      new ConditionEvaluatorImpl(),
      (profile) => ({ player: profile, currentTeamId: profile.currentTeamId, opponentTeamId: null, randomRoll: decision.randomRoll, difficultyMode: profile.difficultyMode }),
      this.runtime.teamTier ?? (() => undefined),
    );
    let player = result.profile;
    let contracts = [...envelope.state.contracts];
    let terminatedContractId = result.terminatedContractId;
    for (const effect of result.appliedEffects) {
      if (effect.type === 'FORCE_CONTRACT_TERMINATION') {
        const termination = await contractService.terminate({ profile: player, effect, sourceStoryEventId: decision.eventId, sourceOptionId: decision.optionId, occurredAt: envelope.state.currentDate });
        if (termination.terminated) {
          player = termination.profile;
          contracts = [...contractService.snapshot];
          terminatedContractId = termination.contract.id;
        }
      }
    }
    for (const effect of result.appliedEffects) {
      if (effect.type !== 'CONTRACT_RENEWAL') continue;
      const current = player.currentContractId ? contracts.find((contract) => contract.id === player.currentContractId && contract.status === 'ACTIVE') : undefined;
      if (!current) continue;
      const renewalBase = Date.parse(current.endsAt) > Date.parse(envelope.state.currentDate) ? current.endsAt : envelope.state.currentDate;
      const endsAt = this.contractEndDateByMonths(renewalBase, effect.lengthMonths);
      const renewal = await contractService.renew({ profile: player, contractId: current.id, terms: { endsAt, salaryPerMonth: Math.round(current.salaryPerMonth * effect.salaryMultiplier), buyoutAmount: Math.round(current.buyoutAmount * effect.buyoutMultiplier) }, occurredAt: envelope.state.currentDate });
      if ('contract' in renewal && !('reason' in renewal)) {
        player = renewal.profile;
        contracts = [...contractService.snapshot];
      }
    }
    for (const effect of result.appliedEffects) {
      if (effect.type !== 'TEAM_TRANSFER') continue;
      const now = envelope.state.currentDate;
      const offer = effect.offerRef === 'CURRENT_TRANSFER_OFFER' ? consumedOffer : null;
      if (effect.offerRef === 'CURRENT_TRANSFER_OFFER' && (!offer || Date.parse(offer.expiresAt) <= Date.parse(now))) continue;
      const targetTeamId = effect.teamId ?? offer?.teamId;
      if (!targetTeamId) continue;
      const endsAt = effect.endsAt ?? (effect.lengthMonths ? this.contractEndDateByMonths(now, effect.lengthMonths) : offer?.contract ? this.contractEndDateByMonths(now, offer.contract.lengthMonths) : this.contractEndDate(now));
      const terms: ContractTerms = { teamId: targetTeamId, startedAt: now, endsAt, salaryPerMonth: effect.salaryPerMonth ?? offer?.contract?.salaryPerMonth ?? offer?.salaryPerMonth ?? 0, buyoutAmount: effect.buyoutAmount ?? offer?.contract?.buyoutAmount ?? offer?.buyoutAmount ?? 0, ...(offer?.contract?.role ? { role: offer.contract.role } : {}), ...(offer?.contract?.expectedPlaytimePercentage !== undefined ? { expectedPlaytimePercentage: offer.contract.expectedPlaytimePercentage } : {}) };
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
    const terminatedContract = terminatedContractId ? contracts.find((contract) => contract.id === terminatedContractId) : undefined;
    const pendingSystemEvents = terminatedContract
      ? await this.enqueueTriggerFacts(player, [{ type: 'CONTRACT_TERMINATED', playerId: player.id, contract: terminatedContract }], envelope.state.pendingSystemEvents ?? [])
      : envelope.state.pendingSystemEvents ?? [];
    const resumedTournament = resume?.tournamentId && envelope.state.activeTournamentId === resume.tournamentId;
    const nextState = {
      ...envelope.state,
      player,
      contracts,
      pendingSystemEvents,
      repeatableEventHistory,
      currentStoryEventId: result.nextEventId,
      pendingTransferOffer: consumedOffer ? null : envelope.state.pendingTransferOffer ?? null,
      eventResume: null,
      ...(resumedTournament ? { tournamentPhase: 'IN' as const, tournamentMatchCursor: (envelope.state.tournamentMatchCursor ?? 0) + 1 } : {}),
    };
    await this.saveEnvelope({ ...envelope, state: nextPhase ? { ...nextState, seasonPhase: nextPhase } : nextState });
    return { ...result, profile: player, terminatedContractId };
  }

  public async findAvailableStoryEvents(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<readonly StoryEvent[]> {
    const story = this.runtime.story;
    if (!story) return [];
    const envelope = await this.requireSave();
    return story.findAvailableEvents({ profile: envelope.state.player, ...input, facts: this.storyFacts(envelope.state) });
  }

  public async listDailyActions(period: import('../daily-action').DailyActionDefinition['allowedPeriods'][number]): Promise<readonly import('../daily-action').DailyActionDefinition[]> {
    const service = this.runtime.dailyActions ?? this.dependencies.dailyActions;
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    return service.listAvailable({ player: envelope.state.player, period });
  }

  public async executeDailyAction(actionId: string, randomRoll: number): Promise<PlayerProfile> {
    const service = this.runtime.dailyActions ?? this.dependencies.dailyActions;
    const envelope = await this.requireSave();
    this.assertActive(envelope.state.player);
    const result = await service.execute({ player: envelope.state.player, actionId, randomRoll });
    if (!result.completed) return result.player;
    const bankrupt = this.dependencies.economy.isBankrupt(result.player.life.balance);
    const pendingSystemEvents = bankrupt
      ? await this.enqueueTriggerFacts(result.player, [{ type: 'PLAYER_BANKRUPT', playerId: result.player.id, balance: result.player.life.balance }], envelope.state.pendingSystemEvents ?? [])
      : envelope.state.pendingSystemEvents ?? [];
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player: result.player, pendingSystemEvents } });
    return result.player;
  }

  public async retire(reason?: string): Promise<PlayerProfile> {
    const envelope = await this.requireSave();
    const player = await this.dependencies.retirement.retire(reason === undefined
      ? { player: envelope.state.player, retiredAt: envelope.state.currentDate }
      : { player: envelope.state.player, reason, retiredAt: envelope.state.currentDate });
    const contracts = envelope.state.contracts.map((contract) => contract.playerId === player.id && contract.status === 'ACTIVE' ? { ...contract, status: 'TERMINATED' as const, termination: { reason: 'MUTUAL_AGREEMENT' as const, terminatedAt: envelope.state.currentDate, matchedConditions: [], note: reason ?? '选手主动退役，合同同步终止。' } } : contract);
    await this.saveEnvelope({ ...envelope, state: { ...envelope.state, player, contracts, currentStoryEventId: null } });
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
      case 'TRANSFER_WINDOW':
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
      case 'TRANSFER_WINDOW': return 'TRANSFER_WINDOW';
      case 'OFFSEASON': return 'OFFSEASON';
    }
  }

  private async ensureSchedule(state: CareerSaveEnvelope['state']): Promise<CareerSaveEnvelope['state']> {
    if (state.scheduledTournaments.length || (!state.player.currentTeamId && !state.standInAssignment)) return state;
    const tournaments = this.runtime.tournaments;
    const getSnapshot = this.runtime.vrsSnapshot;
    if (!tournaments || !getSnapshot) return state;
    const scheduleTeamId = state.player.currentTeamId ?? state.standInAssignment?.teamId;
    if (!scheduleTeamId) return state;
    const snapshot = state.activeVrsSnapshot ?? await getSnapshot({ season: state.season, half: state.careerHalf as 1 | 2 });
    const scheduledTournaments = await tournaments.createCalendar({ season: state.season, half: state.careerHalf as 1 | 2, teamId: scheduleTeamId, snapshot });
    return { ...state, activeVrsSnapshot: snapshot, scheduledTournaments, unsettledTournamentIds: scheduledTournaments.map((edition) => edition.id) };
  }

  private async advanceTournamentState(service: TournamentService, edition: TournamentEdition, state: CareerSaveEnvelope['state'], upsetRoll: number): Promise<TournamentAdvanceResult> {
    const interventions = await service.findPendingInterventions(edition.id);
    const rankRange = this.opponentRankRange(edition);
    const rankedOpponents = (state.activeVrsSnapshot?.entries ?? [])
      .filter((entry) => entry.teamId !== edition.teamId && entry.snapshotRank >= rankRange.minimum && entry.snapshotRank <= rankRange.maximum)
      .sort((left, right) => left.snapshotRank - right.snapshotRank)
      .slice(0, 5);
    const fallbackOpponents = rankedOpponents.length ? null : this.fallbackOpponents(edition);
    const baseOpponentStrength = rankedOpponents.length
      ? Object.fromEntries(rankedOpponents.map((entry) => [entry.teamId, this.clamp(92 - entry.snapshotRank * 0.65, 62, 90)]))
      : Object.fromEntries(fallbackOpponents!.map((entry) => [entry.teamId, entry.strength]));
    const opponentRanks = rankedOpponents.length
      ? Object.fromEntries(rankedOpponents.map((entry) => [entry.teamId, entry.snapshotRank]))
      : Object.fromEntries(fallbackOpponents!.map((entry) => [entry.teamId, entry.rank]));
    const context: TournamentSimulationContext = { editionId: edition.id, baseTeamStrength: this.teamStrength(state.player), baseOpponentStrength, opponentRanks, interventions, upsetRoll };
    const assignment = state.standInAssignment?.editionId === edition.id ? state.standInAssignment : null;
    const activeContract = state.player.currentContractId ? state.contracts.find((contract) => contract.id === state.player.currentContractId && contract.status === 'ACTIVE') : undefined;
    const configured = (await service.lockRoster({ edition, roster: [], careerHalf: state.careerHalf })).roster;
    const expectedPlaytime = activeContract?.expectedPlaytimePercentage ?? 100;
    const appearanceRoll = this.stableRoll(`${edition.id}|${state.player.id}|${activeContract?.id ?? 'starter'}|appearance`);
    const contractActive = !activeContract || appearanceRoll * 100 < expectedPlaytime;
    const replaced = (assignment || contractActive) ? (configured.find((slot) => slot.active && slot.role === (assignment?.targetRole ?? state.player.role)) ?? configured.find((slot) => slot.active))?.playerId : undefined;
    const requestedRoster = assignment
      ? [...configured.map((slot) => slot.playerId === replaced ? { ...slot, active: false } : slot), { playerId: state.player.id, role: state.player.role, active: true }]
      : activeContract
        ? [...configured.map((slot) => slot.playerId === state.player.id ? { ...slot, active: contractActive } : slot.playerId === replaced && contractActive ? { ...slot, active: false } : slot), ...(configured.some((slot) => slot.playerId === state.player.id) ? [] : [{ playerId: state.player.id, role: state.player.role, active: contractActive }])]
        : [{ playerId: state.player.id, role: state.player.role, active: true }];
    const roster = await service.lockRoster({ edition, roster: requestedRoster, careerHalf: state.careerHalf, substitutePlayerId: assignment?.playerId ?? null, ...(assignment ? { targetRole: assignment.targetRole ?? state.player.role } : {}) }).then((lock) => lock.roster);
    return state.activeTournamentState
      ? service.advance({ edition, context, roster, state: state.activeTournamentState })
      : service.start({ edition, context, roster });
  }

  private opponentRankRange(edition: TournamentEdition): { readonly minimum: number; readonly maximum: number } {
    if (edition.qualificationSource === 'PUBLIC_QUALIFIER' || edition.tier === 'QUALIFIER') return { minimum: 1, maximum: 30 };
    if (edition.tier === 'MAJOR') return { minimum: 1, maximum: 8 };
    if (edition.tier === 'T1') return { minimum: 1, maximum: 15 };
    if (edition.tier === 'T2') return { minimum: 15, maximum: 50 };
    return { minimum: 50, maximum: 100 };
  }

  private fallbackOpponents(edition: TournamentEdition): readonly { readonly teamId: string; readonly rank: number; readonly strength: number }[] {
    const range = this.opponentRankRange(edition);
    const ranks = Array.from({ length: 5 }, (_, index) => Math.round(range.minimum + (range.maximum - range.minimum) * index / 4));
    return ranks.map((rank, index) => ({ teamId: `sim-opponent-${index + 1}`, rank, strength: this.clamp(92 - rank * 0.65, 62, 90) }));
  }

  private async tournamentTriggeredEvents(player: PlayerProfile, result: TournamentResult, existing: readonly import('../event-trigger').TriggeredEvent[]): Promise<readonly import('../event-trigger').TriggeredEvent[]> {
    const facts: import('../event-trigger').TriggerFact[] = [];
    const opponent = result.matchResults.find((match) => match.upset)?.loserTeamId;
    if (result.upset.occurred && opponent) facts.push({ type: 'TOURNAMENT_UPSET', playerId: player.id, editionId: result.editionId, opponentTeamId: opponent });
    const recent = [...player.tournamentArchive].slice(-3);
    if (recent.length === 3 && recent.every((record) => record.rating < 1)) facts.push({ type: 'LOW_FINAL_RATING_STREAK', playerId: player.id, tournamentIds: recent.map((record) => record.editionId), ratings: recent.map((record) => record.rating), threshold: 1 });
    return this.enqueueTriggerFacts(player, facts, existing);
  }

  private async enqueueTriggerFacts(player: PlayerProfile, facts: readonly import('../event-trigger').TriggerFact[], existing: readonly import('../event-trigger').TriggeredEvent[]): Promise<readonly import('../event-trigger').TriggeredEvent[]> {
    const queue = [...existing];
    for (const fact of facts) {
      const triggered = await this.dependencies.triggers.evaluate({ player, fact });
      for (const event of triggered) {
        if (!queue.some((candidate) => candidate.triggerId === event.triggerId)) queue.push(this.copy(event));
        await this.dependencies.triggers.markTriggered(event.triggerId, player.id);
      }
    }
    return queue;
  }

  private projectVrsResult(state: CareerSaveEnvelope['state'], result: TournamentResult): Pick<CareerSaveEnvelope['state'], 'vrsPointsByTeam' | 'vrsAppliedResultIds' | 'vrsProjectionRulesVersion'> {
    const projector = this.runtime.vrsResultProjector;
    if (!projector) return { vrsPointsByTeam: state.vrsPointsByTeam ?? {}, vrsAppliedResultIds: state.vrsAppliedResultIds ?? [], ...(state.vrsProjectionRulesVersion ? { vrsProjectionRulesVersion: state.vrsProjectionRulesVersion } : {}) };
    if (state.vrsProjectionRulesVersion && state.vrsProjectionRulesVersion !== projector.rulesVersion) throw new Error(`VRS projection rules version mismatch: save=${state.vrsProjectionRulesVersion}, runtime=${projector.rulesVersion}.`);
    const projected = projector.apply({ pointsByTeam: state.vrsPointsByTeam ?? {}, appliedResultIds: state.vrsAppliedResultIds ?? [] }, result);
    return { vrsPointsByTeam: projected.pointsByTeam, vrsAppliedResultIds: projected.appliedResultIds, vrsProjectionRulesVersion: projector.rulesVersion };
  }

  private accumulateCareerPerformance(profile: PlayerProfile, performance: TournamentResult['playerPerformances'][number], earnings = 0): PlayerProfile {
    return {
      ...profile,
      career: {
        ...profile.career,
        totalKills: profile.career.totalKills + performance.kills,
        mapsPlayed: profile.career.mapsPlayed + performance.maps,
        clutchWon: profile.career.clutchWon + (performance.clutchesWon ?? 0),
        careerEarnings: profile.career.careerEarnings + earnings,
        rating2: performance.rating,
      },
    };
  }

  private archiveResult(profile: PlayerProfile, result: TournamentResult): PlayerProfile {
    const performance = result.playerPerformances.find((item) => item.playerId === profile.id);
    if (!performance || profile.tournamentArchive.some((record) => record.editionId === result.editionId)) return profile;
    const level = result.tier === 'MAJOR' ? 'MAJOR' : result.tier === 'T1' ? 'T1' : 'T2';
    const teamPlacement = result.teamPlacements.find((entry) => entry.teamId === result.teamId);
    const placement = teamPlacement?.placement ?? result.placement;
    const champion = teamPlacement?.title ?? result.title;
    const major = champion && level === 'MAJOR' ? 1 : 0;
    const stier = champion && level === 'T1' ? 1 : 0;
    const mvp = performance.honor === 'MVP' ? level === 'MAJOR' ? 'MAJOR' : 'NORMAL' : null;
    const evp = performance.honor === 'EVP' ? 1 : 0;
    const organizerId = this.tournamentOrganizer(result.seriesId);
    const archivePlacement: CareerTournamentRecord['placement'] = placement === 'QUALIFIED' ? 'PLAYOFF' : placement;
    const record: CareerTournamentRecord = { editionId: result.editionId, year: result.season, fullName: result.eventName, organizerId, level, placement: archivePlacement, rating: performance.rating, mapsPlayed: performance.maps, champion, mvp, trophyAssetId: champion && level !== 'T2' && organizerId !== 'OTHER' ? organizerId : null };
    const moraleDelta = champion ? 5 : -8;
    const energyDelta = champion ? -4 : -10;
    const stressDelta = champion ? -5 : 8;
    const accumulated = this.accumulateCareerPerformance(profile, performance, result.playerPrizeIncome ?? 0);
    return { ...accumulated, tournamentArchive: [...profile.tournamentArchive, record], trophies: { ...profile.trophies, majorChampionships: profile.trophies.majorChampionships + major, otherSTierTitles: profile.trophies.otherSTierTitles + stier, mvpAwards: profile.trophies.mvpAwards + (mvp ? 1 : 0), evpAwards: profile.trophies.evpAwards + evp }, morale: this.clamp(profile.morale + moraleDelta, 0, 100), energy: this.clamp(profile.energy + energyDelta, 0, 100), life: { ...profile.life, stress: this.clamp(profile.life.stress + stressDelta, 0, 100) } };
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
      currentDate: state.currentDate,
      currentTeamRank,
      transferWindowOpen: state.seasonPhase === 'OFFSEASON' || state.seasonPhase === 'REPORT' || state.eventResume?.mode === 'CONTINUE_TRANSFER_WINDOW',
      pendingTransferOffer: state.pendingTransferOffer ?? null,
      lowRatingStreak,
      advancedMapsPlayed: state.player.tournamentArchive
        .filter((record) => record.level === 'T1' || record.level === 'MAJOR')
        .reduce((sum, record) => sum + record.mapsPlayed, 0),
    };
  }

  private contractEndDateByMonths(startedAt: string, months: number): string {
    const startsAt = new Date(Date.parse(startedAt));
    if (!Number.isFinite(months) || months <= 0 || Number.isNaN(startsAt.getTime())) return this.contractEndDate(startedAt);
    const day = startsAt.getUTCDate();
    startsAt.setUTCDate(1);
    startsAt.setUTCMonth(startsAt.getUTCMonth() + Math.trunc(months));
    const lastDay = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 0)).getUTCDate();
    startsAt.setUTCDate(Math.min(day, lastDay));
    return startsAt.toISOString();
  }
  private contractEndDate(startedAt: string): string {
    const endsAt = new Date(Date.parse(startedAt));
    endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 2);
    return endsAt.toISOString();
  }
  private stableRoll(value: string): number { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967296; }
  private clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
  private teamStrength(profile: PlayerProfile): number { const a = profile.attributes; return (a.aim * 0.24 + a.gameSense * 0.2 + a.leadership * 0.12 + a.clutch * 0.16 + a.consistency * 0.2 - a.teamConflict * 0.08 + profile.morale * 0.06 + profile.energy * 0.06); }
  private tournamentOrganizer(seriesId: string): import('../retirement').TournamentOrganizerId { const id = seriesId.toLowerCase(); if (id.includes('blast')) return 'BLAST'; if (id.includes('iem-katowice')) return 'IEM_KATOWICE'; if (id.includes('iem-cologne')) return 'IEM_COLOGNE'; if (id.includes('pgl') || id.includes('major')) return 'PGL_T1'; if (id.includes('perfect-world') || id.includes('cac')) return 'PW_T1'; if (id.includes('epl') || id.includes('iem-')) return 'ESL_T1'; return 'OTHER'; }
  private copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
  private async requireOriginRule(region: PlayerProfile['originRegion']): Promise<RegionOriginRule> { const rule = await this.runtime.progressionRules?.findOriginRule(region); if (!rule) throw new CareerGameConfigurationError(`RegionOriginRule for ${region}`); return rule; }
  private async requireSave(): Promise<CareerSaveEnvelope> { const value = await this.dependencies.stateRepository.load(this.dependencies.playerId); if (!value) throw new Error(`No career save exists for player ${this.dependencies.playerId}.`); return value; }
  private async saveEnvelope(envelope: CareerSaveEnvelope): Promise<void> {
    const cursor = this.runtime.random?.cursor?.();
    const state = cursor === undefined ? envelope.state : { ...envelope.state, randomCursor: cursor };
    await this.dependencies.stateRepository.save(this.dependencies.playerId, { ...envelope, state });
  }
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
