const DAY = 86400000;
const OFFSET = 9 * 3600000;
export const LEVELS = { life: '생애', long: '장기', medium: '중기', short: '단기' };
export const PARENT = { long: 'life', medium: 'long', short: 'medium' };
export const canParent = (child, parent) => Boolean(PARENT[child] && (parent === 'life' || PARENT[child] === parent || child === 'short' && parent === 'long'));
export const canLinkActivity = level => ['life','medium','short'].includes(level);
export function comparisonRange(from,to,mode='custom') {
  if(mode==='week') return {from:addDays(from,-7),to:addDays(to,-7)};
  if(mode==='month') {
    const priorLast=addDays(`${from.slice(0,7)}-01`,-1), day=Math.min(Number(to.slice(8)),Number(priorLast.slice(8)));
    return {from:`${priorLast.slice(0,7)}-01`,to:`${priorLast.slice(0,7)}-${String(day).padStart(2,'0')}`};
  }
  return {from:addDays(from,-dates(from,to).length),to:addDays(from,-1)};
}
export const uid = () => crypto.randomUUID();
export const localDate = (now = Date.now()) => new Date(Number(now) + OFFSET).toISOString().slice(0, 10);
export const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);
export const weekStart = (date, first = 1) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() - first + 7) % 7));
export const dates = (from, to) => {
  const out = [];
  for (let d = from; d <= to && out.length < 36600; d = addDays(d, 1)) out.push(d);
  return out;
};
const check = (condition, message) => { if (!condition) throw new Error(message); };
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d && d >= '1900-01-01' && d <= '2200-12-31';
const num = (n, min = 0, max = 1e8) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const text = (s, max = 3000) => typeof s === 'string' && s.length <= max;
const clean = (s, max = 3000) => String(s ?? '').trim().slice(0, max);
const nullableNumber = n => n === '' || n == null ? null : Number(n);
const inRange = (d, from, to) => d >= from && (!to || d <= to);
const inGoalRange = (d, v) => inRange(d, v.startDate, v.repeat ? null : v.endDate);
export const activeLink = (l, d) => d >= l.validFrom && (!l.validTo || d < l.validTo);
const upsert = (arr, item) => { const index = arr.findIndex(x => x.id === item.id); if (index < 0) arr.push(item); else arr[index] = item; };

export function createState(date = localDate()) {
  const defaults = [['prayer', '기도'], ['bible', '성경'], ['reading-spiritual', '영적 독서'], ['reading-counsel', '상담 독서'], ['reading-general', '일반 독서'], ['exercise', '운동'], ['thesis', '논문'], ['family', '가족'], ['rest', '휴식'], ['video', '영상 시청']];
  return {
    schemaVersion: 1, revision: 0, createdDate: date,
    categories: defaults.map(([id, name], order) => ({ id, name, type: id === 'video' ? 'restraint' : 'growth', archived: false, order, budgetMinutes: null, budgetPeriod: 'week' })),
    goals: [], links: [], entries: [], retainedEntryPaths: [], budgets: [], results: [], weights: [], reviews: [], audit: [], homeGoalIds: [], timer: null,
    settings: { weekStartsOn: 1, defaultMinutes: 30 },
  };
}

