const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const PERIODS = ['NORMAL', 'FINAL_DECISIVE_MOMENT', 'TRANSFER_WINDOW', 'OFFSEASON', 'AFTER_TOP20'];
const PHASES = ['', 'PRE_TOURNAMENT', 'IN_TOURNAMENT', 'POST_TOURNAMENT'];
const MODES = ['HARDCORE', 'POWER_FANTASY'];
const ATTRIBUTES = ['AIM', 'GAME_SENSE', 'LEADERSHIP', 'CLUTCH', 'CONSISTENCY', 'TEAM_CONFLICT'];
const CONDITION_TYPES = new Set(['ATTRIBUTE','PLAYER_STAT','NARRATIVE_METRIC','AGE','PLAYER_ORIGIN_REGION','PLAYER_ROLE','FLAG','TEAM','WORLDLINE','COMPLETED_EVENT','ACTIVE_CONTRACT','CONTRACT_ENDS_WITHIN','FREE_AGENCY','TRANSFER_WINDOW','TRANSFER_OFFER','TEAM_VRS_RANK','RATING_STREAK','ADVANCED_MAPS','TOP20_RANK','GAME_MODE','RANDOM','ALL','ANY','NONE']);
const EFFECT_TYPES = new Set(['ATTRIBUTE_CHANGE','PLAYER_STAT_CHANGE','NARRATIVE_METRIC_CHANGE','TEAM_TRANSFER','ROLE_CHANGE','WORLDLINE_CHANGE','FLAG_ADD','FLAG_REMOVE','TROPHY_CHANGE','CAREER_STAT_CHANGE','ADVANCE_STORY','TOURNAMENT_INTERVENTION','CONTRACT_RENEWAL','FORCE_CONTRACT_TERMINATION']);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const state = {
  rootHandle: null,
  storyHandle: null,
  quoteHandle: null,
  writable: false,
  kind: 'event',
  activeKey: null,
  assets: { event: new Map(), worldline: new Map(), quote: new Map() },
  manifest: { schemaVersion: 1, events: [], worldlines: [] },
  dirty: new Set(),
  paths: new Map(),
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const keyOf = (kind, id) => `${kind}:${id}`;
const activeEntry = () => state.activeKey ? state.assets[state.kind].get(state.activeKey.split(':').slice(1).join(':')) : null;
const pretty = (value) => JSON.stringify(value, null, 2);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const slug = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 3000);
}

async function readJsonFile(file, label) {
  try { return JSON.parse(await file.text()); }
  catch (error) { throw new Error(`${label} 不是有效 JSON：${error.message}`); }
}

async function fileFromPath(handle, parts) {
  let directory = handle;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return (await directory.getFileHandle(parts.at(-1))).getFile();
}

async function detectDirectory(rootHandle) {
  let story = rootHandle;
  let quote = null;
  try {
    await rootHandle.getFileHandle('manifest.json');
  } catch {
    story = await rootHandle.getDirectoryHandle('story');
  }
  try { quote = await rootHandle.getDirectoryHandle('top20_quotes'); } catch {}
  return { story, quote };
}

async function loadFromDirectory() {
  const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const detected = await detectDirectory(rootHandle);
  state.rootHandle = rootHandle;
  state.storyHandle = detected.story;
  state.quoteHandle = detected.quote;
  state.writable = true;
  resetAssets();
  state.manifest = await readJsonFile(await (await detected.story.getFileHandle('manifest.json')).getFile(), 'manifest.json');
  await Promise.all([
    loadHandleDirectory(detected.story, 'events', 'event'),
    loadHandleDirectory(detected.story, 'worldlines', 'worldline'),
    detected.quote ? loadHandleDirectory(detected.quote, '', 'quote') : Promise.resolve(),
  ]);
  finishImport(rootHandle.name, detected.quote ? '可直接保存回本地文件夹' : '可直接保存事件包；TOP20 评语可新建后下载');
}

async function loadHandleDirectory(base, folder, kind) {
  const directory = folder ? await base.getDirectoryHandle(folder) : base;
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
    const value = await readJsonFile(await handle.getFile(), name);
    addImportedAsset(kind, value, folder ? `${folder}/${name}` : `top20_quotes/${name}`);
  }
}

async function loadFromInput(files) {
  resetAssets();
  const normalized = [...files].map((file) => ({ file, path: file.webkitRelativePath.replace(/\\/g, '/') }));
  const manifestItem = normalized.find(({ path }) => /(?:^|\/)(?:story\/)?manifest\.json$/.test(path));
  if (!manifestItem) throw new Error('所选文件夹中没有找到 assets/story/manifest.json。');
  state.manifest = await readJsonFile(manifestItem.file, 'manifest.json');
  for (const { file, path } of normalized) {
    if (!path.endsWith('.json')) continue;
    const value = await readJsonFile(file, path);
    if (/\/story\/events\/[^/]+\.json$|\/events\/[^/]+\.json$/.test(path)) addImportedAsset('event', value, path.slice(path.lastIndexOf('events/')));
    else if (/\/story\/worldlines\/[^/]+\.json$|\/worldlines\/[^/]+\.json$/.test(path)) addImportedAsset('worldline', value, path.slice(path.lastIndexOf('worldlines/')));
    else if (/\/top20_quotes\/[^/]+\.json$/.test(path)) addImportedAsset('quote', value, `top20_quotes/${path.split('/').at(-1)}`);
  }
  state.writable = false;
  state.rootHandle = null;
  finishImport(manifestItem.path.split('/')[0], '兼容模式：修改后将下载 JSON 文件');
}

