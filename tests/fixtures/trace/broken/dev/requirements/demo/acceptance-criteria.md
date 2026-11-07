---
slug: demo
stage: requirements
artifact: acceptance-criteria
status: in-review
authored_by: dev-decomposing-requirements
reviewed_by: dev-reviewing-requirements
tracker: none
created: 2026-10-13
updated: 2026-10-13
requirements: [REQ-001, REQ-002]
---

## Criteria

| Id | REQ | Given | When | Then | Tier | Priority |
|---|---|---|---|---|---|---|
| AC-001 | REQ-001 | a signed-in tester | they submit a case | it is stored with its id | unit | P0 |
| AC-002 | REQ-001 | a stored case | it is fetched by id | every field matches | integration | P0 |
| AC-003 | REQ-002 | 45 cases | the list is requested with limit 20 | 20 and a cursor come back | integration | P0 |

## Negative and edge cases

| Id | REQ | Scenario | Expected behaviour | Tier |
|---|---|---|---|---|
| AC-101 | REQ-002 | the list under 50 rps | p95 under 300ms | automation |
| AC-102 | REQ-001 | a title of 201 characters | 422 with the field error | unit |
