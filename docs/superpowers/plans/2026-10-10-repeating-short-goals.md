# Repeating short goals implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a fresh final code review.

**Goal:** An optional short-goal repeat setting repeats the inclusive start/end span: Sep 1–15 → Sep 16–30 → Oct 1–15. This supersedes the earlier daily/weekly/monthly proposal.

**Architecture:** Store `repeat: boolean` in dated goal versions, defaulting absent values to false. Derive periods from the calendar dates; do not clone goals, rewrite original records, or require background jobs. Repeated short goals aggregate their current period; ancestors retain their own cumulative ranges and count each source once. Maintain existing dated links and manual attribution.

**Tech stack:** Existing JavaScript modules, Node test runner, Playwright Chromium/WebKit, GitHub Pages.

## Rules

- Only short goals repeat; both dates are required. The end date defines the first period, not the last repetition. One-day, month/year boundaries and skipped periods work in Korean calendar days.
- Each period uses the same time/numeric targets. Numeric values are measured within that period, never carried over. No target remains valid; show period time without a fabricated percentage. Reaching 100% does not automatically complete the goal.
- Show active period dates on compact goal rows and recent period history in details, including total linked time. Pausing/completing/archiving stops rollover at the status change date. Existing archive/delete protections remain.
- Editing dates/repeat starts a new schedule from the dated change; prior periods keep historical criteria. Same-schedule target edits affect the period containing the effective date. Same-day edits retain the existing audit convention. Disabling repeat returns to the specified finite range.
- App opening, returning to focus, navigation and midnight refresh must derive the correct period without cloud writes.

## Tasks

- [x] Add failing domain/model tests for repeat validation, period rollover, late and corrected records, ancestor totals, version changes, lifecycle and legacy backups.
- [x] Implement date-period calculation and repeat-aware eligibility/aggregation in `src/life/domain.js`; persist the optional version field.
- [x] Add short-only repeat checkbox and explanation in `forms.js`/`feature.js`; compact dates and recent-period progress in `views.js`/`style.css`. Verify real form save/reload, rollover, desktop/mobile and both engines.
- [x] Update handoff and release v32. Run Node/browser suites, build and diff checks; get independent branch review and fix findings.
- [ ] Commit, fast-forward main, push only origin/main, verify CI and Pages plus live release/assets. Save local verification evidence.

## Execution ledger

- Clarification: user explicitly chose equal-length date spans, not calendar recurrence or completion-triggered copies.
- Existing authorization covers local implementation, tests, source publication and deployment. Private sources and live user records remain untouched.
- Added user requirement: long goals may directly link short children as well as medium children, with separate selection groups. Medium goals show short children separately from basic time categories. Each child still has one parent; explicit reparenting preserves historical paths and never doubles totals.
- TDD: nine recurrence tests and two direct-link/grouping tests failed before implementation and passed afterward; new browser form/group flows likewise failed before UI implementation and passed in Chromium/WebKit. The former test prohibiting short→long was updated to reject a genuinely invalid long→short parent.
- Review fix: inactive schedule edits could produce reversed bounds. Anchor the new schedule at its effective date if later than the stop date. Paused/completed regression failed first, then passed. Full Node suite: 416 passing.
- Review fix: an infrastructure render after midnight could advance the list's date while leaving an open detail stale. Refresh date-sensitive details within the date-changing render; do not overwrite open edit forms. Browser regression reproduced the old date first. In-memory browser fixture now persists budget initializer snapshots so simulated midnight does not loop on no-op writes; production budget code is unchanged.
- Scope ruling: signed-in production writes are excluded from verification; synthetic UI/storage tests exercise writes and production release checks exercise the login shell and shipped assets.
- Final local gate: Node 416 / Chromium-WebKit 85 passed; build and diff check passed. Independent reviewer verified both corrections and returned no remaining findings. Desktop/mobile compact cards, grouped selectors and history visually checked. Deployment step completion is recorded in ignored `local-data/latest-verification.json` after live verification.