function resetAssets() {
  for (const map of Object.values(state.assets)) map.clear();
  state.paths.clear();
  state.dirty.clear();
  state.activeKey = null;
}

function addImportedAsset(kind, value, path) {
  const id = kind === 'quote' ? (value.id || path.split('/').at(-1).replace(/\.json$/, '')) : value.id;
  if (!id) return;
  state.assets[kind].set(id, value);
  state.paths.set(keyOf(kind, id), path);
}

function finishImport(name, mode) {
  $('#packName').textContent = name;
  $('#saveMode').textContent = mode;
  $('#saveAllBtn').disabled = false;
  $('#addAssetBtn').disabled = false;
  $('#welcomeView').hidden = true;
  $('#editorView').hidden = false;
  updateCounts();
  renderAssetList();
  const first = state.assets[state.kind].keys().next().value;
  if (first) selectAsset(first); else renderEmptyEditor();
  validatePack();
}

function updateCounts() {
  $('#eventCount').textContent = state.assets.event.size;
  $('#worldlineCount').textContent = state.assets.worldline.size;
  $('#quoteCount').textContent = quoteTemplates().length;
}

function quoteTemplates() {
  return [...state.assets.quote.values()].flatMap((asset) => Array.isArray(asset.templates) ? asset.templates : []);
}

function renderAssetList() {
  const query = $('#assetSearch').value.trim().toLowerCase();
  let entries;
  if (state.kind === 'quote') {
    entries = quoteTemplates().map((quote) => [quote.id, quote]);
  } else entries = [...state.assets[state.kind].entries()];
  entries = entries.filter(([id, value]) => `${id} ${value.title || value.name || value.template || ''}`.toLowerCase().includes(query));
  $('#assetList').innerHTML = entries.length ? entries.map(([id, value]) => {
    const label = value.title || value.name || value.template || id;
    const parentDirty = state.kind === 'quote' && [...state.assets.quote.keys()].some((fileId) => state.dirty.has(keyOf('quote', fileId)));
    const dirty = parentDirty || state.dirty.has(keyOf(state.kind, id));
    return `<button class="asset-item ${state.activeKey === keyOf(state.kind,id) ? 'active' : ''} ${dirty ? 'dirty' : ''}" data-id="${escapeHtml(id)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(id)}</span></button>`;
  }).join('') : '<p class="empty-hint">没有匹配内容。</p>';
}

function selectAsset(id) {
  commitForm(false);
  state.activeKey = keyOf(state.kind, id);
  renderAssetList();
  renderEditor();
}

function renderEmptyEditor() {
  $('#documentTitle').textContent = '暂无内容';
  $('#documentPath').textContent = '';
  $('#documentForm').innerHTML = '<p class="empty-hint">点击左侧“新建”开始。</p>';
}

function field(label, name, value, options = {}) {
  const cls = options.wide ? 'wide' : '';
  if (options.type === 'textarea') return `<label class="${cls}">${label}<textarea class="${options.className || ''}" name="${name}">${escapeHtml(value)}</textarea></label>`;
  if (options.values) return `<label class="${cls}">${label}<select name="${name}">${options.values.map((item) => `<option value="${escapeHtml(item)}" ${String(value ?? '') === item ? 'selected' : ''}>${escapeHtml(item ? (window.uiLabel?.(item) ?? item) : '（无 / 自动推导）')}</option>`).join('')}</select></label>`;
  return `<label class="${cls}">${label}<input name="${name}" type="${options.type || 'text'}" value="${escapeHtml(value ?? '')}" ${options.step ? `step="${options.step}"` : ''}></label>`;
}

function checks(name, selected = []) {
  return `<div class="check-row">${MODES.map((mode) => `<label><input type="checkbox" name="${name}" value="${mode}" ${selected.includes(mode) ? 'checked' : ''}>${escapeHtml(window.uiLabel?.(mode) ?? mode)}</label>`).join('')}</div>`;
}

window.EditorCatalog = {
  events: () => ['', ...state.assets.event.keys()],
  worldlines: () => ['', 'shared', ...state.assets.worldline.keys()],
};

function visualCollection(kind, values, label) { return window.VisualFields.renderCollection(kind, values, label); }
function stringList(values, label, catalog) { return window.VisualFields.renderStringList(values, label, catalog); }

function renderEditor() {
  if (!state.activeKey) return renderEmptyEditor();
  if (state.kind === 'event') renderEventEditor(state.assets.event.get(state.activeKey.slice(6)));
  else if (state.kind === 'worldline') renderWorldlineEditor(state.assets.worldline.get(state.activeKey.slice(10)));
  else renderQuoteEditor(state.activeKey.slice(6));
  bindFormEvents();
  validatePack();
}

