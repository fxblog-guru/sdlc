---
name: dev-designing-observability
description: Use at G6/G7 to write alerts, dashboards, runbooks and env config as files, and in /sdlc-monitor (G11) for observability, runbook, post-release.
---

# Observability, runbook and post-release — G11

The test for everything you write here is one question: **if this broke in a way no test covers, how
would anyone find out, and how fast?** If the honest answer is "a customer would tell us", the
feature is not finished, however green the pipeline behind it.

> `DEV-CONTRACTS.md` §13.5 (the observability standards — logs, metrics, traces, SLOs, post-release),
> §6 (every user-visible NFR has an `SLO-NNN` with an alert), §4.2 (designed at G2, built at G7,
> proved here), §1 (`SLO-NNN` is permanent), §17 (what this document feeds).
> `DEV-PROFILE.md` §Environments for where "real traffic" is.

You are not inventing telemetry at G11. §4.2 puts the design at G2 and the instrumentation at G7.
What you do here is **prove it exists in a running environment**, write down how to act on it, and
then look back at whether the problem the whole initiative was opened for actually went away.

If you arrive and the telemetry is not there, that is a `BLOCKER` at review — not a follow-up
ticket, and not something to quietly add now. Instrumentation written at G11 has skipped G7's code
review, and a metric nobody reviewed is a metric nobody can trust when it matters.

## At G6 and G7: the ops files

Invoked at G6 and G7 as well, this skill writes the files the plan's observability tasks name, from
`<root>/_templates/skeleton/ops/` (§18.3): `ops/alerts/<service>.yml` — Prometheus rule groups, one
multi-window burn-rate alert per `SLO-NNN` with the id in an `slo` label; `ops/dashboards/<service>.json`;
`ops/runbooks/<alert>.md` in the Google SRE shape (symptom, impact, diagnose, mitigate, escalate);
`ops/config/<env>.env.example` per `DEV-PROFILE §Environments` row. Once G7 has a log, an SLO with no
alert file is `lint-dev` E091. G11 then proves these against real traffic; it does not write them.

## `observability.md` — signals with owners

**SLOs.** One per user-visible NFR in `requirements.md` (§6), each carrying an objective with a
number and a unit, a window, an error budget, a dashboard panel, and **exactly one alert that pages
only when the budget is genuinely burning** (§13.5). One alert, because an SLO with three alerts has
no owner: each one is somebody else's problem.

`SLO-NNN` ids are **permanent**, exactly like `REQ-NNN` (§1). Never renumbered, never reused, never
repointed at a different objective. The ids are cited from dashboards, alert definitions, runbook
sections and every post-release report from here on; renumbering them silently invalidates all of
it, and the invalidation is invisible because the citations still look fine.

A budget is what turns an objective into something operable. "99.9% under 300ms over 30 days" with
no budget gives an operator no way to tell a bad hour from a trend, so every small breach becomes a
question. With a budget, the question is arithmetic.

**Metrics.** RED per service — rate, errors, duration as a **histogram**, p50/p95/p99. Never only a
mean: a mean latency hides exactly the tail your users are complaining about, and it is the number
that looks best in a dashboard while the p99 is on fire. USE per resource. Plus the business
counters the PRD actually cares about, because "did anyone use it" is a question the RED metrics
cannot answer.

**Check every label for cardinality before it ships.** No user id, no raw path, no request id, no
tenant id on a per-tenant product with thousands of tenants (§13.5). High-cardinality labels do not
fail loudly; they inflate a metrics bill, then slow the query layer, then take out the dashboards
you need during the incident they helped cause. State the expected cardinality per label, with the
reasoning — `route` is bounded because it is the matched template, not the URL.

**Catalogue.** `## Log events` and `## Metrics` are seeded at G2 and revised at G7, by the grammar in
[catalogue.md](catalogue.md).

**Logs.** Structured JSON, one event per line, with the §13.5 field set: `timestamp`, `level`,
`service`, `env`, `trace_id`, `span_id`, `request_id`, pseudonymous `user_id`, `event`, and typed
fields. Never an interpolated sentence — the whole value of a structured log is that you can filter
on a field six months later, and `"user 4182 failed to import"` is not a field. No PII, no secrets,
no full request or response bodies.

Levels mean something and the meaning is operational: `error` is paged-or-fixed, `warn` is degraded,
`info` is a business event. A log line at `error` that nobody will ever act on is the same failure
as an alert with no runbook, one layer down.

**Traces.** OpenTelemetry, context propagated across every service and queue hop, spans on inbound
handlers, outbound calls and DB queries. Confirm the trace id appears in logs **and** in error
responses (§13.5) — that link is what turns "a customer says it failed at 14:32" into a diagnosis
instead of an afternoon.

