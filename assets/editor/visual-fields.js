(() => {
  const ATTRIBUTES = ['AIM','GAME_SENSE','LEADERSHIP','CLUTCH','CONSISTENCY','TEAM_CONFLICT'];
  const STATS = ['MORALE','ENERGY','BALANCE','STRESS','RATING2'];
  const METRICS = ['FAME','TEAM_STATUS','TEAM_RELATIONSHIP','FORM','MENTALITY','BALANCE','CLUB_FAVOR','FAN_REPUTATION'];
  const ROLES = ['IGL','AWPER','ENTRY_FRAGGER','SUPPORT','LURKER'];
  const MODES = ['HARDCORE','POWER_FANTASY'];
  const REGIONS = ['EUROPE','AMERICAS','ASIA','OCEANIA','MIDDLE_EAST','AFRICA'];
  const CONDITION_TYPES = ['ATTRIBUTE','PLAYER_STAT','NARRATIVE_METRIC','AGE','PLAYER_ORIGIN_REGION','PLAYER_ROLE','FLAG','TEAM','WORLDLINE','COMPLETED_EVENT','ACTIVE_CONTRACT','CONTRACT_ENDS_WITHIN','FREE_AGENCY','TRANSFER_WINDOW','TRANSFER_OFFER','TEAM_VRS_RANK','RATING_STREAK','ADVANCED_MAPS','TOP20_RANK','GAME_MODE','RANDOM','ALL','ANY','NONE'];
  const EFFECT_TYPES = ['ATTRIBUTE_CHANGE','PLAYER_STAT_CHANGE','NARRATIVE_METRIC_CHANGE','TEAM_TRANSFER','ROLE_CHANGE','WORLDLINE_CHANGE','FLAG_ADD','FLAG_REMOVE','TROPHY_CHANGE','CAREER_STAT_CHANGE','ADVANCE_STORY','TOURNAMENT_INTERVENTION','CONTRACT_RENEWAL','FORCE_CONTRACT_TERMINATION'];
  const UI_LABELS = {
    ATTRIBUTE:'属性', PLAYER_STAT:'状态', NARRATIVE_METRIC:'剧情指标', AGE:'年龄',
    PLAYER_ORIGIN_REGION:'出生地区', PLAYER_ROLE:'选手位置', FLAG:'标记', TEAM:'所在队伍',
    WORLDLINE:'世界线', COMPLETED_EVENT:'已完成事件', ACTIVE_CONTRACT:'合同有效',
    CONTRACT_ENDS_WITHIN:'合同到期倒计时', FREE_AGENCY:'自由球员', TRANSFER_WINDOW:'转会窗',
    TRANSFER_OFFER:'待处理报价', TEAM_VRS_RANK:'队伍排名', RATING_STREAK:'低评级连败',
    ADVANCED_MAPS:'高级赛事地图数', TOP20_RANK:'年度前二十', GAME_MODE:'游戏模式',
    RANDOM:'随机概率', ALL:'全部满足', ANY:'任一满足', NONE:'均不满足',
    ATTRIBUTE_CHANGE:'属性变化', PLAYER_STAT_CHANGE:'状态变化', NARRATIVE_METRIC_CHANGE:'剧情指标变化',
    TEAM_TRANSFER:'转会 / 换队', ROLE_CHANGE:'更换位置', WORLDLINE_CHANGE:'切换世界线',
    FLAG_ADD:'添加标记', FLAG_REMOVE:'移除标记', TROPHY_CHANGE:'荣誉变化',
    CAREER_STAT_CHANGE:'生涯统计变化', ADVANCE_STORY:'推进剧情', TOURNAMENT_INTERVENTION:'赛事干预',
    CONTRACT_RENEWAL:'续约', FORCE_CONTRACT_TERMINATION:'强制解约',
    AIM:'枪法', GAME_SENSE:'意识', LEADERSHIP:'指挥', CLUTCH:'残局', CONSISTENCY:'稳定性', TEAM_CONFLICT:'团队冲突',
    MORALE:'士气', ENERGY:'精力', BALANCE:'存款', STRESS:'压力', RATING2:'数据评级',
    FAME:'名声', TEAM_STATUS:'队伍地位', TEAM_RELATIONSHIP:'队内关系', FORM:'竞技状态',
    MENTALITY:'心态', CLUB_FAVOR:'俱乐部好感', FAN_REPUTATION:'粉丝口碑',
    ENTRY_FRAGGER:'突破手', AWPER:'狙击手', IGL:'指挥', SUPPORT:'辅助', LURKER:'自由人',
    HARDCORE:'硬核模式', POWER_FANTASY:'爽文模式',
    ASIA:'亚洲', EUROPE:'欧洲', AMERICAS:'美洲', OCEANIA:'大洋洲', MIDDLE_EAST:'中东', AFRICA:'非洲',
    MAJOR:'Major 冠军', S_TIER:'顶级赛事冠军', MVP:'最有价值选手', EVP:'杰出选手',
    TOTAL_KILLS:'总击杀', MAPS_PLAYED:'地图场次', CLUTCH_WON:'残局胜利', CAREER_EARNINGS:'生涯收入',
    MENTAL:'心态', ACHIEVEMENT:'成就', EVENT:'事件', CAREER:'生涯', CUSTOM:'自定义',
    EVENT_DECISION:'事件抉择', ATTRIBUTE_THRESHOLD:'属性阈值', TEAM_DECISION:'战队决定', MUTUAL_AGREEMENT:'双方协商',
    TEAM_STRENGTH:'己方实力', OPPONENT_STRENGTH:'对手实力', UPSET_CHANCE:'爆冷概率', FORCE_UPSET:'强制爆冷',
    PLAYER:'选手本人', CURRENT_TEAM:'当前队伍', OPPONENT_TEAM:'对手队伍',
    CHOICE:'抉择（有选项）', MANDATORY:'自动发生',
    NORMAL:'常规阶段', FINAL_DECISIVE_MOMENT:'决赛决定时刻', TRANSFER_WINDOW:'转会窗', OFFSEASON:'休赛期', AFTER_TOP20:'年度前二十公布后',
    PRE_TOURNAMENT:'赛前', IN_TOURNAMENT:'赛中', POST_TOURNAMENT:'赛后',
    shared:'公共池（shared）',
  };
  window.UILabels = UI_LABELS;
  window.uiLabel = (value) => UI_LABELS[value] ?? value;
  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const input = (label, key, value = '', type = 'text', step = '') => `<label>${label}<input data-key="${key}" type="${type}" value="${escape(value)}" ${step ? `step="${step}"` : ''}></label>`;
  const select = (label, key, value, values) => `<label>${label}<select data-key="${key}">${values.map((item) => `<option value="${escape(item)}" ${item === value ? 'selected' : ''}>${escape(window.uiLabel(item))}</option>`).join('')}</select></label>`;
  const boolean = (label, key, value) => `<label class="visual-check"><input data-key="${key}" type="checkbox" ${value ? 'checked' : ''}>${label}</label>`;
  const multi = (label, key, selected, values) => `<fieldset class="visual-multi" data-multi="${key}"><legend>${label}</legend>${values.map((item) => `<label><input type="checkbox" value="${escape(item)}" ${selected?.includes(item) ? 'checked' : ''}>${escape(window.uiLabel(item))}</label>`).join('')}</fieldset>`;
  const optionalNumber = (label, key, value, step = '1') => input(label,key,value ?? '','number',step);

  function conditionFields(value) {
    const type = value.type || 'ATTRIBUTE';
    const common = `${select('条件类型','type',type,CONDITION_TYPES)}${select('判断对象','target',value.target || '',['','PLAYER','CURRENT_TEAM','OPPONENT_TEAM'])}${boolean('反向判断','negate',value.negate)}`;
    const range = `${optionalNumber('最小值','minimum',value.minimum,'0.01')}${optionalNumber('最大值','maximum',value.maximum,'0.01')}`;
    const maps = {
      ATTRIBUTE: `${select('属性','attribute',value.attribute || 'AIM',ATTRIBUTES)}${range}`,
      PLAYER_STAT: `${select('状态','stat',value.stat || 'MORALE',STATS)}${range}`,
      NARRATIVE_METRIC: `${select('剧情指标','metric',value.metric || 'FAME',METRICS)}${range}`,
      AGE: range, TEAM_VRS_RANK:range, RATING_STREAK:range, ADVANCED_MAPS:range, TOP20_RANK:range,
      PLAYER_ORIGIN_REGION:multi('出生地区','regions',value.regions || [],REGIONS),
      PLAYER_ROLE:multi('选手位置','roles',value.roles || [],ROLES),
      GAME_MODE:multi('游戏模式','modes',value.modes || [],MODES),
      FLAG:`${input('标记 ID','flagId',value.flagId)}${boolean('期望持有','expected',value.expected ?? true)}`,
      TEAM:input('队伍 ID','teamId',value.teamId),
      WORLDLINE:select('世界线','worldlineId',value.worldlineId || '',window.EditorCatalog?.worldlines?.() || ['']),
      COMPLETED_EVENT:select('已完成事件','eventId',value.eventId || '',window.EditorCatalog?.events?.() || ['']),
      ACTIVE_CONTRACT:boolean('期望有有效合同','expected',value.expected ?? true),
      FREE_AGENCY:boolean('期望为自由球员','expected',value.expected ?? true),
      TRANSFER_WINDOW:boolean('期望转会窗开启','expected',value.expected ?? true),
      TRANSFER_OFFER:boolean('期望有转会报价','expected',value.expected ?? true),
      CONTRACT_ENDS_WITHIN:optionalNumber('剩余天数','days',value.days ?? 90),
      RANDOM:optionalNumber('触发概率（0~1）','chance',value.chance ?? .5,'0.01'),
    };
    const nested = ['ALL','ANY','NONE'].includes(type) ? renderCollection('condition',value.conditions || [],'嵌套条件') : '';
    return `${common}${maps[type] || ''}${nested}`;
  }

  function effectFields(value) {
    const type = value.type || 'ATTRIBUTE_CHANGE';
    const maps = {
      ATTRIBUTE_CHANGE:`${select('属性','attribute',value.attribute || 'AIM',ATTRIBUTES)}${optionalNumber('变化值','delta',value.delta ?? 1)}`,
      PLAYER_STAT_CHANGE:`${select('状态','stat',value.stat || 'MORALE',STATS)}${optionalNumber('变化值','delta',value.delta ?? 1,'0.01')}`,
      NARRATIVE_METRIC_CHANGE:`${select('剧情指标','metric',value.metric || 'FAME',METRICS)}${optionalNumber('变化值','delta',value.delta ?? 1,'0.01')}`,
      TEAM_TRANSFER:`${input('队伍 ID（可留空使用当前报价）','teamId',value.teamId)}${boolean('使用当前转会报价','useCurrentOffer',value.offerRef === 'CURRENT_TRANSFER_OFFER')}${optionalNumber('月薪','salaryPerMonth',value.salaryPerMonth)}${optionalNumber('合同月数','lengthMonths',value.lengthMonths)}${optionalNumber('买断金额','buyoutAmount',value.buyoutAmount)}${input('结束日期（ISO 8601）','endsAt',value.endsAt)}`,
      ROLE_CHANGE:select('新位置','role',value.role || 'SUPPORT',ROLES),
      WORLDLINE_CHANGE:select('目标世界线','worldlineId',value.worldlineId || '',window.EditorCatalog?.worldlines?.() || ['']),
      FLAG_ADD:`${input('标记 ID','flagId',value.flagId || value.flag?.id)}${input('标记名称','flagName',value.flag?.name || '')}${select('分类','flagCategory',value.flag?.category || 'EVENT',['MENTAL','ACHIEVEMENT','EVENT','CAREER','CUSTOM'])}`,
      FLAG_REMOVE:input('标记 ID','flagId',value.flagId),
      TROPHY_CHANGE:`${select('荣誉','trophy',value.trophy || 'MVP',['MAJOR','S_TIER','MVP','EVP'])}${optionalNumber('变化值','delta',value.delta ?? 1)}`,
      CAREER_STAT_CHANGE:`${select('统计项','stat',value.stat || 'TOTAL_KILLS',['TOTAL_KILLS','MAPS_PLAYED','CLUTCH_WON','CAREER_EARNINGS'])}${optionalNumber('变化值','delta',value.delta ?? 1)}`,
      ADVANCE_STORY:select('目标事件','eventId',value.eventId || '',window.EditorCatalog?.events?.() || ['']),
      TOURNAMENT_INTERVENTION:`${input('赛事届次 ID','editionId',value.editionId)}${select('干预类型','interventionType',value.interventionType || 'TEAM_STRENGTH',['TEAM_STRENGTH','OPPONENT_STRENGTH','UPSET_CHANCE','FORCE_UPSET'])}${optionalNumber('修正值','delta',value.delta,'0.01')}${input('对手队伍 ID','opponentTeamId',value.opponentTeamId || '')}${boolean('强制爆冷','forceUpset',value.forceUpset)}${input('说明','description',value.description)}`,
      CONTRACT_RENEWAL:`${optionalNumber('合同月数','lengthMonths',value.lengthMonths ?? 24)}${optionalNumber('薪资倍率','salaryMultiplier',value.salaryMultiplier ?? 1,'0.1')}${optionalNumber('买断倍率','buyoutMultiplier',value.buyoutMultiplier ?? 1,'0.1')}`,
      FORCE_CONTRACT_TERMINATION:`${select('原因','reason',value.reason || 'EVENT_DECISION',['EVENT_DECISION','ATTRIBUTE_THRESHOLD','TEAM_DECISION','MUTUAL_AGREEMENT'])}${input('说明','note',value.note)}${renderCollection('condition',value.requirements || [],'解约条件')}`,
    };
    return `${select('效果类型','type',type,EFFECT_TYPES)}${maps[type] || ''}`;
  }

  function renderCard(kind, value, index) {
    const body = kind === 'condition' ? conditionFields(value) : effectFields(value);
    return `<article class="visual-card" data-visual-item data-kind="${kind}" data-index="${index}"><header><strong>${kind === 'condition' ? '条件' : '效果'} ${index + 1}</strong><button type="button" class="mini-action danger" data-visual-remove>删除</button></header><div class="visual-fields">${body}</div></article>`;
  }

  function renderCollection(kind, values = [], label = '') {
    return `<section class="visual-collection" data-visual-collection="${kind}"><header><b>${escape(label)}</b><button type="button" class="mini-action" data-visual-add>＋ 添加${kind === 'condition' ? '条件' : '效果'}</button></header><div data-visual-items>${values.map((value,index) => renderCard(kind,value,index)).join('')}</div>${values.length ? '' : '<p class="empty-hint">暂无项目，点击右上角添加。</p>'}</section>`;
  }

  function renderStringList(values = [], label = '文案', catalog = null) {
    return `<section class="string-list" data-string-list><header><b>${escape(label)}</b><button type="button" class="mini-action" data-string-add>＋ 添加</button></header><div data-string-items>${values.map((value) => `<div class="string-row">${catalog ? select('', 'stringValue', value, catalog) : input('', 'stringValue', value)}<button type="button" class="mini-action danger" data-string-remove>×</button></div>`).join('')}</div>${values.length ? '' : '<p class="empty-hint">暂无内容。</p>'}</section>`;
  }

  function readPrimitive(node, keepEmpty = false) {
    if (node.type === 'checkbox') return node.checked;
    if (node.type === 'number') return node.value === '' ? undefined : Number(node.value);
    return node.value === '' ? (keepEmpty ? '' : undefined) : node.value;
  }

  const REQUIRED_TEXT = new Set(['note','editionId','description']);

  function readItem(card) {
    const result = {};
    card.querySelectorAll(':scope > .visual-fields > label > [data-key], :scope > .visual-fields > .visual-check > [data-key]').forEach((node) => {
      const value = readPrimitive(node, REQUIRED_TEXT.has(node.dataset.key));
      const keepFalse = ['expected','forceUpset'].includes(node.dataset.key);
      if (value !== undefined && (value !== false || keepFalse)) result[node.dataset.key] = value;
    });
    card.querySelectorAll(':scope > .visual-fields > [data-multi]').forEach((group) => { const selected = [...group.querySelectorAll('input:checked')].map((node) => node.value); if (selected.length) result[group.dataset.multi] = selected; });
    if (result.useCurrentOffer) { result.offerRef = 'CURRENT_TRANSFER_OFFER'; delete result.useCurrentOffer; }
    if (result.type === 'FLAG_ADD') { result.flag = { id:result.flagId, name:result.flagName || result.flagId, category:result.flagCategory || 'EVENT' }; delete result.flagName; delete result.flagCategory; }
    const nested = card.querySelector(':scope > .visual-fields > .visual-collection');
    if (nested) result[['ALL','ANY','NONE'].includes(result.type) ? 'conditions' : 'requirements'] = readCollection(nested);
    return result;
  }

  function readCollection(container) { return [...container.querySelectorAll(':scope > [data-visual-items] > [data-visual-item]')].map(readItem); }
  function readStringList(container) { return [...container.querySelectorAll('[data-string-items] > .string-row [data-key="stringValue"]')].map((node) => node.value).filter(Boolean); }
  function defaultValue(kind) { return kind === 'condition' ? {type:'ATTRIBUTE',attribute:'AIM',minimum:50} : {type:'ATTRIBUTE_CHANGE',attribute:'AIM',delta:1}; }

  function bind(root, rerender) {
    root.querySelectorAll('[data-visual-add]').forEach((button) => button.onclick = () => { const collection=button.closest('[data-visual-collection]'); const values=readCollection(collection); values.push(defaultValue(collection.dataset.visualCollection)); collection.outerHTML=renderCollection(collection.dataset.visualCollection,values,collection.querySelector('header b')?.textContent); rerender(); });
    root.querySelectorAll('[data-visual-remove]').forEach((button) => button.onclick = () => { const collection=button.closest('[data-visual-collection]'); const values=readCollection(collection); values.splice(Number(button.closest('[data-visual-item]').dataset.index),1); collection.outerHTML=renderCollection(collection.dataset.visualCollection,values,collection.querySelector('header b')?.textContent); rerender(); });
    root.querySelectorAll('[data-visual-item] [data-key="type"]').forEach((node) => node.onchange = () => { const card=node.closest('[data-visual-item]'); const kind=card.dataset.kind; const current=readItem(card); const next={ type:node.value, negate:current.negate, target:current.target, minimum:current.minimum, maximum:current.maximum }; if(['ALL','ANY','NONE'].includes(node.value)) next.conditions=current.conditions || []; if(node.value==='FORCE_CONTRACT_TERMINATION') next.requirements=current.requirements || []; card.outerHTML=renderCard(kind,next,Number(card.dataset.index)); rerender(); });
    root.querySelectorAll('[data-string-add]').forEach((button) => button.onclick=()=>{const list=button.closest('[data-string-list]');const values=readStringList(list);values.push('');list.outerHTML=renderStringList(values,list.querySelector('header b')?.textContent);rerender();});
    root.querySelectorAll('[data-string-remove]').forEach((button)=>button.onclick=()=>{const list=button.closest('[data-string-list]');const rows=[...list.querySelectorAll('.string-row')];const values=readStringList(list);const index=rows.indexOf(button.closest('.string-row'));values.splice(index,1);list.outerHTML=renderStringList(values,list.querySelector('header b')?.textContent);rerender();});
  }

  window.VisualFields = { renderCollection, renderStringList, readCollection, readStringList, bind };
})();
