import { withTimeout } from './async-control.js';
import { buildPreviousResultSnapshots } from './previous-results-budget-migration.js';
import { getWeekRange, toDateKey } from './domain.js';
import {
  buildPreviousWeekBudgetDefaults,
  buildWeeklyBudgetSnapshot,
  parseOptionalDailyHours,
  previousSameWeekdayMinutes,
  previousRecordedDate,
  nextRecordedDateOrToday,
  recordedDateKeys,
  summarizeDailyCategories,
  summarizeWeeklyEffectiveCategories,
} from './time-budget-domain.js';
import {
  bindDashboardControls,
  bindTimeBudgetControls,
  createDashboardUiState,
  createTimeBudgetUiState,
  renderDashboardHtml,
  renderTimeBudgetHtml,
} from './time-budget-ui.js';
import { showToast } from './app-toast.js';
import { filterCategoriesActiveOnDate, isArchivedCategoryVisibleInRange, isCategoryActiveInRange } from './category-effective-date.js';
import {
  buildRecordedPeriodIndex,
  previousRecordedPeriod,
  nextRecordedPeriodOrCurrent,
  coerceRecordedPeriodSelection,
} from './recorded-period-domain.js';

const today = () => toDateKey(new Date());
const currentWeekStart = () => getWeekRange().start;
const state = {
  user: null,
  runtime: null,
  dataSource: null,
  categories: [], archived: [], entries: [], remoteEntries: [], weekly: [], daily: [],
  dashboard: createDashboardUiState(today(), currentWeekStart()),
  budget: createTimeBudgetUiState(today()),
  loading: false,
  cacheLoaded: false,
  activeView: 'dashboard',
  ready: false,
  userDataReady: false,
  loadError: '',
  lastLoaded: 0,
  generation: 0,
  drafts: {},
  saving: new Map(),
  initializing: new Map(),
  budgetRevisions: new Map(),
  writeVersion: 0,
};
let loadingPromise = null;
let reloadRequested = false;

const activeCategories = (date = today()) => filterCategoriesActiveOnDate(state.categories, date);

function saveFeatureUiState(partial = {}) {
  document.dispatchEvent(new CustomEvent('weekly-time-budget:save-ui-state', { detail: partial }));
}

function applyRestoredUiState(saved = {}) {
  if (saved.dashboard) Object.assign(state.dashboard, saved.dashboard);
  if (saved.budget) Object.assign(state.budget, saved.budget);
  const now = today();
  const week = currentWeekStart();
  state.dashboard.today = now;
  state.dashboard.currentWeekStart = week;
  state.budget.today = now;
  if (state.dashboard.selectedDate > now) state.dashboard.selectedDate = now;
  if (state.dashboard.selectedWeekStart > week) state.dashboard.selectedWeekStart = week;
}

if (globalThis.window?.__weeklyTimeBudgetUiState) {
  applyRestoredUiState(globalThis.window.__weeklyTimeBudgetUiState);
}

document.addEventListener('weekly-time-budget:ui-state-restored', (event) => {
  applyRestoredUiState(event.detail || {});
  renderActiveView();
});

function allKnownCategories() {
  const map = new Map();
  state.archived.forEach((item) => map.set(item.id, item));
  state.categories.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999));
}

const findWeekDocument = (weekStart) => state.weekly.find((week) => (week.weekStart || week.id) === weekStart) || null;
const weeklyDefaults = (weekStart) => buildPreviousWeekBudgetDefaults({
  categories: activeCategories(weekStart),
  entries: state.entries,
  weekStart,
});

function normalizeWeek(weekStart) {
  const source = findWeekDocument(weekStart);
  const defaults = weekStart === currentWeekStart() ? weeklyDefaults(weekStart) : {};
  const budgets = { ...defaults, ...(source?.budgets || {}) };
  return {
    id: source?.id || weekStart,
    weekStart,
    budgets,
    explicitBudgetIds: Array.isArray(source?.explicitBudgetIds)
      ? [...source.explicitBudgetIds]
      : Object.keys(source?.budgets || {}),
  };
}

const dailyFor = (date) => state.daily.find((item) => (item.date || item.id) === date) || null;
const weekRange = (key) => getWeekRange(new Date(`${key}T12:00:00`));
const weekLabel = (key) => { const range = weekRange(key); return `${range.start} — ${range.end}`; };

function dailyDefaults(date) {
  return Object.fromEntries(activeCategories(date).map((category) => [
    category.id,
    previousSameWeekdayMinutes(state.entries, category.id, date),
  ]));
}

