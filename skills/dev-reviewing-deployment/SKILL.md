---
name: dev-reviewing-deployment
description: G10 gate review. Use for its verdict: judges release-plan.md and deploy-run.md against the checklist and writes the gate log.
---

# Reviewing G10 — deployment

One question decides this gate: **at 02:00, with the graph going the wrong way, could someone who
did not write this plan stop it?**

Everything on the checklist is a way of asking that. A plan can be thorough, well organised and
completely unusable under pressure, because the parts that matter then — the number that means
stop, the name of the person who may say stop, the command that undoes it — are the parts that are
easiest to write as a sentence and hardest to write as a fact.

> `DEV-CONTRACTS.md` §5 (log format), §13.4 (the deployment standards this gate enforces), §7
> (migration ordering, reversibility, expand → migrate → contract), §12 (never fake a gate).
> `DEV-PROFILE.md` §Environments and §Delivery. You write
> `<root>/reviews/<slug>/G10-deployment-<run-id>.md` and nothing else.

## What you receive

Paths: `deployment/<slug>/release-plan.md`; `deployment/<slug>/runs/<run-id>/deploy-run.md` where a
run has happened; the upstream `data/<slug>/migration-plan.md` and the migration files;
`design/<slug>/architecture.md` and `impact.md`; `release/<slug>/pull-request.md`;
`monitoring/<slug>/observability.md` where G11 has already designed the signals;
`<root>/decisions/<slug>.md`; `DEV-PROFILE.md`; the gate-log template; the repository; and the prior
log on attempt 2.

Read `migration-plan.md` before the release plan. Check 8 is a comparison, and you cannot compare
against a document you have not read.

## Applicability

> G10 applies to change class `initiative` and `fast` (§15.1). For `change` and `fix` it is
> `SKIPPED` by class at intake.

For `fast`, the deploy runs through the pipeline slice 1 built; a production deploy from a laptop,
or a key copied by hand, fails the gate (§13.4).

But §15.1 also says classes are claims and claims are checked. If a `change` or `fix` reaches you
carrying a migration, a backfill, a flag that gates user-visible behaviour, or anything whose
rollback is not "redeploy the previous image", the finding is that the class is wrong — those are
precisely the releases whose deploy needed a plan, and they arrived here because someone classified
by size rather than by risk. Say so, name the artefact that shows it, and return
`CHANGES_REQUESTED` against the class rather than `SKIPPED`.