export function goalVersion(goal, date = localDate()) {
  return goal?.versions.filter(v => v.effectiveDate <= date).at(-1) ?? null;
}
const sameSchedule = (a,b) => a?.repeat === b?.repeat && a?.startDate === b?.startDate && a?.endDate === b?.endDate;
function repeatAsOf(goal, asOf) {
  const versions=goal.versions.filter(v=>v.effectiveDate<=asOf);
  if(versions.at(-1)?.status==='active') return asOf;
  // Inactive goals stay on the period where they were stopped, including archive-retained entries.
  const lastActive=versions.findLastIndex(v=>v.status==='active');
  return versions[lastActive+1]?.effectiveDate || asOf;
}
export function goalPeriod(goal, asOf = localDate()) {
  const v=goalVersion(goal,asOf);
  if(goal?.level!=='short'||!v?.repeat||!v.endDate) return null;
  const index=goal.versions.indexOf(v);
  let first=index;
  while(first>0&&sameSchedule(goal.versions[first-1],v))first--;
  const stop=repeatAsOf(goal,asOf);
  const anchor=first>0&&goal.versions[first].effectiveDate>stop?goal.versions[first].effectiveDate:stop;
  const days=Math.round((Date.parse(v.endDate)-Date.parse(v.startDate))/DAY)+1;
  const offset=Math.max(0,Math.floor((Date.parse(anchor)-Date.parse(v.startDate))/DAY/days));
  let from=addDays(v.startDate,offset*days),to=addDays(from,days-1);
  // A changed schedule starts on its effective date; target-only changes keep the current span.
  if(first>0&&goal.versions[first].effectiveDate>from)from=goal.versions[first].effectiveDate;
  const next=goal.versions.slice(index+1).find(x=>!sameSchedule(x,v));
  if(next&&next.effectiveDate<=to)to=addDays(next.effectiveDate,-1);
  return {from,to,days,index:offset+1};
}
export const goalIsDeleted = (goal, date = localDate()) => Boolean(goal?.deletedDate && goal.deletedDate <= date);
export function listedGoals(s, date = localDate(), archived = false) {
  return s.goals.filter(g => !goalIsDeleted(g,date) && goalVersion(g,date)
    && (goalVersion(g,date).status === 'archived') === archived);
}
export function linkedActivityGoals(s, categoryId, date) {
  return s.links.filter(l => l.kind === 'activity' && l.fromId === categoryId && activeLink(l, date))
    .map(l => s.goals.find(g => g.id === l.toId)).filter(g => {
      const v = goalVersion(g, date);
      return !goalIsDeleted(g,date) && canLinkActivity(g?.level) && v && v.status === 'active' && inGoalRange(date,v);
    });
}
export const retainedPathForEntry = (s, entry) => s.retainedEntryPaths?.find(p => p.entryId === entry.id && p.categoryId === entry.categoryId && p.date === entry.date);
export function pathForEntry(s, entry) {
  const retained = retainedPathForEntry(s,entry);
  if (retained && retained.goalIds[0] === entry.goalId) return [...retained.goalIds];
  const path = [];
  let id = entry.goalId;
  if (!id || !s.links.some(l => l.kind === 'activity' && l.fromId === entry.categoryId && l.toId === id && activeLink(l, entry.date))) return path;
  while (id && !path.includes(id)) {
    const goal = s.goals.find(g => g.id === id);
    const v = goalVersion(goal, entry.date);
    if (!v || goalIsDeleted(goal,entry.date) || v.status !== 'active' || !inGoalRange(entry.date,v)) break;
    path.push(id);
    id = s.links.find(l => l.kind === 'hierarchy' && l.fromId === id && activeLink(l, entry.date))?.toId;
  }
  return path;
}
function retainExistingPaths(s, goalId, fromDate) {
  s.retainedEntryPaths ||= [];
  for (const entry of s.entries.filter(e => e.date >= fromDate)) {
    const goalIds = pathForEntry(s,entry);
    if (!goalIds.includes(goalId)) continue;
    // Only attribution is retained: corrected durations still come from the original time record.
    s.retainedEntryPaths = s.retainedEntryPaths.filter(p => p.entryId !== entry.id);
    s.retainedEntryPaths.push({entryId:entry.id,categoryId:entry.categoryId,date:entry.date,goalIds});
  }
}
export function goalSummary(s, id, asOf = localDate()) {
  const goal = s.goals.find(g => g.id === id);
  const version = goalVersion(goal, asOf);
  if (!version) return { goal, version: null, entries: [], minutes: 0, totalMinutes: 0, period: null, percent: null, result: null, resultPercent: null, children: [] };
  const period=goalPeriod(goal,asOf);
  const allEntries=s.entries.filter(e=>e.date<=asOf&&pathForEntry(s,e).includes(id));
  const entries = allEntries.filter(e => inRange(e.date, period?.from || version.startDate, period?.to || version.endDate));
  const minutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const result = s.results.filter(r => r.goalId === id && r.date <= asOf && (!period||inRange(r.date,period.from,period.to)) && r.metricKey === version.metricKey).sort((a,b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt)).at(-1) ?? null;
  const children = s.links.filter(l => l.kind === 'hierarchy' && l.toId === id && activeLink(l, asOf)).map(l => s.goals.find(g => g.id === l.fromId));
  const start = version.resultStart ?? 0;
  const resultPercent = result && version.resultTarget != null && version.resultTarget !== start
    ? (result.value - start) / (version.resultTarget - start) * 100 : null;
  return { goal, version, entries, minutes, totalMinutes:allEntries.reduce((sum,e)=>sum+e.durationMinutes,0), period, percent: version.targetMinutes == null || goal.level === 'life' ? null : minutes / version.targetMinutes * 100, result, resultPercent, children };
}
export function goalPeriods(s,id,asOf=localDate(),limit=12) {
  const goal=s.goals.find(g=>g.id===id),rows=[];
  let cursor=asOf;
  while(goal&&rows.length<limit) {
    const row=goalSummary(s,id,cursor);
    if(!row.version)break;
    if(row.period&&row.period.from<=cursor&&row.period.from<=row.period.to) {
      rows.push(row);cursor=addDays(row.period.from,-1);
    } else cursor=addDays(row.version.effectiveDate,-1);
  }
  return rows;
}
export function dailyGoalStatus(s, id, asOf = localDate()) {
  const goal = s.goals.find(g => g.id === id);
  const v = goalVersion(goal, asOf);
  if (!v?.dailyMinutes) return [];
  return dates(v.startDate, !v.repeat && v.endDate && v.endDate < asOf ? v.endDate : asOf).flatMap(date => {
    const historical = goalVersion(goal, date);
    if (!historical?.dailyMinutes || historical.status !== 'active' || !inGoalRange(date,historical)) return [];
    const entries = s.entries.filter(e => e.date === date && pathForEntry(s, e).includes(id));
    const minutes = entries.reduce((t, e) => t + e.durationMinutes, 0);
    return [{ date, minutes, target: historical.dailyMinutes, status: date === asOf ? 'today' : !entries.length ? 'missing' : minutes >= historical.dailyMinutes ? 'met' : 'below' }];
  });
}
export function categoryStats(s, from, to) {
  return [...s.categories].sort((a,b) => a.order - b.order).map(c => {
    const entries = s.entries.filter(e => e.categoryId === c.id && inRange(e.date, from, to));
    return { ...c, minutes: entries.reduce((n,e) => n + e.durationMinutes, 0), count: entries.length, days: new Set(entries.map(e => e.date)).size };
  });
}
export function weekBudget(s, categoryId, week) {
  const explicit = s.budgets.find(b => b.categoryId === categoryId && b.week === week);
  if (explicit) return { minutes: explicit.minutes, source: '설정' };
  const previous = categoryStats(s, addDays(week, -7), addDays(week, -1)).find(c => c.id === categoryId);
  if (previous?.count) return { minutes: previous.minutes, source: '지난주 실적' };
  const c = s.categories.find(c => c.id === categoryId);
  return { minutes: c?.budgetMinutes == null ? null : c.budgetMinutes * (c.budgetPeriod === 'day' ? 7 : 1), source: '항목 기본값' };
}
export const timerElapsed = (timer, now = Date.now()) => !timer ? 0 : timer.intervals.reduce((n,[start,end]) => n + end - start, 0) + (timer.runningSince == null ? 0 : Math.max(0, now - timer.runningSince));

