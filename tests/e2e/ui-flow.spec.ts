import { expect, test } from '@playwright/test';

test.describe('COPE 建档流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('显示建档所需的关键控件', async ({ page }) => {
    await expect(page.getByLabel('游戏 ID')).toBeVisible();
    await expect(page.getByLabel('主力位置')).toBeVisible();
    await expect(page.getByRole('heading', { name: '起始赛区' })).toBeVisible();
    await expect(page.getByRole('button', { name: '硬核模式' })).toBeVisible();
    await expect(page.getByRole('button', { name: '爽文模式' })).toBeVisible();
    await expect(page.getByRole('button', { name: /开始生涯/ })).toBeVisible();
  });

  test('用户可以填写档案、选择定位赛区和推进速度并启动生涯', async ({ page }) => {
    await page.getByLabel('游戏 ID').fill('PlayLikeS1mple');
    await expect(page.locator('#lastName')).toHaveValue('PLAYLIKES1MPLE');

    await page.getByLabel('主力位置').selectOption('IGL');
    await expect(page.locator('.map-role[data-role="IGL"]')).toHaveClass(/selected/);
    await expect(page.locator('#roleTitle')).toContainText('指挥');

    await page.getByRole('button', { name: /欧洲赛区/ }).click();
    await expect(page.locator('.region[data-region="欧洲"]')).toHaveClass(/selected/);
    await expect(page.locator('#regionButton strong')).toHaveText('欧洲');
    await expect(page.locator('#serverName')).toHaveText('法兰克福 / 42ms');

    await page.getByRole('button', { name: /爽文模式/ }).click();
    await expect(page.getByRole('button', { name: /爽文模式/ })).toHaveClass(/selected/);
    await expect(page.getByRole('button', { name: /硬核模式/ })).not.toHaveClass(/selected/);

    await page.getByRole('button', { name: /开始生涯/ }).click();
    await expect(page.locator('#setup-page')).toBeHidden();
    await expect(page.locator('#dashboard-page')).toBeVisible();
    await expect(page.locator('[data-testid="season-calendar"]')).toBeVisible();
  });

  test('启动后渲染初始属性、首个事件，并可结算一次决策', async ({ page }) => {
    await page.getByLabel('游戏 ID').fill('PlayLikeS1mple');
    await page.getByLabel('主力位置').selectOption('IGL');
    await page.getByRole('button', { name: /开始生涯/ }).click();

    await expect(page.locator('#setup-page')).toBeHidden();
    await expect(page.locator('#dashboard-page')).toBeVisible();
    await expect(page.locator('[data-testid="initial-attributes"]')).toBeVisible();
    await expect(page.locator('[data-testid="initial-attributes"]')).toContainText('意识');
    await expect(page.locator('[data-testid="initial-attributes"]')).toContainText('69');
    await expect(page.locator('[data-testid="season-calendar"]')).toBeVisible();
    await expect(page.locator('.tournament-card')).toHaveCount(1);
    await expect(page.locator('[data-testid="season-calendar"]')).toContainText('第 1 / 3 场');
    await expect(page.locator('.tournament-card')).toContainText('报名');
    await expect(page.locator('[data-testid="season-one-events"]')).toBeVisible();
    await expect(page.locator('[data-testid="season-one-events"]')).toContainText('青训');

    await page.getByRole('button', { name: /展示枪法/ }).click();
    await expect(page.locator('[data-testid="season-one-events"]')).toContainText(/决策成功|决策受挫/);
    await expect(page.locator('[data-testid="season-one-events"]')).toContainText(/青训合约|轮换名单/);
  });
});
