import { localDate, goalVersion, goalPeriod, addDays } from './domain.js';
import { hydrateLife, persistLife, applyLife, validateLife } from './model.js';
import { goalForm, linkFields, resultForm } from './forms.js';
import { home, goals, detail, attribution, statistics, settings, action } from './views.js';
import { esc } from './ui.js';
import { showToast } from '../app-toast.js';

let infra={}, saved=null, state=hydrateLife(null), userId=null, ready=false, busy=false, loading=false, generation=0, notice='';
let renderedDate=localDate();
const dialog=document.createElement('dialog');
dialog.id='life-dialog'; dialog.className='life-panel'; dialog.setAttribute('aria-labelledby','life-dialog-title'); document.body.append(dialog);
const cacheKey=uid=>`life-manager-goals:${uid}`;
const panels=['life-home','life-goals','life-attribution','life-statistics','life-settings'];
function cache(){try{localStorage.setItem(cacheKey(userId),JSON.stringify(saved));}catch{/* The cloud write is confirmed even if local cache is unavailable. */}}
function toast(message,error=false){showToast({type:error?'error':'success',title:message});}
function render() {
  state=hydrateLife(saved,infra);
  const date=localDate();
  const dateChanged=date!==renderedDate;
  renderedDate=date;
  const html=[home(state,date),goals(state,date),attribution(state),statistics(state,date),settings()];
  panels.forEach((id,i)=>{const el=document.getElementById(id);if(el)el.innerHTML=html[i];});
  const detailId=dateChanged&&dialog.open&&!dialog.querySelector('form')?dialog.querySelector('[data-goal-id]')?.dataset.goalId:null;
  if(detailId)dialog.innerHTML=detail(state,detailId,date);
  document.querySelectorAll('.life-sync').forEach(el=>{el.innerHTML=`<span role="status">${esc(busy?'목표 저장 중…':loading?'목표 불러오는 중…':notice||'목표 동기화 완료')}</span>${!ready&&!loading?action('다시 불러오기','refresh','','text-button'):''}`;});
  document.querySelectorAll('[data-life]:not([data-life="refresh"]):not([data-life="close"]):not([data-life="goals"]):not([data-life="detail"]):not([data-life="backup"]):not([data-life="export-all"]), [data-life-assignment]').forEach(el=>{el.disabled=!ready||busy||loading;});
  document.querySelectorAll('[data-life="refresh"]').forEach(el=>{el.disabled=busy||loading;});
}
async function refresh() {
  if (!userId||!infra.dataSource?.loadLifeData||loading||busy) return;
  const current=userId,token=generation; loading=true; render();
  try {
    const remote=await infra.dataSource.loadLifeData(current);
    if(current!==userId||token!==generation)return;
    if((remote?.revision||0)<(saved?.revision||0))throw Error('확인한 저장보다 이전 자료를 받았습니다. 잠시 후 다시 불러와 주세요.');
    saved=remote; ready=true; notice=''; if(saved)cache();
  }catch(error){if(current===userId&&token===generation){ready=false;notice=`목표를 불러오지 못했습니다. ${error.message} 저장된 목표를 읽기만 할 수 있습니다.`;}}
  finally{if(current===userId&&token===generation){loading=false;render();}}
}
async function commit(change, replacement=null) {
  if(!ready||!userId||loading)throw Error('목표를 새로 불러온 후 인터넷에 연결된 상태에서 저장하세요.');
  if(busy)throw Error('이전 저장을 마친 뒤 다시 시도하세요.');
  const current=userId,token=generation,expected=state.revision;
  const next=replacement||applyLife(state,change);
  const source=infra.dataSource; busy=true; render();
  dialog.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
  try{
    const confirmed=await source.saveLifeData(current,next,expected);
    if(current!==userId||token!==generation)throw Error('로그인 계정이 바뀌었습니다.');
    saved=confirmed;cache();notice='';
  }finally{
    if(current===userId&&token===generation){busy=false;render();dialog.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);}
  }
}
function open(html){dialog.innerHTML=html;if(!dialog.open)dialog.showModal();repeatSettings();impact();}
function repeatSettings() {
  const form=dialog.querySelector('[data-life-form="goal"]');if(!form)return;
  const short=form.elements.level.value==='short',repeat=short&&form.elements.repeat.checked;
  form.querySelector('#life-repeat').hidden=!short;
  form.elements.repeat.disabled=!short;
  form.elements.endDate.required=repeat;
  form.elements.startDate.closest('label').firstChild.textContent=repeat?'반복 기준 시작일':'목표 시작일';
  form.elements.endDate.closest('label').firstChild.textContent=repeat?'반복 기준 종료일':'목표 종료일 (선택)';
  const start=form.elements.startDate.value,end=form.elements.endDate.value;
  const days=start&&end?Math.round((Date.parse(end)-Date.parse(start))/86400000)+1:0;
  const period=repeat&&days>0?goalPeriod({level:'short',versions:[{effectiveDate:localDate(),startDate:start,endDate:end,repeat:true,status:'active'}]}):null;
  form.querySelector('#life-repeat-help').textContent=repeat&&days>0
    ? `${days}일 간격 · ${period.from>localDate()?'첫':'현재'} 기간: ${period.from} ~ ${period.to} · 다음: ${addDays(period.to,1)} ~ ${addDays(period.to,days)}. 시간·숫자 목표는 매 기간의 기준입니다.`
    : repeat?'반복할 기간의 시작일과 종료일을 입력하세요.':'반복을 켜면 설정한 기간의 길이만큼 계속 이어집니다.';
}
function impact(){const f=dialog.querySelector('[data-life-form="goal"]');if(!f)return;const date=f.elements.effectiveDate.value;const count=state.entries.filter(e=>e.date>=date).length;f.querySelector('#life-impact').textContent=`${date} 이후 기록 ${count}건이 있습니다. 연결된 활동·목표 기간에 맞는 기록만 반영됩니다. 여러 중기·단기 목표가 겹치면 시간기록 메뉴에서 직접 배정합니다.`;}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

