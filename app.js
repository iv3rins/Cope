const $ = (selector) => document.querySelector(selector);

const callsign = $('#callsign');
const lastName = $('#lastName');
const role = $('#role');
const helpDialog = $('#helpDialog');
const regionServer = { 中国: '上海 / 35ms', 欧洲: '法兰克福 / 42ms', 北美: '芝加哥 / 55ms', 独联体: '华沙 / 47ms', 南美: '圣保罗 / 68ms', 亚太: '新加坡 / 39ms' };
const engineRegions = { 中国: 'ASIA', 欧洲: 'EUROPE', 北美: 'AMERICAS', 独联体: 'EUROPE', 南美: 'AMERICAS', 亚太: 'OCEANIA' };
const roleData = {
  ENTRY: { title: '突破手 / ENTRY', description: '用首杀撕开防线，为队伍建立进攻空间。' },
  AWP: { title: '狙击手 / AWP', description: '以关键架点与首杀打开回合优势。' },
  IGL: { title: '指挥 / IGL', description: '阅读对手，组织信息并做出每一回合的决策。' },
  SUPPORT: { title: '辅助 / SUPPORT', description: '用道具、补枪和协同让战术完整落地。' },
  LURK: { title: '自由人 / LURK', description: '牵制防守、捕捉转点，并终结残局。' },
};
const attributeLabels = { aim: '枪法', gameSense: '意识', leadership: '指挥', clutch: '残局', consistency: '稳定性', teamConflict: '团队冲突' };
let selectedCareerMode = 'HARDCORE';
let selectedAcademyTeamId = null;
let calendarData = null;
let activeEventId = null;
let activeSeasonHalf = 'FIRST_HALF';

