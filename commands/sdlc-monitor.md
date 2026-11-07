---
description: G11 · prove telemetry, a runbook per alert, the G0 problem checked against real traffic. Last gate.
disable-model-invocation: true
argument-hint: <slug>
---

Run G11 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G11.

## Preflight (stage-specific)

- `DEV-PROFILE.md §Environments` must name a real environment — "real traffic" has to point
  somewhere.
- Needs **G10** `PASS` or `SKIPPED`.
- **There must have been a deploy.** Check for `<root>/deployment/$1/runs/*/deploy-run.md` against a
  production or production-like environment. Without one there is no real traffic: that is
  `BLOCKED`, not a thinner report. Say which run you are reviewing against and the observation
  window it makes available.
- Change class (§15.1): G11 runs for `initiative`; for `change` and `fix` it was `SKIPPED` by
  class. If the release introduced a new user-visible NFR, a new endpoint with its own latency
  budget, or a background job nothing watches, offer re-classification.
- **Confirm the telemetry was built at G7.** Grep the change for the metric and log-event names
  `design/$1/architecture.md` said this feature would emit. A feature arriving with none is a
  `BLOCKER` (§4.2), and the remedy is that G7 re-runs — not that instrumentation gets written now,
  unreviewed.
- Decisions to surface before authoring: error budgets, rotation ownership.

## Author

Spawn **`dev-release-engineer`** with:

- `<root>/intake/$1/problem.md` — **read in full**; `post-release.md` has to answer it
- `<root>/requirements/$1/requirements.md` — every user-visible NFR becomes an `SLO-NNN` (§6)
- `<root>/design/$1/architecture.md` — the signals were designed there at G2 (§4.2)
- `<root>/deployment/$1/release-plan.md` and the `deploy-run.md` under review
- `<root>/data/$1/migration-plan.md` where there was one — post-release data verification reads from it
- any earlier `<root>/monitoring/$1/observability.md`, so existing `SLO-NNN` ids are carried (§1)
- `<qa-root>/defects/$1/*.md` and the latest `<qa-root>/reports/$1/*-report.md`, where they exist — read-only;
  an escaped defect is the strongest input §17 has
- `<root>/_templates/{observability,runbook,post-release,decisions}.md`
- the repository, and read access to the running environment's dashboards if the profile provides it

It invokes `dev-designing-observability` and writes `<root>/monitoring/$1/observability.md`,
`runbook.md` and `post-release.md`.

State three things when you spawn it: every alert gets a runbook section with the **same name** —
an alert without one is a `BLOCKER` (§13.5); `## Verification` names the query run or the panel
opened, because planned telemetry is not telemetry; `post-release.md` **quotes `problem.md` and
judges it against real traffic** — a G11 that skips this has certified only that the code runs.

## Review

Reviewing skill: **`dev-reviewing-monitoring`** → `<root>/reviews/$1/G11-monitoring-<run-id>.md`.

Paths: the three monitoring artifacts, `problem.md`, `requirements.md`, `architecture.md`, the
release plan and the deploy run, `migration-plan.md` where there was one, the standard set, and
**the source root** — the reviewer greps for a metric name and finds out whether it exists, and
diffs the alert names against the runbook headings. Least of all pass the author's reading of
whether the problem was solved; that judgement is the product of this gate.

## On CHANGES_REQUESTED

A finding that "the problem did not move" is not fixed by rewriting `post-release.md` more
favourably. An honest negative is a passing answer to that check; the resolution is to record it
and open the follow-up.

## After

Report: the verdict, the `SLO-NNN` ids now in force, whether the G0 problem moved, and the
follow-ups with owners.

Then close the loop. Run `node <root>/scripts/ideas.mjs sync`: each `idea` row of `## Next` becomes an
`IDEA-NNN` in `<root>/ideas.md` for a human to rank (§20). Name the `lesson` rows and offer
`/sdlc-learn $1`. For anything `post-release.md` found that a gate review **would** have
caught, name the gate and the missing check and offer `/sdlc-improve <gate> "<the check>"`. For
anything no gate could have caught, say so. This is the last gate: name the flags still to be
removed with their dates, and stop.

## Refuse (stage-specific)

- To write instrumentation code. That is G7, for an approved TASK.
- To run G11 with no deploy behind it. That is `BLOCKED`.
- To let an `SLO-NNN` be renumbered or repointed (§1).
- To accept `## Verification` rows that describe intentions.
- To silence, widen or delete an alert so that the post-release numbers read better.
