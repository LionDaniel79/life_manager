import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, apply, goalSummary, pathForEntry, categoryStats, weekBudget, validateState, localDate, weekStart, timerElapsed, dailyGoalStatus, comparisonRange } from '../src/life/domain.js';

const today = '2026-10-09';
const act = (s, type, data) => apply(s, { type, ...data }, today);
function goal(s, id, level, parentId = '', categoryIds = [], extra = {}) {
  return act(s, 'goal.save', { id, level, title: id, startDate: '2026-10-01', effectiveDate: '2026-10-01', parentId, categoryIds, childIds: [], targetMinutes: null, confirmRetroactive: true, ...extra });
}
function tree() {
  let s = createState(today);
  s = goal(s, 'long', 'long');
  s = goal(s, 'mid', 'medium', 'long');
  s = goal(s, 'short', 'short', 'mid', ['thesis'], { targetMinutes: 12000 });
  return s;
}
const entry = (s, id, date, minutes, extra = {}) => act(s, 'entry.save', { id, categoryId: 'thesis', date, durationMinutes: minutes, ...extra });

test('time reaches only explicitly linked ancestors; no target produces no percentage', () => {
  const s = entry(tree(), 'e1', today, 90);
  assert.deepEqual(pathForEntry(s, s.entries[0]), ['short', 'mid', 'long']);
  assert.equal(goalSummary(s, 'long', today).minutes, 90);
  assert.equal(goalSummary(s, 'long', today).percent, null);
  assert.equal(goalSummary(s, 'short', today).percent, 0.75);
});
test('reparenting preserves old path and late entries use their record date', () => {
  let s = entry(tree(), 'old', '2026-10-05', 60);
  s = goal(s, 'newlong', 'long');
  s = goal(s, 'mid', 'medium', 'newlong', [], { effectiveDate: '2026-10-08', childIds: ['short'] });
  s = entry(s, 'late', '2026-10-06', 30);
  s = entry(s, 'new', '2026-10-09', 20);
  assert.equal(goalSummary(s, 'long', today).minutes, 90);
  assert.equal(goalSummary(s, 'newlong', today).minutes, 20);
  assert.equal(goalSummary(s, 'short', today).minutes, 110);
});
test('changing a parent closes incident links only; unlinked short still accrues', () => {
  let s = tree();
  s = goal(s, 'long', 'long', '', [], { effectiveDate: today, targetMinutes: 200 });
  s = entry(s, 'e', today, 40);
  assert.deepEqual(pathForEntry(s, s.entries[0]), ['short', 'mid']);
  assert.equal(goalSummary(s, 'long', today).minutes, 0);
});
test('turning target off preserves accrual and reaching target never completes result', () => {
  let s = entry(tree(), 'e', '2026-10-05', 120);
  s = goal(s, 'short', 'short', 'mid', ['thesis'], { targetMinutes: 100, effectiveDate: today });
  assert.equal(goalSummary(s, 'short', today).percent, 120);
  assert.equal(goalSummary(s, 'short', today).version.status, 'active');
  s = goal(s, 'short', 'short', 'mid', ['thesis'], { effectiveDate: today, targetMinutes: null });
  assert.equal(goalSummary(s, 'short', today).minutes, 120);
  assert.equal(goalSummary(s, 'short', today).percent, null);
});
test('parent period restricts its own totals; child target is not a parent denominator', () => {
  let s = tree();
  s = goal(s, 'long', 'long', '', [], { startDate: '2026-10-07', childIds: ['mid'] });
  s = entry(s, 'before', '2026-10-06', 60);
  s = entry(s, 'inside', today, 30);
  assert.equal(goalSummary(s, 'long', today).minutes, 30);
  assert.equal(goalSummary(s, 'mid', today).minutes, 90);
});
test('duplicate save replaces one source; goal references never inflate overall time', () => {
  let s = entry(tree(), 'e', today, 60);
  s = entry(s, 'e', today, 90);
  assert.equal(s.entries.length, 1);
  assert.equal(categoryStats(s, '2026-10-01', today).find(x => x.id === 'thesis').minutes, 90);
});
test('archiving a category retains name and references, cannot hard-delete used category', () => {
  let s = entry(tree(), 'e', today, 20);
  s = act(s, 'category.archive', { id: 'thesis' });
  assert.equal(s.entries.length, 1);
  assert.equal(goalSummary(s, 'long', today).minutes, 20);
  assert.throws(() => act(s, 'category.delete', { id: 'thesis' }));
});
test('no goal required, explicit zero distinct from no record; invalid durations rejected', () => {
  let s = createState(today);
  s = entry(s, 'zero', today, 0);
  assert.equal(s.entries[0].durationMinutes, 0);
  assert.deepEqual(pathForEntry(s, s.entries[0]), []);
  assert.throws(() => entry(s, 'bad', today, -1));
  assert.throws(() => entry(s, 'bad', '2026-02-30', 10));
  assert.throws(() => entry(s, 'bad', today, 1500));
});
test('absolute results use latest value, not sum; target change separates metric histories', () => {
  let s = goal(tree(), 'short', 'short', 'mid', ['thesis'], { resultTarget: 5, resultUnit: '회' });
  s = act(s, 'result.save', { goalId: 'short', date: '2026-10-05', value: 2 });
  s = act(s, 'result.save', { goalId: 'short', date: today, value: 3 });
  assert.equal(goalSummary(s, 'short', today).result.value, 3);
});
test('weekly explicit zero persists; previous-week actual is only a default', () => {
  let s = entry(createState(today), 'old', '2026-10-02', 90);
  assert.equal(weekBudget(s, 'thesis', '2026-10-05').minutes, 90);
  s = act(s, 'budget.save', { categoryId: 'thesis', week: '2026-10-05', minutes: 0 });
  assert.equal(weekBudget(s, 'thesis', '2026-10-05').minutes, 0);
  assert.equal(weekBudget(s, 'thesis', '2026-10-05').source, '설정');
});
test('pause/reload/resume timer splits at Korean midnight and excludes paused time', () => {
  let s = createState(today);
  const t = Date.parse('2026-10-08T23:50:00+09:00');
  s = act(s, 'timer.start', { categoryId: 'thesis', now: t });
  s = act(s, 'timer.pause', { now: t + 15 * 60000 });
  s = JSON.parse(JSON.stringify(s));
  s = act(s, 'timer.resume', { now: t + 30 * 60000 });
  assert.equal(timerElapsed(s.timer, t + 35 * 60000), 20 * 60000);
  s = act(s, 'timer.finish', { now: t + 35 * 60000 });
  assert.equal(s.timer, null);
  assert.deepEqual(s.entries.map(e => [e.date, e.durationMinutes]), [['2026-10-08', 10], ['2026-10-09', 10]]);
});
test('daily goal counts missing, explicit zero and today separately', () => {
  let s = goal(createState(today), 'short', 'short', '', ['thesis'], { startDate: '2026-10-06', dailyMinutes: 60 });
  s = entry(s, 'large', '2026-10-06', 180);
  s = entry(s, 'zero', '2026-10-07', 0);
  assert.deepEqual(dailyGoalStatus(s, 'short', today).map(x => x.status), ['met', 'below', 'missing', 'today']);
});
test('structural validation rejects duplicate IDs, foreign references and invalid hierarchy', () => {
  const s = tree();
  const duplicate = structuredClone(s);
  duplicate.categories.push(duplicate.categories[0]);
  assert.throws(() => validateState(duplicate));
  assert.throws(() => goal(s, 'bad', 'long', 'short', ['thesis']));
  const bad = entry(s, 'e', today, 10);
  bad.entries[0].categoryId = 'missing';
  assert.throws(() => validateState(bad));
});
test('ambiguous category goal selection requires an explicit choice', () => {
  let s = goal(tree(), 'another', 'short', 'mid', ['thesis']);
  assert.throws(() => entry(s, 'ambiguous', today, 10));
  s = entry(s, 'chosen', today, 10, { goalId: 'short' });
  assert.equal(goalSummary(s, 'another', today).minutes, 0);
});
test('retroactive link edits require acknowledgement and include unassigned only explicitly', () => {
  let s = entry(createState(today), 'past', '2026-10-05', 30);
  assert.throws(() => goal(s, 's', 'short', '', ['thesis'], { confirmRetroactive: false }));
  s = goal(s, 's', 'short', '', ['thesis']);
  assert.equal(goalSummary(s, 's', today).minutes, 0);
  s = goal(s, 's', 'short', '', ['thesis'], { includeUnassigned: true });
  assert.equal(goalSummary(s, 's', today).minutes, 30);
});
test('dates use Korea and configurable week boundaries', () => {
  assert.equal(localDate(Date.parse('2026-10-08T15:30:00Z')), today);
  assert.equal(weekStart(today, 1), '2026-10-05');
  assert.equal(weekStart(today, 0), '2026-10-04');
});
test('correcting category changes snapshot name; same-category rename keeps historic name',()=>{
  let s=entry(createState(today),'e',today,10);
  s=act(s,'category.save',{id:'thesis',name:'논문 작업',categoryType:'growth'});
  s=entry(s,'e',today,20);
  assert.equal(s.entries[0].categoryName,'논문');
  s=entry(s,'e',today,20,{categoryId:'exercise'});
  assert.equal(s.entries[0].categoryName,'운동');
});
test('week and month compare equivalent elapsed positions; custom ranges compare adjacent days',()=>{
  assert.deepEqual(comparisonRange('2026-10-05','2026-10-09','week'),{from:'2026-09-28',to:'2026-10-02'});
  assert.deepEqual(comparisonRange('2026-10-01','2026-10-09','month'),{from:'2026-09-01',to:'2026-09-09'});
  assert.deepEqual(comparisonRange('2026-03-01','2026-03-31','month'),{from:'2026-02-01',to:'2026-02-28'});
  assert.deepEqual(comparisonRange('2026-10-05','2026-10-09','custom'),{from:'2026-09-30',to:'2026-10-04'});
});
test('same-day result-unit change preserves old measurements without mixing them',()=>{
  let s=goal(createState(today),'s','short','',['thesis'],{effectiveDate:today,resultTarget:5,resultUnit:'회'});
  s=act(s,'result.save',{goalId:'s',date:today,value:2});
  s=goal(s,'s','short','',['thesis'],{effectiveDate:today,resultTarget:10,resultUnit:'단계'});
  assert.equal(s.results.length,1);
  assert.equal(goalSummary(s,'s',today).result,null);
});
