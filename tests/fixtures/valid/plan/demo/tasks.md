---
slug: demo
stage: plan
artifact: tasks
status: in-review
authored_by: dev-planning-implementation
reviewed_by: dev-reviewing-plan
tracker: none
created: 2026-09-18
updated: 2026-09-18
requirements: [REQ-001, REQ-002, REQ-101]
---

## Approach

Migration first, then repository, then the two handlers. The list endpoint goes first among the handlers because its pagination shape is the riskiest decision left.

## Tasks

| Id | Task | REQ | Stack | Files | Depends on | Test | Estimate | Status |
|---|---|---|---|---|---|---|---|---|
| TASK-001 | Migration: create test_cases | REQ-001 | sql | migrations/202609181200_create_test_cases.up.sql | none | repo_integration_test.go | S | todo |
| TASK-002 | Repository: insert and fetch by id | REQ-001 | go | internal/testcase/repo.go | TASK-001 | repo_test.go | M | todo |
| TASK-003 | GET list with cursor pagination | REQ-002 | go | internal/testcase/handler_list.go | TASK-002 | handler_list_test.go | M | todo |
| TASK-004 | RED metrics on the list path | REQ-101 | go | internal/testcase/telemetry.go | TASK-003 | telemetry_test.go | S | todo |

## Sequence

TASK-001 → TASK-002 → TASK-003 → TASK-004. TASK-003 is the riskiest; it runs before the telemetry work so a pagination rethink is still cheap.

## Definition of done (per task)

Code, unit test, integration test where a DB seam is crossed, telemetry where a request path changes, and every quality gate in DEV-PROFILE green.

## Test plan for this change

| AC | Tier | Covered by | Owner |
|---|---|---|---|
| AC-001 | unit | handler_create_test.go | this bundle |
| AC-002 | integration | repo_integration_test.go | this bundle |
| AC-101 | automation | k6 scenario | agentic-fx-qa |

## Migration and rollout tasks

TASK-001 carries MIG-202609181200. No flag; the endpoints are new, so there is nothing to toggle.

## Observability tasks

TASK-004 adds the RED metrics and the span on the list path.

## Risks and unknowns

DEC-001 is still open; if the answer is full-text search, TASK-003 changes shape and G3 re-opens.

## Estimate summary

Four tasks, roughly three days, assuming DEC-001 resolves to title-only search.
