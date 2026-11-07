---
template_for: observability
gate: G11
authored_by: dev-designing-observability
reviewed_by: dev-reviewing-monitoring
---

<!--
The test for this document is simple: if this feature broke in a way no test covers, how would
anyone find out, and how fast? If the honest answer is "a customer would tell us", the feature is
not finished regardless of how green the pipeline is.

Two failure patterns are worth designing against explicitly. Alerts that fire without a runbook
entry train people to ignore alerts. And high-cardinality labels — user ids, raw URL paths, request
ids as metric labels — quietly turn a metrics bill into an incident of its own.
-->

---
slug: <slug>
stage: monitoring
artifact: observability
status: draft
authored_by: dev-designing-observability
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## What we need to see

<The questions this telemetry must answer, in plain language: is it working, for whom is it failing, how fast is it, and is it getting worse.>

## Service level objectives

<One row per user-visible NFR from requirements.md. Each SLO needs an error budget and exactly one alert that fires when the budget is genuinely burning — not when a single request is slow.>

| Id | REQ | Objective | Window | Error budget | Alert | Dashboard panel |
|---|---|---|---|---|---|---|
| SLO-001 | REQ-101 | <99.9% of requests under 300ms> | <30d> | <0.1%> | <alert name> | <panel> |

## Metrics

<The closed list of every metric the code registers (DEV-CONTRACTS §13.11). G2 seeds it, G7 revises it with the code, obs-check.mjs fails a metric in one and not the other. RED for services, USE for resources, plus the business counters the PRD cares about. Names are <app>_<noun>_<unit>: counters end _total, sizes _bytes, a latency histogram _duration_seconds, a gauge names its unit. Check every label for cardinality before shipping it.>

| Metric | Type | Labels | Cardinality | Serves |
|---|---|---|---|---|
| <app>_http_request_duration_seconds | histogram | route, method, status_class | <routes × 5 × 5> | RED: duration |

## Log events

<The closed list of every event the code emits, through one logging API (DEV-CONTRACTS §13.11). Names are <domain>.<noun>_<verb>, the verb from created, updated, deleted, completed, failed, started, refused, skipped, retried, expired, sent, received; each event has one fixed level. A name is always a literal, never concatenated. Level means something: error is paged or fixed, warn is degraded, info is a business event. No PII, no secrets, no full request bodies.>

| Event | Level | Fields | Emitted when |
|---|---|---|---|
| http.request_completed | info | http.request.method, http.route, http.response.status_code, duration_ms, request_id | <once per request; the response echoes request_id in X-Request-Id> |

## Traces

<Which spans are created, what attributes they carry, and where context is propagated across services and queues. Confirm the trace id appears in logs and in error responses — that link is what turns a customer report into a diagnosis.>

## Dashboards

<Each dashboard, its audience, and the panels on it. A dashboard nobody can read during an incident is decoration.>

## Alerts

<Per alert: condition, threshold, for-duration, severity, who is paged, and the runbook section it links to. An alert with no runbook entry does not pass this gate.>

| Alert | Condition | Severity | Routes to | Runbook |
|---|---|---|---|---|

## Health checks

<Liveness and readiness endpoints, what each actually checks, and what the orchestrator does with each result. A readiness check that only returns 200 is theatre.>

## Data retention and cost

<Retention per signal, the expected volume, and the cost. Sampling decisions and what they might hide.>

## Verification

<How each item above was confirmed to exist in the real environment — the query run, the panel seen, the alert fired in a test. Planned telemetry is not telemetry.>
