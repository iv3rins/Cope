import type {
  ConditionContext,
  ConditionEvaluator,
  EventCondition,
  PlayerStat,
} from '../condition';
import type { PlayerAttribute, PlayerProfile } from '../profile';

const ATTRIBUTE_KEYS: Readonly<Record<PlayerAttribute, keyof PlayerProfile['attributes']>> = {
  AIM: 'aim',
  GAME_SENSE: 'gameSense',
  LEADERSHIP: 'leadership',
  CLUTCH: 'clutch',
  CONSISTENCY: 'consistency',
  TEAM_CONFLICT: 'teamConflict',
};

export class ConditionEvaluatorImpl implements ConditionEvaluator {
  public matches(condition: EventCondition, context: ConditionContext): boolean {
    const matched = this.matchesWithoutNegation(condition, context);
    return condition.negate ? !matched : matched;
  }

  public matchesAll(conditions: readonly EventCondition[], context: ConditionContext): boolean {
    return conditions.every((condition) => this.matches(condition, context));
  }

  private matchesWithoutNegation(condition: EventCondition, context: ConditionContext): boolean {
    switch (condition.type) {
      case 'ATTRIBUTE':
        if (condition.target && condition.target !== 'PLAYER') return false;
        return this.inRange(context.player.attributes[ATTRIBUTE_KEYS[condition.attribute]], condition.minimum, condition.maximum);
      case 'PLAYER_STAT':
        if (condition.target && condition.target !== 'PLAYER') return false;
        return this.inRange(this.getPlayerStat(context.player, condition.stat), condition.minimum, condition.maximum);
      case 'AGE':
        if (condition.target && condition.target !== 'PLAYER') return false;
        return this.inRange(context.player.age, condition.minimum, condition.maximum);
      case 'FLAG':
        if (condition.target && condition.target !== 'PLAYER') return false;
        return context.player.flags.some((flag) => flag.id === condition.flagId) === condition.expected;
      case 'TEAM':
        return this.getTeamId(condition.target, context) === condition.teamId;
      case 'WORLDLINE':
        return context.player.worldlineId === condition.worldlineId;
      case 'COMPLETED_EVENT':
        return context.player.completedEventIds.includes(condition.eventId);
      case 'ACTIVE_CONTRACT':
        if (context.activeContract === undefined) return false;
        return (context.activeContract !== null) === condition.expected;
      case 'FREE_AGENCY':
        return (context.player.currentTeamId === null || context.player.freeAgencyStatus === 'FREE_AGENT') === condition.expected;
      case 'TEAM_VRS_RANK':
        return context.currentTeamRank !== undefined && context.currentTeamRank !== null && this.inRange(context.currentTeamRank, condition.minimum, condition.maximum);
      case 'RATING_STREAK':
        return context.lowRatingStreak !== undefined && this.inRange(context.lowRatingStreak, condition.minimum, condition.maximum);
      case 'ADVANCED_MAPS':
        return context.advancedMapsPlayed !== undefined && this.inRange(context.advancedMapsPlayed, condition.minimum, condition.maximum);
      case 'TOP20_RANK': {
        const rank = context.player.trophies.top20Records.slice().sort((left, right) => right.year - left.year)[0]?.rank;
        return rank !== undefined && this.inRange(rank, condition.minimum, condition.maximum);
      }
      case 'GAME_MODE':
        return condition.modes.includes(context.difficultyMode);
      case 'RANDOM':
        return this.isRollInRange(context.randomRoll) && this.clampChance(condition.chance) > context.randomRoll;
      case 'ALL':
        return condition.conditions.every((child) => this.matches(child, context));
      case 'ANY':
        return condition.conditions.some((child) => this.matches(child, context));
      case 'NONE':
        return !condition.conditions.some((child) => this.matches(child, context));
    }
  }

  private getTeamId(target: EventCondition['target'], context: ConditionContext): string | null {
    switch (target ?? 'CURRENT_TEAM') {
      case 'PLAYER':
      case 'CURRENT_TEAM':
        return context.currentTeamId;
      case 'OPPONENT_TEAM':
        return context.opponentTeamId;
    }
  }

  private getPlayerStat(profile: PlayerProfile, stat: PlayerStat): number {
    switch (stat) {
      case 'MORALE': return profile.morale;
      case 'ENERGY': return profile.energy;
      case 'BALANCE': return profile.life.balance;
      case 'STRESS': return profile.life.stress;
      case 'RATING2': return profile.career.rating2;
    }
  }

  private inRange(value: number, minimum: number | undefined, maximum: number | undefined): boolean {
    if (!Number.isFinite(value)) return false;
    if (minimum !== undefined && (!Number.isFinite(minimum) || value < minimum)) return false;
    if (maximum !== undefined && (!Number.isFinite(maximum) || value > maximum)) return false;
    return minimum === undefined || maximum === undefined || minimum <= maximum;
  }

  private isRollInRange(roll: number): boolean {
    return Number.isFinite(roll) && roll >= 0 && roll < 1;
  }

  private clampChance(chance: number): number {
    if (!Number.isFinite(chance)) return 0;
    return Math.max(0, Math.min(1, chance));
  }
}
