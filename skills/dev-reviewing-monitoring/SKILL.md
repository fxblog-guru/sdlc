---
name: dev-reviewing-monitoring
description: G11 gate review. Use for its verdict: judges observability, runbook and post-release against the checklist and writes the gate log.
---

# Reviewing G11 — monitoring

Two questions, and the gate fails on either.

**Operationally:** if this breaks at 03:00, does a stranger get told, and does being told help them?
An alert that fires into a runbook with no matching section is a pager without a next step, and the
person who receives it learns to silence the alert rather than to fix the service.

**Substantively:** did the thing the initiative was opened for actually go away? Eleven gates have
certified that the code does what the requirements said. Only this one can ask whether that solved
the problem, because only this one has real traffic. **A G11 that does not look back at
`problem.md` has certified that the code runs, and nothing else.**

> `DEV-CONTRACTS.md` §5 (log format), §13.5 (the observability standards this gate enforces), §6
> (every user-visible NFR has an `SLO-NNN` with an alert), §4.2 (a feature that reaches G11 with no
> telemetry is a `BLOCKER`), §1 (`SLO-NNN` is permanent), §17 (what `post-release.md` feeds).
> You write `<root>/reviews/<slug>/G11-monitoring-<run-id>.md` and nothing else.

## What you receive

Paths: `monitoring/<slug>/observability.md`, `runbook.md` and `post-release.md`; the upstream
`intake/<slug>/problem.md`, `requirements/<slug>/requirements.md`,
`design/<slug>/architecture.md`; `deployment/<slug>/release-plan.md` and the `deploy-run.md` for the
run under review; `data/<slug>/migration-plan.md` where there was one; `DEV-PROFILE.md`; the
gate-log template; the source root; and the prior log on attempt 2.

Read `problem.md` first. Check 15 is a judgement against a document, and you cannot make it against
a document you met second.

## Applicability

> G11 applies to change class `initiative` (§15.1). For `change` and `fix` it is `SKIPPED` by class
> at intake.

§15.1 also says classes are claims and claims are checked. A `change` that introduced a new
user-visible NFR, a new endpoint carrying its own latency budget, or a background job nothing
currently watches has arrived here classified by size rather than by operational risk. Say so and
return `CHANGES_REQUESTED` against the class rather than `SKIPPED`: an unwatched surface is not
made safe by having been a small diff.

