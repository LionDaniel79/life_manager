# Runtime reliability implementation plan

**Goal:** Keep the existing time-budget application responsive on delayed or lost connections without losing records or changing metrics.
**Architecture:** Bound asynchronous reads, coalesce shared requests, display cached budget data before the server responds, and use one owner for previous-result budget initialization. Keep confirmed writes distinct from pending confirmation.
**Tech stack:** Existing ES modules, Firebase 11.10.0, IndexedDB, Node tests and Playwright. No new runtime dependencies.

## Constraints
- Existing names, Sunday-first calendar, Monday–Sunday budget periods and restraint exclusion remain unchanged.
- Preserve user-entered budgets (including zero), unsaved inputs, local records, timer identity and category ordering.
- Never treat a timeout as proof that a remote write was cancelled or saved.
- Clear state and ignore late responses when the signed-in user changes.

## Tasks
- [ ] Reproduce cached-budget render blocking, repeated reads and unbounded requests with executable tests (not cross-function source regexes).
- [ ] Add cleared deadline timers and per-user shared reads with invalidation. Harden app loading/session boundaries.
- [ ] Make budget display cache-first; add retry notice, preserve drafts, separate save confirmation and initialization from rendering.
- [ ] Consolidate previous-results initialization; never overwrite explicit budgets.
- [ ] Bound local-first record synchronization; preserve pending entries and avoid duplicate concurrent writes. Fix statistics cache failures and stale hidden-screen refresh.
- [ ] Add network deadline/cache fallback for PWA app assets; bump build generation; test Chromium and WebKit including stalled requests.
- [ ] Review diff, run full Node/browser/build checks, remove temporary audit export, merge only green head and verify Pages deployment.

## Review focus
Late old-user responses, pending writes completing after deadline, loss of draft inputs during a refresh, explicit zero budgets, and empty accounts/offline first use.

## Investigation
Baseline main dd0e8d9; Node 343/343 pass. Budget listeners render only after loadData, which waits on getDocs and ensureCurrentWeekBudget/setDoc without deadlines. Its existing source-regex test crosses multiple event listeners and incorrectly passes. Independent migration also reads/writes the same budgets on infrastructure events. Timer independently reads the same five collections. Statistics waits for cache before its protected server read; cache errors abort the entire path. Offline records are locally stored but the UI still awaits a potentially unending remote transaction. PWA network-first fetch only falls back on rejection, not a stalled connection.