function renderEventEditor(event) {
  $('#documentType').textContent = '剧情事件';
  $('#documentTitle').textContent = event.title || event.id;
  $('#documentPath').textContent = state.paths.get(keyOf('event', event.id)) || `events/${event.id}.json`;
  $('#duplicateBtn').hidden = false;
  $('#documentForm').innerHTML = `
    <section class="form-section"><header><h3>基础信息</h3><span class="panel-code">事件规范 §4</span></header><div class="form-grid">
      ${field('事件 ID','id',event.id)}${field('世界线','worldlineId',event.worldlineId,{values:['shared',...state.assets.worldline.keys()]})}
      ${field('标题','title',event.title)}${field('类型','type',event.type,{values:['CHOICE','MANDATORY']})}
      ${field('描述','description',event.description,{type:'textarea',wide:true,className:'description'})}
      ${field('触发周期','period',event.period,{values:PERIODS})}${field('赛事阶段','phase',event.phase || '',{values:PHASES})}
      ${field('优先级','priority',event.priority ?? 50,{type:'number'})}${field('相对权重','weight',event.weight ?? 1,{type:'number',step:'0.1'})}
      <label class="wide">允许模式${checks('allowedModes',event.allowedModes || [])}</label>
      <label><span><input type="checkbox" name="system" ${event.system ? 'checked' : ''}> 系统事件</span></label>
      <label><span><input type="checkbox" name="repeatable" ${event.repeatable ? 'checked' : ''}> 可跨赛季重复</span></label>
      <label><span><input type="checkbox" name="consumesTransferOffer" ${event.consumesTransferOffer ? 'checked' : ''}> 消费转会报价</span></label>
    </div></section>
    <section class="form-section"><header><h3>触发条件与自动效果</h3><span class="panel-code">可视化配置 / 支持复合条件</span></header>
      ${visualCollection('condition',event.conditions || [],'事件触发条件')}${visualCollection('effect',event.autoEffects || [],'进入事件时自动生效')}
    </section>
    <section class="form-section"><header><h3>选项</h3><button type="button" class="mini-action" data-add-option>＋ 增加选项</button></header><div id="optionsEditor">${(event.options || []).map(renderOption).join('')}</div></section>`;
}

function renderOption(option, index) {
  const chance = option.successChance || { baseChance:1, modifiers:[] };
  return `<article class="option-card" data-option-index="${index}"><header><strong>选项 ${String(index + 1).padStart(2,'0')}</strong><div class="inline-actions"><button type="button" class="mini-action danger" data-remove-option>删除</button></div></header>
    <div class="form-grid">${field('选项 ID','optionId',option.id)}${field('选项文案','label',option.label)}${field('说明','optionDescription',option.description || '',{type:'textarea',wide:true,className:'description'})}<label class="wide">允许模式${checks('optionModes',option.allowedModes || [])}</label></div>${visualCollection('condition',option.requirements || [],'选择此项所需条件')}
    <h4>成功概率</h4><div class="form-grid">${field('基础概率（0~1）','baseChance',chance.baseChance,{type:'number',step:'0.01'})}<div></div></div>
    <div class="modifier-list">${(chance.modifiers || []).map(renderModifier).join('')}</div><button type="button" class="mini-action" data-add-modifier>＋ 属性修正</button>
    <h4>结果</h4><div class="outcome-grid"><div>${visualCollection('effect',option.outcome?.successEffects || [],'成功效果')}${stringList(option.outcome?.successMessages || [],'成功结果文案')}</div><div>${visualCollection('effect',option.outcome?.failureEffects || [],'失败效果')}${stringList(option.outcome?.failureMessages || [],'失败结果文案')}</div></div><div class="form-grid">${field('成功下一事件','successNextEventId',option.outcome?.successNextEventId || '',{values:['',...state.assets.event.keys()]})}${field('失败下一事件','failureNextEventId',option.outcome?.failureNextEventId || '',{values:['',...state.assets.event.keys()]})}</div>
  </article>`;
}

function renderModifier(modifier = { attribute:'AIM', perPoint:0.001 }) {
  return `<div class="modifier-row">${field('属性','attribute',modifier.attribute,{values:ATTRIBUTES})}${field('每点加成','perPoint',modifier.perPoint,{type:'number',step:'0.001'})}${field('最低属性','minimum',modifier.minimum ?? '',{type:'number'})}${field('最高属性','maximum',modifier.maximum ?? '',{type:'number'})}<button type="button" class="mini-action danger" data-remove-modifier>×</button></div>`;
}

function renderWorldlineEditor(worldline) {
  $('#documentType').textContent = '世界线';
  $('#documentTitle').textContent = worldline.name || worldline.id;
  $('#documentPath').textContent = state.paths.get(keyOf('worldline', worldline.id)) || `worldlines/worldline_${worldline.id}.json`;
  $('#duplicateBtn').hidden = false;
  const memberEvents = [...state.assets.event.values()].filter((event) => event.worldlineId === worldline.id).map((event) => event.id);
  $('#documentForm').innerHTML = `<section class="form-section"><header><h3>世界线定义</h3><span class="panel-code">事件规范 §3</span></header><div class="form-grid">${field('世界线 ID','id',worldline.id)}${field('名称','name',worldline.name)}${field('描述','description',worldline.description || '',{type:'textarea',wide:true,className:'description'})}${field('起始事件','startEventId',worldline.startEventId,{values:['',...memberEvents]})}</div>${stringList(worldline.eventIds || [],'世界线事件（可输入或选择）',[...state.assets.event.keys()])}</section>`;
}

