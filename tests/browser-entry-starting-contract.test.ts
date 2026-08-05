import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { InMemoryStateRepository } from '../src/engine/impl/in-memory-state-repository';
import type { CompetitionRegion } from '../src/hltv/team';

const root = process.cwd();
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
let rankOverrides = new Map<string, number>();

(globalThis as unknown as { window: Record<string, unknown> }).window = {};
globalThis.fetch = (async (input: string | URL | Request) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const assetPath = raw.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
  try {
    const content = await readFile(join(root, assetPath), 'utf8');
    const payload = JSON.parse(content) as unknown;
    if (assetPath === 'assets/teams/teams.json' && rankOverrides.size > 0) {
      const teamsPayload = payload as { teams: Array<{ id: string; standings: { bestRank: number } | null }> };
      for (const team of teamsPayload.teams) {
        const rank = rankOverrides.get(team.id);
        if (rank !== undefined && team.standings) team.standings.bestRank = rank;
      }
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
  else (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
});

const { initCareerGame } = await import('../src/browser-entry');
const academy = JSON.parse(await readFile(join(root, 'assets/academy/academy-teams.json'), 'utf8')) as {
  teams: Array<{
    teamId: string;
    region: CompetitionRegion;
    tier: string;
    initialCandidate?: boolean;
    storyOnly?: boolean;
    monthlySalary: number;
    contractLengthMonths?: number;
    buyoutAmount?: number;
    startingRole?: 'STARTER' | 'SUBSTITUTE';
    expectedPlaytimePercentage?: number;
  }>;
};
const teams = JSON.parse(await readFile(join(root, 'assets/teams/teams.json'), 'utf8')) as {
  teams: Array<{ id: string; standings: { bestRank: number } | null }>;
};
const ranks = new Map(teams.teams.map((team) => [team.id, team.standings?.bestRank]));
const regions: readonly CompetitionRegion[] = ['EUROPE', 'AMERICAS', 'ASIA', 'OCEANIA', 'MIDDLE_EAST', 'AFRICA'];
const manifest = JSON.parse(await readFile(join(root, 'assets/story/manifest.json'), 'utf8')) as { worldlines: string[] };
const startEventIds = new Set((await Promise.all(manifest.worldlines.map(async (file) => JSON.parse(
  await readFile(join(root, 'assets/story/worldlines', file), 'utf8'),
) as { startEventId: string }))).map((worldline) => worldline.startEventId));

const create = (gameId: string, region: CompetitionRegion) => initCareerGame({
  gameId,
  realName: gameId,
  role: 'AWP',
  region,
  mode: 'HARDCORE',
});

test('六区新档均立即持有 VRS 100 名外 T3 队伍的 ACTIVE 合同', async () => {
  const repository = InMemoryStateRepository.getInstance();
  for (const region of regions) {
    rankOverrides = new Map();
    const gameId = `starting-contract-${region}`;
    const game = await create(gameId, region);
    const profile = await game.getProfile();
    const envelope = await repository.load(gameId);
    assert.ok(envelope);

    const candidate = academy.teams.find((team) => team.teamId === profile.currentTeamId);
    assert.ok(candidate?.initialCandidate && !candidate.storyOnly);
    assert.equal(candidate.region, region);
    assert.equal(candidate.tier, 'T3');
    assert.ok((ranks.get(candidate.teamId) ?? 0) > 100);

    const activeContracts = envelope.state.contracts.filter((contract) => contract.playerId === profile.id && contract.status === 'ACTIVE');
    assert.equal(activeContracts.length, 1);
    const contract = activeContracts[0]!;
    assert.equal(contract.id, profile.currentContractId);
    assert.equal(contract.teamId, profile.currentTeamId);
    assert.equal(contract.salaryPerMonth, candidate.monthlySalary);
    assert.equal(contract.buyoutAmount, candidate.buyoutAmount ?? 0);
    assert.equal(contract.role, candidate.startingRole ?? 'STARTER');
    assert.equal(contract.expectedPlaytimePercentage, candidate.expectedPlaytimePercentage ?? 75);
    assert.equal(profile.currentTeamTier, 'T3');
    assert.equal(profile.freeAgencyStatus, 'SIGNED');
    assert.deepEqual(profile.career.teamHistory, [profile.currentTeamId]);
    assert.ok(startEventIds.has(envelope.state.currentStoryEventId ?? ''), `currentStoryEventId 应属于某个 worldline 的起始事件：${envelope.state.currentStoryEventId}`);
  }
});

test('同一 seed 选择稳定，候选跌入 VRS 前 100 后会改选合规队伍', async () => {
  rankOverrides = new Map();
  const first = await create('stable-europe-seed', 'EUROPE');
  const firstTeamId = (await first.getProfile()).currentTeamId;
  const second = await create('stable-europe-seed', 'EUROPE');
  assert.equal((await second.getProfile()).currentTeamId, firstTeamId);

  rankOverrides = new Map([['alterego', 100]]);
  const fallback = await create('asia-rank-fallback', 'ASIA');
  const fallbackTeamId = (await fallback.getProfile()).currentTeamId;
  assert.notEqual(fallbackTeamId, 'alterego');
  assert.ok((ranks.get(fallbackTeamId ?? '') ?? 0) > 100);
});