**Alerts.** Per alert: condition, threshold, for-duration, severity, who is paged, and the runbook
section it links to. **Every alert has a runbook section, matched by name.** See below.

**`## Verification` is not optional and not a formality.** Each row names the query you ran, the
panel you opened, or the test alert you fired in a real environment. Planned telemetry is not
telemetry, and this section is the only thing separating a design document from evidence.

## The runbook: written for 03:00, not for review

Assume a competent engineer who did not build this, has never seen the code, and is reading on a
phone. That reader needs **commands to run, not concepts to understand**.

One section per alert in `observability.md`, **same names**, and the chain is always:

**Means** → what is actually wrong when this fires. **Impact** → who is affected and how badly, so
they can judge whether to wake anyone else. **Confirm** → the query that proves it is real and not a
monitoring artefact; roughly a third of pages are the monitoring being wrong, and five minutes spent
confirming beats an hour spent fixing a healthy system. **Likely causes** → ranked, each with the
check that distinguishes it from the others. **Mitigate** → the first action, with the exact
command. **Escalate** → who, when, and via which channel.

**Mitigation comes before diagnosis.** Stop the harm — flag off, scale out, drain, roll back — then
understand it. A runbook ordered the other way asks a tired stranger to become an expert in your
service before they are allowed to stop the bleeding.

An alert with no runbook section is a `BLOCKER` at review (§13.5), and the reason is behavioural
rather than procedural: a pager that wakes someone with no next step teaches them to silence it. The
alert still fires afterwards. It just no longer works.

Fill `## Common operations` with the things an operator will actually reach for — toggle the flag,
replay the queue, rerun the job, clear the cache, force a resync — each with its effect and whether
it is safe to run twice. "Safe to repeat" is the column people skip and the one that gets used at
04:00.

## `post-release.md`: the only place the pipeline finds out it was right

Everything before this was a prediction.

Report **observed numbers in a stated window**. "Latency looks fine" is not an observation; "p95 =
180ms against a 300ms budget, 24h window, panel linked" is. Each SLO gets its actual value and the
budget consumed — and a budget burning in week one means either the target or the implementation is
wrong, so say which, because those have opposite fixes.

Where the release carried a migration or backfill, run the counts, the spot checks and the
consistency queries against production and record the results. This is the last moment a silent
data error is cheap.

Judge the alerts that fired: was each one actionable, and was the runbook entry sufficient for the
person who used it? A noisy alert fixed this week is a night's sleep later.

### Look back at `problem.md`

This is the section that closes the ladder.

Open `<root>/intake/<slug>/problem.md`, quote the problem this initiative was opened to solve, and
judge it against real traffic. Did the thing that was wrong stop being wrong? Are people using it?
Did the number the problem statement complained about move?

**A G11 that does not look back at `problem.md` has certified only that the code runs.** Eleven
gates of correctness say the product does what the requirements said; none of them say the
requirements were the right answer to the original complaint. That is the one question only real
traffic can settle, and it is the entire reason this gate exists after deployment rather than
before it.

If the problem did not move, say so plainly. That is not a failed release — it is the most valuable
single sentence this pipeline can produce, and it is far cheaper to learn here than in the next
quarter's planning.

### And feed §17

`## What we learned` is the input to the improvement loop. For anything that went wrong, ask whether
a gate review **would have caught it if it had asked** — and if so, name the check that was missing,
so `/sdlc-improve <gate> "<check>"` has something concrete to add. If no gate could have caught it,
say that too: not every failure is preventable, and a checklist that only grows becomes a checklist
nobody reads carefully.

> An incident in the window: write the postmortem as `postmortem.md` says, and feed it to `## Escaped` and `## Next`.
> A change that can hurt users if it fails: read `incident-response.md` (severity, commander, runbook per alert; G11 row 25).
> Paid infrastructure or a paid API: read `cost-after-release.md` (tags, unit cost, budget alert, token caps; G11 row 26).

## Unknowns

What error budget the business will accept, who is on the rotation, whether a signal justifies its
retention cost — human answers. Record `DEC-NNN`, carry on with the rest, mark the dependent rows
`N/A — blocked by DEC-NNN` (§15.2). You may never set `status: assumed`; that needs a named human.

## Do not

Write instrumentation code — that is G7, and code written here skips its review. Write the gate log.
Set `status: approved`. Declare G11 `SKIPPED`. Invent a metric name that does not exist in the
running system (§12) — an unverifiable dashboard is worse than a missing one, because people act on
it. Silence or widen an alert to make the post-release numbers look better.
