import type { StoryEvent, StoryRepository, Worldline } from '../graph';

/** Environment adapter: Node may read a directory with fs/promises; browsers may fetch a manifest. */
export interface StoryEventPackReader {
  readEvents(): Promise<readonly StoryEvent[]>;
  readWorldlines(): Promise<readonly Worldline[]>;
}

/** Extra query port used by StoryEngineImpl; StoryRepository itself deliberately remains minimal. */
export interface StoryEventDirectory extends StoryRepository {
  listEvents(): Promise<readonly StoryEvent[]>;
}

export class StoryRepositoryImpl implements StoryEventDirectory {
  private eventsById: ReadonlyMap<string, StoryEvent> | null = null;
  private worldlinesById: ReadonlyMap<string, Worldline> | null = null;

  public constructor(private readonly reader: StoryEventPackReader) {}

  public async findEvent(eventId: string): Promise<StoryEvent | null> {
    await this.ensureLoaded();
    return this.copy(this.eventsById?.get(eventId) ?? null);
  }

  public async findWorldline(worldlineId: string): Promise<Worldline | null> {
    await this.ensureLoaded();
    return this.copy(this.worldlinesById?.get(worldlineId) ?? null);
  }

  public async listEvents(): Promise<readonly StoryEvent[]> {
    await this.ensureLoaded();
    return [...(this.eventsById?.values() ?? [])].map((event) => this.copy(event));
  }

  private async ensureLoaded(): Promise<void> {
    if (this.eventsById && this.worldlinesById) return;

    const [events, worldlines] = await Promise.all([this.reader.readEvents(), this.reader.readWorldlines()]);
    const eventIndex = new Map<string, StoryEvent>();
    for (const event of events) {
      if (this.isStoryEvent(event) && !eventIndex.has(event.id)) eventIndex.set(event.id, this.copy(event));
    }
    const worldlineIndex = new Map<string, Worldline>();
    for (const worldline of worldlines) {
      if (this.isWorldline(worldline) && !worldlineIndex.has(worldline.id)) worldlineIndex.set(worldline.id, this.copy(worldline));
    }
    this.eventsById = eventIndex;
    this.worldlinesById = worldlineIndex;
  }

  private isStoryEvent(value: unknown): value is StoryEvent {
    if (!this.isRecord(value)) return false;
    return typeof value.id === 'string'
      && value.id.length > 0
      && typeof value.title === 'string'
      && typeof value.description === 'string'
      && typeof value.worldlineId === 'string'
      && (value.type === 'CHOICE' || value.type === 'MANDATORY')
      && (value.system === undefined || typeof value.system === 'boolean')
      && (value.consumesTransferOffer === undefined || typeof value.consumesTransferOffer === 'boolean')
      && typeof value.period === 'string'
      && Array.isArray(value.conditions)
      && value.conditions.every((condition) => this.isCondition(condition))
      && Array.isArray(value.options)
      && value.options.every((option) => this.isOption(option))
      && Array.isArray(value.autoEffects)
      && value.autoEffects.every((effect) => this.isEffect(effect));
  }

