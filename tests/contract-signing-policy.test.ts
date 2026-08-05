import assert from 'node:assert/strict';
import test from 'node:test';
import { SaveContractService } from '../src/engine/impl/contract-service';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import type { PlayerProfile } from '../src/engine/profile';

const profile = (): PlayerProfile => ({
  id: 'rookie', gameId: 'Rookie', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 18, currentTeamId: null, currentContractId: null,
  freeAgencyStatus: 'UNSIGNED', role: 'AWPER', attributes: { aim: 60, gameSense: 60, leadership: 50, clutch: 60, consistency: 60, teamConflict: 0 },
  life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 60, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
});

const terms = (teamId: string) => ({ teamId, startedAt: '2026-01-01T00:00:00.000Z', endsAt: '2028-01-01T00:00:00.000Z', salaryPerMonth: 1_000, buyoutAmount: 0 });
const service = (tiers: Record<string, 'T1' | 'T2' | 'T3'>) => new SaveContractService([], new ConditionEvaluatorImpl(), (player) => ({ player, currentTeamId: player.currentTeamId, opponentTeamId: null, randomRoll: 0, difficultyMode: player.difficultyMode }), (teamId) => tiers[teamId]);

test('首次正式签约仅允许已知 T3，并写入不重复的 teamHistory', async () => {
  const contracts = service({ academy: 'T3', contender: 'T2' });
  const rejected = await contracts.sign({ profile: profile(), terms: terms('contender'), occurredAt: terms('contender').startedAt });
  assert.equal('reason' in rejected ? rejected.reason : null, 'FIRST_CONTRACT_REQUIRES_T3');
  const signed = await contracts.sign({ profile: profile(), terms: terms('academy'), occurredAt: terms('academy').startedAt });
  assert.ok('contract' in signed && !('reason' in signed));
  if ('contract' in signed) {
    assert.deepEqual(signed.profile.career.teamHistory, ['academy']);
    assert.equal(signed.profile.currentTeamId, 'academy');
    assert.equal(signed.profile.currentTeamTier, 'T3');
    assert.equal(signed.profile.currentContractId, signed.contract.id);
    assert.equal(signed.profile.freeAgencyStatus, 'SIGNED');
    assert.equal(signed.contract.status, 'ACTIVE');
  }
});

test('合同条款保留报价中的角色与预计出场率', async () => {
  const contracts = service({ academy: 'T3' });
  const signed = await contracts.sign({
    profile: profile(),
    terms: { ...terms('academy'), endsAt: '2026-07-01T00:00:00.000Z', role: 'SUBSTITUTE', expectedPlaytimePercentage: 35 },
    occurredAt: terms('academy').startedAt,
  });
  assert.ok('contract' in signed && !('reason' in signed));
  if ('contract' in signed) {
    assert.equal(signed.contract.endsAt, '2026-07-01T00:00:00.000Z');
    assert.equal(signed.contract.role, 'SUBSTITUTE');
    assert.equal(signed.contract.expectedPlaytimePercentage, 35);
  }
});

test('合同到期后进入自由市场并保留 EXPIRED 合同记录', async () => {
  const contracts = service({ academy: 'T3' });
  const signed = await contracts.sign({ profile: profile(), terms: { ...terms('academy'), endsAt: '2026-07-01T00:00:00.000Z' }, occurredAt: '2026-01-01T00:00:00.000Z' });
  assert.ok('contract' in signed && !('reason' in signed));
  if (!('contract' in signed) || 'reason' in signed) return;
  const early = await contracts.expire({ profile: signed.profile, contractId: signed.contract.id, occurredAt: '2026-06-30T00:00:00.000Z' });
  assert.equal('reason' in early ? early.reason : null, 'INVALID_TERMS');
  const expired = await contracts.expire({ profile: signed.profile, contractId: signed.contract.id, occurredAt: '2026-07-01T00:00:00.000Z' });
  assert.ok('contract' in expired && !('reason' in expired));
  if ('contract' in expired) {
    assert.equal(expired.contract.status, 'EXPIRED');
    assert.equal(expired.profile.currentTeamId, null);
    assert.equal(expired.profile.currentContractId, null);
    assert.equal(expired.profile.freeAgencyStatus, 'FREE_AGENT');
    assert.equal(expired.profile.releaseReason, 'CONTRACT_EXPIRED');
  }
});

test('首次签约未知 tier fail-closed', async () => {
  const rejected = await service({}).sign({ profile: profile(), terms: terms('unknown'), occurredAt: terms('unknown').startedAt });
  assert.equal('reason' in rejected ? rejected.reason : null, 'FIRST_CONTRACT_REQUIRES_T3');
});