function quoteAssetAndTemplate(id) {
  for (const [fileId, asset] of state.assets.quote) {
    const index = asset.templates?.findIndex((template) => template.id === id) ?? -1;
    if (index >= 0) return { fileId, asset, index, template: asset.templates[index] };
  }
  return null;
}

function renderQuoteEditor(id) {
  const found = quoteAssetAndTemplate(id);
  if (!found) return renderEmptyEditor();
  const quote = found.template;
  $('#documentType').textContent = '年度 TOP20 评语';
  $('#documentTitle').textContent = quote.id;
  $('#documentPath').textContent = state.paths.get(keyOf('quote', found.fileId)) || 'top20_quotes/quotes.json';
  $('#duplicateBtn').hidden = false;
  $('#documentForm').innerHTML = `<section class="form-section"><header><h3>评语匹配模板</h3><span class="panel-code">模板占位符：{nickname}=昵称 · {teamName}=队伍名 · {aps}=数据评级</span></header><div class="form-grid">${field('模板 ID','id',quote.id)}${field('荣誉分类（可选）','honorClass',quote.honorClass || '')}${field('最低排名','rankMinimum',quote.rankRange?.minimum ?? 1,{type:'number'})}${field('最高排名','rankMaximum',quote.rankRange?.maximum ?? 20,{type:'number'})}${field('最低数据评级（可选）','minimumRating',quote.minimumRating ?? '',{type:'number',step:'0.01'})}<div></div>${field('评语模板','template',quote.template,{type:'textarea',wide:true,className:'description'})}</div></section><section class="form-section"><header><h3>默认评语</h3></header><div class="form-grid">${field('未匹配时使用','defaultTemplate',found.asset.defaultTemplate || '',{type:'textarea',wide:true,className:'description'})}</div></section>`;
}

function readOption(card) {
  const value = (name) => $(`[name="${name}"]`, card)?.value ?? '';
  const collections = $$(':scope > .visual-collection, :scope > .outcome-grid > div > .visual-collection',card);
  const requirementNode = collections.find((node) => node.dataset.visualCollection === 'condition');
  const effectNodes = collections.filter((node) => node.dataset.visualCollection === 'effect');
  const messageNodes = $$('.outcome-grid [data-string-list]',card);
  const outcome = {
    successEffects: effectNodes[0] ? window.VisualFields.readCollection(effectNodes[0]) : [],
    failureEffects: effectNodes[1] ? window.VisualFields.readCollection(effectNodes[1]) : [],
    successMessages: messageNodes[0] ? window.VisualFields.readStringList(messageNodes[0]) : [],
    failureMessages: messageNodes[1] ? window.VisualFields.readStringList(messageNodes[1]) : [],
  };
  if (value('successNextEventId')) outcome.successNextEventId = value('successNextEventId');
  if (value('failureNextEventId')) outcome.failureNextEventId = value('failureNextEventId');
  const modifiers = $$('.modifier-row',card).map((row) => {
    const modifier = { attribute:$('[name="attribute"]',row).value, perPoint:Number($('[name="perPoint"]',row).value) };
    const minimum = $('[name="minimum"]',row).value;
    const maximum = $('[name="maximum"]',row).value;
    if (minimum !== '') modifier.minimum = Number(minimum);
    if (maximum !== '') modifier.maximum = Number(maximum);
    return modifier;
  });
  const option = { id:value('optionId'), label:value('label'), requirements:requirementNode ? window.VisualFields.readCollection(requirementNode) : [], successChance:{ baseChance:Number(value('baseChance')), modifiers }, outcome };
  if (value('optionDescription')) option.description = value('optionDescription');
  const modes = $$('[name="optionModes"]:checked',card).map((node) => node.value);
  if (modes.length) option.allowedModes = modes;
  return option;
}