function saveEntry(s, a, allowArchived = false) {
  const category = s.categories.find(c => c.id === a.categoryId);
  const existing = s.entries.find(e => e.id === a.id);
  check(category && (!category.archived || allowArchived || existing?.categoryId === category.id), '사용할 수 있는 활동 항목을 선택하세요.');
  check(validDate(a.date), '올바른 기록 날짜를 선택하세요.');
  const durationMinutes = Number(a.durationMinutes);
  check(num(durationMinutes, 0, 1440) && a.durationMinutes !== '', '기록 시간은 0~1,440분으로 입력하세요.');
  let goalId = a.goalId;
  if (goalId === undefined) {
    const choices = linkedActivityGoals(s, category.id, a.date);
    check(choices.length <= 1, '연결 가능한 목표가 여러 개입니다. 하나를 선택하세요.');
    goalId = choices[0]?.id ?? null;
  }
  if (goalId) check(linkedActivityGoals(s, category.id, a.date).some(g => g.id === goalId) || (existing?.goalId === goalId && existing.date === a.date && existing.categoryId === a.categoryId), '해당 날짜에 항목과 연결된 목표를 선택하세요.');
  if (existing && (existing.goalId !== (goalId || null) || existing.date !== a.date || existing.categoryId !== a.categoryId)) s.retainedEntryPaths = (s.retainedEntryPaths || []).filter(p => p.entryId !== existing.id);
  upsert(s.entries, { id: a.id || uid(), categoryId: category.id, categoryName: existing?.categoryId === category.id ? existing.categoryName : category.name, date: a.date, durationMinutes, goalId: goalId || null, note: clean(a.note), source: a.source || existing?.source || 'manual', startTime: a.startTime || '', endTime: a.endTime || '', updatedAt: new Date().toISOString() });
}

