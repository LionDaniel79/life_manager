import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppEntryService } from '../src/app-entry-service.js';

function fixture() {
  const seen = { errors: 0, saved: 0, updates: 0, changes: [] };
  let user = { uid: 'u1' }; let resolve;
  const runtime = { repository: { saveEntryLocalFirst: () => new Promise((r) => { resolve = r; }) }, store: { patchSnapshot: async () => { throw Error('cache unavailable'); } } };
  const service = createAppEntryService({
    getUser: () => user, getRuntime: () => runtime, getCategories: () => [], getEntries: () => [], getRemoteEntries: () => [],
    setRemoteEntries: () => { seen.updates++; }, refreshMergedEntries: async () => {}, publishHistoryState() {}, renderAll() {}, loadData: async () => {}, dataSource: {},
    showEntrySaveResult: () => { seen.saved++; }, showLocalSaveError: () => { seen.errors++; }, showToast() {}, dispatch: (...args) => seen.changes.push(args),
  });
  return { service, seen, switchUser: () => { user = { uid: 'u2' }; }, finish: () => resolve({ status: 'synced', entry: { id: 'r1', durationMinutes: 60 }, localId: 'r1', pendingCount: 0 }) };
}

test('a confirmed time record remains successful when the optional snapshot cache fails', async () => {
  const f = fixture();
  const saving = f.service.saveEntry({ categoryId: 'reading', durationMinutes: 60 });
  f.finish();
  const result = await saving;
  assert.equal(result.status, 'synced');
  assert.equal(f.seen.errors, 0);
  assert.equal(f.seen.saved, 1);
});

test('late time-record completion cannot update a different signed-in user', async () => {
  const f = fixture();
  const saving = f.service.saveEntry({ categoryId: 'reading', durationMinutes: 60 });
  f.switchUser(); f.finish();
  await saving;
  assert.equal(f.seen.updates, 0);
  assert.equal(f.seen.changes.length, 0);
});
