/**
 * 战队分级规则（T1 / T2 / T3）。
 *
 * 本游戏设计口径（简单边界）：
 *   - T1：VRS 全球榜 1-12 名。可参加所有 T1 赛事，不能参加 T2 赛事。
 *   - T2：VRS 全球榜 13-30 名。偶尔可参加 T1 赛事，所有 T2 赛事均可参加。
 *   - T3：VRS 全球榜 30 名开外。想打 T2 需受邀或打地区 T2（只有 T2 赛事有积分）。
 *
 * 真实 HLTV/Valve 口径（知识库《Counter-Strike》观赛手册）：
 *   - T1 赛事强制邀请 VRS 全球前 20；T2 赛事禁止邀请全球前 12。
 *   - 社区口径：1-12 一线 / 12-20 一线末二线顶 / 20-40 二线。
 * 边界常量集中于此，方便日后切换口径。
 */

export type TeamTier = 'T1' | 'T2' | 'T3';

/** T1 边界：rank <= T1_MAX 视为 T1 */
export const T1_MAX_RANK = 12;
/** T2 边界：T1_MAX_RANK < rank <= T2_MAX_RANK 视为 T2 */
export const T2_MAX_RANK = 30;
/** T3：rank > T2_MAX_RANK */

/** 知识库口径：T1 赛事强制邀请 VRS 前 20（供参考/扩展，本接口未使用） */
export const KB_T1_INVITE_TOP_N = 20;
/** 知识库口径：T2 赛事禁止邀请 VRS 前 12（供参考/扩展，本接口未使用） */
export const KB_T2_BAN_TOP_N = 12;

/**
 * 根据 VRS 全球榜名次判定战队分级。
 * @param rank VRS 全球榜名次（1 起）。<=0 或非有限数视为无排名。
 */
export function tierForRank(rank: number): TeamTier {
  if (!Number.isFinite(rank) || rank <= 0) return 'T3';
  if (rank <= T1_MAX_RANK) return 'T1';
  if (rank <= T2_MAX_RANK) return 'T2';
  return 'T3';
}

/** 名次是否符合某一分级的区间。 */
export function rankInTier(rank: number, tier: TeamTier): boolean {
  return tierForRank(rank) === tier;
}

/** 根据名次得到中文说明（供 UI/日志使用）。 */
export function tierLabel(tier: TeamTier): string {
  switch (tier) {
    case 'T1':
      return 'T1 一线队';
    case 'T2':
      return 'T2 二线队';
    case 'T3':
      return 'T3 三线队';
  }
}
