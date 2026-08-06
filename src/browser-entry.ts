import type { DailyActionDefinition, DailyActionRepository } from './engine/daily-action';
import type { EconomyRuleRepository, EconomyTickService, EconomyTickResult } from './engine/economy';
import { matchTop20Quote } from './hltv/top20-quotes';
import type { EventTriggerService } from './engine/event-trigger';
import type { CareerGame, CareerGameDependencies, CareerGameFactory } from './engine/game';
import type { EngineHltvGateway, EngineHltvGatewayFactory } from './engine/hltv-gateway';
import type { CareerEventWindow, EventPeriod, StoryEvent, StorySuccessChancePolicy, Worldline } from './engine/graph';
import type { GameDifficultyMode, GameModeRule } from './engine/mode';
import type { PlayerProfile, PlayerRole } from './engine/profile';
import type { AgePhase, AgeProgressionRule, PlayerProgressionRuleRepository, RegionOriginRule } from './engine/progression';
import type { CareerSaveEnvelope } from './engine/save-state';
import type { NpcGenerationProfile, NpcPlayerProfile } from './engine/npc';
import type { HltvModule } from './hltv/hltv-module';
import { tierForRank } from './hltv/team';
import type { CompetitionRegion, HltvPlayerId, VrsInviteSnapshot } from './hltv/team';
import type { TournamentFact, TournamentFactRepository, TournamentIntervention, TournamentInterventionAppliedFact, TournamentCompletedFact, TournamentResult, TournamentStandInAssignment, TournamentStandInOffer } from './hltv/tournament';
import type { Top20EvidenceRepository, Top20IdentityRecord, Top20Ranking, Top20SeasonEvidence } from './hltv/top20';
import type { TransferTargetView } from './hltv/transfer-targets';
import { TransferTargetServiceImpl } from './hltv/transfer-target-service-impl';
import { NpcGenerationServiceImpl } from './hltv/npc-generation-service-impl';
import { NpcTransferMarketServiceImpl } from './engine/impl/npc-transfer-market-service';
import { Top20RankingServiceImpl } from './hltv/top20-ranking-service-impl';
import { DailyActionServiceImpl } from './engine/impl/daily-action-service';
import { RetirementServiceImpl } from './engine/impl/retirement-service';
import { MatchSimulationServiceImpl } from './hltv/match-simulation-service-impl';
import { TournamentServiceImpl } from './hltv/tournament-service-impl';
import { VrsResultProjector, type VrsResultProjectionRules } from './hltv/vrs-result-projector';
import { validateBalanceConfig, type BalanceConfig, type ProdigyEasterEggConfig, type StartupStorylineWeight, type StartupTalentTier, type TalentBalanceConfig } from './hltv/balance-config';
import { ConditionEvaluatorImpl } from './engine/impl/condition-evaluator';
import { SaveContractService } from './engine/impl/contract-service';
import { AssetEventTriggerRuleRepository, EventTriggerServiceImpl } from './engine/impl/event-trigger-service';
import { CareerGameImpl, CareerGameRuntimeServices } from './engine/impl/career-game';
import { InMemoryStateRepository } from './engine/impl/in-memory-state-repository';
import { LocalStorageStateRepository } from './engine/impl/local-storage-state-repository';
import { SessionGuardedStateRepository } from './engine/impl/session-guarded-state-repository';
import { PlayerProgressionServiceImpl } from './engine/impl/player-progression-service';
import type { RetirementSummary, RetirementSummaryService, RetirementService } from './engine/retirement';
import { RetirementSummaryServiceImpl } from './engine/impl/retirement-summary-service';
import { StoryEngineImpl } from './engine/impl/story-engine';
import { StoryEventPackReader, StoryRepositoryImpl } from './engine/impl/story-repository';

export interface BrowserCareerConfig {
  readonly gameId: string;
  readonly realName: string;
  readonly randomSeed?: string;
  readonly role: 'ENTRY' | 'AWP' | 'IGL' | 'SUPPORT' | 'LURK';
  readonly region: CompetitionRegion;
  readonly mode: GameDifficultyMode;
}

export interface BrowserCareerGame extends CareerGame {
  findAvailableStoryEvents(input: { readonly period: EventPeriod; readonly randomRoll: number }): Promise<readonly StoryEvent[]>;
}

interface StoryManifest {
  readonly events: readonly string[];
  readonly worldlines: readonly string[];
}

class BrowserStoryEventPackReader implements StoryEventPackReader {
  public async readEvents(): Promise<readonly StoryEvent[]> {
    const manifest = await this.readManifest();
    return Promise.all(manifest.events.map((name) => this.readJson<StoryEvent>(`assets/story/events/${name}`)));
  }

  public async readWorldlines() {
    const manifest = await this.readManifest();
    return Promise.all(manifest.worldlines.map((name) => this.readJson<Worldline>(`assets/story/worldlines/${name}`)));
  }

  private async readManifest(): Promise<StoryManifest> {
    return this.readJson<StoryManifest>('assets/story/manifest.json');
  }

