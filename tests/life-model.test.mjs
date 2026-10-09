import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, apply, goalSummary } from '../src/life/domain.js';
import { hydrateLife, persistLife, applyLife, resolveEntryGoal } from '../src/life/model.js';
import { attribution, goalCard } from '../src/life/views.js';

const date = '2026-10-09';
const infra = { categories: [{ id: 'reading', name: '독서', order: 1 }], entries: [{ id: 'e1', categoryId: 'reading', date, durationMinutes: 60 }] };
function linked() {
  let s = hydrateLife(null, infra, date);
  for (const [id,level,parentId] of [['l','long',null],['m','medium','l'],['s','short','m']]) s=apply(s,{type:'goal.save',id,level,title:id,effectiveDate:date,startDate:date,parentId,categoryIds:level==='short'?['reading']:[],targetMinutes:level==='long'?120:null},date);
  return s;
}
test('original time records count once through explicitly linked hierarchy without being copied to goal storage',()=>{
  const s=hydrateLife(persistLife(linked()),infra,date);
  assert.equal(goalSummary(s,'l',date).minutes,60);
  assert.equal(goalSummary(s,'l',date).percent,50);
  assert.equal(goalSummary(s,'m',date).percent,null);
  assert.equal(persistLife(s).entries.length,0);
  assert.equal(infra.entries[0].goalId,undefined);
});
test('multiple eligible short goals need explicit attribution; unassigned time stays available',()=>{
  let s=linked();
  s=apply(s,{type:'goal.save',id:'s2',level:'short',title:'second',effectiveDate:date,startDate:date,parentId:'m',categoryIds:['reading']},date);
  s=hydrateLife(persistLife(s),infra,date);
  assert.equal(resolveEntryGoal(s,infra.entries[0]),null);
  assert.equal(goalSummary(s,'l',date).minutes,0);
  s=applyLife(s,{type:'assignment.save',entryId:'e1',goalId:'s2'},date);
  assert.equal(goalSummary(s,'l',date).minutes,60);
  assert.equal(goalSummary(s,'s',date).minutes,0);
  assert.equal(goalSummary(s,'s2',date).minutes,60);
});
test('archived and removed categories remain readable; no records before link date are silently attributed',()=>{
  const s=hydrateLife(persistLife(linked()),{categories:[],archivedCategories:infra.categories,entries:[{...infra.entries[0],date:'2026-10-08'}]},date);
  assert.equal(s.categories[0].archived,true);
  assert.equal(goalSummary(s,'l',date).minutes,0);
});
test('persisted goal state never includes time entries, budgets or timer',()=>{
  const s=linked(); s.timer={secret:'original timer'}; s.budgets=[{secret:'time budget'}];
  const p=persistLife(s);
  assert.equal(p.entries.length,0); assert.equal(p.budgets.length,0); assert.equal(p.timer,null);
});
test('an invalid explicit assignment stays visible for correction after relinking leaves one eligible goal',()=>{
  let s=linked();
  const second={type:'goal.save',id:'s2',level:'short',title:'second',effectiveDate:date,startDate:date,parentId:'m',categoryIds:['reading']};
  s=applyLife(s,second,date);s=applyLife(s,{type:'assignment.save',entryId:'e1',goalId:'s2'},date);
  s=applyLife(s,{...second,categoryIds:[]},date);
  assert.equal(goalSummary(s,'l',date).minutes,0);
  assert.match(attribution(s),/data-life-assignment="e1"/);
  s=applyLife(s,{type:'assignment.save',entryId:'e1',goalId:'s'},date);
  assert.equal(goalSummary(s,'l',date).minutes,60);
});
test('daily goal label never attributes an earlier day to today',()=>{
  let s=linked();s=applyLife(s,{type:'goal.save',id:'s',level:'short',title:'s',effectiveDate:date,startDate:date,endDate:date,dailyMinutes:30,categoryIds:['reading']},date);
  assert.match(goalCard(s,'s','2026-10-10'),/오늘 실행 0분/);
});
