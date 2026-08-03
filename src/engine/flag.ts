import type { PlayerFlag, PlayerProfile } from './profile';

/** Flag 的变更以不可变结果返回，便于撤销、存档回放和单元测试。 */
export interface FlagMutation {
  readonly type: 'ADD' | 'REMOVE' | 'PURGE_EXPIRED';
  readonly flag?: PlayerFlag;
  readonly flagId?: string;
  readonly reason?: string;
}

export interface FlagService {
  has(flags: readonly PlayerFlag[], flagId: string): boolean;
  apply(profile: PlayerProfile, mutation: FlagMutation, occurredAt: string): PlayerProfile;
}
