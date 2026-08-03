import type { HltvPlayerId, HltvTeamId } from './team';
import type { MatchFormat, TournamentId } from './tournament';

/** 单场比赛的对阵双方；阵容快照可同时包含玩家和 NPC。 */
export interface MatchTeamLineup {
  readonly teamId: HltvTeamId;
  readonly playerIds: readonly HltvPlayerId[];
  readonly isPlayerTeam: boolean;
}

/** 比赛模拟需要的统一选手输入，避免 hltv 依赖 engine.PlayerProfile。 */
export interface MatchPlayerSnapshot {
  readonly playerId: HltvPlayerId;
  readonly teamId: HltvTeamId;
  readonly nickname: string;
  readonly role: 'IGL' | 'AWPER' | 'ENTRY_FRAGGER' | 'SUPPORT' | 'LURKER';
  readonly aim: number;
  readonly gameSense: number;
  readonly leadership: number;
  readonly clutch: number;
  readonly consistency: number;
  readonly teamConflict: number;
  readonly morale: number;
  readonly energy: number;
  readonly age: number;
}

/** 单名选手的地图/系列赛表现面板，直接供 TournamentResult 和 TOP20 证据投影。 */
export interface MatchPlayerPerformance {
  readonly playerId: HltvPlayerId;
  readonly teamId: HltvTeamId;
  readonly maps: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly rating2_0: number;
  readonly adr: number;
  readonly kast: number;
  readonly headshotPercentage: number;
  readonly firstKills: number;
  readonly firstDeaths: number;
  readonly clutchesWon: number;
  readonly impactScore: number;
}

export interface MatchScore {
  readonly teamId: HltvTeamId;
  readonly mapsWon: number;
  readonly roundsWon: number;
}

export interface MatchSimulationInput {
  readonly matchId: string;
  readonly tournamentId: TournamentId;
  readonly format: MatchFormat;
  readonly left: MatchTeamLineup;
  readonly right: MatchTeamLineup;
  readonly players: readonly MatchPlayerSnapshot[];
  readonly mapPool: readonly string[];
  readonly pressure: number;
  /** [0, 1) 的回放随机数；实现应按固定顺序消费。 */
  readonly randomRoll: number;
}

export interface MatchSimulationResult {
  readonly matchId: string;
  readonly winnerTeamId: HltvTeamId;
  readonly loserTeamId: HltvTeamId;
  readonly scores: readonly MatchScore[];
  readonly mapsPlayed: readonly string[];
  readonly playerPerformances: readonly MatchPlayerPerformance[];
  readonly upset: boolean;
  readonly randomRoll: number;
}

/** 将选手能力、状态、职责和阵容化为单场比赛数据。 */
export interface MatchSimulationService {
  simulate(input: MatchSimulationInput): Promise<MatchSimulationResult>;
}
