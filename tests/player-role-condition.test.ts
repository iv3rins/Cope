import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import { StoryEngineImpl } from '../src/engine/impl/story-engine';
import { FileSystemStoryEventPackReader, StoryRepositoryImpl } from '../src/engine/impl/story-repository';
import type { PlayerProfile } from '../src/engine/profile';
import type { StoryEvent } from '../src/engine/graph';

const player: PlayerProfile = {
  id: 'role-player', gameId: 'RolePlayer', nationality: 'CN', difficultyMode: 'HARDCORE', isRetired: false,
  tournamentArchive: [], originRegion: 'ASIA', age: 18, currentTeamId: 'alterego', currentTeamTier: 'T3', currentContractId: 'contract-role-player',
  freeAgencyStatus: 'SIGNED', role: 'SUPPORT',
  attributes: { aim: 60, gameSense: 60, leadership: 40, clutch: 50, consistency: 55, teamConflict: 10 },
  life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 10 },
  career: { totalKills: 0, rating2: 1, headshotPercentage: 50, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
  trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
  morale: 60, energy: 70, worldlineId: 'rookie', completedEventIds: ['rookie-team-entry'], flags: [], schemaVersion: 1,
};
const context = { player, currentTeamId: player.currentTeamId, opponentTeamId: null, randomRoll: 0.5, difficultyMode: 'HARDCORE' as const };

test('PLAYER_ROLE 支持匹配、多角色匹配及 negate', () => {
  const evaluator = new ConditionEvaluatorImpl();
  assert.equal(evaluator.matches({ type: 'PLAYER_ROLE', roles: ['SUPPORT'] }, context), true);
  assert.equal(evaluator.matches({ type: 'PLAYER_ROLE', roles: ['AWPER', 'SUPPORT'] }, context), true);
  assert.equal(evaluator.matches({ type: 'PLAYER_ROLE', roles: ['AWPER'] }, context), false);
  assert.equal(evaluator.matches({ type: 'PLAYER_ROLE', roles: ['SUPPORT'], negate: true }, context), false);
  assert.equal(evaluator.matches({ type: 'PLAYER_ROLE', roles: ['IGL'], negate: true }, context), true);
});

test('StoryRepository 拒绝含非法 PLAYER_ROLE 的 JSON 事件', async () => {
  const invalid = {
    id: 'invalid-role', title: '非法角色', description: 'invalid', worldlineId: 'rookie', type: 'CHOICE', period: 'NORMAL',
    conditions: [{ type: 'PLAYER_ROLE', roles: ['COACH'] }], options: [], autoEffects: [],
  } as unknown as StoryEvent;
  const repository = new StoryRepositoryImpl({ readEvents: async () => [invalid], readWorldlines: async () => [] });
  assert.deepEqual(await repository.listEvents(), []);
  assert.equal(await repository.findEvent('invalid-role'), null);
});