Where the skip is genuine, quote this rule verbatim in `skip_reason.explanation` and say why this
change does not meet it (§5.4). A skipped G10 does not skip the deploy plan: a DB or API change
still states it in `pull-request.md` `## Rollout and rollback`, judged at G9 (row 27) and by
`deploy-plan-check.mjs` in CI.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Front matter complete per §3.1, headings byte-exact, no `<placeholder>` left, no section empty |
| 2 | The rollout strategy is named and justified for **this** change, not inherited (§13.4) |
| 3 | For a canary or phased rollout, every step carries a traffic percentage, a soak duration, a promote-if and an abort-if — as numbers with a source, not descriptions |
| 4 | The soak at each step covers at least one full reporting period of the slowest signal it promotes on, and the step states the minimum traffic volume below which the numbers do not count |
| 5 | The abort signal is a named metric with a threshold and a place it can be read **during** the rollout |
| 6 | A named role may pull the abort, is reachable at the hour the deploy runs, and needs nobody else's agreement |
| 7 | Rollback gives the exact command, its expected duration, who decides, and the check that verifies the old version is actually serving; an empty `## Rollback` is `lint-dev` E035 |
| 8 | Rollback states what happens to data already migrated or written by the new code — not "revert the commit" |
| 9 | The point of no return is named: the step after which rollback is forward-only, and what the forward fix is |
| 10 | Each `MIG-*` has its ordering against the code deploy stated, and it does not contradict `migration-plan.md` (§7) |
| 11 | Where a column, table or contract is changing, expand → migrate → contract is followed, and the compatibility window during which both versions run is named (§7) |
| 12 | Every feature flag carries a name, a default, an audience, an owner and a removal date (§13.4) |
| 13 | The deploy is reproducible: pinned image digest, recorded commit SHA, no unscripted manual step |
| 14 | A dry run on production-like data precedes anything that touches data |
| 15 | Smoke checks run automatically, assert what this release changed rather than that the process started, and a failure triggers the rollback rather than an investigation in production |
| 16 | The promotion path matches `DEV-PROFILE §Environments`, each hop naming the gate that must be green |
| 17 | Health and readiness endpoints are wired to the orchestrator, and readiness checks a dependency rather than returning 200 unconditionally |
| 18 | Monitoring during rollout names the signals, the numbers that mean investigate, the numbers that mean abort, and how long someone actively watches after the last step |
| 19 | Communication says who is told before, during and after, and whether a customer-facing notice is needed |
| 20 | `deploy-run.md`, where one exists: every plan step has a row with real timestamps, migrations carry actual durations and row counts, deviations are recorded, and each promote or abort decision is attributed to a person |
| 21 | Unknowns are recorded as `DEC-NNN` and left unresolved: no step of the plan is written to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 22 | The QA verdict is a met precondition (§9): `## Preconditions` cites the latest `<qa-root>/reports/<slug>/*-report.md` (or a release sign-off saying `GO`), you opened it, every gate line passes (`overall: pass`), and its date is after the shipped SHA's G8 run — or a named human waived QA in an answered `DEC-NNN` that the plan quotes |
| 23 | Where `topology.yaml` exists: `topology.mjs check` and `topology.mjs drift <slug> --iac <dirs>` exit 0 (every designed component is built, every built resource is designed, `iac: false` rows explained in the plan); `## Release` links the SVG `render` wrote from the current model; the IaC is planned in CI and applied from the pipeline with OIDC, never a stored key; state is remote and per environment (§13.14) |
| 24 | A stateful store states its RPO and RTO, the backup mechanism meets them, and a restore has been run with its time recorded; "backups enabled" alone fails (`sre-principles.md`) |
| 25 | One artifact (digest) is built once and promoted through every environment; a rebuild per environment fails (`sre-principles.md`) |
| 26 | A user-visible change rolls out progressively (canary, percentage or flag) with an automatic abort condition tied to an SLO, or names a human-accepted reason why not (`sre-principles.md`) |
| 27 | Expected peak load, headroom and the first resource to saturate are stated; calls to dependencies have timeouts and capped retries with backoff (`sre-principles.md`) |
| 28 | `## Secrets and config` lists every key `ops/config/keys.md` gives this release's environments, each in the store `DEV-PROFILE §Environments` names, with `env-doctor.mjs`'s `READY` line pasted; a step that copies a key, pastes it or edits an env file by hand fails the row, and so does a production host that is a developer machine without an answered `DEC-NNN`. The row also fails when a store does not match the host: app keys in CI variables when the host has its own runtime store, a long-lived cloud key in CI where OIDC is available, or a production value kept in a file on a developer machine (§13.4, `secrets-and-environments.md`) |
| 29 | A pipeline change: images, actions and tools are pinned, cloud access uses OIDC or a scoped rotated token, production deploys require a protected branch and environment, and no gate is allowed to fail (`ci-cd.md`) |
| 30 | A public web release copies the rows of `dev-planning-deployment/go-live.md` that apply into `## Preconditions`, each with its evidence (a URL, a command and its output), and a row that does not apply says why |
| 31 | A release or runbook step that changes a key's value in a store runs `env-doctor.mjs` against it first (the pipeline, or a CI job that reads the store, by name and format, printing no value), the key's Format in `keys.md` states the exact shape the app accepts, and the step names the previous deployment to promote and the host's way to do it. A step that edits a store value and redeploys without the check fails the row (§13.4, `secrets-and-environments.md`) |
| 32 | Mail sender is on an owned, authenticated domain; test delivery to Gmail and Outlook recorded. A sender on a free-mailbox domain, an `env-doctor.mjs` finding on the sender, a missing DKIM, DMARC, SPF or return-path, or verification record, or "the provider says sent" as the only evidence fails the row; `N/A` only when the product sends no mail (§13.4, `secrets-and-environments.md`) |
| 33 | `deploy-plan-check.mjs <slug>` exits 0, and the plan's `## Rollout and rollback` carries the PR's key lines unchanged (`deploy_impact`, `db_change`, `data_change`, `rollback`, `backup`, `post_backup_writes`, `api_change`): the same migrations with the same class, the snapshot step for this host before the first migration, `staging` migrated and smoked before `production`, and a rollback per layer (code, DB, API) with the person who decides. Where a migration changes existing rows, `## Migration ordering` carries the `### Data` part: backup with a restore tried on staging, baseline counts and checksums, a dry run at production volume, the batched order, uptime or the maintenance window and who announces it, the checks against the baseline after, when the old data and the backup go, the restore-only point and what a restore loses. A missing, empty or `TBD` part fails the row (§7, §13.4) |

## Check 8 is the one that fails plans

Read the rollback section and ask the literal question: **if I run this command right now, what is
in the database?**

| What the plan says | What you check |
|---|---|
| "revert the commit and redeploy" | did this release run a migration? if yes, this is a `BLOCKER` |
| "roll back the migration" | does the `*.down.sql` exist, and is it reversible without data loss (§7)? |
| "the migration is additive, so rollback is safe" | did the new code write rows the old code cannot read? new enum values, a new discriminator, a column the old version requires to be null |
| "we would roll forward" | that is a legitimate answer — is the forward fix written, and is the point of no return named (check 9)? |

The failure mode is not a missing section. It is a section that reads as complete because it
describes reverting code, in a release whose risk was entirely in the data.

## Check 3: how to tell a threshold from a sentence

Quote the cell. If the quote could be satisfied by two operators reaching opposite conclusions at
the same moment, it is not a threshold.

