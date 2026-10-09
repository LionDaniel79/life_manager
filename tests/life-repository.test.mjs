import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateLife } from '../src/life/model.js';
import { createLifeRepository } from '../src/life/repository.js';

function harness() {
  const docs=new Map();
  const read=ref=>({exists:()=>docs.has(ref),data:()=>structuredClone(docs.get(ref))});
  const firebase={doc:(_db,...parts)=>parts.join('/'),getDocFromServer:async ref=>read(ref),runTransaction:async(_db,fn)=>fn({get:async ref=>read(ref),set:(ref,data)=>docs.set(ref,structuredClone(data))})};
  return {docs,repo:createLifeRepository({firebase,db:{}})};
}
test('goal writes use their own collection and reject stale revisions instead of overwriting another device',async()=>{
  const {repo,docs}=harness();
  const initial=hydrateLife(null,{},'2026-10-09');
  assert.equal(await repo.loadLifeData('one'),null);
  const saved=await repo.saveLifeData('one',initial,0);
  assert.equal(saved.revision,1);
  assert.equal(docs.has('users/one/lifeManager/state'),true);
  await assert.rejects(repo.saveLifeData('one',initial,0),/다른/);
  assert.equal((await repo.loadLifeData('one')).revision,1);
  assert.equal(await repo.loadLifeData('two'),null);
});
test('malformed or oversized imported goal state cannot replace stored data',async()=>{
  const {repo,docs}=harness();
  const state=hydrateLife(null,{},'2026-10-09');state.assignments=[{entryId:'e',goalId:'unknown'}];
  await assert.rejects(repo.saveLifeData('one',state,0),/배정/);
  assert.equal(docs.size,0);
});