Where the skip is genuine, quote this rule verbatim in `skip_reason.explanation` and say why this
change does not meet it (§5.4).

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Front matter complete per §3.1 on all three artifacts, headings byte-exact, no `<placeholder>` left, no section empty |
| 2 | Every user-visible NFR in `requirements.md` has an `SLO-NNN`, and every `SLO-NNN` names the `REQ-NNN` it serves (§6) |
| 3 | No `SLO-NNN` has been renumbered, reused, or repointed at a different objective since an earlier release (§1) |
| 4 | Every SLO carries an objective with a number and a unit, a window, an error budget, a dashboard panel, and exactly one alert that fires on budget burn rather than on a single slow request |
| 5 | Every alert in `observability.md` has a section in `runbook.md` with the same name — matched mechanically, in both directions |
| 6 | Every runbook alert section answers means, impact, confirm, likely causes, mitigate and escalate, with commands rather than concepts, and mitigation before diagnosis |
| 7 | Metrics cover RED per service — duration as a histogram with p50/p95/p99, never only a mean — USE per resource, and the business counters the PRD asked for |
| 8 | Every metric label is bounded, with its expected cardinality stated: no user id, no raw path, no request id (§13.5) |
| 9 | Log events are structured with the §13.5 field set, carry typed fields rather than interpolated sentences, and contain no PII, no secret and no full body |
| 10 | Log levels are used as §13.5 defines them: `error` is paged-or-fixed, `warn` is degraded, `info` is a business event |
| 11 | Traces are OpenTelemetry, context is propagated across every service and queue hop, spans cover inbound handlers, outbound calls and DB queries, and the trace id appears in logs and in error responses |
| 12 | Health and readiness endpoints check a real dependency, and the document says what the orchestrator does with each result |
| 13 | `## Verification` names, per signal, the query run, the panel opened or the test alert fired in a real environment — not an intention |
| 14 | `post-release.md` reports observed numbers against their budgets in a stated window, per SLO, with the evidence linked |
| 15 | `post-release.md` quotes `intake/<slug>/problem.md` and judges it against real traffic: did the original problem move, and by how much |
| 16 | Where the release carried a migration or backfill, counts, spot checks and consistency queries were run against production and their results recorded |
| 17 | Alerts that fired are judged for actionability, and every runbook entry that was used is judged for sufficiency |
| 18 | Every feature flag has a current state, a removal date and a ticket; the cleanup list names the old columns, dual-write code and deprecated endpoints with owners and dates |
| 19 | The rollback path was re-verified after this release rather than assumed to still work (§13.5) |
| 20 | `## What we learned` says, for each thing that went wrong, whether a gate review could have caught it — and where it could, names the check that was missing (§17) |
| 21 | `## Next` has a row for each thing `## What we learned` and row 15 found worth carrying forward — an `idea` with its evidence, a `lesson`, or a `check` — or one `none` row saying why nothing is (§20) |
| 22 | `## Escaped` lists every defect found after release, each with the gate that should have caught it or `none`, and agrees with the QA defects for the slug (§22) |
| 23 | `## Value and cost` quotes the kill criterion and says met or not met with the number, and compares cloud and token cost with the estimate; a gap over 50 % without a reason is `MAJOR` (§23); `size.mjs check <slug>` exits 0 (§15.3) |
| 24 | Every incident in the window has a postmortem with a timeline, root causes past "human error", and actions that change the system, each fed to `## Escaped` or `## Next` (`postmortem.md`) |
| 25 | A change that can hurt users has a severity table, a named commander or rotation for the window, a runbook linked from every alert, and a first step that mitigates (roll back, switch off) before it diagnoses (`incident-response.md`) |
| 26 | A change on paid infrastructure or a paid API has cost tags, a budget alert that existed before launch, a unit cost (per request, user or tenant) beside the total, and a cap on model calls (`cost-after-release.md`) |

## Check 5: run it, do not read it

Two lists of names. Comparing them by eye is how a missing runbook section survives review, because
seven alerts and six sections look identical when you are scrolling.

```bash
grep -oP '^\| \K[^|]+(?=\|)' <root>/monitoring/<slug>/observability.md | sed -n '/alert/I,$p'
grep -n '^### ' <root>/monitoring/<slug>/runbook.md
```

Extract both name sets, sort them, and diff. Put the diff in your evidence cell.

**An alert with no runbook entry is a `BLOCKER`** — §13.5 says so explicitly, and it is the right
severity. The failure is not that one document is incomplete; it is that the alert will fire, wake a
competent stranger, give them nothing, and teach them that this service's pages are noise. The next
one that fires will be the real one.

Check the other direction too. A runbook section for an alert that no longer exists is a `MINOR`,
but it is the beginning of the same rot.

## Check 6: what makes a runbook usable

Read one section as the person being paged. You have ninety seconds and no context.

| Runbook says | Verdict |
|---|---|
| "Investigate the elevated error rate in the import service" | FAIL — that is the alert restated |
| "Check whether the upstream is healthy" | FAIL — no command, no threshold, no next step either way |
| "`kubectl -n prod logs -l app=import --since=15m \| jq 'select(.level==\"error\")'` — if `event` is `upstream_timeout`, the cause is A; mitigate with `flags set import.async off`" | PASS |

And check the order. If the section explains the architecture before it tells you how to stop the
bleeding, it was written for a reviewer, not for an operator.

## Check 13: planned telemetry is not telemetry

This is the row most likely to be quietly false, because it is the only one that requires someone to
have left the document and looked at a real system.

Every `## Verification` row should name something that happened: a query with its result, a panel
opened at a time, an alert fired in a test. Where you can, retrace one — open the dashboard link, or
grep the source for the metric name the document claims exists:

