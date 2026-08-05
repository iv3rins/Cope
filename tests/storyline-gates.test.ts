import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConditionEvaluatorImpl } from '../src/engine/impl/condition-evaluator';
import { StoryEngineImpl } from '../src/engine/impl/story-engine';
import { FileSystemStoryEventPackReader, StoryRepositoryImpl } from '../src/engine/impl/story-repository';
import type { PlayerProfile } from '../src/engine/profile';
import type { StoryEvent } from '../src/engine/graph';

const root = process.cwd();

function sampleProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'gate-test' as PlayerProfile['id'], gameId: 'gate-test', nationality: 'Test', difficultyMode: 'HARDCORE', isRetired: false,
    tournamentArchive: [], originRegion: 'EUROPE', age: 20, currentTeamId: 'team-a', currentContractId: 'c1', role: 'ENTRY_FRAGGER',
    attributes: { aim: 68, gameSense: 54, leadership: 42, clutch: 50, consistency: 52, teamConflict: 24 },
    life: { balance: 500, currentJob: 'NONE', incomePerWeek: 0, expensePerWeek: 0, stress: 12 },
    career: { totalKills: 0, rating2: 1, headshotPercentage: 0, mapsPlayed: 0, clutchWon: 0, careerEarnings: 0, teamHistory: [] },
    trophies: { majorChampionships: 0, otherSTierTitles: 0, mvpAwards: 0, evpAwards: 0, top20Records: [] },
    morale: 60, energy: 75, worldlineId: 'lone-hero', completedEventIds: ['lone-hero-debut'], flags: [],
    narrativeMetrics: { FAME: 10, TEAM_STATUS: 50, TEAM_RELATIONSHIP: 50, FORM: 50, CLUB_FAVOR: 10, FAN_REPUTATION: 10 },
    schemaVersion: 1,
    ...overrides,
  };
}

test('主线门控条件（ANY 双通道）按数值正确评估', () => {
  const evaluator = new ConditionEvaluatorImpl();
  const base = { player: sampleProfile(), currentTeamId: 'team-a', opponentTeamId: null, randomRoll: 0.5, difficultyMode: 'HARDCORE' as const };
  const gate = {
    type: 'ANY' as const,
    conditions: [
      { type: 'ATTRIBUTE' as const, attribute: 'CLUTCH' as const, minimum: 58 },
      { type: 'NARRATIVE_METRIC' as const, metric: 'FAME' as const, minimum: 15 },
    ],
  };
  // 双通道均不达标 → 不通过
  assert.equal(evaluator.matches(gate, base), false);
  // 通道 1 达标（CLUTCH ≥ 58）
  assert.equal(evaluator.matches(gate, { ...base, player: sampleProfile({ attributes: { ...base.player.attributes, clutch: 60 } }) }), true);
  // 通道 2 达标（FAME ≥ 15）
  assert.equal(evaluator.matches(gate, { ...base, player: sampleProfile({ narrativeMetrics: { ...base.player.narrativeMetrics!, FAME: 20 } }) }), true);
  // PLAYER_STAT 上限条件（如伤病线 ENERGY ≤ 55）
  const maxGate = { type: 'ANY' as const, conditions: [{ type: 'PLAYER_STAT' as const, stat: 'ENERGY' as const, maximum: 55 }] };
  assert.equal(evaluator.matches(maxGate, base), false);
  assert.equal(evaluator.matches(maxGate, { ...base, player: sampleProfile({ energy: 50 }) }), true);
});

test('主线事件在数值不达标时被条件过滤，达标后出现', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });

  const find = async (player: PlayerProfile) => {
    const events = await engine.findAvailableEvents({ profile: player, period: 'NORMAL', randomRoll: 0.5 });
    return events.some((event) => event.id === 'lone-hero-anger');
  };

  // 已完 debut，但 CLUTCH/FAME 均不达标 → 主线第 2 事件不出现
  const underpowered = sampleProfile();
  assert.equal(await find(underpowered), false);

  // 已完成 debut 且 CLUTCH 达标 → 主线事件出现（状态驱动）
  const clutched = sampleProfile({ attributes: { ...underpowered.attributes, clutch: 60 } });
  assert.equal(await find(clutched), true);

  // 无链式顺序门控：未完成 debut 但数值达标 → 事件同样出现（纯状态驱动）
  const notStarted = sampleProfile({ completedEventIds: [], attributes: { ...underpowered.attributes, clutch: 60 } });
  assert.equal(await find(notStarted), true, '剧情推进只看属性状态，不依赖上一事件完成');
});

