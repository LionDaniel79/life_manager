import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createDefaultUiState, normalizeUiState } from '../src/ui-session-state.js';
import { createStatisticsState, applyStatisticsAction } from '../src/statistics-state.js';
import { buildStatisticsViewModel, renderStatisticsHtml } from '../src/statistics-view.js';
import { createStatisticsFeature } from '../src/statistics-feature.js';

const now = () => new Date('2026-10-09T12:00:00');
const context = { today: '2026-10-09', currentWeekStart: '2026-10-05' };
const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

function element(initial = []) {
  const classes = new Set(initial);
  return {
    hidden: true, dataset: {}, innerHTML: '', textContent: '', childElementCount: 1,
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
    },
    attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function featureHarness(load) {
  const listeners = {};
  const root = { ...element(), addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}, contains: () => true };
  const goalsRoot = element(['hidden']);
  const saves = [];
  let user = { uid: 'first' };
  const feature = createStatisticsFeature({ root, goalsRoot, dataSource: { load }, getCurrentUser: () => user, now, saveUiState: async (value) => { saves.push(value); } });
  const select = (mode) => listeners.click({ target: { closest: (selector) => selector === 'button[data-statistics-mode]' ? { dataset: { statisticsMode: mode } } : null }, preventDefault() {} });
  return { feature, root, goalsRoot, saves, select, changeUser: (uid) => { user = { uid }; } };
}