function periodCategories({ start, end, weekDocument, dailyDocument = null }) {
  const activeIds = new Set(state.categories.map((category) => category.id));
  const knownIds = new Set(allKnownCategories().map((category) => category.id));
  const budgetIds = new Set(Object.keys(weekDocument?.budgets || {}).filter((id) => knownIds.has(id)));
  const overrideIds = new Set(Object.keys(dailyDocument?.overrides || {}).filter((id) => knownIds.has(id)));
  const entryIds = new Set(state.entries
    .filter((entry) => entry.date >= start && entry.date <= end && knownIds.has(entry.categoryId))
    .map((entry) => entry.categoryId));
  return allKnownCategories()
    .filter((category) => isCategoryActiveInRange(category, start, end))
    .filter((category) => activeIds.has(category.id) || isArchivedCategoryVisibleInRange(category, start, end))
    .filter((category) => activeIds.has(category.id) || budgetIds.has(category.id) || overrideIds.has(category.id) || entryIds.has(category.id))
    .map((category) => activeIds.has(category.id) ? category : { ...category, defaultBudgetMinutes: 0, budgetMinutes: 0 });
}

function sessionContext() {
  const { user, runtime, dataSource, generation } = state;
  return { user, runtime, dataSource, current: () => state.generation === generation && state.user?.uid === user?.uid };
}

function replaceDocument(items, key, document) {
  const index = items.findIndex((item) => (item[key] || item.id) === document[key]);
  if (index < 0) items.push(document);
  else items[index] = document;
}

function cacheBudgets(context) {
  if (!context.current() || !context.runtime) return;
  const partial = { weeklyBudgets: [...state.weekly], dailyBudgets: [...state.daily], updatedAt: Date.now() };
  withTimeout(() => context.runtime.store.patchSnapshot(context.user.uid, partial), 1500)
    .catch((error) => console.warn('예산 캐시 저장 지연', error));
}

async function ensureCurrentWeekSnapshot() {
  if (!state.userDataReady) return;
  const context = sessionContext();
  const plan = buildPreviousResultSnapshots({
    categories: activeCategories(today()), entries: state.entries, weeklyBudgets: state.weekly,
    dailyBudgets: state.daily, today: today(), weekStart: currentWeekStart(),
  });
  const tasks = [
    ['weekly', plan.weekly, 'weekStart', (snapshot) => context.dataSource.ensureCurrentWeekBudget(context.user.uid, snapshot)],
    ['daily', plan.daily, 'date', (snapshot) => context.dataSource.saveDailyBudgetSnapshot(context.user.uid, snapshot.date, snapshot)],
  ];
  let changed = false;
  for (const [kind, snapshot, key, write] of tasks) {
    if (!snapshot) continue;
    const token = `${kind}:${snapshot[key]}`;
    if (state.initializing.has(token) || state.saving.has(token)) continue;
    // Firestore retains queued writes. Do not resubmit an initializer on timeout.
    const revision = state.budgetRevisions.get(token) || 0;
    const pending = Promise.resolve().then(() => write(snapshot));
    state.initializing.set(token, pending);
    pending.then(() => {
      if (!context.current()) return;
      if (!state.saving.has(token) && (state.budgetRevisions.get(token) || 0) === revision) {
        state.writeVersion += 1;
        replaceDocument(kind === 'weekly' ? state.weekly : state.daily, key, snapshot);
        changed = true;
        cacheBudgets(context);
        renderActiveView();
        if (changed) document.dispatchEvent(new CustomEvent('weekly-time-budget:data-changed', { detail: { userId: context.user.uid, scope: 'budgets' } }));
      }
    }).catch((error) => {
      if (!context.current()) return;
      state.loadError = '기본 예산 저장을 확인하지 못했습니다. 연결 후 다시 불러오세요.';
      renderActiveView();
      console.warn('기본 예산 초기화 지연', error);
    }).finally(() => {
      if (context.current() && state.initializing.get(token) === pending) state.initializing.delete(token);
    });
  }
}

