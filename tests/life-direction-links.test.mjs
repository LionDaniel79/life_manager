import {test} from 'node:test';
import assert from 'node:assert/strict';
import {goalSummary,pathForEntry,activeLink,canParent,canLinkActivity} from '../src/life/domain.js';
import {hydrateLife,applyLife,persistLife,validateLife} from '../src/life/model.js';
import {linkFields} from '../src/life/forms.js';
import {goalCard,attribution} from '../src/life/views.js';

const today='2026-10-10',start='2026-10-01';
const infra={categories:[{id:'reading',name:'독서'}],entries:[{id:'e1',date:today,categoryId:'reading',durationMinutes:60}]};
const save=(s,id,level,extra={})=>applyLife(s,{type:'goal.save',id,level,title:id,startDate:start,effectiveDate:start,confirmRetroactive:true,...extra},today);
function tree(){
  let s=hydrateLife(null,infra,today);
  s=save(s,'direction','life');s=save(s,'long','long',{parentId:'direction'});
  s=save(s,'medium','medium',{parentId:'long'});
  return save(s,'short','short',{parentId:'medium',categoryIds:['reading']});
}

test('life editor groups every goal level and basic activities, and saves selected links',()=>{
  let s=tree();
  const form=linkFields(s,'life','direction',today);
  for(const title of ['하위 장기 목표','하위 중기 목표','하위 단기 목표','기본 항목 (시간 기록)'])assert.ok(form.includes(`<legend>${title}</legend>`));
  s=save(s,'direction','life',{effectiveDate:today,childIds:['long','medium','short'],categoryIds:['reading']});
  assert.deepEqual(s.links.filter(l=>l.toId==='direction'&&activeLink(l,today)).map(l=>l.fromId).sort(),['long','medium','reading','short']);
  for(const level of ['medium','short'])assert.match(linkFields(s,level,level,today),/<optgroup label="생애 목표">/);
  assert.equal(validateLife(persistLife(s)),true);
  assert.equal(canParent('life','life'),false);
  assert.equal(canParent('long','short'),false);
  assert.equal(canLinkActivity('long'),false);
});

test('life includes connected time once through a full path without a completion percentage',()=>{
  const s=tree();
  assert.deepEqual(pathForEntry(s,s.entries[0]),['short','medium','long','direction']);
  const summary=goalSummary(s,'direction',today);
  assert.equal(summary.minutes,60);assert.equal(summary.percent,null);assert.equal(summary.resultPercent,null);
  assert.equal(summary.version.targetMinutes,null);
  assert.match(goalCard(s,'direction',today),/연결 시간 1시간/);
  assert.doesNotMatch(goalCard(s,'direction',today),/<progress/);
});

test('overlapping life and short category links require one choice, preserve totals on reload',()=>{
  let s=save(tree(),'direction','life',{childIds:['long'],categoryIds:['reading']});
  assert.equal(s.entries[0].goalId,null);
  assert.match(attribution(s),/생애 · direction/);
  for(const goalId of ['direction','short']){
    s=applyLife(s,{type:'assignment.save',entryId:'e1',goalId},today);
    s=hydrateLife(JSON.parse(JSON.stringify(persistLife(s))),infra,today);
    assert.equal(validateLife(s),true);
    assert.equal(goalSummary(s,'direction',today).minutes,60);
    assert.equal(goalSummary(s,'short',today).minutes,goalId==='short'?60:0);
    assert.equal(s.entries.length,1);
  }
});

for(const type of ['goal.archive','goal.delete'])test(`${type} preserves four-level and directly assigned life paths`,()=>{
  let s=tree();
  s=applyLife(s,{type,id:'short'},today);
  assert.deepEqual(s.retainedEntryPaths[0].goalIds,['short','medium','long','direction']);
  let backup=JSON.parse(JSON.stringify(persistLife(s)));
  assert.equal(validateLife(backup),true);
  s=hydrateLife(backup,{...infra,entries:[{...infra.entries[0],durationMinutes:70}]},today);
  assert.equal(goalSummary(s,'direction',today).minutes,70);
  s=save(hydrateLife(null,infra,today),'direction','life',{categoryIds:['reading']});
  s=applyLife(s,{type,id:'direction'},today);
  assert.deepEqual(s.retainedEntryPaths[0].goalIds,['direction']);
  backup=JSON.parse(JSON.stringify(persistLife(s)));assert.equal(validateLife(backup),true);
  s=hydrateLife(backup,{...infra,entries:[...infra.entries,{...infra.entries[0],id:'new'}]},today);
  assert.equal(goalSummary(s,'direction',today).minutes,60);
  assert.equal(s.entries[1].goalId,null);
});

test('moving a medium directly to another life direction preserves original dated ancestry',()=>{
  let s=save(tree(),'new-direction','life');
  s=save(s,'new-direction','life',{effectiveDate:today,childIds:['medium']});
  s=hydrateLife(persistLife(s),{...infra,entries:[...infra.entries,{...infra.entries[0],id:'past',date:'2026-10-05',durationMinutes:30}]},today);
  assert.deepEqual(pathForEntry(s,s.entries[0]),['short','medium','new-direction']);
  assert.deepEqual(pathForEntry(s,s.entries[1]),['short','medium','long','direction']);
  assert.equal(goalSummary(s,'direction',today).minutes,30);
  assert.equal(goalSummary(s,'new-direction',today).minutes,60);
  assert.equal(goalSummary(s,'medium',today).minutes,90);
});

test('legacy retained paths remain valid without inventing a new life ancestor',()=>{
  let s=tree();
  s.retainedEntryPaths=[{entryId:'e1',categoryId:'reading',date:today,goalIds:['short','medium','long']}];
  const copy=JSON.parse(JSON.stringify(persistLife(s)));assert.equal(validateLife(copy),true);
  s=hydrateLife(copy,infra,today);
  assert.deepEqual(pathForEntry(s,s.entries[0]),['short','medium','long']);
  assert.equal(goalSummary(s,'long',today).minutes,60);
});
