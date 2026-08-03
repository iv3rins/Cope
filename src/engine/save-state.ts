import type { VrsInviteSnapshot } from '../hltv/team';
import type { TournamentEdition, TournamentIntervention } from '../hltv/tournament';
import type { NpcPlayerProfile } from './npc';
import type { PlayerContract } from './contract';
import type { PlayerProfile } from './profile';
import type { Worldline } from './graph';

/**
 * 第一版完整生涯状态。
 * 所有字段必须是可 JSON 序列化的纯数据，不得把 Service、Repository、Map、Set 或函数写入存档。
 */
export interface CareerGameState {
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly currentDate: string;
  readonly season: number;
  readonly careerHalf: number;

  readonly player: PlayerProfile;
  readonly contracts: readonly PlayerContract[];
  readonly npcPlayers: readonly NpcPlayerProfile[];

  readonly worldlines: readonly Worldline[];
  readonly currentStoryEventId: string | null;
  readonly completedEventIds: readonly string[];

  readonly scheduledTournaments: readonly TournamentEdition[];
  readonly unsettledTournamentIds: readonly string[];
  readonly pendingTournamentInterventions: readonly TournamentIntervention[];
  readonly activeVrsSnapshot: VrsInviteSnapshot | null;
}

export interface CareerSaveEnvelope {
  readonly format: 'COPE_CAREER_SAVE';
  readonly version: number;
  readonly checksum?: string;
  readonly state: CareerGameState;
}

/** 完整状态仓储；实现可以是 localStorage、IndexedDB、文件或服务端。 */
export interface CareerGameStateRepository {
  load(slotId: string): Promise<CareerSaveEnvelope | null>;
  save(slotId: string, envelope: CareerSaveEnvelope): Promise<void>;
  listSlots(): Promise<readonly string[]>;
  delete(slotId: string): Promise<void>;
}

/** 存档迁移和结构校验接口，避免旧版本存档直接强转为新类型。 */
export interface CareerSaveMigrationService {
  validate(envelope: CareerSaveEnvelope): Promise<{ readonly valid: boolean; readonly errors: readonly string[] }>;
  migrate(envelope: CareerSaveEnvelope, targetVersion: number): Promise<CareerSaveEnvelope>;
}
