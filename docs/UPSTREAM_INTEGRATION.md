# Life Manager: upstream integration

The final v30–v33 sections supersede earlier menu, hierarchy, card layout, standalone weight/review UI and install identity decisions.

Approved 2026-10-09: extend weekly-time-budget, keep its time recording, budgets, scoring and statistics; add dated life/long/medium/short goals. Publish application source only. Personal planning and prototype remain local.

Base: LionDaniel79/weekly-time-budget main eb183868a8e3301f18e5560da6298d58f020c0db. Remote `upstream` tracks the original; `origin` is life_manager. Prototype is preserved on local-only branch archive/local-prototype-v1. Never publish that branch or use push --all.

## Implementation plan

1. Preserve prototype, fetch upstream history, establish baseline with `node --test tests/*.test.mjs` (exclude local archives). Keep public history free of personal documents.
2. Port tested dated goal domain into src/life. Test adapting original entries without rewriting them, unique attribution, optional targets, relinking and revision-conflict handling. Store only goal-related state in users/{uid}/lifeManager/state; original collections remain intact. Goal edits require online confirmation; time recording keeps original offline queue.
3. Add compact goal panels and forms. Five menus: Today, Time, Goal settings (includes original daily/weekly budgets), Statistics (original five modes plus goals), App settings (original category management plus backup). Recent records remain beneath recording; no record search or Today quick entry. Preserve original time functionality and score calculations.
4. Verify Node suite and browser flows on desktop/mobile using synthetic data only. Check deployment artifact excludes personal files. Fresh independent review, fix material findings, retest.
5. Upload sanitized source to life_manager, configure Pages, deploy, verify live commit and asset loading. Keep original deployment available. Record any authentication/platform blocker accurately.

## Decisions

- Same owner already has both repositories: retain upstream history and remote, use life_manager as the independent derivative rather than falsely labeling it a GitHub fork.
- Multiple short goals for an activity require selecting an attribution for each ambiguous record. Unlinked time remains recorded. A single eligible dated link automatically counts matching records; past effective dates require acknowledgement.
- Separate goal document uses transaction revision checks; offline time entry remains available, goal edits show an explicit online requirement.
- Local personal instructions and planning are under local-data/planning and ignored; deployed artifact contains only application assets.

## Progress

- Prototype saved locally; upstream history fetched; feature/upstream-goals created, including original life_manager initial commit.
- Baseline test discovery initially included ignored archives; narrowing the command to the maintained tests is required.
- GitHub connector can write code. Terminal Git authentication is unavailable; browser/native UI tools currently fail to initialize. Pages configuration remains to be resolved.

## Final verification and rulings

- 385 Node tests and 39 Chromium/WebKit browser tests passed after fixes; application-only build succeeded.
- Independent review found duplicate production shell imports, stale refresh overwrites, and unrepairable stale attribution. Reproduction tests failed first; all fixed and full suites rerun.
- Ruling: an earlier day's execution shown as today's is treated as an accuracy defect rather than cosmetic polish; corrected with a date-specific regression test.
- Ruling: production authentication/deployment is verified separately; synthetic browser flows cannot prove signed-in production access. Unchanged upstream functionality is covered by inherited regressions, private planning stays local.
- GitHub CLI login approved by user and verified as LionDaniel79. life_manager changed to public with explicit source-publication authorization; Pages configured for GitHub Actions. Prototype branch is not an ancestor of the publishable branch.
- Published 8804f232c3dbc6e74ee70f1810e780ce514a4f12 to origin/main; GitHub CI and Pages deployment succeeded. Live release.json matched, and production login shell loaded with no page errors or configuration warnings. No signed-in production data was modified during verification. Working checkout is now main tracking origin/main.

## 2026-10-09 · Medium activity links and statistics bars

The latest request permits direct time-category links on both medium and short goals. Medium goals can retain child short goals as well. A time entry has one selected direct target; overlapping candidates require explicit attribution, and each ancestor counts the source once. Historical effective dates and optional targets remain unchanged. Schema v1 is extended by accepting medium targets; old short links and backups remain valid.

