import { LEVELS, canParent, goalVersion, goalSummary, activeLink, canLinkActivity } from './domain.js';
import { esc, input, textarea, checkbox, option } from './ui.js';
const select=(label,name,options)=>`<label>${label}<select name="${name}">${options}</select></label>`;
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
export const shell=(title,type,fields)=>`<h2 id="life-dialog-title">${esc(title)}</h2><form data-life-form="${type}">${fields}<p class="life-error" role="alert"></p><div class="life-actions"><button type="button" class="secondary-button" data-life="close">취소</button><button class="primary-button" type="submit">저장</button></div></form>`;
export function linkFields(s,level,id,date) {
  const links=s.links.filter(l=>activeLink(l,date));
  const parent=links.find(l=>l.kind==='hierarchy'&&l.fromId===id)?.toId||'';
  const available=g=>!g.deletedDate&&goalVersion(g,date)&&goalVersion(g,date).status!=='archived';
  const parents=s.goals.filter(g=>canParent(level,g.level)&&available(g));
  const parentLevels=['medium','long','life'].filter(type=>canParent(level,type));
  const parentOptions=parentLevels.length>1?parentLevels.map(type=>`<optgroup label="${LEVELS[type]} 목표">${parents.filter(g=>g.level===type).map(g=>option(g.id,goalVersion(g,date).title,parent)).join('')}</optgroup>`).join(''):parents.map(g=>option(g.id,goalVersion(g,date).title,parent)).join('');
  const parentField=level==='life'?'':select('상위 목표','parentId',option('','연결하지 않음',parent)+parentOptions);
  const childFields=Object.keys(LEVELS).filter(type=>canParent(type,level)).map(type=>{
    const children=s.goals.filter(g=>g.level===type&&available(g));
    return `<fieldset><legend>하위 ${LEVELS[type]} 목표</legend>${children.length?children.map(g=>{
      const priorParent=links.find(l=>l.kind==='hierarchy'&&l.fromId===g.id)?.toId;
      const caption=priorParent&&priorParent!==id?`<span class="life-caption">현재 상위: ${esc(goalVersion(s.goals.find(p=>p.id===priorParent),date)?.title)}</span>`:'';
      return checkbox(goalVersion(g,date).title,'childIds',false,g.id)+caption;
    }).join(''):'<p class="muted">목표를 만든 후 연결할 수 있습니다.</p>'}</fieldset>`;
  }).join('');
  const activityFields=canLinkActivity(level)?`<fieldset><legend>기본 항목 (시간 기록)</legend>${s.categories.filter(c=>!c.archived).map(c=>checkbox(c.name,'categoryIds',false,c.id)).join('')||'<p class="muted">앱 설정에서 시간 기록 항목을 추가하세요.</p>'}<p class="muted">같은 항목이 여러 목표에 연결되면 시간기록 메뉴에서 반영할 목표를 선택합니다. 상위 목표에는 한 번만 합산됩니다.</p></fieldset>`:'';
  return `${parentField}${childFields}${activityFields}${checkbox('위에서 선택한 연결을 적용합니다','confirmLinks')}<p class="muted">상위 목표는 하나만 연결합니다. 다른 상위에 연결된 하위 목표를 선택하면 적용일부터 이 목표로 옮깁니다. 이전 날짜의 시간은 당시 경로에 남습니다.</p><p class="muted">수정 시 이 목표의 기존 직접 연결은 종료됩니다. 계속 사용할 하위 목표·활동도 다시 선택하세요. 하위 목표의 다른 연결은 유지됩니다.</p>`;
}
export function goalForm(s,id,date) {
  const g=s.goals.find(g=>g.id===id),v=goalVersion(g,date)||{title:'',startDate:date,status:'active',kind:'achievement'},level=g?.level||'long';
  const formStatus=v.status==='archived'?'active':v.status;
  const repeatFields=`<div id="life-repeat" ${level==='short'?'':'hidden'}>${checkbox('설정한 기간으로 반복','repeat',v.repeat===true)}<p id="life-repeat-help" class="muted life-caption"></p><p class="muted life-caption">시작일·종료일이 첫 반복 기간입니다. 다음 기간에는 시간·숫자 진척이 새로 시작하고, 이전 기록과 상위 목표 누적 시간은 유지됩니다.</p></div>`;
  return shell(g?'목표와 연결 수정':'새 목표','goal',`${hidden('id',id||'')}<div class="life-fields">${input('목표 이름','title',v.title,'text','required maxlength="120"')}${g?hidden('level',level)+`<label>단계<input value="${LEVELS[level]}" disabled></label>`:select('단계','level',Object.entries(LEVELS).map(([k,n])=>option(k,n,level)).join(''))}</div>${textarea('이 목표가 중요한 이유 (선택)','reason',v.reason)}<div class="life-fields">${input('목표 시작일','startDate',v.startDate,'date','required')}${input('목표 종료일 (선택)','endDate',v.endDate,'date')}</div>${repeatFields}<div id="life-measures" ${level==='life'?'hidden':''}><div class="life-fields">${select('목표 성격','kind',option('achievement','완료형',v.kind)+option('maintenance','유지형',v.kind)+option('exploration','탐색형',v.kind))}${input('시간 목표 (시간 · 선택)','hours',v.targetMinutes==null?'':v.targetMinutes/60,'number','min="0.01" step="any" placeholder="비우면 누적 시간만 표시"')}</div><div class="life-fields">${input('매일 실행 기준 (분 · 선택)','dailyMinutes',v.dailyMinutes,'number','min="1" max="1440"')}${select('상태','status',option('active','진행',formStatus)+option('paused','잠시 멈춤',formStatus)+option('completed','결과 확인 후 완료',formStatus)+option('archived','보관',formStatus))}</div><fieldset><legend>숫자 목표 (선택)</legend><div class="life-fields">${input('시작값','resultStart',v.resultTarget==null?'':v.resultStart??0,'number','min="0" step="any" inputmode="decimal" placeholder="예: 80"')}${input('목표값','resultTarget',v.resultTarget,'number','min="0" step="any" inputmode="decimal" placeholder="예: 70"')}${input('단위','resultUnit',v.resultUnit,'text','maxlength="30" placeholder="예: kg, 회, 개"')}</div><p class="muted">80 → 70kg처럼 줄이거나 0 → 5회처럼 늘리는 목표를 설정할 수 있습니다. 현재값은 목표 카드에서 기록합니다. 시작값을 비우면 0부터 계산합니다.</p></fieldset><p class="muted">시간 목표 달성이 결과의 자동 완료를 뜻하지 않습니다.</p></div>${input('다음 행동 (선택)','nextAction',v.nextAction,'text','maxlength="500"')}<h3>연결 적용</h3>${input('연결·새 기준 적용일','effectiveDate',date,'date',`required max="${date}"`)}<div id="life-links">${linkFields(s,level,id,date)}</div><p class="life-notice" id="life-impact"></p>${checkbox('적용일 이후 기존 기록의 목표 집계가 바뀔 수 있음을 확인했습니다','confirmRetroactive')}${input('변경 이유 (선택)','changeNote','','text','maxlength="500"')}${checkbox('대시보드에 표시','showHome',s.homeGoalIds.includes(id))}`);
}
export function resultForm(s,id,date) {
  const {version:v,result}=goalSummary(s,id,date);
  return shell('현재값 기록','result',hidden('goalId',id)+`<p>${esc(v.title)} · 시작 ${v.resultStart??0} → 목표 ${v.resultTarget} ${esc(v.resultUnit)}</p>${input('측정 날짜','date',date,'date',`required max="${date}"`)}${input(`현재값 (${v.resultUnit})`,'value',result?.value??'','number','required min="0" step="any" inputmode="decimal"')}${textarea('메모 (선택)','note')}<p class="muted">이번에 확인한 현재값을 입력하세요. 이전 값에 더하지 않고 현재값으로 반영합니다.</p>`);
}
