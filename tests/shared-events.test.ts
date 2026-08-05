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

test('FLAG 支线：mentor 支线按 FLAG + 年龄解锁，一生一次', async () => {
  const engine = await buildEngine();
  const withMentor = sampleProfile({ age: 18, flags: [{ id: 'mentor', name: '引路人', category: 'CAREER' }] });
  const events = await engine.findAvailableEvents({ profile: withMentor, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(events.some((event) => event.id === 'mentor-watch-live'), '有 mentor FLAG 且 18 岁应看到教练现场');
  const without = sampleProfile({ age: 18 });
  const withoutEvents = await engine.findAvailableEvents({ profile: without, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!withoutEvents.some((event) => event.id === 'mentor-watch-live'), '无 mentor FLAG 不可见');
  const young = sampleProfile({ age: 16, flags: [{ id: 'mentor', name: '引路人', category: 'CAREER' }] });
  const youngEvents = await engine.findAvailableEvents({ profile: young, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!youngEvents.some((event) => event.id === 'mentor-watch-live'), '有 FLAG 但 16 岁不可见（AGE 门控）');
});

test('FLAG 支线：rivalry 终局事件需要决赛周期 + 高龄 + 声望', async () => {
  const engine = await buildEngine();
  const ready = sampleProfile({ age: 24, flags: [{ id: 'rivalry', name: '宿敌', category: 'SOCIAL' }], narrativeMetrics: { FAME: 55, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const finale = await engine.findAvailableEvents({ profile: ready, period: 'FINAL_DECISIVE_MOMENT', randomRoll: 0.5 });
  assert.ok(finale.some((event) => event.id === 'rival-handshake'), '条件齐备时应看到领奖台握手');
  const mid = await engine.findAvailableEvents({ profile: ready, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!mid.some((event) => event.id === 'rival-handshake'), 'NORMAL 周期不应出现决赛事件');
  const young = sampleProfile({ age: 18, flags: [{ id: 'rivalry', name: '宿敌', category: 'SOCIAL' }], narrativeMetrics: { FAME: 55, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const youngFinale = await engine.findAvailableEvents({ profile: young, period: 'FINAL_DECISIVE_MOMENT', randomRoll: 0.5 });
  assert.ok(!youngFinale.some((event) => event.id === 'rival-handshake'), '18 岁不可见（AGE 门控）');
});

test('FLAG 支线：health 起点事件种下 health-warning，体检事件按精力门槛解锁', async () => {
  const engine = await buildEngine();
  const tired = sampleProfile({ flags: [{ id: 'health-warning', name: '健康警报', category: 'CAREER' }], life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 } });
  const lowEnergy = { ...tired, energy: 40 };
  const events = await engine.findAvailableEvents({ profile: lowEnergy, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(events.some((event) => event.id === 'health-checkup'), '有 health-warning 且 ENERGY<=45 应看到体检事件');
  const energetic = { ...tired, energy: 70 };
  const energeticEvents = await engine.findAvailableEvents({ profile: energetic, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!energeticEvents.some((event) => event.id === 'health-checkup'), '精力充足时不应触发体检');
});

test('FLAG 支线：家人线起点无门槛，中期节点按 FAME 解锁', async () => {
  const engine = await buildEngine();
  const rookie = sampleProfile({ age: 16 });
  const rookieEvents = await engine.findAvailableEvents({ profile: rookie, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(rookieEvents.some((event) => event.id === 'family-phone'), '16 岁新秀应看到家里电话（起点无门槛）');
  const withFamily = sampleProfile({ age: 20, flags: [{ id: 'family', name: '家人', category: 'LIFE' }], narrativeMetrics: { FAME: 30, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const mid = await engine.findAvailableEvents({ profile: withFamily, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(mid.some((event) => event.id === 'family-watch'), '有 family FLAG 且 FAME>=25 应看到妈妈的消息');
  const lowFame = sampleProfile({ age: 20, flags: [{ id: 'family', name: '家人', category: 'LIFE' }] });
  const lowFameEvents = await engine.findAvailableEvents({ profile: lowFame, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!lowFameEvents.some((event) => event.id === 'family-watch'), 'FAME 不足时中期节点不可见');
});

test('FLAG 支线：老板线起点用 ANY 双通道门控', async () => {
  const engine = await buildEngine();
  const byFame = sampleProfile({ narrativeMetrics: { FAME: 28, TEAM_STATUS: 20, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const fameEvents = await engine.findAvailableEvents({ profile: byFame, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(fameEvents.some((event) => event.id === 'owner-talk'), 'FAME>=25 通道应解锁老板谈话');
  const byStatus = sampleProfile({ narrativeMetrics: { FAME: 15, TEAM_STATUS: 35, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const statusEvents = await engine.findAvailableEvents({ profile: byStatus, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(statusEvents.some((event) => event.id === 'owner-talk'), 'TEAM_STATUS>=30 通道应解锁老板谈话');
  const neither = sampleProfile({ narrativeMetrics: { FAME: 15, TEAM_STATUS: 20, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 } });
  const neitherEvents = await engine.findAvailableEvents({ profile: neither, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!neitherEvents.some((event) => event.id === 'owner-talk'), '两个通道都不满足时不可见');
});

test('FLAG 支线：mentor-legacy 收束事件需决赛周期 + 高龄', async () => {
  const engine = await buildEngine();
  const ready = sampleProfile({ age: 25, flags: [{ id: 'mentor-legacy', name: '引路人的嘱托', category: 'CAREER' }] });
  const finale = await engine.findAvailableEvents({ profile: ready, period: 'FINAL_DECISIVE_MOMENT', randomRoll: 0.5 });
  assert.ok(finale.some((event) => event.id === 'mentor-trophy'), '决赛周期应看到举杯向天');
  const normal = await engine.findAvailableEvents({ profile: ready, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!normal.some((event) => event.id === 'mentor-trophy'), 'NORMAL 周期不应出现');
});

test('冲突支线：转会背刺线走 TRANSFER_WINDOW 周期 + CLUB_FAVOR 门控', async () => {
  const engine = await buildEngine();
  const approached = sampleProfile({ flags: [{ id: 'transfer-drama', name: '转会风波', category: 'CAREER' }], narrativeMetrics: { FAME: 30, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 20, FAN_REPUTATION: 10 } });
  const lowFavor = { ...approached, narrativeMetrics: { FAME: 30, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 20, FAN_REPUTATION: 10 } };
  const windowEvents = await engine.findAvailableEvents({ profile: lowFavor, period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  assert.ok(windowEvents.some((event) => event.id === 'transfer-leak'), '转会窗 + 低 CLUB_FAVOR 应看到照片泄露');
  const normalEvents = await engine.findAvailableEvents({ profile: lowFavor, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!normalEvents.some((event) => event.id === 'transfer-leak'), 'NORMAL 周期不应出现转会泄露');
  const highFavor = { ...approached, narrativeMetrics: { FAME: 30, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 60, FAN_REPUTATION: 10 } };
  const highFavorEvents = await engine.findAvailableEvents({ profile: highFavor, period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  assert.ok(!highFavorEvents.some((event) => event.id === 'transfer-leak'), 'CLUB_FAVOR 高时不被怀疑');
});

test('冲突支线：黑马羞辱线复仇局锁定决赛周期', async () => {
  const engine = await buildEngine();
  const ready = sampleProfile({ age: 22, flags: [{ id: 'upset', name: '恩怨局', category: 'SOCIAL' }] });
  const finale = await engine.findAvailableEvents({ profile: ready, period: 'FINAL_DECISIVE_MOMENT', randomRoll: 0.5 });
  assert.ok(finale.some((event) => event.id === 'upset-revenge'), '决赛周期应看到复仇局');
  const normal = await engine.findAvailableEvents({ profile: ready, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!normal.some((event) => event.id === 'upset-revenge'), 'NORMAL 周期不出现复仇局');
});
