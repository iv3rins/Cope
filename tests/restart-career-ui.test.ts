import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');

test('重开生涯提供创建页和生涯页入口并要求二次确认', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const source = await readFile(join(root, 'app.js'), 'utf8');
  for (const id of ['restartSetupBtn', 'restartCareerBtn', 'restartDialog', 'cancelRestart', 'confirmRestart']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(source, /openRestartDialog\(callsign\.value, currentSetupConfig\(\)\)/);
  assert.match(source, /window\.COPEEngine\.restartGame\(config\)/);
  assert.match(source, /invalidateSession\(\)/);
  assert.match(source, /const generation = sessionGeneration/);
  assert.match(source, /assertSessionCurrent\(generation\)/);
  const engineSource = await readFile(join(root, 'src', 'browser-entry.ts'), 'utf8');
  assert.match(engineSource, /async function restartCareerGame/);
  assert.match(engineSource, /const backup = await repository\.load\(config\.gameId\)/);
  assert.match(engineSource, /const generation = supersedeSession\(config\.gameId\)/);
  assert.match(engineSource, /await repository\.save\(config\.gameId, backup\)/);
  assert.match(engineSource, /SessionGuardedStateRepository/);
});

test('重开生涯文案外置且包含错误存档恢复提示', async () => {
  const payload = JSON.parse(await readFile(join(root, 'assets', 'career', 'save-ui.json'), 'utf8')) as { schemaVersion: number; restart: Record<string, string> };
  assert.equal(payload.schemaVersion, 1);
  for (const key of ['setupLabel', 'dashboardLabel', 'eyebrow', 'title', 'description', 'cancelLabel', 'confirmLabel', 'missingId', 'missingSave', 'failure']) assert.ok(payload.restart[key]);
  assert.match(payload.restart.description!, /\{gameId\}/);
  assert.match(payload.restart.failure!, /\{message\}/);
});
