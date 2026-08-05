import assert from 'node:assert/strict';
import test from 'node:test';
import { TransferTargetServiceImpl } from '../src/hltv/transfer-target-service-impl';
import type { PlayerProfile } from '../src/engine/profile';
import type { TransferTargetRecord } from '../src/hltv/transfer-targets';

const player: PlayerProfile = { id: 'fit-player', gameId: 'fit', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false, originRegion: 'ASIA', age: 22, currentTeamId: null, currentContractId: null, freeAgencyStatus: 'FREE_AGENT', role: 'AWPER', attributes: { aim: 78, gameSense: 75, leadership: 60, clutch: 72, consistency: 74, teamConflict: 10 }, life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 }, career: { totalKills: 0, rating2: 1.1, headshotPercentage: 50, mapsPlayed: 180, clutchWon: 0, careerEarnings: 0, teamHistory: [] }, trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] }, morale: 80, energy: 80, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1, tournamentArchive: [{ editionId: 'a', year: 2026, fullName: 'Major', organizerId: 'OTHER', level: 'MAJOR', placement: 'PLAYOFF', rating: 1.15, mapsPlayed: 40, champion: false, mvp: null, trophyAssetId: null }] };
const record = (id: string, region: 'ASIA' | 'EUROPE', tier: 'T1' | 'T3' = 'T1'): TransferTargetRecord => ({ teamId: id, teamName: id, region, tier, minimumRank: tier === 'T1' ? 1 : 33, maximumRank: tier === 'T1' ? 12 : 99, requiredAttributes: { aim: 70 }, requiredRoles: ['AWPER'], salaryPerMonth: 1000, buyoutAmount: 0, reason: 'fit', roleOffer: tier === 'T1' ? 'SUBSTITUTE' : 'STARTER', minimumRecentRating: 1.1, minimumCareerMaps: 100, minimumT1MajorMaps: 30, preferredRegions: [region], risk: 'LOW', expectedPlaytimePercentage: 50 });

test('履历硬门槛与地区 fit 独立呈现', async () => {
  const service = new TransferTargetServiceImpl(async () => ({ schemaVersion: 2, targets: [record('asia', 'ASIA'), record('eu', 'EUROPE')] }));
  const views = await service.list({ player, snapshotRanks: { asia: 5, eu: 6 }, marketKey: '2026-h1', invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(views.find(v => v.teamId === 'asia')!.fitScore > views.find(v => v.teamId === 'eu')!.fitScore);
  const rookie = { ...player, career: { ...player.career, mapsPlayed: 10 }, tournamentArchive: [] };
  const blocked = await service.list({ player: rookie, snapshotRanks: { asia: 5, eu: 6 }, marketKey: 'x', invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(blocked.every(v => !v.eligible && v.unmetRequirements.includes('careerMaps>=100')));
  assert.ok(blocked.every(v => v.fitScore >= 0 && v.fitScore <= 100));
});

test('各队兴趣按 teamId+player.id+marketKey 独立且稳定', async () => {
  const service = new TransferTargetServiceImpl(async () => ({ schemaVersion: 2, targets: [record('alpha', 'ASIA'), record('beta', 'ASIA')] }));
  const input = { player, snapshotRanks: { alpha: 5, beta: 6 }, marketKey: 'stable', randomRoll: .99, invitationWindow: 'TRANSFER_WINDOW' as const };
  const first = await service.list(input); const second = await service.list({ ...input, randomRoll: 0 });
  assert.deepEqual(first.map(v => [v.teamId, v.interestScore]), second.map(v => [v.teamId, v.interestScore]));
  assert.notEqual(first.find(v => v.teamId === 'alpha')!.interestScore, first.find(v => v.teamId === 'beta')!.interestScore);
});

test('availability 输出三级且 T3 合规候选至少一个推荐', async () => {
  const weak = { ...player, attributes: { ...player.attributes, aim: 20 } };
  const { minimumRecentRating: _rating, minimumCareerMaps: _career, minimumT1MajorMaps: _t1, ...entryBase } = record('entry', 'ASIA', 'T3');
  const targets = [record('elite', 'EUROPE'), { ...entryBase, requiredAttributes: {} }];
  const service = new TransferTargetServiceImpl(async () => ({ schemaVersion: 2, targets }));
  const views = await service.list({ player: weak, snapshotRanks: { elite: 5, entry: 40 }, marketKey: 'tiers', invitationWindow: 'TRANSFER_WINDOW' });
  assert.equal(views.find(v => v.teamId === 'elite')!.availability, 'UNREACHABLE');
  assert.equal(views.find(v => v.teamId === 'entry')!.availability, 'RECOMMENDED');
  assert.ok(['RECOMMENDED', 'PERSUADABLE', 'UNREACHABLE'].includes(views[0]!.availability));
});

test('市场按适配度与兴趣综合排序并最多返回四家', async () => {
  const targets = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map((id, index) => ({ ...record(id, index % 2 ? 'EUROPE' : 'ASIA', 'T3'), minimumRecentRating: 0.8, minimumCareerMaps: 0, minimumT1MajorMaps: 0, requiredAttributes: { aim: 60 + index } }));
  const ranks = Object.fromEntries(targets.map((target, index) => [target.teamId, 40 + index]));
  const service = new TransferTargetServiceImpl(async () => ({ schemaVersion: 2, targets }));
  const views = await service.list({ player, snapshotRanks: ranks, marketKey: 'top-four', invitationWindow: 'TRANSFER_WINDOW' });
  assert.equal(views.length, 4);
  for (let index = 1; index < views.length; index += 1) {
    const previous = views[index - 1]!;
    const current = views[index]!;
    assert.ok(previous.fitScore + previous.interestScore >= current.fitScore + current.interestScore);
  }
});
