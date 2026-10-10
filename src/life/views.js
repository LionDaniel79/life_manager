import { LEVELS, goalVersion, goalSummary, goalPeriods, activeLink, dailyGoalStatus, linkedActivityGoals, listedGoals, goalIsDeleted, retainedPathForEntry } from './domain.js';
import { esc, duration, number, progress, option } from './ui.js';
const status={active:'진행',paused:'잠시 멈춤',completed:'완료',archived:'보관'};
export const action=(label,type,id='',css='secondary-button')=>`<button type="button" class="${css}" data-life="${type}" data-id="${esc(id)}">${label}</button>`;

export function goalCard(s,id,date,editable=false) {
  const {goal:g,version:v,minutes,percent,result,resultPercent,period}=goalSummary(s,id,date);
  if(!v||goalIsDeleted(g,date))return '';
  const archived=v.status==='archived';
  const parent=s.links.find(l=>l.kind==='hierarchy'&&l.fromId===id&&activeLink(l,date));
  const parentName=parent?goalVersion(s.goals.find(g=>g.id===parent.toId),date)?.title:'';
  const numeric=v.resultTarget!==null;
  const numericHtml=numeric?`<div class="life-goal-metric"><div class="life-row life-measure"><b>${result?`${number(result.value)} ${esc(v.resultUnit)}`:'미측정'}</b><span>/ 목표 ${number(v.resultTarget)} ${esc(v.resultUnit)}${resultPercent===null?'':` · ${number(resultPercent)}%`}</span></div>${resultPercent===null?'':progress(resultPercent,`${v.title} 숫자 목표 진척`)}<p class="life-caption">시작 ${number(v.resultStart??0)} → 목표 ${number(v.resultTarget)} ${esc(v.resultUnit)}${result?` · ${result.date}`:''}</p></div>`:'';
  const timeHtml=numeric&&percent===null?`<span class="life-caption">연결 시간 ${duration(minutes)}</span>`:`<div class="life-goal-metric"><div class="life-row life-measure"><b>${duration(minutes)}</b><span>${percent===null?(period?'기간 내 시간':'누적 시간'):`/ ${duration(v.targetMinutes)} · ${number(percent)}%`}</span></div>${percent===null?'':progress(percent,`${v.title} 시간 진척`)}</div>`;
  const daily=v.dailyMinutes?`<span class="life-caption">오늘 실행 ${duration(dailyGoalStatus(s,id,date).find(day=>day.date===date)?.minutes||0)} / ${duration(v.dailyMinutes)}</span>`:'';
  const controls=`${action('상세','detail',id,'text-button')}${numeric&&!archived?action('현재값 기록','result',id,'text-button'):''}${editable?`${action(archived?'보관 해제·수정':'수정·연결','edit',id,'text-button')}${!archived?action(s.homeGoalIds.includes(id)?'대시보드에서 숨김':'대시보드에 표시','home.toggle',id,'text-button'):''}${!archived&&s.homeGoalIds.includes(id)?`<span class="life-goal-order">${action('↑','home.up',id,'text-button')}${action('↓','home.down',id,'text-button')}</span>`:''}`:''}`;
  return `<article class="life-goal${editable?' life-goal-editable':''}" data-goal-id="${esc(id)}">
    <div class="life-goal-heading"><div class="life-row"><span class="badge">${LEVELS[g.level]}</span><strong>${esc(v.title)}</strong><span class="muted life-status">${status[v.status]}</span></div>${period?`<p class="life-caption life-repeat-period">${period.days}일 반복 · ${period.from} ~ ${period.to}</p>`:''}${parentName?`<p class="life-caption">상위: ${esc(parentName)}</p>`:''}${v.nextAction?`<p class="life-caption life-next">다음: ${esc(v.nextAction)}</p>`:''}</div>
    <div class="life-goal-metrics">${g.level==='life'?`<p class="life-caption life-direction">${esc(v.reason||'삶의 방향')}</p><span class="life-caption">연결 시간 ${duration(minutes)}</span>`:`${numericHtml}${timeHtml}${daily}`}</div>
    <div class="life-actions life-goal-actions">${controls}</div>
  </article>`;
}
export function home(s,date) {
  const visible=new Set(listedGoals(s,date).map(g=>g.id));
  const ids=s.homeGoalIds.filter(id=>visible.has(id));
  return `<div class="section-title"><h2>나의 목표</h2>${action('목표설정','goals','','text-button')}</div>${ids.length?`<div class="life-grid">${ids.map(id=>goalCard(s,id,date)).join('')}</div>`:'<p class="life-notice">대시보드에 표시할 목표를 목표설정에서 선택하세요.</p>'}`;
}
export function goals(s,date) {
  const current=listedGoals(s,date),archived=listedGoals(s,date,true);
  const cards=Object.keys(LEVELS).flatMap(level=>current.filter(g=>g.level===level).map(g=>goalCard(s,g.id,date,true))).join('');
  return `<div class="section-title"><h2>삶의 방향과 목표</h2>${action('새 목표','new','','primary-button')}</div><p class="muted life-caption">생애 목표에는 장기·중기·단기와 기본 항목을 연결할 수 있습니다. 단기 목표는 장기에도 직접 연결할 수 있습니다.</p><div class="life-grid">${cards||'<p>목표를 만들고 시간 기록 항목이나 숫자 기준을 설정하세요.</p>'}</div><details class="life-archive"><summary>보관 목표 · ${archived.length}개</summary><div class="life-grid">${archived.map(g=>goalCard(s,g.id,date,true)).join('')||'<p>보관한 목표가 없습니다.</p>'}</div></details>`;
}
export function detail(s,id,date) {
  const g=s.goals.find(g=>g.id===id),v=goalVersion(g,date),r=goalSummary(s,id,date);
  if(!v||goalIsDeleted(g,date))return `<h2 id="life-dialog-title">삭제된 목표</h2>${action('닫기','close')}`;
  const links=s.links.filter(l=>(l.toId===id||l.fromId===id)&&activeLink(l,date));
  const results=s.results.filter(x=>x.goalId===id).toSorted((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
  return `<h2 id="life-dialog-title">${esc(v.title)}</h2>${goalCard(s,id,date)}<p>${esc(v.reason)}</p>${r.period?`<p class="life-caption">전체 연결 시간 ${duration(r.totalMinutes)} · 이 카드의 진척은 표시된 반복 기간 기준입니다.</p>`:''}${repeatHistory(s,id,date)}<h3>현재 연결</h3><ul>${links.map(l=>`<li>${esc(l.kind==='activity'?s.categories.find(c=>c.id===l.fromId)?.name:goalVersion(s.goals.find(g=>g.id===l.fromId),date)?.title)} → ${esc(goalVersion(s.goals.find(g=>g.id===l.toId),date)?.title)} · ${l.validFrom}부터</li>`).join('')||'<li>연결 없음</li>'}</ul><p>${r.period?'표시 기간의':'반영된'} 시간 기록 ${r.entries.length}건 · 목표를 수정하면 적용일 전 기록은 당시 연결에 남습니다.</p>${results.length?`<details><summary>숫자 기록 이력 · ${results.length}건</summary><ul>${results.map(x=>{const unit=g.versions.find(v=>v.metricKey===x.metricKey)?.resultUnit||'';return `<li>${x.date} · ${number(x.value)} ${esc(unit)}${x.note?` · ${esc(x.note)}`:''}</li>`;}).join('')}</ul></details>`:''}<details><summary>기준 변경 이력</summary><ul>${g.versions.toReversed().map(x=>`<li>${x.effectiveDate} · ${esc(x.title)}${x.repeat?` · 기간 반복 (${x.startDate} ~ ${x.endDate} 기준)`:''} · ${x.targetMinutes===null?'시간 목표 없음':duration(x.targetMinutes)}${x.resultTarget===null?'':` · ${number(x.resultStart??0)} → ${number(x.resultTarget)} ${esc(x.resultUnit)}`}${x.changeNote?` · ${esc(x.changeNote)}`:''}</li>`).join('')}</ul></details><div class="life-actions">${action('닫기','close')}${action(v.status==='archived'?'보관 해제·수정':'수정·연결','edit',id)}${v.status==='archived'?'':action('보관','goal.archive',id)}${action('목표 삭제','goal.delete',id,'text-button life-danger')}</div>`;
}
function repeatHistory(s,id,date) {
  const rows=goalPeriods(s,id,date);
  if(!rows.length)return '';
  return `<details><summary>반복 기간별 기록 · 최근 ${rows.length}회</summary><p class="life-caption">기간별 기준으로 집계합니다. 원본 시간을 수정하면 해당 기간에 반영됩니다.</p><div class="life-period-history">${rows.map(r=>`<div class="life-period-row"><div><strong>${r.period.from} ~ ${r.period.to}</strong><p class="life-caption">${r.entries.length?'시간 기록 있음':'시간 기록 없음'}${r.period.to>=date?' · 진행 기간':''}</p></div><div>${duration(r.minutes)}${r.percent===null?'':` / ${duration(r.version.targetMinutes)} · ${number(r.percent)}%${progress(r.percent,'기간별 시간 진척')}`}${r.version.resultTarget===null?'':`<p class="life-caption">${r.result?`${number(r.result.value)} / ${number(r.version.resultTarget)} ${esc(r.version.resultUnit)}${r.resultPercent===null?'':` · ${number(r.resultPercent)}%`}`:'숫자 미측정'}</p>`}</div></div>`).join('')}</div></details>`;
}
export function attribution(s) {
  const rows=s.entries.map(entry=>{
    const choices=linkedActivityGoals(s,entry.categoryId,entry.date);
    const assignment=s.assignments.find(a=>a.entryId===entry.id);
    const retained=retainedPathForEntry(s,entry);
    const invalid=Boolean(!retained&&assignment?.goalId&&!choices.some(g=>g.id===assignment.goalId));
    return {entry,choices,assignment,invalid,retained};
  }).filter(row=>row.choices.length>1||row.invalid||row.retained).toReversed();
  if(!rows.length)return '';
  const pending=rows.filter(row=>!row.retained&&(!row.assignment||row.invalid)).length;
  return `<details class="card"><summary>목표별 시간 배정 · ${pending}건 선택 필요</summary><p class="muted">반영할 목표를 직접 선택할 수 있습니다. 보관·삭제 전에 기록한 시간은 기존 배정을 보존하며, 여기서 변경하면 선택한 목표에 반영됩니다. 원래 시간 기록은 유지됩니다.</p><div class="life-record-list">${rows.map(({entry:e,choices,invalid,retained})=>{const preserved=retained&&!choices.some(g=>g.id===e.goalId),g=preserved?s.goals.find(g=>g.id===e.goalId):null;return `<label class="life-assignment">${e.date} · ${esc(e.categoryName)} · ${duration(e.durationMinutes)}<select data-life-assignment="${esc(e.id)}">${invalid?'<option value="__relink__" selected disabled>이전 연결 종료 · 다시 선택</option>':''}${preserved?`<option value="${esc(e.goalId)}" selected disabled>${LEVELS[g.level]} · ${esc(goalVersion(g,e.date).title)} (기존 배정 보존)</option>`:''}${option('','배정하지 않음',invalid?'__relink__':e.goalId||'')}${choices.map(g=>option(g.id,`${LEVELS[g.level]} · ${goalVersion(g,e.date).title}`,invalid?'__relink__':e.goalId)).join('')}</select></label>`;}).join('')}</div></details>`;
}
export function statistics(s,date) {
  const current=listedGoals(s,date).filter(g=>g.level!=='life');
  return `<div class="section-title"><h2>목표 진행 · ${date} 기준</h2><span>${current.filter(g=>goalVersion(g,date).status==='completed').length} / ${current.length}개 완료</span></div><div class="life-grid">${current.map(g=>goalCard(s,g.id,date)).join('')||'<p>목표를 설정하면 시간과 숫자 목표의 진척이 표시됩니다.</p>'}</div>`;
}
export const settings=()=>`<section class="card"><h2>데이터 관리</h2><p>시간·예산과 목표는 기존 Google 계정에 저장됩니다.</p><p class="muted">시간 기록은 오프라인 저장을 지원합니다. 목표 변경은 인터넷 연결 후 저장하세요.</p><div class="life-actions">${action('목표 데이터 백업','backup')}${action('전체 데이터 내보내기','export-all')}<label class="secondary-button">목표 백업 복원<input type="file" id="life-import" accept="application/json,.json" hidden></label>${action('목표 새로 불러오기','refresh')}</div><p class="muted life-caption">목표 백업 복원은 시간 기록·시간 예산을 변경하지 않습니다. 전체 내보내기는 보관용입니다.</p></section><h2>시간 기록 항목 관리</h2>`;
