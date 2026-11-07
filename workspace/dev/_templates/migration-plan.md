---
template_for: migration-plan
gate: G3
authored_by: dev-writing-migrations
reviewed_by: dev-reviewing-data
---

<!--
A migration runs once, against real data, usually while people are using the system. Everything in
this plan exists to answer one question under pressure: when this goes wrong at 02:00, what do we do?

The expand → migrate → contract discipline is what makes that answerable. Add the new shape while
the old one still works; move the data; only remove the old shape in a later release, once nothing
reads it. A plan that drops a column in the same release as the code change has no safe rollback,
because the code can be reverted and the data cannot.
-->

---
slug: <slug>
stage: data
artifact: migration-plan
status: draft
authored_by: dev-writing-migrations
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Summary

<What changes in the schema and why, in two sentences.>

## Phase

<expand | migrate | contract — and which release each remaining phase lands in. If all three are in one release, justify it here or expect a BLOCKER.>

## Migrations

<One row per MIG. One concern each: DDL and backfill never share a file, because they need different runtimes, different locks, and different rollbacks.>

| MIG | File | Does | Reversible | Lock risk | Est. duration |
|---|---|---|---|---|---|
| MIG-<YYYYMMDDHHMM> | <file>.up.sql | <one change> | <yes / no — why> | <none/brief/table-lock> | <on production volume> |

## Order of operations

<The exact sequence against the code deploy: what runs before the new code, what runs with it, what runs after. Include feature-flag state at each step.>

## Backfill

<Volume, batch size, throttle, checkpointing, how it is resumed after a failure, and how completion is verified. A single unbounded UPDATE on a large table is a blocker, not a style preference.>

## Rollback

<The exact command per migration, the time it takes, the data that cannot be recovered, and the point of no return after which rollback is forward-only.>

## Compatibility window

<The period where old and new code both run. State what each version can read and write, and what breaks if a stale pod survives longer than expected.>

## Verification

<The queries and counts that prove the migration worked: row counts before and after, spot checks, constraint validation, and the EXPLAIN that proves the new index is used.>

## Production rehearsal

<Where this was rehearsed against production-like data, the observed duration and lock behaviour, and what was learned. A migration whose first real run is in production is an incident waiting for a date.>

## Risks

<What could go wrong, how it would be detected, and who is on call for it.>