  private async readJson<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Unable to load required story data: ${path}.`);
    return response.json() as Promise<T>;
  }
}

/** Adapter implementation reserved for the full HltvModule composition root. */
export class EngineHltvGatewayFactoryImpl implements EngineHltvGatewayFactory {
  public create(hltv: HltvModule): EngineHltvGateway {
    return {
      freezeVrsSnapshot: async ({ season, half }) => hltv.vrs.getCurrent().then((ranking) => `${ranking.id}:${season}:${half}`),
      applyTournamentIntervention: (intervention) => hltv.tournaments.applyIntervention(intervention),
      settleTournament: async (fact) => { await hltv.tournaments.settle({ edition: { id: fact.result.editionId } as never, result: fact.result }); },
      findTop20: async (season) => hltv.top20Evidence.findSeasonEvidence(season).then((evidence) => hltv.top20.calculate({ season, rules: { version: 'fact-driven-aps-v4', minimumT1MajorMaps: 40, honorBaseScore: { MVP: 800, EVP: 320, VP: 96 }, honorClassMultiplier: { NONE: 0.25, MEDIUM: 0.7, LARGE: 1, ELITE: 1.1, SUPER_ELITE: 1.3, MAJOR: 1.5 } }, evidence })),
      synchronizeCareerHonors: async (profile, ranking) => ranking.careerPlayerRank ? { ...profile, trophies: { ...profile.trophies, top20Records: [...profile.trophies.top20Records.filter((record) => record.year !== ranking.season), { year: ranking.season, rank: ranking.careerPlayerRank }] } } : profile,
    };
  }
}

class BrowserClock {
  public now(): string { return new Date().toISOString(); }
}

class BrowserRandomSource {
  private state: number;
  private consumed: number;
  public constructor(seed: string, cursor = 0) {
    this.state = [...seed].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
    this.consumed = 0;
    for (let index = 0; index < Math.max(0, Math.trunc(cursor)); index += 1) this.next();
  }
  public cursor(): number { return this.consumed; }
  public next(): number { this.state = (1664525 * this.state + 1013904223) >>> 0; this.consumed += 1; return this.state / 0x100000000; }
}

type BrowserTop20SimulationRules = {
  readonly schemaVersion: number;
  readonly honorPool: { readonly mvp: number; readonly evp: number; readonly vp: number };
  readonly evidenceProjection: {
    readonly ratingFloor: number;
    readonly adrBase: number;
    readonly adrRatingFactor: number;
    readonly kastBase: number;
    readonly kastRatingFactor: number;
    readonly playoffMapRatio: number;
    readonly top5MapRatio: number;
    readonly finalMapRatio: number;
    readonly minimumPlayoffMaps: number;
    readonly minimumTop5Maps: number;
    readonly minimumFinalMaps: number;
  };
  readonly virtualGeneration: {
    readonly baseProbability: number;
    readonly prodigyProbability: number;
    readonly prodigyPotential: number;
    readonly risingPotential: number;
    readonly baselinePotential: number;
    readonly annualDebutWindow: number;
  };
  /** 虚拟选手年度赛事名称模板；{season} 会被替换为具体赛季。 */
  readonly eventNameTemplate?: string;
  readonly realPlayerDecay: {
    readonly peakThroughAge: number;
    readonly gradualDeclineEndAge: number;
    readonly gradualDeclinePerYear: number;
    readonly veteranBaseMultiplier: number;
    readonly veteranDeclinePerYear: number;
    readonly careerGraceYears: number;
    readonly careerDeclinePerYear: number;
    readonly careerDeclineCap: number;
    readonly minimumMultiplier: number;
  };
};

function isValidTop20SimulationRules(value: BrowserTop20SimulationRules): boolean {
  if (!value || value.schemaVersion !== 1 || !value.realPlayerDecay || !value.virtualGeneration || !value.evidenceProjection || !value.honorPool) return false;
  const finiteNonNegative = (candidate: number): boolean => Number.isFinite(candidate) && candidate >= 0;
  const probability = (candidate: number): boolean => finiteNonNegative(candidate) && candidate <= 1;
  const integer = (candidate: number): boolean => Number.isInteger(candidate) && candidate >= 0;
  const honorPool = [value.honorPool.mvp, value.honorPool.evp, value.honorPool.vp];
  const projection = value.evidenceProjection;
  const generation = value.virtualGeneration;
  const decay = value.realPlayerDecay;
  return honorPool.every(finiteNonNegative)
    && honorPool.some((candidate) => candidate > 0)
    && [projection.ratingFloor, projection.adrBase, projection.adrRatingFactor, projection.kastBase, projection.kastRatingFactor].every(finiteNonNegative)
    && [projection.playoffMapRatio, projection.top5MapRatio, projection.finalMapRatio].every(probability)
    && [projection.minimumPlayoffMaps, projection.minimumTop5Maps, projection.minimumFinalMaps].every(integer)
    && [generation.baseProbability, generation.prodigyProbability, generation.prodigyPotential, generation.risingPotential, generation.baselinePotential].every(probability)
    && Number.isInteger(generation.annualDebutWindow) && generation.annualDebutWindow > 0
    && [decay.peakThroughAge, decay.gradualDeclineEndAge, decay.careerGraceYears].every(integer)
    && decay.gradualDeclineEndAge >= decay.peakThroughAge
    && [decay.gradualDeclinePerYear, decay.veteranBaseMultiplier, decay.veteranDeclinePerYear, decay.careerDeclinePerYear, decay.careerDeclineCap, decay.minimumMultiplier].every(probability);
}

class BrowserGateway implements EngineHltvGateway, TournamentFactRepository, Top20EvidenceRepository {
  private readonly interventions = new Map<string, TournamentIntervention>();
  private readonly evidence = new Map<number, Map<string, Top20SeasonEvidence>>();
  private readonly completedTournamentIds = new Set<string>();
  private readonly top20 = new Top20RankingServiceImpl();
  /** 赛事干预转发目标；组合根在 TournamentServiceImpl 构造完成后注入，避免循环依赖。 */
  private interventionSink: (intervention: TournamentIntervention) => Promise<TournamentInterventionAppliedFact> | TournamentInterventionAppliedFact | null = null;
  public bindInterventionSink(sink: (intervention: TournamentIntervention) => Promise<TournamentInterventionAppliedFact> | TournamentInterventionAppliedFact | null): void {
    this.interventionSink = sink;
  }
  public constructor(
    private readonly careerPlayer: PlayerProfile,
    private readonly identities: ReadonlyMap<string, Top20IdentityRecord>,
    private readonly rankingRules: import('./hltv/top20').Top20Rules,
    private readonly teamNames: ReadonlyMap<string, string> = new Map(),
    initialEvidence: readonly Top20SeasonEvidence[] = [],
    private readonly simulationRules: BrowserTop20SimulationRules,
    private readonly quotes: import('./hltv/top20-quotes').Top20QuoteAsset | null = null,
  ) {
    for (const entry of initialEvidence) {
      const seasonEvidence = this.evidence.get(entry.season) ?? new Map<string, Top20SeasonEvidence>();
      seasonEvidence.set(entry.player.playerId, JSON.parse(JSON.stringify(entry)) as Top20SeasonEvidence);
      this.evidence.set(entry.season, seasonEvidence);
    }
  }
  public async freezeVrsSnapshot(input: { readonly season: number; readonly half: 1 | 2 }): Promise<string> { return `browser-vrs-${input.season}-h${input.half}`; }
  public async applyTournamentIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact> {
    if (this.interventionSink) {
      const applied = await this.interventionSink(intervention);
      if (applied) {
        this.interventions.set(intervention.id, { ...intervention });
        return applied;
      }
    }
    this.interventions.set(intervention.id, { ...intervention });
    return { type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: intervention.occurredAt, intervention: { ...intervention } };
  }
  public async settleTournament(fact: TournamentCompletedFact): Promise<void> { await this.append(fact); }
  public async hasCompleted(editionId: string): Promise<boolean> { return this.completedTournamentIds.has(editionId); }
  public async append(fact: TournamentFact): Promise<void> {
    if (fact.type !== 'TOURNAMENT_COMPLETED' || this.completedTournamentIds.has(fact.result.editionId)) return;
    this.completedTournamentIds.add(fact.result.editionId);
    this.projectTournamentEvidence(fact.result);
  }
  public async findSeasonEvidence(season: number): Promise<readonly Top20SeasonEvidence[]> {
    this.seedSeasonEvidence(season);
    return [...(this.evidence.get(season)?.values() ?? [])].map((entry) => JSON.parse(JSON.stringify(entry)) as Top20SeasonEvidence);
  }
  private seedSeasonEvidence(season: number): void {
    this.seedVirtualEvidence(season);
    const baselineSeason = Math.min(...this.evidence.keys());
    const baseline = this.evidence.get(baselineSeason);
    if (!baseline || !Number.isFinite(baselineSeason) || season === baselineSeason) return;
    const years = Math.max(0, season - baselineSeason);
    const decay = this.simulationRules.realPlayerDecay;
    const projected = new Map<string, Top20SeasonEvidence>(this.evidence.get(season) ?? []);
    for (const entry of baseline.values()) {
      if (entry.player.careerPlayer) continue;
      const identity = this.identities.get(entry.player.playerId);
      const age = identity?.birthYear === undefined ? 23 : season - identity.birthYear;
      const potential = identity?.potential ?? Math.max(0.72, 1.01 - (identity?.placement ?? 20) * 0.01);
      if (identity?.careerStartYear !== undefined && season < identity.careerStartYear) continue;
      if (identity?.source === 'REAL' && age > decay.gradualDeclineEndAge + decay.careerGraceYears) continue;
      const multiplier = this.realPlayerMultiplier(age, potential);
      const tournaments = entry.tournaments.map((event) => {
        const eventHonors = this.dynamicHonors(event.honors, season, this.roll(`${entry.player.playerId}|${event.eventId}|honors|${season}`));
        return { ...event, eventId: `${event.eventId}-${season}`, eventName: event.eventName.replace(String(baselineSeason), String(season)), rating: Math.max(this.simulationRules.evidenceProjection.ratingFloor, event.rating * multiplier), adr: (event.adr ?? 0) * multiplier, kast: (event.kast ?? 0) * multiplier, playoffRating: Math.max(this.simulationRules.evidenceProjection.ratingFloor, event.playoffRating * multiplier), top5Rating: Math.max(this.simulationRules.evidenceProjection.ratingFloor, event.top5Rating * multiplier), finalRating: event.finalRating === null ? null : Math.max(this.simulationRules.evidenceProjection.ratingFloor, event.finalRating * multiplier), honors: eventHonors };
      });
      if (!projected.has(entry.player.playerId)) projected.set(entry.player.playerId, { ...entry, season, tournaments });
    }
    this.evidence.set(season, projected);
  }
  private realPlayerMultiplier(age: number, potential: number): number {
    const decay = this.simulationRules.realPlayerDecay;
    if (!decay) return 1;
    if (age <= decay.peakThroughAge) return 1 + Math.max(0, potential - 0.78) * 0.12;
    if (age <= decay.gradualDeclineEndAge) return Math.max(decay.minimumMultiplier, decay.veteranBaseMultiplier - (age - decay.peakThroughAge) * decay.gradualDeclinePerYear);
    const veteranYears = age - decay.gradualDeclineEndAge;
    return Math.max(decay.minimumMultiplier, decay.veteranBaseMultiplier - (decay.gradualDeclineEndAge - decay.peakThroughAge) * decay.gradualDeclinePerYear - veteranYears * decay.veteranDeclinePerYear);
  }
  private virtualEventName(season: number): string {
    return (this.simulationRules.eventNameTemplate ?? '年度赛事 {season}').replace('{season}', String(season));
  }
  private seedVirtualEvidence(season: number): void {
    const rules = this.simulationRules.virtualGeneration;
    if (!rules) return;
    const target = this.evidence.get(season) ?? new Map<string, Top20SeasonEvidence>();
    for (const identity of this.identities.values()) {
      if (identity.source !== 'VIRTUAL' || target.has(identity.playerId)) continue;
      const roll = this.roll(`${identity.playerId}|debut`);
      const debutSeason = 2026 + Math.floor(roll * Math.max(1, rules.annualDebutWindow));
      if (season < debutSeason) continue;
      const emergence = this.roll(`${identity.playerId}|${season}|emergence`);
      const probability = emergence < rules.baseProbability
        ? emergence < rules.baseProbability * rules.prodigyProbability ? rules.prodigyPotential : rules.risingPotential
        : rules.baselinePotential;
      const rating = 0.98 + probability * 0.28;
      const honorRoll = this.roll(`${identity.playerId}|${season}|honor`);
      const mvpProbability = this.simulationRules.honorPool.mvp / Math.max(1, this.simulationRules.honorPool.mvp + this.simulationRules.honorPool.evp + this.simulationRules.honorPool.vp);
      const evpProbability = (this.simulationRules.honorPool.mvp + this.simulationRules.honorPool.evp) / Math.max(1, this.simulationRules.honorPool.mvp + this.simulationRules.honorPool.evp + this.simulationRules.honorPool.vp);
      const honors = honorRoll < mvpProbability ? [{ type: 'MVP' as const, honorClass: 'LARGE' as const, eventId: `virtual-${identity.playerId}-${season}`, eventName: this.virtualEventName(season), tier: 'T1' as const }] : honorRoll < evpProbability ? [{ type: 'EVP' as const, honorClass: 'LARGE' as const, eventId: `virtual-${identity.playerId}-${season}`, eventName: this.virtualEventName(season), tier: 'T1' as const }] : [{ type: 'VP' as const, honorClass: 'MEDIUM' as const, eventId: `virtual-${identity.playerId}-${season}`, eventName: this.virtualEventName(season), tier: 'T1' as const }];
      const projection = this.simulationRules.evidenceProjection;
      target.set(identity.playerId, { season, player: { playerId: identity.playerId, nickname: identity.nickname, countryCode: identity.countryCode, teamName: identity.teamName ?? identity.teamId ?? 'Virtual Team', careerPlayer: false, source: 'VIRTUAL' }, tournaments: [{ eventId: `virtual-${identity.playerId}-${season}`, eventName: this.virtualEventName(season), tier: 'T1', maps: 80, rating, adr: projection.adrBase + rating * projection.adrRatingFactor, kast: projection.kastBase + rating * projection.kastRatingFactor, playoffMaps: Math.max(projection.minimumPlayoffMaps, Math.round(80 * projection.playoffMapRatio)), playoffRating: rating + 0.02, top5Maps: Math.max(projection.minimumTop5Maps, Math.round(80 * projection.top5MapRatio)), top5Rating: rating, finalMaps: Math.max(projection.minimumFinalMaps, Math.round(80 * projection.finalMapRatio)), finalRating: rating + 0.01, title: honors.some((honor) => honor.type === 'MVP'), honors, majorPlayoffChoke: false }] });
    }
    this.evidence.set(season, target);
  }
  private roll(seed: string): number {
    return deriveDeterministicRoll(seed, 'top20-simulation');
  }
  private dynamicHonors(honors: readonly import('./hltv/top20').Top20HonorEvidence[], season: number, roll: number): readonly import('./hltv/top20').Top20HonorEvidence[] {
    if (roll < 0.3) return [];
    return honors.map((honor) => ({ ...honor, eventId: `${honor.eventId}-${season}`, eventName: honor.eventName.replace(/\d{4}/u, String(season)) }));
  }
  private projectTournamentEvidence(result: TournamentResult): void {
    if (result.tier !== 'T1' && result.tier !== 'MAJOR') return;
    const seasonEvidence = this.evidence.get(result.season) ?? new Map<string, Top20SeasonEvidence>();
    for (const performance of result.playerPerformances) {
      const identity = this.identities.get(performance.playerId);
      const placement = result.teamPlacements.find((entry) => entry.teamId === performance.teamId);
      const player = performance.playerId === this.careerPlayer.id
        ? { playerId: this.careerPlayer.id, nickname: this.careerPlayer.gameId, countryCode: this.careerPlayer.originRegion, teamName: this.teamNames.get(performance.teamId) ?? identity?.teamName ?? performance.teamId, careerPlayer: true, source: 'CAREER' as const }
        : { playerId: performance.playerId, nickname: identity?.nickname ?? performance.playerId, countryCode: identity?.countryCode ?? 'UNKNOWN', teamName: identity?.teamName ?? performance.teamId, careerPlayer: false, source: identity?.source ?? 'VIRTUAL' as const };
      const existing = seasonEvidence.get(performance.playerId) ?? { season: result.season, player, tournaments: [] };
      const tournament = { eventId: result.editionId, eventName: result.eventName, tier: result.tier, maps: performance.maps, rating: performance.rating, adr: performance.adr ?? 0, kast: performance.kast ?? 0, playoffMaps: performance.playoffMaps, playoffRating: performance.playoffRating, top5Maps: performance.top5Maps, top5Rating: performance.top5Rating, finalMaps: performance.finalMaps, finalRating: performance.finalRating, title: placement?.title ?? false, honors: result.honors.filter((honor) => honor.playerId === performance.playerId).map((honor) => ({ type: honor.type, honorClass: honor.honorClass, eventId: result.editionId, eventName: result.eventName, tier: result.tier })), majorPlayoffChoke: result.tier === 'MAJOR' && performance.playoffMaps > 0 && performance.playoffRating < 0.9 };
      seasonEvidence.set(performance.playerId, { ...existing, player, tournaments: [...existing.tournaments.filter((candidate) => candidate.eventId !== tournament.eventId), tournament] });
    }
    this.evidence.set(result.season, seasonEvidence);
  }
  public async findTop20(season: number): Promise<Top20Ranking> {
    const evidence = await this.findSeasonEvidence(season);
    const byPlayer = new Map<string, Top20SeasonEvidence>();
    for (const entry of evidence) {
      const existing = byPlayer.get(entry.player.playerId);
      if (!existing) {
        byPlayer.set(entry.player.playerId, entry);
        continue;
      }
      const tournaments = [...existing.tournaments, ...entry.tournaments].filter((event, index, all) => all.findIndex((candidate) => candidate.eventId === event.eventId) === index);
      const player = entry.player.careerPlayer ? entry.player : existing.player;
      byPlayer.set(entry.player.playerId, { season, player, tournaments });
    }
    const ranking = await this.top20.calculate({ season, rules: this.rankingRules, evidence: [...byPlayer.values()] });
    if (!this.quotes) return ranking;
    return { ...ranking, entries: ranking.entries.map((entry) => ({ ...entry, quote: matchTop20Quote(entry, this.quotes) })) };
  }

  public async synchronizeCareerHonors(profile: PlayerProfile, ranking: Top20Ranking): Promise<PlayerProfile> {
    const rank = ranking.careerPlayerRank;
    if (!rank) return JSON.parse(JSON.stringify(profile)) as PlayerProfile;
    const records = profile.trophies.top20Records.filter((record) => record.year !== ranking.season);
    return { ...profile, trophies: { ...profile.trophies, top20Records: [...records, { year: ranking.season, rank }] } };
  }
}

class BrowserDailyActionRepository implements DailyActionRepository {
  private actions: readonly DailyActionDefinition[] | null = null;
  public async findById(actionId: string): Promise<DailyActionDefinition | null> { return (await this.load()).find((action) => action.id === actionId) ?? null; }
  public async listAvailable(input: { readonly player: PlayerProfile; readonly period: DailyActionDefinition['allowedPeriods'][number] }): Promise<readonly DailyActionDefinition[]> { return (await this.load()).filter((action) => action.allowedPeriods.includes(input.period)); }
  private async load(): Promise<readonly DailyActionDefinition[]> {
    if (this.actions) return this.actions;
    const response = await fetch('assets/actions/daily-actions.json');
    if (!response.ok) throw new Error('Unable to load daily action data.');
    const value = await response.json() as { readonly actions: readonly DailyActionDefinition[] };
    this.actions = value.actions.map((action) => JSON.parse(JSON.stringify(action)) as DailyActionDefinition);
    return this.actions;
  }
}

export class CareerGameFactoryImpl implements CareerGameFactory {
  public constructor(private readonly storyReader: StoryEventPackReader, private readonly runtime: Omit<CareerGameRuntimeServices, 'story'> = {}) {}

  public async create(dependencies: CareerGameDependencies): Promise<CareerGame> {
    const repository = new StoryRepositoryImpl(this.storyReader);
    const story = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: new BrowserSuccessChancePolicy() });
    return new CareerGameImpl(dependencies, { ...this.runtime, story });
  }
}

class BrowserSuccessChancePolicy implements StorySuccessChancePolicy {
  public adjust(input: { readonly mode: GameDifficultyMode; readonly baseChance: import('./engine/graph').SuccessChance | undefined }) {
    if (!input.baseChance) return undefined;
    const bonus = input.mode === 'POWER_FANTASY' ? 0.1 : 0;
    return { ...input.baseChance, baseChance: Math.min(1, input.baseChance.baseChance + bonus), modifiers: [...input.baseChance.modifiers] };
  }
}

const MODE_RULES: Readonly<Record<GameDifficultyMode, GameModeRule>> = {
  HARDCORE: { mode: 'HARDCORE', initialBalanceBonus: 0, initialMoraleBonus: 0, initialEnergyBonus: 0, storySuccessChanceBonus: 0, suppressExtremeNegativeMandatoryEvents: false },
  POWER_FANTASY: { mode: 'POWER_FANTASY', initialBalanceBonus: 600, initialMoraleBonus: 12, initialEnergyBonus: 8, storySuccessChanceBonus: 0.1, suppressExtremeNegativeMandatoryEvents: true },
};

const ORIGIN_RULES: Readonly<Record<CompetitionRegion, RegionOriginRule>> = {
  EUROPE: { region: 'EUROPE', name: 'Europe', initialAttributeDeltas: [{ attribute: 'GAME_SENSE', delta: 3, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
  AMERICAS: { region: 'AMERICAS', name: 'Americas', initialAttributeDeltas: [{ attribute: 'AIM', delta: 3, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
  ASIA: { region: 'ASIA', name: 'Asia', initialAttributeDeltas: [{ attribute: 'CONSISTENCY', delta: 3, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
  OCEANIA: { region: 'OCEANIA', name: 'Oceania', initialAttributeDeltas: [{ attribute: 'CLUTCH', delta: 2, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
  MIDDLE_EAST: { region: 'MIDDLE_EAST', name: 'Middle East', initialAttributeDeltas: [{ attribute: 'AIM', delta: 2, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
  AFRICA: { region: 'AFRICA', name: 'Africa', initialAttributeDeltas: [{ attribute: 'LEADERSHIP', delta: 2, source: 'REGION_BONUS' }], agePhaseAttributeDeltas: {}, originFlags: [] },
};

const ROLE_MAP: Readonly<Record<BrowserCareerConfig['role'], PlayerRole>> = { ENTRY: 'ENTRY_FRAGGER', AWP: 'AWPER', IGL: 'IGL', SUPPORT: 'SUPPORT', LURK: 'LURKER' };

const AGE_RULES: Readonly<Record<AgePhase, AgeProgressionRule>> = {
  DEVELOPMENT: { phase: 'DEVELOPMENT', minimumAge: 0, maximumAge: 20, baseAttributeDeltas: [{ attribute: 'AIM', delta: 1, source: 'AGE_BASE' }, { attribute: 'GAME_SENSE', delta: 1, source: 'AGE_BASE' }, { attribute: 'CONSISTENCY', delta: 1, source: 'AGE_BASE' }] },
  PEAK: { phase: 'PEAK', minimumAge: 21, maximumAge: 25, baseAttributeDeltas: [] },
  GRADUAL_DECLINE: { phase: 'GRADUAL_DECLINE', minimumAge: 26, maximumAge: 29, baseAttributeDeltas: [{ attribute: 'AIM', delta: -1, source: 'AGE_BASE' }, { attribute: 'CLUTCH', delta: -1, source: 'AGE_BASE' }] },
  SHARP_DECLINE: { phase: 'SHARP_DECLINE', minimumAge: 30, maximumAge: null, baseAttributeDeltas: [{ attribute: 'AIM', delta: -3, source: 'AGE_BASE' }, { attribute: 'CONSISTENCY', delta: -2, source: 'AGE_BASE' }, { attribute: 'CLUTCH', delta: -2, source: 'AGE_BASE' }] },
};

const progressionRules: PlayerProgressionRuleRepository = {
  findAgeRule: async (phase) => AGE_RULES[phase],
  findOriginRule: async (region) => ORIGIN_RULES[region],
};

class BrowserEconomyService implements EconomyTickService {
  public isBankrupt(balance: number): boolean { return balance < 0; }
  public async tick(input: { readonly player: PlayerProfile; readonly period: 'WEEK' | 'MONTH'; readonly occurredAt?: string }): Promise<EconomyTickResult> {
    const multiplier = input.period === 'MONTH' ? 4 : 1;
    const amount = (input.player.life.incomePerWeek - input.player.life.expensePerWeek) * multiplier;
    const balanceAfter = input.player.life.balance + amount;
    return { player: { ...input.player, life: { ...input.player.life, balance: balanceAfter } }, period: input.period, entries: [], balanceBefore: input.player.life.balance, balanceAfter, bankrupt: this.isBankrupt(balanceAfter), bankruptcyReason: balanceAfter < 0 ? 'NEGATIVE_BALANCE' : null };
  }
}

class BrowserEconomyRuleRepository implements EconomyRuleRepository {
  public constructor(private readonly config: import('./hltv/balance-config').BalanceConfig) {}
  public async getDefaultWeeklyExpense(): Promise<number> { return this.config.economy?.weeklyExpense ?? 0; }
  public async getJobIncome(player: PlayerProfile): Promise<number> {
    const jobs: Readonly<Record<PlayerProfile['life']['currentJob'], number>> = { NONE: 0, STUDENT: 0, NET_CAFE_CASHIER: 80, ELO_BOOSTER: 160, SMALL_STREAMER: 240 };
    return jobs[player.life.currentJob] ?? 0;
  }
}

function createBaseProfile(config: BrowserCareerConfig, attributes: PlayerProfile['attributes'], worldlineId: string): PlayerProfile {
  return {
    id: config.gameId as HltvPlayerId, gameId: config.gameId, nationality: config.realName, difficultyMode: config.mode, isRetired: false,
    tournamentArchive: [], originRegion: config.region, age: 16, currentTeamId: null, currentContractId: null, role: ROLE_MAP[config.role],
    attributes: { ...attributes },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId, completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

export function deriveDeterministicRoll(seed: string, namespace: string): number {
  let hash = 2166136261;
  for (const character of `${namespace}:${seed}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

export function rollTalentTier(seed: string, config: TalentBalanceConfig): StartupTalentTier {
  return deriveDeterministicRoll(seed, 'startup:talent-tier') < config.geniusProbability ? 'GENIUS' : 'ORDINARY';
}

export function rollStoryline(seed: string, pool: readonly StartupStorylineWeight[]): string {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = deriveDeterministicRoll(seed, 'startup:worldline') * total;
  for (const entry of pool) { cursor -= entry.weight; if (cursor < 0) return entry.id; }
  return pool[pool.length - 1]?.id ?? 'rookie';
}

function guaranteePowerFantasyMax(profile: PlayerProfile, seed: string, enabled: boolean): PlayerProfile {
  if (!enabled || profile.difficultyMode !== 'POWER_FANTASY') return profile;
  const positive = ['aim', 'gameSense', 'leadership', 'clutch', 'consistency'] as const;
  if (positive.some((key) => profile.attributes[key] === 100)) return profile;
  const key = positive[Math.floor(deriveDeterministicRoll(seed, 'startup:power-max') * positive.length)] ?? positive[0];
  return { ...profile, attributes: { ...profile.attributes, [key]: 100 } };
}

function isAlmostAllProdigy(profile: PlayerProfile, config: ProdigyEasterEggConfig): boolean {
  return config.almostAllAttributes.every((key) => profile.attributes[key] === 100);
}

/**
 * 出生天赋彩蛋：基于 gameId 的确定性随机（不消耗随机数序列，同 gameId 结果稳定）。
 * 现实中有选手天生某项属性满级，此处以极小概率复现：
 * - roll < almostAllProbability（默认 0.05%）：点满几乎所有正面属性
 * - roll < partialProbability（默认 0.1%，含上一档）：点满一部分天赋
 */
export function prodigyEasterEggRoll(gameId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < gameId.length; index += 1) {
    hash ^= gameId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const value = Math.sin((hash >>> 0) * 0.618033988749895) * 43758.5453;
  return value - Math.floor(value);
}

export function applyProdigyEasterEgg(profile: PlayerProfile, roll: number, config: ProdigyEasterEggConfig): PlayerProfile {
  if (roll < config.almostAllProbability) {
    const attributes = { ...profile.attributes };
    for (const key of config.almostAllAttributes) attributes[key] = 100;
    return { ...profile, attributes };
  }
  if (roll < config.partialProbability) {
    const count = Math.min(config.partialAttributeCount, config.almostAllAttributes.length);
    const picked = [...config.almostAllAttributes]
      .sort((left, right) => prodigyEasterEggRoll(`${roll}:${left}`) - prodigyEasterEggRoll(`${roll}:${right}`))
      .slice(0, count);
    const attributes = { ...profile.attributes };
    for (const key of picked) attributes[key] = 100;
    return { ...profile, attributes };
  }
  return profile;
}

function browserStateRepository(): import('./engine/save-state').CareerGameStateRepository {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return new LocalStorageStateRepository(window.localStorage);
  } catch {
    // Privacy modes may deny localStorage; retain the process-local fallback.
  }
  return InMemoryStateRepository.getInstance();
}

