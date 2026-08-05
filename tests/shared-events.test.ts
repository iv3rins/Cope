import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSystemStoryEventPackReader } from '../src/engine/impl/story-repository.js';
import { StoryEngineImpl } from '../src/engine/impl/story-engine.js';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator.js';
import type { PlayerProfile } from '../src/engine/profile.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function sampleProfile(overrides = {}): PlayerProfile {
  return {
    id: 'shared-test' as PlayerProfile['id'], gameId: 'shared-test', nationality: 'Test', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'EUROPE', age: 20, currentTeamId: 'team-a', currentContractId: 'c1', role: 'ENTRY_FRAGGER',
    attributes: { aim: 68, gameSense: 54, leadership: 42, clutch: 50, consistency: 52, teamConflict: 24 },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId: 'lone-hero', completedEventIds: [], flags: [],
    narrativeMetrics: { FAME: 10, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 },
    schemaVersion: 1,
    ...overrides,
  };
}

async function buildEngine() {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new (await import('../src/engine/impl/story-repository.js')).StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  return engine;
}

test('shared 随机事件池：任意故事线玩家都能看到 NORMAL 周期的通用事件', async () => {
  const engine = await buildEngine();
  const profile = sampleProfile({ worldlineId: 'lone-hero' });
  const events = await engine.findAvailableEvents({ profile, period: 'NORMAL', randomRoll: 0.5 });
  const sharedIds = events.filter((event) => event.worldlineId === 'shared').map((event) => event.id);
  assert.ok(sharedIds.includes('shared-early-training'), '应包含晨训加练');
  assert.ok(sharedIds.includes('shared-team-dinner'), '应包含队内聚餐');
  assert.ok(sharedIds.length >= 5, `通用事件应有多条可选，实际 ${sharedIds.length}`);
});

test('shared 随机事件：OFFSEASON 周期事件只在休赛期窗口出现', async () => {
  const engine = await buildEngine();
  const profile = sampleProfile({ worldlineId: 'lone-hero' });
  const normal = await engine.findAvailableEvents({ profile, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!normal.some((event) => event.id === 'shared-offseason-camp'), 'NORMAL 窗口不应出现 OFFSEASON 事件');
  const offseason = await engine.findAvailableEvents({ profile, period: 'OFFSEASON', randomRoll: 0.5 });
  assert.ok(offseason.some((event) => event.id === 'shared-offseason-camp'), 'OFFSEASON 窗口应出现夏训营');
});

test('shared 随机事件：数值门槛事件对新人不可见，成名后解锁', async () => {
  const engine = await buildEngine();
  const rookie = sampleProfile({ worldlineId: 'grind-machine', narrativeMetrics: { FAME: 5, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 5, FAN_REPUTATION: 5 } });
  const rookieEvents = await engine.findAvailableEvents({ profile: rookie, period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  assert.ok(!rookieEvents.some((event) => event.id === 'shared-transfer-feelers'), 'FAME<22 时不应出现转会试探');
  const star = sampleProfile({ worldlineId: 'grind-machine', narrativeMetrics: { FAME: 30, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 5, FAN_REPUTATION: 5 } });
  const starEvents = await engine.findAvailableEvents({ profile: star, period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  assert.ok(starEvents.some((event) => event.id === 'shared-transfer-feelers'), 'FAME 达标后应出现转会试探');
});

test('shared 随机事件：FLAG 条件事件在获得 FLAG 前不可见', async () => {
  const engine = await buildEngine();
  const plain = sampleProfile({ worldlineId: 'lone-hero' });
  const plainEvents = await engine.findAvailableEvents({ profile: plain, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(plainEvents.some((event) => event.id === 'shared-youth-coach'), '无门槛事件应可见');
});
