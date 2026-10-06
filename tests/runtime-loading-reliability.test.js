import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataSource } from '../src/app-data-source.js';
import { createStatisticsDataSource } from '../src/statistics-data-source.js';
import { createOfflineEntryRepository } from '../src/offline-entry-repository.js';
import { createMemoryOfflineStore } from './helpers/fake-offline-store.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise(() => {});
const docs = (values = []) => ({ docs: values.map((value) => ({ id: value.id, data: () => value })) });

function firebaseFixture(getDocs = async () => docs()) {
  return { collection: (_db, ...path) => path.join('/'), query: (value) => value, orderBy: () => {}, getDocs };
}

test('shared user-scoped budget reads coalesce concurrent callers', async () => {
  let reads = 0;
  const source = createAppDataSource({ db: {}, firebase: firebaseFixture(async () => { reads++; await delay(10); return docs(); }) });
  await Promise.all(Array.from({ length: 8 }, () => source.loadTimeBudgetData('u1')));
  assert.equal(reads, 2);
  await source.loadTimeBudgetData('u2');
  assert.equal(reads, 4);
});

test('a stalled budget read releases callers and permits retry', async () => {
  const firebase = firebaseFixture(never);
  const source = createAppDataSource({ db: {}, firebase, readTimeoutMs: 15 });
  const result = await Promise.race([source.loadTimeBudgetData('u1').then(() => 'resolved', (e) => e.code), delay(80).then(() => 'stuck')]);
  assert.equal(result, 'deadline-exceeded');
  firebase.getDocs = async () => docs();
  assert.deepEqual(await source.loadTimeBudgetData('u1'), { weeklyBudgets: [], dailyBudgets: [] });
});

test('statistics still loads the server if IndexedDB cache fails', async () => {
  const runtime = { store: { getSnapshot: async () => { throw Error('cache unavailable'); }, patchSnapshot: async () => {} }, mergedEntries: async (entries) => entries };
  const source = createStatisticsDataSource({ firestore: firebaseFixture(), db: {}, runtimeForUser: () => runtime, timeoutMs: 20 });
  assert.equal((await source.load('u1')).source, 'server');
});

test('local-first record returns queued on stalled remote without losing the record', async () => {
  const store = await createMemoryOfflineStore();
  const repository = createOfflineEntryRepository({ store, remote: { save: never }, syncTimeoutMs: 15 });
  const result = await Promise.race([
    repository.saveEntryLocalFirst({ userId: 'u1', localId: 'stable-id', entry: { categoryId: 'reading', date: '2026-10-06', durationMinutes: 60 } }),
    delay(80).then(() => ({ status: 'stuck' })),
  ]);
  assert.equal(result.status, 'queued');
  assert.equal(await store.countPending('u1'), 1);
});

test('budget shows cached values while its server request is still pending', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['#budget-view', '#dashboard-view', '#page-title', '#week-label', '#empty-template']) {
    nodes.set(id, { innerHTML: '', textContent: '', querySelectorAll: () => [], querySelector: () => null, addEventListener() {} });
  }
  globalThis.document = {
    querySelector: (key) => nodes.get(key) || null,
    addEventListener: (name, fn) => { const values = listeners.get(name) || []; values.push(fn); listeners.set(name, values); },
    dispatchEvent: () => true,
  };
  globalThis.window = { addEventListener() {} };
  try {
    await import(`../src/time-budget-feature.js?case=${Date.now()}`);
    await listeners.get('weekly-time-budget:view-changed')[0]({ detail: { view: 'budget' } });
    const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let resolveServer;
    const server = new Promise((resolve) => { resolveServer = resolve; });
    const request = listeners.get('weekly-time-budget:infrastructure-state')[0]({ detail: {
      user: { uid: 'u1' }, categories: [{ id: 'reading', name: '독서' }], entries: [],
      dataSource: { loadTimeBudgetData: () => server },
      offlineRuntime: { store: { patchSnapshot: async () => {}, getSnapshot: async () => ({ weeklyBudgets: [], dailyBudgets: [{ date: today, overrides: { reading: 120 } }] }) } },
    } });
    request.catch(() => {});
    await delay(20);
    assert.match(nodes.get('#budget-view').innerHTML, /value="2"/);
    resolveServer({ weeklyBudgets: [], dailyBudgets: [] });
    await request;
  } finally { globalThis.document = previousDocument; globalThis.window = previousWindow; }
});

test('hidden statistics invalidate without fetching until the next visit', async () => {
  const { createStatisticsFeature } = await import('../src/statistics-feature.js');
  let reads = 0;
  const root = { innerHTML: '', addEventListener() {}, removeEventListener() {} };
  const feature = createStatisticsFeature({
    root, getCurrentUser: () => ({ uid: 'u1' }),
    dataSource: { load: async () => ({ data: { entries: [], activeCategories: [], archivedCategories: [], weeklyBudgets: [] }, dataVersion: String(++reads), source: 'server' }) },
    now: () => new Date('2026-10-06T12:00:00'),
  });
  await feature.enter(); feature.leave();
  await feature.refresh();
  assert.equal(reads, 1);
  await feature.enter();
  assert.equal(reads, 2);
  feature.destroy();
});