async function applyCachedData(context) {
  if (!context.runtime || state.cacheLoaded || state.ready) return false;
  try {
    const snapshot = await withTimeout(() => context.runtime.store.getSnapshot(context.user.uid), 1500);
    if (!context.current()) return false;
    state.cacheLoaded = true;
    if (!snapshot) return false;
    if (Array.isArray(snapshot.weeklyBudgets)) state.weekly = snapshot.weeklyBudgets;
    if (Array.isArray(snapshot.dailyBudgets)) state.daily = snapshot.dailyBudgets;
    state.ready = Array.isArray(snapshot.weeklyBudgets) || Array.isArray(snapshot.dailyBudgets);
    applyRestoredUiState(globalThis.window?.__weeklyTimeBudgetUiState || {});
    renderActiveView();
    return state.ready;
  } catch (error) {
    console.warn('예산 캐시 읽기 실패, 서버 조회를 계속합니다.', error);
    return false;
  }
}

async function performLoadData(context = sessionContext()) {
  const writeVersion = state.writeVersion;
  state.loading = true;
  state.loadError = '';
  renderActiveView();
  await applyCachedData(context);
  if (!context.current()) return;
  try {
    const result = await withTimeout(() => context.dataSource.loadTimeBudgetData(context.user.uid));
    if (!context.current()) return;
    // A pre-save read must not erase a confirmed value or schedule defaults over it.
    if (state.writeVersion !== writeVersion) {
      context.dataSource.invalidate?.(context.user.uid, 'budgets');
      reloadRequested = true;
      return;
    }
    state.weekly = result.weeklyBudgets;
    state.daily = result.dailyBudgets;
    state.ready = true;
    state.lastLoaded = Date.now();
    cacheBudgets(context);
    // Rendering never waits for an automatic remote write.
    ensureCurrentWeekSnapshot().catch(console.error);
  } catch (error) {
    if (!context.current()) return;
    state.loadError = '서버 응답이 늦거나 연결이 끊겼습니다. 저장된 자료가 있으면 그대로 표시합니다.';
    console.warn('시간 예산 데이터 갱신 지연', error);
  } finally {
    if (context.current()) {
      applyRestoredUiState();
      state.loading = false;
      renderActiveView();
    }
  }
}

async function loadData({ force = false } = {}) {
  if (!state.user || !state.runtime || !state.dataSource) return;
  if (loadingPromise) {
    if (force) reloadRequested = true;
    return loadingPromise;
  }
  if (!force && state.ready && Date.now() - state.lastLoaded < 15000) return;
  const context = sessionContext();
  const promise = (async () => {
    do {
      reloadRequested = false;
      await performLoadData(context);
    } while (reloadRequested && context.current());
  })();
  loadingPromise = promise;
  try { await promise; }
  finally { if (loadingPromise === promise) loadingPromise = null; }
}

function loadingNotice() {
  if (state.saving.size) return '<p class="muted" role="status">서버 저장 확인을 기다리고 있습니다. 입력값은 유지됩니다.</p>';
  if (state.loadError) return '<div class="card budget-load-notice" role="status"><p>서버 연결을 확인하지 못했습니다. 저장된 자료가 있으면 그대로 표시합니다.</p><button type="button" class="secondary-button" data-budget-retry>다시 불러오기</button></div>';
  return state.loading ? '<p class="muted" role="status">저장된 자료를 먼저 표시하고 최신 예산을 확인하고 있습니다.</p>' : '';
}

function bindRetry(root) {
  root.querySelector('[data-budget-retry]')?.addEventListener('click', () => {
    state.dataSource?.invalidate?.(state.user.uid, 'budgets');
    loadData({ force: true }).catch(console.error);
  });
}

function weeklySummary(key) {
  const range = weekRange(key);
  const week = normalizeWeek(key);
  const categories = periodCategories({ start: range.start, end: range.end, weekDocument: week });
  return summarizeWeeklyEffectiveCategories({
    categories,
    entries: state.entries,
    weekStart: key,
    weekDocument: week,
    dailyDocuments: state.daily,
  });
}

function dashboardRecordedWeekModel() {
  const current = state.dashboard.currentWeekStart;
  const periods = buildRecordedPeriodIndex(state.entries, state.dashboard.today);
  const selected = coerceRecordedPeriodSelection({
    selected: state.dashboard.selectedWeekStart,
    current,
    recordedPeriods: periods.weekStarts,
  });
  return {
    selected,
    previousWeekStart: previousRecordedPeriod(periods.weekStarts, selected),
    nextWeekStart: nextRecordedPeriodOrCurrent(periods.weekStarts, selected, current),
  };
}

