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
let activeEventId = null;
let deterministicState = 2166136261;
let eventFeedback = null;
let activeSeasonHalf = 'FIRST_HALF';
let teamDirectory = null;

function selectedRegion() { return document.querySelector('.region.selected')?.dataset.region || '中国'; }
function nextRoll() { deterministicState = (1664525 * deterministicState + 1013904223) >>> 0; return deterministicState / 0x100000000; }
async function loadEventFeedback() {
  if (eventFeedback) return eventFeedback;
  const response = await fetch('assets/story/event-feedback.json');
  if (!response.ok) throw new Error('事件反馈文案加载失败');
  eventFeedback = await response.json();
  return eventFeedback;
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
  if (exact) return exact;
  const match = Object.entries(tournamentAssets?.series || {}).find(([key]) => seriesId?.startsWith(`${key}-`));
  return match?.[1] || tournamentAssets?.fallback || '';
}
async function renderProfile(profile) {
  const values = Object.entries(profile.attributes);
  $('#attributeGrid').innerHTML = values.map(([key, value]) => `<div class="attribute-row"><span>${attributeLabels[key] || key}</span><div class="attribute-bar"><i style="width:${value}%"></i></div><b>${value}</b></div>`).join('');
  $('#profileMode').textContent = profile.difficultyMode;
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
  $('#dashboardSeason').textContent = `${profile.age} 岁 · ${profile.tournamentArchive.length} 场赛事档案`;
  $('#dashboardGameId').textContent = profile.gameId;
  $('#dashboardRegion').textContent = `${profile.originRegion} · ${profile.role}`;
  $('#dashboardRole').textContent = profile.role;
  $('#dashboardTeam').textContent = teamName;
  $('#dashboardAge').textContent = profile.age;
  $('#dashboardBalance').textContent = Math.round(profile.life.balance);
  $('#dashboardMaps').textContent = profile.career.mapsPlayed;
  $('#dashboardKills').textContent = profile.career.totalKills;
  $('#sideTeamName').textContent = profile.currentTeamId ? teamName : '自由球员';
  $('#sideTeamStatus').textContent = profile.currentTeamId ? '当前合同队伍' : (profile.freeAgencyStatus === 'FREE_AGENT' ? '正在寻找新队伍' : '等待首次签约');
  $('#teamRank').textContent = profile.currentTeamId ? 'VRS 状态待刷新' : '未排名';
  const contractStatus = $('#contractStatus');
  const freeAgencyStatus = $('#freeAgencyStatus');
  const releaseReason = $('#releaseReason');
  if (contractStatus) contractStatus.textContent = profile.currentContractId ? '合同状态：有效合同' : '合同状态：无有效合同';
  if (freeAgencyStatus) freeAgencyStatus.textContent = profile.freeAgencyStatus === 'FREE_AGENT' ? `自由市场：${profile.freeAgencySince ? `自 ${profile.freeAgencySince.slice(0, 10)}` : '进行中'}` : '自由市场：未进入';
  if (releaseReason) {
    releaseReason.hidden = !profile.releaseReason;
    releaseReason.textContent = profile.releaseReason ? `离队原因：${profile.releaseReason}` : '';
  }
  const retireButton = $('#retireBtn');
  if (retireButton) {
    retireButton.disabled = !profile.currentTeamId || profile.isRetired;
    retireButton.title = profile.currentTeamId ? '结束当前职业生涯' : '签约后才能结束职业生涯';
  }
}
async function refreshVrsStatus() {
  const status = await window.COPEEngine.getVrsStatus().catch(() => null);
  const node = $('#teamRank');
  if (!node || !status) return;
  node.textContent = status.rank === null
    ? status.source === null ? 'VRS 未上榜 · 未进入官方排名' : 'VRS 未上榜'
    : `VRS #${status.rank} · ${status.points ?? 0} 分${status.source === 'SIMULATION' ? ' · 模拟' : ''}`;
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
  if (!profile.currentTeamId) {
    $('#scheduleProgress').innerHTML = '<span>赛季进度</span><b>等待队伍签约</b><i aria-hidden="true"><em style="width:0%"></em></i>';
    return null;
  }
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
  await loadTournamentAssets();
  setSingleFlowStage();
  const calendar = profile.currentTeamId ? await window.COPEEngine.startSeason() : [];
  const next = await window.COPEEngine.getNextTournament();
  const completed = next ? Math.max(0, calendar.findIndex((item) => item.id === next.id)) : calendar.length;
  $('#eventPeriod').textContent = 'TOURNAMENT';
  $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card tournament-stage"><p class="eyebrow">当前赛事 · 正式赛事 · ${event.tier}</p><div class="tournament-hero"><div><h2>${event.name}</h2><p class="event-copy">${event.city || '线上赛'} · ${event.format || 'BO3'} · 自动结算赛事表现、奖金与荣誉。</p></div><img class="tournament-mark tournament-trophy" src="${tournamentAssetPath(event.seriesId)}" alt="${event.name}赛事奖杯" onerror="this.hidden=true" /></div><div class="tournament-run" id="singleTournamentRun"><strong>赛事模拟进行中</strong><span>预计自动结算 · 赛事档案将写入职业生涯</span><i><em></em></i></div></article>`;
  let simulationStarted = false;
  const runSimulation = async () => {
    if (simulationStarted) return;
    simulationStarted = true;
    $('#singleTournamentRun')?.classList.add('is-settling');
    try {
      const result = await window.COPEEngine.advanceTournament();
      const updated = await window.COPEEngine.getProfile();
      if (!result) {
        const scheduled = await window.COPEEngine.startSeason();
        const updatedEdition = scheduled.find((candidate) => candidate.id === event.id);
        const inTournamentEvent = await window.COPEEngine.findCareerEvent('SEASON_END');
        if (inTournamentEvent) { await renderEvent(inTournamentEvent); return; }
        if (updatedEdition?.qualificationStatus === 'QUALIFIER_EXIT') {
          $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card outcome-stage qualification-failed"><p class="eyebrow">QUALIFIER OUTCOME / 资格赛结果</p><h2>${event.name}</h2><p class="event-copy">预选未通过，本次未进入 T1 正赛。赛事机会已记录，下一场赛事将继续生成。</p><div class="result-grid"><div><span>赛事级别</span><b>${event.tier}</b></div><div><span>资格状态</span><b>预选淘汰</b></div><div><span>VRS 快照排名</span><b>${event.snapshotRank ?? '未上榜'}</b></div><div><span>状态</span><b>未进入正赛</b></div></div><p class="flow-auto-next">1.5 秒后继续赛季流程</p></article>`;
          window.setTimeout(renderCurrentPeriod, 1500);
          return;
        }
        await renderCurrentPeriod();
        return;
      }
      const rating = result.playerPerformances[0]?.rating ?? 0;
      $('#eventContent').innerHTML = `${flowProgress(completed + 1, calendar.length)}<article class="single-flow-card tournament-stage outcome-stage"><p class="eyebrow">TOURNAMENT OUTCOME / 赛事结果</p><img class="outcome-trophy" src="${tournamentAssetPath(result.seriesId)}" alt="${result.eventName}赛事奖杯" onerror="this.hidden=true" /><h2>${result.eventName}</h2><p class="event-copy">${result.placement} · Rating ${rating.toFixed(2)} · 赛事档案已写入职业生涯。</p><div class="result-grid"><div><span>地图</span><b>${result.playerPerformances[0]?.maps ?? 0}</b></div><div><span>Rating</span><b>${rating.toFixed(2)}</b></div><div><span>赛事级别</span><b>${result.tier}</b></div><div><span>状态</span><b>${result.title ? '冠军' : '完赛'}</b></div></div><p class="flow-auto-next">1.5 秒后继续赛季流程</p></article>`;
      renderProfile(updated);
      const continueSchedule = async () => {
        const postEvent = await window.COPEEngine.findCareerEvent('POST_TOURNAMENT');
        if (postEvent) {
          await renderEvent(postEvent);
          return;
        }
        await renderTournamentCalendar(updated);
        await renderCurrentPeriod();
      };
      window.setTimeout(continueSchedule, 1500);
    } catch (error) { $('#eventContent').insertAdjacentHTML('beforeend', `<p class="event-result failure">${error.message}</p>`); }
  };
  window.setTimeout(runSimulation, 650);
}
async function renderNoEvent(message) {
  activeEventId = null;
  const tournament = await window.COPEEngine.getNextTournament();
  const profile = await window.COPEEngine.getProfile();
  if (tournament && profile.currentTeamId) {
    window.setTimeout(() => simulateTournament(tournament, profile), 450);
    return;
  }
  setSingleFlowStage();
  $('#eventContent').innerHTML = `<article class="single-flow-card event-empty-card"><p class="event-empty">${message}</p><button class="continue-schedule" id="advanceScheduleBtn">继续赛季 →</button></article>`;
  $('#advanceScheduleBtn').addEventListener('click', async () => {
    await window.COPEEngine.advancePeriod('NORMAL', nextRoll());
    const updated = await window.COPEEngine.getProfile();
    renderProfile(updated);
    await renderTournamentCalendar(updated);
    await renderCurrentPeriod();
  });
}
async function renderEvent(event, resultText = '') {
  activeEventId = event.id;
  setSingleFlowStage();
  const profile = await window.COPEEngine.getProfile();
  $('#eventPeriod').textContent = 'DECISION';
  $('#eventContent').innerHTML = `<div class="single-flow-progress"><span>SEASON FLOW</span><i><em style="width:100%"></em></i><b>DECISION</b></div><article class="single-flow-card event-card"><p class="eyebrow">${event.worldlineId.toUpperCase()} / ${event.type}</p><h2>${event.title}</h2><p class="event-copy">${event.description}</p>${resultText}<div class="event-options">${event.options.map((option) => `<button class="event-option" data-option-id="${option.id}"><span>${option.label}</span><small>${Math.round((option.successChance?.baseChance ?? 0.5) * 100)}%</small></button>`).join('')}</div></article>`;
  document.querySelectorAll('.event-option').forEach((button) => button.addEventListener('click', async () => {
    document.querySelectorAll('.event-option').forEach((item) => { item.disabled = true; });
    const result = await window.COPEEngine.chooseOption({ eventId: activeEventId, optionId: button.dataset.optionId, randomRoll: nextRoll() });
    const messages = result.resultMessages?.length ? result.resultMessages : [event.title];
    const effects = result.appliedEffects || [];
    const effectLabels = { AIM: '枪法', GAME_SENSE: '意识', LEADERSHIP: '指挥', CLUTCH: '残局', CONSISTENCY: '稳定性', TEAM_CONFLICT: '团队冲突', MORALE: '士气', ENERGY: '精力', STRESS: '压力', BALANCE: '余额' };
    const changes = effects.map((effect) => {
      if (effect.type === 'ATTRIBUTE_CHANGE') return { label: `${effectLabels[effect.attribute] || effect.attribute} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`, negative: effect.attribute === 'TEAM_CONFLICT' ? effect.delta > 0 : effect.delta < 0 };
      if (effect.type === 'PLAYER_STAT_CHANGE') {
        const negative = effect.stat === 'STRESS' ? effect.delta > 0 : ['ENERGY', 'MORALE', 'BALANCE'].includes(effect.stat) ? effect.delta < 0 : false;
        return { label: `${effectLabels[effect.stat] || effect.stat} ${effect.delta >= 0 ? '+' : ''}${effect.delta}`, negative };
      }
      if (effect.type === 'TEAM_TRANSFER') return { label: `转入 ${effect.teamId}`, negative: false };
      if (effect.type === 'FORCE_CONTRACT_TERMINATION') return { label: '被迫解约', negative: true };
      return null;
    }).filter(Boolean);
    const resultTitle = messages[0] || event.title;
    const resultDetails = messages.length > 1 ? messages.slice(1).join(' ') : '选项结果已写入本次生涯。';
    $('#eventContent').innerHTML = `<article class="single-flow-card event-card event-result-card ${result.succeeded ? 'is-success' : 'is-failure'}"><p class="eyebrow">${result.succeeded ? '成功结果' : '失败结果'}</p><h2>${resultTitle}</h2><div class="event-roll"><strong>${result.succeeded ? '✓' : '!'}</strong><span>${resultDetails}</span></div>${changes.length ? `<div class="effect-chips">${changes.map((change) => `<span class="${change.negative ? 'is-negative' : ''}">${change.label}</span>`).join('')}</div>` : ''}<button class="continue-schedule" id="continueEventBtn">继续</button></article>`;
    renderProfile(result.profile);
    await refreshVrsStatus();
    await renderTournamentCalendar(result.profile);
    setSingleFlowStage();
    $('#continueEventBtn').addEventListener('click', async () => {
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
        if (!current.currentTeamId) {
          await renderCurrentPeriod();
        } else {
          await renderSeasonReport();
        }
      }
    });
  }));
}
async function renderCurrentPeriod(resultText = '') {
  setSingleFlowStage();
  const event = await window.COPEEngine.findCareerEvent('PRE_TOURNAMENT');
  if (event) { await renderEvent(event, resultText); return; }
  const tournament = await window.COPEEngine.getNextTournament();
  if (!tournament) { await renderSeasonReport(); return; }
  renderNoEvent(resultText || '当前时期没有可用事件。');
}
async function startSimulation() {
  const button = $('#playBtn');
  button.disabled = true;
  try {
    if (!window.COPEEngine) throw new Error('引擎包未加载，请先运行 npm run build:engine。');
    deterministicState = [...callsign.value.trim()].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
    await window.COPEEngine.createGame({ gameId: callsign.value.trim(), realName: lastName.value.trim() || callsign.value.trim(), role: role.value, region: engineRegions[selectedRegion()], mode: selectedCareerMode });
    const profile = await window.COPEEngine.getProfile();
    const setup = $('#setup-page');
    const dashboard = $('#dashboard-page');
    setup.classList.remove('active');
    setup.classList.add('leaving');
    setup.hidden = true;
    setup.classList.remove('leaving');
    dashboard.hidden = false;
    dashboard.classList.add('active');
    renderProfile(profile);
    await refreshVrsStatus();
    await renderTournamentCalendar(profile);
    await renderCurrentPeriod();
  } catch (error) { renderNoEvent(error.message); } finally { button.disabled = false; helpDialog.close(); }
}
callsign.addEventListener('input', () => { lastName.value = callsign.value.toUpperCase(); });
lastName.addEventListener('input', () => { callsign.value = lastName.value.toUpperCase(); });
role.addEventListener('change', () => selectRole(role.value));
document.querySelectorAll('.map-role').forEach((button) => button.addEventListener('click', () => selectRole(button.dataset.role)));
document.querySelectorAll('.region').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.region').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); $('#regionButton strong').textContent = button.dataset.region; $('#regionButton .flag').textContent = button.querySelector('span').textContent; $('#serverName').textContent = regionServer[button.dataset.region]; }));
document.querySelectorAll('.pace').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.pace').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); selectedCareerMode = button.dataset.mode === 'power' ? 'POWER_FANTASY' : 'HARDCORE'; }));
async function retireCareer() {
  await loadTournamentAssets();
  const current = await window.COPEEngine.getProfile();
  if (!current.currentTeamId) { renderNoEvent('签约后才能结束职业生涯。'); return; }
  const player = await window.COPEEngine.retire('玩家主动退役');
  const summary = await window.COPEEngine.generateRetirementSummary();
  $('#tournamentGrid').hidden = true;
  $('#matchFlow').hidden = true;
  document.querySelector('#gameSession').classList.add('career-archive-page');
  document.querySelector('.season-header').hidden = true;
  document.querySelector('.season-panel').hidden = true;
  const trophyMarkup = summary.trophyRoom.map((item) => `<div class="archive-item"><img src="${tournamentAssetPath(item.editionId)}" alt="${item.fullName}" onerror="this.hidden=true"><span>${item.fullName}</span></div>`).join('');
  const mvpMarkup = summary.mvpRoom.map((item) => `<div class="archive-item"><img src="assets/mvp/${item.badgeAssetId}.webp" alt="MVP"><span>${item.fullName}</span></div>`).join('');
  const topMarkup = summary.top20History.map((item) => `<div class="archive-item"><img src="assets/top/${item.rank <= 1 ? 'TOP1' : item.rank === 2 ? 'TOP2' : item.rank === 3 ? 'TOP3' : 'TOP4-20'}.svg" alt="TOP20"><span>${item.year} · #${item.rank}</span></div>`).join('');
  $('#eventContent').innerHTML = `<div class="career-archive"><p class="eyebrow">CAREER ARCHIVE</p><h2>${player.gameId} · 生涯总结</h2><p class="event-copy">退役时间：${summary.player.retiredAt}</p><div class="result-grid"><div><span>总地图</span><b>${summary.careerOverview.totalMaps}</b></div><div><span>总击杀</span><b>${summary.careerOverview.totalKills}</b></div><div><span>平均Rating</span><b>${summary.careerOverview.averageRating.toFixed(2)}</b></div><div><span>TOP20</span><b>${summary.top20History.length}</b></div></div><section class="archive-section"><h3>TOP20 勋章</h3><div class="archive-grid">${topMarkup || '<p class="event-empty">暂无 TOP20 记录</p>'}</div></section><section class="archive-section"><h3>MVP 勋章</h3><div class="archive-grid">${mvpMarkup || '<p class="event-empty">暂无 MVP 记录</p>'}</div></section><section class="archive-section"><h3>奖杯陈列</h3><div class="archive-grid">${trophyMarkup || '<p class="event-empty">暂无冠军奖杯</p>'}</div></section></div>`;
  $('#retireBtn').disabled = true;
  $('#retireBtn').textContent = '已退役';
  $('#eventPeriod').textContent = 'CAREER ARCHIVE';
}
async function renderSeasonReport() {
  const report = await window.COPEEngine.finishSeason();
  if (!report) { renderNoEvent('当前赛季尚未完成。'); return; }
  $('#tournamentGrid').hidden = true;
  const top20 = report.top20Ranking?.entries || [];
  const playerRank = report.top20Ranking?.careerPlayerRank;
  const top20Markup = report.top20Published ? `<div class="top20-summary"><strong>${playerRank ? `你的年度排名 #${playerRank}` : '本年度未进入 TOP20'}</strong><span>${playerRank ? '年度数据已达到榜单资格并完成排名。' : '继续参加 T1/Major，提升高级地图和年度表现。'}</span></div><div class="top20-list">${top20.length ? top20.slice(0, 20).map((entry) => {
    const honors = entry.evidence.tournaments.flatMap((event) => event.honors.filter((honor) => honor.type === 'MVP').map((honor) => `MVP · ${honor.eventName}`));
    const titles = entry.evidence.tournaments.filter((event) => event.title).map((event) => `冠军 · ${event.eventName}`);
    const details = entry.rank <= 3 ? `<details class="top20-honors"><summary>查看年度荣誉</summary><div>${[...honors, ...titles].length ? [...honors, ...titles].map((item) => `<span>${item}</span>`).join('') : '<span>暂无记录</span>'}</div></details>` : '';
    return `<div class="top20-entry"><b>#${entry.rank}</b><span>${entry.identity.nickname}<small>${entry.identity.countryCode} · ${entry.identity.teamName}</small>${details}</span><strong>Rating ${entry.metrics.annualRating.toFixed(2)}<small>${entry.metrics.t1MajorMaps} 高级地图</small></strong></div>`;
  }).join('') : '<p class="event-empty">榜单数据暂不可用。</p>'}</div>` : '';
  $('#eventContent').innerHTML = `<div class="event-card report-card"><p class="eyebrow">${report.top20Published ? 'YEAR-END TOP20' : 'HALF SEASON REPORT'}</p><h2>${report.top20Published ? `${report.season} · 年度名单公示` : `${report.season} · 上半年`}</h2><p class="event-copy">${report.top20Published ? '年度赛事档案已封存，TOP20 名单现已公开。' : '本阶段赛事档案已结算，下一阶段赛历即将生成。'}</p>${top20Markup}<div class="result-grid"><div><span>奖金</span><b>${report.totalPrizeMoney}</b></div><div><span>工资</span><b>${report.salaryExpense}</b></div><div><span>地图</span><b>${report.mapsPlayed}</b></div><div><span>击杀</span><b>${report.kills}</b></div></div><button class="continue-schedule" id="continueYearBtn">${report.top20Published ? '开始下一年度' : '进入下半年'}</button></div>`;
  $('#continueYearBtn').addEventListener('click', async () => {
    await window.COPEEngine.advancePeriod('OFFSEASON', nextRoll());
    const profile = await window.COPEEngine.getProfile();
    renderProfile(profile);
    await refreshVrsStatus();
    await renderTournamentCalendar(profile);
    await renderCurrentPeriod();
  });
}
document.querySelectorAll('.season-tab').forEach((button) => button.remove());
$('#helpBtn').addEventListener('click', () => helpDialog.showModal());
$('#closeHelp').addEventListener('click', () => helpDialog.close());
$('#continueBtn').addEventListener('click', () => $('#career').scrollIntoView({ behavior: 'smooth' }));
$('#playBtn').addEventListener('click', startSimulation);
$('#dialogPlay').addEventListener('click', startSimulation);
$('#retireBtn').addEventListener('click', () => retireCareer().catch((error) => renderNoEvent(error.message)));