```bash
grep -rn 'checkout_orders_total\|import_duration_seconds' --include='*.go' --include='*.ts' .
```

A metric named in `observability.md` that appears nowhere in the code is a `BLOCKER`, not a typo:
someone will build an alert on it, the alert will never fire, and the absence will read as health.
This is also where §4.2 lands — a feature reaching this gate with no telemetry at all is a
`BLOCKER`, and the honest remedy is that G7 re-runs, not that it gets added now without review.

## Check 15: the question the ladder started with

Open `problem.md`. Find the sentence that says what was wrong — usually a number, a complaint, or a
cost. Then read `post-release.md` for whether that specific thing moved.

| `post-release.md` says | Verdict |
|---|---|
| nothing about `problem.md` | FAIL — this is the check, not a section |
| "the feature is working as designed" | FAIL — that is G8's claim, restated with production data |
| "support tickets tagged `import-failed` fell from 31/week to 4/week over 14 days" | PASS |
| "adoption is 6% against the 40% the problem statement assumed; the problem has not moved" | PASS — and the most useful outcome this document can have |

**An honest negative passes this check.** You are judging whether the question was asked and
answered with evidence, not whether the answer was flattering. A release that did not solve the
problem and says so has given the organisation something eleven gates of green could not.

## Severity for this gate

- `BLOCKER` — an alert with no runbook entry (check 5, §13.5); a metric, log event or dashboard that
  does not exist in the running system (check 13); no telemetry at all for a feature that reached
  this gate (§4.2); a log or metric label carrying PII, a secret, or an unbounded identifier.
- `MAJOR` — a user-visible NFR with no `SLO-NNN` (check 2); a renumbered or repointed `SLO-NNN`
  (check 3); an SLO with no error budget or with more than one alert; latency reported only as a
  mean (check 7); a runbook section that diagnoses before it mitigates (check 6); `post-release.md`
  that does not look back at `problem.md` (check 15); missing data verification after a migration
  (check 16); a flag with no removal date.
- `MINOR` — a dashboard panel with no stated audience, an orphan runbook section, a thin retention
  or cost section, a trace attribute worth adding.
- `INFO` — an alert threshold worth tightening once there is baseline data, a signal worth adding
  next release, a candidate for `/sdlc-improve`.

## Findings that are usually wrong

1. **"There should be more alerts."** More alerts is the failure mode, not the fix. §13.5 asks for
   one alert per SLO that pages on budget burn. Raise a finding only where a *user-visible* failure
   mode would produce no signal at all — and name the failure mode.
2. **"This SLO target is too lenient."** The target belongs to the business and is a `DEC-NNN`, not
   a reviewer's preference. What you can check is that it is a number, has a budget, and does not
   contradict the NFR in `requirements.md`. If it does contradict it, that is the finding — cite
   both lines.
3. **"The post-release window is too short."** Say what would have been visible in a longer window
   and is not visible in this one. Without that, it is `INFO`. A 24-hour window on a daily-batch
   feature is a real `MAJOR`; a 24-hour window on a high-traffic endpoint usually is not.
4. **"The problem was not solved, so this is a FAIL."** Check 15 asks whether the question was
   asked and answered with evidence. An honest negative is a `PASS` on the row — and, if a gate
   could have caught the cause, an `INFO` pointing at `/sdlc-improve` (§17).
5. **Rewriting the runbook entry in your finding.** Say what a paged engineer cannot do with what is
   written. Writing the commands is authoring (§4.5), and you do not know this environment well
   enough to be right about them.
6. **"`authored_by` does not match the template header."** The G11 templates' headers name the
   authoring and reviewing skills as they were before the bundle split them. §3.1 asks the artifact
   to name the skill that authored it, and the linter checks only that author and reviewer differ.
   `INFO` against the bundle at most; not a gate failure for this slug.

`PASS` with zero findings is the correct outcome for a feature that can be operated and was checked
against the reason it was built.
