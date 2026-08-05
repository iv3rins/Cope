import type { CareerGameStateRepository, CareerSaveEnvelope } from '../save-state';

export interface BrowserKeyValueStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

/** Browser adapter for the existing career-state repository port. */
export class LocalStorageStateRepository implements CareerGameStateRepository {
  private readonly prefix = 'cope:career-save:v1:';

  public constructor(private readonly storage: BrowserKeyValueStorage) {}

  public async load(slotId: string): Promise<CareerSaveEnvelope | null> {
    const raw = this.storage.getItem(this.storageKey(slotId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as CareerSaveEnvelope;
    if (parsed.format !== 'COPE_CAREER_SAVE' || !parsed.state?.player) throw new Error(`Invalid career save: ${slotId}.`);
    return this.copy(parsed);
  }

  public async save(slotId: string, envelope: CareerSaveEnvelope): Promise<void> {
    this.storage.setItem(this.storageKey(slotId), JSON.stringify(this.copy(envelope)));
  }

  public async listSlots(): Promise<readonly string[]> {
    const slots: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(this.prefix)) slots.push(decodeURIComponent(key.slice(this.prefix.length)));
    }
    return slots.sort();
  }

  public async delete(slotId: string): Promise<void> {
    this.storage.removeItem(this.storageKey(slotId));
  }

  private storageKey(slotId: string): string { return `${this.prefix}${encodeURIComponent(slotId)}`; }
  private copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
}
