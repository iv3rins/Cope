import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const marketPath = new URL('../assets/career/market-ui.json', import.meta.url);
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

test('替补邀请文案包含完整字段、映射、操作和结果', async () => {
  const payload = JSON.parse(await readFile(marketPath, 'utf8'));
  const standIn = payload.market.standIn;
  for (const key of ['period', 'eyebrowTemplate', 'titleTemplate', 'rejectedMessage', 'waitingMessage']) assert.ok(standIn[key]);
  for (const key of ['teamName', 'editionName', 'tier', 'targetRole', 'expectedPlaytimePercentage', 'appearanceFee', 'perMapBonus', 'prizeSharePercentage', 'expiresAt', 'risk', 'reason']) assert.ok(standIn.labels[key]);
  for (const key of ['T1', 'T2', 'T3']) assert.ok(standIn.tiers[key]);
  for (const key of ['STARTER', 'SUBSTITUTE', 'ENTRY_FRAGGER', 'AWPER', 'IGL', 'SUPPORT', 'LURKER']) assert.ok(standIn.roles[key]);
  for (const key of ['LOW', 'MEDIUM', 'HIGH']) assert.ok(standIn.riskLevels[key]);
  for (const key of ['accept', 'reject', 'wait']) assert.ok(standIn.buttons[key]);
});

test('替补邀请使用统一响应接口并展示所有关键字段', async () => {
  const source = await readFile(appPath, 'utf8');
  for (const response of ['ACCEPT', 'REJECT', 'WAIT']) assert.match(source, new RegExp(`response === '${response}'|data-stand-in-response=\\"${response}\\"`));
  assert.match(source, /respondStandInOffer\(/);
  assert.doesNotMatch(source, /acceptStandInOffer\(/);
  assert.match(source, /escapeHtml\(resultText\)/);
  assert.doesNotMatch(source, /\$\{resultText\}<div class="event-options">/);
  for (const field of ['teamName', 'tier', 'targetRole', 'expectedPlaytimePercentage', 'appearanceFee', 'perMapBonus', 'prizeSharePercentage', 'expiresAt', 'risk', 'reason']) assert.match(source, new RegExp(`offer\\.${field}`));
  assert.match(source, /offer\.edition\?\.name/);
});
