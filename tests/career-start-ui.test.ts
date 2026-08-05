import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('创建页要求游戏 ID 并提供可选随机种子，移除真实姓名与匹配服务器', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const source = await readFile(new URL('app.js', root), 'utf8');
  assert.match(html, /id="callsign"[^>]*required/);
  assert.match(html, /id="randomSeed"/);
  assert.doesNotMatch(html, /id="lastName"|真实姓名|匹配服务器|id="serverName"|id="regionButton"|选择你的初始服务器|SERVER REGION|TEAM ROLE MATRIX|RIFLER|档案编号|CS-26-001|id="playbackMode"/);
  assert.doesNotMatch(source, /tournamentPlaybackMode|playbackModeNode|regionButton/);
});

test('同名存档必须由玩家选择继续或重新开始', async () => {
  const source = await readFile(new URL('app.js', root), 'utf8');
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const id of ['existingSaveDialog', 'continueExistingBtn', 'restartExistingBtn']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(source, /savedGames\.includes\(gameId\)[\s\S]*existingSaveDialog\.showModal\(\)/);
  assert.match(source, /startSimulation\(\{ config, loadOnly: true \}\)/);
  assert.match(source, /uiRandomCursorKey\(gameId\)/);
  assert.match(source, /restoreUiRandom\(activeSeed, gameId, options\.forceCreate === true\)/);
  assert.match(source, /restoreUiRandom\(restartedSeed, gameId, true\)/);
  assert.match(source, /Number\.isSafeInteger\(rawStored\)[\s\S]*rawStored <= 1_000_000/);
  assert.match(source, /localStorage\.setItem\(uiRandomCursorKey\(activeRandomSlot\), String\(deterministicCursor\)\)/);
});

test('随机种子统一驱动彩蛋与 BrowserRandomSource 并持久化兼容旧档', async () => {
  const source = await readFile(new URL('src/browser-entry.ts', root), 'utf8');
  const saveState = await readFile(new URL('src/engine/save-state.ts', root), 'utf8');
  assert.match(source, /const seed = restoredState\?\.state\.randomSeed \?\? \(configuredSeed \|\| config\.gameId\)/);
  assert.match(source, /deriveDeterministicRoll\(seed, 'startup:prodigy-easter-egg'\)/);
  assert.match(source, /new BrowserRandomSource\(seed, safeCursor \?\? 0\)/);
  assert.match(source, /randomSeed: seed/);
  assert.match(source, /randomCursor: 0/);
  assert.match(source, /talentTier/);
  assert.match(saveState, /readonly randomSeed\?: string/);
  assert.match(saveState, /readonly randomCursor\?: number/);
});
