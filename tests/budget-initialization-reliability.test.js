import test from 'node:test';
import assert from 'node:assert/strict';
import * as migration from '../src/previous-results-budget-migration.js';

const options = { categories: [{ id: 'reading' }], entries: [{ categoryId: 'reading', date: '2026-09-29', durationMinutes: 61 }], today: '2026-10-06', weekStart: '2026-10-05' };
test('one initializer preserves explicit zero and legacy manually entered budgets', () => {
  assert.equal(typeof migration.buildPreviousResultSnapshots, 'function');
  for (const week of [
    { weekStart: options.weekStart, budgets: { reading: 0 }, explicitBudgetIds: ['reading'] },
    { weekStart: options.weekStart, budgets: { reading: 240 }, userModified: true },
    { weekStart: options.weekStart, budgets: { reading: 120 } },
  ]) {
    const plan = migration.buildPreviousResultSnapshots({ ...options, weeklyBudgets: [week], dailyBudgets: [{ date: options.today, overrides: { reading: 0 } }] });
    assert.equal(plan.weekly, null);
    assert.equal(plan.daily, null);
  }
});
test('missing budgets derive from previous actuals without any remote IO', () => {
  assert.equal(typeof migration.buildPreviousResultSnapshots, 'function');
  const plan = migration.buildPreviousResultSnapshots(options);
  assert.equal(plan.weekly.budgets.reading, 90);
  assert.equal(plan.daily.overrides.reading, 61);
});
