import test from 'node:test';
import assert from 'node:assert/strict';
import * as cacheModule from '../src/service-worker-cache.js';

test('PWA stalls fall back to this generation cache including versioned URLs', async () => {
  assert.equal(typeof cacheModule.networkFirstWithDeadline, 'function');
  let aborted = false; let matched;
  const response = await cacheModule.networkFirstWithDeadline({
    request: new Request('https://example.com/app/styles.css?v=27'), timeoutMs: 10,
    fetchFn: (_req, { signal }) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); },
    cache: { match: async (key, options) => { matched = options; return new Response('cached'); } },
  });
  assert.equal(await response.text(), 'cached');
  assert.equal(aborted, true);
  assert.equal(matched.ignoreSearch, true);
});
test('HTTP errors use a good cached app asset rather than a broken response', async () => {
  assert.equal(typeof cacheModule.networkFirstWithDeadline, 'function');
  const response = await cacheModule.networkFirstWithDeadline({ request: new Request('https://example.com/app/'), cache: { match: async () => new Response('working') }, fetchFn: async () => new Response('bad gateway', { status: 503 }) });
  assert.equal(await response.text(), 'working');
});
