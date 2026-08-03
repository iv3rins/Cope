import type { HltvTeamRepository, VrsRankingProvider, VrsSnapshotRepository } from './team';
import type { TournamentFactRepository, TournamentService } from './tournament';
import type { Top20EvidenceRepository, Top20RankingService } from './top20';
import type { MatchSimulationService } from './match';

/**
 * HLTV 模块组合接口。
 * Engine 只能依赖此接口中的能力，不可导入 HLTV 具体实现或资源读取代码。
 */
export interface HltvModule {
  readonly teams: HltvTeamRepository;
  readonly vrs: VrsRankingProvider;
  readonly snapshots: VrsSnapshotRepository;
  readonly tournaments: TournamentService;
  readonly tournamentFacts: TournamentFactRepository;
  readonly top20Evidence: Top20EvidenceRepository;
  readonly top20: Top20RankingService;
  /** 单场比赛数据生成器，赛事服务通过它得到玩家/NPC面板。 */
  readonly matches: MatchSimulationService;
}
