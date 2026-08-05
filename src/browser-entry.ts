import type { DailyActionDefinition, DailyActionRepository } from './engine/daily-action';
import type { EconomyTickService, EconomyTickResult } from './engine/economy';
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
import { ConditionEvaluatorImpl } from './engine/impl/condition-evaluator';
import { SaveContractService } from './engine/impl/contract-service';
import { AssetEventTriggerRuleRepository, EventTriggerServiceImpl } from './engine/impl/event-trigger-service';
import { CareerGameImpl, CareerGameRuntimeServices } from './engine/impl/career-game';
import { InMemoryStateRepository } from './engine/impl/in-memory-state-repository';
import { PlayerProgressionServiceImpl } from './engine/impl/player-progression-service';
import { RetirementSummaryServiceImpl } from './engine/impl/retirement-summary-service';
import { StoryEngineImpl } from './engine/impl/story-engine';
import { StoryEventPackReader, StoryRepositoryImpl } from './engine/impl/story-repository';

export interface BrowserCareerConfig {
  readonly gameId: string;
  readonly realName: string;
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
      findTop20: (season) => hltv.top20Evidence.findSeasonEvidence(season).then((evidence) => hltv.top20.calculate({ season, rules: { version: 'v3-reference-aps', minimumT1MajorMaps: 40, honorBaseScore: { MVP: 800, EVP: 320, VP: 96 }, honorClassMultiplier: { NONE: 0.25, MEDIUM: 0.7, LARGE: 1, ELITE: 1.1, SUPER_ELITE: 1.3, MAJOR: 1.5 } }, evidence })),
      synchronizeCareerHonors: async (profile, ranking) => ranking.careerPlayerRank ? { ...profile, trophies: { ...profile.trophies, top20Records: [...profile.trophies.top20Records.filter((record) => record.year !== ranking.season), { year: ranking.season, rank: ranking.careerPlayerRank }] } } : profile,
    };
  }
}

class BrowserClock {
  public now(): string { return new Date().toISOString(); }
}

class BrowserRandomSource {
  private state: number;
  public constructor(seed: string) { this.state = [...seed].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261); }
  public next(): number { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 0x100000000; }
}

type BrowserTop20SimulationRules = {
  readonly realPlayerDecay: {
    readonly careerDeclinePerYear: number;
    readonly careerDeclineCap: number;
    readonly minimumMultiplier: number;
  };
};

