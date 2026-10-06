import { test, expect } from '@playwright/test';

async function open(page, mode = 'hang') {
  page.on('dialog', (dialog) => dialog.dismiss());
  await page.clock.install();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/tests/browser/fixtures/runtime-loading.html?mode=${mode}`);
  await page.waitForFunction(() => globalThis.__loadingHarness?.ready);
}
const input = (page) => page.locator('#daily-budget-form input[name="reading"]');

test('cached budget renders immediately and a stalled read exposes retry instead of freezing', async ({ page }) => {
  await open(page);
  await expect(input(page)).toHaveValue('2');
  await page.clock.fastForward(9000);
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await expect(input(page)).toHaveValue('2');
  await page.evaluate(() => { __loadingHarness.serverMode = 'ok'; });
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toHaveCount(0);
  await expect(input(page)).toHaveValue('2');
});

test('repeated infrastructure and view events share one read and preserve unsaved values', async ({ page }) => {
  await open(page);
  await expect(input(page)).toHaveValue('2');
  await input(page).fill('1.75');
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) __loadingHarness.emitUser('u1');
    __loadingHarness.noise();
    __loadingHarness.resolveReads();
  });
  await expect(input(page)).toHaveValue('1.75');
  await page.evaluate(() => { for (let i = 0; i < 8; i++) { __loadingHarness.show('dashboard'); __loadingHarness.show('budget'); } });
  await expect(input(page)).toHaveValue('1.75');
  expect(await page.evaluate(() => __loadingHarness.reads)).toBe(1);
  await input(page).fill('');
  await page.evaluate(() => __loadingHarness.noise());
  await expect(input(page)).toHaveValue('');
});

test('empty cache and a stalled server show a recoverable state, not editable zero budgets', async ({ page }) => {
  await open(page, 'empty-cache');
  await expect(page.locator('#daily-budget-form')).toHaveCount(0);
  await page.clock.fastForward(9000);
  await page.getByRole('button', { name: '다시 불러오기' }).waitFor();
  await page.evaluate(() => { __loadingHarness.serverMode = 'ok'; });
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(input(page)).toHaveValue('2');
});

test('an old user response cannot overwrite the new user budget or cache', async ({ page }) => {
  await open(page);
  await expect(input(page)).toHaveValue('2');
  await page.evaluate(() => { __loadingHarness.serverMode = 'ok'; __loadingHarness.emitUser('u2'); });
  await expect(input(page)).toHaveValue('5');
  await page.evaluate(() => __loadingHarness.resolveReads());
  await expect(input(page)).toHaveValue('5');
  expect(await page.evaluate(() => __loadingHarness.patches.every((patch) => patch.userId === 'u2'))).toBe(true);
});

test('cache failure does not prevent server budgets from rendering', async ({ page }) => {
  await open(page, 'cache-error');
  await expect(input(page)).toHaveValue('2');
});

test('automatic default writes never hold up the budget form', async ({ page }) => {
  await open(page, 'init-hang');
  await expect(input(page)).toBeVisible();
  expect(await page.evaluate(() => __loadingHarness.initWrites)).toBe(2);
  await page.evaluate(() => __loadingHarness.emitUser('u1'));
  expect(await page.evaluate(() => __loadingHarness.initWrites)).toBe(2);
});

test('save deadline keeps inputs, avoids duplicate writes and accepts later confirmation', async ({ page }) => {
  await open(page, 'ok');
  await expect(input(page)).toHaveValue('2');
  await input(page).fill('1.75');
  await page.locator('#daily-budget-form button[type="submit"]').click();
  await page.waitForFunction(() => __loadingHarness.writes === 1);
  await page.clock.fastForward(9000);
  await expect(page.locator('#daily-budget-form button[type="submit"]')).toBeEnabled();
  await expect(input(page)).toHaveValue('1.75');
  await page.locator('#daily-budget-form button[type="submit"]').click();
  expect(await page.evaluate(() => __loadingHarness.writes)).toBe(1);
  await input(page).fill('3');
  await page.evaluate(() => __loadingHarness.saves[0].resolve());
  await expect(input(page)).toHaveValue('3');
  expect(await page.evaluate(() => __loadingHarness.remote.u1.dailyBudgets[0].overrides.reading)).toBe(105);
});

test('a late pre-save read cannot replace a confirmed budget with defaults', async ({ page }) => {
  await open(page);
  await expect(input(page)).toHaveValue('2');
  await input(page).fill('1.75');
  await page.locator('#daily-budget-form button[type="submit"]').click();
  await page.waitForFunction(() => __loadingHarness.writes === 1);
  await page.evaluate(() => __loadingHarness.saves[0].resolve());
  await page.evaluate(() => {
    const old = __loadingHarness.requests.shift();
    old.resolve({ weeklyBudgets: structuredClone(__loadingHarness.remote.u1.weeklyBudgets), dailyBudgets: [] });
  });
  await page.waitForFunction(() => __loadingHarness.reads === 2);
  expect(await page.evaluate(() => __loadingHarness.initWrites)).toBe(0);
  await expect(input(page)).toHaveValue('1.75');
  await page.evaluate(() => __loadingHarness.resolveReads());
  await expect(input(page)).toHaveValue('1.75');
});