function commitForm(markDirty = true) {
  if (!state.activeKey || !$('#documentForm').elements.length) return;
  const oldKey = state.activeKey;
  const form = $('#documentForm');
  const value = (name) => form.elements[name]?.value ?? '';
  if (state.kind === 'event') {
    const oldId = oldKey.slice(6);
    const event = clone(state.assets.event.get(oldId));
    const topCollections = $$(':scope > .form-section > .visual-collection',form);
    const parsedConditions = topCollections[0] ? window.VisualFields.readCollection(topCollections[0]) : [];
    const parsedAutoEffects = topCollections[1] ? window.VisualFields.readCollection(topCollections[1]) : [];
    const parsedOptions = $$('.option-card',form).map(readOption);
    if (parsedOptions.some((option) => option === null)) { validatePack(); return; }
    Object.assign(event,{ id:value('id').trim(), worldlineId:value('worldlineId'), title:value('title').trim(), type:value('type'), description:value('description'), period:value('period'), priority:Number(value('priority')), weight:Number(value('weight')), conditions:parsedConditions, autoEffects:parsedAutoEffects, options:parsedOptions });
    event.phase = value('phase') || undefined;
    event.system = form.elements.system.checked || undefined;
    event.repeatable = form.elements.repeatable.checked || undefined;
    event.consumesTransferOffer = form.elements.consumesTransferOffer.checked || undefined;
    const modes = $$('[name="allowedModes"]:checked',form).map((node) => node.value); event.allowedModes = modes.length ? modes : undefined;
    if (!replaceAssetId('event', oldId, event.id, event)) return;
    syncEventMembership(oldId,event);
    if (oldId !== event.id) updateNextEventReferences(oldId, event.id);
  } else if (state.kind === 'worldline') {
    const oldId = oldKey.slice(10); const worldline = clone(state.assets.worldline.get(oldId));
    const eventList = $('[data-string-list]',form);
    const parsedEventIds = eventList ? window.VisualFields.readStringList(eventList) : [];
    Object.assign(worldline,{ id:value('id').trim(), name:value('name').trim(), description:value('description'), startEventId:value('startEventId'), eventIds:parsedEventIds });
    if (!worldline.description) delete worldline.description;
    if (!replaceAssetId('worldline',oldId,worldline.id,worldline)) return;
    if (oldId !== worldline.id) for (const event of state.assets.event.values()) if (event.worldlineId === oldId) event.worldlineId = worldline.id;
  } else {
    const oldId = oldKey.slice(6); const found = quoteAssetAndTemplate(oldId); if (!found) return;
    const quoteId = value('id').trim();
    const duplicate = quoteTemplates().some((template) => template.id === quoteId && template !== found.template);
    if (duplicate) { toast(`${quoteId} 已存在，不能覆盖同名评语。`); return; }
    const quote = { id:quoteId, rankRange:{minimum:Number(value('rankMinimum')),maximum:Number(value('rankMaximum'))}, template:value('template') };
    if (value('honorClass')) quote.honorClass = value('honorClass');
    if (value('minimumRating') !== '') quote.minimumRating = Number(value('minimumRating'));
    found.asset.templates[found.index] = quote; found.asset.defaultTemplate = value('defaultTemplate');
    state.activeKey = keyOf('quote',quote.id); if (markDirty) state.dirty.add(keyOf('quote',found.fileId));
  }
  if (markDirty) state.dirty.add(state.activeKey);
  updateCounts(); renderAssetList(); validatePack(); updateFormulaPreview();
}

function replaceAssetId(kind, oldId, newId, value) {
  if (oldId !== newId && state.assets[kind].has(newId)) {
    toast(`${newId} 已存在，不能覆盖同名${kind === 'event' ? '事件' : '世界线'}。`);
    return false;
  }
  if (oldId !== newId) {
    state.assets[kind].delete(oldId);
    const oldKey = keyOf(kind,oldId);
    const oldPath = state.paths.get(oldKey);
    state.paths.delete(oldKey);
    if (oldPath) state.paths.set(`deleted-path:${kind}:${oldId}`, oldPath);
    state.dirty.add(`delete:${kind}:${oldId}`);
    const canonicalPath = kind === 'event' ? `events/${newId}.json` : `worldlines/worldline_${newId}.json`;
    state.paths.set(keyOf(kind,newId), canonicalPath);
  }
  state.assets[kind].set(newId,value); state.activeKey = keyOf(kind,newId);
  return true;
}

function syncEventMembership(oldId, event) {
  for (const worldline of state.assets.worldline.values()) {
    worldline.eventIds = (worldline.eventIds || []).filter((id) => id !== oldId && id !== event.id);
    if (worldline.id === event.worldlineId) worldline.eventIds.push(event.id);
    if (worldline.startEventId === oldId) worldline.startEventId = event.id;
  }
}

function updateNextEventReferences(oldId, newId) {
  for (const event of state.assets.event.values()) for (const option of event.options || []) {
    if (option.outcome?.successNextEventId === oldId) option.outcome.successNextEventId = newId;
    if (option.outcome?.failureNextEventId === oldId) option.outcome.failureNextEventId = newId;
  }
}

function referringEvents(eventId) {
  return [...state.assets.event.values()].filter((event) => (event.options || []).some((option) => option.outcome?.successNextEventId === eventId || option.outcome?.failureNextEventId === eventId));
}

function bindFormEvents() {
  const form = $('#documentForm');
  if (!form.dataset.bound) {
    form.addEventListener('input', () => commitForm(true));
    form.addEventListener('change', () => commitForm(true));
    form.dataset.bound = 'true';
  }
  $$('[data-remove-option]',form).forEach((button) => button.onclick = () => { button.closest('.option-card').remove(); commitForm(); renderEditor(); });
  $$('[data-add-modifier]',form).forEach((button) => button.onclick = () => { $('.modifier-list',button.closest('.option-card')).insertAdjacentHTML('beforeend',renderModifier()); bindFormEvents(); commitForm(); });
  $$('[data-remove-modifier]',form).forEach((button) => button.onclick = () => { button.closest('.modifier-row').remove(); commitForm(); });
  $('[data-add-option]',form)?.addEventListener('click',() => { const event = activeEntry(); event.options.push({id:`option-${event.options.length+1}`,label:'新选项',description:'',requirements:[],successChance:{baseChance:0.5,modifiers:[]},outcome:{successEffects:[],failureEffects:[],successMessages:['成功结果。'],failureMessages:['失败结果。']}}); state.dirty.add(state.activeKey); renderEditor(); });
  window.VisualFields.bind(form, () => { bindFormEvents(); commitForm(true); });
  updateFormulaPreview();
}

