import type { DailyActionDefinition, DailyActionRepository } from './engine/daily-action';
import type { EconomyTickService, EconomyTickResult } from './engine/economy';
import type { EventTriggerService, TriggeredEvent } from './engine/event-trigger';
import type { CareerGame, CareerGameDependencies, CareerGameFactory } from './engine/game';
import type { EngineHltvGateway, EngineHltvGatewayFactory } from './engine/hltv-gateway';
import type { CareerEventWindow, EventPeriod, StoryEvent, StorySuccessChancePolicy, Worldline } from './engine/graph';
import type { GameDifficultyMode, GameModeRule } from './engine/mode';
import type { PlayerProfile, PlayerRole } from './engine/profile';
import type { AgePhase, AgeProgressionRule, PlayerProgressionRuleRepository, RegionOriginRule } from './engine/progression';
import type { CareerSaveEnvelope } from './engine/save-state';
import type { HltvModule } from './hltv/hltv-module';
import type { CompetitionRegion, HltvPlayerId, VrsInviteSnapshot } from './hltv/team';
import type { TournamentIntervention, TournamentInterventionAppliedFact, TournamentCompletedFact, TournamentResult } from './hltv/tournament';
import type { Top20IdentityRecord, Top20Ranking, Top20SeasonEvidence } from './hltv/top20';
import type { TransferTargetView } from './hltv/transfer-targets';
import { TransferTargetServiceImpl } from './hltv/transfer-target-service-impl';
import { Top20RankingServiceImpl } from './hltv/top20-ranking-service-impl';
import { DailyActionServiceImpl } from './engine/impl/daily-action-service';
import { RetirementServiceImpl } from './engine/impl/retirement-service';
import { TournamentServiceImpl } from './hltv/tournament-service-impl';
import { ConditionEvaluatorImpl } from './engine/impl/condition-evaluator';
import { CareerGameImpl, CareerGameRuntimeServices } from './engine/impl/career-game';
import { InMemoryStateRepository } from './engine/impl/in-memory-state-repository';
import { PlayerProgressionServiceImpl } from './engine/impl/player-progression-service';
import { RetirementSummaryServiceImpl } from './engine/impl/retirement-summary-service';
import { StoryEngineImpl } from './engine/impl/story-engine';
import { StoryEventPackReader, StoryRepositoryImpl } from './engine/impl/story-repository';

interface Top20SimulationRules {
  readonly honorPool: { readonly mvp: number; readonly evp: number; readonly vp: number };
  readonly virtualGeneration: { readonly baseProbability: number; readonly prodigyProbability: number; readonly prodigyPotential: number; readonly risingPotential: number; readonly baselinePotential: number; readonly annualDebutWindow: number };
  readonly realPlayerDecay: { readonly peakThroughAge: number; readonly gradualDeclineEndAge: number; readonly gradualDeclinePerYear: number; readonly veteranBaseMultiplier: number; readonly veteranDeclinePerYear: number; readonly careerGraceYears: number; readonly careerDeclinePerYear: number; readonly careerDeclineCap: number; readonly minimumMultiplier: number };
}

const DEFAULT_TOP20_SIMULATION_RULES: Top20SimulationRules = {
  honorPool: { mvp: 4, evp: 12, vp: 28 },
  virtualGeneration: { baseProbability: 0.55, prodigyProbability: 0.9, prodigyPotential: 0.99, risingPotential: 0.9, baselinePotential: 0.78, annualDebutWindow: 4 },
  realPlayerDecay: { peakThroughAge: 27, gradualDeclineEndAge: 30, gradualDeclinePerYear: 0.035, veteranBaseMultiplier: 0.895, veteranDeclinePerYear: 0.045, careerGraceYears: 4, careerDeclinePerYear: 0.012, careerDeclineCap: 0.12, minimumMultiplier: 0.55 },
};

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

