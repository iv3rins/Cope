import assert from 'node:assert/strict';
import test from 'node:test';
import { RetirementServiceImpl } from '../src/engine/impl/retirement-service';
import { RetirementSummaryServiceImpl } from '../src/engine/impl/retirement-summary-service';
import type { PlayerProfile } from '../src/engine/profile';

const player = (): PlayerProfile => ({
  id: 'veteran', gameId: 'Veteran', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false, tournamentArchive: [], originRegion: 'ASIA', age: 40, currentTeamId: 'team', currentTeamTier: 'T1', currentContractId: 'contract', freeAgencyStatus: 'SIGNED', role: 'AWPER', attributes: { aim: 50, gameSense: 70, leadership: 55, clutch: 60, consistency: 50, teamConflict: 10 }, life: { balance: 0, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 0 }, career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: ['team'] }, trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] }, morale: 60, energy: 50, worldlineId: 'comeback', completedEventIds: [], flags: [], schemaVersion: 1,
});

test('retirement preserves reason and summary exposes it', async () => {
  const retired = await new RetirementServiceImpl().retire({ player: player(), retiredAt: '2048-01-01T00:00:00.000Z', reason: '达到职业生涯自然退役年龄' });
  assert.equal(retired.isRetired, true);
  assert.equal(retired.currentTeamId, null);
  assert.equal(retired.currentContractId, null);
  assert.equal(retired.retirementReason, '达到职业生涯自然退役年龄');
  const summary = await new RetirementSummaryServiceImpl().generate({ player: retired });
  assert.equal(summary.player.reason, retired.retirementReason);
});
