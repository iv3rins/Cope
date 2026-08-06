import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const root = new URL('../', import.meta.url);

async function loadVisualFields() {
  const window = new Window();
  const sandbox = { window, console, globalThis: window };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('assets/editor/visual-fields.js', root), 'utf8'), sandbox);
  return window;
}

/**
 * happy-dom 20.x 存在 <select> 解析缺陷：option 较多时 selected 属性错位到第二个 option。
 * 浏览器无此问题；此处依据 selected 属性恢复选中态，保证往返测试反映真实浏览器行为。
 */
function fixSelected(window) {
  window.document.querySelectorAll('option[selected]').forEach((option) => { option.selected = true; });
}

function mount(window, html) {
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  container.innerHTML = html;
  fixSelected(window);
  return container;
}

/** vm 沙箱创建的对象原型来自沙箱 realm，转为宿主普通对象以便 deepStrictEqual。 */
const hostify = (value) => JSON.parse(JSON.stringify(value));

test('嵌套复合条件（ALL/ANY/NONE）可视化往返不丢字段', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const conditions = [
    { type: 'ALL', negate: true, conditions: [
      { type: 'ATTRIBUTE', attribute: 'AIM', minimum: 80 },
      { type: 'ANY', conditions: [
        { type: 'PLAYER_STAT', stat: 'STRESS', maximum: 40 },
        { type: 'RANDOM', chance: 0.3 },
      ] },
    ] },
  ];
  const container = mount(window, VF.renderCollection('condition', conditions, '事件条件'));
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.deepEqual(hostify(read), conditions);
});

test('FORCE_CONTRACT_TERMINATION 与 TOURNAMENT_INTERVENTION 必填文本空值保留', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const effects = [
    { type: 'FORCE_CONTRACT_TERMINATION', reason: 'TEAM_DECISION', note: '' },
    { type: 'TOURNAMENT_INTERVENTION', editionId: '', interventionType: 'UPSET_CHANCE', description: '' },
  ];
  const container = mount(window, VF.renderCollection('effect', effects, '效果'));
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.equal(read[0].note, '');
  assert.equal(read[1].editionId, '');
  assert.equal(read[1].description, '');
});

test('expected=false 显式保留，negate=false 按缺省省略', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const conditions = [
    { type: 'FREE_AGENCY', expected: false },
    { type: 'AGE', negate: false, minimum: 18 },
  ];
  const container = mount(window, VF.renderCollection('condition', conditions, '条件'));
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.deepEqual(hostify(read[0]), { type: 'FREE_AGENCY', expected: false });
  assert.deepEqual(hostify(read[1]), { type: 'AGE', minimum: 18 });
});

test('FLAG_ADD 仅含 flag 对象时渲染回退顶层 flagId 并可往返', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const effects = [{ type: 'FLAG_ADD', flag: { id: 'TRIAL_PASSED', name: '试训通过', category: 'EVENT' } }];
  const container = mount(window, VF.renderCollection('effect', effects, '效果'));
  const input = container.querySelector('[data-key="flagId"]');
  assert.equal(input.value, 'TRIAL_PASSED');
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.equal(read[0].flagId, 'TRIAL_PASSED');
  assert.deepEqual(hostify(read[0].flag), { id: 'TRIAL_PASSED', name: '试训通过', category: 'EVENT' });
});

test('多选全部取消后字段被删除而非写入空数组', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const conditions = [{ type: 'PLAYER_ROLE', roles: ['IGL'] }];
  const container = mount(window, VF.renderCollection('condition', conditions, '条件'));
  container.querySelectorAll('[data-multi="roles"] input:checked').forEach((node) => { node.checked = false; });
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.ok(!('roles' in read[0]));
});

test('切换复合条件类型保留嵌套树与可共存字段', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const conditions = [{ type: 'ALL', negate: false, conditions: [{ type: 'AGE', minimum: 18 }] }];
  const container = mount(window, VF.renderCollection('condition', conditions, '条件'));
  VF.bind(container, () => fixSelected(window));
  const typeSelect = container.querySelector('[data-visual-item] [data-key="type"]');
  typeSelect.value = 'ANY';
  typeSelect.onchange();
  const read = VF.readCollection(container.querySelector('[data-visual-collection]'));
  assert.equal(read[0].type, 'ANY');
  assert.deepEqual(hostify(read[0].conditions), [{ type: 'AGE', minimum: 18 }]);
});

test('枚举下拉与多选显示中文标签，保存值仍为英文', async () => {
  const window = await loadVisualFields();
  const VF = window.VisualFields;
  const container = mount(window, VF.renderCollection('condition', [{ type: 'PLAYER_ROLE', roles: ['IGL'] }], '条件'));
  const typeSelect = container.querySelector('[data-visual-item] [data-key="type"]');
  const optionTexts = [...typeSelect.options].map((option) => option.textContent);
  assert.ok(optionTexts.includes('属性'));
  assert.ok(optionTexts.includes('全部满足'));
  assert.equal(typeSelect.value, 'PLAYER_ROLE');
  const rolesCheck = [...container.querySelectorAll('[data-multi="roles"] input')];
  assert.equal(rolesCheck[0].value, 'IGL');
  assert.equal(rolesCheck[0].parentElement.textContent.trim(), '指挥');
});
