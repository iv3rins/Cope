const $ = (selector) => document.querySelector(selector);

const callsign = $('#callsign');
const lastName = $('#lastName');
const role = $('#role');
const regionButton = $('#regionButton');
const helpDialog = $('#helpDialog');

const roleData = {
  ENTRY: { title: '突破手 / ENTRY', description: '用首杀撕开防线，为队伍建立进攻空间。' },
  AWP: { title: '狙击手 / AWP', description: '以关键架点与首杀打开回合优势。' },
  IGL: { title: '指挥 / IGL', description: '阅读对手，组织信息并做出每一回合的决策。' },
  SUPPORT: { title: '辅助 / SUPPORT', description: '用道具、补枪和协同让战术完整落地。' },
  LURK: { title: '自由人 / LURK', description: '牵制防守、捕捉转点，并终结残局。' }
};
const regionServer = { 中国: '上海 / 35ms', 欧洲: '法兰克福 / 42ms', 北美: '芝加哥 / 55ms', 独联体: '华沙 / 47ms', 南美: '圣保罗 / 68ms', 亚太: '新加坡 / 39ms' };

callsign.addEventListener('input', () => { lastName.value = callsign.value.toUpperCase(); });
lastName.addEventListener('input', () => { callsign.value = lastName.value.toUpperCase(); });
role.addEventListener('change', () => selectRole(role.value));

function selectRole(key) {
  const data = roleData[key];
  document.querySelectorAll('.map-role').forEach((button) => button.classList.toggle('selected', button.dataset.role === key));
  $('#roleTitle').textContent = data.title;
  $('#roleDesc').textContent = data.description;
  role.value = key;
}

document.querySelectorAll('.map-role').forEach((button) => button.addEventListener('click', () => selectRole(button.dataset.role)));
document.querySelectorAll('.region').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.region').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  const region = button.dataset.region;
  regionButton.querySelector('strong').textContent = region;
  regionButton.querySelector('.flag').textContent = button.querySelector('span').textContent;
  $('#serverName').textContent = regionServer[region];
}));
document.querySelectorAll('.pace').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.pace').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
}));
document.querySelectorAll('.weapon').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.weapon').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
}));

$('#helpBtn').addEventListener('click', () => helpDialog.showModal());
$('#closeHelp').addEventListener('click', () => helpDialog.close());
$('#continueBtn').addEventListener('click', () => $('#career').scrollIntoView({ behavior: 'smooth' }));
function startSimulation() {
  $('#playBtn').textContent = '正在初始化...';
  setTimeout(() => { $('#playBtn').innerHTML = '赛季已就绪 <span>→</span>'; }, 650);
  helpDialog.close();
}
$('#playBtn').addEventListener('click', startSimulation);
$('#dialogPlay').addEventListener('click', startSimulation);
