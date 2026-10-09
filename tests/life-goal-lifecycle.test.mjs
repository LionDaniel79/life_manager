import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, apply, goalSummary, validateState, pathForEntry } from '../src/life/domain.js';
import { hydrateLife, applyLife, persistLife, validateLife } from '../src/life/model.js';
import { home, goals, statistics, goalCard, attribution } from '../src/life/views.js';
import { linkFields } from '../src/life/forms.js';

const today='2026-10-09';
const save=(s,extra={})=>apply(s,{type:'goal.save',id:'weight',level:'medium',title:'체중 목표',startDate:'2026-10-01',effectiveDate:'2026-10-01',confirmRetroactive:true,resultStart:80,resultTarget:70,resultUnit:'kg',showHome:true,...extra},today);
const measure=(s,value,date=today)=>apply(s,{type:'result.save',goalId:'weight',date,value},today);

test('decreasing numeric goal uses baseline to target progress and never invents an unmeasured value',()=>{
  let s=save(createState(today));
  assert.equal(goalSummary(s,'weight',today).resultPercent,null);
  s=measure(s,75);
  assert.equal(goalSummary(s,'weight',today).resultPercent,50);
  assert.match(goalCard(s,'weight',today),/75.*kg/);
  assert.match(goalCard(s,'weight',today),/50%/);
  s=measure(s,69);
  assert.ok(Math.abs(goalSummary(s,'weight',today).resultPercent-110)<1e-9);
  assert.equal(goalSummary(s,'weight',today).version.status,'active');
});

test('numeric goals support increasing totals, a zero target, and movement away from target',()=>{
  let s=save(createState(today),{resultStart:0,resultTarget:5,resultUnit:'회'});
  s=measure(s,2);assert.equal(goalSummary(s,'weight',today).resultPercent,40);
  s=save(createState(today),{resultStart:10,resultTarget:0,resultUnit:'개'});
  s=measure(s,5);assert.equal(goalSummary(s,'weight',today).resultPercent,50);
  s=measure(s,12);assert.equal(goalSummary(s,'weight',today).resultPercent,-20);
  assert.throws(()=>save(createState(today),{resultStart:70,resultTarget:70}),/시작값/);
});

test('old goal backups without a numeric baseline remain valid and mean a zero baseline',()=>{
  let s=save(createState(today),{resultStart:0,resultTarget:5,resultUnit:'회'});
  delete s.goals[0].versions[0].resultStart;
  assert.equal(validateState(s),true);
  s=measure(s,3);assert.equal(goalSummary(s,'weight',today).resultPercent,60);
  s.goals[0].versions[0].resultTarget=0;
  assert.equal(validateState(s),true);
  assert.equal(goalSummary(s,'weight',today).resultPercent,null);
});

test('archived goals disappear from home and statistics and move into a collapsed archive',()=>{
  let s=save(createState(today));
  s=apply(s,{type:'goal.archive',id:'weight'},today);
  assert.doesNotMatch(home(s,today),/체중 목표/);
  assert.doesNotMatch(statistics(s,today),/체중 목표/);
  const html=goals(s,today);
  assert.match(html,/<details class="life-archive"><summary>보관 목표 · 1개/);
  assert.doesNotMatch(html.split('<details')[0],/체중 목표/);
  assert.doesNotMatch(linkFields(s,'short','',today),/value="weight"/);
  assert.equal(s.homeGoalIds.includes('weight'),false);
});

test('archive restores through edit without fabricating prior activity links',()=>{
  let s=save(createState(today),{categoryIds:['exercise']});
  s=apply(s,{type:'goal.archive',id:'weight'},today);
  s=save(s,{effectiveDate:today,status:'active',showHome:true,categoryIds:[]});
  assert.match(home(s,today),/체중 목표/);
  assert.equal(s.links.filter(l=>l.validTo===null).length,0);
});

test('deleting one goal hides it while preserving original records, child goals and historical parent totals',()=>{
  let s=createState(today);
  s=save(s,{id:'long',level:'long',title:'상위 목표',resultTarget:null,resultStart:null});
  s=save(s,{parentId:'long',categoryIds:['exercise']});
  s=save(s,{id:'child',level:'short',title:'하위 목표',parentId:'weight',categoryIds:['thesis'],resultTarget:null,resultStart:null});
  s=apply(s,{type:'entry.save',id:'old',categoryId:'exercise',date:'2026-10-05',durationMinutes:60},today);
  s=apply(s,{type:'goal.delete',id:'weight'},today);
  assert.equal(s.entries.length,1);
  assert.ok(s.goals.find(g=>g.id==='child'));
  assert.deepEqual(pathForEntry(s,s.entries[0]),['weight','long']);
  assert.equal(goalSummary(s,'long',today).minutes,60);
  for(const render of [home,goals,statistics])assert.doesNotMatch(render(s,today),/체중 목표/);
  assert.doesNotMatch(linkFields(s,'short','',today),/value="weight"/);
  assert.throws(()=>save(s,{effectiveDate:today}),/삭제/);
  assert.throws(()=>apply(s,{type:'home.toggle',id:'weight'},today),/삭제|보관/);
  assert.throws(()=>save(s,{id:'other',level:'short',parentId:'weight'}),/삭제|보관/);
  s=apply(s,{type:'entry.save',id:'new',categoryId:'thesis',date:today,durationMinutes:20},today);
  assert.deepEqual(pathForEntry(s,s.entries[1]),['child']);
});

