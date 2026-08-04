import type { CareerFlowService, CareerFlowSnapshot, AcademyTeamOffer, CareerScheduleEntry } from '../career-flow';
import type { CareerGame } from '../game';
import type { EventPeriod, StoryEvent } from '../graph';
import type { TeamTier } from '../../hltv/team';

export interface CareerFlowDataSource {
  readonly offers: readonly AcademyTeamOffer[];
  readonly schedule: readonly CareerScheduleEntry[];
}

export class CareerFlowServiceImpl implements CareerFlowService {
  private cursor = 0;
  private currentEvent: StoryEvent | null = null;

  public constructor(private readonly game: CareerGame, private readonly source: CareerFlowDataSource) {}

  public async getSnapshot(): Promise<CareerFlowSnapshot> {
    const profile = await this.game.getProfile();
    return this.snapshot(profile, this.currentNode(profile.currentTeamId));
  }

  public async advance(): Promise<CareerFlowSnapshot> {
    const profile = await this.game.advancePeriod({ period: 'NORMAL', randomRoll: 0.5 });
    this.cursor = Math.min(this.cursor + 1, Math.max(0, this.source.schedule.length - 1));
    return this.snapshot(profile, this.currentNode(profile.currentTeamId));
  }

  public async resolveEvent(input: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): Promise<CareerFlowSnapshot> {
    const result = await this.game.chooseStoryOption(input);
    this.currentEvent = null;
    return this.snapshot(result.profile, this.currentNode(result.profile.currentTeamId));
  }

  private currentNode(currentTeamId: string | null): CareerFlowSnapshot['currentNode'] {
    return {
      type: this.currentEvent ? 'STORY_EVENT' : 'TOURNAMENT',
      period: this.currentEvent?.period ?? 'NORMAL',
      schedule: this.source.schedule[this.cursor] ?? null,
      event: this.currentEvent,
      canAdvance: currentTeamId !== null,
    };
  }

  private snapshot(profile: CareerFlowSnapshot['profile'], currentNode: CareerFlowSnapshot['currentNode']): CareerFlowSnapshot {
    return {
      profile: this.copy(profile),
      teamTier: this.findTeamTier(profile.currentTeamId),
      currentNode,
      upcoming: this.source.schedule.slice(this.cursor + 1, this.cursor + 4).map((entry) => this.copy(entry)),
    };
  }

  private findTeamTier(teamId: string | null): TeamTier | null {
    return this.source.offers.find((offer) => offer.teamId === teamId)?.tier ?? null;
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
