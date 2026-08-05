import type { PlayerProfile } from '../engine/profile';
import type { TeamTier } from './team';
import type { TransferTargetAsset, TransferTargetListInput, TransferTargetRecord, TransferTargetService, TransferTargetView } from './transfer-targets';

export type TransferTargetAssetReader = () => Promise<TransferTargetAsset | null>;

export class TransferTargetServiceImpl implements TransferTargetService {
  public constructor(private readonly reader: TransferTargetAssetReader) {}

  public async list(input: TransferTargetListInput): Promise<readonly TransferTargetView[]> {
    const records = (await this.reader())?.targets ?? [];
    const views = records.filter((target) => target.teamId !== input.player.currentTeamId).map((target) => this.evaluate(target, input));
    // Entry-level T3 markets should always expose a useful next step when a compliant candidate exists.
    const compliantT3 = views.filter((view) => view.tier === 'T3' && view.eligible);
    if (compliantT3.length && !compliantT3.some((view) => view.availability === 'RECOMMENDED')) {
      const best = [...compliantT3].sort((a, b) => b.fitScore - a.fitScore || b.interestScore - a.interestScore)[0]!;
      const index = views.indexOf(best);
      views[index] = { ...best, availability: 'RECOMMENDED', reasons: [...best.reasons, '入门级市场保证推荐：这是当前最匹配的合规机会。'] };
    }
    return views.sort((a, b) => Number(b.eligible) - Number(a.eligible) || this.opportunityScore(b) - this.opportunityScore(a) || b.fitScore - a.fitScore || b.interestScore - a.interestScore || a.maximumRank - b.maximumRank || a.teamName.localeCompare(b.teamName)).slice(0, input.maxResults ?? 4);
  }