| Cell | Verdict |
|---|---|
| "abort if error rate spikes" | FAIL — a spike from 0.01% to 0.04% is a spike |
| "abort if 5xx > 0.5% over 10 min on the orders panel" | PASS |
| "promote if metrics look healthy" | FAIL |
| "promote if p95 < 400ms and 5xx < 0.2%, 15 min, checkout dashboard" | PASS |

Put the quote in your evidence cell. It persuades far better than a paraphrase, because the author
reads their own sentence and sees the gap.

## Checks 10 and 11: verify, do not accept

This is a comparison between two documents and a directory of SQL, so run it.

```bash
grep -o 'MIG-[0-9]\+' <root>/deployment/<slug>/release-plan.md | sort -u
grep -o 'MIG-[0-9]\+' <root>/data/<slug>/migration-plan.md      | sort -u
ls <migrations dir> | grep -E '\.(up|down)\.sql$'
```

A `MIG-*` in one document and not the other is a `MAJOR` before you have read a word of either. An
`*.up.sql` with no `*.down.sql` is a §7 violation the G3 gate should have caught and this one
inherits. And where the plan claims expand → migrate → contract, open the migration and confirm the
drop is genuinely in a later release rather than three files down in the same one.

## Check 20: judge the record, not the outcome

A `deploy-run.md` that records a rollback is not a failing artifact. **A rollback is a successful
outcome of a plan** — the plan made a bad release cheap and detectable, and the mechanism worked.
Judge whether the record is honest and complete: timestamps taken as they happened, deviations
written down, decisions attributed to a person.

The artifact to be suspicious of is the opposite one: a run record whose steps match the plan
exactly, to the estimated minute, with no deviations. That is usually a document written from the
plan afterwards rather than from the deploy as it happened, and it teaches the next planner nothing.
Look for the migration durations and row counts — those are hard to reconstruct and easy to omit.

## Severity for this gate

- `BLOCKER` — a release with no passing QA verdict and no human waiver (check 22); a rollback that ignores migrated data (check 8); a data-changing migration with no backup, no baseline or no verification after (check 33); a migration with no working `down`
  and no stated forward-only path; a smoke-check failure that leads to investigation in production
  instead of rollback; an unscripted manual step in a production deploy; a store value changed and
  redeployed without `env-doctor.mjs` (check 31); product mail from a free-mailbox domain (check 32).
- `MAJOR` — abort or promote criteria that are not numbers (check 3); a soak shorter than the signal
  it reads (check 4); no named abort authority (check 6); ordering that contradicts
  `migration-plan.md` (check 10); a contract step in the same release as the code that stopped using
  the column (check 11); a flag with no owner or no removal date; an unattributed promote decision
  in `deploy-run.md`.
- `MINOR` — a vague communication plan, a readiness endpoint that is thin, a missing row count in
  the run record, watch duration unstated after the final step.
- `INFO` — a strategy worth reconsidering next time, a step worth automating, a threshold worth
  tightening once there is baseline data.

## Findings that are usually wrong

1. **"This should have been a canary."** Rolling is a legitimate choice for a change with no data
   risk and an instant rollback. The check is that the choice was made and justified (check 2), not
   that it matches your preference. Only raise it as `MAJOR` when the change's own risk section
   contradicts the strategy.
2. **"The rollback is too slow."** Compare against something — the error budget in
   `observability.md`, or the blast radius of one canary step. A four-minute rollback at 5% traffic
   is not a finding. A four-minute rollback at 100% with no canary might be.
3. **"They rolled back, so the plan failed."** See check 20. Grading an abort as a failure is how
   the next release gets promoted through a bad signal.
4. **Writing the rollback procedure in your finding.** Say what is missing and what must be true.
   Writing the commands is authoring, and you may not author (§4.5) — you will also be wrong about
   this environment in a way the author would have caught.
5. **"`authored_by` does not match the template header."** The G10 templates' headers name the
   authoring skill as it was before the bundle split it. §3.1 asks the artifact to name the skill
   that authored it, and the linter checks only that author and reviewer differ. `INFO` against the
   bundle at most; not a gate failure for this slug.

`PASS` with zero findings is the correct outcome for a plan that could be executed by a stranger.

## Check 21: the plan that quietly decided

An open decision reaches G10 in a particular shape: not as a missing paragraph, but as a plan step
that could only have been written by picking one branch. A canary percentage, a soak time, who may
abort, whether the migration runs before or after the code — each looks like operational detail and
each can be the answer to a question the ledger still shows as open.

Read `<root>/decisions/<slug>.md` before the plan, not after. Then, for every open row, find the plan
steps that turn on it. A step that does is `MAJOR`: the plan is not wrong, it is **unauthorised**,
and the cost lands during the rollout when someone asks who agreed that this could be aborted by
whoever happens to be on call.

The remedy is never to set the row `assumed` — that needs a named human (§15.2), and an agent
setting it has answered the question in the format that hides having answered it. The remedy is
`N/A — blocked by DEC-NNN` on the dependent step, with the rest of the plan written in full. A
deployment cannot execute against a blocked step, and that is the point: it is better for a rollout
to stop at the planning table than at 40% traffic.
