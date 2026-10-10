import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../src/life/domain.js';
import {hydrateLife, persistLife, validateLife} from '../src/life/model.js';

const today='2026-10-10';
const save=(s,extra={})=>domain.apply(s,{type:'goal.save',id:'s',level:'short',title:'반복 독서',startDate:'2026-09-01',endDate:'2026-09-15',effectiveDate:'2026-09-01',categoryIds:['thesis'],targetMinutes:120,repeat:true,confirmRetroactive:true,...extra},today);
const entry=(s,id,date,durationMinutes)=>domain.apply(s,{type:'entry.save',id,date,categoryId:'thesis',durationMinutes},today);
function tree(){
  let s=domain.createState(today);
  s=save(s,{id:'l',level:'long',title:'장기',endDate:null,categoryIds:[],repeat:false,targetMinutes:null});
  s=save(s,{id:'m',level:'medium',title:'중기',endDate:null,categoryIds:[],repeat:false,parentId:'l',targetMinutes:600});
  return save(s,{parentId:'m'});
}

test('repeat rolls over inclusive equal-length spans, retains sources and cumulative ancestors',()=>{
  let s=entry(tree(),'first','2026-09-15',120);
  s=entry(s,'second','2026-09-16',30);
  assert.equal(domain.goalSummary(s,'s','2026-09-16').minutes,30);
  assert.equal(domain.goalSummary(s,'s','2026-09-16').percent,25);
  assert.deepEqual(domain.pathForEntry(s,s.entries[1]),['s','m','l']);
  assert.equal(domain.goalSummary(s,'m','2026-09-16').minutes,150);
  assert.equal(domain.goalSummary(s,'l','2026-09-16').percent,null);
  assert.equal(domain.goalSummary(s,'s','2026-09-15').percent,100);
  const r=domain.goalSummary(s,'s','2026-10-10');
  assert.equal(r.minutes,0);
  assert.equal(r.totalMinutes,150);
  assert.deepEqual(r.period,{from:'2026-10-01',to:'2026-10-15',days:15,index:3});
  assert.equal(r.version.status,'active');
  assert.equal(s.entries.length,2);
});

test('one-day, leap month and year crossings use inclusive calendar days',()=>{
  for(const [start,end,asOf,from,to,index] of [
    ['2026-09-01','2026-09-01','2026-09-16','2026-09-16','2026-09-16',16],
    ['2024-02-20','2024-02-29','2024-03-01','2024-03-01','2024-03-10',2],
    ['2025-12-20','2026-01-03','2026-01-04','2026-01-04','2026-01-18',2],
  ]){
    const s=save(domain.createState(today),{startDate:start,endDate:end,effectiveDate:start});
    const p=domain.goalSummary(s,'s',asOf).period;
    assert.equal(p.from,from);assert.equal(p.to,to);assert.equal(p.index,index);
  }
});

test('late and corrected records stay in their period and hydrate after the initial end date',()=>{
  let s=entry(tree(),'late','2026-09-05',90);
  s=entry(s,'late','2026-09-05',60);
  s=entry(s,'now','2026-10-10',15);
  s.assignments=[];
  const stored=JSON.parse(JSON.stringify(persistLife(s)));
  assert.equal(stored.entries.length,0);assert.equal(validateLife(stored),true);
  const restored=hydrateLife(stored,{categories:[{id:'thesis',name:'논문'}],entries:s.entries},today);
  assert.equal(domain.goalSummary(restored,'s',today).minutes,15);
  assert.equal(domain.goalSummary(restored,'m',today).minutes,75);
  assert.equal(domain.goalSummary(restored,'s','2026-09-15').minutes,60);
});

test('repeated numbers require a new measurement each period; no time target stays optional',()=>{
  let s=save(domain.createState(today),{targetMinutes:null,resultTarget:5,resultUnit:'회'});
  s=domain.apply(s,{type:'result.save',goalId:'s',date:'2026-09-15',value:5},today);
  assert.equal(domain.goalSummary(s,'s','2026-09-15').resultPercent,100);
  assert.equal(domain.goalSummary(s,'s','2026-09-16').result,null);
  s=domain.apply(s,{type:'result.save',goalId:'s',date:'2026-09-16',value:0},today);
  assert.equal(domain.goalSummary(s,'s','2026-09-16').resultPercent,0);
  assert.equal(domain.goalSummary(s,'s','2026-09-16').percent,null);
});

