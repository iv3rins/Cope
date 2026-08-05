import assert from 'node:assert/strict';
import test from 'node:test';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import type { PlayerProfile } from '../src/engine/profile';

const player: PlayerProfile = {
  id: 'region-player', gameId: 'RegionPlayer', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 16, currentTeamId: null, currentContractId: null, role: 'ENTRY_FRAGGER',
  attributes: { aim: 60, gameSense: 55, leadership: 40, clutch: 50, consistency: 52, teamConflict: 20 },
  life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 10 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 70, worldlineId: 'rookie', completedEventIds: [], flags: [], schemaVersion: 1,
};

const context = { player, currentTeamId: null, opponentTeamId: null, randomRoll: 0.5, difficultyMode: 'HARDCORE' as const };

test('PLAYER_ORIGIN_REGION matches configured starting regions', () => {
  const evaluator = new ConditionEvaluatorImpl();
  assert.equal(evaluator.matches({ type: 'PLAYER_ORIGIN_REGION', regions: ['ASIA'] }, context), true);
  assert.equal(evaluator.matches({ type: 'PLAYER_ORIGIN_REGION', regions: ['EUROPE', 'OCEANIA'] }, context), false);
  assert.equal(evaluator.matches({ type: 'PLAYER_ORIGIN_REGION', regions: ['EUROPE'], negate: true }, context), true);
});
