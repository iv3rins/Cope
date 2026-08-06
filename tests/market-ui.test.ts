import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const marketPath = new URL('../assets/career/market-ui.json', import.meta.url);
const flowPath = new URL('../assets/career/flow-ui.json', import.meta.url);
const appPath = new URL('../app.js', import.meta.url);

 test('市场 UI 内容包含完整的版本化文案映射', async () => {
  const payload = JSON.parse(await readFile(marketPath, 'utf8'));
  const market = payload.market;
  assert.equal(payload.schemaVersion, 1);
  for (const key of ['RECOMMENDED', 'PERSUADABLE', 'UNREACHABLE']) assert.ok(market.availability[key]);
  for (const key of ['T1', 'T2', 'T3']) assert.ok(market.tiers[key]);
  for (const key of ['STARTER', 'SUBSTITUTE', 'ENTRY_FRAGGER', 'AWPER', 'IGL', 'SUPPORT', 'LURKER']) assert.ok(market.roles[key]);
  for (const key of ['LOW', 'MEDIUM', 'HIGH']) assert.ok(market.riskLevels[key]);
  for (const key of ['aim', 'gameSense', 'leadership', 'clutch', 'consistency', 'teamConflict']) assert.ok(market.attributes[key]);
  for (const key of [
    'attributeMinimum', 'roleOneOf', 'minimumAge', 'maximumAge', 'maximumTeamConflict',
    'freeAgentOnly', 'currentTierExcluded', 'minimumRecentRating', 'minimumCareerMaps',
    'minimumT1MajorMaps', 't3ToT1SubstituteOnly', 't3ToT2ContractRequired',
    't2ToT1SubstituteOnly', 'transferWindowRequired', 'invalidRoll', 'unknownRequirement',
  ]) assert.ok(market.requirements[key]);
});

test('市场界面仅展示队伍与队标并保留转会交互', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /loadTeamDirectory\(\)/);
  assert.match(source, /teamAssetPath\(team\)/);
  assert.match(source, /market-team-logo/);
  assert.match(source, /selectTransferTarget\(/);
  assert.doesNotMatch(source, /class="market-contract"/);
  assert.doesNotMatch(source, /class="market-score-row"/);
  assert.doesNotMatch(source, /class="market-detail/);
});

test('自由球员场外安排文案外置并提供直播与休息', async () => {
  const payload = JSON.parse(await readFile(flowPath, 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  for (const key of ['period', 'eyebrow', 'title', 'description', 'actionButtonTemplate', 'resultTemplate', 'unavailable', 'error']) assert.ok(payload.freeAgent[key]);
  assert.ok(payload.freeAgent.actionFallbacks.stream);
  assert.ok(payload.freeAgent.actionFallbacks.rest);
});

test('自由球员统一展示替补邀请、正式市场与场外安排', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /const event = await window\.COPEEngine\.findCareerEvent\('PRE_TOURNAMENT'\);[\s\S]*if \(event\)[\s\S]*const tournament = await window\.COPEEngine\.getNextTournament\(\);[\s\S]*if \(tournament\)[\s\S]*if \(!profile\.currentTeamId && profile\.freeAgencyStatus === 'FREE_AGENT'\)/);
  assert.match(source, /listDailyActions\('NORMAL'\)/);
  assert.match(source, /action\.id === 'stream' \|\| action\.id === 'rest'/);
  assert.match(source, /executeDailyAction\(button\.dataset\.dailyAction/);
  assert.match(source, /window\.COPEEngine\.listStandInOffers\(\)/);
  assert.match(source, /window\.COPEEngine\.acceptStandInOffer/);
  assert.match(source, /renderTransferMarket/);
});