class BrowserGateway implements EngineHltvGateway {
  private readonly interventions = new Map<string, TournamentIntervention>();
  private readonly evidence = new Map<number, Top20SeasonEvidence>();
  private readonly top20 = new Top20RankingServiceImpl();
  private readonly npcRankings = new Map<number, readonly Top20IdentityRecord[]>();
  public async freezeVrsSnapshot(input: { readonly season: number; readonly half: 1 | 2 }): Promise<string> { return `browser-vrs-${input.season}-h${input.half}`; }
  public async applyTournamentIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact> { this.interventions.set(intervention.id, { ...intervention }); return { type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: intervention.occurredAt, intervention: { ...intervention } }; }
  public async settleTournament(_fact: TournamentCompletedFact): Promise<void> {}
  public async recordTop20Evidence(input: { readonly result: TournamentResult; readonly player: PlayerProfile }): Promise<void> {
    if (input.result.tier !== 'T1' && input.result.tier !== 'MAJOR') return;
    const performance = input.result.playerPerformances.find((candidate) => candidate.playerId === input.player.id);
    if (!performance) return;
    const existing = this.evidence.get(input.result.season) ?? { season: input.result.season, player: { playerId: input.player.id, nickname: input.player.gameId, countryCode: input.player.originRegion, teamName: input.player.currentTeamId ?? '自由选手', careerPlayer: true, source: 'CAREER' as const }, tournaments: [] };
    const tournament = { eventId: input.result.editionId, eventName: input.result.eventName, tier: input.result.tier, maps: performance.maps, rating: performance.rating, adr: 70 + (performance.rating - 1) * 52, playoffMaps: performance.playoffMaps, playoffRating: performance.playoffRating, top5Maps: performance.top5Maps, top5Rating: performance.top5Rating, finalMaps: performance.finalMaps, finalRating: performance.finalRating, title: input.result.title, honors: performance.honor ? [{ type: performance.honor, honorClass: input.result.honorClass, eventId: input.result.editionId, eventName: input.result.eventName, tier: input.result.tier }] : [], majorPlayoffChoke: input.result.tier === 'MAJOR' && performance.playoffRating < 0.9 };
    this.evidence.set(input.result.season, { ...existing, tournaments: [...existing.tournaments.filter((candidate) => candidate.eventId !== tournament.eventId), tournament] });
  }
  public async findTop20(season: number): Promise<Top20Ranking> {
    const evidence = this.evidence.get(season);
    const npc = await this.loadNpcRanking(season);
    const npcEvidence = await this.loadNpcEvidence(season, npc);
    return this.top20.calculate({ season, rules: { version: 'browser-reference-aps-v2', minimumT1MajorMaps: 40, honorBaseScore: { MVP: 800, EVP: 320, VP: 96 }, honorClassMultiplier: { NONE: 0.25, MEDIUM: 0.7, LARGE: 1, ELITE: 1.1, SUPER_ELITE: 1.3, MAJOR: 1.5 } }, evidence: evidence ? [...npcEvidence, evidence] : npcEvidence });
  }