test('goal deletion is persisted without dropping deleted-target assignments or imported legacy weight/review data',()=>{
  const infra={categories:[{id:'reading',name:'독서'}],entries:[{id:'e',categoryId:'reading',date:'2026-10-05',durationMinutes:60}]};
  let s=hydrateLife(null,infra,today);
  s=applyLife(s,{type:'goal.save',id:'m',title:'중기',level:'medium',startDate:'2026-10-01',effectiveDate:'2026-10-01',confirmRetroactive:true,categoryIds:['reading']},today);
  s=applyLife(s,{type:'assignment.save',entryId:'e',goalId:'m'},today);
  s.weights=[{id:'w',date:today,kg:75,note:''}];
  s=applyLife(s,{type:'goal.delete',id:'m'},today);
  const backup=JSON.parse(JSON.stringify(persistLife(s)));
  assert.equal(validateLife(backup),true);
  assert.equal(backup.weights.length,1);
  assert.equal(backup.assignments[0].goalId,'m');
  assert.doesNotMatch(goals(hydrateLife(backup,infra,today),today),/data-goal-id="m"/);
});

test('goal statistics contains neither standalone weight records nor weekly reviews',()=>{
  const s=save(createState(today));
  assert.doesNotMatch(statistics(s,today),/체중 기록|주간 점검|data-life="weight"|data-life="review"/);
});

for(const type of ['goal.archive','goal.delete'])test(`${type} preserves existing same-day attribution, including children, after reload`,()=>{
  const infra={categories:[{id:'reading',name:'독서'}],entries:[]};
  let s=hydrateLife(null,infra,today);
  const add=extra=>{s=applyLife(s,{type:'goal.save',startDate:today,effectiveDate:today,...extra},today);};
  add({id:'l',level:'long',title:'상위'});
  add({id:'m',level:'medium',title:'중기',parentId:'l',categoryIds:['reading']});
  add({id:'c',level:'short',title:'하위',parentId:'m',categoryIds:['reading']});
  infra.entries.push({id:'direct',categoryId:'reading',date:today,durationMinutes:60},{id:'child',categoryId:'reading',date:today,durationMinutes:30});
  s=hydrateLife(persistLife(s),infra,today);
  s=applyLife(s,{type:'assignment.save',entryId:'direct',goalId:'m'},today);
  s=applyLife(s,{type:'assignment.save',entryId:'child',goalId:'c'},today);
  assert.equal(goalSummary(s,'l',today).minutes,90);
  s=applyLife(s,{type,id:'m'},today);
  assert.equal(goalSummary(s,'l',today).minutes,90);
  assert.match(attribution(s),/0건 선택 필요/);
  assert.match(attribution(s),/중기 · 중기 \(기존 배정 보존\)/);
  assert.doesNotMatch(attribution(s),/이전 연결 종료 · 다시 선택/);
  const backup=JSON.parse(JSON.stringify(persistLife(s)));
  assert.equal(validateLife(backup),true);
  infra.entries[0].durationMinutes=70;
  infra.entries.push({id:'later',categoryId:'reading',date:today,durationMinutes:20});
  s=hydrateLife(backup,infra,today);
  assert.equal(goalSummary(s,'l',today).minutes,100);
  assert.equal(goalSummary(s,'c',today).minutes,50);
  assert.deepEqual(pathForEntry(s,s.entries[2]),['c']);
  s=applyLife(s,{type:'assignment.save',entryId:'direct',goalId:'c'},today);
  assert.equal(goalSummary(s,'l',today).minutes,30);
  assert.equal(goalSummary(s,'c',today).minutes,120);
});

test('automatic assignments retain same-day totals after retirement, but edited dates and categories do not reuse the old path',()=>{
  const infra={categories:[{id:'reading',name:'독서'},{id:'exercise',name:'운동'}],entries:[{id:'e',categoryId:'reading',date:today,durationMinutes:60}]};
  let s=hydrateLife(null,infra,today);
  s=applyLife(s,{type:'goal.save',id:'m',level:'medium',title:'중기',startDate:today,effectiveDate:today,categoryIds:['reading']},today);
  s=applyLife(s,{type:'goal.archive',id:'m'},today);
  const saved=persistLife(s);
  s=hydrateLife(saved,infra,today);
  assert.equal(goalSummary(s,'m',today).minutes,60);
  infra.entries[0].categoryId='exercise';
  assert.equal(goalSummary(hydrateLife(saved,infra,today),'m',today).minutes,0);
  infra.entries[0].categoryId='reading';infra.entries[0].date='2026-10-10';
  assert.equal(goalSummary(hydrateLife(saved,infra,'2026-10-10'),'m','2026-10-10').minutes,0);
  infra.entries=[];
  assert.equal(goalSummary(hydrateLife(saved,infra,today),'m',today).minutes,0);
});

test('retained paths validate in backups while old backups without them remain supported',()=>{
  let s=save(createState(today),{categoryIds:['exercise']});
  s=apply(s,{type:'entry.save',id:'e',categoryId:'exercise',date:today,durationMinutes:30},today);
  s=apply(s,{type:'goal.archive',id:'weight'},today);
  assert.equal(s.retainedEntryPaths.length,1);
  const bad=structuredClone(s);bad.retainedEntryPaths[0].goalIds=['missing'];
  assert.throws(()=>validateState(bad),/보존/);
  delete s.retainedEntryPaths;
  assert.equal(validateState(s),true);
});
