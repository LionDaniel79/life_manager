import { createState, apply, linkedActivityGoals, canLinkActivity, localDate, validateState, retainedPathForEntry } from './domain.js';

export function resolveEntryGoal(s, entry) {
  const assigned = s.assignments?.find(a => a.entryId === entry.id);
  if (assigned) return assigned.goalId;
  const retained=retainedPathForEntry(s,entry);
  if(retained)return retained.goalIds[0];
  const choices = linkedActivityGoals(s, entry.categoryId, entry.date);
  return choices.length === 1 ? choices[0].id : null;
}

export function hydrateLife(saved, infra = {}, today = localDate()) {
  const s = saved ? structuredClone(saved) : createState(today);
  if (!saved) s.categories = [];
  s.assignments ||= [];
  const categories = new Map(s.categories.map(c => [c.id, {...c, archived:true}]));
  for (const [items, archived] of [[infra.archivedCategories || [], true], [infra.categories || [], false]]) {
    for (const c of items) categories.set(c.id, {id:c.id,name:String(c.name || '이름 없는 항목'),type:c.goalType === 'restraint' ? 'restraint' : 'growth',archived,order:Number(c.order) || 0,budgetMinutes:null,budgetPeriod:'week'});
  }
  for (const e of infra.entries || []) if (!categories.has(e.categoryId)) categories.set(e.categoryId,{id:e.categoryId,name:'보관된 항목',type:'growth',archived:true,order:categories.size,budgetMinutes:null,budgetPeriod:'week'});
  s.categories = [...categories.values()];
  s.entries = [...new Map((infra.entries || []).map(e => [e.id,e])).values()].map(e => ({
    id:e.id,categoryId:e.categoryId,categoryName:categories.get(e.categoryId).name,date:e.date,
    durationMinutes:Number(e.durationMinutes) || 0,goalId:resolveEntryGoal(s,e),note:String(e.note || '').slice(0,3000),
    source:'manual',startTime:'',endTime:'',updatedAt:new Date(0).toISOString(),
  }));
  return s;
}

export function persistLife(s) {
  return {...structuredClone(s), entries:[], budgets:[], timer:null};
}

export function validateLife(s) {
  validateState(s);
  if (!Array.isArray(s.assignments) || new Set(s.assignments.map(a=>a.entryId)).size !== s.assignments.length || !s.assignments.every(a=>typeof a.entryId==='string' && a.entryId.length > 0 && a.entryId.length <= 200 && (a.goalId===null || s.goals.some(g=>g.id===a.goalId && canLinkActivity(g.level))))) throw Error('목표 배정 정보가 올바르지 않습니다.');
  return true;
}

export function applyLife(state, action, today=localDate()) {
  let s;
  if (action.type==='assignment.save') {
    s=structuredClone(state);
    const entry=s.entries.find(e=>e.id===action.entryId);
    if (!entry || action.goalId && !linkedActivityGoals(s,entry.categoryId,entry.date).some(g=>g.id===action.goalId)) throw Error('기록일에 연결된 중기·단기 목표를 선택하세요.');
    s.assignments=s.assignments.filter(a=>a.entryId!==action.entryId);
    s.retainedEntryPaths=(s.retainedEntryPaths||[]).filter(p=>p.entryId!==action.entryId);
    s.assignments.push({entryId:action.entryId,goalId:action.goalId || null});
  } else {
    if (!/^(goal\.(save|archive|delete)|home\.(toggle|move)|result\.save)$/.test(action.type)) throw Error('지원하지 않는 목표 작업입니다.');
    s=apply(state,action,today);
  }
  s.entries=s.entries.map(e=>({...e,goalId:resolveEntryGoal(s,e)}));
  validateLife(s);
  return s;
}