let currentGame: BrowserCareerGame | null = null;
let currentGateway: EngineHltvGateway | null = null;
let currentRandomSeed: string | null = null;
const sessionGenerations = new Map<string, number>();
const sessionGeneration = (slotId: string): number => sessionGenerations.get(slotId) ?? 0;
const supersedeSession = (slotId: string): number => { const next = sessionGeneration(slotId) + 1; sessionGenerations.set(slotId, next); return next; };

async function composeCareerGame(config: BrowserCareerConfig, restoredState: CareerSaveEnvelope | null = null, generation = sessionGeneration(config.gameId)): Promise<BrowserCareerGame> {
  if (!config.gameId.trim()) throw new Error('Game ID is required.');
  const configuredSeed = config.randomSeed?.trim();
  const seed = restoredState?.state.randomSeed ?? (configuredSeed || config.gameId);
  const balanceResponse = await fetch('assets/balance/performance.json').catch(() => null);
  if (!balanceResponse?.ok) throw new Error('Unable to load required balance configuration.');
  const balanceConfig = validateBalanceConfig(await balanceResponse.json());
  const stateRepository = new SessionGuardedStateRepository(browserStateRepository(), config.gameId, generation, () => sessionGeneration(config.gameId));
  const storyReader = new BrowserStoryEventPackReader();
  const storyRepository = new StoryRepositoryImpl(storyReader);
  const talentTier = restoredState?.state.talentTier ?? rollTalentTier(seed, balanceConfig.talent);
  const talentBand = talentTier === 'GENIUS' ? balanceConfig.talent.genius : balanceConfig.talent.ordinary;
  const selectedWorldlineId = restoredState?.state.player.worldlineId ?? rollStoryline(seed, talentBand.storylines);
  const selectedWorldline = restoredState ? null : await storyRepository.findWorldline(selectedWorldlineId);
  const fallbackWorldline = restoredState || selectedWorldline ? null : await storyRepository.findWorldline('rookie');
  const startupWorldline = selectedWorldline ?? fallbackWorldline;
  if (!restoredState && !startupWorldline) throw new Error(`Startup worldline is not configured: ${selectedWorldlineId}.`);
  const progression = new PlayerProgressionServiceImpl(progressionRules);
  const unsignedPlayer = await progression.createProfile({ profile: createBaseProfile(config, talentBand.attributes[config.role], startupWorldline?.id ?? selectedWorldlineId), difficultyMode: config.mode, originRule: ORIGIN_RULES[config.region], modeRule: MODE_RULES[config.mode] });
  const eggRoll = deriveDeterministicRoll(seed, 'startup:prodigy-easter-egg');
  const withEgg = talentTier === 'GENIUS' ? applyProdigyEasterEgg(unsignedPlayer, eggRoll, balanceConfig.prodigy) : unsignedPlayer;
  const playerWithProdigy = guaranteePowerFantasyMax(withEgg, seed, balanceConfig.talent.powerFantasyGuaranteedMax);
  const clock = new BrowserClock();
  const safeCursor = restoredState?.state.randomCursor;
  if (safeCursor !== undefined && (!Number.isSafeInteger(safeCursor) || safeCursor < 0 || safeCursor > 1_000_000)) throw new Error('Career save randomCursor is invalid.');
  const random = new BrowserRandomSource(seed, safeCursor ?? 0);
  const dailyActions = new DailyActionServiceImpl(new BrowserDailyActionRepository());
  const rosterResponse = await fetch('assets/teams/rosters.json').catch(() => null);
  const rosterPayload = rosterResponse && rosterResponse.ok ? await rosterResponse.json() as import('./hltv/team-assets-repository').TeamRosterAsset : null;
  const standingsResponse = await fetch('assets/teams/teams.json').catch(() => null);
  const standingsPayload = standingsResponse && standingsResponse.ok ? await standingsResponse.json() as { readonly teams: readonly { readonly id: string; readonly name: string; readonly standings: { readonly bestRank: number; readonly bestPoints: number } | null }[] } : null;
  const rosterRegions = new Map((rosterPayload?.teams ?? []).map((team) => [team.teamId, team.region]));
  const teamTiers = new Map((standingsPayload?.teams ?? []).filter((team) => team.standings).map((team) => [team.id, tierForRank(team.standings!.bestRank)]));
  // 排名分级优先；仅无排名队伍使用 roster 的静态 tier 作为兼容回退。
  for (const team of rosterPayload?.teams ?? []) if (!teamTiers.has(team.teamId)) teamTiers.set(team.teamId, team.tier);
  const academyResponse = await fetch('assets/academy/academy-teams.json').catch(() => null);
  const academyPayload = academyResponse && academyResponse.ok ? await academyResponse.json() as { readonly teams: readonly { readonly teamId: string; readonly name: string; readonly region: CompetitionRegion; readonly tier: 'T3'; readonly monthlySalary: number; readonly contractLengthMonths?: number; readonly buyoutAmount?: number; readonly expectedPlaytimePercentage?: number; readonly startingRole?: 'STARTER' | 'SUBSTITUTE'; readonly initialCandidate?: boolean; readonly storyOnly?: boolean }[] } : { teams: [] };
  const ranksByTeam = new Map((standingsPayload?.teams ?? []).filter((team) => team.standings).map((team) => [team.id, team.standings!.bestRank]));
  const regional = academyPayload.teams.filter((team) => team.initialCandidate && !team.storyOnly && team.region === config.region && team.tier === 'T3' && (ranksByTeam.get(team.teamId) ?? 0) > 100);
  const global = academyPayload.teams.filter((team) => team.initialCandidate && !team.storyOnly && team.tier === 'T3' && (ranksByTeam.get(team.teamId) ?? 0) > 100);
  const candidates = regional.length ? regional : global;
  const almostAll = talentTier === 'GENIUS' && isAlmostAllProdigy(playerWithProdigy, balanceConfig.prodigy);
  const powerFantasyHighTier = config.mode === 'POWER_FANTASY' && deriveDeterministicRoll(seed, 'startup:power-high-tier') < balanceConfig.talent.powerFantasyHighTierProbability;
  const highTierStart = almostAll || powerFantasyHighTier;
  const startupCandidates = highTierStart
    ? (standingsPayload?.teams ?? []).filter((team) => team.standings && balanceConfig.talent.maxedStartTier.includes(teamTiers.get(team.id) as 'T1' | 'T2') && rosterRegions.get(team.id) === config.region).map((team) => {
      const startupTier = teamTiers.get(team.id) as 'T1' | 'T2';
      const terms = balanceConfig.talent.maxedStartContracts[startupTier];
      return { teamId: team.id, monthlySalary: terms.salaryPerMonth, contractLengthMonths: terms.lengthMonths, buyoutAmount: terms.buyoutAmount, startingRole: terms.role, expectedPlaytimePercentage: terms.expectedPlaytimePercentage, startupTier };
    })
    : [];
  const startingPool = startupCandidates.length ? startupCandidates : candidates;
  const startingTeam = restoredState ? null : [...startingPool].sort((left, right) => left.teamId.localeCompare(right.teamId))[Math.floor(deriveDeterministicRoll(seed, 'startup:team') * Math.max(1, startingPool.length))];
  if (!restoredState && !startingTeam) throw new Error(`No starting team is configured for ${config.region}.`);
  const startedAt = '2026-01-01T00:00:00.000Z';
  const initialContracts = restoredState?.state.contracts ?? [];
  const contracts = new SaveContractService(initialContracts, new ConditionEvaluatorImpl(), (candidate) => ({ player: candidate, currentTeamId: candidate.currentTeamId, opponentTeamId: null, randomRoll: 0, difficultyMode: candidate.difficultyMode }), (teamId) => teamTiers.get(teamId), (_profile, terms) => !restoredState && highTierStart && startupCandidates.some((team) => team.teamId === terms.teamId));
  let player = restoredState?.state.player ?? playerWithProdigy;
  if (startingTeam) {
    const endsAt = new Date(startedAt); endsAt.setUTCMonth(endsAt.getUTCMonth() + (startingTeam.contractLengthMonths ?? 12));
    const signed = await contracts.sign({ profile: playerWithProdigy, terms: { teamId: startingTeam.teamId, startedAt, endsAt: endsAt.toISOString(), salaryPerMonth: startingTeam.monthlySalary, buyoutAmount: startingTeam.buyoutAmount ?? 0, role: startingTeam.startingRole ?? 'STARTER', expectedPlaytimePercentage: startingTeam.expectedPlaytimePercentage ?? 75 }, occurredAt: startedAt });
    if (!('contract' in signed) || 'reason' in signed) throw new Error(`Unable to create initial contract for ${startingTeam.teamId}.`);
    player = signed.profile;
  }
  const state: CareerSaveEnvelope = restoredState ?? {
    format: 'COPE_CAREER_SAVE', version: 1,
    state: { schemaVersion: 1, randomSeed: seed, randomCursor: 0, talentTier, savedAt: new Date().toISOString(), currentDate: startedAt, season: 2026, careerHalf: 1, player, contracts: contracts.snapshot, npcPlayers: [], worldlines: [], currentStoryEventId: startupWorldline?.startEventId ?? null, completedEventIds: [], seasonNarrativeEventCount: 0, pendingSystemEvents: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null, activeTournamentState: null, vrsPointsByTeam: {}, vrsAppliedResultIds: [] },
  };
  if (!restoredState) await stateRepository.save(config.gameId, state);
  else if (!restoredState.state.randomSeed) {
    await stateRepository.save(config.gameId, { ...restoredState, state: { ...restoredState.state, randomSeed: seed } });
  }
  const transferTargets = new TransferTargetServiceImpl(async () => {
    const response = await fetch('assets/teams/transfer-targets.json').catch(() => null);
    const configured = response && response.ok ? await response.json() as import('./hltv/transfer-targets').TransferTargetAsset : null;
    const configuredIds = new Set((configured?.targets ?? []).map((target) => target.teamId));
    const generated = (standingsPayload?.teams ?? []).flatMap((team) => {
      const rank = team.standings?.bestRank;
      if (!rank || configuredIds.has(team.id)) return [];
      const region = rosterRegions.get(team.id);
      // Unknown geography is not fabricated; configuration assets may explicitly cover such teams.
      if (!region) return [];
      const tier = teamTiers.get(team.id) ?? 'T3';
      const salaryPerMonth = tier === 'T1' ? 18000 : tier === 'T2' ? 3500 : 900;
      const bounds = tier === 'T1' ? { minimumRank: 1, maximumRank: 12 } : tier === 'T2' ? { minimumRank: 13, maximumRank: 32 } : { minimumRank: 33, maximumRank: 345 };
      return [{ teamId: team.id, teamName: team.name, region, tier, ...bounds, requiredAttributes: tier === 'T1' ? { aim: 70, consistency: 65 } : tier === 'T2' ? { aim: 55, consistency: 50 } : { aim: 45 }, minimumRecentRating: tier === 'T1' ? 1.08 : tier === 'T2' ? 0.98 : 0.9, minimumCareerMaps: tier === 'T1' ? 100 : tier === 'T2' ? 35 : 0, minimumT1MajorMaps: tier === 'T1' ? 30 : 0, preferredRegions: [region], salaryPerMonth, buyoutAmount: tier === 'T1' ? 120000 : tier === 'T2' ? 18000 : 3000, reason: `VRS #${rank} 队伍正在评估当前窗口的阵容人选。`, roleOffer: tier === 'T1' ? 'SUBSTITUTE' as const : 'STARTER' as const, contractLengthMonths: tier === 'T1' ? 6 : 12, risk: tier === 'T1' ? 'HIGH' : 'MEDIUM', expectedPlaytimePercentage: tier === 'T1' ? 35 : 85 }];
    });
    return { schemaVersion: 2, targets: [...(configured?.targets ?? []), ...generated] };
  });
  const rosterByTeam = new Map((rosterPayload?.teams ?? []).map((team) => [team.teamId, team.players.map((candidate) => ({ playerId: candidate.playerId, role: candidate.role, active: candidate.active }))]));
  const identityMap = new Map<string, Top20IdentityRecord>((rosterPayload?.teams ?? []).flatMap((team) => team.players.map((candidate) => [candidate.playerId, { playerId: candidate.playerId, nickname: candidate.nickname, countryCode: team.region, teamName: team.teamName, teamId: team.teamId, teamTier: team.tier, source: 'REAL' as const }] as const)));
  const rankingRulesResponse = await fetch('assets/top20/ranking-rules.json').catch(() => null);
  if (!rankingRulesResponse?.ok) throw new Error('Unable to load required TOP20 ranking rules.');
  const rankingRules = await rankingRulesResponse.json() as import('./hltv/top20').Top20Rules;
  const simulationRulesResponse = await fetch('assets/top20/simulation-rules.json').catch(() => null);
  if (!simulationRulesResponse?.ok) throw new Error('Unable to load required TOP20 simulation rules.');
  const simulationRules = await simulationRulesResponse.json() as BrowserTop20SimulationRules;
  if (!isValidTop20SimulationRules(simulationRules)) throw new Error('TOP20 simulation rules are invalid.');
  const realPlayersResponse = await fetch('assets/top20/real-players.json').catch(() => null);
  const realPlayersPayload = realPlayersResponse && realPlayersResponse.ok ? await realPlayersResponse.json() as { readonly players: readonly Top20IdentityRecord[] } : { players: [] };
  for (const identity of realPlayersPayload.players) identityMap.set(identity.playerId, { ...identity, source: 'REAL' });
  const virtualPlayersResponse = await fetch('assets/top20/virtual-players.json').catch(() => null);
  const virtualPlayersPayload = virtualPlayersResponse && virtualPlayersResponse.ok ? await virtualPlayersResponse.json() as { readonly players: readonly Top20IdentityRecord[] } : { players: [] };
  for (const identity of virtualPlayersPayload.players) identityMap.set(identity.playerId, { ...identity, source: 'VIRTUAL' });
  const realRosterTeamIds = new Set(rosterByTeam.keys());
  const npcPlayers: readonly NpcPlayerProfile[] = virtualPlayersPayload.players.filter((identity) => !identity.teamId || !realRosterTeamIds.has(identity.teamId)).map((identity, index) => ({ id: identity.playerId, nickname: identity.nickname, countryCode: identity.countryCode, originRegion: identity.countryCode === 'China' ? 'ASIA' as const : identity.countryCode === 'Brazil' || identity.countryCode === 'United States' || identity.countryCode === 'Canada' ? 'AMERICAS' as const : identity.countryCode === 'Australia' ? 'OCEANIA' as const : 'EUROPE' as const, age: 18 + index % 10, role: (['AWPER', 'ENTRY_FRAGGER', 'IGL', 'SUPPORT', 'LURKER'] as const)[index % 5]!, attributes: { aim: 62 + index % 18, gameSense: 60 + index % 16, leadership: 48 + index % 20, clutch: 58 + index % 17, consistency: 60 + index % 15, teamConflict: 12 + index % 15 }, career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: identity.teamId ? [identity.teamId] : [] }, flags: [], currentTeamId: identity.teamId ?? null, availability: identity.teamId ? 'SIGNED' as const : 'AVAILABLE' as const, origin: 'GENERATED_ACADEMY' as const, generationSeed: index + 1 }));
  const currentEnvelope = await stateRepository.load(config.gameId);
  if (currentEnvelope && currentEnvelope.state.npcPlayers.length === 0) await stateRepository.save(config.gameId, { ...currentEnvelope, state: { ...currentEnvelope.state, npcPlayers } });
  const npcEvidenceResponse = await fetch('assets/top20/npc-season-evidence.json').catch(() => null);
  const npcEvidencePayload = npcEvidenceResponse && npcEvidenceResponse.ok ? await npcEvidenceResponse.json() as { readonly season: number; readonly players: readonly { readonly playerId: string; readonly maps: number; readonly titles?: readonly string[]; readonly rating: number; readonly playoffRating: number; readonly top5Rating: number; readonly finalRating: number; readonly honors: readonly { readonly type: 'MVP' | 'EVP' | 'VP'; readonly honorClass: import('./hltv/tournament').HonorClass }[] }[] } : { season: 2026, players: [] };
  const npcSeasonEvidence: readonly Top20SeasonEvidence[] = npcEvidencePayload.players.flatMap((entry) => {
    const identity = identityMap.get(entry.playerId);
    if (!identity) return [];
    const eventName = entry.titles?.[0] ?? `${npcEvidencePayload.season} 年度赛事样本`;
    return [{ season: npcEvidencePayload.season, player: { playerId: identity.playerId, nickname: identity.nickname, countryCode: identity.countryCode, teamName: identity.teamName ?? identity.teamId ?? 'Free Agent', careerPlayer: false, source: identity.source }, tournaments: [{ eventId: `npc-season-${npcEvidencePayload.season}-${entry.playerId}`, eventName, tier: 'T1' as const, maps: entry.maps, rating: entry.rating, adr: 43 + entry.rating * 31, kast: 48 + entry.rating * 19, playoffMaps: Math.max(10, Math.round(entry.maps * 0.3)), playoffRating: entry.playoffRating, top5Maps: Math.max(8, Math.round(entry.maps * 0.2)), top5Rating: entry.top5Rating, finalMaps: Math.max(3, Math.round(entry.maps * 0.08)), finalRating: entry.finalRating, title: Boolean(entry.titles?.length), honors: entry.honors.map((honor, index) => ({ ...honor, eventId: `npc-honor-${npcEvidencePayload.season}-${entry.playerId}-${index}`, eventName, tier: 'T1' as const })), majorPlayoffChoke: false }] }];
  });
  const teamNames = new Map((standingsPayload?.teams ?? []).map((team) => [team.id, team.name]));
  const latestEnvelope = await stateRepository.load(config.gameId);
  const quotesResponse = await fetch('assets/top20_quotes/quotes.json').catch(() => null);
  const quotes = quotesResponse && quotesResponse.ok ? await quotesResponse.json() as import('./hltv/top20-quotes').Top20QuoteAsset : null;
  const gateway = new BrowserGateway(player, identityMap, rankingRules, teamNames, npcSeasonEvidence, simulationRules, quotes);
  for (const result of latestEnvelope?.state.tournamentResults ?? []) {
    await gateway.append({ type: 'TOURNAMENT_COMPLETED', occurredAt: latestEnvelope?.state.currentDate ?? new Date().toISOString(), result });
  }
  const tournaments = new TournamentServiceImpl({
    playerId: config.gameId,
    random,
    clock,
    balance: balanceConfig.rating,
    matches: new MatchSimulationServiceImpl(balanceConfig.rating),
    teamRoster: async (teamId) => {
      const dynamic = (await stateRepository.load(config.gameId))?.state.npcPlayers.filter((npc) => npc.currentTeamId === teamId && npc.availability !== 'RETIRED').map((npc) => ({ playerId: npc.id, role: npc.role, active: true })) ?? [];
      const staticRoster = rosterByTeam.get(teamId) ?? [];
      if (!dynamic.length) return staticRoster;
      const dynamicIds = new Set(dynamic.map((slot) => slot.playerId));
      const vacancies = Math.max(0, 5 - dynamic.length);
      return [...dynamic, ...staticRoster.filter((slot) => !dynamicIds.has(slot.playerId)).slice(0, vacancies)];
    },
    facts: gateway,
    playerSnapshot: async (playerId, teamId) => {
      if (playerId === player.id) {
        const latest = (await stateRepository.load(config.gameId))?.state.player ?? player;
        return { playerId, teamId, nickname: latest.gameId, role: latest.role, ...latest.attributes, morale: latest.morale, energy: latest.energy, age: latest.age };
      }
      const rosterSlot = rosterByTeam.get(teamId)?.find((candidate) => candidate.playerId === playerId);
      const npc = (await stateRepository.load(config.gameId))?.state.npcPlayers.find((candidate) => candidate.id === playerId);
      const role = npc?.role ?? (rosterSlot?.role === 'IGL' || rosterSlot?.role === 'AWPER' || rosterSlot?.role === 'ENTRY_FRAGGER' || rosterSlot?.role === 'SUPPORT' || rosterSlot?.role === 'LURKER' ? rosterSlot.role : 'SUPPORT');
      return npc
        ? { playerId, teamId, nickname: npc.nickname, role, ...npc.attributes, morale: 65, energy: 70, age: npc.age }
        : { playerId, teamId, nickname: identityMap.get(playerId)?.nickname ?? playerId, role, aim: 68, gameSense: 66, leadership: role === 'IGL' ? 78 : 58, clutch: 64, consistency: 66, teamConflict: 20, morale: 65, energy: 70, age: 23 };
    },
    calendarReader: async () => {
      const response = await fetch('assets/tournaments/calendar.json').catch(() => null);
      if (!response || !response.ok) return null;
      return await response.json() as import('./hltv/tournament-service-impl').TournamentCalendarAsset;
    },
  });
  gateway.bindInterventionSink(async (intervention) => tournaments.applyIntervention(intervention));
  const triggerRules = new AssetEventTriggerRuleRepository(async () => {
    const response = await fetch('assets/story/trigger-rules.json').catch(() => null);
    if (!response || !response.ok) return null;
    return response.json() as Promise<import('./engine/impl/event-trigger-service').EventTriggerRuleAsset>;
  }, storyRepository);
  const triggers: EventTriggerService = new EventTriggerServiceImpl(triggerRules, new ConditionEvaluatorImpl());
  const summaryUiResponse = await fetch('assets/career/summary-ui.json').catch(() => null);
  const summaryUi = summaryUiResponse && summaryUiResponse.ok ? await summaryUiResponse.json() as { readonly grades?: readonly { readonly grade: 'S' | 'A' | 'B' | 'C' | 'D'; readonly minimumRating: number }[] } : null;
  const gradeRules = summaryUi?.grades?.length ? summaryUi.grades : undefined;
  const retirementSummary: RetirementSummaryService = gradeRules
    ? { generate: async (input) => new RetirementSummaryServiceImpl().generate({ ...input, gradeRules }) }
    : new RetirementSummaryServiceImpl();
  const dependencies: CareerGameDependencies = {
    playerId: config.gameId, difficultyMode: config.mode, hltv: gateway, progression,
    dailyActions, economy: new BrowserEconomyService(), triggers, retirement: new RetirementServiceImpl(), retirementSummary, stateRepository,
  };
  const npcGeneration = new NpcGenerationServiceImpl([], 0x9e3779b9);
  const npcGenerationProfiles: readonly NpcGenerationProfile[] = [
    { origin: 'GENERATED_ACADEMY', countryPool: ['Denmark', 'Sweden', 'Poland', 'China', 'Brazil', 'United States'], region: 'EUROPE', ageRange: [16, 20], roleWeights: { AWPER: 1, ENTRY_FRAGGER: 1, IGL: 1, SUPPORT: 1, LURKER: 1 }, attributeRange: { aim: [58, 78], gameSense: [56, 76], consistency: [55, 75] }, talentLevel: 'ACADEMY' },
    { origin: 'GENERATED_PUG_STAR', countryPool: ['China', 'Brazil', 'Australia', 'United States'], region: 'ASIA', ageRange: [17, 22], roleWeights: { AWPER: 1, ENTRY_FRAGGER: 2, SUPPORT: 1, LURKER: 1 }, attributeRange: { aim: [62, 82], clutch: [58, 78] }, talentLevel: 'REGIONAL_STAR' },
  ];
  const transferMarket = new NpcTransferMarketServiceImpl();
  const transferMarketTeamIds = [...new Set(npcPlayers.map((npc) => npc.currentTeamId).filter((teamId): teamId is string => Boolean(teamId)))];
  const vrsRulesResponse = await fetch('assets/teams/vrs-projection-rules.json').catch(() => null);
  if (!vrsRulesResponse?.ok) throw new Error('Unable to load required VRS projection rules.');
  const vrsResultProjector = new VrsResultProjector(await vrsRulesResponse.json() as VrsResultProjectionRules);
  const vrsSaveVersion = (await stateRepository.load(config.gameId))?.state.vrsProjectionRulesVersion;
  if (vrsSaveVersion && vrsSaveVersion !== vrsResultProjector.rulesVersion) throw new Error(`VRS projection rules version mismatch: save=${vrsSaveVersion}, runtime=${vrsResultProjector.rulesVersion}.`);
  const factory = new CareerGameFactoryImpl(storyReader, {
    progressionRules, dailyActions, tournaments, clock, random, transferTargets, npcGeneration, npcGenerationProfiles, transferMarket, transferMarketTeamIds, vrsResultProjector, narrative: balanceConfig.narrative, economy: new BrowserEconomyService(), economyRules: new BrowserEconomyRuleRepository(balanceConfig), naturalRetirementAge: balanceConfig.retirement?.naturalRetirementAge ?? 40,
      teamTier: (teamId) => teamTiers.get(teamId),
      vrsSnapshot: async ({ season, half }): Promise<VrsInviteSnapshot> => {
      const response = await fetch('assets/teams/teams.json').catch(() => null);
      const payload = response && response.ok ? await response.json() as { readonly teams: readonly { readonly id: string; readonly standings: { readonly bestRank: number; readonly bestPoints: number } | null }[] } : null;
      const observedAt = clock.now();
      const latestState = (await stateRepository.load(config.gameId))?.state;
      const adjustments = latestState?.vrsPointsByTeam ?? {};
      const baseEntries = (payload?.teams ?? []).filter((team) => team.standings).map((team) => ({ teamId: team.id, points: Math.max(0, team.standings!.bestPoints + (adjustments[team.id] ?? 0)), source: 'VRS' as const }));
      const knownIds = new Set(baseEntries.map((entry) => entry.teamId));
      const virtualTeamIds = (latestState?.npcPlayers ?? []).map((npc) => npc.currentTeamId).filter((teamId): teamId is string => teamId !== null && !knownIds.has(teamId));
      const virtualEntries = [...new Set(virtualTeamIds)].map((teamId, index) => ({ teamId, points: Math.max(0, 620 - index * 18 + (adjustments[teamId] ?? 0)), source: 'SIMULATION' as const }));
      const ranked = [...baseEntries, ...virtualEntries].sort((left, right) => right.points - left.points || left.teamId.localeCompare(right.teamId)).map((entry, index) => ({ ...entry, rank: index + 1, snapshotRank: index + 1, observedAt }));
      return { id: `browser-vrs-${config.gameId}-${season}-h${half}`, season, half, frozenAt: observedAt, sourceRankingId: `local-vrs-${season}-h${half}`, rulesVersion: `${vrsResultProjector.rulesVersion}+snapshot-v1`, entries: ranked };
    },
  });
  const game = await factory.create(dependencies) as CareerGameImpl;
  currentGame = game as BrowserCareerGame;
  currentGateway = gateway;
  currentRandomSeed = seed;
  return game as BrowserCareerGame;
}

