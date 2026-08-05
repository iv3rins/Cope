import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryStateRepository } from '../src/engine/impl/in-memory-state-repository';
import { SessionGuardedStateRepository, SupersededCareerSessionError } from '../src/engine/impl/session-guarded-state-repository';
import type { CareerSaveEnvelope } from '../src/engine/save-state';

const envelope = { format: 'COPE_CAREER_SAVE', version: 1, state: { schemaVersion: 1, savedAt: '2026-01-01', currentDate: '2026-01-01', season: 2026, careerHalf: 1, seasonPhase: 'ACTIVE', player: {} as never, contracts: [], npcPlayers: [], worldlines: [], currentStoryEventId: null, completedEventIds: [], scheduledTournaments: [], unsettledTournamentIds: [], pendingTournamentInterventions: [], activeVrsSnapshot: null } } satisfies CareerSaveEnvelope;

test('被重开取代的旧 game instance 无法覆盖同槽位新存档', async () => {
  const delegate = InMemoryStateRepository.getInstance();
  await delegate.delete('guarded-slot');
  let generation = 1;
  const oldSession = new SessionGuardedStateRepository(delegate, 'guarded-slot', 1, () => generation);
  await oldSession.save('guarded-slot', envelope);
  generation = 2;
  await assert.rejects(() => oldSession.save('guarded-slot', { ...envelope, version: 2 }), SupersededCareerSessionError);
  assert.equal((await delegate.load('guarded-slot'))?.version, 1);
});

test('session guard 不阻止其他槽位操作', async () => {
  const delegate = InMemoryStateRepository.getInstance();
  let generation = 2;
  const oldSession = new SessionGuardedStateRepository(delegate, 'guarded-slot', 1, () => generation);
  await oldSession.save('other-slot', envelope);
  assert.equal((await delegate.load('other-slot'))?.version, 1);
});