function saveGoal(s, a, today) {
  const existing = s.goals.find(g => g.id === a.id);
  check(!existing?.deletedDate, '삭제한 목표는 수정할 수 없습니다.');
  check(!existing || existing.level === a.level, '목표의 단계 변경은 새 목표로 만들어 주세요.');
  check(validDate(a.effectiveDate), '연결 적용일을 선택하세요.');
  check(!existing || a.effectiveDate >= existing.versions.at(-1).effectiveDate, '이전 버전보다 앞선 적용일로 바꿀 수 없습니다.');
  check(a.effectiveDate <= today, '예약 변경은 아직 지원하지 않습니다. 오늘까지의 적용일을 선택하세요.');
  check(a.effectiveDate >= today || a.confirmRetroactive, '과거 날짜의 연결 영향을 확인하고 적용하세요.');
  const id = existing?.id || a.id || uid();
  const prior = existing?.versions.at(-1);
  const resultUnit = clean(a.resultUnit, 30);
  const metricKey = prior?.resultUnit === resultUnit ? prior.metricKey : uid();
  const version = {
    effectiveDate: a.effectiveDate, title: clean(a.title, 120), reason: clean(a.reason), kind: a.kind || 'achievement',
    startDate: a.startDate || a.effectiveDate, endDate: a.endDate || null,
    repeat: a.repeat ?? false,
    targetMinutes: a.level === 'life' ? null : nullableNumber(a.targetMinutes), dailyMinutes: a.level === 'life' ? null : nullableNumber(a.dailyMinutes),
    resultTarget: a.level === 'life' ? null : nullableNumber(a.resultTarget), resultUnit, metricKey,
    resultStart: a.level === 'life' || a.resultTarget === '' || a.resultTarget == null ? null : nullableNumber(a.resultStart) ?? 0,
    status: a.status || 'active', nextAction: clean(a.nextAction, 500), changeNote: clean(a.changeNote, 500),
  };
  const goal = existing || { id, level: a.level, versions: [] };
  if (existing && version.status === 'archived') retainExistingPaths(s,id,a.effectiveDate);
  // Same-day amendments retain the prior version in audit. No invented intra-day split.
  goal.versions = [...goal.versions.filter(v => v.effectiveDate !== a.effectiveDate), version];
  if (!existing) s.goals.push(goal);
  for (const link of s.links) {
    if ((link.toId === id || (link.kind === 'hierarchy' && link.fromId === id)) && (!link.validTo || link.validTo > a.effectiveDate)) link.validTo = a.effectiveDate;
  }
  const open = (kind, fromId, toId) => {
    for (const goalId of kind === 'hierarchy' ? [fromId,toId] : [toId]) {
      const linked = s.goals.find(g => g.id === goalId);
      check(linked && !linked.deletedDate && goalVersion(linked,a.effectiveDate)?.status !== 'archived', '삭제·보관한 목표에는 새로 연결할 수 없습니다.');
    }
    if (kind === 'hierarchy') {
      for (const l of s.links.filter(l => l.kind === kind && l.fromId === fromId && (!l.validTo || l.validTo > a.effectiveDate))) l.validTo = a.effectiveDate;
    }
    s.links.push({ id: uid(), kind, fromId, toId, validFrom: a.effectiveDate, validTo: null });
  };
  if (version.status !== 'archived') {
    if (a.parentId) open('hierarchy', id, a.parentId);
    for (const childId of new Set(a.childIds || [])) open('hierarchy', childId, id);
    for (const categoryId of new Set(a.categoryIds || [])) open('activity', categoryId, id);
  }
  if (a.includeUnassigned) {
    check(a.confirmRetroactive, '기존 미연결 기록을 포함할지 확인하세요.');
    for (const e of s.entries) if (!e.goalId && e.date >= a.effectiveDate && linkedActivityGoals(s, e.categoryId, e.date).some(g => g.id === id)) e.goalId = id;
  }
  if (a.showHome === true && version.status !== 'archived' && !s.homeGoalIds.includes(id)) s.homeGoalIds.push(id);
  if (a.showHome === false || version.status === 'archived') s.homeGoalIds = s.homeGoalIds.filter(x => x !== id);
}