export async function initCareerGame(config: BrowserCareerConfig): Promise<BrowserCareerGame> {
  const existing = await browserStateRepository().load(config.gameId);
  return composeCareerGame(config, existing);
}

async function loadCareerGame(slotId: string): Promise<BrowserCareerGame> {
  const envelope = await browserStateRepository().load(slotId);
  if (!envelope) throw new Error(`Career save not found: ${slotId}.`);
  const roleByPlayerRole: Readonly<Record<PlayerRole, BrowserCareerConfig['role']>> = { ENTRY_FRAGGER: 'ENTRY', AWPER: 'AWP', IGL: 'IGL', SUPPORT: 'SUPPORT', LURKER: 'LURK' };
  return composeCareerGame({ gameId: slotId, realName: envelope.state.player.nationality, randomSeed: envelope.state.randomSeed ?? slotId, role: roleByPlayerRole[envelope.state.player.role], region: envelope.state.player.originRegion, mode: envelope.state.player.difficultyMode }, envelope);
}

async function restartCareerGame(config: BrowserCareerConfig): Promise<BrowserCareerGame> {
  const repository = browserStateRepository();
  const backup = await repository.load(config.gameId);
  if (!backup) throw new Error(`Career save not found: ${config.gameId}.`);
  const generation = supersedeSession(config.gameId);
  await repository.delete(config.gameId);
  currentGame = null;
  currentGateway = null;
  try {
    return await composeCareerGame(config, null, generation);
  } catch (error) {
    const restoredGeneration = supersedeSession(config.gameId);
    await repository.save(config.gameId, backup);
    await composeCareerGame(config, backup, restoredGeneration).catch(() => undefined);
    throw error;
  }
}

