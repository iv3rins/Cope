import type { HltvTeamId, TeamTier } from '../hltv/team';
import type { EventPeriod, StoryEvent } from './graph';
import type { PlayerProfile } from './profile';

export type CareerFlowNodeType = 'TOURNAMENT' | 'STORY_EVENT' | 'REST' | 'TEAM_SELECTION';

export interface AcademyTeamOffer {
  readonly teamId: HltvTeamId;
  readonly name: string;
  readonly region: string;
  readonly tier: TeamTier;
  readonly description: string;
  readonly startingRole: string;
  readonly monthlySalary: number;
}

export interface CareerScheduleEntry {
  readonly id: string;
  readonly name: string;
  readonly tier: TeamTier;
  readonly format: string;
  readonly location: string;
  readonly qualification: string;
  readonly week: number;
}

export interface CareerFlowNode {
  readonly type: CareerFlowNodeType;
  readonly period: EventPeriod;
  readonly schedule: CareerScheduleEntry | null;
  readonly event: StoryEvent | null;
  readonly canAdvance: boolean;
}

export interface CareerFlowSnapshot {
  readonly profile: PlayerProfile;
  readonly teamTier: TeamTier | null;
  readonly currentNode: CareerFlowNode;
  readonly upcoming: readonly CareerScheduleEntry[];
}

export interface CareerFlowService {
  getSnapshot(): Promise<CareerFlowSnapshot>;
  advance(): Promise<CareerFlowSnapshot>;
  resolveEvent(input: { readonly eventId: string; readonly optionId: string; readonly randomRoll: number }): Promise<CareerFlowSnapshot>;
}
