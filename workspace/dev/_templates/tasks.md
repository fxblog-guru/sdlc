---
template_for: tasks
gate: G6
authored_by: dev-planning-implementation
reviewed_by: dev-reviewing-plan
---

<!--
This is the last document before code, and its job is to make implementation boring. A task that
names its files, its REQ, its test, and its definition of done can be picked up without
re-litigating any earlier decision — which is the whole point of the eleven gates around it.

Two habits pay for themselves here. First, order by risk and by dependency, not by layer: the task
that could invalidate the design goes first, while changing course is still cheap. Second, keep
tasks small enough to review in one sitting; a task nobody can review is a task nobody can verify.
-->

---
slug: <slug>
stage: plan
artifact: tasks
status: draft
authored_by: dev-planning-implementation
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Approach

<How the change will be built in a few sentences: the order, what lands behind a flag, and what the first shippable slice is.>

## Tasks

<One row per task. Files come from dev-resolving-code-placement — a task that cannot name its target files is not ready, because "somewhere in the service" is where scope creep lives. Status holds only the plan-time status (todo / blocked); execution status is tracked in <root>/implementation/<slug>/progress.md, so marking a task done never stales G6.>

| Id | Task | REQ | Stack | Files | Depends on | Test | Estimate | Status |
|---|---|---|---|---|---|---|---|---|
| TASK-001 | <one reviewable change> | REQ-001 | <go/python/react/nextjs/sql> | <paths> | <TASK ids / none> | <test path + what it proves> | <S/M/L or hours> | todo |

<The skeleton rows (DEV-CONTRACTS §18.2): keep one per `skeleton-check.mjs --source .` MISSING or FAIL row, each from <root>/_templates/skeleton/, in the first slice; delete the rows the repository already passes. Trace each to the REQ or NFR that needs it, or to `§18.2`.>

| TASK-002 | Skeleton: README tutorial (clone, run, test in ≤ 10 lines) and ARCHITECTURE C4 levels 1–2 in mermaid | <REQ-NNN / §18.2> | <stack> | README.md · ARCHITECTURE.md | none | skeleton-check README.md, ARCHITECTURE.md rows PASS | S | todo |
| TASK-003 | Skeleton: CHANGELOG (Keep a Changelog) and a SemVer `--version` (ldflags or package version) | <REQ-NNN / §18.2> | <stack> | CHANGELOG.md · <build file> | none | `<binary> --version` prints the tag; skeleton-check version row PASS | S | todo |
| TASK-004 | Skeleton: digest-pinned Dockerfile and digest-pinned CI images | <REQ-NNN / §18.2> | <stack> | Dockerfile · <CI file> | none | skeleton-check Dockerfile, CI images rows PASS; `docker build` exits 0 | S | todo |
| TASK-005 | Skeleton: Taskfile setup / dev / seed / check / check:fast (< 2 min), per-run DB name, licence step | <REQ-NNN / §18.2> | <stack> | Taskfile.yml | TASK-004 | `task check:fast` under 2 min; skeleton-check Taskfile.yml, licence check rows PASS | M | todo |
| TASK-006 | Skeleton: renovate.json, .editorconfig, .nvmrc / engines, .npmrc save-exact, exact versions | <REQ-NNN / §18.2> | <stack> | renovate.json · .editorconfig · .nvmrc · .npmrc · package.json | none | skeleton-check rows PASS | S | todo |
| TASK-007 | Ops: ops/alerts per SLO, ops/dashboards, a runbook per alert, ops/config per environment | <SLO-NNN> | <stack> | ops/alerts/<service>.yml · ops/dashboards/<service>.json · ops/runbooks/<alert>.md · ops/config/<env>.env.example | none | promtool check rules; lint-dev no E091; skeleton-check runbooks row PASS | M | todo |
| TASK-008 | Push the branch and get a green pipeline on it | <§18.3> | <stack> | <CI file> | TASK-005 | the pipeline URL on the pushed commit is green | S | todo |

## Sequence

<The execution order and what can run in parallel. Mark the riskiest task — the one most likely to send the design back to G2 — and put it first. For a large list, group tasks into slices (the first one end to end) and, inside each, lanes with disjoint file ownership — the input to /sdlc-implement's optional slice mode.>

## Definition of done (per task)

<What must be true before a task is `done`: code, unit test, integration test where a seam is crossed, telemetry, docs, and the quality gates from DEV-PROFILE. If this differs for any task, say so on that task's row.>

## Test plan for this change

<Which acceptance criteria are covered by unit tests, which by integration tests, and which are automation-tier and therefore handed to the QA bundle. The third list must match acceptance-criteria.md — a mismatch is a gap somebody will discover in production.>

| AC | Tier | Covered by | Owner |
|---|---|---|---|

## Migration and rollout tasks

<Schema tasks with their MIG ids, flag creation and default, backfill jobs, and anything that must happen in a specific order relative to deploy.>

## Observability tasks

<The log events, metrics, spans and dashboard panels this change adds — as tasks, so they ship with the feature rather than after the first incident.>

## Risks and unknowns

<What might force a return to an earlier gate, and the cheapest experiment that would settle it now.>

## Estimate summary

<Total, the confidence range, and the assumptions the estimate depends on. An estimate with no stated assumptions cannot be revised intelligently when reality differs.>
