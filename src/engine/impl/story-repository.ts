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
      && Array.isArray(value.conditions)
      && Array.isArray(value.options)
      && Array.isArray(value.autoEffects);
  }

  private isWorldline(value: unknown): value is Worldline {
    if (!this.isRecord(value)) return false;
    return typeof value.id === 'string'
      && value.id.length > 0
      && typeof value.name === 'string'
      && typeof value.startEventId === 'string'
      && Array.isArray(value.eventIds);
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
