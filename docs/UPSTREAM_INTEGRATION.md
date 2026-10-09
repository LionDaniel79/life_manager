# Life Manager: upstream integration

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
