import type { CareerGameStateRepository, CareerSaveEnvelope } from '../save-state';

export class SupersededCareerSessionError extends Error {
  public constructor(slotId: string) { super(`Career session was superseded: ${slotId}.`); this.name = 'SupersededCareerSessionError'; }
}

export class SessionGuardedStateRepository implements CareerGameStateRepository {
  public constructor(
    private readonly delegate: CareerGameStateRepository,
    private readonly slotId: string,
    private readonly generation: number,
    private readonly currentGeneration: () => number,
  ) {}

  public load(slotId: string): Promise<CareerSaveEnvelope | null> { return this.delegate.load(slotId); }
  public listSlots(): Promise<readonly string[]> { return this.delegate.listSlots(); }

  public async save(slotId: string, envelope: CareerSaveEnvelope): Promise<void> {
    this.assertCurrent(slotId);
    await this.delegate.save(slotId, envelope);
  }

  public async delete(slotId: string): Promise<void> {
    this.assertCurrent(slotId);
    await this.delegate.delete(slotId);
  }

  private assertCurrent(slotId: string): void {
    if (slotId === this.slotId && this.currentGeneration() !== this.generation) throw new SupersededCareerSessionError(slotId);
  }
}
