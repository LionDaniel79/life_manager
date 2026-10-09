import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryHasReferences } from '../src/life/category-guard.js';
test('used category cannot be permanently removed, including historical goal links and explicit zero budgets',()=>{
  for(const references of [{entryCount:1},{pendingCount:1},{weeklyBudgets:[{budgets:{a:0}}]},{dailyBudgets:[{overrides:{a:0}}]},{timer:{categoryId:'a'}},{life:{links:[{kind:'activity',fromId:'a',validTo:'2025-01-01'}]}}]) assert.equal(categoryHasReferences('a',references),true);
  assert.equal(categoryHasReferences('a',{}),false);
  assert.equal(categoryHasReferences('b',{weeklyBudgets:[{budgets:{a:0}}]}),false);
});