function selectedRegion() { return document.querySelector('.region.selected')?.dataset.region || '中国'; }
function selectRole(key) {
  const data = roleData[key];
  document.querySelectorAll('.map-role').forEach((button) => button.classList.toggle('selected', button.dataset.role === key));
  $('#roleTitle').textContent = data.title;
  $('#roleDesc').textContent = data.description;
  role.value = key;
}
async function loadAcademyOffers() {
  const response = await fetch('assets/academy/academy-teams.json');
  if (!response.ok) throw new Error('青训队数据加载失败');
  const data = await response.json();
  const region = engineRegions[selectedRegion()];
  const offers = data.teams.filter((team) => team.region === region || team.region === 'AMERICAS');
  const container = $('#academyOptions');
  container.innerHTML = offers.map((team, index) => `<button class="academy-option ${index === 0 ? 'selected' : ''}" data-team-id="${team.teamId}"><strong>${team.name}</strong><small>${team.description}</small><em>${team.tier} · ${team.startingRole} · €${team.monthlySalary}/月</em></button>`).join('');
  selectedAcademyTeamId = offers[0]?.teamId || null;
  container.querySelectorAll('.academy-option').forEach((button) => button.addEventListener('click', () => {
    container.querySelectorAll('.academy-option').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    selectedAcademyTeamId = button.dataset.teamId;
  }));
}
function renderProfile(profile) {
  const values = Object.entries(profile.attributes);
  $('#attributeGrid').innerHTML = values.map(([key, value]) => `<div class="attribute-row"><span>${attributeLabels[key] || key}</span><div class="attribute-bar"><i style="width:${value}%"></i></div><b>${value}</b></div>`).join('');
  $('#profileMode').textContent = profile.difficultyMode;
  $('#profileLife').textContent = `士气 ${profile.morale} · 精力 ${profile.energy} · 压力 ${profile.life.stress}`;
  $('#profileTeam').textContent = profile.currentTeamId || '未签约';
  $('#dashboardOverall').textContent = Math.round(values.reduce((sum, [, value]) => sum + value, 0) / values.length);
  $('#dashboardGameId').textContent = profile.gameId;
  $('#dashboardRegion').textContent = `${profile.originRegion} · ${profile.role}`;
  $('#dashboardRole').textContent = profile.role;
  $('#dashboardTeam').textContent = profile.currentTeamId || '未签约';
  $('#dashboardAge').textContent = profile.age;
  $('#dashboardBalance').textContent = Math.round(profile.life.balance);
  $('#dashboardMaps').textContent = profile.career.mapsPlayed;
  $('#dashboardKills').textContent = profile.career.totalKills;
  $('#sideTeamName').textContent = profile.currentTeamId || '未签约';
  $('#sideTeamStatus').textContent = profile.currentTeamId ? '当前青训队' : '等待青训机会';
  $('#teamRank').textContent = profile.currentTeamId ? 'VRS 资格待定' : '未排名';
}
async function loadCalendar() {
  if (calendarData) return calendarData;
  const response = await fetch('assets/tournaments/season-calendar.json');
  if (!response.ok) throw new Error('赛季赛事日历加载失败');
  calendarData = await response.json();
  return calendarData;
}
function archiveFor(event, profile) { return profile.tournamentArchive.find((record) => record.editionId.includes(`-${event.id}-`) || record.fullName === event.name); }
function qualificationLabel(event, profile) {
  if (!profile.currentTeamId) return { eligible: false, text: '未签约 / 未进' };
  if (event.qualification === 'TOP_16' || event.qualification === 'TOP_24') return { eligible: false, text: '未进 / 排名不足' };
  return { eligible: true, text: event.qualification === 'OPEN' ? '报名' : '地区资格' };
}
async function renderTournamentCalendar(profile) {
  const data = await loadCalendar();
  const events = data.events.filter((event) => event.season === activeSeasonHalf);
  const completed = events.filter((event) => archiveFor(event, profile)).length;
  const event = events[completed];
  if (!event) { $('#tournamentGrid').innerHTML = '<p class="event-empty">本半年的赛程已完成。</p>'; return; }
  const qualification = qualificationLabel(event, profile);
  const archive = archiveFor(event, profile);
  const label = archive ? (archive.champion ? '冠军' : archive.placement) : qualification.text;
  $('#tournamentGrid').innerHTML = `<div class="schedule-progress">第 ${completed + 1} / ${events.length} 场</div><button class="tournament-card ${archive ? 'completed' : ''} ${qualification.eligible ? '' : 'locked'}" data-tournament-id="${event.id}"><strong>${event.name}</strong><span>${label}</span><small>${event.note || event.tier}</small><em>${archive ? '已完成' : qualification.eligible ? '点击进入赛前准备' : '当前战队未满足参赛资格'}</em></button>`;
  $('#tournamentGrid button').addEventListener('click', async () => {
    if (!qualification.eligible) { await window.COPEEngine.advancePeriod('NORMAL', Math.random()); await renderCurrentPeriod(); return; }
    await simulateTournament(event, profile);
  });
}
async function simulateTournament(event, profile) {
  const flow = $('#matchFlow');
  flow.hidden = false;
  $('#preMatchCard').innerHTML = `<p class="eyebrow">赛前 / ${event.tier}</p><h2>${event.name}</h2><p class="event-copy">${event.city || '线上赛'} · ${event.format || 'BO3'} · ${qualificationLabel(event, profile).text}</p><button class="match-action" id="simulateMatchBtn">开始赛事模拟</button>`;
  $('#simulationCard').hidden = true;
  $('#resultCard').hidden = true;
  $('#simulateMatchBtn').addEventListener('click', async () => {
    $('#preMatchCard').hidden = true;
    $('#simulationCard').hidden = false;
    const edition = { id: `ui-${event.id}-${profile.gameId}`, seriesId: event.id, name: event.name, city: event.city || '线上赛', prizePool: event.prizePool || 100000, format: event.format || 'BO3', season: 2026, half: activeSeasonHalf === 'FIRST_HALF' ? 1 : 2, calendarOrder: 1, tier: event.tier, honorClass: event.tier === 'T1' ? 'ELITE' : 'MEDIUM', node: 'MAIN_EVENT', teamId: profile.currentTeamId, qualificationSource: event.qualificationSource || 'OPEN_ENTRY', vrsSnapshotId: null, snapshotRank: 16, rosterLockCareerHalf: 1, targetEditionId: null };
    try {
      const result = await window.COPEEngine.simulateTournament({ edition });
      const updated = await window.COPEEngine.getProfile();
      $('#simulationCard').hidden = true;
      $('#resultCard').hidden = false;
      $('#resultCard').innerHTML = `<h2>${result.eventName}</h2><p class="event-copy">赛事结束 · ${result.placement} · Rating ${result.playerPerformances[0].rating.toFixed(2)}</p><button class="continue-schedule" id="continueScheduleBtn">继续赛程</button>`;
      renderProfile(updated);
      $('#continueScheduleBtn').addEventListener('click', async () => { flow.hidden = true; await renderTournamentCalendar(updated); await renderCurrentPeriod(); });
    } catch (error) { $('#simulationCard').hidden = true; $('#preMatchCard').hidden = false; $('#preMatchCard').insertAdjacentHTML('beforeend', `<p class="event-result failure">${error.message}</p>`); }
  });
}
function renderNoEvent(message) {
  activeEventId = null;
  $('#eventContent').innerHTML = `<p class="event-empty">${message}</p><button class="continue-schedule" id="advanceScheduleBtn">推进赛程 →</button>`;
  $('#advanceScheduleBtn').addEventListener('click', async () => { await window.COPEEngine.advancePeriod('NORMAL', Math.random()); await renderCurrentPeriod(); });
}
async function renderEvent(event, resultText = '') {
  activeEventId = event.id;
  const profile = await window.COPEEngine.getProfile();
  $('#eventPeriod').textContent = event.period;
  $('#eventContent').innerHTML = `<p class="eyebrow">${event.worldlineId.toUpperCase()} / ${event.type}</p><h2>${event.title}</h2><p class="event-copy">${event.description}</p>${resultText}<div class="event-options">${event.options.map((option) => `<button class="event-option" data-option-id="${option.id}"><span>${option.label}</span><small>执行 →</small></button>`).join('')}</div>`;
  document.querySelectorAll('.event-option').forEach((button) => button.addEventListener('click', async () => {
    document.querySelectorAll('.event-option').forEach((item) => { item.disabled = true; });
    const result = await window.COPEEngine.chooseOption({ eventId: activeEventId, optionId: button.dataset.optionId, randomRoll: Math.random() });
    renderProfile(result.profile);
    await renderTournamentCalendar(result.profile);
    await renderCurrentPeriod(result.succeeded ? '<p class="event-result">决策成功，结果已写入引擎存档。</p>' : '<p class="event-result failure">决策受挫，结果已写入引擎存档。</p>');
  }));
}
async function renderCurrentPeriod(resultText = '') {
  for (const period of ['NORMAL', 'OFFSEASON', 'TRANSFER_WINDOW', 'AFTER_TOP20', 'FINAL_DECISIVE_MOMENT']) {
    const events = await window.COPEEngine.getAvailableEvents(period, Math.random());
    if (events[0]) { await renderEvent(events[0], resultText); return; }
  }
  renderNoEvent(resultText || '当前时期没有可用事件。');
}
async function startSimulation() {
  const button = $('#playBtn');
  button.disabled = true;
  try {
    if (!window.COPEEngine) throw new Error('引擎包未加载，请先运行 npm run build:engine。');
    if (!selectedAcademyTeamId) throw new Error('请先选择一支青训队。');
    await window.COPEEngine.createGame({ gameId: callsign.value.trim(), realName: lastName.value.trim() || callsign.value.trim(), role: role.value, region: engineRegions[selectedRegion()], mode: selectedCareerMode, academyTeamId: selectedAcademyTeamId });
    const profile = await window.COPEEngine.getProfile();
    const setup = $('#setup-page');
    setup.hidden = true;
    $('#dashboard-page').hidden = false;
    renderProfile(profile);
    await renderTournamentCalendar(profile);
    await window.COPEEngine.advancePeriod('NORMAL', Math.random());
    await renderCurrentPeriod();
  } catch (error) { renderNoEvent(error.message); } finally { button.disabled = false; helpDialog.close(); }
}
callsign.addEventListener('input', () => { lastName.value = callsign.value.toUpperCase(); });
lastName.addEventListener('input', () => { callsign.value = lastName.value.toUpperCase(); });
role.addEventListener('change', () => selectRole(role.value));
document.querySelectorAll('.map-role').forEach((button) => button.addEventListener('click', () => selectRole(button.dataset.role)));
document.querySelectorAll('.region').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.region').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); $('#regionButton strong').textContent = button.dataset.region; $('#regionButton .flag').textContent = button.querySelector('span').textContent; $('#serverName').textContent = regionServer[button.dataset.region]; loadAcademyOffers().catch(() => {}); }));
document.querySelectorAll('.pace').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.pace').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); selectedCareerMode = button.dataset.mode === 'power' ? 'POWER_FANTASY' : 'HARDCORE'; }));
document.querySelectorAll('.season-tab').forEach((button) => button.addEventListener('click', async () => { document.querySelectorAll('.season-tab').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); activeSeasonHalf = button.dataset.season; await renderTournamentCalendar(await window.COPEEngine.getProfile()); }));
$('#helpBtn').addEventListener('click', () => helpDialog.showModal());
$('#closeHelp').addEventListener('click', () => helpDialog.close());
$('#continueBtn').addEventListener('click', () => $('#career').scrollIntoView({ behavior: 'smooth' }));
$('#playBtn').addEventListener('click', startSimulation);
$('#dialogPlay').addEventListener('click', startSimulation);
loadAcademyOffers().catch((error) => { $('#academyOptions').textContent = error.message; });
