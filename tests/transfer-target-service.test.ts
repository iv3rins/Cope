import assert from 'node:assert/strict';
import test from 'node:test';
import { TransferTargetServiceImpl } from '../src/hltv/transfer-target-service-impl';
import type { TransferTargetRecord } from '../src/hltv/transfer-targets';
import type { PlayerProfile } from '../src/engine/profile';

const basePlayer: PlayerProfile = {
  id: 'target-player', gameId: 'TargetPlayer', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [{ editionId: 'sample', year: 2026, fullName: 'Sample Major', organizerId: 'OTHER', level: 'MAJOR', placement: 'GROUP_EXIT', rating: 1.1, mapsPlayed: 12, champion: false, mvp: null, trophyAssetId: null }], originRegion: 'ASIA', age: 20, currentTeamId: null, currentContractId: null,
  freeAgencyStatus: 'FREE_AGENT', role: 'AWPER',
  attributes: { aim: 75, gameSense: 70, leadership: 50, clutch: 72, consistency: 68, teamConflict: 10 },
  life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 },
  career: { totalKills: 0, rating2: 1.1, headshotPercentage: 50, mapsPlayed: 100, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 70, energy: 70, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
};

const target = (tier: 'T1' | 'T2' | 'T3', overrides: Partial<TransferTargetRecord> = {}): TransferTargetRecord => ({
  teamId: `${tier.toLowerCase()}-team`, teamName: `${tier} Team`, region: 'ASIA', tier,
  minimumRank: tier === 'T1' ? 1 : tier === 'T2' ? 13 : 33,
  maximumRank: tier === 'T1' ? 12 : tier === 'T2' ? 32 : 64,
  requiredAttributes: { aim: 70, gameSense: 65 }, requiredRoles: ['AWPER'], salaryPerMonth: 1000,
  buyoutAmount: 0, reason: 'test', roleOffer: tier === 'T1' ? 'SUBSTITUTE' : 'STARTER', ...overrides,
});

const records = [target('T1'), target('T2'), target('T3')];
const ranks = { 't1-team': 5, 't2-team': 20, 't3-team': 40 };
const service = new TransferTargetServiceImpl(async () => ({ schemaVersion: 1, targets: records }));

test('requiredAttributes 与 requiredRoles 对 T1/T2/T3 eligibility 生效', async () => {
  const eligible = await service.list({ player: basePlayer, snapshotRanks: ranks, invitationWindow: 'TRANSFER_WINDOW' });
  assert.deepEqual(['t1-team', 't2-team', 't3-team'].map((teamId) => [teamId, eligible.find((item) => item.teamId === teamId)?.eligible]), [['t1-team', true], ['t2-team', true], ['t3-team', true]]);

  const weak = await service.list({ player: { ...basePlayer, attributes: { ...basePlayer.attributes, aim: 69 } }, snapshotRanks: ranks, invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(weak.every((item) => !item.eligible && item.unmetRequirements.includes('aim:70')));

  const wrongRole = await service.list({ player: { ...basePlayer, role: 'SUPPORT' }, snapshotRanks: ranks, invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(wrongRole.every((item) => !item.eligible && item.unmetRequirements.includes('role:AWPER')));
});

test('NORMAL window 阻止 T1 首发，但允许 T1 替补并不影响 T2/T3', async () => {
  const local = new TransferTargetServiceImpl(async () => ({ schemaVersion: 1, targets: [target('T1', { roleOffer: 'STARTER' }), target('T2'), target('T3')] }));
  const experiencedPlayer = {
    ...basePlayer,
    career: { ...basePlayer.career, mapsPlayed: 140 },
    tournamentArchive: [{ ...basePlayer.tournamentArchive[0]!, mapsPlayed: 35 }],
  };
  const normal = await local.list({ player: experiencedPlayer, snapshotRanks: ranks, invitationWindow: 'NORMAL' });
  assert.equal(normal.find((item) => item.tier === 'T1')?.eligible, false);
  assert.ok(normal.find((item) => item.tier === 'T1')?.unmetRequirements.includes('transfer-window-required'));
  assert.equal(normal.find((item) => item.tier === 'T2')?.eligible, true);
  assert.equal(normal.find((item) => item.tier === 'T3')?.eligible, true);
  const window = await local.list({ player: experiencedPlayer, snapshotRanks: ranks, invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(window.every((item) => item.eligible));
});

test('VRS rank 必须落在各层级目标区间', async () => {
  const views = await service.list({ player: basePlayer, snapshotRanks: { 't1-team': 13, 't2-team': 12, 't3-team': 32 }, invitationWindow: 'TRANSFER_WINDOW' });
  assert.ok(views.every((item) => !item.eligible));
});
