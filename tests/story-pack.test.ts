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

const opportunity = (event: StoryEvent): boolean => event.period === 'TRANSFER_WINDOW' && event.options.some((option) => option.outcome.successEffects.some((effect) => effect.type === 'TEAM_TRANSFER'));
const hasAgencyGuards = (conditions: readonly any[]): boolean => conditions.some((c) => c.type === 'FREE_AGENCY' && c.expected === true) && conditions.some((c) => c.type === 'ACTIVE_CONTRACT' && c.expected === false);
const originRegions = ['EUROPE', 'AMERICAS', 'ASIA', 'OCEANIA', 'MIDDLE_EAST', 'AFRICA'] as const;

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

test('事件格式、世界线成员与链路均完整', async () => {
  const eventNames = (await readdir(eventDir)).filter((name) => name.endsWith('.json'));
  const events = await Promise.all(eventNames.map((name) => json<StoryEvent>(join(eventDir, name))));
  const byId = new Map(events.map((event) => [event.id, event]));
  assert.ok(events.length >= 30 && events.length <= 50);
  assert.ok(events.some((event) => event.options.some((option) => [...option.outcome.successEffects, ...option.outcome.failureEffects].some((effect) => effect.type === 'TEAM_TRANSFER'))));
  for (const [index, event] of events.entries()) {
    assert.equal(event.id, eventNames[index]!.slice(0, -5));
    assert.match(event.title, /^[\u3400-\u9fff]{4,6}$/u);
    assert.equal(event.options.length, 2);
    assert.equal(new Set(event.options.map((option) => option.id)).size, 2);
    for (const option of event.options) {
      assert.ok(option.description?.trim());
      assert.ok(option.successChance);
      assert.ok(option.outcome.successMessages?.length);
      assert.ok(option.outcome.failureMessages?.length);
      for (const next of [option.outcome.successNextEventId, option.outcome.failureNextEventId]) if (typeof next === 'string') assert.ok(byId.has(next), `${event.id} -> ${next}`);
    }
    if (opportunity(event)) {
      assert.ok(hasAgencyGuards(event.conditions), event.id);
      for (const option of event.options) if (option.outcome.successEffects.some((effect) => effect.type === 'TEAM_TRANSFER')) assert.ok(hasAgencyGuards(option.requirements), `${event.id}/${option.id}`);
    }
  }
  const worldlineNames = (await readdir(worldlineDir)).filter((name) => name.endsWith('.json'));
  const worldlines = await Promise.all(worldlineNames.map((name) => json<Worldline>(join(worldlineDir, name))));
  assert.deepEqual(new Set(worldlines.map((worldline) => worldline.id)), new Set(['rookie', 'matchfixing', 'prodigy', 'grinder', 'comeback', 'journeyman']));
  for (const worldline of worldlines) {
    assert.ok(worldline.eventIds.length >= 4);
    assert.deepEqual(new Set(worldline.eventIds), new Set(events.filter((event) => event.worldlineId === worldline.id).map((event) => event.id)));
    assert.ok(worldline.eventIds.includes(worldline.startEventId));
  }
  assert.equal(worldlines.find((worldline) => worldline.id === 'rookie')?.startEventId, 'rookie-team-entry');
});

test('新档剧情从有效合同下的队内评估进入位置复盘', async () => {
  const entry = await json<StoryEvent>(join(eventDir, 'rookie-team-entry.json'));
  const audit = await json<StoryEvent>(join(eventDir, 'rookie-role-audit.json'));
  assert.ok(entry.conditions.some((condition) => condition.type === 'ACTIVE_CONTRACT' && condition.expected));
  assert.ok(!entry.conditions.some((condition) => condition.type === 'FREE_AGENCY' && condition.expected));
  for (const option of entry.options) {
    assert.equal(option.outcome.successNextEventId, 'rookie-role-audit');
    assert.equal(option.outcome.failureNextEventId, 'rookie-role-audit');
  }
  assert.ok(audit.conditions.some((condition) => condition.type === 'COMPLETED_EVENT' && condition.eventId === 'rookie-team-entry'));
  assert.ok(!audit.conditions.some((condition) => condition.type === 'COMPLETED_EVENT' && condition.eventId === 'rookie-first-trial'));
});

