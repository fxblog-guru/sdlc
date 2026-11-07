---
template_for: post-release
gate: G11
authored_by: dev-designing-observability
reviewed_by: dev-reviewing-monitoring
---

<!--
Everything before this point was a prediction. This document is the only place the pipeline finds
out whether the predictions were right, under real traffic, with real data.

Be specific about what was actually observed rather than what was expected. "Latency looks fine" is
not an observation; "p95 = 180ms against a 300ms budget, 24h window, panel linked" is. A gap found
here is cheap; the same gap found by a customer is not.
-->

---
slug: <slug>
stage: monitoring
artifact: post-release
status: draft
authored_by: dev-designing-observability
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Release under review

<Commit SHA, deploy time, environments, rollout percentage reached, and the observation window this report covers.>

## Telemetry confirmed

<Each signal from observability.md, confirmed present in the real environment with the query or panel that shows it. Anything missing is a finding, not a follow-up.>

| Signal | Expected | Observed | Evidence |
|---|---|---|---|

## SLO status

<Each SLO with its actual value in the window and the error budget consumed. A budget burning in week one means the target or the implementation is wrong — say which.>

| SLO | Objective | Actual | Budget used | Verdict |
|---|---|---|---|---|

## Behaviour under real traffic

<What the feature actually did: volume, adoption, error rate, latency distribution, and the differences from what was predicted at G2.>

## Incidents and anomalies

<Anything unexpected, whether or not it caused an alert: a spike, a retry storm, an unusual log pattern, a support ticket. Include what was done about it.>

## Alerts fired

<Which alerts fired, whether each was actionable, and whether the runbook entry was sufficient. A noisy alert fixed now is a night's sleep later.>

## Data verification

<For changes with a migration or backfill: the counts, spot checks and consistency queries run against production, with results.>

## Flags and cleanup

<Flag state now, when it is removed, and the cleanup tasks left — old columns, dual-write code, deprecated endpoints — each with a ticket and a date.>

## What we learned

<What to do differently next time, in the design, the plan, or the gates themselves. Include every defect QA raised after release (<qa-root>/defects/<slug>/, status from /qa-escape): for each, which dev gate or QA type should have caught it, or that none could. If a gate would not have caught something that went wrong, say so — that is how the pipeline improves.>

## Value and cost

<Did it earn its place (§23): the kill criterion from problem.md quoted, and `met` or `not met` with the number; real usage of what shipped; cloud cost per month against the G2 estimate; the initiative's token cost from Recall's Usage tab or `none recorded`. A gap over 50 % on cost needs a reason.>

| Measure | Expected | Actual | Verdict |
|---|---|---|---|

## Escaped

<Every defect found after release — by users, monitoring or QA (<qa-root>/defects/<slug>/) — one row each, with the gate whose review should have caught it, or `none` when no review could have. `gate-effect.mjs` counts these per gate against what each gate caught (§22). Nothing escaped: one row, defect `none`.>

| Defect | Found by | Should have been caught at | Why it was not |
|---|---|---|---|

## Next

<What this release means for the next piece of work, one row per thing worth carrying forward (§20). Kind: `idea` (a capability to add or change — `ideas.mjs sync` copies it to ideas.md for a human to rank), `lesson` (a habit for next time — `/sdlc-learn` reads it), `check` (a check a gate should have made — `/sdlc-improve`). Evidence: the section, panel or defect that showed it. Class: initiative · change · fix, for an idea. Nothing to carry: one row, kind `none`, saying why.>

| Kind | What | Evidence | Class |
|---|---|---|---|

## Follow-up actions

<Each action with an owner and a date. An action without both is a wish.>

| Action | Owner | Due | Ticket |
|---|---|---|---|
