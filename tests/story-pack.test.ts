import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileSystemStoryEventPackReader, StoryRepositoryImpl } from '../src/engine/impl/story-repository';
import type { StoryEvent, Worldline } from '../src/engine/graph';

const root = process.cwd();
const eventDir = join(root, 'assets/story/events');
const worldlineDir = join(root, 'assets/story/worldlines');
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;

test('故事包清单与磁盘严格一致且仓储深验证通过', async () => {
  const manifest = await json<{ events: string[]; worldlines: string[] }>(join(root, 'assets/story/manifest.json'));
  const diskEvents = (await readdir(eventDir)).filter((name) => name.endsWith('.json')).sort();
  const diskWorldlines = (await readdir(worldlineDir)).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual([...manifest.events].sort(), diskEvents);
  assert.deepEqual([...manifest.worldlines].sort(), diskWorldlines);
  const reader = new FileSystemStoryEventPackReader(eventDir, readFile, readdir, worldlineDir);
  const repository = new StoryRepositoryImpl(reader);
  assert.equal((await repository.listEvents()).length, diskEvents.length);
  for (const name of diskEvents) assert.equal((await repository.findEvent(name.slice(0, -5)))?.id, name.slice(0, -5));
});

test('16 条故事线事件格式、世界线成员与链路均完整', async () => {
  const eventNames = (await readdir(eventDir)).filter((name) => name.endsWith('.json'));
  const events = await Promise.all(eventNames.map((name) => json<StoryEvent>(join(eventDir, name))));
  const byId = new Map(events.map((event) => [event.id, event]));
  assert.ok(events.length >= 120 && events.length <= 220, `事件数量应为 16 线 × 8 个剧情事件 + 通用随机池（当前 ${events.length}）`);
  for (const [index, event] of events.entries()) {
    assert.equal(event.id, eventNames[index]!.slice(0, -5));
    assert.match(event.title, /^[\u3400-\u9fff]{2,8}$/u, `${event.id} 标题应为 2-8 个汉字`);
    assert.ok(event.options.length >= 2 && event.options.length <= 3, event.id);
    assert.ok(new Set(event.options.map((option) => option.id)).size >= 2, event.id);
    if (event.worldlineId !== 'shared') assert.equal(event.period, 'NORMAL', `${event.id} 链式事件应使用 NORMAL 周期`);
    for (const option of event.options) {
      assert.ok(option.description?.trim(), event.id);
      assert.ok(option.successChance, event.id);
      assert.ok(option.outcome.successMessages?.length, event.id);
      assert.ok(option.outcome.failureMessages?.length, event.id);
      for (const next of [option.outcome.successNextEventId, option.outcome.failureNextEventId]) {
        if (typeof next === 'string') assert.ok(byId.has(next), `${event.id} -> ${next}`);
      }
    }
  }
  const worldlineNames = (await readdir(worldlineDir)).filter((name) => name.endsWith('.json'));
  const worldlines = await Promise.all(worldlineNames.map((name) => json<Worldline>(join(worldlineDir, name))));
  assert.equal(worldlines.length, 16, '应有 16 条故事线（天才 8 + 平凡 8）');
  assert.equal(new Set(worldlines.map((worldline) => worldline.id)).size, 16);
  for (const worldline of worldlines) {
    assert.ok(worldline.eventIds.length >= 4, worldline.id);
    assert.deepEqual(new Set(worldline.eventIds), new Set(events.filter((event) => event.worldlineId === worldline.id).map((event) => event.id)), worldline.id);
    const start = byId.get(worldline.startEventId);
    assert.ok(start, worldline.startEventId);
    assert.equal(start.period, 'NORMAL', worldline.startEventId);
    assert.ok(!start.phase || start.phase === 'PRE_TOURNAMENT', worldline.startEventId);
  }
});

test('故事线起始事件不依赖前置完成事件（开局可直接进入）', async () => {
  const worldlineNames = (await readdir(worldlineDir)).filter((name) => name.endsWith('.json'));
  for (const name of worldlineNames) {
    const worldline = await json<Worldline>(join(worldlineDir, name));
    const start = await json<StoryEvent>(join(eventDir, `${worldline.startEventId}.json`));
    assert.ok(!start.conditions.some((condition) => condition.type === 'COMPLETED_EVENT'), `${worldline.startEventId} 起始事件不应有前置完成条件`);
  }
});

test('队伍层级与触发规则符合新故事包', async () => {
  const teamsAsset = await json<{ teams: Array<{ id: string; standings: { bestRank: number } | null }> }>(join(root, 'assets/teams/teams.json'));
  const ranks = new Map(teamsAsset.teams.map((team) => [team.id, team.standings?.bestRank]));
  const academy = await json<{ schemaVersion: number; teams: Array<{ teamId: string; region: string; tier: string; storyOnly?: boolean; initialCandidate?: boolean; contractLengthMonths?: number; expectedPlaytimePercentage?: number }> }>(join(root, 'assets/academy/academy-teams.json'));
  assert.equal(academy.schemaVersion, 2);
  const defaults = academy.teams.filter((team) => team.initialCandidate && !team.storyOnly);
  assert.equal(new Set(academy.teams.map((team) => team.teamId)).size, academy.teams.length);
  for (const team of defaults) {
    assert.equal(team.tier, 'T3');
    assert.ok((ranks.get(team.teamId) ?? 0) > 100, `${team.teamId} must be outside VRS top 100`);
    assert.ok((team.contractLengthMonths ?? 0) > 0);
    assert.ok((team.expectedPlaytimePercentage ?? -1) >= 0 && (team.expectedPlaytimePercentage ?? 101) <= 100);
  }
  const rules = await json<{ rules: Array<{ eventId: string }> }>(join(root, 'assets/story/trigger-rules.json'));
  const events = await Promise.all((await readdir(eventDir)).filter((name) => name.endsWith('.json')).map((name) => json<StoryEvent>(join(eventDir, name))));
  const ids = new Set(events.map((event) => event.id));
  for (const rule of rules.rules) assert.ok(ids.has(rule.eventId), `trigger rule 引用的事件不存在: ${rule.eventId}`);
});