document.addEventListener('weekly-time-budget:infrastructure-state',event=>{
  const next=event.detail||{},uid=next.user?.uid||null;
  const changed=uid!==userId;
  infra=next;
  if(changed){generation++;userId=uid;saved=null;ready=false;busy=false;loading=false;notice='';dialog.close();if(uid){try{const cached=JSON.parse(localStorage.getItem(cacheKey(uid)));if(cached){validateLife(cached);saved=cached;}}catch{notice='목표 캐시를 읽지 못했습니다. 서버에서 다시 가져옵니다.';}}}
  render();if(changed||(!ready&&!loading&&!notice))void refresh();
});
document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-life]');if(!b)return;
  const type=b.dataset.life,id=b.dataset.id,date=localDate();
  try{
    if(type==='close'){dialog.close();return;}
    if(type==='goals'){document.querySelector('nav [data-view="goals"]')?.click();return;}
    if(type==='refresh'){await refresh();return;}
    if(type==='new'){open(goalForm(state,'',date));return;}
    if(type==='edit'){open(goalForm(state,id,date));return;}
    if(type==='detail'){open(detail(state,id,date));return;}
    if(type==='result'){open(resultForm(state,id,date));return;}
    if(type==='goal.archive'){await commit({type,id});dialog.close();toast('보관 영역으로 옮겼습니다.');return;}
    if(type==='goal.delete'){
      if(confirm('이 목표를 삭제할까요? 시간 기록과 하위 목표는 유지됩니다.')){await commit({type,id});dialog.close();toast('목표를 삭제했습니다.');}
      return;
    }
    if(type==='home.toggle'){await commit({type,id});return;}
    if(type==='home.up'||type==='home.down'){await commit({type:'home.move',id,direction:type==='home.up'?-1:1});return;}
    if(type==='backup'){download({format:'life-manager-goals-v1',exportedAt:new Date().toISOString(),state:persistLife(state)},`life-goals-${date}.json`);return;}
    if(type==='export-all'){
      const current=userId,source=infra.dataSource,snapshot=structuredClone({categories:infra.categories,archivedCategories:infra.archivedCategories,entries:infra.entries,life:persistLife(state)});
      const budgets=await source.loadTimeBudgetData(current);
      if(current!==userId)throw Error('로그인 계정이 바뀌었습니다.');
      download({format:'life-manager-export-v1',exportedAt:new Date().toISOString(),...snapshot,...budgets},`life-manager-${date}.json`);return;
    }
  }catch(error){toast(error.message,true);}
});
document.addEventListener('change',async event=>{
  const el=event.target,form=el.closest('[data-life-form="goal"]');
  if(form){
    if(['level','effectiveDate'].includes(el.name)){form.querySelector('#life-links').innerHTML=linkFields(state,form.elements.level.value,form.elements.id.value,form.elements.effectiveDate.value);form.querySelector('#life-measures').hidden=form.elements.level.value==='life';impact();}
    if(['level','repeat','startDate','endDate'].includes(el.name))repeatSettings();
  }
  if(el.dataset.lifeAssignment){try{await commit({type:'assignment.save',entryId:el.dataset.lifeAssignment,goalId:el.value||null});}catch(error){toast(error.message,true);render();}}
  if(el.id==='life-import'&&el.files[0]){
    try{
      if(el.files[0].size>850000)throw Error('백업 파일이 너무 큽니다.');
      const backup=JSON.parse(await el.files[0].text());
      if(backup.format!=='life-manager-goals-v1')throw Error('목표 백업 파일을 선택하세요.');
      validateLife(backup.state);
      if(confirm(`현재 목표 데이터를 백업으로 교체할까요? 시간 기록과 시간 예산은 유지됩니다.`)){await commit(null,persistLife(backup.state));toast('목표 백업을 복원했습니다.');}
    }catch(error){toast(error.message,true);}finally{el.value='';}
  }
});
dialog.addEventListener('submit',async event=>{
  const form=event.target;if(!form.dataset.lifeForm)return;event.preventDefault();
  const data=new FormData(form),a=Object.fromEntries(data),type=form.dataset.lifeForm;
  try{
    if(type==='goal'){
      const parentId=a.parentId||'',categoryIds=data.getAll('categoryIds'),childIds=data.getAll('childIds');
      if((parentId||categoryIds.length||childIds.length)&&!a.confirmLinks)throw Error('선택한 연결 적용란을 확인하세요.');
      if((a.effectiveDate<localDate()||state.entries.some(e=>e.date>=a.effectiveDate))&&!a.confirmRetroactive)throw Error('기존 기록 집계에 미치는 영향을 확인해 주세요.');
      await commit({type:'goal.save',...a,parentId,categoryIds,childIds,repeat:a.level==='short'&&a.repeat==='yes',targetMinutes:a.hours===''?null:Number(a.hours)*60,showHome:!!a.showHome,confirmRetroactive:!!a.confirmRetroactive});
    }else await commit({type:`${type}.save`,...a});
    dialog.close();toast('저장했습니다.');
  }catch(error){form.querySelector('.life-error').textContent=error.message;}
});
window.addEventListener('online',()=>{if(!dialog.open&&!busy)void refresh();});
window.addEventListener('focus',()=>{if(!dialog.open&&!busy)void refresh();});
function refreshDate(){if(localDate()!==renderedDate)render();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate();});
document.addEventListener('weekly-time-budget:view-changed',refreshDate);
setInterval(refreshDate,60000);
render();
