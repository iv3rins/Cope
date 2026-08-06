import type { ConditionContext, ConditionEvaluator } from '../condition';
import type {
  EventTriggerRule,
  EventTriggerRuleRepository,
  EventTriggerService,
  TriggerFact,
  TriggeredEvent,
} from '../event-trigger';
import type { StoryEvent, StoryRepository } from '../graph';
import type { PlayerProfile } from '../profile';

export interface EventTriggerRuleAsset {
  readonly schemaVersion: number;
  readonly rules: readonly EventTriggerRule[];
}

export type EventTriggerRuleAssetReader = () => Promise<EventTriggerRuleAsset | null>;

/** Data-driven trigger rule repository backed by a static asset and the existing story repository. */
export class AssetEventTriggerRuleRepository implements EventTriggerRuleRepository {
  private rules: readonly EventTriggerRule[] | null = null;

  public constructor(
    private readonly reader: EventTriggerRuleAssetReader,
    private readonly stories: StoryRepository,
  ) {}

  public async listByFactType(factType: TriggerFact['type']): Promise<readonly EventTriggerRule[]> {
    return (await this.load()).filter((rule) => rule.factType === factType).map((rule) => this.copy(rule));
  }

  public async findEvent(eventId: string): Promise<StoryEvent | null> {
    return this.stories.findEvent(eventId);
  }

  private async load(): Promise<readonly EventTriggerRule[]> {
    if (this.rules) return this.rules;
    let asset: EventTriggerRuleAsset | null = null;
    try {
      asset = await this.reader();
    } catch {
      asset = null;
    }
    if (!asset || asset.schemaVersion !== 1 || !Array.isArray(asset.rules)) {
      this.rules = [];
      return this.rules;
    }
    const ids = new Set<string>();
    this.rules = asset.rules.filter((rule) => {
      if (!this.isRule(rule) || ids.has(rule.id)) return false;
      ids.add(rule.id);
      return true;
    }).map((rule) => this.copy(rule));
    return this.rules;
  }

  private isRule(value: unknown): value is EventTriggerRule {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const rule = value as Partial<EventTriggerRule>;
    return typeof rule.id === 'string' && rule.id.length > 0
      && typeof rule.name === 'string'
      && typeof rule.factType === 'string'
      && typeof rule.eventId === 'string' && rule.eventId.length > 0
      && typeof rule.priority === 'number' && Number.isFinite(rule.priority)
      && typeof rule.oncePerCareer === 'boolean'
      && Array.isArray(rule.conditions);
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/** Generic fact-to-story matcher. It never changes player state and never embeds content rules. */
export class EventTriggerServiceImpl implements EventTriggerService {
  private readonly triggered = new Set<string>();

  public constructor(
    private readonly rules: EventTriggerRuleRepository,
    private readonly conditions: ConditionEvaluator,
  ) {}

  public async evaluate(input: { readonly player: PlayerProfile; readonly fact: TriggerFact }): Promise<readonly TriggeredEvent[]> {
    if (input.fact.playerId !== input.player.id) return [];
    const context = this.context(input.player, input.fact);
    const matches: Array<{ readonly rule: EventTriggerRule; readonly event: StoryEvent }> = [];
    for (const rule of await this.rules.listByFactType(input.fact.type)) {
      if (rule.oncePerCareer && (this.triggered.has(this.key(rule.id, input.player.id)) || input.player.completedEventIds.includes(rule.eventId))) continue;
      if (!this.conditions.matchesAll(rule.conditions, context)) continue;
      const event = await this.rules.findEvent(rule.eventId);
      if (!event || event.worldlineId !== input.player.worldlineId) continue;
      if (!this.conditions.matchesAll(event.conditions, context)) continue;
      matches.push({ rule, event });
    }
    return matches
      .sort((left, right) => right.rule.priority - left.rule.priority || left.rule.id.localeCompare(right.rule.id))
      .map(({ rule, event }) => ({
        triggerId: `${rule.id}:${this.factIdentity(input.fact)}`,
        playerId: input.player.id,
        eventId: event.id,
        period: event.period,
        fact: this.copy(input.fact),
        matchedConditions: rule.conditions.map((condition) => this.copy(condition)),
        forced: true,
      }));
  }

  public async markTriggered(triggerId: string, playerId: string): Promise<void> {
    const ruleId = triggerId.split(':')[0];
    if (ruleId) this.triggered.add(this.key(ruleId, playerId));
  }

  private context(player: PlayerProfile, fact: TriggerFact): ConditionContext {
    const ratings = fact.type === 'LOW_FINAL_RATING_STREAK'
      ? fact.ratings
      : player.tournamentArchive.slice().reverse().map((record) => record.rating);
    let lowRatingStreak = 0;
    for (const rating of ratings) {
      if (rating >= 1) break;
      lowRatingStreak += 1;
    }
    return {
      player,
      currentTeamId: player.currentTeamId,
      opponentTeamId: fact.type === 'TOURNAMENT_UPSET' ? fact.opponentTeamId : null,
      randomRoll: 0,
      difficultyMode: player.difficultyMode,
      lowRatingStreak,
      advancedMapsPlayed: player.tournamentArchive.filter((record) => record.level === 'T1' || record.level === 'MAJOR').reduce((sum, record) => sum + record.mapsPlayed, 0),
    };
  }

  private factIdentity(fact: TriggerFact): string {
    switch (fact.type) {
      case 'TOURNAMENT_UPSET': return fact.editionId;
      case 'LOW_FINAL_RATING_STREAK': return fact.tournamentIds.join(',') || 'streak';
      case 'CONTRACT_TERMINATED': return fact.contract.id;
      case 'CONTRACT_EXPIRED': return fact.contract.id;
      case 'PLAYER_BANKRUPT': return String(fact.balance);
      case 'AGE_MILESTONE': return String(fact.age);
    }
  }

  private key(ruleId: string, playerId: string): string {
    return `${playerId}:${ruleId}`;
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