class BrowserGateway implements EngineHltvGateway, TournamentFactRepository, Top20EvidenceRepository {
  private readonly interventions = new Map<string, TournamentIntervention>();
  private readonly evidence = new Map<number, Map<string, Top20SeasonEvidence>>();
  private readonly completedTournamentIds = new Set<string>();
  private readonly top20 = new Top20RankingServiceImpl();
  public constructor(
    private readonly careerPlayer: PlayerProfile,
    private readonly identities: ReadonlyMap<string, Top20IdentityRecord>,
    private readonly rankingRules: import('./hltv/top20').Top20Rules,
    private readonly teamNames: ReadonlyMap<string, string> = new Map(),
    initialEvidence: readonly Top20SeasonEvidence[] = [],
    private readonly simulationRules?: BrowserTop20SimulationRules,
  ) {
    for (const entry of initialEvidence) {
      const seasonEvidence = this.evidence.get(entry.season) ?? new Map<string, Top20SeasonEvidence>();
      seasonEvidence.set(entry.player.playerId, JSON.parse(JSON.stringify(entry)) as Top20SeasonEvidence);
      this.evidence.set(entry.season, seasonEvidence);
    }
  }
  public async freezeVrsSnapshot(input: { readonly season: number; readonly half: 1 | 2 }): Promise<string> { return `browser-vrs-${input.season}-h${input.half}`; }
  public async applyTournamentIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact> { this.interventions.set(intervention.id, { ...intervention }); return { type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: intervention.occurredAt, intervention: { ...intervention } }; }
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
    const baselineSeason = Math.min(...this.evidence.keys());
    const baseline = this.evidence.get(baselineSeason);
    if (!baseline || !Number.isFinite(baselineSeason) || season === baselineSeason) return;
    const years = Math.max(0, season - baselineSeason);
    const decay = this.simulationRules?.realPlayerDecay;
    const multiplier = Math.max(decay?.minimumMultiplier ?? 0.55, 1 - Math.min(decay?.careerDeclineCap ?? 0.12, years * (decay?.careerDeclinePerYear ?? 0.012)));
    const projected = new Map<string, Top20SeasonEvidence>(this.evidence.get(season) ?? []);
    for (const entry of baseline.values()) {
      if (entry.player.careerPlayer) continue;
      const tournaments = entry.tournaments.map((event) => ({ ...event, eventId: `${event.eventId}-${season}`, eventName: event.eventName.replace(String(baselineSeason), String(season)), rating: Math.max(0.8, event.rating * multiplier), playoffRating: Math.max(0.8, event.playoffRating * multiplier), top5Rating: Math.max(0.8, event.top5Rating * multiplier), finalRating: event.finalRating === null ? null : Math.max(0.8, event.finalRating * multiplier), honors: event.honors.map((honor) => ({ ...honor, eventId: `${honor.eventId}-${season}`, eventName: honor.eventName.replace(String(baselineSeason), String(season)) })) }));
      if (!projected.has(entry.player.playerId)) projected.set(entry.player.playerId, { ...entry, season, tournaments });
    }
    this.evidence.set(season, projected);
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
    return this.top20.calculate({ season, rules: this.rankingRules, evidence: [...byPlayer.values()] });
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

const ROLE_ATTRIBUTES: Readonly<Record<BrowserCareerConfig['role'], PlayerProfile['attributes']>> = {
  ENTRY: { aim: 68, gameSense: 54, leadership: 42, clutch: 55, consistency: 52, teamConflict: 24 },
  AWP: { aim: 65, gameSense: 57, leadership: 43, clutch: 61, consistency: 53, teamConflict: 23 },
  IGL: { aim: 52, gameSense: 69, leadership: 68, clutch: 54, consistency: 55, teamConflict: 20 },
  SUPPORT: { aim: 53, gameSense: 63, leadership: 50, clutch: 52, consistency: 62, teamConflict: 18 },
  LURK: { aim: 61, gameSense: 65, leadership: 45, clutch: 64, consistency: 56, teamConflict: 21 },
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

function createBaseProfile(config: BrowserCareerConfig): PlayerProfile {
  return {
    id: config.gameId as HltvPlayerId, gameId: config.gameId, nationality: config.realName, difficultyMode: config.mode, isRetired: false,
    tournamentArchive: [], originRegion: config.region, age: 16, currentTeamId: null, currentContractId: null, role: ROLE_MAP[config.role],
    attributes: { ...ROLE_ATTRIBUTES[config.role] },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

let currentGame: BrowserCareerGame | null = null;
let currentGateway: EngineHltvGateway | null = null;

export async function initCareerGame(config: BrowserCareerConfig): Promise<BrowserCareerGame> {
  if (!config.gameId.trim()) throw new Error('Game ID is required.');
  const stateRepository = InMemoryStateRepository.getInstance();
  await stateRepository.delete(config.gameId);
  const progression = new PlayerProgressionServiceImpl(progressionRules);
  const unsignedPlayer = await progression.createProfile({ profile: createBaseProfile(config), difficultyMode: config.mode, originRule: ORIGIN_RULES[config.region], modeRule: MODE_RULES[config.mode] });
  const clock = new BrowserClock();
  const random = new BrowserRandomSource(config.gameId);
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
  const startingTeam = [...candidates].sort((left, right) => left.teamId.localeCompare(right.teamId))[Math.floor(random.next() * Math.max(1, candidates.length))];
  if (!startingTeam) throw new Error(`No VRS 100+ starting team is configured for ${config.region}.`);
  const startedAt = '2026-01-01T00:00:00.000Z';
  const endsAt = new Date(startedAt); endsAt.setUTCMonth(endsAt.getUTCMonth() + (startingTeam.contractLengthMonths ?? 12));
  const contracts = new SaveContractService([], new ConditionEvaluatorImpl(), (candidate) => ({ player: candidate, currentTeamId: candidate.currentTeamId, opponentTeamId: null, randomRoll: 0, difficultyMode: candidate.difficultyMode }), (teamId) => teamTiers.get(teamId));
  const signed = await contracts.sign({ profile: unsignedPlayer, terms: { teamId: startingTeam.teamId, startedAt, endsAt: endsAt.toISOString(), salaryPerMonth: startingTeam.monthlySalary, buyoutAmount: startingTeam.buyoutAmount ?? 0, role: startingTeam.startingRole ?? 'STARTER', expectedPlaytimePercentage: startingTeam.expectedPlaytimePercentage ?? 75 }, occurredAt: startedAt });
  if (!('contract' in signed) || 'reason' in signed) throw new Error(`Unable to create initial T3 contract for ${startingTeam.teamId}.`);
  const player = signed.profile;
  const state: CareerSaveEnvelope = {
    format: 'COPE_CAREER_SAVE', version: 1,
    state: { schemaVersion: 1, savedAt: new Date().toISOString(), currentDate: startedAt, season: 2026, careerHalf: 1, player, contracts: contracts.snapshot, npcPlayers: [], worldlines: [], currentStoryEventId: 'rookie-team-entry', completedEventIds: [], seasonNarrativeEventCount: 0, pendingSystemEvents: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null, activeTournamentState: null },
  };
  await stateRepository.save(config.gameId, state);
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
  const simulationRules = simulationRulesResponse && simulationRulesResponse.ok ? await simulationRulesResponse.json() as BrowserTop20SimulationRules : undefined;
  const realPlayersResponse = await fetch('assets/top20/real-players.json').catch(() => null);
  const realPlayersPayload = realPlayersResponse && realPlayersResponse.ok ? await realPlayersResponse.json() as { readonly players: readonly Top20IdentityRecord[] } : { players: [] };
  for (const identity of realPlayersPayload.players) identityMap.set(identity.playerId, identity);
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
  const gateway = new BrowserGateway(player, identityMap, rankingRules, teamNames, npcSeasonEvidence, simulationRules);
  const tournaments = new TournamentServiceImpl({
    playerId: config.gameId,
    random,
    clock,
    matches: new MatchSimulationServiceImpl(),
    teamRoster: (teamId) => rosterByTeam.get(teamId) ?? [],
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
  const storyReader = new BrowserStoryEventPackReader();
  const storyRepository = new StoryRepositoryImpl(storyReader);
  const triggerRules = new AssetEventTriggerRuleRepository(async () => {
    const response = await fetch('assets/story/trigger-rules.json').catch(() => null);
    if (!response || !response.ok) return null;
    return response.json() as Promise<import('./engine/impl/event-trigger-service').EventTriggerRuleAsset>;
  }, storyRepository);
  const triggers: EventTriggerService = new EventTriggerServiceImpl(triggerRules, new ConditionEvaluatorImpl());
  const dependencies: CareerGameDependencies = {
    playerId: config.gameId, difficultyMode: config.mode, hltv: gateway, progression,
    dailyActions, economy: new BrowserEconomyService(), triggers, retirement: new RetirementServiceImpl(), retirementSummary: new RetirementSummaryServiceImpl(), stateRepository,
  };
  const npcGeneration = new NpcGenerationServiceImpl([], 0x9e3779b9);
  const npcGenerationProfiles: readonly NpcGenerationProfile[] = [
    { origin: 'GENERATED_ACADEMY', countryPool: ['Denmark', 'Sweden', 'Poland', 'China', 'Brazil', 'United States'], region: 'EUROPE', ageRange: [16, 20], roleWeights: { AWPER: 1, ENTRY_FRAGGER: 1, IGL: 1, SUPPORT: 1, LURKER: 1 }, attributeRange: { aim: [58, 78], gameSense: [56, 76], consistency: [55, 75] }, talentLevel: 'ACADEMY' },
    { origin: 'GENERATED_PUG_STAR', countryPool: ['China', 'Brazil', 'Australia', 'United States'], region: 'ASIA', ageRange: [17, 22], roleWeights: { AWPER: 1, ENTRY_FRAGGER: 2, SUPPORT: 1, LURKER: 1 }, attributeRange: { aim: [62, 82], clutch: [58, 78] }, talentLevel: 'REGIONAL_STAR' },
  ];
  const transferMarket = new NpcTransferMarketServiceImpl();
  const transferMarketTeamIds = [...new Set(npcPlayers.map((npc) => npc.currentTeamId).filter((teamId): teamId is string => Boolean(teamId)))];
  const factory = new CareerGameFactoryImpl(storyReader, {
    progressionRules, dailyActions, tournaments, clock, random, transferTargets, npcGeneration, npcGenerationProfiles, transferMarket, transferMarketTeamIds,
      teamTier: (teamId) => teamTiers.get(teamId),
      vrsSnapshot: async ({ season, half }): Promise<VrsInviteSnapshot> => {
      const response = await fetch('assets/teams/teams.json').catch(() => null);
      const payload = response && response.ok ? await response.json() as { readonly teams: readonly { readonly id: string; readonly standings: { readonly bestRank: number; readonly bestPoints: number } | null }[] } : null;
      const observedAt = clock.now();
      const latestState = (await stateRepository.load(config.gameId))?.state;
      const playerTeamId = latestState?.player.currentTeamId ?? null;
      const playerTeamBonus = latestState?.player.tournamentArchive.reduce((sum, record) => sum + (record.champion ? record.level === 'MAJOR' ? 220 : record.level === 'T1' ? 140 : 60 : Math.max(8, Math.round(record.rating * 12))), 0) ?? 0;
      const baseEntries = (payload?.teams ?? []).filter((team) => team.standings).map((team) => ({ teamId: team.id, points: team.standings!.bestPoints + (team.id === playerTeamId ? playerTeamBonus : 0), source: 'VRS' as const }));
      const knownIds = new Set(baseEntries.map((entry) => entry.teamId));
      const virtualEntries = [...new Set((latestState?.npcPlayers ?? []).map((npc) => npc.currentTeamId).filter((teamId): teamId is string => Boolean(teamId) && !knownIds.has(teamId)))].map((teamId, index) => ({ teamId, points: Math.max(80, 620 - index * 18), source: 'SIMULATION' as const }));
      const ranked = [...baseEntries, ...virtualEntries].sort((left, right) => right.points - left.points || left.teamId.localeCompare(right.teamId)).map((entry, index) => ({ ...entry, rank: index + 1, snapshotRank: index + 1, observedAt }));
      return { id: `browser-vrs-${config.gameId}-${season}-h${half}`, season, half, frozenAt: observedAt, sourceRankingId: `local-vrs-${season}-h${half}`, rulesVersion: 'local-vrs-v1', entries: ranked };
    },
  });
  const game = await factory.create(dependencies) as CareerGameImpl;
  currentGame = game as BrowserCareerGame;
  currentGateway = gateway;
  return game as BrowserCareerGame;
}

function requireGame(): BrowserCareerGame {
  if (!currentGame) throw new Error('Create a career before using the engine.');
  return currentGame;
}
function requireGateway(): EngineHltvGateway {
  if (!currentGateway) throw new Error('Create a career before using HLTV data.');
  return currentGateway;
}

declare global { interface Window { COPEEngine: { createGame(config: BrowserCareerConfig): Promise<BrowserCareerGame>; getProfile(): Promise<PlayerProfile>; startSeason(): ReturnType<CareerGame['startSeason']>; getNextTournament(): ReturnType<CareerGame['getNextTournament']>; getVrsStatus(): ReturnType<CareerGame['getVrsStatus']>; listStandInOffers(): Promise<readonly TournamentStandInOffer[]>; respondStandInOffer(offerId: string, response: 'ACCEPT' | 'REJECT' | 'WAIT'): ReturnType<CareerGame['respondStandInOffer']>; acceptStandInOffer(offerId: string): Promise<TournamentStandInAssignment>; listTransferTargets(): Promise<readonly TransferTargetView[]>; selectTransferTarget(teamId: string): ReturnType<CareerGame['selectTransferTarget']>; advanceTournament(input?: { readonly mode?: import('./engine/game').CareerTournamentAdvanceMode }): ReturnType<CareerGame['advanceTournament']>; finishSeason(): ReturnType<CareerGame['finishSeason']>; findTop20(season: number): Promise<Top20Ranking>; findCareerEvent(window: CareerEventWindow): ReturnType<CareerGame['findCareerEvent']>; advancePeriod(period: EventPeriod, randomRoll?: number): Promise<PlayerProfile>; getAvailableEvents(period: EventPeriod, randomRoll?: number): Promise<readonly StoryEvent[]>; chooseOption(decision: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): ReturnType<CareerGame['chooseStoryOption']>; retire(reason?: string): Promise<PlayerProfile>; generateRetirementSummary(): ReturnType<CareerGame['generateRetirementSummary']>; }; } }

window.COPEEngine = {
  createGame: initCareerGame,
  getProfile: () => requireGame().getProfile(),
  startSeason: () => requireGame().startSeason(),
  getNextTournament: () => requireGame().getNextTournament(),
  getVrsStatus: () => requireGame().getVrsStatus(),
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