function validatePack() {
  const errors = [];
  const eventIds = new Set(state.assets.event.keys());
  const worldlineIds = new Set(state.assets.worldline.keys());
  for (const [id,event] of state.assets.event) {
    const at = `事件 ${id}`;
    if (!KEBAB.test(id)) errors.push(`${at}：ID 必须使用小写连字符命名（例如 niko-niko），不能用大写字母`);
    if (!event.title?.trim() || !event.description?.trim()) errors.push(`${at}：标题和描述不能为空`);
    if (!worldlineIds.has(event.worldlineId) && event.worldlineId !== 'shared') errors.push(`${at}：世界线 ${event.worldlineId} 不存在`);
    if (!PERIODS.includes(event.period)) errors.push(`${at}：period 无效`);
    validateConditions(event.conditions,`${at}.conditions`,errors);
    validateEffects(event.autoEffects,`${at}.autoEffects`,errors);
    if (event.type === 'CHOICE' && !event.options?.length) errors.push(`${at}：抉择型事件至少需要一个选项`);
    const optionIds = new Set();
    for (const option of event.options || []) {
      if (!option.id || optionIds.has(option.id)) errors.push(`${at}：选项 ID 为空或重复`); optionIds.add(option.id);
      if (!option.label?.trim()) errors.push(`${at}.${option.id}：选项文案不能为空`);
      if (!Number.isFinite(option.successChance?.baseChance) || option.successChance.baseChance < 0 || option.successChance.baseChance > 1) errors.push(`${at}.${option.id}：baseChance 必须在 0~1`);
      validateConditions(option.requirements,`${at}.${option.id}.requirements`,errors);
      validateEffects(option.outcome?.successEffects,`${at}.${option.id}.successEffects`,errors); validateEffects(option.outcome?.failureEffects,`${at}.${option.id}.failureEffects`,errors);
      for (const next of [option.outcome?.successNextEventId,option.outcome?.failureNextEventId]) if (next && !eventIds.has(next)) errors.push(`${at}.${option.id}：下一事件 ${next} 不存在`);
      if (!Array.isArray(option.outcome?.successMessages) || !Array.isArray(option.outcome?.failureMessages)) errors.push(`${at}.${option.id}：成功/失败文案必须是数组`);
    }
  }
  for (const [id,line] of state.assets.worldline) {
    if (!KEBAB.test(id)) errors.push(`世界线 ${id}：ID 必须使用小写连字符命名（例如 niko-niko），不能用大写字母`);
    if (!eventIds.has(line.startEventId)) errors.push(`世界线 ${id}：起始事件不存在`);
    for (const eventId of line.eventIds || []) if (!eventIds.has(eventId)) errors.push(`世界线 ${id}：事件 ${eventId} 不存在`);
    const expected = [...state.assets.event.values()].filter((event) => event.worldlineId === id).map((event) => event.id);
    for (const eventId of expected) if (!line.eventIds?.includes(eventId)) errors.push(`世界线 ${id}：缺少成员 ${eventId}`);
  }
  for (const quote of quoteTemplates()) if (!quote.id || !quote.template || quote.rankRange?.minimum > quote.rankRange?.maximum) errors.push(`TOP20 评语 ${quote.id || '(无 ID)'}：模板或排名区间无效`);
  $('#validationList').innerHTML = errors.length ? errors.slice(0,80).map((error) => `<div class="validation-item">${escapeHtml(error)}</div>`).join('') : '<div class="validation-item ok">✓ 当前事件包通过编辑器基础校验</div>';
  const summary = $('#validationSummary'); summary.textContent = errors.length ? `${errors.length} 项问题需要处理` : '结构与引用检查通过'; summary.classList.toggle('invalid',errors.length > 0);
  return errors;
}

function validateConditions(conditions,path,errors) {
  if (!Array.isArray(conditions)) return errors.push(`${path} 必须是数组`);
  for (const condition of conditions) {
    if (!CONDITION_TYPES.has(condition?.type)) errors.push(`${path}：未知条件 ${condition?.type}`);
    if (['ALL','ANY','NONE'].includes(condition?.type)) validateConditions(condition.conditions,`${path}.${condition.type}`,errors);
    if (condition?.type === 'PLAYER_ORIGIN_REGION' && !condition.regions?.length) errors.push(`${path}：出生地区至少选择一个`);
    if (condition?.type === 'PLAYER_ROLE' && !condition.roles?.length) errors.push(`${path}：选手位置至少选择一个`);
    if (condition?.type === 'GAME_MODE' && !condition.modes?.length) errors.push(`${path}：游戏模式至少选择一个`);
  }
}
function validateEffects(effects,path,errors) {
  if (!Array.isArray(effects)) return errors.push(`${path} 必须是数组`);
  for (const effect of effects) {
    if (!EFFECT_TYPES.has(effect?.type)) errors.push(`${path}：未知效果 ${effect?.type}`);
    if (effect?.type === 'FORCE_CONTRACT_TERMINATION') {
      if (!effect.reason) errors.push(`${path}：解约必须选择原因（reason）`);
      if (!effect.note) errors.push(`${path}：解约必须填写说明（note）`);
    }
    if (effect?.type === 'TOURNAMENT_INTERVENTION') {
      if (!effect.editionId) errors.push(`${path}：赛事干预必须填写届次 ID（editionId）`);
      if (!effect.description) errors.push(`${path}：赛事干预必须填写说明（description）`);
    }
  }
}