test('队伍层级与触发规则符合新故事包', async () => {
  const teamsAsset = await json<{ teams: Array<{ id: string; standings: { bestRank: number } | null }> }>(join(root, 'assets/teams/teams.json'));
  const ranks = new Map(teamsAsset.teams.map((team) => [team.id, team.standings?.bestRank]));
  const academy = await json<{ schemaVersion: number; teams: Array<{ teamId: string; region: string; tier: string; storyOnly?: boolean; initialCandidate?: boolean; contractLengthMonths?: number; expectedPlaytimePercentage?: number }> }>(join(root, 'assets/academy/academy-teams.json'));
  assert.equal(academy.schemaVersion, 2);
  const defaults = academy.teams.filter((team) => team.initialCandidate && !team.storyOnly);
  assert.equal(new Set(academy.teams.map((team) => team.teamId)).size, academy.teams.length);
  assert.deepEqual(new Set(defaults.map((team) => team.region)), new Set(originRegions));
  for (const team of defaults) {
    assert.equal(team.tier, 'T3');
    assert.ok((ranks.get(team.teamId) ?? 0) > 100, `${team.teamId} must be outside VRS top 100`);
    assert.ok((team.contractLengthMonths ?? 0) > 0);
    assert.ok((team.expectedPlaytimePercentage ?? -1) >= 0 && (team.expectedPlaytimePercentage ?? 101) <= 100);
  }
  const events = await Promise.all((await readdir(eventDir)).filter((name) => name.endsWith('.json')).map((name) => json<StoryEvent>(join(eventDir, name))));
  const regionOffers = events.filter((event) => event.id.startsWith('rookie-region-'));
  assert.deepEqual(new Set(regionOffers.flatMap((event) => event.conditions.filter((condition) => condition.type === 'PLAYER_ORIGIN_REGION').flatMap((condition) => condition.type === 'PLAYER_ORIGIN_REGION' ? condition.regions : []))), new Set(originRegions));
  for (const event of regionOffers) {
    assert.ok(hasAgencyGuards(event.conditions), event.id);
    for (const option of event.options) {
      const transfers = option.outcome.successEffects.filter((effect) => effect.type === 'TEAM_TRANSFER' && effect.teamId);
      assert.equal(transfers.length, 1, `${event.id}/${option.id}`);
      for (const effect of transfers) {
        const rank = effect.type === 'TEAM_TRANSFER' && effect.teamId ? ranks.get(effect.teamId) : undefined;
        assert.ok(rank !== undefined && rank >= 13, `${event.id}/${option.id}`);
      }
    }
  }
  const t2Transfers = events.flatMap((event) => event.options.flatMap((option) => option.outcome.successEffects.filter((effect) => effect.type === 'TEAM_TRANSFER' && !!effect.teamId))).filter((effect) => { const rank = effect.type === 'TEAM_TRANSFER' && effect.teamId ? ranks.get(effect.teamId) : undefined; return rank !== undefined && rank >= 13 && rank <= 32; });
  assert.ok(t2Transfers.length <= 2);
  assert.equal(regionOffers.flatMap((event) => event.options.flatMap((option) => option.outcome.successEffects.filter((effect) => effect.type === 'TEAM_TRANSFER' && effect.teamId && (ranks.get(effect.teamId) ?? Infinity) <= 32))).length, 1);
  const rules = await json<{ rules: Array<{ eventId: string }> }>(join(root, 'assets/story/trigger-rules.json'));
  const ids = new Set(events.map((event) => event.id));
  for (const rule of rules.rules) assert.ok(ids.has(rule.eventId));
});

