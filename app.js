const $ = (selector) => document.querySelector(selector);

const callsign = $('#callsign');
const randomSeed = $('#randomSeed');
const role = $('#role');
const helpDialog = $('#helpDialog');
const retireDialog = $('#retireDialog');
const top20Dialog = $('#top20Dialog');
const restartDialog = $('#restartDialog');
const existingSaveDialog = $('#existingSaveDialog');
const engineRegions = { 中国: 'ASIA', 欧洲: 'EUROPE', 北美: 'AMERICAS', 独联体: 'EUROPE', 南美: 'AMERICAS', 亚太: 'OCEANIA', 中东: 'MIDDLE_EAST', 非洲: 'AFRICA' };
const roleData = {
  ENTRY: { title: '突破手 / ENTRY', description: '用首杀撕开防线，为队伍建立进攻空间。' },
  AWP: { title: '狙击手 / AWP', description: '以关键架点与首杀打开回合优势。' },
  IGL: { title: '指挥 / IGL', description: '阅读对手，组织信息并做出每一回合的决策。' },
  SUPPORT: { title: '辅助 / SUPPORT', description: '用道具、补枪和协同让战术完整落地。' },
  LURK: { title: '自由人 / LURK', description: '牵制防守、捕捉转点，并终结残局。' },
};
const attributeLabels = { aim: '枪法', gameSense: '意识', leadership: '指挥', clutch: '残局', consistency: '稳定性', teamConflict: '团队冲突' };
let selectedCareerMode = 'HARDCORE';
let tournamentPresentationMode = window.localStorage?.getItem('cope:tournament-presentation') === 'DETAILED' ? 'DETAILED' : 'QUICK';
let activeEventId = null;
let deterministicState = 2166136261;
let deterministicCursor = 0;
let activeRandomSlot = null;
let teamDirectory = null;
let careerContent = null;
let marketContentPromise = null;
let flowContentPromise = null;
let enumContentPromise = null;
let saveContentPromise = null;
let restartGameId = null;
let restartConfig = null;
let pendingStartConfig = null;
let sessionGeneration = 0;
const pendingTimers = new Set();
function scheduleSession(callback, delay) {
  const generation = sessionGeneration;
  const timer = window.setTimeout(async () => {
    pendingTimers.delete(timer);
    if (generation !== sessionGeneration) return;
    await callback();
  }, delay);
  pendingTimers.add(timer);
  return timer;
}
function sessionIsCurrent(generation) { return generation === sessionGeneration; }
function assertSessionCurrent(generation) {
  if (!sessionIsCurrent(generation)) throw new Error('当前生涯会话已被重开。');
}
function invalidateSession() {
  sessionGeneration += 1;
  for (const timer of pendingTimers) window.clearTimeout(timer);
  pendingTimers.clear();
}

function updateTournamentPresentationControls() {
  document.querySelectorAll('[data-tournament-presentation]').forEach((button) => button.classList.toggle('selected', button.dataset.tournamentPresentation === tournamentPresentationMode));
}
function setTournamentPresentationMode(mode) {
  tournamentPresentationMode = mode === 'DETAILED' ? 'DETAILED' : 'QUICK';
  window.localStorage?.setItem('cope:tournament-presentation', tournamentPresentationMode);
  updateTournamentPresentationControls();
}

async function loadFlowContent() {
  if (flowContentPromise) return flowContentPromise;
  flowContentPromise = fetch('assets/career/flow-ui.json').then(async (response) => {
    if (!response.ok) throw new Error('生涯推进文案加载失败');
    const payload = await response.json();
    if (payload?.schemaVersion !== 1 || typeof payload?.freeAgent?.title !== 'string') throw new Error('生涯推进文案格式无效');
    return payload;
  });
  return flowContentPromise;
}

async function loadEnumContent() {
  if (enumContentPromise) return enumContentPromise;
  enumContentPromise = fetch('assets/career/enum-ui.json').then(async (response) => {
    if (!response.ok) throw new Error('界面文案加载失败');
    const payload = await response.json();
    if (payload?.schemaVersion !== 1 || typeof payload?.modes?.HARDCORE !== 'string') throw new Error('界面文案格式无效');
    return payload;
  });
  return enumContentPromise;
}
function enumLabel(group, value) { return enumContentPromise ? enumContentPromise.then((copy) => copy?.[group]?.[value] || value) : Promise.resolve(value); }

async function loadSaveContent() {
  if (saveContentPromise) return saveContentPromise;
  saveContentPromise = fetch('assets/career/save-ui.json').then(async (response) => {
    if (!response.ok) throw new Error('存档操作文案加载失败');
    const payload = await response.json();
    if (payload?.schemaVersion !== 1 || typeof payload?.restart?.title !== 'string') throw new Error('存档操作文案格式无效');
    return payload;
  });
  return saveContentPromise;
}

function currentSetupConfig(gameId = callsign.value.trim()) {
  return { gameId, realName: gameId, randomSeed: randomSeed.value.trim() || gameId, role: role.value, region: engineRegions[selectedRegion()], mode: selectedCareerMode };
}

async function openRestartDialog(gameId, config) {
  const copy = (await loadSaveContent()).restart;
  const normalizedId = String(gameId || '').trim();
  if (!normalizedId) { renderStartupError(copy.missingId); return; }
  const saves = await window.COPEEngine.listGames();
  if (!saves.includes(normalizedId)) { renderStartupError(copy.missingSave); return; }
  restartGameId = normalizedId;
  restartConfig = config;
  $('#restartEyebrow').textContent = copy.eyebrow;
  $('#restartTitle').textContent = copy.title;
  $('#restartDescription').textContent = copy.description.replace('{gameId}', normalizedId);
  $('#cancelRestart').textContent = copy.cancelLabel;
  $('#confirmRestart').textContent = copy.confirmLabel;
  restartDialog.showModal();
}

async function restartCareer() {
  const copy = (await loadSaveContent()).restart;
  const gameId = restartGameId;
  if (!gameId) throw new Error(copy.missingId);
  const config = restartConfig ?? currentSetupConfig(gameId);
  invalidateSession();
  restartDialog.close();
  restartGameId = null;
  restartConfig = null;
  callsign.value = gameId;
  randomSeed.value = config.randomSeed && config.randomSeed !== gameId ? config.randomSeed : '';
  if (typeof window.COPEEngine.restartGame !== 'function') throw new Error('当前引擎不支持安全重开。');
  await window.COPEEngine.restartGame(config);
  const restartedSeed = typeof window.COPEEngine.getRandomSeed === 'function' ? window.COPEEngine.getRandomSeed() : config.randomSeed || gameId;
  restoreUiRandom(restartedSeed, gameId, true);
  const profile = await window.COPEEngine.getProfile();
  const setup = $('#setup-page');
  const dashboard = $('#dashboard-page');
  setup.classList.remove('active');
  setup.hidden = true;
  dashboard.hidden = false;
  dashboard.classList.add('active');
  await renderProfile(profile);
  await refreshVrsStatus();
  await renderTournamentCalendar(profile);
  await renderCurrentPeriod();
}

async function loadMarketContent() {
  if (marketContentPromise) return marketContentPromise;
  marketContentPromise = (async () => {
    try {
      const response = await fetch('assets/career/market-ui.json');
      if (!response.ok) return null;
      const result = await response.json();
      const copy = result?.market;
      const coreKeys = ['RECOMMENDED', 'PERSUADABLE', 'UNREACHABLE'];
      const valid = result?.schemaVersion === 1
        && typeof copy?.title === 'string'
        && typeof copy?.skipLabel === 'string'
        && coreKeys.every((key) => typeof copy?.availability?.[key] === 'string')
        && ['T1', 'T2', 'T3'].every((key) => typeof copy?.tiers?.[key] === 'string')
        && ['STARTER', 'SUBSTITUTE'].every((key) => typeof copy?.roles?.[key] === 'string')
        && ['LOW', 'MEDIUM', 'HIGH'].every((key) => typeof copy?.riskLevels?.[key] === 'string')
        && typeof copy?.requirements?.unknownRequirement === 'string'
        && typeof copy?.standIn?.period === 'string'
        && typeof copy?.standIn?.eyebrowTemplate === 'string'
        && typeof copy?.standIn?.titleTemplate === 'string'
        && ['accept', 'reject', 'wait'].every((key) => typeof copy?.standIn?.buttons?.[key] === 'string')
        && ['LOW', 'MEDIUM', 'HIGH'].every((key) => typeof copy?.standIn?.riskLevels?.[key] === 'string');
      return valid ? result : null;
    } catch (error) {
      console.warn('market-ui unavailable', error);
      return null;
    }
  })();
  return marketContentPromise;
}

