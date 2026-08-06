import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('事件编辑器作为独立本地页面提供，不耦合生涯运行时', async () => {
  const html = await readFile(new URL('assets/editor/index.html', root), 'utf8');
  const source = await readFile(new URL('assets/editor/editor.js', root), 'utf8');
  assert.match(html, /内容工作室/);
  assert.match(html, /id="openFolderBtn"/);
  assert.match(html, /id="folderInput"[^>]*webkitdirectory/);
  assert.match(html, /id="saveAllBtn"/);
  assert.match(html, /visual-fields\.js/);
  assert.doesNotMatch(html, /app\.js|engine\.bundle\.js/);
  assert.doesNotMatch(source, /COPEEngine|eval\s*\(|new Function/);
});

test('事件编辑器覆盖 EVENT_API 的核心内容资产与校验', async () => {
  const source = await readFile(new URL('assets/editor/editor.js', root), 'utf8');
  for (const token of [
    'manifest.json', 'events', 'worldlines', 'top20_quotes',
    'successChance', 'baseChance', 'modifiers', 'conditions', 'autoEffects',
    'successEffects', 'failureEffects', 'successMessages', 'failureMessages',
    'CONDITION_TYPES', 'EFFECT_TYPES', 'validatePack', 'buildManifest',
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /showDirectoryPicker\(\{ mode: 'readwrite' \}\)/);
  assert.match(source, /createWritable\(\)/);
  assert.match(source, /downloadJson/);
});

test('事件内容使用结构化控件，不要求作者填写 JSON', async () => {
  const source = await readFile(new URL('assets/editor/editor.js', root), 'utf8');
  const visual = await readFile(new URL('assets/editor/visual-fields.js', root), 'utf8');
  assert.doesNotMatch(source, /jsonField|parseJsonField|JSON \/ 支持/);
  assert.match(source, /visualCollection\('condition'/);
  assert.match(source, /visualCollection\('effect'/);
  assert.match(source, /stringList\(option\.outcome/);
  assert.match(source, /stringList\(worldline\.eventIds/);
  assert.match(visual, /renderCollection/);
  assert.match(visual, /readCollection/);
  assert.match(visual, /ALL','ANY','NONE/);
  for (const type of ['TEAM_TRANSFER','FLAG_ADD','TOURNAMENT_INTERVENTION','FORCE_CONTRACT_TERMINATION']) assert.match(visual, new RegExp(type));
});


test('事件编辑器的 EVENT_API 枚举与当前规范保持一致', async () => {
  const source = await readFile(new URL('assets/editor/editor.js', root), 'utf8');
  for (const value of ['NORMAL','FINAL_DECISIVE_MOMENT','TRANSFER_WINDOW','OFFSEASON','AFTER_TOP20']) assert.match(source, new RegExp(`['"]${value}['"]`));
  assert.match(source, /const KEBAB = \/\^\[a-z0-9\]/);
});
