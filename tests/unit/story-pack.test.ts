import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSystemStoryEventPackReader } from '../../src/engine/impl/story-repository';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'story');
const eventsDir = join(root, 'events');
const worldlinesDir = join(root, 'worldlines');

describe('事件包 assets/story', () => {
  it('能用 FileSystemStoryEventPackReader 加载所有事件与世界线', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const events = await reader.readEvents();
    const worldlines = await reader.readWorldlines();

    expect(events.length).toBe(16);
    expect(worldlines.length).toBe(4);
  });

  it('每个事件的 worldlineId 都存在', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const [events, worldlines] = await Promise.all([reader.readEvents(), reader.readWorldlines()]);
    const wlIds = new Set(worldlines.map((w) => w.id));
    for (const e of events) expect(wlIds.has(e.worldlineId), `${e.id} 引用了不存在世界线 ${e.worldlineId}`).toBe(true);
  });

  it('世界线引用的 startEventId 与 eventIds 都存在', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const [events, worldlines] = await Promise.all([reader.readEvents(), reader.readWorldlines()]);
    const evtIds = new Set(events.map((e) => e.id));
    for (const w of worldlines) {
      expect(evtIds.has(w.startEventId), `${w.id} 的 startEventId ${w.startEventId} 不存在`).toBe(true);
      for (const id of w.eventIds) expect(evtIds.has(id), `${w.id} 引用了不存在事件 ${id}`).toBe(true);
    }
  });

  it('选项的 nextEventId 指向同一世界线内已存在的事件', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const events = await reader.readEvents();
    const evtIds = new Set(events.map((e) => e.id));
    const byWorldline = new Map<string, Set<string>>();
    for (const e of events) {
      if (!byWorldline.has(e.worldlineId)) byWorldline.set(e.worldlineId, new Set());
      byWorldline.get(e.worldlineId)!.add(e.id);
    }
    for (const e of events) {
      for (const opt of e.options) {
        for (const next of [opt.outcome.successNextEventId, opt.outcome.failureNextEventId]) {
          if (!next) continue;
          expect(evtIds.has(next), `${e.id} 选项 ${opt.id} 引用不存在事件 ${next}`).toBe(true);
          expect(byWorldline.get(e.worldlineId)?.has(next), `${e.id} 的 ${next} 不在同一世界线`).toBe(true);
        }
      }
    }
  });

  it('每个事件至少一个选项，且每个选项有 label 和 outcome', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const events = await reader.readEvents();
    for (const e of events) {
      expect(e.options.length, `${e.id} 无选项`).toBeGreaterThan(0);
      for (const opt of e.options) {
        expect(opt.label, `${e.id}/${opt.id} 无 label`).toBeTruthy();
        expect(opt.outcome, `${e.id}/${opt.id} 无 outcome`).toBeTruthy();
      }
    }
  });

  it('事件字段与 StoryEvent 接口对齐（title/description/worldlineId/type/period/conditions/options/autoEffects）', async () => {
    const reader = new FileSystemStoryEventPackReader(eventsDir, readFile, readdir, worldlinesDir);
    const events = await reader.readEvents();
    const required = ['id', 'title', 'description', 'worldlineId', 'type', 'period', 'conditions', 'options', 'autoEffects'];
    for (const e of events) {
      for (const key of required) {
        expect(e, `${e.id} 缺少字段 ${key}`).toHaveProperty(key);
      }
    }
  });
});
