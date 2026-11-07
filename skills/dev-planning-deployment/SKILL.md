---
name: dev-planning-deployment
description: Use in /sdlc-deploy (G10) to write release-plan.md and deploy-run.md: rollout in numbers, migration order, rollback that covers migrated data.
---

# Planning a deployment — G10

A release plan is read twice: once calmly, a day before, and once at speed while something is going
wrong. **Write for the second reading.** Nobody makes good judgement calls at 02:00 with a customer
on the phone, so the plan replaces judgement with numbers, named people and copy-pasteable
commands.

> `DEV-CONTRACTS.md` §13.4 (the deployment standards you may not contradict), §7 (migration ordering
> and expand → migrate → contract), §2 (paths), §15.2 (unknowns become `DEC-NNN`).
> `DEV-PROFILE.md` §Environments (the promotion path, the host and who deploys each one, the secret
> store) and §Delivery. The keys the app reads: `ops/config/keys.md`.
> A stateful store, more load, a pipeline change, or users who would notice an outage: read `sre-principles.md` (backup proved by restore, RPO/RTO, progressive delivery; G10 rows 24–27).
> A public web release: copy `go-live.md` into `## Preconditions` (G10 row 28). G10 promotes what the pipeline already deployed to `staging`; it never chooses the host (§18.7).

You write `deployment/<slug>/release-plan.md` before the deploy and
`deployment/<slug>/runs/<run-id>/deploy-run.md` as it happens. They are separate documents because
they diverge, and the divergence is the useful part.

## The strategy is a choice, with numbers

§13.4 requires every release to name its rollout strategy — rolling, blue-green, or canary with
percentages and promotion criteria — and to say why **this** one for **this** change. A strategy
inherited from the last release is not a choice; it is a habit that happens to be written down.

For a canary, the `## Strategy` table needs four things per step, all falsifiable:

| Column | What makes it real |
|---|---|
| Traffic | a percentage, and what it is a percentage *of* — requests, users, tenants, pods |
| Soak | a duration long enough that the promote signal can have moved |
| Promote if | a metric, a threshold and a source: "error rate < 0.5% on the checkout panel" |
| Abort if | the same, for the bad direction — and it is not the negation of "promote if" |

**The soak time is where canaries fail quietly.** If you promote after five minutes on a metric
whose reporting window is fifteen, you are promoting on an average that has barely seen the new
version — the canary ran, produced a number, and the number meant nothing. State the slowest signal
you promote on and make the soak cover at least one full period of it. Where the feature is
low-traffic, say how many requests the canary must actually have served before the numbers count;
1% of a quiet endpoint overnight is three requests.

## The abort signal, and who may pull it

Name the signal as a metric with a threshold and a place to read it during the rollout — not
"if errors spike". Then name **who decides**, by role, reachable at the hour the deploy runs. An
abort authority that is one person who is asleep is not an abort authority.

The cost of leaving this vague is specific and repeatable: the graph looks bad, nobody is sure it is
bad enough, everyone waits for someone senior, and the window in which rollback was cheap closes
while the group is still deciding.

## Rollback: the section people fake

**A rollback step that says "revert the commit and redeploy" has not been written.** Code reverts
cleanly. Data does not, and almost every release that hurt anybody hurt them through data.

The plan answers four questions:

1. **The exact command**, copy-pasteable, and how long it takes. "Roll back the deployment" is not a
   command.
2. **What happens to data already migrated or already written by the new code.** If the new version
   wrote rows in a shape the old version cannot read, reverting the code makes those rows invisible
   or fatal. Say which, and say what reconciles them.
3. **Who may decide**, and how it is verified afterwards — the check that proves the old version is
   serving, not just that the deploy command exited zero.
4. **The point of no return**: the step after which rollback is forward-only, and what the forward
   fix is. Every release has one. A plan that does not name it has one anyway, and will find it
   during the incident.

This is exactly where **expand → migrate → contract** (§7) earns its keep. Add the new column
nullable, backfill it, dual-write, and only *drop* the old one in a later release — and the whole
time, the previous version of the code can still run. Skip the discipline and you have bought a
release with no rollback at all: the moment the contract step runs in the same deploy that stopped
using the old column, "revert the code" means "serve from a column that no longer exists".

If this release genuinely has no rollback after step N, **write that sentence**. A plan that admits
a one-way door is far safer than one that implies a door that is not there.

## Migration ordering is stated, and it must agree with G3

§7 requires `release-plan.md` to state whether each `MIG-*` runs before, with, or after the code —
and the rollback order. Cross-check against `data/<slug>/migration-plan.md`. **A disagreement
between these two documents is how a deploy takes an outage**: one says the backfill runs first, the
other assumes the new code is already writing, and neither author is in the room when it runs.

Name the compatibility window too — the period during which both versions are live and both must be
able to read and write the data. That window is the thing a canary actually depends on.

Start from `## Rollout and rollback` in `release/<slug>/pull-request.md`: copy its `key: value`
lines into the plan's own `## Rollout and rollback` unchanged (the QA bundle reads them there). G9
already stated the deploy impact, each migration's class, the snapshot command for this host, the API rollout order
and the rollback per layer. Expand it with timings and thresholds; never restate it differently.
The snapshot runs in the pipeline before the first migration of each environment (the skeleton's
optional `snapshot_*` jobs), and `staging` migrates and smokes before `production` does.

**When a migration changes rows already there** (a backfill, split, merge, type change, re-key,
delete or import), `## Migration ordering` carries the PR's `### Data` part in full:

- *Before:* the backup (what, how on this host, where, how long it is kept, and the restore tried on
  staging), the baseline (row counts per affected table, checksums or sample queries), and a dry run
  on a staging copy at production volume with the measured duration and lock impact.