function fillMarketTemplate(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function formatMarketRequirement(requirement, copy) {
  const rules = copy?.requirements || {};
  const unknown = rules.unknownRequirement || '';
  const token = String(requirement || '');
  let match = token.match(/^(aim|gameSense|leadership|clutch|consistency|teamConflict):(\d+(?:\.\d+)?)$/);
  if (match) return fillMarketTemplate(rules.attributeMinimum || unknown, { attribute: copy?.attributes?.[match[1]] || '', value: match[2] });
  match = token.match(/^role:([A-Z|_]+)$/);
  if (match) return fillMarketTemplate(rules.roleOneOf || unknown, { roles: match[1].split('|').map((key) => copy?.roles?.[key] || '').filter(Boolean).join(' / ') });
  match = token.match(/^age>=(\d+)$/);
  if (match) return fillMarketTemplate(rules.minimumAge || unknown, { value: match[1] });
  match = token.match(/^age<=(\d+)$/);
  if (match) return fillMarketTemplate(rules.maximumAge || unknown, { value: match[1] });
  match = token.match(/^teamConflict<=(\d+(?:\.\d+)?)$/);
  if (match) return fillMarketTemplate(rules.maximumTeamConflict || unknown, { value: match[1] });
  if (token === 'free-agent-only') return rules.freeAgentOnly || unknown;
  match = token.match(/^current-tier!=(T[123])$/);
  if (match) return fillMarketTemplate(rules.currentTierExcluded || unknown, { tier: copy?.tiers?.[match[1]] || '' });
  match = token.match(/^recentRating>=(\d+(?:\.\d+)?)$/);
  if (match) return fillMarketTemplate(rules.minimumRecentRating || unknown, { value: match[1] });
  match = token.match(/^careerMaps>=(\d+)$/);
  if (match) return fillMarketTemplate(rules.minimumCareerMaps || unknown, { value: match[1] });
  match = token.match(/^t1MajorMaps>=(\d+)$/);
  if (match) return fillMarketTemplate(rules.minimumT1MajorMaps || unknown, { value: match[1] });
  const exactRules = {
    't3-to-t1-substitute-only': 't3ToT1SubstituteOnly',
    't3-to-t2-contract-required': 't3ToT2ContractRequired',
    't2-to-t1-substitute-only': 't2ToT1SubstituteOnly',
    'transfer-window-required': 'transferWindowRequired',
    'invalid-roll': 'invalidRoll',
  };
  return rules[exactRules[token]] || unknown;
}

function formatMarketRisk(risk, copy) {
  return String(risk || '').replace(/\b(LOW|MEDIUM|HIGH)\b/g, (level) => copy?.riskLevels?.[level] || '');
}

async function loadCareerContent() {
  if (careerContent) return careerContent;
  const response = await fetch('assets/career/summary-ui.json');
  if (!response.ok) throw new Error('生涯总结文案加载失败');
  const result = await response.json();
  const archive = result.archive;
  const requiredStrings = [
    archive?.eyebrow, archive?.restartLabel,
    archive?.headlines?.majorChampion, archive?.headlines?.topPlayer, archive?.headlines?.tierOneChampion, archive?.headlines?.journeyman,
    archive?.sections?.trophies, archive?.sections?.topHistory, archive?.sections?.mvp, archive?.sections?.statistics,
    archive?.labels?.retiredAge, archive?.labels?.careerGrade, archive?.labels?.majorChampionships, archive?.labels?.bestTop, archive?.labels?.mvp, archive?.labels?.peakRating, archive?.labels?.totalMaps, archive?.labels?.totalKills, archive?.labels?.careerRating, archive?.labels?.careerEarnings,
    archive?.itemLabels?.majorMvp, archive?.itemLabels?.eventMvp, archive?.itemLabels?.annualTop, archive?.itemLabels?.worldRank,
    archive?.empty?.trophies, archive?.empty?.topHistory, archive?.empty?.mvp,
  ];
  if (result.schemaVersion !== 1 || requiredStrings.some((value) => typeof value !== 'string' || value.length === 0)) throw new Error('生涯总结文案格式无效');
  careerContent = result;
  return careerContent;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function formatCompactNumber(value) {
  const amount = Math.round(Number(value) || 0);
  if (Math.abs(amount) < 1000) return String(amount);
  const scaled = amount / 1000;
  return `${scaled.toFixed(Math.abs(scaled) >= 10 ? 0 : 1).replace(/\.0$/, '')}k`;
}
function formatUsd(value) { return `$${formatCompactNumber(value)}`; }
function setCompactValue(selector, value, formatter = formatCompactNumber) {
  const node = $(selector);
  if (!node) return;
  node.textContent = formatter(value);
  node.title = String(Math.round(Number(value) || 0));
}

function careerStage(profile) {
  if (!profile.currentTeamId) return profile.freeAgencyStatus === 'FREE_AGENT' ? '自由市场选手' : '地区新人';
  if (profile.currentTeamTier === 'T1') return 'Tier 1 职业选手';
  if (profile.currentTeamTier === 'T2') return 'Tier 2 职业选手';
  return '职业赛场新秀';
}
function careerGoals(profile) {
  const majorEntries = profile.tournamentArchive.filter((record) => record.level === 'MAJOR');
  const bestTop = profile.trophies.top20Records.length ? Math.min(...profile.trophies.top20Records.map((record) => record.rank)) : null;
  return {
    stage: careerStage(profile),
    major: profile.trophies.majorChampionships > 0 ? `${profile.trophies.majorChampionships} 次 Major 冠军` : majorEntries.length ? `${majorEntries.length} 次 Major 征程` : profile.currentTeamId ? '冲击 Major 资格' : '先获得职业合同',
    top: bestTop ? `生涯最佳 TOP #${bestTop}` : '等待首次年度上榜',
  };
}
function selectedRegion() { return document.querySelector('.region.selected')?.dataset.region || '中国'; }
function uiRandomCursorKey(gameId) { return `cope:ui-random-cursor:v1:${encodeURIComponent(gameId)}`; }
function restoreUiRandom(seed, gameId, reset = false) {
  deterministicState = [...seed].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
  activeRandomSlot = gameId;
  const rawStored = Number(localStorage.getItem(uiRandomCursorKey(gameId)));
  const stored = reset ? 0 : Number.isSafeInteger(rawStored) && rawStored >= 0 && rawStored <= 1_000_000 ? rawStored : 0;
  deterministicCursor = 0;
  for (let index = 0; index < stored; index += 1) {
    deterministicState = (1664525 * deterministicState + 1013904223) >>> 0;
    deterministicCursor += 1;
  }
  if (reset) localStorage.setItem(uiRandomCursorKey(gameId), '0');
}
function nextRoll() {
  deterministicState = (1664525 * deterministicState + 1013904223) >>> 0;
  deterministicCursor += 1;
  if (activeRandomSlot) localStorage.setItem(uiRandomCursorKey(activeRandomSlot), String(deterministicCursor));
  return deterministicState / 0x100000000;
}
function isAdverseAttributeDelta(attribute, delta) {
  if (!Number.isFinite(delta) || delta === 0) return false;
  // TEAM_CONFLICT is an adverse attribute: increasing it worsens the profile.
  return attribute === 'TEAM_CONFLICT' ? delta > 0 : delta < 0;
}
function selectRole(key) {
  const data = roleData[key];
  document.querySelectorAll('.map-role').forEach((button) => button.classList.toggle('selected', button.dataset.role === key));
  $('#roleTitle').textContent = data.title;
  $('#roleDesc').textContent = data.description;
  role.value = key;
}
async function loadTeamDirectory() {
  if (teamDirectory) return teamDirectory;
  const response = await fetch('assets/teams/teams.json');
  if (!response.ok) throw new Error('战队资产加载失败');
  const payload = await response.json();
  teamDirectory = new Map((payload.teams || []).map((team) => [team.id, team]));
  return teamDirectory;
}
function teamAssetPath(team) {
  const relative = team?.logo || 'teams_profile/Unknown_PlayerProfile.svg';
  if (team?.logo) return `assets/teams/${relative}`;
  const letter = (team?.letter || team?.name || 'A').slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path fill="#4F657D" fill-rule="evenodd" d="M52.468 1.145C60.585 5.898 69.563 11.155 93.779 11.155 94.187 12.175 95 17.761 95 31.952 95 49.69 93.204 75.67 50.5 99 7.796 75.67 6 49.69 6 31.952 6 17.761 6.813 12.175 7.221 11.155 31.437 11.155 40.415 5.898 48.532 1.145 49.191 .759 49.844 .376 50.5 0 51.155 .376 51.808 .759 52.468 1.145Z"/><text id="letter" x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#D9E1E9" font-size="50" font-family="Arial,sans-serif" font-weight="bold">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
let tournamentAssets = null;
async function loadTournamentAssets() {
  if (tournamentAssets) return tournamentAssets;
  const response = await fetch('assets/events/tournament-assets.json').catch(() => null);
  const payload = response && response.ok ? await response.json() : { series: {}, fallback: '' };
  tournamentAssets = payload;
  return tournamentAssets;
}
function tournamentAssetPath(seriesId) {
  const exact = tournamentAssets?.series?.[seriesId];
  if (exact !== undefined) return exact;
  const match = Object.entries(tournamentAssets?.series || {}).find(([key]) => seriesId?.startsWith(`${key}-`));
  return match?.[1] || tournamentAssets?.fallback || '';
}
async function renderProfile(profile) {
  const enumCopy = await loadEnumContent();
  const attributeKeys = ['aim', 'gameSense', 'leadership', 'clutch', 'consistency', 'teamConflict'];
  const attributes = attributeKeys.map((key) => {
    const raw = Number(profile.attributes?.[key]);
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    return [key, value];
  });
  const values = attributes;
  $('#attributeGrid').innerHTML = values.map(([key, value]) => `<div class="attribute-row"><span>${attributeLabels[key] || key}</span><div class="attribute-bar"><i style="width:${value}%"></i></div><b>${value}</b></div>`).join('');
  $('#profileMode').textContent = enumCopy.modes[profile.difficultyMode] || profile.difficultyMode;
  $('#profileLife').textContent = `士气 ${profile.morale} · 精力 ${profile.energy} · 压力 ${profile.life.stress}`;
  const teams = await loadTeamDirectory().catch(() => new Map());
  const team = profile.currentTeamId ? teams.get(profile.currentTeamId) : null;
  const teamName = team?.name || (profile.currentTeamId ? '未登记战队' : '未签约');
  const teamLogo = $('#sideTeamLogo');
  const teamLetter = $('#sideTeamLetter');
  if (teamLogo) {
    teamLogo.src = teamAssetPath(team);
    teamLogo.alt = `${teamName} 队标`;
    teamLogo.hidden = !profile.currentTeamId;
  }
  if (teamLetter) {
    teamLetter.textContent = team?.letter || teamName.slice(0, 1) || 'C';
    teamLetter.hidden = Boolean(profile.currentTeamId && team?.hasLogo);
  }
  $('#profileTeam').textContent = teamName;
  $('#dashboardOverall').textContent = Math.round(values.reduce((sum, [, value]) => sum + value, 0) / values.length);
  const tournamentSummary = typeof window.COPEEngine.getTournamentSummary === 'function' ? await window.COPEEngine.getTournamentSummary() : { official: profile.tournamentArchive || [], qualifiers: [] };
  const archive = tournamentSummary.official || [];
  const qualifiers = tournamentSummary.qualifiers || [];
  $('#dashboardSeason').textContent = `${profile.age} 岁 · ${archive.length + qualifiers.length} 场赛事记录`;
  const qualifierRows = qualifiers.map((result) => {
    const performance = result.playerPerformances.find((item) => item.playerId === profile.id);
    return { fullName: result.eventName, placement: result.placement === 'QUALIFIED' ? '晋级正赛 · 预选赛' : '止步预选 · 预选赛', rating: performance?.rating ?? 0, mapsPlayed: performance?.maps ?? 0, kills: performance?.kills ?? 0 };
  });
  const totalArchiveMaps = archive.reduce((sum, record) => sum + record.mapsPlayed, 0) + qualifierRows.reduce((sum, record) => sum + record.mapsPlayed, 0);
  const weightedRating = totalArchiveMaps ? ([...archive, ...qualifierRows]).reduce((sum, record) => sum + record.rating * record.mapsPlayed, 0) / totalArchiveMaps : 0;
  const champions = archive.filter((record) => record.champion).length;
  const totalKills = archive.reduce((sum, record) => sum + (record.kills ?? 0), 0) + qualifierRows.reduce((sum, record) => sum + record.kills, 0);
  const recentRecords = [...archive.map((record) => ({ ...record, placement: enumCopy.placements[record.placement] || record.placement, kills: record.kills ?? 0 })), ...qualifierRows];
  $('#tournamentSummaryCount').textContent = `${recentRecords.length} 场`;
  $('#tournamentSummaryContent').innerHTML = recentRecords.length
    ? `<div><span>总地图</span><b>${totalArchiveMaps}</b></div><div><span>平均 Rating</span><b>${weightedRating.toFixed(2)}</b></div><div><span>冠军</span><b>${champions}</b></div><details><summary>最近赛事</summary>${recentRecords.slice(-5).reverse().map((record) => `<p><strong>${escapeHtml(record.fullName)}</strong><span>${escapeHtml(record.placement)} · ${record.rating.toFixed(2)} · ${record.mapsPlayed} 图 · ${record.kills ?? 0} 杀</span></p>`).join('')}</details>`
    : '<span>尚无赛事记录</span>';
  $('#dashboardGameId').textContent = profile.gameId;
  $('#dashboardRegion').textContent = `${enumCopy.regions[profile.originRegion] || profile.originRegion} · ${enumCopy.playerRoles[profile.role] || profile.role}`;
  $('#dashboardRole').textContent = enumCopy.playerRoles[profile.role] || profile.role;
  $('#dashboardTeam').textContent = teamName;
  $('#dashboardAge').textContent = profile.age;
  setCompactValue('#dashboardBalance', profile.life.balance, formatUsd);
  $('#dashboardMaps').textContent = profile.career.mapsPlayed;
  setCompactValue('#dashboardKills', profile.career.totalKills);
  $('#sideTeamName').textContent = profile.currentTeamId ? teamName : '自由球员';
  $('#sideTeamStatus').textContent = profile.currentTeamId ? '当前合同队伍' : (profile.freeAgencyStatus === 'FREE_AGENT' ? '正在寻找新队伍' : '等待首次签约');
  $('#teamRank').textContent = profile.currentTeamId ? ($('#teamRank').textContent || 'VRS 未初始化') : '未排名';
  const contractStatus = $('#contractStatus');
  const freeAgencyStatus = $('#freeAgencyStatus');
  const releaseReason = $('#releaseReason');
  if (contractStatus) contractStatus.textContent = profile.currentContractId ? '合同状态：有效合同' : '合同状态：无有效合同';
  if (freeAgencyStatus) freeAgencyStatus.textContent = profile.freeAgencyStatus === 'FREE_AGENT' ? `自由市场：${profile.freeAgencySince ? `自 ${profile.freeAgencySince.slice(0, 10)}` : '进行中'}` : '自由市场：未进入';
  if (releaseReason) {
    releaseReason.hidden = !profile.releaseReason;
    releaseReason.textContent = profile.releaseReason ? `离队原因：${enumCopy.releaseReasons[profile.releaseReason] || profile.releaseReason}` : '';
  }
  const goals = careerGoals(profile);
  $('#careerStage').textContent = goals.stage;
  $('#majorGoal').textContent = goals.major;
  $('#topGoal').textContent = goals.top;
  const retireButton = $('#retireBtn');
  if (retireButton) {
    retireButton.disabled = profile.isRetired;
    retireButton.title = profile.isRetired ? '生涯已经封存' : '封存当前职业生涯并生成总结';
  }

}
async function refreshVrsStatus() {
  const status = await window.COPEEngine.getVrsStatus().catch(() => null);
  const node = $('#teamRank');
  if (!node || !status) return;
  node.textContent = status.rank === null
    ? status.source === null ? 'VRS 未上榜 · 未进入官方排名' : 'VRS 未上榜'
    : `VRS #${status.rank} · ${status.points ?? 0} 分`;
}
function setSingleFlowStage() {
  $('.season-panel')?.setAttribute('hidden', '');
  $('#matchFlow')?.setAttribute('hidden', '');
  $('#tournamentGrid')?.setAttribute('hidden', '');
}
function flowProgress(completed, total) {
  const safeTotal = Math.max(1, total);
  return `<div class="single-flow-progress"><span>SEASON FLOW</span><i><em style="width:${Math.min(100, Math.round((completed / safeTotal) * 100))}%"></em></i><b>${completed} / ${total}</b></div>`;
}
async function renderTournamentCalendar(profile) {
  setSingleFlowStage();
  const calendar = await window.COPEEngine.startSeason();
  const next = await window.COPEEngine.getNextTournament();
  const completed = next ? Math.max(0, calendar.findIndex((item) => item.id === next.id)) : calendar.length;
  const progress = calendar.length ? Math.round((completed / calendar.length) * 100) : 100;
  $('#scheduleProgress').innerHTML = `<span>赛季进度</span><b>${completed} / ${calendar.length} 场${next ? ' · 下一场' : ' · 阶段完成'}</b><i aria-hidden="true"><em style="width:${progress}%"></em></i>`;
  if (!next) {
    $('#tournamentGrid').innerHTML = '<p class="event-empty">本阶段赛事已完成，等待总结。</p>';
    return null;
  }
  return next;
}
async function simulateTournament(event, profile) {
  const generation = sessionGeneration;
  const enumCopy = await loadEnumContent();
  await loadTournamentAssets();
  assertSessionCurrent(generation);
  setSingleFlowStage();
  const calendar = await window.COPEEngine.startSeason();
  assertSessionCurrent(generation);
  const next = await window.COPEEngine.getNextTournament();
  assertSessionCurrent(generation);
  const completed = next ? Math.max(0, calendar.findIndex((item) => item.id === next.id)) : calendar.length;
  const trophy = tournamentAssetPath(event.seriesId);
  $('#eventPeriod').textContent = event.simulationMode === 'SWISS' ? 'MAJOR SWISS' : 'TOURNAMENT';
  const qualificationCopy = event.tier === 'MAJOR'
    ? `Major 资格：VRS 快照前 32（当前 #${event.snapshotRank ?? '未排名'}，${event.snapshotRank >= 1 && event.snapshotRank <= 32 ? '符合资格' : '无资格'}）`
    : event.qualificationSource === 'PUBLIC_QUALIFIER' ? '参赛资格：需通过公开预选赛' : '参赛资格：VRS 直接邀请';
  const renderRunning = (ui = {}) => {
    const detailed = tournamentPresentationMode === 'DETAILED';
    const swiss = ui.mode === 'SWISS';
    const qualifier = ui.qualifier === true;
    const situation = ui.eliminationMatch ? '生死局' : ui.advancementMatch ? '晋级局' : `第 ${ui.round || 1} 轮`;
    $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card tournament-stage ${detailed ? 'is-detailed' : 'is-quick'}"><p class="eyebrow">${qualifier ? 'PUBLIC QUALIFIER' : swiss ? 'MAJOR SWISS' : detailed ? '详细赛事' : '赛季进行中'} · ${escapeHtml(enumCopy.tiers[event.tier] || event.tier)}</p><div class="tournament-hero"><div><h2>${detailed ? escapeHtml(event.name) : '赛季进行中'}</h2><p class="event-copy">${detailed ? `${escapeHtml(qualificationCopy)} · ${escapeHtml(event.city || '线上赛')} · ${escapeHtml(event.format || 'BO3')} · ${qualifier ? '资格赛比赛过程与结果可见；地图与击杀计入生涯累计，但不计年度 TOP20。' : swiss ? `${situation}，3 胜晋级 / 3 败淘汰。` : '逐节点查看组赛、淘汰赛与决赛。'}` : `正在结算 ${escapeHtml(event.name)}；所有赛事结果会同步到右侧赛事总结。`}</p>${detailed && swiss ? `<div class="swiss-score"><span>胜场 <b>${ui.wins || 0}</b></span><span>负场 <b>${ui.losses || 0}</b></span><strong>${situation}</strong></div>` : ''}</div>${detailed && trophy ? `<img class="tournament-mark tournament-trophy" src="${escapeHtml(trophy)}" alt="${escapeHtml(event.name)}赛事奖杯" />` : ''}</div><div class="tournament-run" id="singleTournamentRun"><strong>${detailed ? qualifier ? '公开预选赛进行中' : swiss ? '等待推进下一轮' : '等待推进下一节点' : '自动结算赛事中'}</strong><span>${detailed ? '详细模式会逐节点呈现，本项赛事结果停留 2.5 秒。' : `已完成 ${completed} / ${calendar.length} 项赛事`}</span><i><em></em></i></div>${detailed ? '<button class="continue-schedule" id="advanceTournamentNodeBtn">推进下一节点 →</button>' : ''}</article>`;
  };
  assertSessionCurrent(generation);
  renderRunning({ mode: event.simulationMode || (event.tier === 'MAJOR' ? 'SWISS' : 'FAST') });
  let advancing = false;
  const advance = async () => {
    if (advancing) return;
    advancing = true;
    $('#singleTournamentRun')?.classList.add('is-settling');
    try {
      const progress = await window.COPEEngine.advanceTournament({ mode: tournamentPresentationMode === 'DETAILED' ? 'NEXT_NODE' : 'UNTIL_DECISION_OR_COMPLETE' });
      assertSessionCurrent(generation);
      const updated = await window.COPEEngine.getProfile();
      assertSessionCurrent(generation);
      if (progress.uiData?.eventRequired) {
        const inTournamentEvent = await window.COPEEngine.findCareerEvent('SEASON_END');
        assertSessionCurrent(generation);
        if (inTournamentEvent) { await renderEvent(inTournamentEvent); return; }
      }
      if (progress.uiData?.qualifier && progress.uiData?.qualified === true) {
        const qualifier = progress.uiData.qualifierPerformance;
        $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card outcome-stage"><p class="eyebrow">QUALIFIER OUTCOME / 预选赛结果</p><h2>${escapeHtml(event.name)}</h2><p class="event-copy">公开预选赛晋级成功。资格赛地图与击杀已计入生涯累计，但不计年度 TOP20，下一步进入正赛。</p><div class="result-grid"><div><span>地图</span><b>${qualifier?.maps ?? '—'}</b></div><div><span>Rating</span><b>${typeof qualifier?.rating === 'number' ? qualifier.rating.toFixed(2) : '—'}</b></div><div><span>击杀</span><b>${qualifier?.kills ?? '—'}</b></div><div><span>结果</span><b>晋级正赛</b></div></div><p class="flow-auto-next">1.5 秒后进入正赛</p></article>`;
        scheduleSession(renderCurrentPeriod, 1500);
        return;
      }
      if (progress.status === 'QUALIFIER_EXIT') {
        const qualifier = progress.uiData?.qualifierPerformance;
        $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card outcome-stage qualification-failed"><p class="eyebrow">QUALIFIER OUTCOME / 预选赛结果</p><h2>${escapeHtml(event.name)}</h2><p class="event-copy">预选赛已经结束。比赛数据保留在资格赛档案中，地图与击杀计入生涯累计，但不计年度 TOP20。</p><div class="result-grid"><div><span>地图</span><b>${qualifier?.maps ?? '—'}</b></div><div><span>Rating</span><b>${typeof qualifier?.rating === 'number' ? qualifier.rating.toFixed(2) : '—'}</b></div><div><span>击杀</span><b>${qualifier?.kills ?? '—'}</b></div><div><span>结果</span><b>止步预选</b></div></div><p class="flow-auto-next">1.5 秒后继续赛季流程</p></article>`;
        scheduleSession(renderCurrentPeriod, 1500);
        return;
      }
      if (progress.status === 'ONGOING') {
        renderRunning(progress.uiData || {});
        advancing = false;
        const advanceButton = $('#advanceTournamentNodeBtn');
        if (advanceButton) advanceButton.addEventListener('click', advance, { once: true });
        else scheduleSession(advance, 0);
        return;
      }
      const result = progress.result;
      if (!result) { await renderCurrentPeriod(); return; }
      const performance = result.playerPerformances.find((item) => item.playerId === updated.id) || result.playerPerformances[0];
      const rating = performance?.rating ?? 0;
      const honor = result.honors.find((item) => item.playerId === updated.id)?.type;
      const placement = enumCopy.placements[result.placement] || result.placement;
      const honorLabel = honor ? enumCopy.honors[honor] || honor : '';
      const teams = await loadTeamDirectory().catch(() => new Map());
      assertSessionCurrent(generation);
      const seriesRows = (result.seriesDetails || []).map((series) => `<div class="series-row"><span>${escapeHtml(series.stage)}</span><b>${escapeHtml(series.format)}</b><span>${escapeHtml(teams.get(series.opponentTeamId)?.name || '未知战队')} · ${escapeHtml((series.mapScores || []).join(' / '))}</span></div>`).join('');
      $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card tournament-stage outcome-stage"><p class="eyebrow">TOURNAMENT OUTCOME / 赛事结果</p>${trophy ? `<img class="outcome-trophy" src="${escapeHtml(trophy)}" alt="${escapeHtml(result.eventName)}赛事奖杯" />` : ''}<h2>${escapeHtml(result.eventName)}</h2><p class="event-copy">${escapeHtml(placement)} · Rating ${rating.toFixed(2)}${honorLabel ? ` · ${escapeHtml(honorLabel)}` : ''}</p><div class="result-grid"><div><span>地图</span><b>${performance?.maps ?? 0}</b></div><div><span>Rating / ADR</span><b>${rating.toFixed(2)} / ${(performance?.adr ?? 0).toFixed(0)}</b></div><div><span>KAST</span><b>${(performance?.kast ?? 0).toFixed(1)}%</b></div><div><span>击杀</span><b>${performance?.kills ?? 0}</b></div><div><span>状态</span><b>${result.title ? '冠军' : '完赛'}</b></div></div>${seriesRows ? `<details class="series-details"><summary>查看比赛明细</summary>${seriesRows}</details>` : ''}<p class="flow-auto-next">1.5 秒后继续赛季流程</p></article>`;
      await renderProfile(updated);
      assertSessionCurrent(generation);
      const continueAfterTournament = async () => {
        const postEvent = await window.COPEEngine.findCareerEvent('POST_TOURNAMENT');
        assertSessionCurrent(generation);
        if (postEvent) { await renderEvent(postEvent); return; }
        await renderTournamentCalendar(updated);
        assertSessionCurrent(generation);
        await renderCurrentPeriod();
      };
      if (tournamentPresentationMode === 'QUICK') {
        await continueAfterTournament();
        return;
      }
      scheduleSession(continueAfterTournament, 2500);
    } catch (error) {
      if (!sessionIsCurrent(generation)) return;
      advancing = false;
      $('#eventContent').insertAdjacentHTML('beforeend', `<p class="event-result failure">${escapeHtml(error.message)}</p>`);
    }
  };
  const advanceButton = $('#advanceTournamentNodeBtn');
  if (advanceButton) advanceButton.addEventListener('click', advance, { once: true });
  else scheduleSession(advance, 0);
}
function renderStartupError(message) {
  const errorNode = $('#startupError');
  if (errorNode) {
    errorNode.hidden = false;
    errorNode.textContent = message;
  }
}

async function renderNoEvent(message) {
  activeEventId = null;
  if (!window.COPEEngine) {
    renderStartupError(message || '生涯暂时无法继续，请刷新页面后重试。');
    return;
  }
  const tournament = await window.COPEEngine.getNextTournament();
  const profile = await window.COPEEngine.getProfile();
  if (tournament) {
    scheduleSession(() => simulateTournament(tournament, profile), 450);
    return;
  }
  setSingleFlowStage();
  $('#eventContent').innerHTML = `<article class="single-flow-card event-empty-card"><p class="event-empty">${escapeHtml(message)}</p><button class="continue-schedule" id="advanceScheduleBtn">继续赛季 →</button></article>`;
  $('#advanceScheduleBtn').addEventListener('click', async () => {
    await window.COPEEngine.advancePeriod('NORMAL', nextRoll());
    const updated = await window.COPEEngine.getProfile();
    await renderProfile(updated);
    await renderTournamentCalendar(updated);
    await renderCurrentPeriod();
  });
}
async function renderEvent(event, resultText = '', navigation = {}) {
  const enumCopy = await loadEnumContent();
  activeEventId = event.id;
  setSingleFlowStage();
  const profile = await window.COPEEngine.getProfile();
  $('#eventPeriod').textContent = 'DECISION';
  $('#eventContent').innerHTML = `<div class="single-flow-progress"><span>SEASON FLOW</span><i><em style="width:100%"></em></i><b>DECISION</b></div><article class="single-flow-card event-card"><p class="eyebrow">${escapeHtml(enumCopy.eventTypes[event.type] || event.type)}</p><h2>${escapeHtml(event.title)}</h2><p class="event-copy">${escapeHtml(event.description)}</p>${resultText ? `<p class="event-result event-context-result">${escapeHtml(resultText)}</p>` : ''}<div class="event-options">${event.options.map((option) => `<button class="event-option" data-option-id="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span>${option.description ? `<small class="option-description">${escapeHtml(option.description)}</small>` : ''}<small class="option-chance">${Math.round((option.successChance?.baseChance ?? 0.5) * 100)}%</small></button>`).join('')}</div></article>`;
  document.querySelectorAll('.event-option').forEach((button) => button.addEventListener('click', async () => {
    document.querySelectorAll('.event-option').forEach((item) => { item.disabled = true; });
    try {
      const result = await window.COPEEngine.chooseOption({ eventId: activeEventId, optionId: button.dataset.optionId, randomRoll: nextRoll() });
    const messages = result.resultMessages?.length ? result.resultMessages : [event.title];
    const effects = result.appliedEffects || [];
    const effectLabels = { AIM: '枪法', GAME_SENSE: '意识', LEADERSHIP: '指挥', CLUTCH: '残局', CONSISTENCY: '稳定性', TEAM_CONFLICT: '团队冲突', MORALE: '士气', ENERGY: '精力', STRESS: '压力', BALANCE: '资金', FAME: '名气', TEAM_STATUS: '队内地位', TEAM_RELATIONSHIP: '队内关系', FORM: '竞技状态', MENTALITY: '心态', CLUB_FAVOR: '俱乐部好感', FAN_REPUTATION: '粉丝口碑' };
    const teams = await loadTeamDirectory().catch(() => new Map());
    const changes = effects.map((effect) => {
      if (effect.type === 'ATTRIBUTE_CHANGE') return { label: `${effectLabels[effect.attribute] || effect.attribute} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`, negative: isAdverseAttributeDelta(effect.attribute, effect.delta) };
      if (effect.type === 'PLAYER_STAT_CHANGE') {
        const negative = effect.stat === 'STRESS' ? effect.delta > 0 : ['ENERGY', 'MORALE', 'BALANCE'].includes(effect.stat) ? effect.delta < 0 : false;
        return { label: `${effectLabels[effect.stat] || effect.stat} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`, negative };
      }
      if (effect.type === 'NARRATIVE_METRIC_CHANGE') return { label: `${effectLabels[effect.metric] || effect.metric} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`, negative: effect.delta < 0 };
      if (effect.type === 'TEAM_TRANSFER') return { label: effect.offerRef === 'CURRENT_TRANSFER_OFFER' ? '接受当前正式报价' : `转入 ${teams.get(effect.teamId)?.name || '新队伍'}`, negative: false };
      if (effect.type === 'FORCE_CONTRACT_TERMINATION') return { label: '被迫解约', negative: true };
      return null;
    }).filter(Boolean);
    const resultTitle = event.title;
    const resultDetails = messages.join(' ') || '选项结果已写入本次生涯。';
    $('#eventContent').innerHTML = `<article class="single-flow-card event-card event-result-card ${result.succeeded ? 'is-success' : 'is-failure'}"><p class="eyebrow">${result.succeeded ? '成功结果' : '失败结果'}</p><h2>${escapeHtml(resultTitle)}</h2><div class="event-roll"><strong>${result.succeeded ? '✓' : '!'}</strong><span>${escapeHtml(resultDetails)}</span></div>${changes.length ? `<div class="effect-chips">${changes.map((change) => `<span class="${change.negative ? 'is-negative' : ''}">${escapeHtml(change.label)}</span>`).join('')}</div>` : ''}<button class="continue-schedule" id="continueEventBtn">继续</button></article>`;
    await renderProfile(result.profile);
    await refreshVrsStatus();
    await renderTournamentCalendar(result.profile);
    setSingleFlowStage();
    $('#continueEventBtn').addEventListener('click', async () => {
      if (event.period === 'TRANSFER_WINDOW') {
        await continueOffseason();
        return;
      }
      if (event.period === 'OFFSEASON') {
        if (navigation.resumeWithoutPeriodAdvance === true) await renderCurrentPeriod();
        else await continueOffseason();
        return;
      }
      if (event.phase === 'POST_TOURNAMENT') {
        await renderCurrentPeriod();
        return;
      }
      const nextTournament = await window.COPEEngine.getNextTournament();
      if (nextTournament) {
        const inTournamentEvent = await window.COPEEngine.findCareerEvent('SEASON_END');
        if (inTournamentEvent) {
          await renderEvent(inTournamentEvent);
          return;
        }
        const nextProfile = await window.COPEEngine.getProfile();
        await simulateTournament(nextTournament, nextProfile);
      } else {
        const current = await window.COPEEngine.getProfile();
        if (current.freeAgencyStatus === 'FREE_AGENT' || current.freeAgencyStatus === 'UNSIGNED') {
          await renderCurrentPeriod();
        } else {
          await renderSeasonReport();
        }
      }
    });
    } catch (error) {
      document.querySelectorAll('.event-option').forEach((item) => { item.disabled = false; });
      const card = $('#eventContent .event-card');
      card?.querySelector('.event-result.failure')?.remove();
      card?.insertAdjacentHTML('beforeend', `<p class="event-result failure">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`);
    }
  }));
}
async function renderCurrentPeriod(resultText = '') {
  setSingleFlowStage();
  const profile = await window.COPEEngine.getProfile();
  const event = await window.COPEEngine.findCareerEvent('PRE_TOURNAMENT');
  if (event) { await renderEvent(event, resultText); return; }
  const tournament = await window.COPEEngine.getNextTournament();
  if (tournament) { await simulateTournament(tournament, profile); return; }
  if (!profile.currentTeamId && profile.freeAgencyStatus === 'FREE_AGENT') {
    const copy = (await loadFlowContent()).freeAgent;
    const [actions, standInOffers] = await Promise.all([
      window.COPEEngine.listDailyActions('NORMAL'),
      window.COPEEngine.listStandInOffers(),
    ]);
    const visibleActions = actions.filter((action) => action.id === 'stream' || action.id === 'rest');
    $('#eventPeriod').textContent = copy.period;
    const actionMarkup = visibleActions.map((action) => {
      const label = fillMarketTemplate(copy.actionButtonTemplate, { name: action.name || copy.actionFallbacks[action.id] || action.id });
      return `<button type="button" class="continue-schedule free-agent-action" data-daily-action="${escapeHtml(action.id)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(action.description)}</span></button>`;
    }).join('');
    const opportunityMarkup = standInOffers.map((offer) => `<article class="stand-in-opportunity"><strong>${escapeHtml(copy.standInLabel)} · ${escapeHtml(offer.teamName)}</strong><span>${escapeHtml(offer.edition.name)} · ${escapeHtml(offer.tier)} · $${offer.appearanceFee}</span><div><button class="continue-schedule" data-stand-in-accept="${escapeHtml(offer.offerId)}">${escapeHtml(copy.standInAccept)}</button><button class="continue-schedule" data-stand-in-reject="${escapeHtml(offer.offerId)}">${escapeHtml(copy.standInReject)}</button></div></article>`).join('');
    $('#eventContent').innerHTML = `<article class="single-flow-card event-card free-agent-card"><p class="eyebrow">${escapeHtml(copy.eyebrow)}</p><h2>${escapeHtml(copy.title)}</h2><p class="event-copy">${escapeHtml(copy.description)}</p>${resultText ? `<p class="event-result">${escapeHtml(resultText)}</p>` : ''}<section class="opportunity-inbox"><h3>${escapeHtml(copy.opportunityTitle)}</h3>${opportunityMarkup || `<p class="event-empty">${escapeHtml(copy.noOpportunities)}</p>`}<button type="button" class="continue-schedule" id="openFreeAgentMarket">${escapeHtml(copy.marketLabel)}</button></section><div class="free-agent-actions">${actionMarkup || `<p class="event-empty">${escapeHtml(copy.unavailable)}</p>`}</div></article>`;
    $('#openFreeAgentMarket')?.addEventListener('click', () => renderTransferMarket(() => renderCurrentPeriod()), { once: true });
    document.querySelectorAll('[data-stand-in-accept]').forEach((button) => button.addEventListener('click', async () => { await window.COPEEngine.acceptStandInOffer(button.dataset.standInAccept); await renderCurrentPeriod(); }, { once: true }));
    document.querySelectorAll('[data-stand-in-reject]').forEach((button) => button.addEventListener('click', async () => { await window.COPEEngine.respondStandInOffer(button.dataset.standInReject, 'REJECT'); await renderCurrentPeriod(); }, { once: true }));
    document.querySelectorAll('[data-daily-action]').forEach((button) => button.addEventListener('click', async () => {
      const buttons = [...document.querySelectorAll('[data-daily-action]')];
      buttons.forEach((item) => { item.disabled = true; });
      try {
        const action = actions.find((candidate) => candidate.id === button.dataset.dailyAction);
        const updated = await window.COPEEngine.executeDailyAction(button.dataset.dailyAction, nextRoll());
        await renderProfile(updated);
        await renderSeasonReport();
        if (!$('#continueYearBtn')) await renderCurrentPeriod(fillMarketTemplate(copy.resultTemplate, { name: action?.name || button.dataset.dailyAction }));
      } catch (error) {
        await renderCurrentPeriod(copy.error);
      }
    }, { once: true }));
    return;
  }
  if (!tournament) { await renderSeasonReport(); return; }
  renderNoEvent(resultText || '当前时期没有可用事件。');
}
async function startSimulation(options = {}) {
  const button = $('#playBtn');
  button.disabled = true;
  $('#startupError').hidden = true;
  try {
    if (!window.COPEEngine) throw new Error('生涯暂时无法开始，请刷新页面后重试。');
    const gameId = callsign.value.trim();
    const createConfig = options.config ?? currentSetupConfig(gameId);
    if (!gameId) throw new Error((await loadSaveContent()).restart.missingId);
    const savedGames = typeof window.COPEEngine.listGames === 'function' ? await window.COPEEngine.listGames() : [];
    if (!options.loadOnly && !options.forceCreate && savedGames.includes(gameId)) {
      pendingStartConfig = createConfig;
      const copy = (await loadSaveContent()).existing;
      $('#existingSaveTitle').textContent = copy.title.replace('{gameId}', gameId);
      $('#existingSaveDescription').textContent = copy.description;
      $('#continueExistingBtn').textContent = copy.continueLabel;
      $('#restartExistingBtn').textContent = copy.restartLabel;
      existingSaveDialog.showModal();
      return;
    }
    if (options.loadOnly && typeof window.COPEEngine.loadGame === 'function') await window.COPEEngine.loadGame(gameId);
    else if (options.forceCreate && savedGames.includes(gameId)) await window.COPEEngine.restartGame(createConfig);
    else await window.COPEEngine.createGame(createConfig);
    const activeSeed = typeof window.COPEEngine.getRandomSeed === 'function' ? window.COPEEngine.getRandomSeed() : createConfig.randomSeed || gameId;
    restoreUiRandom(activeSeed, gameId, options.forceCreate === true);
    const profile = await window.COPEEngine.getProfile();
    const setup = $('#setup-page');
    const dashboard = $('#dashboard-page');
    setup.classList.remove('active');
    setup.classList.add('leaving');
    setup.hidden = true;
    setup.classList.remove('leaving');
    dashboard.hidden = false;
    dashboard.classList.add('active');
    if (profile.isRetired) {
      await renderCareerArchive(profile);
      return;
    }
    await renderProfile(profile);
    await refreshVrsStatus();
    await renderTournamentCalendar(profile);
    await renderCurrentPeriod();
  } catch (error) {
    renderStartupError(error instanceof Error ? error.message : String(error));
  } finally { button.disabled = false; helpDialog.close(); }
}
role.addEventListener('change', () => selectRole(role.value));
document.querySelectorAll('.map-role').forEach((button) => button.addEventListener('click', () => selectRole(button.dataset.role)));
document.querySelectorAll('.region').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.region').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); }));
document.querySelectorAll('.pace').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.pace').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); selectedCareerMode = button.dataset.mode === 'power' ? 'POWER_FANTASY' : 'HARDCORE'; }));
async function renderCareerArchive(player) {
  const enumCopy = await loadEnumContent();
  await loadTournamentAssets();
  const content = await loadCareerContent();
  const summary = await window.COPEEngine.generateRetirementSummary();
  $('#tournamentGrid').hidden = true;
  $('#matchFlow').hidden = true;
  document.querySelector('#gameSession').classList.add('career-archive-page');
  document.querySelector('.season-header').hidden = true;
  document.querySelector('.season-panel').hidden = true;
  document.querySelector('.dashboard-playerbar').hidden = true;
  document.querySelector('.career-goals').hidden = true;
  document.querySelector('.dashboard-side').hidden = true;
  document.querySelector('.event-panel > .panel-heading').hidden = true;
  const archiveCopy = content.archive;
  const trophyMarkup = summary.trophyRoom.map((item) => `<div class="archive-item archive-trophy"><img src="${escapeHtml(tournamentAssetPath(item.editionId) || 'assets/events/PGL_T1.webp')}" alt="${escapeHtml(item.fullName)}"><strong>${escapeHtml(item.fullName)}</strong><span>${item.year} · ${escapeHtml(enumCopy.levels[item.level] || item.level)}</span></div>`).join('');
  const mvpMarkup = summary.mvpRoom.map((item) => `<div class="archive-item"><img src="assets/mvp/${escapeHtml(item.badgeAssetId)}.webp" alt="MVP"><strong>${escapeHtml(item.fullName)}</strong><span>${item.year} · ${escapeHtml(item.level === 'MAJOR' ? archiveCopy.itemLabels.majorMvp : archiveCopy.itemLabels.eventMvp)}</span></div>`).join('');
  const topMarkup = summary.top20History.map((item) => `<div class="archive-item"><img src="assets/top/${item.rank <= 1 ? 'TOP1' : item.rank === 2 ? 'TOP2' : item.rank === 3 ? 'TOP3' : 'TOP4-20'}.svg" alt="TOP20"><strong>${item.year} ${escapeHtml(archiveCopy.itemLabels.annualTop)}</strong><span>${escapeHtml(archiveCopy.itemLabels.worldRank)} #${item.rank}</span></div>`).join('');
  const bestTop = summary.top20History.length ? Math.min(...summary.top20History.map((item) => item.rank)) : null;
  const headline = summary.careerOverview.majorChampionships ? archiveCopy.headlines.majorChampion : bestTop ? archiveCopy.headlines.topPlayer.replace('{rank}', String(bestTop)) : summary.careerOverview.otherSTierTitles ? archiveCopy.headlines.tierOneChampion : archiveCopy.headlines.journeyman;
  $('#eventContent').innerHTML = `<div class="career-archive"><header class="archive-hero"><p class="eyebrow">${escapeHtml(archiveCopy.eyebrow)}</p><h2>${escapeHtml(player.gameId)}</h2><strong>${escapeHtml(headline)}</strong><p>${escapeHtml(archiveCopy.labels.retiredAge)} ${summary.careerOverview.retiredAge} · ${escapeHtml(archiveCopy.labels.careerGrade)} ${summary.careerOverview.grade} · ${escapeHtml(summary.player.retiredAt.slice(0, 10))}</p></header><div class="archive-highlights"><div><span>${escapeHtml(archiveCopy.labels.majorChampionships)}</span><b>${summary.careerOverview.majorChampionships}</b></div><div><span>${escapeHtml(archiveCopy.labels.bestTop)}</span><b>${bestTop ? `#${bestTop}` : '—'}</b></div><div><span>${escapeHtml(archiveCopy.labels.mvp)}</span><b>${summary.mvpRoom.length}</b></div><div><span>${escapeHtml(archiveCopy.labels.peakRating)}</span><b>${summary.careerOverview.peakRating.toFixed(2)}</b></div></div><section class="archive-section archive-first"><h3>${escapeHtml(archiveCopy.sections.trophies)}</h3><div class="archive-grid">${trophyMarkup || `<p class="event-empty">${escapeHtml(archiveCopy.empty.trophies)}</p>`}</div></section><section class="archive-section"><h3>${escapeHtml(archiveCopy.sections.topHistory)}</h3><div class="archive-grid">${topMarkup || `<p class="event-empty">${escapeHtml(archiveCopy.empty.topHistory)}</p>`}</div></section><section class="archive-section"><h3>${escapeHtml(archiveCopy.sections.mvp)}</h3><div class="archive-grid">${mvpMarkup || `<p class="event-empty">${escapeHtml(archiveCopy.empty.mvp)}</p>`}</div></section><section class="archive-section"><h3>${escapeHtml(archiveCopy.sections.statistics)}</h3><div class="result-grid"><div><span>${escapeHtml(archiveCopy.labels.totalMaps)}</span><b>${summary.careerOverview.totalMaps}</b></div><div><span>${escapeHtml(archiveCopy.labels.totalKills)}</span><b>${formatCompactNumber(summary.careerOverview.totalKills)}</b></div><div><span>${escapeHtml(archiveCopy.labels.careerRating)}</span><b>${summary.careerOverview.averageRating.toFixed(2)}</b></div><div><span>${escapeHtml(archiveCopy.labels.careerEarnings)}</span><b>${formatUsd(summary.careerOverview.careerEarnings)}</b></div></div></section><div class="archive-actions"><button class="play-button" id="restartCareerBtn">${escapeHtml(archiveCopy.restartLabel)} <span>→</span></button></div></div>`;
  $('#restartCareerBtn').addEventListener('click', () => window.location.reload());
  $('#retireBtn').disabled = true;
  $('#retireBtn').textContent = '已退役';
  $('#eventPeriod').textContent = 'CAREER ARCHIVE';
}
async function retireCareer() {
  const current = await window.COPEEngine.getProfile();
  const player = current.isRetired ? current : await window.COPEEngine.retire('玩家主动退役');
  await renderCareerArchive(player);
}
const continueOffseason = async () => {
  const offseasonEvent = await window.COPEEngine.findCareerEvent('OFFSEASON');
  if (offseasonEvent) {
    await renderEvent(offseasonEvent);
    return;
  }
  await window.COPEEngine.advancePeriod('OFFSEASON', nextRoll());
  const profile = await window.COPEEngine.getProfile();
  if (profile.isRetired) {
    await renderCareerArchive(profile);
    return;
  }
  await renderProfile(profile);
  await refreshVrsStatus();
  const transitionEvent = await window.COPEEngine.findCareerEvent('OFFSEASON');
  if (transitionEvent) {
    await renderEvent(transitionEvent, '', { resumeWithoutPeriodAdvance: true });
    return;
  }
  await renderTournamentCalendar(profile);
  await renderCurrentPeriod();
};

async function renderTransferMarket(onSkip = continueOffseason) {
  const teams = await loadTeamDirectory().catch(() => new Map());
  const offers = await window.COPEEngine.listTransferTargets();
  const marketCopy = (await loadMarketContent())?.market;
  if (!marketCopy) { await onSkip(); return; }
  const reachable = offers.filter((offer) => offer.eligible && offer.availability !== 'UNREACHABLE');
  $('#eventPeriod').textContent = marketCopy.period;
  const offerMarkup = (offer) => {
    const team = teams.get(offer.teamId);
    return `<button class="market-offer-card transfer-target" data-team-id="${escapeHtml(offer.teamId)}"><span class="market-team-logo"><img src="${escapeHtml(teamAssetPath(team))}" alt="${escapeHtml(offer.teamName)} 队标"></span><strong>${escapeHtml(offer.teamName)}</strong></button>`;
  };
  $('#eventContent').innerHTML = `<article class="single-flow-card event-card market-board"><p class="eyebrow">${escapeHtml(marketCopy.eyebrow)}</p><h2>${escapeHtml(marketCopy.title)}</h2><div class="market-offers">${reachable.map(offerMarkup).join('') || `<p class="event-empty">${escapeHtml(marketCopy.emptyLabel)}</p>`}</div><button class="continue-schedule" id="skipTransferBtn">${escapeHtml(marketCopy.skipLabel)}</button></article>`;
  document.querySelectorAll('.transfer-target:not(:disabled)').forEach((button) => button.addEventListener('click', async () => { await window.COPEEngine.selectTransferTarget(button.dataset.teamId); const event = await window.COPEEngine.findCareerEvent('TRANSFER_WINDOW'); if (event) await renderEvent(event); else renderNoEvent('报价确认事件不可用。'); }, { once: true }));
  $('#skipTransferBtn').addEventListener('click', onSkip, { once: true });
}

async function renderSeasonReport() {
  const report = await window.COPEEngine.finishSeason();
  if (!report) { renderNoEvent('当前赛季尚未完成。'); return; }
  $('#tournamentGrid').hidden = true;
  const top20 = (report.top20Ranking?.entries || []).slice(0, 20);
  const playerRank = report.top20Ranking?.careerPlayerRank;
  const fullTop20Markup = top20.map((entry) => `<div class="top20-entry"><b>#${entry.rank}</b><span>${escapeHtml(entry.identity.nickname)}<small>${escapeHtml(entry.identity.countryCode)} · ${escapeHtml(entry.identity.teamName)}</small></span><strong>Rating ${entry.metrics.annualRating.toFixed(2)}<small>${entry.metrics.t1MajorMaps} 高级地图</small></strong></div>`).join('');
  const top20Markup = report.top20Published ? `<div class="top20-summary"><strong>${playerRank ? `你的年度排名 #${playerRank}` : '本年度未进入 TOP20'}</strong><span>${playerRank ? '这一年已经写进你的生涯档案。更高排名仍等待下一赛季。' : '你没有入选，但这一年的榜单与荣誉仍然值得查看。'}</span></div><div class="top20-podium">${top20.slice(0, 3).map((entry) => `<article><b>#${entry.rank}</b><strong>${escapeHtml(entry.identity.nickname)}</strong><span>${escapeHtml(entry.identity.teamName)} · ${entry.metrics.annualRating.toFixed(2)}</span></article>`).join('')}</div><button class="continue-schedule" id="openTop20Btn">查看完整年度 TOP20</button>` : '';
  const growthMarkup = report.progression?.appliedDeltas?.length
    ? `<section class="report-growth"><h3>能力变化 · ${report.progression.previousAge} → ${report.progression.currentAge} 岁</h3><div class="effect-chips">${report.progression.appliedDeltas.map((delta) => `<span class="${delta.delta < 0 ? 'is-negative' : ''}">${escapeHtml(attributeLabels[{ AIM: 'aim', GAME_SENSE: 'gameSense', LEADERSHIP: 'leadership', CLUTCH: 'clutch', CONSISTENCY: 'consistency', TEAM_CONFLICT: 'teamConflict' }[delta.attribute]] || delta.attribute)} ${delta.delta >= 0 ? '+' : ''}${delta.delta}</span>`).join('')}</div></section>`
    : '';
  const contractWarningMarkup = report.contractExpiryWarning
    ? `<p class="event-result failure">合同将在 ${escapeHtml(report.contractExpiryWarning.endsAt.slice(0, 10))} 到期。进入下一年度前请在转会市场处理续约或新报价；若没有新合同，你将成为自由球员。</p>`
    : '';
  $('#eventContent').innerHTML = `<div class="event-card report-card"><p class="eyebrow">${report.top20Published ? 'YEAR-END TOP20' : 'HALF SEASON REPORT'}</p><h2>${report.top20Published ? `${report.season} · 年度名单公示` : `${report.season} · 上半年`}</h2><p class="event-copy">${report.top20Published ? '年度 TOP20 名单已经公布。' : '上半赛季已经结束，新的机会将在下半年出现。'}</p>${contractWarningMarkup}${growthMarkup}${top20Markup}<div class="result-grid"><div><span>奖金</span><b>${formatUsd(report.totalPrizeMoney)}</b></div><div><span>工资收入</span><b>${formatUsd(report.salaryIncome ?? Math.max(0, -(report.salaryExpense ?? 0)))}</b></div><div><span>地图</span><b>${report.mapsPlayed}</b></div><div><span>击杀</span><b>${formatCompactNumber(report.kills)}</b></div></div><button class="continue-schedule" id="continueYearBtn">${report.top20Published ? '开始下一年度' : '进入下半年'}</button></div>`;
  if (report.top20Published) {
    $('#top20DialogTitle').textContent = `${report.season} · 年度 TOP20`;
    $('#top20DialogContent').innerHTML = `<div class="top20-list">${fullTop20Markup || '<p class="event-empty">本年度榜单没有足够候选。</p>'}</div>`;
    $('#openTop20Btn')?.addEventListener('click', () => top20Dialog.showModal());
  }
  $('#continueYearBtn').addEventListener('click', async () => {
    await renderTransferMarket();
  });
}
document.querySelectorAll('[data-tournament-presentation]').forEach((button) => button.addEventListener('click', () => setTournamentPresentationMode(button.dataset.tournamentPresentation)));
updateTournamentPresentationControls();
document.querySelectorAll('.season-tab').forEach((button) => button.remove());
$('#helpBtn').addEventListener('click', () => helpDialog.showModal());
$('#closeHelp').addEventListener('click', () => helpDialog.close());
$('#continueBtn').addEventListener('click', () => $('#career').scrollIntoView({ behavior: 'smooth' }));
$('#playBtn').addEventListener('click', () => startSimulation());
$('#dialogPlay').addEventListener('click', () => startSimulation());
$('#closeExistingSave').addEventListener('click', () => { pendingStartConfig = null; existingSaveDialog.close(); });
$('#continueExistingBtn').addEventListener('click', () => { const config = pendingStartConfig; pendingStartConfig = null; existingSaveDialog.close(); if (config) startSimulation({ config, loadOnly: true }); });
$('#restartExistingBtn').addEventListener('click', () => { const config = pendingStartConfig; pendingStartConfig = null; existingSaveDialog.close(); if (config) startSimulation({ config, forceCreate: true }); });
$('#restartSetupBtn').addEventListener('click', () => openRestartDialog(callsign.value, currentSetupConfig()));
$('#restartCareerBtn').addEventListener('click', async () => {
  const profile = await window.COPEEngine.getProfile();
  const roles = { ENTRY_FRAGGER: 'ENTRY', AWPER: 'AWP', IGL: 'IGL', SUPPORT: 'SUPPORT', LURKER: 'LURK' };
  const savedSeed = typeof window.COPEEngine.getRandomSeed === 'function' ? window.COPEEngine.getRandomSeed() : profile.id;
  await openRestartDialog(profile.id, { gameId: profile.id, realName: profile.id, randomSeed: savedSeed, role: roles[profile.role], region: profile.originRegion, mode: profile.difficultyMode });
});
$('#closeRestart').addEventListener('click', () => restartDialog.close());
$('#cancelRestart').addEventListener('click', () => restartDialog.close());
$('#confirmRestart').addEventListener('click', () => {
  $('#confirmRestart').disabled = true;
  restartCareer().catch(async (error) => {
    const copy = (await loadSaveContent()).restart;
    const message = copy.failure.replace('{message}', error instanceof Error ? error.message : String(error));
    if ($('#dashboard-page').hidden) renderStartupError(message); else {
      $('#eventContent').innerHTML = `<p class="event-result failure">${escapeHtml(message)}</p>`;
    }
  }).finally(() => { $('#confirmRestart').disabled = false; });
});
$('#closeTop20').addEventListener('click', () => top20Dialog.close());
$('#retireBtn').addEventListener('click', () => retireDialog.showModal());
$('#closeRetire').addEventListener('click', () => retireDialog.close());
$('#cancelRetire').addEventListener('click', () => retireDialog.close());
$('#confirmRetire').addEventListener('click', () => {
  $('#confirmRetire').disabled = true;
  retireCareer().then(() => retireDialog.close()).catch((error) => renderNoEvent(error.message)).finally(() => { $('#confirmRetire').disabled = false; });
});