function updateFormulaPreview() {
  const node = $('#formulaPreview');
  if (state.kind !== 'event') { node.hidden = true; return; }
  node.hidden = false;
  const event = activeEntry();
  $('#formulaContent').innerHTML = (event?.options || []).map((option) => `<div class="formula-box"><b>${escapeHtml(option.label)}</b><br>${Number(option.successChance?.baseChance ?? 1).toLocaleString(undefined,{style:'percent'})} ${option.successChance?.modifiers?.map((m) => `+ ${escapeHtml(window.uiLabel?.(m.attribute) ?? m.attribute)} × ${m.perPoint}`).join(' ') || '(无修正)'}</div>`).join('') || '<p class="empty-hint">暂无选项。</p>';
}

function createAsset() {
  commitForm(false);
  if (state.kind === 'event') {
    let id = uniqueId('event','new-event'); const worldlineId = state.assets.worldline.keys().next().value || 'shared';
    const event = {id,title:'新事件',description:'请填写事件描述。',worldlineId,type:'CHOICE',period:'NORMAL',priority:50,weight:1,conditions:[],options:[{id:'option-1',label:'新选项',description:'请填写选项说明。',requirements:[],successChance:{baseChance:0.5,modifiers:[]},outcome:{successEffects:[],failureEffects:[],successMessages:['成功结果。'],failureMessages:['失败结果。']}}],autoEffects:[]};
    state.assets.event.set(id,event); state.paths.set(keyOf('event',id),`events/${id}.json`); syncEventMembership('',event); state.activeKey=keyOf('event',id);
  } else if (state.kind === 'worldline') {
    const id=uniqueId('worldline','new-worldline'); const line={id,name:'新世界线',description:'请填写世界线描述。',startEventId:'',eventIds:[]}; state.assets.worldline.set(id,line); state.paths.set(keyOf('worldline',id),`worldlines/worldline_${id}.json`); state.activeKey=keyOf('worldline',id);
  } else {
    ensureQuoteAsset(); const found=[...state.assets.quote.entries()][0]; const id=uniqueQuoteId('new-quote'); found[1].templates.push({id,rankRange:{minimum:1,maximum:20},template:'{nickname} 凭借全年稳定表现进入年度 TOP20。'}); state.activeKey=keyOf('quote',id); state.dirty.add(keyOf('quote',found[0]));
  }
  state.dirty.add(state.activeKey); updateCounts(); renderAssetList(); renderEditor();
}
function uniqueId(kind,base){let id=base,index=2;while(state.assets[kind].has(id))id=`${base}-${index++}`;return id;}
function uniqueQuoteId(base){let id=base,index=2,ids=new Set(quoteTemplates().map((q)=>q.id));while(ids.has(id))id=`${base}-${index++}`;return id;}
function ensureQuoteAsset(){if(state.assets.quote.size)return;state.assets.quote.set('quotes',{schemaVersion:1,templates:[],defaultTemplate:'{nickname} 凭借全年稳定表现进入年度 TOP20。'});state.paths.set(keyOf('quote','quotes'),'top20_quotes/quotes.json');}

function duplicateAsset() {
  if (!state.activeKey) return;
  if (state.kind === 'quote') { const found=quoteAssetAndTemplate(state.activeKey.slice(6)); const copy=clone(found.template); copy.id=uniqueQuoteId(`${copy.id}-copy`); found.asset.templates.push(copy); state.activeKey=keyOf('quote',copy.id); state.dirty.add(keyOf('quote',found.fileId)); }
  else { const old=activeEntry(); const copy=clone(old); copy.id=uniqueId(state.kind,`${old.id}-copy`); if(state.kind==='event'){copy.title+= ' 副本';state.assets.event.set(copy.id,copy);state.paths.set(keyOf('event',copy.id),`events/${copy.id}.json`);syncEventMembership('',copy);}else{copy.name+=' 副本';state.assets.worldline.set(copy.id,copy);state.paths.set(keyOf('worldline',copy.id),`worldlines/worldline_${copy.id}.json`);} state.activeKey=keyOf(state.kind,copy.id);state.dirty.add(state.activeKey); }
  updateCounts();renderAssetList();renderEditor();
}

function confirmAction(title,message,action) { const dialog=$('#confirmDialog'); $('#confirmTitle').textContent=title;$('#confirmMessage').textContent=message;dialog.showModal();$('#acceptConfirmBtn').onclick=()=>{dialog.close();action();}; }
function deleteActive() {
  if (!state.activeKey) return; const id=state.activeKey.split(':').slice(1).join(':');
  confirmAction('确认删除？',state.kind === 'event' && referringEvents(id).length ? `事件 ${id} 被 ${referringEvents(id).map((event) => event.id).join('、')} 引用。请先修改这些下一事件引用，再删除。` : `将删除 ${id}。保存后该操作会反映到 manifest 与世界线。`,()=>{
    if (state.kind === 'event' && referringEvents(id).length) { toast('删除已取消：仍有事件引用此 ID。'); return; }
    if(state.kind==='quote'){const found=quoteAssetAndTemplate(id);found.asset.templates.splice(found.index,1);state.dirty.add(keyOf('quote',found.fileId));}
    else {state.assets[state.kind].delete(id);state.dirty.add(`delete:${state.kind}:${id}`);if(state.kind==='event')for(const line of state.assets.worldline.values()){line.eventIds=line.eventIds.filter((value)=>value!==id);if(line.startEventId===id)line.startEventId='';}}
    state.activeKey=null;updateCounts();renderAssetList();const first=state.kind==='quote'?quoteTemplates()[0]?.id:state.assets[state.kind].keys().next().value;if(first)selectAsset(first);else renderEmptyEditor();validatePack();
  });
}

