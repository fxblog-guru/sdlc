---
description: G10 · release plan (rollout numbers, migration order, rollback) + deploy run record. After G9.
disable-model-invocation: true
argument-hint: <slug> <env>
---

Run G10 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G10.

## Preflight (stage-specific)

- `DEV-PROFILE.md`: no placeholder in `§Environments` or `§Delivery` — the promotion path, who
  deploys each environment and the CI provider all bind this stage.
- Needs **G9** `PASS` or `SKIPPED`.
- Change class (§15.1): G10 runs for `initiative`; for `change` and `fix` it was `SKIPPED` by
  class at intake. If the class is `change` or `fix` **and** this release carries a migration, a
  backfill, or a flag gating user-visible behaviour, say so and offer re-classification — those are
  exactly the releases whose deploy needed a plan.
- **QA verdict (§9).** Find the latest `<qa-root>/reports/$1/*-report.md`. It must be dated after the
  shipped SHA's G8 run and every gate line in it must pass (`overall: pass`); or a `<qa-root>/reports/release/*/*-signoff.md`
  covering `$1` says `GO`. Neither present, or a gate failing: stop with `BLOCKED` — "QA has not
  passed this release; run `/qa-analyze $1 <root>/release/$1/qa-handoff.md` through `/qa-report`".
  A human may waive QA, in writing only (`DEC-NNN` answered by a named human). Pass the report
  path to both author and reviewer.
- **Keys and host (§13.4).** Run `node <root>/scripts/env-doctor.mjs --env $2 --store <store> --project <id>`
  against `ops/config/keys.md`. A missing list, or a key not in the store for `$2`: stop with
  `BLOCKED`, naming the keys. A production host that is a developer machine with no answered
  `DEC-NNN`: `BLOCKED`.
- `node <root>/scripts/deploy-plan-check.mjs $1` fails: `BLOCKED`, naming the code (§13.4).
- Pass `<root>/data/$1/migration-plan.md` through where it exists; the plan never contradicts it.
- Decisions to surface before authoring: release window, abort authority out of hours, customer
  notice.

## Author

Spawn **`dev-release-engineer`** with:

- `<root>/release/$1/pull-request.md` — the shipped SHA, the risk section and the flag start here
- the latest `<qa-root>/reports/$1/*-report.md` (and release sign-off, where one exists) — read-only; it
  is cited under `## Preconditions`
- `<root>/data/$1/migration-plan.md` and the migration files themselves, where they exist
- `<root>/design/$1/architecture.md` and `impact.md` — the blast radius the plan has to bound
- `<root>/monitoring/$1/observability.md` if G11 has already designed the signals; abort thresholds
  read from the same metrics rather than inventing a parallel set
- `<root>/_templates/{release-plan,deploy-run,decisions}.md`
- `<root>/deployment/$1/topology.yaml` and the IaC folders, where the change runs on a cloud (§13.14)
- the repository

It invokes `dev-planning-deployment` and writes `<root>/deployment/$1/release-plan.md`, and
`<root>/deployment/$1/runs/<run-id>/deploy-run.md` once a deploy has actually run.

State two things when you spawn it: the rollback section says **what happens to data already
migrated** — "revert the commit" is not a rollback for a release that touched the schema (§7);
every promote and abort criterion is a **number with a source**, because the person reading it at
02:00 cannot ask what "looks healthy" meant.

## Review

Reviewing skill: **`dev-reviewing-deployment`** → `<root>/reviews/$1/G10-deployment-<run-id>.md`.

Paths: the release plan, the deploy-run record where one exists, the QA report and sign-off
cited in it, `migration-plan.md` and the migration files, `architecture.md`, `impact.md`, `pull-request.md`, `observability.md` where it
exists, `topology.yaml` and the IaC folders where they exist, the standard set, and **the repository** — the reviewer confirms every `MIG-*` has a
matching `*.down.sql`, diffs the `MIG-*` sets between the two documents, and checks that a claimed
expand → migrate → contract does not drop the column three files later in the same release.

## On CHANGES_REQUESTED

A rollback finding about migrated data is resolved by a data path (a reconciliation step, a
dual-read window) or an honest "rollback is forward-only after step N, and the forward fix is X".
More prose about reverting code is not a resolution.

## After

Report: the verdict, the strategy, the point of no return, whether a run record exists, and what
unlocks next. If the deploy has not run, say so: this gate approved a **plan**. The run
record is written during the deploy and re-reviewed; editing `release-plan.md` after `PASS` makes
G10 `STALE` (§4.4): the plan executed must be the one checked. On `PASS`, point at the retro:
`/sdlc-learn --from "<the owner's review>"` (§19.5).

## Refuse (stage-specific)

- To run the deploy, apply a migration, or touch any environment. This command plans and records.
- To accept a rollback that only reverts code in a release that migrated data. Say so before
  spawning the reviewer if you can see it.
- To let the class decide the risk. A `fix` that ships a migration is a re-classification (§15.1).