test('only short goals with a finite valid span can repeat; old backups remain unchanged',()=>{
  const s=domain.createState(today);
  for(const extra of [{level:'medium'},{level:'long'},{level:'life',categoryIds:[]},{endDate:null},{endDate:'2026-08-31'},{repeat:'yes'}])assert.throws(()=>save(s,extra));
  const legacy=save(s,{repeat:false});delete legacy.goals[0].versions[0].repeat;
  assert.equal(domain.validateState(legacy),true);
  assert.equal(domain.linkedActivityGoals(legacy,'thesis','2026-09-16').length,0);
  assert.equal(domain.goalSummary(legacy,'s',today).period,null);
});

test('history retains completed periods, while target edits apply to the ongoing span',()=>{
  let s=entry(tree(),'first','2026-09-15',120);
  s=entry(s,'second','2026-09-16',30);
  s=save(s,{effectiveDate:'2026-09-20',parentId:'m',targetMinutes:60});
  const periods=domain.goalPeriods(s,'s',today,12);
  assert.deepEqual(periods.map(r=>[r.period.from,r.period.to,r.minutes,r.percent]),[
    ['2026-10-01','2026-10-15',0,0],['2026-09-16','2026-09-30',30,50],['2026-09-01','2026-09-15',120,100],
  ]);
});

test('schedule changes and disabling repeat keep earlier cycles and ancestor time',()=>{
  let s=entry(tree(),'old','2026-09-16',60);
  s=save(s,{effectiveDate:'2026-09-20',startDate:'2026-09-20',endDate:'2026-09-22',parentId:'m'});
  s=entry(s,'new','2026-09-23',30);
  assert.deepEqual(domain.goalSummary(s,'s','2026-09-23').period,{from:'2026-09-23',to:'2026-09-25',days:3,index:2});
  const old=domain.goalPeriods(s,'s','2026-09-23').find(r=>r.period.from==='2026-09-16');
  assert.equal(old.period.to,'2026-09-19');assert.equal(old.minutes,60);
  assert.equal(domain.goalSummary(s,'m',today).minutes,90);
  s=save(s,{effectiveDate:'2026-09-26',startDate:'2026-09-20',endDate:'2026-09-28',repeat:false,parentId:'m'});
  assert.equal(domain.linkedActivityGoals(s,'thesis','2026-09-29').length,0);
  assert.equal(domain.goalSummary(s,'s',today).period,null);
  assert.ok(domain.goalPeriods(s,'s',today).some(r=>r.period.from==='2026-09-16'));
});

test('archive freezes the last period and preserves same-day parent contribution',()=>{
  let s=entry(tree(),'last','2026-09-18',60);
  s=domain.apply(s,{type:'goal.archive',id:'s'},'2026-09-18');
  assert.equal(domain.goalSummary(s,'s',today).period.from,'2026-09-16');
  assert.equal(domain.goalSummary(s,'s',today).minutes,60);
  assert.equal(domain.goalSummary(s,'m',today).minutes,60);
  assert.equal(domain.linkedActivityGoals(s,'thesis','2026-10-10').length,0);
});

test('daily execution works after a repeating goal initial end',()=>{
  let s=save(domain.createState(today),{dailyMinutes:30});
  s=entry(s,'later','2026-09-16',30);
  assert.equal(domain.dailyGoalStatus(s,'s','2026-09-17').find(r=>r.date==='2026-09-16')?.status,'met');
});

test('editing an inactive schedule anchors its frozen span at the new effective date',()=>{
  for(const status of ['paused','completed']){
    let s=save(domain.createState(today));
    s=save(s,{effectiveDate:'2026-09-18',status});
    s=save(s,{effectiveDate:today,endDate:'2026-09-07',status});
    const p=domain.goalSummary(s,'s',today).period;
    assert.deepEqual(p,{from:today,to:'2026-10-12',days:7,index:6});
    assert.deepEqual(domain.goalPeriods(s,'s',today)[0].period,p);
    assert.equal(domain.linkedActivityGoals(s,'thesis',today).length,0);
  }
});
