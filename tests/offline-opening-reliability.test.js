import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineStore } from '../src/offline-store.js';

test('a stalled IndexedDB open times out and closes a late connection', async () => {
  const request = {}; let closed = false;
  const pending = createOfflineStore({ indexedDB: { open: () => request }, openTimeoutMs: 10 });
  const outcome = await Promise.race([pending.then(() => 'opened', (error) => error.code), new Promise((resolve) => setTimeout(() => resolve('stuck'), 60))]);
  assert.equal(outcome, 'deadline-exceeded');
  request.result = { close() { closed = true; } };
  request.onsuccess();
  assert.equal(closed, true);
});