- *During:* schema expand → code that reads and writes both shapes → the data migration, batched,
  resumable and reporting progress → reads switch → contract in a later deploy; and whether the site
  stays up, or the maintenance window and who announces it.
- *After:* counts and checksums against the baseline, orphan and constraint checks, the sample
  queries, the smoke tests; when the old data or columns drop, and when the backup is deleted.
- *Rollback:* the step after which restoring the backup is the only way back, and what written after
  the change a restore loses — exported as a delta and replayed, or accepted by a named human.

`deploy-plan-check.mjs <slug>` exits 0 before the plan goes to review.

## Flags, reproducibility and smoke checks

**Feature flags** (§13.4): name, default, audience, owner, and a removal date. A permanent
"temporary" flag is technical debt with a login, and its cost is not the flag — it is that every
future reader has to work out which branch of it production is on.

**Reproducibility** (§13.4): pinned image digest, recorded commit SHA, and no unscripted manual
step. "Then someone updates the config" is a step that will be done differently in staging and
production, and the difference will be discovered in production. Anything touching data gets a dry
run on production-like data first.

**Identity is readable from outside.** Recording the commit is half of it; the running system must
also *say* what it is, or nothing downstream can tell the new release from the old one still
serving. Every deployable answers "which build are you?" on a surface a test runner can read
without credentials: a version endpoint or response header for a service, a meta tag or build-info
file for a web bundle, the version and build number of a mobile or desktop client, the applied
migration for a schema — and, where behaviour depends on it, a digest of the flag set. A pod that
did not roll, a CDN still serving yesterday's bundle and a preview environment of another branch all
answer 200 on `/health`; only an identity check tells them apart. The plan names each surface, and a
deployable without one is a task in this release, not a note.

**Smoke checks** run automatically, assert something falsifiable, and report somewhere the operator
is already looking. **The first assertion is identity: what is live equals the commit just
deployed** — a smoke that passes against the old pod proves the old release works. A smoke check
that asserts the service returns 200 on `/health` proves the process started, not that the release
works — assert the thing this release changed. **A failed
smoke check triggers the rollback above. It does not start a debugging session in production.**

**Promotion** follows `DEV-PROFILE §Environments`: local → dev → staging → production, each with the
gate that must be green before the next.

## Secrets and config: a required section

`release-plan.md` has a `## Secrets and config` section, and it is a table, not a sentence. One row
per key in `ops/config/keys.md` this release needs — new, changed or rotated keys first — with the
environments, the store it lives in, and whether `env-doctor.mjs` found it there. Run
`node <root>/scripts/env-doctor.mjs --env <env> --store gitlab --project <id>` (or against the env file
the deploy job writes) and paste its result line. A key that is not in the store is `not met` under
`## Preconditions`, and the plan says so.

**No step copies a key by hand.** The deploy job writes the env file from the store, runs
`env-doctor.mjs`, starts the app and deletes the file. "Then update the server's `.env`" is the
unscripted manual step §13.4 forbids, and it is how one environment ends up with a key nobody can
trace. The store, the key list, the G0 questions and the first-slice pipeline tasks are in
`secrets-and-environments.md`; read it when the profile still has a placeholder there.

## `deploy-run.md` records what happened

One row per step, with timestamps taken **as they happen**. An honest "step 4 took 22 minutes, not
the 5 we estimated" is worth more than a tidy narrative written the next morning, because the next
plan is written from this file.

Two things people get wrong here:

**Deviations are the point of the document.** The `## Deviations from the plan` section is not an
admission of sloppiness; it is the only place the next release learns anything. A run record with no
deviations and a deploy that everyone remembers as messy means the record was written from the plan
rather than from the deploy.

**A rollback is a successful outcome of a plan, not a failure of one.** The plan's job was to make
the bad outcome cheap and detectable. A canary that aborted at 5%, rolled back in four minutes and
left no customer impact is the mechanism working exactly as designed — record it in
`## Rollout progression` with the abort decision and who made it, and in `## Final state` with what
is live where. Writing it up as a failure teaches the next author to promote through a bad signal.

Record migrations with their **actual** duration, the lock behaviour observed, and row counts before
and after. A backfill that estimated two minutes and took forty is the single most useful number in
this file.

## The QA verdict is a precondition, not a courtesy

The first row of `## Preconditions` is QA's answer: the latest `<qa-root>/reports/<slug>/*-report.md`,
with its date and its gate lines, or the release sign-off that says `GO`. Open the file and quote
it; do not write "QA passed" from memory. If it is missing, not dated after the shipped SHA's G8 run, or has a
failing gate, the row is `not met` and the plan says so — the command will return `BLOCKED` and
that is the correct outcome. Only a named human may waive it, in a `DEC-NNN` the plan cites (§9).

## Unknowns

The release window, who holds abort authority out of hours, whether a customer notice is needed,
what error rate is acceptable during a canary — these are human answers. Record `DEC-NNN`, carry on
with the rest of the plan, and mark the dependent sections `N/A — blocked by DEC-NNN` (§15.2).

You may not set `status: assumed`. That field needs a named human, and a default you chose for
yourself is still your answer to a question you were told you could not answer.

## Do not

Execute the deploy, run a migration, or touch production. Write code. Write the gate log. Set
`status: approved`. Declare G10 `SKIPPED` — only the reviewer may do that, against its published
applicability rule (§5.4). Design the telemetry: which signals exist is G11's document, and you
consume it rather than inventing a second copy.

One path note: the `release-plan.md` template's hint under `## Post-release checks` points at
`ops/<slug>/post-release.md`. The contract's §2 path is `monitoring/<slug>/post-release.md`, and
`DEV-CONTRACTS.md` wins over any other file in this bundle. Link the §2 path.
