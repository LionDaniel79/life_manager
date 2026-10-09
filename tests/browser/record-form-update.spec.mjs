import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Seoul' });

async function openRecord(page, manualInputMode = 'time-range', width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/record-form-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/src/mobile-compact.css"></head><body><main class="main-content"><section id="record-view"></section></main><script type="module">
      import '/src/record-feature.js';
      window.recordHarness = { saved: [], ui: [], alerts: [] };
      window.alert = message => recordHarness.alerts.push(message);
      document.dispatchEvent(new CustomEvent('weekly-time-budget:record-state', { detail: {
        categories: [{ id: 'reading', name: '독서', goalType: 'growth' }],
        activeRecordTab: 'manual', manualInputMode: '${manualInputMode}', manualCategoryId: 'reading',
        onUiChange: patch => recordHarness.ui.push(patch),
        onSaveEntry: async (entry, options) => { recordHarness.saved.push(entry); options.onLocalSaved(); return { status: 'pending' }; },
      } }));
    </script></body></html>`,
  }));
  await page.goto('/record-form-test');
  await expect(page.locator('#manual-form')).toBeVisible();
}

test('restored time-range preference records minutes through the duration form', async ({ page }) => {
  await openRecord(page);
  await expect(page.locator('#manual-duration')).toBeVisible();
  await expect(page.locator('#manual-start, #manual-end, [data-manual-mode]')).toHaveCount(0);
  await expect(page.locator('#record-view')).not.toContainText('분 직접 입력');
  await page.locator('#manual-date').fill('2026-10-08');
  await page.locator('#manual-duration').fill('45');
  await page.locator('#manual-note').fill('  집중 기록  ');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect.poll(() => page.evaluate(() => recordHarness.saved)).toEqual([
    { categoryId: 'reading', date: '2026-10-08', durationMinutes: 45, note: '집중 기록', source: 'manual-duration' },
  ]);
  expect(await page.evaluate(() => recordHarness.ui.at(-1))).toEqual({
    activeRecordTab: 'manual', manualInputMode: 'duration', manualCategoryId: 'reading',
  });
  await expect(page.locator('#manual-duration')).toHaveValue('');
});

test('manual form rejects zero and keeps optional notes empty on a valid save', async ({ page }) => {
  await openRecord(page, 'duration');
  await page.locator('#manual-duration').fill('0');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  expect(await page.evaluate(() => recordHarness.saved)).toEqual([]);
  expect(await page.evaluate(() => recordHarness.alerts.length)).toBe(1);
  await page.locator('#manual-duration').fill('1');
  await page.getByRole('button', { name: '기록 저장', exact: true }).click();
  await expect.poll(() => page.evaluate(() => recordHarness.saved.length)).toBe(1);
  expect(await page.evaluate(() => recordHarness.saved[0].note)).toBe('');
});

for (const width of [320, 390, 1200]) {
  test(`manual category, date and minutes share control dimensions at ${width}px`, async ({ page }) => {
    await openRecord(page, 'duration', width);
    const controls = await page.locator('#manual-category, #manual-date, #manual-duration, #manual-note').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x: box.x, width: box.width, height: box.height, border: style.border, radius: style.borderRadius, fontSize: style.fontSize };
    }));
    const first = controls[0];
    for (const control of controls) {
      expect(control.x).toBeCloseTo(first.x, 1);
      expect(control.width).toBeCloseTo(first.width, 1);
      expect(control.border).toBe(first.border);
      expect(control.radius).toBe(first.radius);
      expect(parseFloat(control.fontSize)).toBeGreaterThanOrEqual(16);
    }
    for (const control of controls.slice(0, 3)) expect(control.height).toBe(44);
    expect(controls[3].height).toBeGreaterThanOrEqual(84);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