test('六区出道签约与 T3 失败兜底是数据层强不变量', async () => {
  const teamsAsset = await json<{ teams: Array<{ id: string; standings: { bestRank: number } | null }> }>(join(root, 'assets/teams/teams.json'));
  const ranks = new Map(teamsAsset.teams.map((team) => [team.id, team.standings?.bestRank]));
  for (const region of ['africa', 'americas', 'asia', 'europe', 'middle-east', 'oceania']) {
    const event = await json<StoryEvent>(join(eventDir, `rookie-region-${region}.json`));
    const first = event.options[0]!;
    assert.equal(first.successChance?.baseChance, 1, event.id);
    const fallbackTransfers = first.outcome.successEffects.filter((effect) => effect.type === 'TEAM_TRANSFER');
    assert.equal(fallbackTransfers.length, 1, `${event.id}/${first.id} success`);
    const fallback = fallbackTransfers[0]!;
    assert.ok(fallback.type === 'TEAM_TRANSFER' && fallback.teamId, event.id);
    assert.ok((ranks.get(fallback.teamId) ?? 0) >= 33, `${event.id}: ${fallback.teamId}`);

    for (const option of event.options) {
      const successTransfers = option.outcome.successEffects.filter((effect) => effect.type === 'TEAM_TRANSFER');
      assert.equal(successTransfers.length, 1, `${event.id}/${option.id} success`);
      const success = successTransfers[0]!;
      assert.ok(success.type === 'TEAM_TRANSFER' && success.teamId, `${event.id}/${option.id}`);
      const successRank = ranks.get(success.teamId) ?? 0;
      if (event.id === 'rookie-region-asia' && option.id === 'join-tyloo') {
        assert.ok(successRank >= 13 && successRank <= 32, `${event.id}/${option.id}: ${success.teamId}`);
      } else {
        assert.ok(successRank >= 33, `${event.id}/${option.id}: ${success.teamId}`);
      }

      const failureTransfers = option.outcome.failureEffects.filter((effect) => effect.type === 'TEAM_TRANSFER');
      assert.equal(failureTransfers.length, 1, `${event.id}/${option.id} failure`);
      const failure = failureTransfers[0]!;
      assert.ok(failure.type === 'TEAM_TRANSFER');
      assert.deepEqual(
        { teamId: failure.teamId, salaryPerMonth: failure.salaryPerMonth },
        { teamId: fallback.teamId, salaryPerMonth: fallback.salaryPerMonth },
        `${event.id}/${option.id} fallback`,
      );
      assert.equal(option.outcome.successNextEventId, 'rookie-role-audit', `${event.id}/${option.id} success next`);
      assert.equal(option.outcome.failureNextEventId, 'rookie-role-audit', `${event.id}/${option.id} failure next`);
    }
  }
});

test('六个世界线 transfer-offer 均有窗口/报价 guards 并引用 CURRENT_TRANSFER_OFFER', async () => {
  const names = ['rookie', 'matchfixing', 'prodigy', 'grinder', 'comeback', 'journeyman'];
  for (const name of names) {
    const event = await json<StoryEvent>(join(eventDir, `${name}-transfer-offer.json`));
    const guarded = (conditions: readonly any[]) => conditions.some((item) => item.type === 'TRANSFER_WINDOW' && item.expected === true)
      && conditions.some((item) => item.type === 'TRANSFER_OFFER' && item.expected === true);
    assert.ok(guarded(event.conditions), event.id);
    const accept = event.options.find((option) => option.id === 'accept-offer');
    assert.ok(accept && guarded(accept.requirements), event.id);
    assert.ok(accept.outcome.successEffects.some((effect) => effect.type === 'TEAM_TRANSFER' && effect.offerRef === 'CURRENT_TRANSFER_OFFER'), event.id);
  }
});
