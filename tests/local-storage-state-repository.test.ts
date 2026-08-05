import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalStorageStateRepository, type BrowserKeyValueStorage } from '../src/engine/impl/local-storage-state-repository';
import type { CareerSaveEnvelope } from '../src/engine/save-state';

class MemoryStorage implements BrowserKeyValueStorage {
  private readonly values = new Map<string, string>();
  public get length() { return this.values.size; }
  public getItem(key: string) { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string) { this.values.set(key, value); }
  public removeItem(key: string) { this.values.delete(key); }
  public key(index: number) { return [...this.values.keys()][index] ?? null; }
}

const envelope = (): CareerSaveEnvelope => ({
  format: 'COPE_CAREER_SAVE', version: 1,
  state: {
    schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', currentDate: '2026-01-01T00:00:00.000Z', season: 2026, careerHalf: 1,
    player: { id: 'slot/一', gameId: 'Slot', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false, tournamentArchive: [], originRegion: 'ASIA', age: 18, currentTeamId: null, currentContractId: null, role: 'AWPER', attributes: { aim: 60, gameSense: 60, leadership: 50, clutch: 60, consistency: 60, teamConflict: 0 }, life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 }, career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] }, trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] }, morale: 60, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1 },
    contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null,
  },
});

test('localStorage repository saves, lists, deep-copies and deletes namespaced slots', async () => {
  const storage = new MemoryStorage();
  storage.setItem('unrelated', 'keep');
  const repository = new LocalStorageStateRepository(storage);
  await repository.save('slot/一', envelope());
  assert.deepEqual(await repository.listSlots(), ['slot/一']);
  const loaded = await repository.load('slot/一');
  assert.ok(loaded);
  (loaded.state.player as { gameId: string }).gameId = 'Mutated';
  assert.equal((await repository.load('slot/一'))?.state.player.gameId, 'Slot');
  await repository.delete('slot/一');
  assert.equal(await repository.load('slot/一'), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('localStorage repository rejects malformed career saves', async () => {
  const storage = new MemoryStorage();
  storage.setItem('cope:career-save:v1:broken', '{"format":"WRONG"}');
  await assert.rejects(() => new LocalStorageStateRepository(storage).load('broken'), /Invalid career save/);
});