  private async loadNpcEvidence(season: number, identities: readonly Top20IdentityRecord[]): Promise<readonly Top20SeasonEvidence[]> {
    const baselineSeason = season === 2026;
    const response = baselineSeason ? await fetch('assets/top20/npc-season-evidence.json').catch(() => null) : null;
    const payload = response && response.ok ? await response.json() as { readonly season: number; readonly players: readonly { readonly playerId: string; readonly maps: number; readonly rating: number; readonly playoffRating: number; readonly top5Rating: number; readonly finalRating: number | null; readonly titles?: readonly string[]; readonly honors: readonly { readonly type: 'MVP' | 'EVP' | 'VP'; readonly honorClass: 'NONE' | 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE' | 'MAJOR' }[] }[] } : null;
    const historicalResponse = baselineSeason ? await fetch('assets/top20/historical-baseline.json').catch(() => null) : null;
    const historical = historicalResponse && historicalResponse.ok ? await historicalResponse.json() as { readonly seasons: Readonly<Record<string, readonly string[]>> } : null;
    const historicalNames = new Set(Object.values(historical?.seasons ?? {}).flat());
    const standingsResponse = baselineSeason ? await fetch('assets/teams/teams.json').catch(() => null) : null;
    const standings = standingsResponse && standingsResponse.ok ? await standingsResponse.json() as { readonly teams: readonly { readonly id: string; readonly standings: { readonly bestRank: number } | null }[] } : null;
    const rulesResponse = await fetch('assets/top20/simulation-rules.json').catch(() => null);
    const simulationRules = rulesResponse && rulesResponse.ok ? await rulesResponse.json() as Top20SimulationRules : DEFAULT_TOP20_SIMULATION_RULES;
    const ranks = new Map((standings?.teams ?? []).filter((team) => team.standings).map((team) => [team.id, team.standings!.bestRank]));
    const evidenceByPlayer = new Map((payload?.season === season ? payload.players : []).map((entry) => [entry.playerId, entry]));
    const annualHonors = this.allocateHonorPool(identities, season, evidenceByPlayer, simulationRules);
    return identities.map((entry, index) => {
      const source = evidenceByPlayer.get(entry.playerId);
      const tier = entry.teamTier ?? (entry.source === 'REAL' ? 'T1' : 'T2');
      const placement = entry.placement ?? index + 1;
      const age = this.simulatedAge(entry, season);
      const careerYears = Math.max(0, season - (entry.careerStartYear ?? (entry.source === 'REAL' ? 2018 : season - 1)));
      const isVeteran = entry.source === 'REAL' && careerYears >= 5;
      const isProdigy = entry.source === 'VIRTUAL' && careerYears <= 1;
      const ageDecay = entry.source === 'REAL' ? this.realPlayerDecay(age, careerYears, simulationRules.realPlayerDecay) : 1;
      const seasonDrift = ((season + placement) % 7 - 3) * 0.004;
      const baseMaps = source?.maps ?? (tier === 'T1' ? Math.max(72, 112 - Math.min(40, placement * 2)) : tier === 'T2' ? 32 : 16);
      const maps = Math.max(12, Math.round(baseMaps * ageDecay * (isProdigy ? 0.78 : 1)));
      const historicalContinuity = historicalNames.has(entry.nickname) ? 0.01 : 0;
      const vrsRank = entry.teamId ? ranks.get(entry.teamId) ?? 100 : 100;
      const newcomerVrsBonus = entry.source === 'VIRTUAL' ? Math.max(0, (36 - Math.min(36, vrsRank)) / 36) * 0.03 : 0;
      const potential = entry.potential ?? (entry.source === 'VIRTUAL' ? simulationRules.virtualGeneration.baselinePotential : 0.7);
      const prodigyBoost = isProdigy ? Math.max(0, potential - 0.75) * 0.22 : 0;
      const rating = Math.min(1.35, ((source?.rating ?? (tier === 'T1' ? 1.08 - Math.min(0.08, placement * 0.002) : tier === 'T2' ? 1.01 : 0.98)) * ageDecay) + historicalContinuity + newcomerVrsBonus + seasonDrift + prodigyBoost);
      const advancedTier = tier === 'T1' ? 'T1' : 'T2';
      const eventName = source?.titles?.[0] ?? this.referenceEventName(entry, season, advancedTier);
      const eventId = `${entry.playerId}-${season}-${this.slugEventName(eventName)}`;
      return {
        season,
        player: { playerId: entry.playerId, nickname: entry.nickname, countryCode: entry.countryCode, teamName: entry.teamName ?? '未注明队伍', ...(entry.teamId ? { teamId: entry.teamId } : {}), ...(entry.teamTier ? { teamTier: entry.teamTier } : {}), careerPlayer: false, source: entry.source },
        tournaments: [{
          eventId, eventName, tier: advancedTier, maps, rating, adr: 70 + (rating - 1) * 52,
          playoffMaps: source ? Math.round(maps * 0.35) : Math.round(maps * 0.2), playoffRating: source?.playoffRating ?? rating,
          top5Maps: source ? Math.round(maps * 0.3) : Math.round(maps * 0.15), top5Rating: source?.top5Rating ?? rating,
          finalMaps: source ? Math.max(1, Math.round(maps * 0.08)) : 0, finalRating: source?.finalRating ?? null,
          title: false,
          honors: (source?.honors ?? annualHonors.get(entry.playerId) ?? []).map((honor) => ({ ...honor, eventId, eventName, tier: advancedTier })),
          majorPlayoffChoke: false,
          ...(source?.titles?.length && source.titles[0] ? { title: true, eventName: source.titles[0] } : {}),
        }],
      };
    });
  }
  private referenceEventName(entry: Top20IdentityRecord, season: number, tier: 'T1' | 'T2'): string {
    if (tier !== 'T1') return `T2 国际挑战赛 ${season}`;
    if (entry.placement === 1) return `IEM 科隆 ${season}`;
    if (entry.placement && entry.placement <= 5) return `IEM 卡托维兹 ${season}`;
    if (entry.placement && entry.placement <= 10) return `EPL S26 ${season}`;
    return `BLAST 赏金赛 S2 ${season}`;
  }

  private slugEventName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
  }

  private allocateHonorPool(
    identities: readonly Top20IdentityRecord[],
    season: number,
    evidenceByPlayer: ReadonlyMap<string, { readonly honors: readonly { readonly type: 'MVP' | 'EVP' | 'VP'; readonly honorClass: 'NONE' | 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE' | 'MAJOR' }[] }>,
    simulationRules: Top20SimulationRules,
  ): ReadonlyMap<string, readonly { readonly type: 'MVP' | 'EVP' | 'VP'; readonly honorClass: 'NONE' | 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE' | 'MAJOR' }[]> {
    const ranked = identities.map((entry, index) => ({ entry, index, score: this.honorCompetitionScore(entry, season, index, simulationRules) })).sort((left, right) => right.score - left.score || left.entry.playerId.localeCompare(right.entry.playerId));
    const pool = simulationRules.honorPool;
    const result = new Map<string, { type: 'MVP' | 'EVP' | 'VP'; honorClass: 'NONE' | 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE' | 'MAJOR' }[]>();
    const assign = (type: 'MVP' | 'EVP' | 'VP', count: number, classFor: (index: number) => 'MEDIUM' | 'LARGE' | 'ELITE' | 'SUPER_ELITE') => {
      ranked.slice(0, count).forEach((candidate, index) => { const honors = result.get(candidate.entry.playerId) ?? []; honors.push({ type, honorClass: classFor(index) }); result.set(candidate.entry.playerId, honors); });
    };
    assign('MVP', pool.mvp, (index) => index === 0 ? 'SUPER_ELITE' : index < 2 ? 'ELITE' : 'LARGE');
    assign('EVP', pool.evp, (index) => index < 3 ? 'SUPER_ELITE' : index < 7 ? 'ELITE' : 'LARGE');
    assign('VP', pool.vp, (index) => index < 10 ? 'ELITE' : 'MEDIUM');
    // Imported season files provide the first-year statistical baseline only.
    // Honor ownership always comes from this fixed annual pool so the ecosystem
    // remains comparable across seasons.
    return result;
  }

  private honorCompetitionScore(entry: Top20IdentityRecord, season: number, index: number, simulationRules: Top20SimulationRules): number {
    const age = this.simulatedAge(entry, season);
    const ageFactor = entry.source === 'REAL' ? this.realPlayerDecay(age, Math.max(0, season - (entry.careerStartYear ?? 2018)), simulationRules.realPlayerDecay) : 1;
    const potential = entry.potential ?? (entry.source === 'VIRTUAL' ? simulationRules.virtualGeneration.baselinePotential : 0.7);
    const prodigyFactor = entry.source === 'VIRTUAL' && season - (entry.careerStartYear ?? season) <= 1 ? potential * 0.35 : 0;
    return ageFactor * (1.4 - index * 0.025) + prodigyFactor + ((season + index) % 5) * 0.01;
  }

  private simulatedAge(entry: Top20IdentityRecord, season: number): number {
    return Math.max(16, season - (entry.birthYear ?? (entry.source === 'REAL' ? 1999 : season - 18)));
  }

  private realPlayerDecay(age: number, careerYears: number, rules: Top20SimulationRules['realPlayerDecay']): number {
    const ageDecay = age <= rules.peakThroughAge ? 1 : age <= rules.gradualDeclineEndAge ? 1 - (age - rules.peakThroughAge) * rules.gradualDeclinePerYear : rules.veteranBaseMultiplier - Math.min(0.25, (age - rules.gradualDeclineEndAge) * rules.veteranDeclinePerYear);
    const careerDecay = careerYears <= rules.careerGraceYears ? 1 : 1 - Math.min(rules.careerDeclineCap, (careerYears - rules.careerGraceYears) * rules.careerDeclinePerYear);
    return Math.max(rules.minimumMultiplier, ageDecay * careerDecay);
  }

  private async loadNpcRanking(season: number): Promise<readonly Top20IdentityRecord[]> {
    const cached = this.npcRankings.get(season);
    if (cached) return cached;
    const realResponse = await fetch('assets/top20/real-players.json').catch(() => null);
    const real = realResponse && realResponse.ok ? (await realResponse.json() as { readonly players: readonly Top20IdentityRecord[] }).players : [];
    const virtualResponse = await fetch('assets/top20/virtual-players.json').catch(() => null);
    const virtual = virtualResponse && virtualResponse.ok ? (await virtualResponse.json() as { readonly players: readonly Top20IdentityRecord[] }).players : [];
    const realEntries = real.map((entry) => ({ ...entry, source: 'REAL' as const, careerStartYear: entry.careerStartYear ?? 2018 }));
    const rotation = virtual.length ? ((season % virtual.length) + virtual.length) % virtual.length : 0;
    const rulesResponse = await fetch('assets/top20/simulation-rules.json').catch(() => null);
    const simulationRules = rulesResponse && rulesResponse.ok ? await rulesResponse.json() as Top20SimulationRules : DEFAULT_TOP20_SIMULATION_RULES;
    const virtualEntries = virtual
      .map((entry, index) => ({
        ...entry,
        source: 'VIRTUAL' as const,
        placement: index + 1,
        careerStartYear: 2026 + Math.floor(index / 4),
        potential: index === 4 ? simulationRules.virtualGeneration.prodigyPotential : index < 8 ? simulationRules.virtualGeneration.risingPotential : simulationRules.virtualGeneration.baselinePotential,
      }))
      .filter((entry) => entry.careerStartYear <= season && (entry.careerStartYear === 2026 || this.annualGenerationRoll(season, entry.placement!) < (entry.potential! >= 0.95 ? simulationRules.virtualGeneration.prodigyProbability : simulationRules.virtualGeneration.baseProbability)))
      .sort((left, right) => ((left.placement! + rotation) % Math.max(1, virtual.length)) - ((right.placement! + rotation) % Math.max(1, virtual.length)));
    const value = [...realEntries, ...virtualEntries].map((entry, index) => ({ ...entry, placement: entry.placement ?? index + 1 }));
    this.npcRankings.set(season, value);
    return value;
  }
  private annualGenerationRoll(season: number, placement: number): number {
    let value = (season * 1103515245 + placement * 12345) >>> 0;
    value = (value ^ (value >>> 16)) >>> 0;
    return value / 0x100000000;
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

class BrowserEventTriggerService implements EventTriggerService {
  public async evaluate(_input: { readonly player: PlayerProfile; readonly fact: Parameters<EventTriggerService['evaluate']>[0]['fact'] }): Promise<readonly TriggeredEvent[]> { return []; }
  public async markTriggered(_triggerId: string, _playerId: string): Promise<void> {}
}

function createBaseProfile(config: BrowserCareerConfig): PlayerProfile {
  return {
    id: config.gameId as HltvPlayerId, gameId: config.gameId, nationality: config.realName, difficultyMode: config.mode, isRetired: false,
    tournamentArchive: [], originRegion: config.region, age: 18, currentTeamId: null, currentContractId: null, role: ROLE_MAP[config.role],
    attributes: { ...ROLE_ATTRIBUTES[config.role] },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
  };
}

let currentGame: BrowserCareerGame | null = null;

export async function initCareerGame(config: BrowserCareerConfig): Promise<BrowserCareerGame> {
  if (!config.gameId.trim()) throw new Error('Game ID is required.');
  const stateRepository = InMemoryStateRepository.getInstance();
  await stateRepository.delete(config.gameId);
  const progression = new PlayerProgressionServiceImpl(progressionRules);
  const player = await progression.createProfile({ profile: createBaseProfile(config), difficultyMode: config.mode, originRule: ORIGIN_RULES[config.region], modeRule: MODE_RULES[config.mode] });
  const state: CareerSaveEnvelope = {
    format: 'COPE_CAREER_SAVE', version: 1,
    state: { schemaVersion: 1, savedAt: new Date().toISOString(), currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 1, player, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: 'rookie-first-trial', completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null },
  };
  await stateRepository.save(config.gameId, state);
  const clock = new BrowserClock();
  const random = new BrowserRandomSource(config.gameId);
  const dailyActions = new DailyActionServiceImpl(new BrowserDailyActionRepository());
  const rosterResponse = await fetch('assets/teams/rosters.json').catch(() => null);
  const rosterPayload = rosterResponse && rosterResponse.ok ? await rosterResponse.json() as { readonly teams: readonly { readonly teamId: string; readonly tier: import('./hltv/team').TeamTier }[] } : null;
  const standingsResponse = await fetch('assets/teams/teams.json').catch(() => null);
  const standingsPayload = standingsResponse && standingsResponse.ok ? await standingsResponse.json() as { readonly teams: readonly { readonly id: string; readonly name: string; readonly standings: { readonly bestRank: number; readonly bestPoints: number } | null }[] } : null;
  const teamTiers = new Map((standingsPayload?.teams ?? []).filter((team) => team.standings).map((team) => [team.id, team.standings!.bestRank <= 32 ? 'T1' as const : team.standings!.bestRank <= 120 ? 'T2' as const : 'T3' as const]));
  for (const team of rosterPayload?.teams ?? []) teamTiers.set(team.teamId, team.tier);
  const transferTargets = new TransferTargetServiceImpl(async () => {
    const response = await fetch('assets/teams/transfer-targets.json').catch(() => null);
    const configured = response && response.ok ? await response.json() as import('./hltv/transfer-targets').TransferTargetAsset : null;
    const configuredIds = new Set((configured?.targets ?? []).map((target) => target.teamId));
    const generated = (standingsPayload?.teams ?? []).flatMap((team) => {
      const rank = team.standings?.bestRank;
      if (!rank || configuredIds.has(team.id)) return [];
      const tier = teamTiers.get(team.id) ?? 'T3';
      const salaryPerMonth = tier === 'T1' ? 1200 : tier === 'T2' ? 650 : 350;
      return [{ teamId: team.id, teamName: team.name, region: 'EUROPE' as const, tier, minimumRank: 1, maximumRank: tier === 'T1' ? 32 : tier === 'T2' ? 120 : 345, requiredAttributes: tier === 'T1' ? { aim: 70, consistency: 65 } : tier === 'T2' ? { aim: 55, consistency: 50 } : { aim: 45 }, salaryPerMonth, buyoutAmount: tier === 'T1' ? 5000 : tier === 'T2' ? 1200 : 300, reason: `真实 VRS #${rank} 队伍，根据当前赛区排名产生邀约。`, roleOffer: tier === 'T1' ? 'SUBSTITUTE' as const : 'STARTER' as const }];
    });
    return { schemaVersion: 2, targets: [...(configured?.targets ?? []), ...generated] };
  });
  const tournaments = new TournamentServiceImpl({
    playerId: config.gameId,
    random,
    clock,
    calendarReader: async () => {
      const response = await fetch('assets/tournaments/calendar.json').catch(() => null);
      if (!response || !response.ok) return null;
      return await response.json() as import('./hltv/tournament-service-impl').TournamentCalendarAsset;
    },
  });
  const dependencies: CareerGameDependencies = {
    playerId: config.gameId, difficultyMode: config.mode, hltv: new BrowserGateway(), progression,
    dailyActions, economy: new BrowserEconomyService(), triggers: new BrowserEventTriggerService(), retirement: new RetirementServiceImpl(), retirementSummary: new RetirementSummaryServiceImpl(), stateRepository,
  };
  const factory = new CareerGameFactoryImpl(new BrowserStoryEventPackReader(), {
    progressionRules, dailyActions, tournaments, clock, random, transferTargets,
      teamTier: (teamId) => teamTiers.get(teamId),
      vrsSnapshot: async ({ season, half }): Promise<VrsInviteSnapshot> => {
      const response = await fetch('assets/teams/teams.json').catch(() => null);
      const payload = response && response.ok ? await response.json() as { readonly teams: readonly { readonly id: string; readonly standings: { readonly bestRank: number; readonly bestPoints: number } | null }[] } : null;
      const observedAt = clock.now();
      const realEntries = (payload?.teams ?? []).filter((team) => team.standings).map((team) => ({ teamId: team.id, rank: team.standings!.bestRank, points: team.standings!.bestPoints, source: 'VRS' as const, observedAt, snapshotRank: team.standings!.bestRank }));
      return { id: `browser-vrs-${config.gameId}-${season}-h${half}`, season, half, frozenAt: observedAt, sourceRankingId: 'standings_global_2026_07_06', rulesVersion: 'vrs-major-top32-v1', entries: realEntries.sort((left, right) => left.rank - right.rank) };
    },
  });
  const game = await factory.create(dependencies) as CareerGameImpl;
  currentGame = game as BrowserCareerGame;
  return game as BrowserCareerGame;
}

function requireGame(): BrowserCareerGame {
  if (!currentGame) throw new Error('Create a career before using the engine.');
  return currentGame;
}

declare global { interface Window { COPEEngine: { createGame(config: BrowserCareerConfig): Promise<BrowserCareerGame>; getProfile(): Promise<PlayerProfile>; startSeason(): ReturnType<CareerGame['startSeason']>; getNextTournament(): ReturnType<CareerGame['getNextTournament']>; getVrsStatus(): ReturnType<CareerGame['getVrsStatus']>; listTransferTargets(): Promise<readonly TransferTargetView[]>; selectTransferTarget(teamId: string): ReturnType<CareerGame['selectTransferTarget']>; advanceTournament(): ReturnType<CareerGame['advanceTournament']>; finishSeason(): ReturnType<CareerGame['finishSeason']>; findCareerEvent(window: CareerEventWindow): ReturnType<CareerGame['findCareerEvent']>; advancePeriod(period: EventPeriod, randomRoll?: number): Promise<PlayerProfile>; getAvailableEvents(period: EventPeriod, randomRoll?: number): Promise<readonly StoryEvent[]>; chooseOption(decision: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): ReturnType<CareerGame['chooseStoryOption']>; retire(reason?: string): Promise<PlayerProfile>; generateRetirementSummary(): ReturnType<CareerGame['generateRetirementSummary']>; }; } }

window.COPEEngine = {
  createGame: initCareerGame,
  getProfile: () => requireGame().getProfile(),
  startSeason: () => requireGame().startSeason(),
  getNextTournament: () => requireGame().getNextTournament(),
  getVrsStatus: () => requireGame().getVrsStatus(),
  listTransferTargets: () => requireGame().listTransferTargets(),
  selectTransferTarget: (teamId) => requireGame().selectTransferTarget(teamId),
  advanceTournament: () => requireGame().advanceTournament(),
  finishSeason: () => requireGame().finishSeason(),
  findCareerEvent: (window) => requireGame().findCareerEvent(window),
  advancePeriod: (period, randomRoll = 0.5) => requireGame().advancePeriod({ period, randomRoll }),
  getAvailableEvents: (period, randomRoll = 0.5) => requireGame().findAvailableStoryEvents({ period, randomRoll }),
  chooseOption: (decision) => requireGame().chooseStoryOption(decision),
  retire: (reason) => requireGame().retire(reason),
  generateRetirementSummary: () => requireGame().generateRetirementSummary(),
};


