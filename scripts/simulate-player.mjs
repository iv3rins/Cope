/**
 * 模拟玩家游玩脚本（只读游玩，不修改代码）
 * 适配新版 UI：事件 → 结果卡「继续」→ 自动赛事模拟循环 → 半年报告为自然终点
 * 用法：node scripts/simulate-player.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const MAX_STEPS = 400;
const SETTLE_MS = 20_000;
const PLAYER = { gameId: 'ProbeS1mple', role: 'IGL', region: '欧洲', mode: '爽文模式' };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`); });

async function fingerprint() {
  const optsTotal = await page.locator('.event-option').count();
  const opt = await page.locator('.event-option:not([disabled])').count();
  return JSON.stringify({
    playing: optsTotal > 0 && opt === 0,
    opt,
    card: await page.locator('.tournament-card').isVisible().catch(() => false),
    adv: await page.locator('#advanceScheduleBtn').isVisible().catch(() => false),
    sim: await page.locator('#simulateMatchBtn').isVisible().catch(() => false),
    cont: await page.locator('#continueScheduleBtn').isVisible().catch(() => false),
    contBtn: await page.locator('#continueEventBtn').isVisible().catch(() => false),
    report: await page.locator('#eventContent .report-card').isVisible().catch(() => false),
  });
}

async function waitSettle(timeoutMs = SETTLE_MS) {
  let last = null, stable = 0;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fp = await fingerprint();
    const state = JSON.parse(fp);
    const settled = !state.playing && fp === last;
    if (settled) {
      stable += 1;
      if (stable >= 3) return state;
    } else {
      if (!state.playing) stable = 0;
      last = fp;
    }
    await page.waitForTimeout(150);
  }
  return JSON.parse(last ?? '{}');
}

const log = [];
let decisions = 0, tournaments = 0, advances = 0, reports = 0;
let lastReport = null;

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.getByLabel('游戏 ID').fill(PLAYER.gameId);
  await page.getByLabel('主力位置').selectOption(PLAYER.role);
  await page.locator(`.region[data-region="${PLAYER.region}"]`).click();
  await page.getByRole('button', { name: new RegExp(PLAYER.mode) }).click();
  await page.getByRole('button', { name: /开始生涯/ }).click();
  await page.locator('#dashboard-page').waitFor({ state: 'visible', timeout: 15_000 });
  log.push('建档完成: 开始生涯');
  await page.screenshot({ path: 'test-results/sim-01-start.png' });

  let state = await waitSettle();
  for (let step = 1; step <= MAX_STEPS; step++) {
    if (state.report) {
      lastReport = (await page.locator('#eventContent').innerText()).replace(/\n+/g, ' | ').slice(0, 220);
      reports++;
      log.push(`step ${step}: ★ 半年报告 -> ${lastReport}`);
      await page.screenshot({ path: `test-results/sim-99-report-${reports}.png` });
      break;
    }
    if (state.opt > 0) {
      const title = await page.locator('#eventContent h2').innerText().catch(() => '?');
      const count = await page.locator('.event-option:not([disabled])').count();
      const idx = Math.floor(Math.random() * count);
      const label = (await page.locator('.event-option').nth(idx).innerText().catch(() => '?')).replace(/\n/g, ' ');
      await page.locator('.event-option').nth(idx).click();
      decisions++;
      log.push(`step ${step}: 事件「${title}」选择 #${idx}「${label}」`);
      state = await waitSettle();
      continue;
    }
    if (state.contBtn) {
      await page.locator('#continueEventBtn').click();
      log.push(`step ${step}: 结果卡 -> 继续`);
      state = await waitSettle();
      continue;
    }
    if (state.adv) {
      await page.locator('#advanceScheduleBtn').click();
      advances++;
      log.push(`step ${step}: 推进赛季（无事件/赛事）`);
      state = await waitSettle();
      continue;
    }
    // 赛事自动流程：不点击，等待自动循环推进到事件/推进/报告
    if (state.card || state.sim || state.cont) {
      const name = await page.locator('.tournament-card strong').innerText().catch(() => '?');
      tournaments++;
      const deadline = Date.now() + 90_000;
      let next = state;
      while (Date.now() < deadline) {
        next = await waitSettle();
        if (next.opt > 0 || next.contBtn || next.adv || next.report) break;
        if (next.card || next.sim || next.cont) {
          tournaments++;
          continue;
        }
        // 空状态：可能是渲染间隙，多等一轮
        await page.waitForTimeout(800);
      }
      if (!(next.opt > 0 || next.contBtn || next.adv || next.report)) {
        log.push(`step ${step}: 赛事「${name}」自动流程长时间未推进，中断`);
        consoleErrors.push('tournament auto-flow stalled');
        break;
      }
      log.push(`step ${step}: 赛事「${name}」自动模拟完成（${name}）`);
      state = next;
      continue;
    }
    log.push(`step ${step}: 无可操作状态 ${JSON.stringify(state)}，中断`);
    break;
  }

  const stats = {};
  for (const id of ['dashboardOverall', 'dashboardKills', 'dashboardMaps', 'dashboardBalance', 'dashboardAge', 'dashboardTeam', 'dashboardSeason']) {
    stats[id.replace('dashboard', '').toLowerCase()] = await page.locator(`#${id}`).innerText().catch(() => null);
  }
  const life = await page.locator('#profileLife').innerText().catch(() => null);
  await page.screenshot({ path: 'test-results/sim-final-dashboard.png' });
  await browser.close();

  console.log('===== 模拟玩家游玩报告 =====');
  console.log(`玩家: ${PLAYER.gameId} · ${PLAYER.role} · ${PLAYER.region} · ${PLAYER.mode}`);
  console.log(`事件决策: ${decisions} · 赛事模拟: ${tournaments} · 赛季推进: ${advances} · 半年报告: ${reports}`);
  console.log('--- 游玩日志（尾部 30 行） ---');
  for (const line of log.slice(-30)) console.log(line);
  console.log('--- 最终档案 ---');
  console.log(JSON.stringify(stats, null, 2));
  if (life) console.log('生活状态:', life);
  console.log('--- 页面错误 ---');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '无');
  console.log('截图: test-results/sim-01-start.png / sim-final-dashboard.png' + (reports ? ` / sim-99-report-${reports}.png` : ''));
} catch (error) {
  await page.screenshot({ path: 'test-results/sim-error.png' }).catch(() => {});
  await browser.close().catch(() => {});
  console.error('模拟失败:', error.message);
  if (consoleErrors.length) console.error('页面错误:\n' + consoleErrors.join('\n'));
  process.exitCode = 1;
}