export function apply(state, action, today = localDate()) {
  const s = structuredClone(state), a = action;
  let previous = null;
  const entity = a.type.split('.')[0];
  const lists = { goal: 'goals', entry: 'entries', category: 'categories', weight: 'weights', result: 'results', review: 'reviews' };
  if (lists[entity]) previous = structuredClone(s[lists[entity]].find(x => x.id === a.id) || null);
  switch (a.type) {
    case 'entry.save': saveEntry(s, a); break;
    case 'entry.delete': s.entries = s.entries.filter(e => e.id !== a.id); s.retainedEntryPaths = (s.retainedEntryPaths || []).filter(p => p.entryId !== a.id); break;
    case 'goal.save': saveGoal(s, a, today); break;
    case 'goal.archive': {
      const goal=s.goals.find(g=>g.id===a.id),v=goalVersion(goal,today);
      check(v&&!goal.deletedDate, '삭제했거나 찾을 수 없는 목표입니다.');
      saveGoal(s,{...v,id:a.id,level:goal.level,effectiveDate:today,status:'archived',showHome:false},today);
      break;
    }
    case 'goal.delete': {
      const goal=s.goals.find(g=>g.id===a.id);
      check(goal&&!goal.deletedDate, '이미 삭제했거나 찾을 수 없는 목표입니다.');
      retainExistingPaths(s,a.id,today);
      // Keep a tombstone and dated links so old source records retain their historical totals.
      goal.deletedDate=today;
      for(const link of s.links)if((link.toId===a.id||(link.kind==='hierarchy'&&link.fromId===a.id))&&(!link.validTo||link.validTo>today))link.validTo=today;
      s.homeGoalIds=s.homeGoalIds.filter(id=>id!==a.id);
      break;
    }
    case 'home.toggle': {
      const goal=s.goals.find(g=>g.id===a.id);
      check(goal&&!goal.deletedDate&&goalVersion(goal,today)?.status!=='archived', '삭제·보관한 목표는 대시보드에 표시할 수 없습니다.');
      s.homeGoalIds = s.homeGoalIds.includes(a.id) ? s.homeGoalIds.filter(id => id !== a.id) : [...s.homeGoalIds, a.id]; break;
    }
    case 'home.move': {
      const i = s.homeGoalIds.indexOf(a.id), j = i + a.direction;
      if (i >= 0 && j >= 0 && j < s.homeGoalIds.length) [s.homeGoalIds[i], s.homeGoalIds[j]] = [s.homeGoalIds[j], s.homeGoalIds[i]];
      break;
    }
    case 'category.save': {
      const old = s.categories.find(c => c.id === a.id);
      upsert(s.categories, { id: a.id || uid(), name: clean(a.name, 80), type: a.categoryType || 'growth', archived: old?.archived || false, order: old?.order ?? s.categories.length, budgetMinutes: nullableNumber(a.budgetMinutes), budgetPeriod: a.budgetPeriod || 'week' });
      break;
    }
    case 'category.archive': {
      const c = s.categories.find(c => c.id === a.id);
      check(c && s.timer?.categoryId !== a.id, '진행 중인 타이머를 먼저 저장하세요.');
      c.archived = !c.archived; break;
    }
    case 'category.delete': {
      check(!s.entries.some(e => e.categoryId === a.id) && !s.links.some(l => l.kind === 'activity' && l.fromId === a.id) && !s.budgets.some(b => b.categoryId === a.id) && s.timer?.categoryId !== a.id, '사용 이력이 있는 항목은 완전 삭제 대신 보관할 수 있습니다.');
      s.categories = s.categories.filter(c => c.id !== a.id); break;
    }
    case 'category.move': {
      s.categories.sort((a,b) => a.order - b.order);
      const i = s.categories.findIndex(c => c.id === a.id), j = i + a.direction;
      if (i >= 0 && j >= 0 && j < s.categories.length) [s.categories[i], s.categories[j]] = [s.categories[j], s.categories[i]];
      s.categories.forEach((c,i) => c.order = i); break;
    }
    case 'budget.save': {
      const id = `${a.week}:${a.categoryId}`;
      upsert(s.budgets, { id, week: a.week, categoryId: a.categoryId, minutes: Number(a.minutes) }); break;
    }
    case 'result.save': {
      const goal=s.goals.find(g=>g.id===a.goalId);
      check(goal&&!goal.deletedDate&&goalVersion(goal,today)?.status!=='archived','삭제·보관한 목표에는 현재값을 기록할 수 없습니다.');
      check(validDate(a.date)&&a.date<=today&&a.value!==''&&a.value!=null,'측정 날짜와 현재값을 확인하세요.');
      const v = goalVersion(goal, a.date);
      check(v?.resultTarget != null, '해당 날짜의 결과 기준을 먼저 설정하세요.');
      upsert(s.results, { id: a.id || uid(), goalId: a.goalId, date: a.date, value: Number(a.value), metricKey: v.metricKey, note: clean(a.note), updatedAt: new Date().toISOString() }); break;
    }
    case 'weight.save': upsert(s.weights, { id: a.id || uid(), date: a.date, kg: Number(a.kg), note: clean(a.note) }); break;
    case 'weight.delete': s.weights = s.weights.filter(w => w.id !== a.id); break;
    case 'review.save': {
      const snapshot = s.goals.map(g => { const r = goalSummary(s,g.id,today); return { id: g.id, title: r.version?.title || '', minutes: r.minutes, targetMinutes: r.version?.targetMinutes ?? null }; });
      upsert(s.reviews, { id: a.id || uid(), date: a.date, keep: clean(a.keep), adjust: clean(a.adjust), next: clean(a.next), snapshot, revision: state.revision }); break;
    }
    case 'settings.save': s.settings = { weekStartsOn: Number(a.weekStartsOn), defaultMinutes: Number(a.defaultMinutes) }; break;
    case 'timer.start': {
      check(!s.timer, '이미 타이머가 실행 중입니다.');
      const now = a.now ?? Date.now(), date = localDate(now);
      const scratch = structuredClone(s);
      saveEntry(scratch, { categoryId: a.categoryId, date, durationMinutes: 0, goalId: a.goalId });
      s.timer = { id: uid(), categoryId: a.categoryId, goalId: scratch.entries.at(-1).goalId, note: clean(a.note), intervals: [], runningSince: now, createdAt: now }; break;
    }
    case 'timer.pause': {
      check(s.timer, '진행 중인 타이머가 없습니다.');
      if (s.timer.runningSince != null) { s.timer.intervals.push([s.timer.runningSince, Math.max(s.timer.runningSince, a.now ?? Date.now())]); s.timer.runningSince = null; } break;
    }
    case 'timer.resume': check(s.timer, '타이머가 없습니다.'); if (s.timer.runningSince == null) s.timer.runningSince = a.now ?? Date.now(); break;
    case 'timer.discard': s.timer = null; break;
    case 'timer.finish': {
      check(s.timer, '타이머가 없습니다.');
      const t = s.timer, now = a.now ?? Date.now();
      const intervals = [...t.intervals, ...(t.runningSince == null ? [] : [[t.runningSince, Math.max(t.runningSince, now)]])];
      const sums = new Map();
      for (const [start,end] of intervals) {
        check(end - start <= 31 * DAY, '31일을 넘긴 타이머입니다. 시간을 확인한 후 직접 입력하세요.');
        for (let cursor = start; cursor < end;) {
          const date = localDate(cursor), boundary = Date.parse(`${addDays(date, 1)}T00:00:00+09:00`), stop = Math.min(end, boundary);
          sums.set(date, (sums.get(date) || 0) + stop - cursor); cursor = stop;
        }
      }
      check([...sums.values()].reduce((x,y) => x+y,0) >= 1000, '1초 이상 기록한 후 저장하세요.');
      for (const [date, ms] of sums) {
        const goalId = t.goalId && linkedActivityGoals(s,t.categoryId,date).some(g => g.id === t.goalId) ? t.goalId : null;
        saveEntry(s, { id: `${t.id}:${date}`, categoryId: t.categoryId, goalId, date, durationMinutes: Math.round(ms / 600) / 100, note: t.note, source: 'timer' }, true);
      }
      s.timer = null; break;
    }
    default: throw new Error('지원하지 않는 작업입니다.');
  }
  s.audit.push({ id: uid(), type: a.type, date: today, at: new Date().toISOString(), previous });
  validateState(s);
  return s;
}

