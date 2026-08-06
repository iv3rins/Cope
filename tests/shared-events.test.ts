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
  assert.ok(plainEvents.some((event) => event.id === 'shared-team-dinner'), '无门槛事件应可见');
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

test('生涯后期：老将事件按 AGE 门控，25 岁前不可见', async () => {
  const engine = await buildEngine();
  const young = sampleProfile({ age: 20 });
  const youngEvents = await engine.findAvailableEvents({ profile: young, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!youngEvents.some((event) => event.id === 'veteran-youth-challenge'), '20 岁不应看到后浪挑战');
  const veteran = sampleProfile({ age: 25 });
  const veteranEvents = await engine.findAvailableEvents({ profile: veteran, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(veteranEvents.some((event) => event.id === 'veteran-youth-challenge'), '25 岁应看到后浪挑战');
  const contract = await engine.findAvailableEvents({ profile: sampleProfile({ age: 26 }), period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  assert.ok(contract.some((event) => event.id === 'veteran-last-contract'), '26 岁转会窗应看到最后一份合同');
});

test('荣誉时刻：TOP20_RANK 上榜前不可见，上榜后按排名解锁', async () => {
  const engine = await buildEngine();
  const unranked = sampleProfile({});
  const unrankedEvents = await engine.findAvailableEvents({ profile: unranked, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!unrankedEvents.some((event) => event.id === 'honor-first-top20'), '未上榜时不应看到首次上榜事件');
  const top14 = sampleProfile({ trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [{ year: 2030, rank: 14 }] } });
  const top14Events = await engine.findAvailableEvents({ profile: top14, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(top14Events.some((event) => event.id === 'honor-first-top20'), '第 14 名应解锁首次上榜事件');
  assert.ok(!top14Events.some((event) => event.id === 'honor-mvp-target'), '第 14 名不应解锁 TOP5 事件');
  const top3 = sampleProfile({ trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [{ year: 2030, rank: 3 }] } });
  const top3Events = await engine.findAvailableEvents({ profile: top3, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(top3Events.some((event) => event.id === 'honor-mvp-target'), '第 3 名应解锁研究你事件');
});

test('转会确认系统事件：短租/长约选项携带正确合同期限，decide 后效果落地', async () => {
  const engine = await buildEngine();
  const profile = sampleProfile({});
  const events = await engine.findAvailableEvents({ profile, period: 'TRANSFER_WINDOW', randomRoll: 0.5 });
  const confirm = events.find((event) => event.id === 'transfer-confirmation');
  assert.ok(confirm, 'TRANSFER_WINDOW 应出现报价确认事件');
  assert.equal(confirm.system, true);
  assert.equal(confirm.consumesTransferOffer, true);
  const shortEffect = confirm.options.find((option) => option.id === 'accept-short-term')?.outcome.successEffects.find((effect) => effect.type === 'TEAM_TRANSFER');
  const longEffect = confirm.options.find((option) => option.id === 'accept-long-term')?.outcome.successEffects.find((effect) => effect.type === 'TEAM_TRANSFER');
  assert.equal(shortEffect?.lengthMonths, 12, '短租应为 1 年（12 个月）');
  assert.equal(longEffect?.lengthMonths, 36, '长约应为 3 年（36 个月）');
  const shortResult = await engine.decide({ profile, decision: { eventId: 'transfer-confirmation', optionId: 'accept-short-term', randomRoll: 0.2 } });
  assert.equal(shortResult.appliedEffects.find((effect) => effect.type === 'TEAM_TRANSFER')?.lengthMonths, 12);
  const longResult = await engine.decide({ profile, decision: { eventId: 'transfer-confirmation', optionId: 'accept-long-term', randomRoll: 0.2 } });
  assert.equal(longResult.appliedEffects.find((effect) => effect.type === 'TEAM_TRANSFER')?.lengthMonths, 36);
});