  private evaluate(target: TransferTargetRecord, input: TransferTargetListInput): TransferTargetView {
    const player = input.player;
    const rank = input.snapshotRanks[target.teamId] ?? Number.POSITIVE_INFINITY;
    const recent = [...player.tournamentArchive].sort((a, b) => b.year - a.year).slice(0, 3);
    const recentMaps = recent.reduce((sum, row) => sum + row.mapsPlayed, 0);
    const recentRating = recentMaps ? recent.reduce((sum, row) => sum + row.rating * row.mapsPlayed, 0) / recentMaps : player.career.rating2;
    const t1MajorMaps = player.tournamentArchive.filter((row) => row.level === 'T1' || row.level === 'MAJOR').reduce((sum, row) => sum + row.mapsPlayed, 0);
    const unmetRequirements: string[] = [];
    const risks: string[] = [];
    for (const [attribute, minimum] of Object.entries(target.requiredAttributes)) {
      if (typeof minimum === 'number' && player.attributes[attribute as keyof PlayerProfile['attributes']] < minimum) unmetRequirements.push(`${attribute}:${minimum}`);
    }
    if (target.requiredRoles && !target.requiredRoles.includes(player.role)) unmetRequirements.push(`role:${target.requiredRoles.join('|')}`);
    if (target.minimumAge !== undefined && player.age < target.minimumAge) unmetRequirements.push(`age>=${target.minimumAge}`);
    if (target.maximumAge !== undefined && player.age > target.maximumAge) unmetRequirements.push(`age<=${target.maximumAge}`);
    if (target.requiredTeamConflictMaximum !== undefined && player.attributes.teamConflict > target.requiredTeamConflictMaximum) unmetRequirements.push(`teamConflict<=${target.requiredTeamConflictMaximum}`);
    if (target.freeAgentOnly && player.freeAgencyStatus !== 'FREE_AGENT' && player.currentTeamId !== null) unmetRequirements.push('free-agent-only');
    if (target.currentTeamTierExcluded && input.currentTeamTier === target.currentTeamTierExcluded) unmetRequirements.push(`current-tier!=${target.currentTeamTierExcluded}`);
    const careerDefaults = this.careerThresholds(target);
    const minimumRecentRating = target.minimumRecentRating ?? careerDefaults.rating;
    const minimumCareerMaps = target.minimumCareerMaps ?? careerDefaults.careerMaps;
    const minimumT1MajorMaps = target.minimumT1MajorMaps ?? careerDefaults.t1MajorMaps;
    if (recentRating < minimumRecentRating) unmetRequirements.push(`recentRating>=${minimumRecentRating}`);
    if (player.career.mapsPlayed < minimumCareerMaps) unmetRequirements.push(`careerMaps>=${minimumCareerMaps}`);
    if (t1MajorMaps < minimumT1MajorMaps) unmetRequirements.push(`t1MajorMaps>=${minimumT1MajorMaps}`);
    const stageBlocked = this.isStageBlocked(input.currentTeamTier, target.tier, target.roleOffer);
    if (stageBlocked) unmetRequirements.push(stageBlocked);
    if (input.invitationWindow === 'NORMAL' && target.tier === 'T1' && target.roleOffer !== 'SUBSTITUTE') unmetRequirements.push('transfer-window-required');
    if (input.randomRoll !== undefined && (!Number.isFinite(input.randomRoll) || input.randomRoll < 0 || input.randomRoll >= 1)) unmetRequirements.push('invalid-roll');

    const rankEligible = Number.isFinite(rank) && rank >= target.minimumRank && rank <= target.maximumRank;
    const eligible = rankEligible && unmetRequirements.length === 0;
    if (!rankEligible) risks.push(`VRS 排名不在目标区间 ${target.minimumRank}-${target.maximumRank}。`);
    if (recentRating < 1) risks.push('近期赛事 rating 低于 1.00。');
    if (player.energy < 45) risks.push('当前体能可能影响试训表现。');
    if (player.morale < 45) risks.push('当前士气偏低。');
    if (player.attributes.teamConflict > 55) risks.push('团队冲突倾向较高。');
    if (target.risk) risks.push(`合同风险：${target.risk}。`);

    const attributes = Object.entries(target.requiredAttributes);
    const attributeFit = attributes.length ? attributes.reduce((sum, [key, minimum]) => sum + this.clamp((player.attributes[key as keyof PlayerProfile['attributes']] - Number(minimum) + 20) * 2.5, 0, 100), 0) / attributes.length : 65;
    const roleFit = !target.requiredRoles?.length || target.requiredRoles.includes(player.role) ? 100 : 20;
    const regionFit = !target.preferredRegions?.length ? 65 : target.preferredRegions.includes(player.originRegion) ? 100 : target.region === player.originRegion ? 80 : 35;
    const careerFit = this.clamp(35 + Math.min(player.career.mapsPlayed, 300) / 6 + Math.min(t1MajorMaps, 100) / 2, 0, 100);
    const ratingFit = this.clamp((recentRating - 0.8) * 250, 0, 100);
    const wellbeing = this.clamp((player.morale + player.energy + (100 - player.attributes.teamConflict)) / 3, 0, 100);
    const fitScore = Math.round(this.clamp(attributeFit * .32 + ratingFit * .18 + careerFit * .18 + roleFit * .14 + regionFit * .1 + wellbeing * .08, 0, 100));
    const interestNoise = this.hash01(`${target.teamId}|${player.id}|${input.marketKey ?? 'legacy-market'}`);
    const interestScore = Math.round(this.clamp(fitScore * .75 + interestNoise * 25, 0, 100));
    const availability = !eligible ? 'UNREACHABLE' : interestScore >= (target.tier === 'T1' ? 78 : target.tier === 'T2' ? 65 : 55) ? 'RECOMMENDED' : 'PERSUADABLE';
    const expectedPlaytimePercentage = this.clamp(target.expectedPlaytimePercentage ?? (target.roleOffer === 'SUBSTITUTE' ? 30 : 85), 0, 100);
    const reasons = [target.reason, `综合适配度 ${fitScore}/100，俱乐部兴趣 ${interestScore}/100。`, roleFit === 100 ? `${player.role} 符合阵容需求。` : `${player.role} 不是首选角色。`, regionFit >= 80 ? `${player.originRegion} 地区背景符合偏好。` : '地区背景并非优先市场。'];
    const offerType: TransferTargetView['offerType'] = target.roleOffer === 'SUBSTITUTE' ? 'SUBSTITUTE' : target.contractLengthMonths !== undefined && target.contractLengthMonths <= 6 ? 'SHORT_TERM' : 'STANDARD';
    return { ...target, eligible, unmetRequirements, offerType, fitScore, interestScore, availability, reasons, risks, contract: { salaryPerMonth: target.salaryPerMonth, buyoutAmount: target.buyoutAmount, lengthMonths: target.contractLengthMonths ?? 12, role: target.roleOffer ?? 'STARTER', expectedPlaytimePercentage } };
  }

  private isStageBlocked(current: TeamTier | undefined, target: TeamTier, role: TransferTargetRecord['roleOffer']): string | null {
    if (!current) return null;
    if (current === 'T3' && target === 'T1' && role !== 'SUBSTITUTE') return 't3-to-t1-substitute-only';
    if (current === 'T3' && target === 'T2' && role !== 'STARTER' && role !== 'SUBSTITUTE') return 't3-to-t2-contract-required';
    if (current === 'T2' && target === 'T1' && role !== 'SUBSTITUTE') return 't2-to-t1-substitute-only';
    return null;
  }
  private careerThresholds(target: TransferTargetRecord): { rating: number; careerMaps: number; t1MajorMaps: number } {
    if (target.tier === 'T1' && target.roleOffer !== 'SUBSTITUTE') return { rating: 1.08, careerMaps: 120, t1MajorMaps: 30 };
    if (target.tier === 'T1') return { rating: 1.02, careerMaps: 60, t1MajorMaps: 10 };
    if (target.tier === 'T2' && target.roleOffer !== 'SUBSTITUTE') return { rating: .95, careerMaps: 25, t1MajorMaps: 0 };
    if (target.tier === 'T2') return { rating: .92, careerMaps: 10, t1MajorMaps: 0 };
    return { rating: .8, careerMaps: 0, t1MajorMaps: 0 };
  }
  private hash01(value: string): number { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967296; }
  private clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
  private opportunityScore(value: TransferTargetView): number { return value.fitScore + value.interestScore; }
}
