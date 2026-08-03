import type { DailyActionDefinition, DailyActionRepository } from './engine/daily-action';
import type { EconomyTickService, EconomyTickResult } from './engine/economy';
import type { EventTriggerService, TriggeredEvent } from './engine/event-trigger';
import type { CareerGame, CareerGameDependencies, CareerGameFactory } from './engine/game';
import type { EngineHltvGateway, EngineHltvGatewayFactory } from './engine/hltv-gateway';
import type { EventPeriod, StoryEvent, StorySuccessChancePolicy, Worldline } from './engine/graph';
import type { GameDifficultyMode, GameModeRule } from './engine/mode';
import type { PlayerProfile, PlayerRole } from './engine/profile';
import type { AgePhase, AgeProgressionRule, PlayerProgressionRuleRepository, RegionOriginRule } from './engine/progression';

import type { CareerSaveEnvelope } from './engine/save-state';
import type { HltvModule } from './hltv/hltv-module';
import type { CompetitionRegion, HltvPlayerId, VrsInviteSnapshot } from './hltv/team';
import type { TournamentEdition, TournamentIntervention, TournamentInterventionAppliedFact, TournamentCompletedFact, TournamentResult } from './hltv/tournament';
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

export interface BrowserCareerConfig {
  readonly gameId: string;
  readonly realName: string;
  readonly role: 'ENTRY' | 'AWP' | 'IGL' | 'SUPPORT' | 'LURK';
  readonly region: CompetitionRegion;
  readonly mode: GameDifficultyMode;
  readonly academyTeamId: string;
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
      findTop20: (season) => hltv.top20.calculate({ season, rules: { version: 'browser-unconfigured', minimumT1MajorMaps: 0, honorBaseScore: { MVP: 0, EVP: 0, VP: 0 }, honorClassMultiplier: { NONE: 0, MEDIUM: 0, LARGE: 0, ELITE: 0, SUPER_ELITE: 0, MAJOR: 0 } }, evidence: [] }),
      synchronizeCareerHonors: async (profile) => profile,
    };
  }
}

class BrowserClock {
  public now(): string { return new Date().toISOString(); }
}

class BrowserRandomSource {
  public next(): number { return Math.random(); }
}

class BrowserGateway implements EngineHltvGateway {
  private readonly interventions = new Map<string, TournamentIntervention>();
  public async freezeVrsSnapshot(input: { readonly season: number; readonly half: 1 | 2 }): Promise<string> { return `browser-vrs-${input.season}-h${input.half}`; }
  public async applyTournamentIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact> { this.interventions.set(intervention.id, { ...intervention }); return { type: 'TOURNAMENT_INTERVENTION_APPLIED', occurredAt: intervention.occurredAt, intervention: { ...intervention } }; }
  public async settleTournament(_fact: TournamentCompletedFact): Promise<void> {}
  public async findTop20(season: number) { return { season, rulesVersion: 'browser-v1', entries: [], careerPlayerRank: null }; }
  public async synchronizeCareerHonors(profile: PlayerProfile): Promise<PlayerProfile> { return JSON.parse(JSON.stringify(profile)) as PlayerProfile; }
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
    tournamentArchive: [], originRegion: config.region, age: 18, currentTeamId: config.academyTeamId, currentContractId: null, role: ROLE_MAP[config.role],
    attributes: { ...ROLE_ATTRIBUTES[config.role] },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [config.academyTeamId] },
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
  const random = new BrowserRandomSource();
  const dailyActions = new DailyActionServiceImpl(new BrowserDailyActionRepository());
  const tournaments = new TournamentServiceImpl({ playerId: config.gameId, random, clock });
  const dependencies: CareerGameDependencies = {
    playerId: config.gameId, difficultyMode: config.mode, hltv: new BrowserGateway(), progression,
    dailyActions, economy: new BrowserEconomyService(), triggers: new BrowserEventTriggerService(), retirement: new RetirementServiceImpl(), retirementSummary: new RetirementSummaryServiceImpl(), stateRepository,
  };
  const factory = new CareerGameFactoryImpl(new BrowserStoryEventPackReader(), {
    progressionRules, dailyActions, tournaments, clock, random,
    vrsSnapshot: async ({ season, half }): Promise<VrsInviteSnapshot> => ({
      id: `browser-vrs-${config.gameId}-${season}-h${half}`, season, half, frozenAt: clock.now(), sourceRankingId: 'browser-vrs', rulesVersion: 'browser-v1',
      entries: [
        { teamId: 'academy-1', rank: 16, points: 700, source: 'SIMULATION', observedAt: clock.now(), snapshotRank: 16 },
        { teamId: 'sim-opponent', rank: 8, points: 900, source: 'SIMULATION', observedAt: clock.now(), snapshotRank: 8 },
      ],
    }),
  });
  const game = await factory.create(dependencies) as CareerGameImpl;
  currentGame = game as BrowserCareerGame;
  return game as BrowserCareerGame;
}

function requireGame(): BrowserCareerGame {
  if (!currentGame) throw new Error('Create a career before using the engine.');
  return currentGame;
}

declare global { interface Window { COPEEngine: { createGame(config: BrowserCareerConfig): Promise<BrowserCareerGame>; getProfile(): Promise<PlayerProfile>; advancePeriod(period: EventPeriod, randomRoll?: number): Promise<PlayerProfile>; getAvailableEvents(period: EventPeriod, randomRoll?: number): Promise<readonly StoryEvent[]>; chooseOption(decision: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): ReturnType<CareerGame['chooseStoryOption']>; simulateTournament(input: { readonly edition: TournamentEdition; readonly randomRoll?: number }): Promise<TournamentResult>; retire(reason?: string): Promise<PlayerProfile>; generateRetirementSummary(): ReturnType<CareerGame['generateRetirementSummary']>; }; } }

window.COPEEngine = {
  createGame: initCareerGame,
  getProfile: () => requireGame().getProfile(),
  advancePeriod: (period, randomRoll = Math.random()) => requireGame().advancePeriod({ period, randomRoll }),
  getAvailableEvents: (period, randomRoll = Math.random()) => requireGame().findAvailableStoryEvents({ period, randomRoll }),
  chooseOption: (decision) => requireGame().chooseStoryOption(decision),
  simulateTournament: ({ edition, randomRoll = Math.random() }) => (requireGame() as CareerGameImpl).simulateTournament({ edition, randomRoll }),
  retire: (reason) => requireGame().retire(reason),
  generateRetirementSummary: () => requireGame().generateRetirementSummary(),
};


