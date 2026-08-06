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

test('findCandidates 按短板优先选择符合角色的自由球员', async () => {
  const service = new NpcTransferMarketServiceImpl();
  const awper = { ...npc('awper', null, 'AVAILABLE'), role: 'AWPER' as const, attributes: { aim: 72, gameSense: 60, leadership: 50, clutch: 64, consistency: 66, teamConflict: 12 } };
  const igl = { ...npc('igl', null, 'AVAILABLE'), role: 'IGL' as const, attributes: { aim: 60, gameSense: 70, leadership: 80, clutch: 58, consistency: 68, teamConflict: 10 } };
  const fragger = { ...npc('fragger', null, 'AVAILABLE'), role: 'ENTRY_FRAGGER' as const, attributes: { aim: 90, gameSense: 70, leadership: 45, clutch: 80, consistency: 72, teamConflict: 14 } };
  const pool = [fragger, awper, igl];

  const forAwper = await service.findCandidates({ teamId: 'team-a', weaknesses: ['NO_AWPer'], maxResults: 1, npcPlayers: pool });
  assert.equal(forAwper[0]?.playerId, 'awper', 'NO_AWPer 短板应优先推荐 AWPER 角色');
  assert.ok(forAwper[0]!.fitScore > 0);

  const forIgl = await service.findCandidates({ teamId: 'team-a', weaknesses: ['NO_IGL'], maxResults: 1, npcPlayers: pool });
  assert.equal(forIgl[0]?.playerId, 'igl', 'NO_IGL 短板应优先推荐 IGL 角色');

  const generic = await service.findCandidates({ teamId: 'team-a', weaknesses: ['INCOMPLETE_ROSTER'], maxResults: 1, npcPlayers: pool });
  assert.equal(generic[0]?.playerId, 'fragger', '无角色短板时按实力推荐最强自由球员');

  assert.equal(forAwper[0]!.source, 'NPC');
  assert.ok(forAwper[0]!.expectedSalaryPerMonth > 0, '候选应携带按实力评估的薪资');
  assert.equal(forAwper[0]!.buyoutCost, 0, '自由球员无买断费');
});

test('runManagerWindow 无短板时不签约任何自由球员', async () => {
  const service = new NpcTransferMarketServiceImpl();
  const roster = [npc('a1', 'team-a', 'SIGNED'), npc('a2', 'team-a', 'SIGNED'), npc('a3', 'team-a', 'SIGNED'), npc('a4', 'team-a', 'SIGNED'), npc('a5', 'team-a', 'SIGNED')];
  const free = { ...npc('free', null, 'AVAILABLE'), role: 'AWPER' as const };
  const result = await service.runManagerWindow({ teamId: 'team-a', at: '2027-01-01', maxMoves: 1, npcPlayers: [...roster, free] });
  assert.equal(result.decisions.length, 0, '满员队伍不应再签约');
  assert.equal(result.npcPlayers?.find((player) => player.id === 'free')?.availability, 'AVAILABLE');
});