test('six menu labels keep time budgets separate from the goals wrapper', async () => {
  const html = await read('index.html');
  const buttons = [...html.matchAll(/<button data-view="([^"]+)" class="nav-button[^"]*">([^<]+)<\/button>/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(buttons, [['dashboard', '대시보드'], ['record', '시간기록'], ['budget', '시간예산'], ['goals', '목표설정'], ['statistics', '통계'], ['categories', '앱 설정']]);
  assert.match(html, /id="goals-view"[^>]*>[\s\S]*?id="life-goals"[^>]*data-life-view="goals"[\s\S]*?<\/section>\s*<\/section>/);
  assert.match(html, /id="life-statistics"[^>]*\bhidden(?:\s|>)/);
});

test('UI restores the goals menu and sixth statistics mode while old manual ranges become duration', () => {
  assert.equal(createDefaultUiState(context).record.manualMode, 'duration');
  const restored = normalizeUiState({ activeView: 'goals', record: { manualMode: 'time-range' }, statistics: { mode: 'goals' } }, context);
  assert.equal(restored.activeView, 'goals');
  assert.equal(restored.statistics.mode, 'goals');
  assert.equal(restored.record.manualMode, 'duration');
});

test('goals statistics requires no time snapshot and renders only six tabs', () => {
  const state = createStatisticsState({ now: now(), restored: { mode: 'goals' } });
  assert.equal(state.mode, 'goals');
  const model = buildStatisticsViewModel(state, { now: now() });
  const html = renderStatisticsHtml(model);
  assert.equal(model.tabs.at(-1).label, '목표통계');
  assert.equal(model.tabs.length, 6);
  assert.match(html, /data-statistics-mode="goals"/);
  assert.doesNotMatch(html, /statistics-year|statistics-controls|statistics-summary|statistics-rescue-table|예산 대비|서버의 최신/);
  assert.equal(applyStatisticsAction({ ...state, mode: 'weekly' }, { type: 'select-mode', mode: 'goals' }, {}).state.mode, 'goals');
});

test('goals is usable while time data stalls, survives failure, and hides when leaving', async () => {
  let reject;
  const h = featureHarness(() => new Promise((_, fail) => { reject = fail; }));
  const entering = h.feature.enter();
  assert.match(h.root.innerHTML, /data-statistics-mode="goals"/);
  await h.select('goals');
  assert.equal(h.goalsRoot.hidden, false);
  assert.equal(h.saves.at(-1).statistics.mode, 'goals');
  reject(new Error('time load unavailable'));
  await entering;
  assert.match(h.root.innerHTML, /data-statistics-feature/);
  assert.doesNotMatch(h.root.innerHTML, /data-statistics-error/);
  h.feature.leave();
  assert.equal(h.goalsRoot.hidden, true);
  h.feature.destroy();
});

test('failure retains tabs, restore reveals goals, and account refresh keeps the goals shell', async () => {
  const h = featureHarness(async () => { throw new Error('offline'); });
  await h.feature.enter();
  assert.match(h.root.innerHTML, /data-statistics-error/);
  assert.match(h.root.innerHTML, /data-statistics-mode="goals"/);
  h.feature.restore({ mode: 'goals' });
  assert.equal(h.goalsRoot.hidden, false);
  h.changeUser('second');
  await h.feature.enter();
  assert.equal(h.goalsRoot.hidden, false);
  assert.doesNotMatch(h.root.innerHTML, /data-statistics-error/);
  await h.select('weekly');
  assert.equal(h.goalsRoot.hidden, true);
  assert.match(h.root.innerHTML, /data-statistics-error/);
  assert.match(h.root.innerHTML, /offline/);
  h.feature.destroy();
});

test('sidebar closes outside and on Escape, preserves internal clicks, and restores goals visibility', async () => {
  const listeners = {};
  const sidebar = element();
  const menu = element();
  const stats = element(['hidden']);
  const views = Object.fromEntries(['dashboard', 'record', 'budget', 'goals', 'history', 'statistics', 'categories'].map((name) => [`#${name}-view`, element(name === 'dashboard' ? [] : ['hidden'])]));
  stats.dataset.lifeView = 'statistics';
  const selectors = { ...views, '.sidebar': sidebar, '#mobile-menu': menu, '#life-statistics': stats, '#page-title': element() };
  const document = { querySelector: (selector) => selectors[selector], querySelectorAll: (selector) => selector === '[data-life-view]' ? [stats] : [], addEventListener: (name, fn) => { listeners[name] = fn; }, dispatchEvent() {} };
  const source = (await read('src/app-shell.js')).replace(/export \{ switchView \};/, '');
  vm.runInNewContext(source, { document, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  const click = (match) => listeners.click({ target: { closest: (selector) => match[selector] || null }, preventDefault() {} });
  click({ '#mobile-menu': menu });
  assert.equal(menu.attributes['aria-expanded'], 'true');
  const press = (internal) => listeners.pointerdown({ target: { closest: () => internal || null } });
  press(menu);
  assert.equal(menu.attributes['aria-expanded'], 'true');
  press(sidebar);
  assert.equal(menu.attributes['aria-expanded'], 'true');
  press(null);
  assert.equal(menu.attributes['aria-expanded'], 'false');
  click({ '#mobile-menu': menu });
  click({ '.sidebar': sidebar });
  assert.equal(sidebar.classList.contains('open'), true);
  click({});
  assert.equal(sidebar.classList.contains('open'), false);
  click({ '#mobile-menu': menu });
  listeners.keydown({ key: 'Escape' });
  assert.equal(menu.attributes['aria-expanded'], 'false');
  listeners['weekly-time-budget:ui-state-restored']({ detail: { statistics: { mode: 'goals' } } });
  listeners['weekly-time-budget:shell-state']({ detail: { activeView: 'statistics' } });
  assert.equal(stats.hidden, false);
  listeners['weekly-time-budget:statistics-mode-changed']({ detail: { mode: 'weekly' } });
  assert.equal(stats.hidden, true);
  listeners['weekly-time-budget:statistics-mode-changed']({ detail: { mode: 'goals' } });
  listeners['weekly-time-budget:shell-state']({ detail: { activeView: 'goals' } });
  assert.equal(views['#goals-view'].classList.contains('hidden'), false);
  assert.equal(stats.hidden, true);
});
