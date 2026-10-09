import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ hasTouch: true });

const original = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const fixture = original.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace('</body>', `<script type="module">
  import { switchView } from '/src/app-shell.js';
  import { createStatisticsFeature } from '/src/statistics-feature.js';
  document.querySelector('#login-view').classList.add('hidden');
  document.querySelector('#app-view').classList.remove('hidden');
  document.querySelector('#life-goals').innerHTML = '<div class="card"><h2>목표 설정 자료</h2></div>';
  document.querySelector('#budget-view').innerHTML = '<div class="card"><h2>시간 예산 자료</h2></div>';
  document.querySelector('#life-statistics').innerHTML = '<div class="card"><h2>목표 누적 자료</h2></div>';
  let user = { uid: 'first' };
  let loadMode = 'success';
  let rejectLoad;
  const snapshot = { data: { entries: [], activeCategories: [], archivedCategories: [], weeklyBudgets: [] }, dataVersion: 'fixture', source: 'server' };
  const feature = createStatisticsFeature({
    root: document.querySelector('#statistics-view'),
    dataSource: { load: async () => {
      if (loadMode === 'pending') return new Promise((_, reject) => { rejectLoad = reject; });
      if (loadMode === 'fail') throw new Error('time data unavailable');
      return snapshot;
    } },
    getCurrentUser: () => user,
    saveUiState: async (partial) => localStorage.setItem('navigation-statistics-ui', JSON.stringify(partial)),
    now: () => new Date('2026-10-09T12:00:00'),
  });
  document.addEventListener('weekly-time-budget:view-changed', (event) => {
    if (event.detail.view === 'statistics') feature.enter(); else feature.leave();
  });
  const restored = JSON.parse(localStorage.getItem('navigation-statistics-ui') || '{}');
  feature.restore(restored.statistics);
  document.dispatchEvent(new CustomEvent('weekly-time-budget:ui-state-restored', { detail: restored }));
  switchView(restored.activeView || 'dashboard', { force: true });
  window.__navigationStatistics = {
    feature,
    setLoadMode: (mode) => { loadMode = mode; },
    rejectLoad: () => rejectLoad?.(new Error('time data unavailable')),
    switchUser: async (uid) => { user = { uid }; await feature.enter(); },
  };
</script></body>`);

async function open(page, width = 1200) {
  await page.setViewportSize({ width, height: 844 });
  await page.route('**/navigation-statistics-test', (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('/navigation-statistics-test');
  await page.waitForFunction(() => window.__navigationStatistics);
}

async function nav(page, view) {
  if (await page.locator('#mobile-menu').isVisible()) await page.locator('#mobile-menu').click();
  await page.locator(`nav [data-view="${view}"]`).click();
}

test('six menus separate budgets and goals, sixth tab exclusively displays goal statistics and restores', async ({ page }) => {
  await open(page);
  await expect(page.locator('nav .nav-button')).toHaveText(['대시보드', '시간기록', '시간예산', '목표설정', '통계', '앱 설정']);
  await nav(page, 'budget');
  await expect(page.locator('#budget-view')).toBeVisible();
  await expect(page.locator('#life-goals')).toBeHidden();
  await nav(page, 'goals');
  await expect(page.locator('#life-goals')).toBeVisible();
  await expect(page.locator('#budget-view')).toBeHidden();
  await nav(page, 'statistics');
  for (const mode of ['weekly', 'monthly', 'yearly', 'monthly-comparison', 'yearly-comparison']) {
    await page.locator(`button[data-statistics-mode="${mode}"]`).click();
    await expect(page.locator('#life-statistics')).toBeHidden();
    expect(await page.locator('#life-statistics').evaluate((element) => element.hidden)).toBe(true);
  }
  await page.getByRole('button', { name: '목표통계', exact: true }).click();
  await expect(page.locator('#life-statistics')).toBeVisible();
  await expect(page.locator('#statistics-view .statistics-controls, #statistics-view table, #statistics-view .statistics-summary')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#life-statistics')).toBeVisible();
  await nav(page, 'dashboard');
  await expect(page.locator('#life-statistics')).toBeHidden();
  await nav(page, 'statistics');
  await expect(page.locator('#life-statistics')).toBeVisible();
  await page.evaluate(() => { __navigationStatistics.feature.leave(); });
  expect(await page.locator('#life-statistics').evaluate((element) => element.hidden)).toBe(true);
});

test('goals remains accessible during pending and failed time loads, including account changes', async ({ page }) => {
  await open(page);
  await page.evaluate(() => __navigationStatistics.setLoadMode('pending'));
  await nav(page, 'statistics');
  await page.getByRole('button', { name: '목표통계', exact: true }).click();
  await expect(page.locator('#life-statistics')).toBeVisible();
  await page.evaluate(() => __navigationStatistics.rejectLoad());
  await expect(page.locator('#statistics-view [data-statistics-feature]')).toHaveAttribute('data-statistics-mode', 'goals');
  await page.evaluate(() => { __navigationStatistics.setLoadMode('fail'); return __navigationStatistics.switchUser('second'); });
  await expect(page.locator('#life-statistics')).toBeVisible();
  await page.getByRole('button', { name: '주별 통계', exact: true }).click();
  await expect(page.locator('#life-statistics')).toBeHidden();
  await page.getByRole('button', { name: '목표통계', exact: true }).click();
  await expect(page.locator('#life-statistics')).toBeVisible();
});

test('mobile sidebar preserves internal clicks and closes with outside tap, Escape and navigation', async ({ page }) => {
  await open(page, 390);
  const menu = page.locator('#mobile-menu');
  const sidebar = page.locator('.sidebar');
  await menu.tap();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await menu.tap();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.tap();
  await sidebar.locator('h2').tap();
  await expect(sidebar).toHaveClass(/open/);
  await page.touchscreen.tap(375, 160);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toHaveClass(/open/);
  await nav(page, 'goals');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#life-goals')).toBeVisible();
});