test('非主线 worldline 不会误触发其它线的主线事件', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  const grinder = sampleProfile({ worldlineId: 'grind-machine', completedEventIds: [] });
  const events = await engine.findAvailableEvents({ profile: grinder, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!events.some((event) => event.id === 'lone-hero-debut'), '其它线的起始事件不应出现在本线');
});

test('跨线转换：选择转换选项后 worldlineId 切换并进入目标线起始事件', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  const fallingStar = sampleProfile({ worldlineId: 'falling-star', completedEventIds: ['falling-star-mvp', 'falling-star-offer', 'falling-star-burnout'], life: { ...sampleProfile().life, stress: 55 } });
  const result = await engine.decide({
    profile: fallingStar,
    decision: { eventId: 'falling-star-return', optionId: 'demote', randomRoll: 0.2 },
  });
  assert.equal(result.succeeded, true);
  assert.equal(result.profile.worldlineId, 'late-bloomer', '选择降薪重来后应切入老将线');
  assert.equal(result.nextEventId, 'late-bloomer-start', '下一事件应为目标线起始事件');
  const available = await engine.findAvailableEvents({ profile: result.profile, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(available.some((event) => event.id === 'late-bloomer-start'), '目标线起始事件应在转换后可触发');
});

test('跨线转换：不选转换选项则保持原线并回到原线结局', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  const versionVictim = sampleProfile({ worldlineId: 'version-victim', completedEventIds: ['version-victim-glory', 'version-victim-patch', 'version-victim-slump', 'version-victim-rebuild'], attributes: { ...sampleProfile().attributes, gameSense: 72 } });
  const result = await engine.decide({
    profile: versionVictim,
    decision: { eventId: 'version-victim-answer', optionId: 'embrace', randomRoll: 0.2 },
  });
  assert.equal(result.profile.worldlineId, 'version-victim', '不选转指挥应保持原线');
  assert.equal(result.nextEventId, null, '无链式顺序：事件完成后回到状态驱动');
});

test('所有含 WORLDLINE_CHANGE 的选项其转换目标均为合法 worldline 的起始事件', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const worldlines = await reader.readWorldlines();
  const startIds = new Set(worldlines.map((worldline) => worldline.startEventId));
  const eventNames = (await readdir(join(root, 'assets/story/events'))).filter((name) => name.endsWith('.json'));
  const events = await Promise.all(eventNames.map(async (name) => JSON.parse(await readFile(join(root, 'assets/story/events', name), 'utf8')) as StoryEvent));
  for (const event of events) {
    if (!event.id.includes('-to-')) continue;
    for (const option of event.options) {
      const hasWorldlineChange = [...option.outcome.successEffects, ...option.outcome.failureEffects].some((effect) => effect.type === 'WORLDLINE_CHANGE');
      if (!hasWorldlineChange) continue;
      for (const next of [option.outcome.successNextEventId, option.outcome.failureNextEventId]) {
        assert.ok(startIds.has(next ?? ''), `${event.id} 转换目标 ${next} 必须是目标线起始事件`);
      }
    }
  }
});

test('年龄窗口：16 岁即使属性全达标也看不到后续剧情，随年龄增长解锁', async () => {
  const reader = new FileSystemStoryEventPackReader(join(root, 'assets/story/events'), readFile, readdir, join(root, 'assets/story/worldlines'));
  const repository = new StoryRepositoryImpl(reader);
  const engine = new StoryEngineImpl(repository, new ConditionEvaluatorImpl(), { successChancePolicy: { adjust: ({ baseChance }) => baseChance } });
  const highAttributes = { ...sampleProfile().attributes, clutch: 80, aim: 80 };
  const at16 = sampleProfile({ age: 16, attributes: highAttributes });
  const at16Events = await engine.findAvailableEvents({ profile: at16, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(!at16Events.some((event) => event.id === 'lone-hero-anger'), '16 岁不应看到 AGE>=17 的后续剧情');
  const at18 = sampleProfile({ age: 18, attributes: highAttributes });
  const at18Events = await engine.findAvailableEvents({ profile: at18, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(at18Events.some((event) => event.id === 'lone-hero-anger'), '18 岁且属性达标后剧情解锁');
  const at24 = sampleProfile({ age: 24, attributes: highAttributes });
  const at24Events = await engine.findAvailableEvents({ profile: at24, period: 'NORMAL', randomRoll: 0.5 });
  assert.ok(at24Events.some((event) => event.id === 'lone-hero-finale'), '24 岁后终局剧情解锁');
});
