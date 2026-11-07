---
template_for: release-plan
gate: G10
authored_by: dev-planning-deployment
reviewed_by: dev-reviewing-deployment
---

<!--
A release plan is read twice: once calmly before the deploy, and once at speed while something is
going wrong. Write for the second reading. Commands should be copy-pasteable, decisions should have
a named owner, and thresholds should be numbers rather than judgement calls — nobody makes good
judgement calls at 02:00 with a customer on the phone.

The question this plan must answer without discussion: what exactly do we type to undo this, how
long does it take, and after which step does that stop working?
-->

---
slug: <slug>
stage: deployment
artifact: release-plan
status: draft
authored_by: dev-planning-deployment
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Release

<What is being released: commit SHA, image digest, version, and the environments it will reach — with the deployment diagram as a mermaid block (dev-drawing-diagrams catalogue §10). On a cloud: link the SVG `topology.mjs render <slug>` wrote from the completed model, and state that `topology.mjs drift <slug> --iac <dirs>` exits 0 (§13.14).>

## Preconditions

<Every gate that must be green, approvals obtained, dependencies deployed, capacity confirmed, and the maintenance or freeze windows that apply. The first row is always the QA verdict: the path and date of the latest <qa-root>/reports/<slug>/*-report.md (or release sign-off), its gate lines, and that it is dated after the shipped SHA's G8 run — or the DEC-NNN in which a named human waived it (§9).>

| Precondition | Evidence | Status |
|---|---|---|
| QA verdict | <qa/reports/<slug>/YYYY-MM-DD-report.md, all gates pass; or sign-off GO; or waived in DEC-NNN by a named human> | <met or not met> |

## Secrets and config

<Every key in ops/config/keys.md this release needs, new, changed or rotated ones first. The value is never written here: name, environments, the store it lives in, and whether env-doctor.mjs found it there. Paste env-doctor's result line for each environment. No deploy step copies a key or edits an env file by hand (§13.4). A value changed in a store is a deploy: env-doctor.mjs checks it before the redeploy, and the plan names the previous deployment to promote if it fails.>

| Key | Environments | Store | New / changed / rotated | In the store |
|---|---|---|---|---|

`env-doctor.mjs --env <env>`: <READY — <env>: N key(s) checked, 0 finding(s)>

## Strategy

<Rolling, blue-green, or canary — and why this one for this change. For canary: the percentages, the soak time at each step, and the metrics that must hold to promote.>

| Step | Traffic | Soak | Promote if | Abort if |
|---|---|---|---|---|

## Rollout and rollback

<The key lines of `## Rollout and rollback` in release/<slug>/pull-request.md, copied as they are (`deploy_impact`, `db_change`, `data_change`, `rollback`, `backup`, `post_backup_writes`, `api_change`); the QA bundle reads them from here at G10. Change one only with the PR, never here alone. `deploy_impact: none` when the release touches no database or API.>

deploy_impact: <none | db | api | db, api>

## Migration ordering

<Exactly where each MIG runs relative to the code deploy, and the compatibility window during which both versions run (N-1 code against the new schema). Start from `## Rollout and rollback` in release/<slug>/pull-request.md and add the timings; cross-check against migration-plan.md — a disagreement between these documents is how a deploy takes an outage. When rows already there change, carry the PR's `### Data` part here: backup and restore tried, baseline counts, dry-run duration, the batched order, the checks after, and when the old data and the backup go. Empty while the release changes the database is deploy-plan-check E180.>

## Feature flags

<Each flag: name, default, who can change it, the rollout plan, and the date it is removed. A permanent "temporary" flag is technical debt with a login.>

| Flag | Default | Audience | Owner | Removal date |
|---|---|---|---|---|

## Deploy steps

<The ordered, copy-pasteable sequence, including who runs each step and what to check before continuing, with the pipeline as a mermaid diagram whose gates have pass and fail edges (dev-drawing-diagrams catalogue §11). No step should require someone to remember something.>

## Smoke checks

<What runs automatically after deploy, what it asserts, and where the result appears. A failed smoke check triggers the rollback below — it does not start a debugging session in production.>

## Monitoring during rollout

<The dashboards and alerts to watch, the specific numbers that mean stop, and for how long after the last step someone is actively watching.>

| Signal | Normal | Investigate | Abort |
|---|---|---|---|

## Rollback

<Per layer: code (redeploy the previous build), DB (the down migration, or restore the pre-migration snapshot, and when down is unsafe), API (how the old shape comes back). For each, the exact command, expected duration, who may decide, and how it is verified. Then the point of no return: the step after which rollback is forward-only or restore-only, what data written after it a restore loses and how it is kept, and what the forward fix looks like.>

## Communication

<Who is told before, during and after: the channel, the message, and the customer-facing notice if one is needed.>

## Post-release checks

<What is verified in the hours after, by whom, and what would reopen this release. Links forward to monitoring/<slug>/post-release.md.>

## Risks

<What could go wrong in this specific release, its early warning signal, and the mitigation.>