export function validateState(s) {
  check(s && s.schemaVersion === 1, '지원하지 않는 백업 형식입니다.');
  check(Number.isSafeInteger(s.revision) && s.revision >= 0 && validDate(s.createdDate), '저장 정보가 손상되었습니다.');
  const names = ['categories', 'goals', 'links', 'entries', 'budgets', 'results', 'weights', 'reviews', 'audit'];
  for (const name of names) {
    check(Array.isArray(s[name]) && s[name].length <= 200000, `${name} 목록 형식이 올바르지 않습니다.`);
    check(s[name].every(x => x && text(x.id, 160) && x.id.length > 0) && new Set(s[name].map(x => x.id)).size === s[name].length, `${name}에 중복/빈 ID가 있습니다.`);
  }
  const cat = id => s.categories.find(c => c.id === id), goal = id => s.goals.find(g => g.id === id);
  const retained = s.retainedEntryPaths ?? [];
  check(Array.isArray(retained) && retained.length <= 200000 && new Set(retained.map(p => p?.entryId)).size === retained.length,'보존된 시간 연결 목록이 올바르지 않습니다.');
  for (const p of retained) check(p && text(p.entryId,200) && p.entryId.length > 0 && cat(p.categoryId) && validDate(p.date) && Array.isArray(p.goalIds) && p.goalIds.length > 0 && p.goalIds.length <= 4 && canLinkActivity(goal(p.goalIds[0])?.level) && p.goalIds.every((id,i) => goal(id) && (!i || canParent(goal(p.goalIds[i-1]).level,goal(id).level))),'보존된 시간 연결 경로가 올바르지 않습니다.');
  for (const c of s.categories) check(text(c.name,80) && c.name.trim() && ['growth','restraint'].includes(c.type) && typeof c.archived === 'boolean' && num(c.order) && (c.budgetMinutes === null || num(c.budgetMinutes,0,10080)) && ['day','week'].includes(c.budgetPeriod), '활동 항목 형식이 올바르지 않습니다.');
  for (const g of s.goals) {
    check(Object.hasOwn(LEVELS,g.level) && Array.isArray(g.versions) && g.versions.length > 0, '목표 단계/기준이 잘못되었습니다.');
    check(g.deletedDate==null||validDate(g.deletedDate)&&g.deletedDate>=g.versions.at(-1).effectiveDate,'목표 삭제 날짜가 잘못되었습니다.');
    let last = '';
    for (const v of g.versions) {
      check(validDate(v.effectiveDate) && v.effectiveDate > last && validDate(v.startDate) && (!v.endDate || validDate(v.endDate) && v.endDate >= v.startDate), '목표 날짜/기준 순서가 잘못되었습니다.'); last = v.effectiveDate;
      check(v.repeat===undefined||typeof v.repeat==='boolean','반복 설정을 확인하세요.');
      check(!v.repeat||g.level==='short'&&validDate(v.endDate),'반복은 시작일과 종료일이 있는 단기 목표에서 설정하세요.');
      check(text(v.title,120) && v.title.trim() && text(v.reason) && text(v.nextAction,500) && text(v.changeNote,500), '목표 이름과 내용을 확인하세요.');
      check(['active','paused','completed','archived'].includes(v.status) && ['achievement','maintenance','exploration'].includes(v.kind), '목표 상태가 잘못되었습니다.');
      check([v.targetMinutes,v.dailyMinutes].every(n => n === null || num(n,0.01)) && (v.dailyMinutes === null || v.dailyMinutes <= 1440), '시간 목표 기준은 양수여야 합니다.');
      check((v.resultTarget===null||num(v.resultTarget))&&(v.resultStart==null||num(v.resultStart)),'숫자 목표의 시작값과 목표값은 0 이상의 수여야 합니다.');
      check(!Object.hasOwn(v,'resultStart')||v.resultTarget===null||v.resultTarget!==(v.resultStart??0),'숫자 목표의 시작값과 목표값은 달라야 합니다.');
      check(text(v.resultUnit,30) && (v.resultTarget === null || v.resultUnit.trim()) && text(v.metricKey,160), '결과 단위와 기준을 확인하세요.');
      check(g.level !== 'life' || [v.targetMinutes,v.dailyMinutes,v.resultTarget,v.resultStart].every(n => n == null), '생애 목표에는 수치 진척을 사용하지 않습니다.');
    }
  }
  for (const l of s.links) {
    check(validDate(l.validFrom) && (l.validTo === null || validDate(l.validTo) && l.validTo >= l.validFrom), '연결 적용 날짜가 잘못되었습니다.');
    check(l.kind === 'activity' ? cat(l.fromId) && canLinkActivity(goal(l.toId)?.level) : l.kind === 'hierarchy' && goal(l.fromId) && goal(l.toId) && canParent(goal(l.fromId).level,goal(l.toId).level), '상위 단계의 목표에 연결하세요. 생애 목표에는 모든 하위 단계와 항목을, 시간 기록 항목은 생애·중기·단기에 연결할 수 있습니다.');
  }
  const overlap = (a,b) => a.validFrom < (b.validTo || '9999') && b.validFrom < (a.validTo || '9999') && a.validFrom !== a.validTo && b.validFrom !== b.validTo;
  for (let i=0;i<s.links.length;i++) for (let j=i+1;j<s.links.length;j++) {
    const a=s.links[i],b=s.links[j];
    if (a.kind === b.kind && a.fromId === b.fromId && (a.kind === 'hierarchy' || a.toId === b.toId)) check(!overlap(a,b), '동일한 기간에 중복 연결할 수 없습니다.');
  }
  const timestamp = value => text(value,80) && Number.isFinite(Date.parse(value));
  for (const e of s.entries) check(cat(e.categoryId) && validDate(e.date) && num(e.durationMinutes,0,1440) && (!e.goalId || canLinkActivity(goal(e.goalId)?.level)) && text(e.note) && text(e.categoryName,80) && timestamp(e.updatedAt) && ['manual','timer','range'].includes(e.source) && text(e.startTime,5) && text(e.endTime,5), '시간 기록의 날짜·항목·분·목표·수정시각을 확인하세요.');
  for (const b of s.budgets) check(cat(b.categoryId) && validDate(b.week) && num(b.minutes,0,10080), '시간 예산은 0~10,080분으로 입력하세요.');
  for (const r of s.results) check(goal(r.goalId) && validDate(r.date) && num(r.value) && text(r.metricKey,160) && r.metricKey.length>0 && text(r.note) && timestamp(r.updatedAt), '결과 측정 형식이 잘못되었습니다.');
  for (const w of s.weights) check(validDate(w.date) && num(w.kg,1,500) && text(w.note), '체중은 실제 측정한 1~500kg 값을 입력하세요.');
  for (const r of s.reviews) check(validDate(r.date) && text(r.keep) && text(r.adjust) && text(r.next) && num(r.revision) && Array.isArray(r.snapshot) && r.snapshot.every(g=>g && text(g.id,160) && text(g.title,120) && num(g.minutes) && (g.targetMinutes===null || num(g.targetMinutes,0.01))), '점검과 당시 목표 정보의 형식이 잘못되었습니다.');
  check(Array.isArray(s.homeGoalIds) && new Set(s.homeGoalIds).size === s.homeGoalIds.length && s.homeGoalIds.every(id => goal(id)), '메인 목표 목록이 잘못되었습니다.');
  check(s.settings && [0,1].includes(s.settings.weekStartsOn) && num(s.settings.defaultMinutes,1,1440), '앱 설정이 잘못되었습니다.');
  if (s.timer) check(text(s.timer.id,160) && s.timer.id.length>0 && cat(s.timer.categoryId) && (!s.timer.goalId || canLinkActivity(goal(s.timer.goalId)?.level)) && num(s.timer.createdAt,1,1e14) && (s.timer.runningSince === null || num(s.timer.runningSince,1,1e14)) && Array.isArray(s.timer.intervals) && s.timer.intervals.every(i => Array.isArray(i) && i.length === 2 && num(i[0],1,1e14) && num(i[1],i[0],1e14)) && text(s.timer.note), '타이머 저장 정보가 잘못되었습니다.');
  return true;
}
