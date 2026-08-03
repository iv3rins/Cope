import type { HltvPlayerId } from '../../hltv/team';
import type { PlayerProfile, PlayerProfileRepository } from '../profile';
import type { CareerGameStateRepository, CareerSaveEnvelope } from '../save-state';

/**
 * Demo-only process-local storage. Every boundary performs a recursive copy so callers
 * cannot mutate the Map's state through a reference obtained from this repository.
 */
export class InMemoryStateRepository implements CareerGameStateRepository, PlayerProfileRepository {
  private static instance: InMemoryStateRepository | undefined;

  private readonly saves = new Map<string, CareerSaveEnvelope>();
  private readonly profiles = new Map<HltvPlayerId, PlayerProfile>();

  private constructor() {}

  public static getInstance(): InMemoryStateRepository {
    if (!InMemoryStateRepository.instance) {
      InMemoryStateRepository.instance = new InMemoryStateRepository();
    }
    return InMemoryStateRepository.instance;
  }

  public async load(slotId: string): Promise<CareerSaveEnvelope | null> {
    const envelope = this.saves.get(slotId);
    return envelope ? this.copy(envelope) : null;
  }

  public async save(slotId: string, envelope: CareerSaveEnvelope): Promise<void>;
  public async save(profile: PlayerProfile): Promise<void>;
  public async save(slotOrProfile: string | PlayerProfile, envelope?: CareerSaveEnvelope): Promise<void> {
    if (typeof slotOrProfile === 'string') {
      if (!envelope) throw new Error('CareerGameStateRepository.save requires an envelope.');
      const copy = this.copy(envelope);
      this.saves.set(slotOrProfile, copy);
      this.profiles.set(copy.state.player.id, this.copy(copy.state.player));
      return;
    }
    this.profiles.set(slotOrProfile.id, this.copy(slotOrProfile));
  }

  public async findById(playerId: HltvPlayerId): Promise<PlayerProfile | null> {
    const profile = this.profiles.get(playerId);
    return profile ? this.copy(profile) : null;
  }

  public async listSlots(): Promise<readonly string[]> {
    return [...this.saves.keys()];
  }

  public async delete(slotId: string): Promise<void> {
    const envelope = this.saves.get(slotId);
    this.saves.delete(slotId);
    if (envelope) this.profiles.delete(envelope.state.player.id);
  }

  private copy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
