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
