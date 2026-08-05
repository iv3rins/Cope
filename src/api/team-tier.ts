/**
 * API compatibility facade. Ranking tier boundaries are owned by the HLTV base layer.
 */
export {
  T1_MAX_RANK,
  T2_MAX_RANK,
  tierForRank,
  type TeamTier,
} from '../hltv/team.ts';

import { tierForRank, type TeamTier } from '../hltv/team.ts';

/** 名次是否符合某一分级的区间。 */
export function rankInTier(rank: number, tier: TeamTier): boolean {
  return tierForRank(rank) === tier;
}

/** 根据名次得到中文说明（供 UI/日志使用）。 */
export function tierLabel(tier: TeamTier): string {
  switch (tier) {
    case 'T1': return 'T1 一线队';
    case 'T2': return 'T2 二线队';
    case 'T3': return 'T3 三线队';
  }
}

/** 知识库口径常量，保留 API 兼容；不参与游戏分级。 */
export const KB_T1_INVITE_TOP_N = 20;
export const KB_T2_BAN_TOP_N = 12;