async function deleteCareerGame(slotId: string): Promise<void> {
  await browserStateRepository().delete(slotId);
  if ((await currentGame?.getProfile())?.id === slotId) { currentGame = null; currentGateway = null; currentRandomSeed = null; }
}

function requireGame(): BrowserCareerGame {
  if (!currentGame) throw new Error('Create a career before using the engine.');
  return currentGame;
}
function requireGateway(): EngineHltvGateway {
  if (!currentGateway) throw new Error('Create a career before using HLTV data.');
  return currentGateway;
}

declare global { interface Window { COPEEngine: { createGame(config: BrowserCareerConfig): Promise<BrowserCareerGame>; restartGame(config: BrowserCareerConfig): Promise<BrowserCareerGame>; loadGame(slotId: string): Promise<BrowserCareerGame>; listGames(): Promise<readonly string[]>; deleteGame(slotId: string): Promise<void>; getRandomSeed(): string; getProfile(): Promise<PlayerProfile>; getTournamentSummary(): ReturnType<CareerGame['getTournamentSummary']>; startSeason(): ReturnType<CareerGame['startSeason']>; getNextTournament(): ReturnType<CareerGame['getNextTournament']>; getVrsStatus(): ReturnType<CareerGame['getVrsStatus']>; listDailyActions(period: DailyActionDefinition['allowedPeriods'][number]): ReturnType<CareerGame['listDailyActions']>; executeDailyAction(actionId: string, randomRoll?: number): ReturnType<CareerGame['executeDailyAction']>; listStandInOffers(): Promise<readonly TournamentStandInOffer[]>; respondStandInOffer(offerId: string, response: 'ACCEPT' | 'REJECT' | 'WAIT'): ReturnType<CareerGame['respondStandInOffer']>; acceptStandInOffer(offerId: string): Promise<TournamentStandInAssignment>; listTransferTargets(): Promise<readonly TransferTargetView[]>; selectTransferTarget(teamId: string): ReturnType<CareerGame['selectTransferTarget']>; advanceTournament(input?: { readonly mode?: import('./engine/game').CareerTournamentAdvanceMode }): ReturnType<CareerGame['advanceTournament']>; finishSeason(): ReturnType<CareerGame['finishSeason']>; findTop20(season: number): Promise<Top20Ranking>; findCareerEvent(window: CareerEventWindow): ReturnType<CareerGame['findCareerEvent']>; advancePeriod(period: EventPeriod, randomRoll?: number): Promise<PlayerProfile>; getAvailableEvents(period: EventPeriod, randomRoll?: number): Promise<readonly StoryEvent[]>; chooseOption(decision: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): ReturnType<CareerGame['chooseStoryOption']>; retire(reason?: string): Promise<PlayerProfile>; generateRetirementSummary(): ReturnType<CareerGame['generateRetirementSummary']>; }; } }

