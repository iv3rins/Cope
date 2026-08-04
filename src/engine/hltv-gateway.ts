import type { HltvModule } from '../hltv/hltv-module';
import type { TournamentCompletedFact, TournamentIntervention, TournamentInterventionAppliedFact } from '../hltv/tournament';
import type { Top20Ranking } from '../hltv/top20';
import type { TournamentResult } from '../hltv/tournament';
import type { PlayerProfile } from './profile';

/**
 * Engine 对 HLTV 的唯一依赖。
 * 用例实现只能经由此网关调用真实赛事生态能力，HLTV 模块绝不能反向导入 Engine。
 */
export interface EngineHltvGateway {
  freezeVrsSnapshot(input: { readonly season: number; readonly half: 1 | 2 }): Promise<string>;
  /** 将事件选择产生的赛事修正登记到 HLTV 模块，供本届赛事模拟与结算消费。 */
  applyTournamentIntervention(intervention: TournamentIntervention): Promise<TournamentInterventionAppliedFact>;
  settleTournament(fact: TournamentCompletedFact): Promise<void>;
  /** 将已完成赛事投影为年度 TOP20 证据；具体聚合由 HLTV 组合根实现。 */
  recordTop20Evidence?(input: { readonly result: TournamentResult; readonly player: PlayerProfile }): Promise<void>;
  findTop20(season: number): Promise<Top20Ranking>;
  synchronizeCareerHonors(profile: PlayerProfile, ranking: Top20Ranking): Promise<PlayerProfile>;
}

/** 组合根应将 HltvModule 适配为 EngineHltvGateway；此接口只声明装配关系。 */
export interface EngineHltvGatewayFactory {
  create(hltv: HltvModule): EngineHltvGateway;
}