  private isOption(value: unknown): boolean {
    if (!this.isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string' || (value.description !== undefined && typeof value.description !== 'string') || !Array.isArray(value.requirements) || !value.requirements.every((item) => this.isCondition(item)) || !this.isRecord(value.outcome)) return false;
    const outcome = value.outcome;
    return Array.isArray(outcome.successEffects) && outcome.successEffects.every((item) => this.isEffect(item))
      && Array.isArray(outcome.failureEffects) && outcome.failureEffects.every((item) => this.isEffect(item));
  }

  private isCondition(value: unknown): boolean {
    if (!this.isRecord(value) || typeof value.type !== 'string') return false;
    if (value.negate !== undefined && typeof value.negate !== 'boolean') return false;
    if (value.target !== undefined && !['PLAYER', 'CURRENT_TEAM', 'OPPONENT_TEAM'].includes(String(value.target))) return false;
    if (value.type === 'ALL' || value.type === 'ANY' || value.type === 'NONE') return Array.isArray(value.conditions) && value.conditions.every((item) => this.isCondition(item));
    if (value.type === 'ATTRIBUTE') return ['AIM', 'GAME_SENSE', 'LEADERSHIP', 'CLUTCH', 'CONSISTENCY', 'TEAM_CONFLICT'].includes(String(value.attribute)) && this.validRange(value);
    if (value.type === 'PLAYER_STAT') return ['MORALE', 'ENERGY', 'BALANCE', 'STRESS', 'RATING2'].includes(String(value.stat)) && this.validRange(value);
    if (value.type === 'NARRATIVE_METRIC') return this.isNarrativeMetric(String(value.metric)) && this.validRange(value);
    if (value.type === 'PLAYER_ORIGIN_REGION') return Array.isArray(value.regions) && value.regions.length > 0 && value.regions.every((region) => ['EUROPE', 'AMERICAS', 'ASIA', 'OCEANIA', 'MIDDLE_EAST', 'AFRICA'].includes(String(region)));
    if (value.type === 'PLAYER_ROLE') return Array.isArray(value.roles) && value.roles.length > 0 && value.roles.every((role) => ['IGL', 'AWPER', 'ENTRY_FRAGGER', 'SUPPORT', 'LURKER'].includes(String(role)));
    if (value.type === 'AGE') return this.validRange(value);
    if (value.type === 'FLAG') return typeof value.flagId === 'string' && typeof value.expected === 'boolean';
    if (value.type === 'TEAM') return typeof value.teamId === 'string' && value.teamId.length > 0;
    if (value.type === 'WORLDLINE') return typeof value.worldlineId === 'string' && value.worldlineId.length > 0;
    if (value.type === 'COMPLETED_EVENT') return typeof value.eventId === 'string' && value.eventId.length > 0;
    if (value.type === 'CONTRACT_ENDS_WITHIN') return typeof value.days === 'number' && Number.isFinite(value.days) && value.days >= 0;
    if (value.type === 'ACTIVE_CONTRACT' || value.type === 'FREE_AGENCY' || value.type === 'TRANSFER_WINDOW' || value.type === 'TRANSFER_OFFER') return typeof value.expected === 'boolean';
    if (value.type === 'TEAM_VRS_RANK' || value.type === 'RATING_STREAK' || value.type === 'ADVANCED_MAPS' || value.type === 'TOP20_RANK') return this.validRange(value);
    if (value.type === 'GAME_MODE') return Array.isArray(value.modes) && value.modes.length > 0 && value.modes.every((mode) => mode === 'HARDCORE' || mode === 'POWER_FANTASY');
    if (value.type === 'RANDOM') return typeof value.chance === 'number' && Number.isFinite(value.chance) && value.chance >= 0 && value.chance <= 1;
    return false;
  }

  private validRange(value: Record<string, unknown>): boolean {
    const minimum = value.minimum;
    const maximum = value.maximum;
    if (minimum !== undefined && (typeof minimum !== 'number' || !Number.isFinite(minimum))) return false;
    if (maximum !== undefined && (typeof maximum !== 'number' || !Number.isFinite(maximum))) return false;
    return minimum === undefined || maximum === undefined || minimum <= maximum;
  }

  private isEffect(value: unknown): boolean {
    if (!this.isRecord(value) || typeof value.type !== 'string') return false;
    if (value.type === 'ATTRIBUTE_CHANGE') return ['AIM', 'GAME_SENSE', 'LEADERSHIP', 'CLUTCH', 'CONSISTENCY', 'TEAM_CONFLICT'].includes(String(value.attribute)) && Number.isFinite(value.delta);
    if (value.type === 'PLAYER_STAT_CHANGE') return ['MORALE', 'ENERGY', 'BALANCE', 'STRESS', 'RATING2'].includes(String(value.stat)) && Number.isFinite(value.delta);
    if (value.type === 'NARRATIVE_METRIC_CHANGE') return this.isNarrativeMetric(String(value.metric)) && Number.isFinite(value.delta);
    if (value.type === 'CONTRACT_RENEWAL') {
      const lengthMonths = value.lengthMonths;
      const salaryMultiplier = value.salaryMultiplier;
      const buyoutMultiplier = value.buyoutMultiplier;
      return typeof lengthMonths === 'number' && Number.isSafeInteger(lengthMonths) && lengthMonths > 0 && lengthMonths <= 120
        && typeof salaryMultiplier === 'number' && Number.isFinite(salaryMultiplier) && salaryMultiplier > 0 && salaryMultiplier <= 10
        && typeof buyoutMultiplier === 'number' && Number.isFinite(buyoutMultiplier) && buyoutMultiplier >= 0 && buyoutMultiplier <= 10;
    }
    if (value.type === 'FORCE_CONTRACT_TERMINATION') return Array.isArray(value.requirements) && value.requirements.every((item) => this.isCondition(item)) && typeof value.reason === 'string' && typeof value.note === 'string';
    if (value.type === 'TOURNAMENT_INTERVENTION') {
      const interventionTypes = ['TEAM_STRENGTH', 'OPPONENT_STRENGTH', 'UPSET_CHANCE', 'FORCE_UPSET'];
      if (typeof value.editionId !== 'string' || value.editionId.length === 0) return false;
      if (!interventionTypes.includes(String(value.interventionType))) return false;
      if (value.delta !== undefined && (typeof value.delta !== 'number' || !Number.isFinite(value.delta))) return false;
      if (value.opponentTeamId !== undefined && value.opponentTeamId !== null && typeof value.opponentTeamId !== 'string') return false;
      if (value.forceUpset !== undefined && value.forceUpset !== null && typeof value.forceUpset !== 'boolean') return false;
      return typeof value.description === 'string';
    }
    const known = ['TEAM_TRANSFER', 'ROLE_CHANGE', 'WORLDLINE_CHANGE', 'FLAG_ADD', 'FLAG_REMOVE', 'TROPHY_CHANGE', 'CAREER_STAT_CHANGE', 'ADVANCE_STORY'];
    return known.includes(value.type);
  }

  private isNarrativeMetric(value: string): boolean {
    return ['FAME', 'TEAM_STATUS', 'TEAM_RELATIONSHIP', 'FORM', 'MENTALITY', 'BALANCE', 'CLUB_FAVOR', 'FAN_REPUTATION'].includes(value);
  }

  private isWorldline(value: unknown): value is Worldline {
    if (!this.isRecord(value)) return false;
    return typeof value.id === 'string'
      && value.id.length > 0
      && typeof value.name === 'string'
      && typeof value.startEventId === 'string'
      && Array.isArray(value.eventIds)
      && value.eventIds.every((eventId) => typeof eventId === 'string');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/**
 * Node adapter. Keep this at the composition root because importing node:fs into the
 * engine would prevent browser builds. One JSON file represents exactly one StoryEvent.
 */
export class FileSystemStoryEventPackReader implements StoryEventPackReader {
  public constructor(
    private readonly storyDirectory: string,
    private readonly readFile: (path: string, encoding: 'utf8') => Promise<string>,
    private readonly readDirectory: (path: string) => Promise<readonly string[]>,
    private readonly worldlineDirectory?: string,
  ) {}

  public async readEvents(): Promise<readonly StoryEvent[]> {
    return this.readJsonFiles<StoryEvent>(this.storyDirectory);
  }

  public async readWorldlines(): Promise<readonly Worldline[]> {
    return this.worldlineDirectory ? this.readJsonFiles<Worldline>(this.worldlineDirectory) : [];
  }

  private async readJsonFiles<T>(directory: string): Promise<readonly T[]> {
    let names: readonly string[];
    try {
      names = await this.readDirectory(directory);
    } catch {
      return [];
    }
    const paths = names.filter((name) => name.endsWith('.json')).map((name) => `${directory.replace(/[\\/]$/, '')}/${name}`);
    const values: Array<T | null> = await Promise.all(paths.map(async (path): Promise<T | null> => {
      try {
        return JSON.parse(await this.readFile(path, 'utf8')) as T;
      } catch {
        return null;
      }
    }));
    return values.filter((value): value is T => value !== null);
  }
}