function renderDashboard() {
  const root = document.querySelector('#dashboard-view');
  if (!root || !state.user) return;
  if (!state.ready) { root.innerHTML = loadingNotice() || '<p role="status">예산 자료를 불러오고 있습니다.</p>'; bindRetry(root); return; }
  const dates = recordedDateKeys(state.entries, state.dashboard.today);
  if (state.dashboard.mode === 'weekly') {
    const recordedWeek = dashboardRecordedWeekModel();
    if (recordedWeek.selected !== state.dashboard.selectedWeekStart) {
      state.dashboard.selectedWeekStart = recordedWeek.selected;
      saveFeatureUiState({ dashboard: { ...state.dashboard } });
    }
    root.innerHTML = `<div data-feature-ui="dashboard">${loadingNotice()}${renderDashboardHtml({
      mode: 'weekly',
      selectedWeekStart: recordedWeek.selected,
      currentWeekStart: state.dashboard.currentWeekStart,
      previousWeekStart: recordedWeek.previousWeekStart,
      nextWeekStart: recordedWeek.nextWeekStart,
      weekRangeLabel: weekLabel(recordedWeek.selected),
      weeklySummary: weeklySummary(recordedWeek.selected),
    })}</div>`;
  } else {
    const date = state.dashboard.selectedDate;
    const weekKey = getWeekRange(new Date(`${date}T12:00:00`)).start;
    const week = normalizeWeek(weekKey);
    const dailyDocument = dailyFor(date);
    root.innerHTML = `<div data-feature-ui="dashboard">${loadingNotice()}${renderDashboardHtml({
      mode: 'daily', selectedDate: date, today: state.dashboard.today,
      previousDate: previousRecordedDate(dates, date),
      calendarYear: state.dashboard.calendarYear,
      calendarMonth: state.dashboard.calendarMonth,
      recordDates: dates,
      dailySummary: summarizeDailyCategories({
        categories: periodCategories({ start: date, end: date, weekDocument: week, dailyDocument }),
        entries: state.entries, date, weekDocument: week, dailyDocument,
      }),
    })}</div>`;
  }
  bindRetry(root);
  bindDashboardControls({
    root,
    state: state.dashboard,
    rerender: () => {
      saveFeatureUiState({ dashboard: { ...state.dashboard } });
      renderDashboard(); updateHeader('dashboard');
    },
    onPreviousDate: () => {
      const value = previousRecordedDate(dates, state.dashboard.selectedDate);
      if (value) selectDate(value);
    },
    onNextDate: () => {
      const value = nextRecordedDateOrToday(dates, state.dashboard.selectedDate, state.dashboard.today);
      if (value) selectDate(value);
    },
    onSelectDate: selectDate,
    onCalendarMove: moveCalendar,
    onWeekMove: (direction) => {
      const recordedWeek = dashboardRecordedWeekModel();
      const next = direction === 'prev'
        ? recordedWeek.previousWeekStart
        : recordedWeek.nextWeekStart;
      if (!next) return;
      state.dashboard.selectedWeekStart = next;
      saveFeatureUiState({ dashboard: { ...state.dashboard } });
      renderDashboard(); updateHeader('dashboard');
    },
  });
}

function selectDate(value) {
  if (!value || value > state.dashboard.today) return;
  state.dashboard.selectedDate = value;
  const date = new Date(`${value}T12:00:00`);
  state.dashboard.calendarYear = date.getFullYear();
  state.dashboard.calendarMonth = date.getMonth() + 1;
  saveFeatureUiState({ dashboard: { ...state.dashboard } });
  renderDashboard(); updateHeader('dashboard');
}

function moveCalendar(direction) {
  let year = state.dashboard.calendarYear;
  let month = state.dashboard.calendarMonth + (direction === 'prev' ? -1 : 1);
  if (month < 1) { year -= 1; month = 12; }
  if (month > 12) { year += 1; month = 1; }
  if (`${year}-${String(month).padStart(2, '0')}` > state.dashboard.today.slice(0, 7)) return;
  state.dashboard.calendarYear = year;
  state.dashboard.calendarMonth = month;
  saveFeatureUiState({ dashboard: { ...state.dashboard } });
  renderDashboard();
}