window.COPEEngine = {
  createGame: initCareerGame,
  restartGame: restartCareerGame,
  loadGame: loadCareerGame,
  listGames: () => browserStateRepository().listSlots(),
  deleteGame: deleteCareerGame,
  getRandomSeed: () => { if (!currentRandomSeed) throw new Error('Create a career before reading its seed.'); return currentRandomSeed; },
  getProfile: () => requireGame().getProfile(),
  getTournamentSummary: () => requireGame().getTournamentSummary(),
  startSeason: () => requireGame().startSeason(),
  getNextTournament: () => requireGame().getNextTournament(),
  getVrsStatus: () => requireGame().getVrsStatus(),
  listDailyActions: (period) => requireGame().listDailyActions(period),
  executeDailyAction: (actionId, randomRoll = 0.5) => requireGame().executeDailyAction(actionId, randomRoll),
  listStandInOffers: () => requireGame().listStandInOffers(),
  respondStandInOffer: (offerId, response) => requireGame().respondStandInOffer(offerId, response),
  acceptStandInOffer: (offerId) => requireGame().acceptStandInOffer(offerId),
  listTransferTargets: () => requireGame().listTransferTargets(),
  selectTransferTarget: (teamId) => requireGame().selectTransferTarget(teamId),
  advanceTournament: (input) => requireGame().advanceTournament(input),
  finishSeason: () => requireGame().finishSeason(),
  findTop20: (season) => requireGateway().findTop20(season),
  findCareerEvent: (window) => requireGame().findCareerEvent(window),
  advancePeriod: (period, randomRoll = 0.5) => requireGame().advancePeriod({ period, randomRoll }),
  getAvailableEvents: (period, randomRoll = 0.5) => requireGame().findAvailableStoryEvents({ period, randomRoll }),
  chooseOption: (decision) => requireGame().chooseStoryOption(decision),
  retire: (reason) => requireGame().retire(reason),
  generateRetirementSummary: () => requireGame().generateRetirementSummary(),
};


