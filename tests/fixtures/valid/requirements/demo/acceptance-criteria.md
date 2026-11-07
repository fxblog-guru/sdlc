---
slug: demo
stage: requirements
artifact: acceptance-criteria
status: in-review
authored_by: dev-decomposing-requirements
reviewed_by: dev-reviewing-requirements
tracker: none
created: 2026-09-16
updated: 2026-09-16
requirements: [REQ-001, REQ-002, REQ-101]
---

## Criteria

| Id | REQ | Given | When | Then | Tier | Priority |
|---|---|---|---|---|---|---|
| AC-001 | REQ-001 | a signed-in tester | they submit a case with a title and steps | the case is stored and returned with its id | unit | P0 |
| AC-002 | REQ-001 | a stored case | it is fetched by id | every field matches what was submitted | integration | P0 |
| AC-003 | REQ-002 | 45 stored cases | the list is requested with limit 20 | 20 cases and a next cursor come back, sorted by title then id | integration | P0 |

## Negative and edge cases

| Id | REQ | Scenario | Expected behaviour | Tier |
|---|---|---|---|---|
| AC-101 | REQ-101 | the list under 50 rps for five minutes | p95 stays under 300ms | automation |

## Data conditions

One tester account and a seed of 45 cases with distinct titles, plus a load profile for the k6 run.

## Automation-tier criteria (QA handoff)

- AC-101 — the latency budget under load, measured against staging.

## Not covered

Concurrent edits of one case; editing is out of scope for this initiative.