function renderBudget() {
  const root = document.querySelector('#budget-view');
  if (!root || !state.user) return;
  if (!state.ready) { root.innerHTML = loadingNotice() || '<p role="status">예산 자료를 불러오고 있습니다.</p>'; bindRetry(root); return; }
  const focusedName = root.querySelector('input:focus')?.name;
  const weekStart = currentWeekStart();
  root.innerHTML = `<div data-feature-ui="budget">${loadingNotice()}${renderTimeBudgetHtml({
    mode: state.budget.mode,
    today: state.budget.today,
    categories: activeCategories(state.budget.today),
    weekDocument: normalizeWeek(weekStart),
    weeklyDefaults: weeklyDefaults(weekStart),
    dailyDocument: dailyFor(state.budget.today),
    dailyDefaults: dailyDefaults(state.budget.today),
    emptyHtml: document.querySelector('#empty-template')?.innerHTML || '',
  })}</div>`;
  const draftKey = `${state.budget.today}:${state.budget.mode}`;
  const draft = state.drafts[draftKey] || {};
  root.querySelectorAll('input[name]').forEach((input) => {
    if (Object.prototype.hasOwnProperty.call(draft, input.name)) input.value = draft[input.name];
    input.addEventListener('input', () => {
      state.drafts[draftKey] = { ...(state.drafts[draftKey] || {}), [input.name]: input.value };
    });
    if (input.name === focusedName) input.focus({ preventScroll: true });
  });
  bindRetry(root);
  bindTimeBudgetControls({
    root,
    state: state.budget,
    rerender: () => {
      saveFeatureUiState({ budget: { ...state.budget } });
      renderBudget(); updateHeader('budget');
    },
    onSaveDaily: saveDaily,
    onSaveWeekly: saveWeekly,
  });
}

async function confirmBudgetSave(key, inputs, mode, write, apply) {
  if (state.saving.has(key)) throw new Error('이전 저장의 서버 확인을 기다리고 있습니다. 연결이 복구되면 반영됩니다.');
  const context = sessionContext();
  state.budgetRevisions.set(key, (state.budgetRevisions.get(key) || 0) + 1);
  const draftKey = `${today()}:${mode}`;
  state.drafts[draftKey] = { ...inputs };
  const draftAtSave = JSON.stringify(state.drafts[draftKey]);
  const operation = Promise.resolve().then(() => write(context)).then(() => {
    if (!context.current()) return;
    state.saving.delete(key);
    state.writeVersion += 1;
    apply();
    if (JSON.stringify(state.drafts[draftKey] || {}) === draftAtSave) delete state.drafts[draftKey];
    state.lastLoaded = Date.now();
    state.loadError = '';
    cacheBudgets(context);
    renderActiveView();
    document.dispatchEvent(new CustomEvent('weekly-time-budget:data-changed', { detail: { userId: context.user.uid, scope: 'budgets' } }));
    showToast({ type: 'success', title: '시간 예산을 저장했습니다.', message: '서버 반영을 확인했습니다.' });
  }).finally(() => { if (context.current()) { state.saving.delete(key); renderActiveView(); } });
  state.saving.set(key, operation);
  // Preserve typed values and release the button even if confirmation is delayed.
  state.drafts[draftKey] = { ...inputs };
  try {
    await withTimeout(operation, 8000, '서버 저장 확인이 지연되고 있습니다. 입력값은 유지됩니다. 창을 닫지 말고 연결을 확인하세요.');
  } catch (error) {
    if (context.current()) renderActiveView();
    if (context.current()) showToast({ type: 'error', title: error.code === 'deadline-exceeded' ? '저장 확인 대기 중' : '시간 예산 저장 실패', message: error.message });
    throw error;
  }
}

async function saveDaily(inputs) {
  const date = today();
  const currentCategories = activeCategories(date);
  const activeIds = new Set(currentCategories.map((category) => category.id));
  const preservedOverrides = Object.fromEntries(
    Object.entries(dailyFor(date)?.overrides || {}).filter(([categoryId]) => !activeIds.has(categoryId)),
  );
  const overrides = { ...preservedOverrides };
  for (const category of currentCategories) {
    const parsed = parseOptionalDailyHours(inputs[category.id]);
    if (parsed.explicit) overrides[category.id] = parsed.minutes;
  }
  await confirmBudgetSave(`daily:${date}`, inputs, 'today',
    (context) => context.dataSource.saveDailyBudget(context.user.uid, date, overrides),
    () => replaceDocument(state.daily, 'date', { date, overrides, userModified: true, defaultSourceVersion: 'previous-results-v3' }));
}