function buildManifest() {
  return { ...state.manifest, events:[...state.assets.event.keys()].map((id)=>`${id}.json`).sort(), worldlines:[...state.assets.worldline.keys()].map((id)=>state.paths.get(keyOf('worldline',id))?.split('/').at(-1) || `worldline_${id}.json`).sort() };
}
async function saveAll() {
  commitForm(false);
  const errors=validatePack(); if(errors.length && !confirm(`当前有 ${errors.length} 项校验问题，仍要保存吗？`)) return;
  const docs=[];
  for(const [id,value] of state.assets.event) docs.push({path:`events/${id}.json`,value});
  for(const [id,value] of state.assets.worldline) docs.push({path:state.paths.get(keyOf('worldline',id))||`worldlines/worldline_${id}.json`,value});
  for(const [fileId,value] of state.assets.quote) docs.push({path:state.paths.get(keyOf('quote',fileId))||'top20_quotes/quotes.json',value,quote:true});
  docs.push({path:'manifest.json',value:buildManifest()});
  if(state.writable){
    for(const doc of docs) await writeToHandles(doc.path,doc.value,doc.quote);
    await processDeletedHandles();
    toast(`已保存 ${docs.length} 个 JSON 文件。`);
  } else {
    for(const doc of docs) downloadJson(doc.path.split('/').at(-1),doc.value);
    toast(`已下载 ${docs.length} 个 JSON 文件，请放回对应目录。`);
  }
  state.dirty.clear();renderAssetList();
}
async function writeToHandles(path,value,isQuote=false){let base=isQuote?state.quoteHandle:state.storyHandle;if(isQuote&&!base){downloadJson(path.split('/').at(-1),value);return;}let parts=path.split('/');if(isQuote&&parts[0]==='top20_quotes')parts=parts.slice(1);let directory=base;for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part,{create:true});const handle=await directory.getFileHandle(parts.at(-1),{create:true});const writable=await handle.createWritable();await writable.write(`${pretty(value)}\n`);await writable.close();}
async function processDeletedHandles(){for(const token of [...state.dirty].filter((item)=>item.startsWith('delete:'))){const [,kind,id]=token.split(':');const path=state.paths.get(`deleted-path:${kind}:${id}`)||state.paths.get(keyOf(kind,id));if(!path)continue;let dir=state.storyHandle;const parts=path.split('/');for(const part of parts.slice(0,-1))dir=await dir.getDirectoryHandle(part);try{await dir.removeEntry(parts.at(-1));}catch{}}}
function downloadJson(name,value){const url=URL.createObjectURL(new Blob([`${pretty(value)}\n`],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('#openFolderBtn').addEventListener('click',async()=>{try{if(!window.showDirectoryPicker)throw new Error('当前浏览器不支持直接读写目录，请使用“兼容模式导入”。');await loadFromDirectory();}catch(error){if(error.name!=='AbortError')toast(error.message);}});
$('#folderInput').addEventListener('change',async(event)=>{try{await loadFromInput(event.target.files);}catch(error){toast(error.message);}});
$$('.asset-tabs button').forEach((button)=>button.addEventListener('click',()=>{commitForm(false);state.kind=button.dataset.kind;state.activeKey=null;$$('.asset-tabs button').forEach((node)=>node.classList.toggle('active',node===button));$('#addAssetBtn').textContent=`＋ 新建${state.kind==='event'?'事件':state.kind==='worldline'?'世界线':'评语'}`;renderAssetList();const first=state.kind==='quote'?quoteTemplates()[0]?.id:state.assets[state.kind].keys().next().value;if(first)selectAsset(first);else renderEmptyEditor();}));
$('#assetList').addEventListener('click',(event)=>{const button=event.target.closest('[data-id]');if(button)selectAsset(button.dataset.id);});
$('#assetSearch').addEventListener('input',renderAssetList);
$('#addAssetBtn').addEventListener('click',createAsset);
$('#duplicateBtn').addEventListener('click',duplicateAsset);
$('#deleteBtn').addEventListener('click',deleteActive);
$('#saveCurrentBtn').addEventListener('click',()=>saveAll().catch((error)=>toast(error.message)));
$('#saveAllBtn').addEventListener('click',()=>saveAll().catch((error)=>toast(error.message)));
$('#closeConfirmBtn').onclick=$('#cancelConfirmBtn').onclick=()=>$('#confirmDialog').close();
window.addEventListener('beforeunload',(event)=>{if(state.dirty.size){event.preventDefault();event.returnValue='';}});
