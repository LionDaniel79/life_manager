import { LEVELS, goalVersion, goalSummary, activeLink, dailyGoalStatus, linkedShortGoals } from './domain.js';
import { esc, duration, number, progress, option } from './ui.js';
const status={active:'진행',paused:'잠시 멈춤',completed:'완료',archived:'보관'};
export const action=(label,type,id='',css='secondary-button')=>`<button type="button" class="${css}" data-life="${type}" data-id="${esc(id)}">${label}</button>`;
export function goalCard(s,id,date,editable=false) {
  const {goal:g,version:v,minutes,percent,result}=goalSummary(s,id,date);if(!v)return '';
  const parent=s.links.find(l=>l.kind==='hierarchy'&&l.fromId===id&&activeLink(l,date));
  const parentName=parent?goalVersion(s.goals.find(g=>g.id===parent.toId),date)?.title:'';
  return `<article class="life-goal" data-goal-id="${esc(id)}"><div class="life-row"><span class="badge">${LEVELS[g.level]}</span><strong>${esc(v.title)}</strong><span class="muted life-status">${status[v.status]}</span></div>${parentName?`<p class="life-caption">상위: ${esc(parentName)}</p>`:''}${g.level==='life'?`<p>${esc(v.reason||'삶의 방향')}</p>`:`<div class="life-row"><b>${duration(minutes)}</b><span>${percent===null?'누적 시간':`/ ${duration(v.targetMinutes)} · ${number(percent)}%`}</span></div>${percent===null?'':progress(percent,`${v.title} 시간 진척`)}${v.resultTarget===null?'':`<p class="life-caption">결과: ${result?`${number(result.value)} ${esc(v.resultUnit)}`:'미측정'} / ${number(v.resultTarget)} ${esc(v.resultUnit)}</p>`}${v.dailyMinutes?`<p class="life-caption">오늘 실행 ${duration(dailyGoalStatus(s,id,date).find(day=>day.date===date)?.minutes||0)} / ${duration(v.dailyMinutes)}</p>`:''}`} ${v.nextAction?`<p class="life-caption">다음: ${esc(v.nextAction)}</p>`:''}<div class="life-actions">${action('상세','detail',id,'text-button')}${editable?`${action('수정·연결','edit',id,'text-button')}${action(s.homeGoalIds.includes(id)?'오늘에서 숨김':'오늘에 표시','home.toggle',id,'text-button')}${s.homeGoalIds.includes(id)?action('↑','home.up',id,'text-button')+action('↓','home.down',id,'text-button'):''}`:''}</div></article>`;
}
export function home(s,date) {
  return `<div class="section-title"><h2>나의 목표</h2>${action('목표 설정','goals','','text-button')}</div>${s.homeGoalIds.length?`<div class="life-grid">${s.homeGoalIds.map(id=>goalCard(s,id,date)).join('')}</div>`:'<p class="life-notice">오늘 떠올리고 싶은 목표를 목표 설정에서 선택하세요.</p>'}`;
}
export function goals(s,date) {
  return `<div class="section-title"><h2>삶의 방향과 목표</h2>${action('새 목표','new','','primary-button')}</div><p class="muted life-caption">생애 → 장기 → 중기 → 단기 → 활동 · 직접 연결한 항목의 시간이 목표에 쌓입니다.</p><div class="life-grid">${Object.keys(LEVELS).flatMap(level=>s.goals.filter(g=>g.level===level).map(g=>goalCard(s,g.id,date,true))).join('')||'<p>목표를 만들고 시간 기록 항목을 연결하세요.</p>'}</div><h2 class="life-budget-heading">일간·주간 시간 예산</h2>`;
}
export function detail(s,id,date) {
  const g=s.goals.find(g=>g.id===id),v=goalVersion(g,date),r=goalSummary(s,id,date);
  const links=s.links.filter(l=>(l.toId===id||l.fromId===id)&&activeLink(l,date));
  return `<h2 id="life-dialog-title">${esc(v.title)}</h2>${goalCard(s,id,date)}<p>${esc(v.reason)}</p><h3>현재 연결</h3><ul>${links.map(l=>`<li>${esc(l.kind==='activity'?s.categories.find(c=>c.id===l.fromId)?.name:goalVersion(s.goals.find(g=>g.id===l.fromId),date)?.title)} → ${esc(goalVersion(s.goals.find(g=>g.id===l.toId),date)?.title)} · ${l.validFrom}부터</li>`).join('')||'<li>연결 없음</li>'}</ul><p>반영된 시간 기록 ${r.entries.length}건 · 목표를 수정하면 적용일 전 기록은 당시 연결에 남습니다.</p>${v.resultTarget===null?'':action('결과 갱신','result',id)}<h3>기준 변경 이력</h3><ul>${g.versions.toReversed().map(x=>`<li>${x.effectiveDate} · ${esc(x.title)} · ${x.targetMinutes===null?'시간 목표 없음':duration(x.targetMinutes)}${x.changeNote?` · ${esc(x.changeNote)}`:''}</li>`).join('')}</ul><div class="life-actions">${action('닫기','close')}${action('수정·연결','edit',id)}</div>`;
}
export function attribution(s) {
  const rows=s.entries.map(entry=>{
    const choices=linkedShortGoals(s,entry.categoryId,entry.date);
    const assignment=s.assignments.find(a=>a.entryId===entry.id);
    const invalid=Boolean(assignment?.goalId&&!choices.some(g=>g.id===assignment.goalId));
    return {entry,choices,assignment,invalid};
  }).filter(row=>row.choices.length>1||row.invalid).toReversed();
  if(!rows.length)return '';
  const pending=rows.filter(row=>!row.assignment||row.invalid).length;
  return `<details class="card"><summary>목표별 시간 배정 · ${pending}건 선택 필요</summary><p class="muted">목표가 여러 개이거나 이전 연결이 바뀐 기록입니다. 반영할 목표를 직접 선택하세요. 원래 시간 기록은 유지됩니다.</p><div class="life-record-list">${rows.map(({entry:e,choices,invalid})=>`<label class="life-assignment">${e.date} · ${esc(e.categoryName)} · ${duration(e.durationMinutes)}<select data-life-assignment="${esc(e.id)}">${invalid?'<option value="__relink__" selected disabled>이전 연결 종료 · 다시 선택</option>':''}${option('','배정하지 않음',invalid?'__relink__':e.goalId||'')}${choices.map(g=>option(g.id,goalVersion(g,e.date).title,invalid?'__relink__':e.goalId)).join('')}</select></label>`).join('')}</div></details>`;
}
export function statistics(s,date) {
  const current=s.goals.filter(g=>g.level!=='life'&&goalVersion(g,date));
  const weights=s.weights.toSorted((a,b)=>b.date.localeCompare(a.date));
  const latest=weights[0], prior=weights[1];
  return `<div class="section-title"><h2>목표 진행 · ${date} 기준 누적</h2><span>${current.filter(g=>goalVersion(g,date).status==='completed').length} / ${current.length}개 완료</span></div><div class="life-grid">${current.map(g=>goalCard(s,g.id,date)).join('')||'<p>목표를 설정하면 누적 진척이 표시됩니다.</p>'}</div><div class="life-grid life-secondary"><section class="card"><div class="section-title"><h2>체중 기록</h2>${action('체중 기록','weight')}</div><p>${latest?`<strong>${latest.kg} kg</strong> · ${latest.date}${prior?` · 이전 측정 대비 ${number(latest.kg-prior.kg)} kg`:''}`:'실제 측정한 체중을 기록하세요.'}</p><details><summary>측정 이력 ${weights.length}건</summary><ul>${weights.map(w=>`<li>${w.date} · ${w.kg} kg · ${esc(w.note)} ${action('삭제','weight.delete',w.id,'text-button')}</li>`).join('')}</ul></details></section><section class="card"><div class="section-title"><h2>주간 점검</h2>${action('점검 기록','review')}</div>${s.reviews.toReversed().slice(0,8).map(r=>`<details><summary>${r.date} · ${esc(r.next||'점검')}</summary><p>계속: ${esc(r.keep)}</p><p>조정: ${esc(r.adjust)}</p><p>다음: ${esc(r.next)}</p><ul>${r.snapshot.map(g=>`<li>${esc(g.title)} · 당시 ${duration(g.minutes)}${g.targetMinutes===null?'':` / ${duration(g.targetMinutes)}`}</li>`).join('')}</ul></details>`).join('')||'<p>실행을 돌아보고 다음 목표에 반영하세요.</p>'}</section></div>`;
}
export const settings=()=>`<section class="card"><h2>데이터 관리</h2><p>기존 시간·예산은 기존 Google 계정에 저장됩니다. 목표·체중·점검은 같은 계정의 별도 공간에 저장됩니다.</p><p class="muted">시간 기록은 오프라인 저장을 지원합니다. 목표 변경은 인터넷 연결 후 저장하세요.</p><div class="life-actions">${action('목표·체중·점검 백업','backup')}${action('전체 데이터 내보내기','export-all')}<label class="secondary-button">목표 백업 복원<input type="file" id="life-import" accept="application/json,.json" hidden></label>${action('목표 새로 불러오기','refresh')}</div><p class="muted life-caption">목표 백업 복원은 시간 기록·시간 예산을 변경하지 않습니다. 전체 내보내기는 보관용입니다.</p></section><h2>시간 기록 항목 관리</h2>`;