async function saveWeekly({ budgetInputs }) {
  const weekStart = currentWeekStart();
  const existing = normalizeWeek(weekStart);
  const currentCategories = activeCategories(today());
  const activeIds = new Set(currentCategories.map((category) => category.id));
  const preservedBudgets = Object.fromEntries(
    Object.entries(existing.budgets || {}).filter(([categoryId]) => !activeIds.has(categoryId)),
  );
  const preservedExplicitBudgetIds = (existing.explicitBudgetIds || [])
    .filter((categoryId) => !activeIds.has(categoryId));
  const snapshot = buildWeeklyBudgetSnapshot({
    weekStart,
    categories: currentCategories,
    budgetInputs,
    defaultBudgets: weeklyDefaults(weekStart),
  });
  snapshot.budgets = { ...preservedBudgets, ...snapshot.budgets };
  snapshot.explicitBudgetIds = [...new Set([...preservedExplicitBudgetIds, ...snapshot.explicitBudgetIds])];
  snapshot.initializedFromPreviousResults = true;
  await confirmBudgetSave(`weekly:${weekStart}`, budgetInputs, 'week',
    (context) => context.dataSource.saveWeeklyBudget(context.user.uid, snapshot),
    () => replaceDocument(state.weekly, 'weekStart', { ...snapshot, userModified: true, defaultSourceVersion: 'previous-results-v3' }));
}

function updateHeader(view) {
  if (view === 'dashboard') {
    document.querySelector('#page-title').textContent = '대시보드';
    document.querySelector('#week-label').textContent = state.dashboard.mode === 'daily'
      ? `${state.dashboard.selectedDate} · 일간 현황`
      : `${weekLabel(state.dashboard.selectedWeekStart)} · 주간 현황`;
  } else if (view === 'budget') {
    document.querySelector('#page-title').textContent = '시간예산';
    document.querySelector('#week-label').textContent = state.budget.mode === 'today'
      ? `${state.budget.today} · 오늘 시간 예산`
      : `${weekLabel(currentWeekStart())} · 이번 주 시간 예산`;
  }
}

function renderActiveView() {
  if (!state.user) return;
  if (state.activeView === 'dashboard') { renderDashboard(); updateHeader('dashboard'); }
  if (state.activeView === 'budget') { renderBudget(); updateHeader('budget'); }
}

document.addEventListener('weekly-time-budget:infrastructure-state', async (event) => {
  const detail = event.detail || {};
  const previousUid = state.user?.uid;
  const nextUid = detail.user?.uid;
  if (previousUid !== nextUid) {
    state.generation += 1;
    state.weekly = []; state.daily = []; state.cacheLoaded = false; state.ready = false;
    state.writeVersion = 0;
    state.lastLoaded = 0; state.loading = false; state.loadError = ''; state.drafts = {};
    state.saving = new Map(); state.initializing = new Map(); state.budgetRevisions = new Map();
    loadingPromise = null; reloadRequested = false;
    document.querySelector('#budget-view').innerHTML = '';
    document.querySelector('#dashboard-view').innerHTML = '';
  }
  state.user = detail.user || null;
  state.runtime = detail.offlineRuntime || null;
  state.dataSource = detail.dataSource || null;
  state.userDataReady = detail.userDataReady === true;
  state.categories = Array.isArray(detail.categories) ? detail.categories : [];
  state.archived = Array.isArray(detail.archivedCategories) ? detail.archivedCategories : [];
  state.entries = Array.isArray(detail.entries) ? detail.entries : [];
  state.remoteEntries = Array.isArray(detail.remoteEntries) ? detail.remoteEntries : [];
  if (!state.user) return;
  renderActiveView();
  await loadData();
  if (state.ready && !state.loadError) ensureCurrentWeekSnapshot().catch(console.error);
});

document.addEventListener('weekly-time-budget:view-changed', async (event) => {
  state.activeView = event.detail?.view || state.activeView;
  if (!['dashboard', 'budget'].includes(state.activeView) || !state.user) return;
  renderActiveView();
  await loadData();
});

document.addEventListener('weekly-time-budget:entries-changed', async (event) => {
  if (!state.user || event.detail?.userId && event.detail.userId !== state.user.uid) return;
  const context = sessionContext();
  const entries = Array.isArray(event.detail?.entries) ? event.detail.entries
    : await withTimeout(() => context.runtime.mergedEntries(state.remoteEntries)).catch(() => state.entries);
  if (!context.current()) return;
  state.entries = entries;
  renderActiveView();
});

document.addEventListener('weekly-time-budget:data-changed', async (event) => {
  if (!state.user || event.detail?.userId && event.detail.userId !== state.user.uid) return;
  state.dataSource?.invalidate?.(state.user.uid, 'budgets');
  await loadData({ force: true });
});

window.addEventListener('online', () => {
  if (state.user) { state.dataSource?.invalidate?.(state.user.uid); loadData({ force: true }).catch(console.error); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ['dashboard', 'budget'].includes(state.activeView)) loadData().catch(console.error);
});
