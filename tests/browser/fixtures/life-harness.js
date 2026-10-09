import '/src/app-shell.js';
import '/src/life/feature.js';
import '/src/time-budget-feature.js';
import '/src/record-feature.js';
import '/src/history-feature.js';
import '/src/category-feature.js';
import { createStatisticsFeature } from '/src/statistics-feature.js';
import { getWeekRange, toDateKey } from '/src/domain.js';
const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(`weekly-time-budget:${name}`,{detail}));
document.querySelector('#login-view').classList.add('hidden');document.querySelector('#app-view').classList.remove('hidden');
const date=toDateKey(new Date()),week=getWeekRange().start;
const categories=[{id:'reading',name:'독서',order:1,goalType:'growth'},{id:'phone',name:'휴대폰',order:2,goalType:'restraint'}];
const h=window.__lifeHarness={date,failLoad:false,saves:0,entries:[{id:'e1',date,categoryId:'reading',durationMinutes:60,source:'manual-duration'},{id:'e2',date:'2025-08-03',categoryId:'reading',durationMinutes:30},{id:'e3',date:'2026-09-03',categoryId:'reading',durationMinutes:40}],ui:{activeRecordTab:'manual',manualInputMode:'duration',manualCategoryId:'reading'}};
const budgets={weeklyBudgets:[{weekStart:week,budgets:{reading:420,phone:210},explicitBudgetIds:['reading','phone'],userModified:true,defaultSourceVersion:'previous-results-v3'}],dailyBudgets:[{date,overrides:{reading:60,phone:30},userModified:true,defaultSourceVersion:'previous-results-v3'}]};
let goalData=JSON.parse(localStorage.getItem('life-test-state')||'null');
const source={
  async loadLifeData(){h.loadCalls=(h.loadCalls||0)+1;if(h.failLoad)throw Error('offline');const snapshot=structuredClone(goalData);if(h.deferLoad)return new Promise(resolve=>(h.pendingLoads||=[]).push(()=>resolve(snapshot)));return snapshot;},
  async saveLifeData(uid,state,expected){if(expected!==(goalData?.revision||0))throw Error('다른 화면에서 목표가 변경되었습니다.');goalData={...structuredClone(state),entries:[],budgets:[],timer:null,revision:expected+1};localStorage.setItem('life-test-state',JSON.stringify(goalData));h.saves++;return structuredClone(goalData);},
  async loadTimeBudgetData(){return structuredClone(budgets);},invalidate(){},
  async ensureCurrentWeekBudget(){},async saveDailyBudgetSnapshot(){},
  async saveDailyBudget(uid,date,overrides){budgets.dailyBudgets=[{date,overrides,userModified:true,defaultSourceVersion:'previous-results-v3'}];},
  async saveWeeklyBudget(uid,weekStart,values,ids){budgets.weeklyBudgets=[{weekStart,budgets:values,explicitBudgetIds:ids,userModified:true,defaultSourceVersion:'previous-results-v3'}];},
};
const runtime={mergedEntries:async()=>h.entries,store:{getSnapshot:async()=>structuredClone(budgets),patchSnapshot:async()=>{}}};
const feature=createStatisticsFeature({root:document.querySelector('#statistics-view'),getCurrentUser:()=>({uid:'fixture'}),dataSource:{async load(uid,{onServer}){const result={data:{entries:h.entries,activeCategories:categories,archivedCategories:[],weeklyBudgets:budgets.weeklyBudgets},dataVersion:`test:${h.entries.length}`,source:'server'};await onServer(result);return result;}}});
document.addEventListener('weekly-time-budget:view-changed',event=>{if(event.detail.view==='statistics')void feature.enter();else feature.leave();});
h.publish=()=>{
  emit('infrastructure-state',{user:{uid:'fixture'},userDataReady:true,categories,archivedCategories:[],entries:h.entries,remoteEntries:h.entries,dataSource:source,offlineRuntime:runtime});
  emit('record-state',{categories,...h.ui,onUiChange:patch=>Object.assign(h.ui,patch),onSaveEntry:async entry=>{h.entries.unshift({...entry,id:crypto.randomUUID()});h.publish();return {status:'synced'};}});
  emit('history-state',{categories,entries:h.entries,onDelete:id=>{h.entries=h.entries.filter(e=>e.id!==id);h.publish();}});
  emit('category-state',{categories,archivedCategories:[],onSave:async({id,payload})=>{const existing=categories.find(c=>c.id===id);if(existing)Object.assign(existing,payload);else categories.push({id:crypto.randomUUID(),...payload});h.publish();}});
};
h.switchUser=uid=>emit('infrastructure-state',{user:{uid},userDataReady:true,categories:[],entries:[],dataSource:{...source,loadLifeData:async()=>null},offlineRuntime:runtime});
h.publish();h.ready=true;
