---
template_for: pull-request
gate: G9
authored_by: dev-packaging-release
reviewed_by: dev-reviewing-release
---

<!--
A PR description is written for the reviewer, not for the author's memory. The reviewer's first
question is always "what am I being asked to believe, and what would make me doubt it?" — so the
risky parts and the evidence come before the tour of the code.

The gate log links are what make this PR auditable months later: they show the design was reviewed,
the checks actually ran, and what the reviewer at each stage objected to.

The front matter stays in the repository copy; strip it when pasting the body into the PR.
-->

---
slug: <slug>
stage: release
artifact: pull-request
status: draft
authored_by: dev-packaging-release
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## What and why

<The change in two or three sentences, and the problem it solves. Link the tracker key and the PRD.>

## Requirements covered

| REQ | Title | Acceptance criteria | Proved by |
|---|---|---|---|

## Approach

<How it was built, and the one or two decisions a reviewer would otherwise have to reverse-engineer. Link the ADRs.>

## Interfaces and schema

<API changes with the contract path and whether any are breaking; schema changes with their MIG ids and the migration ordering against this deploy. The deploy impact itself is the `key: value` lines of `## Rollout and rollback`, which the QA bundle reads.>

## Testing

<What was added and what it proves — unit, integration, and the criteria deliberately left to the QA bundle. Paste the relevant numbers rather than saying "tests pass".>

## Gate logs

<Links to the G7 (code review) and G8 (verification) logs, plus any gate that was skipped or overridden and why. Then one line per G8 gate NOT RUN because CI runs it: `CI proof: <gate, as in verify.md> — <CI job URL or saved log path> — passed` (DEV-CONTRACTS §5.6).>

## Risk and rollout

<What could break, how it is detected, and the flag and its default. How it deploys and comes back is the next section.>

## Rollout and rollback

<!--
How this change reaches production and how it comes back (DEV-CONTRACTS §7, §13.4).
deploy-plan-check.mjs reads it whenever the diff touches a migration, a schema file, an API contract
or an event schema, and fails it when it is missing, says none, or leaves a needed line empty.

The plain `key: value` lines come first and keep their names and values exactly: the QA bundle
copies them into its test plan. A change with no DB or API change keeps `deploy_impact: none`
and deletes the rest. Delete the db_* and DB lines when there is no database change, the api_*
and API lines when there is no API change, and `backup`, `post_backup_writes` and `### Data`
when `data_change` is none. An additive-only migration (nullable ADD COLUMN, CREATE TABLE,
CREATE INDEX CONCURRENTLY, a wider CHECK list) with `data_change: none` needs only the keys,
`- DB migrations:` and the five lines from `- Order:` to `- Rehearsed on staging:`.
-->

deploy_impact: <none | db | api | db, api>
other_impact: <none | config-secrets | feature-flag — optional>
db_change: <additive | expand | contract — <the release from which the code no longer uses the old shape>>
data_change: <none | backfill | transform | split-merge | type-change | delete | import>
rollback: <the methods, e.g. redeploy-previous, down-migration, snapshot-restore>
backup: <how and where, e.g. Neon branch pre-<sha> of production, kept 14 days>
post_backup_writes: <delta-export | replay | write-freeze — <how>>
api_change: <additive | versioned | deprecated — a breaking change is never unversioned>

- DB migrations: <each MIG id or file, separated by `;`>
- DB N-1 compatible: <yes or no: does the build still running during the deploy work against the new schema, and why>
- DB expand/contract: <the separate deploys a rename or drop is split across, or `not needed — no rename or drop`>
- DB lock risk: <the largest table touched, its rows, the lock each statement takes and for how long>
- DB backfill: <none, or how it runs: separate from the DDL, batched, resumable>
- DB snapshot: <the command or pipeline step per host before migrating, e.g. `neonctl branches create --name pre-$CI_COMMIT_SHORT_SHA`, `aws rds create-db-snapshot`, `pg_dump -Fc`, `gcloud sql backups create`>
- API versioning: <the version, or the deprecation window with its date; `not needed — additive`>
- API clients: <who still sends or reads the old shape: web, mobile, partners, cached old JS bundles>
- API order: <server first, then clients; or why not>
- Order: <the pipeline steps in order, e.g. snapshot → migrate staging → deploy staging → smoke → migrate production → deploy production, and why migrate goes before or after the code>
- Verify: <the check after each step, and where its result shows>
- Rollback code: <redeploy the previous build: the command or job>
- Rollback DB: <the down migration, or restore the snapshot; say when down is unsafe and the way back is forward-only>
- Rollback API: <how the old shape comes back for clients that never upgraded>
- Decides: <the named person who calls the rollback>
- Rehearsed on staging: <what ran on staging, when, and what it showed>

### Data

<!-- Only when a migration or script changes, moves, transforms or deletes rows already there. -->

- Data restore tried: <the backup restored once on staging: when, how long it took, and how long the copy is kept>
- Data baseline: <row counts per affected table, and the checksums or sample queries recorded before the change>
- Data dry run: <on a staging copy with production-like volume: measured duration and lock impact>
- Data order: <schema expand → code that reads and writes both shapes → batched, resumable migration with progress → switch reads → contract in a later deploy>
- Data uptime: <the site stays up, or the maintenance window and who announces it>
- Data verify: <counts and checksums against the baseline, orphan and constraint checks, the sample queries, the smoke tests>
- Data cleanup: <when the old data or columns are dropped, and when the backup is deleted>
- Data restore point: <the step after which restoring the backup is the only way back>
- Data loss on restore: <what written after the change is lost on restore, and how post_backup_writes keeps it>

## Reviewer notes

<Where to look hardest, what the author is least sure about, and anything deliberately left out of scope.>

## Checklist

- [ ] Every quality gate in DEV-PROFILE is green, or explicitly waived in the G8 log
- [ ] Every gate G8 deferred to CI has a `CI proof:` line above, from a job that ran it and passed
- [ ] No secret, credential or personal data in the diff
- [ ] Migration is reversible and the round-trip ran clean
- [ ] `deploy-plan-check.mjs` exits 0: a DB or API change states its rollout and rollback
- [ ] Telemetry for this change ships in this PR
- [ ] Documentation and the QA handoff are updated
- [ ] Breaking changes carry an ADR and a deprecation path
