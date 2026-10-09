export function categoryHasReferences(id,{entryCount=0,pendingCount=0,weeklyBudgets=[],dailyBudgets=[],timer=null,life=null}={}) {
  return Boolean(entryCount||pendingCount||timer?.categoryId===id
    ||weeklyBudgets.some(w=>Object.hasOwn(w.budgets||{},id)||(w.explicitBudgetIds||[]).includes(id))
    ||dailyBudgets.some(d=>Object.hasOwn(d.overrides||{},id))
    ||life?.links?.some(l=>l.kind==='activity'&&l.fromId===id));
}
