import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { matchTop20Quote } from '../src/hltv/top20-quotes';
import type { Top20QuoteAsset } from '../src/hltv/top20-quotes';
import type { Top20RankedEntry } from '../src/hltv/top20';

const root = process.cwd();

function entry(overrides: Partial<Top20RankedEntry> = {}): Top20RankedEntry {
  return {
    rank: 10,
    thresholdFallback: false,
    identity: { playerId: 'p1', nickname: 'TestPlayer', countryCode: 'CN', teamName: 'TestTeam', careerPlayer: false, source: 'VIRTUAL' },
    evidence: { season: 2026, player: { playerId: 'p1', nickname: 'TestPlayer', countryCode: 'CN', teamName: 'TestTeam', careerPlayer: false, source: 'VIRTUAL' }, tournaments: [] },
    metrics: { eligible: true, t1MajorMaps: 60, annualRating: 1.12, overallRating: 1.12, adr: 75, kast: 70, playoffRating: 1.1, top5Rating: 1.05, finalRating: 1.0, honorsScore: 100, panelScore: 100, aps: 220, eliteMvpBonus: 0, pressureBonus: 0, disasterPenalty: 0, mvp: 0, evp: 0, vp: 0, highMvpEvp: 0, highEvp: 0, majorSuperEliteEvp: 0, hasTopMvp: false },
    ...overrides,
  };
}

test('TOP20 quotes 数据文件可加载并匹配模板（变量填充）', async () => {
  const asset = JSON.parse(await readFile(join(root, 'assets/top20_quotes/quotes.json'), 'utf8')) as Top20QuoteAsset;
  assert.equal(asset.schemaVersion, 1);
  assert.ok(asset.templates.length >= 1);
  assert.ok(asset.defaultTemplate.length > 0);

  const first = entry({ rank: 1, metrics: { ...entry().metrics, aps: 300, annualRating: 1.3 } });
  const matched = matchTop20Quote(first, asset);
  assert.equal(matched.quoteId, 'top-one');
  assert.match(matched.quote, /TestPlayer/);
  assert.match(matched.quote, /TestTeam/);
  assert.match(matched.quote, /第一/);
});

test('TOP20 quotes 按荣誉等级与排名区间匹配', async () => {
  const asset = JSON.parse(await readFile(join(root, 'assets/top20_quotes/quotes.json'), 'utf8')) as Top20QuoteAsset;
  const majorWinner = entry({
    rank: 1,
    evidence: { season: 2026, player: entry().identity, tournaments: [{ eventId: 'major', eventName: 'Major', tier: 'MAJOR', maps: 60, rating: 1.3, playoffMaps: 20, playoffRating: 1.3, top5Maps: 10, top5Rating: 1.25, finalMaps: 5, finalRating: 1.2, title: true, honors: [{ type: 'MVP', honorClass: 'MAJOR', eventId: 'major', eventName: 'Major', tier: 'MAJOR' }], majorPlayoffChoke: false }] },
  });
  assert.equal(matchTop20Quote(majorWinner, asset).quoteId, 'major-champion', 'Major 冠军应命中专属模板');

  const superElite = entry({ rank: 3, evidence: { season: 2026, player: entry().identity, tournaments: [{ eventId: 'elite', eventName: 'Elite', tier: 'T1', maps: 60, rating: 1.2, playoffMaps: 20, playoffRating: 1.2, top5Maps: 10, top5Rating: 1.15, finalMaps: 5, finalRating: 1.1, title: true, honors: [{ type: 'EVP', honorClass: 'SUPER_ELITE', eventId: 'elite', eventName: 'Elite', tier: 'T1' }], majorPlayoffChoke: false }] } });
  assert.equal(matchTop20Quote(superElite, asset).quoteId, 'elite-core', 'SUPER_ELITE 前五应命中 elite-core');
});

test('TOP20 quotes 匹配不到时返回默认评语且不抛错', async () => {
  const asset = JSON.parse(await readFile(join(root, 'assets/top20_quotes/quotes.json'), 'utf8')) as Top20QuoteAsset;
  const last = entry({ rank: 20, metrics: { ...entry().metrics, annualRating: 1.0 } });
  const matched = matchTop20Quote(last, asset);
  assert.equal(matched.quoteId, 'last-entry', '13-20 区间无门槛模板覆盖任何评级');
  assert.match(matched.quote, /TestPlayer/);
  assert.match(matched.quote, /TOP20/);

  const broken = matchTop20Quote(entry({ rank: 5 }), { schemaVersion: 1, templates: [], defaultTemplate: '' });
  assert.equal(broken.quoteId, 'default');
  assert.ok(broken.quote.length > 0, '损坏数据应降级为内置默认评语');
});
