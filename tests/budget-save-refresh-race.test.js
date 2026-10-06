import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeekRange, toDateKey } from '../src/domain.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('a read started before a confirmed budget save cannot restore stale values or initialize over them', async () => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const listeners = new Map();
  let submit;
  const button = { disabled: false, isConnected: true, textContent: '저장' };
  const form = {
    addEventListener: (type, listener) => { if (type === 'submit') submit = listener; },
    querySelector: () => button,
    querySelectorAll: () => [{ name: 'reading', value: '1.75' }],
  };
  const node = () => ({ innerHTML: '', textContent: '', querySelectorAll: () => [], querySelector: () => null, addEventListener() {} });
  const nodes = new Map(['#budget-view', '#dashboard-view', '#page-title', '#week-label', '#empty-template'].map((key) => [key, node()]));
  nodes.get('#budget-view').querySelector = (key) => key === '#daily-budget-form' ? form : null;
  nodes.set('#offline-ui-styles', {});
  nodes.set('#app-toast-region', { innerHTML: '', append() {} });
  globalThis.document = {
    querySelector: (key) => nodes.get(key) || null,
    createElement: () => ({ classList: { add() {}, remove() {} }, isConnected: false }),
    addEventListener: (type, listener) => {
      const values = listeners.get(type) || []; values.push(listener); listeners.set(type, values);
    },
    dispatchEvent: (event) => {
      for (const listener of listeners.get(event.type) || []) Promise.resolve(listener(event)).catch(() => {});
      return true;
    },
  };
  globalThis.window = { addEventListener() {} };
  const first = deferred();
  const next = deferred();
  const date = toDateKey(new Date());
  const weekStart = getWeekRange().start;
  const values = (minutes) => ({
    weeklyBudgets: [{ weekStart, budgets: { reading: 840 }, userModified: true }],
    dailyBudgets: [{ date, overrides: { reading: minutes }, userModified: true }],
  });
  let reads = 0;
  let initializationWrites = 0;
  let loading;
  try {
    await import(`../src/time-budget-feature.js?save-refresh=${Date.now()}`);
    await listeners.get('weekly-time-budget:view-changed')[0]({ detail: { view: 'budget' } });
    loading = listeners.get('weekly-time-budget:infrastructure-state')[0]({ detail: {
      user: { uid: 'race-user' }, userDataReady: true,
      categories: [{ id: 'reading', name: '독서' }], entries: [],
      dataSource: {
        invalidate() {},
        loadTimeBudgetData: () => ++reads === 1 ? first.promise : next.promise,
        saveDailyBudget: async () => {},
        ensureCurrentWeekBudget: () => { initializationWrites++; return new Promise(() => {}); },
        saveDailyBudgetSnapshot: () => { initializationWrites++; return new Promise(() => {}); },
      },
      offlineRuntime: { store: { getSnapshot: async () => values(120), patchSnapshot: async () => {} } },
    } });
    await delay(20);
    assert.match(nodes.get('#budget-view').innerHTML, /value="2"/);
    await submit({ preventDefault() {}, currentTarget: form });
    assert.match(nodes.get('#budget-view').innerHTML, /value="1.75"/);
    // The old request returns a document list captured before the user's save.
    first.resolve({ weeklyBudgets: values(120).weeklyBudgets, dailyBudgets: [] });
    await delay(20);
    assert.equal(initializationWrites, 0, 'stale absence must not trigger a default write over a confirmed save');
    assert.match(nodes.get('#budget-view').innerHTML, /value="1.75"/);
  } finally {
    first.resolve(values(105)); next.resolve(values(105));
    await loading?.catch(() => {});
    globalThis.document = previous.document; globalThis.window = previous.window;
  }
});