Category achievement in weekly, monthly and yearly statistics uses compact horizontal bars. Preserve the original scores and signed restraint meaning: negative excess uses red hatching and explicit excess text; over-100% growth retains the true percentage with a capped bar. No budget means excluded, never a fabricated zero. Version v29 refreshes the application cache.

## 2026-10-09 · v30 compact goals and navigation

Six menus: Dashboard, Time recording, Time budgets, Goal settings, Statistics, App settings. Budgets precede goals; the original daily/weekly budgets and scores remain. Manual recording is minutes-only, field dimensions are consistent, and old mode preferences normalize to duration. Outside pointer events close mobile navigation, including WebKit taps that emit no click.

Medium and other measurable goals accept baseline, target, unit, and dated absolute current values. Decreasing measures such as weight use (current − baseline)/(target − baseline). Missing measurements stay missing; reaching a target never auto-completes a goal. Earlier backups without a baseline remain supported.

Compact goal cards support a collapsed archive and confirmed deletion. Deletion keeps historical metadata, child goals and source time records. Optional retainedEntryPaths preserve attribution of already-recorded entries on the retirement date while stopping new attribution. They store source IDs and paths only; source duration corrections stay live, and explicit reassignment clears retention. The attribution UI offers both alternate goals and clearing for preserved assignments.

Goals are the sixth statistics mode, accessible during pending/failed time-data loads. Standalone weight/review UI is removed by request; existing stored arrays remain for backup compatibility. Original review findings about same-day totals and hidden correction controls were reproduced and resolved. Deployment identifier: 2026.10.09-life-v30. Final local and production verification evidence is kept in ignored local-data/latest-verification.json.

## 2026-10-10 · v31 horizontal goals and independent installation

Goal lists use full-width horizontal rows: identity, progress, actions. Container queries adapt the same renderer to phone screens and the detail dialog without altering goal data or behavior.

Production manifests for both apps used id './', which Chromium actually computed as the origin root for both applications. This caused the new app to be treated as already installed. Life Manager now has id '/life_manager/'; the upstream app and both start URLs remain untouched. A real Chromium manifest regression catches accidental identity collisions and verifies installability. Existing installations are not removed automatically; the new identity can leave an old icon beside the new one, while URL-scoped data and login remain intact.

## 2026-10-10 · v32 exact-span repeat and grouped child goals

Short goals optionally repeat their inclusive initial start/end duration, not calendar weeks/months: Sep 1–15, Sep 16–30, Oct 1–15. Optional version.repeat defaults false for legacy data. Period progress resets by calculation; source records, dated attribution and ancestor cumulative totals remain. No scheduled writes or duplicated goals. Current/next dates appear in the editor and current dates on cards; details show the latest 12 periods. Numeric values require a measurement in each period. Inactive status freezes rollover. The shared eligibility/path logic extends repeated goals past their initial end.

Long goals can directly select medium and short children in distinct groups; medium separates short children and basic time categories. canParent extends the existing hierarchy with short→long. Each child has one dated parent; selecting a previously parented child moves it from the effective date and keeps historic paths. Retained archive/delete paths accept this relationship. Existing time recording/budgets/scores and Firebase collections are unchanged.

## 2026-10-10 · v33 life direction connections

Life directions can select long, medium, short and basic activity categories in four separate groups. Medium/short parent selectors include life. The one-parent rule and dated reparenting remain. Activity targets are life/medium/short; long activity links remain unsupported.

Paths now include life as their final ancestor, or life alone for direct attribution. Its card displays connected time as reference, never an achievement percentage or numeric target. Overlapping life/child activity links require one explicit entry assignment, and each ancestor counts the source once. Retained paths accept up to four levels and singleton life paths. Existing retained paths remain unchanged rather than retroactively appending life. Original time sources and budget/statistics behavior are preserved.
