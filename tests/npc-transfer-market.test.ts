import assert from 'node:assert/strict';
import test from 'node:test';
import { NpcTransferMarketServiceImpl } from '../src/engine/impl/npc-transfer-market-service';
import type { NpcPlayerProfile } from '../src/engine/npc';

const npc = (id: string, teamId: string | null, availability: NpcPlayerProfile['availability']): NpcPlayerProfile => ({ id, nickname: id, countryCode: 'INT', originRegion: 'EUROPE', age: 20, role: 'AWPER', attributes: { aim: 70, gameSense: 68, leadership: 55, clutch: 66, consistency: 69, teamConflict: 10 }, career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: teamId ? [teamId] : [] }, flags: [], currentTeamId: teamId, availability, origin: 'GENERATED_ACADEMY', generationSeed: 1 });

test('NPC manager fills an incomplete roster with an available candidate', async () => {
  const service = new NpcTransferMarketServiceImpl();
  const players = [npc('signed', 'team-a', 'SIGNED'), npc('free', null, 'AVAILABLE')];
  const result = await service.runManagerWindow({ teamId: 'team-a', at: '2027-01-01', maxMoves: 1, npcPlayers: players });
  assert.equal(result.decisions[0]?.type, 'SIGN');
  assert.equal(result.npcPlayers?.find((player) => player.id === 'free')?.currentTeamId, 'team-a');
  assert.equal(result.npcPlayers?.find((player) => player.id === 'free')?.availability, 'SIGNED');
});
