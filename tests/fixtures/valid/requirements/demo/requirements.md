---
slug: demo
stage: requirements
artifact: requirements
status: in-review
authored_by: dev-decomposing-requirements
reviewed_by: dev-reviewing-requirements
tracker: none
created: 2026-09-16
updated: 2026-09-16
requirements: [REQ-001, REQ-002, REQ-101]
---

## Functional requirements

| Id | Requirement | Priority | Source | Rationale |
|---|---|---|---|---|
| REQ-001 | A tester can create a test case | P0 | PRD §Functional scope | the core action |
| REQ-002 | A tester can list cases, paginated and sorted | P0 | PRD §Functional scope | finding is the actual problem |

## Non-functional requirements

| Id | Category | Requirement | Target | How measured |
|---|---|---|---|---|
| REQ-101 | performance | The list responds quickly under normal load | p95 < 300ms at 50 rps | k6 against staging |

## Data requirements

One entity, `ENT_TEST_CASE`, growing at roughly 400 rows per month, retained indefinitely, internal classification.

## Interface requirements

REST over the existing gateway; no new outbound integrations.

## Constraints

Existing Postgres 16 instance; no new service.

## Assumptions

Title search suffices on day one — see DEC-001.

## Traceability

| REQ | Acceptance criteria | Tasks | Tests | Status |
|---|---|---|---|---|
| REQ-001 | AC-001 | TASK-002 | pending | approved |
| REQ-002 | AC-002, AC-003 | TASK-003 | pending | approved |
| REQ-101 | AC-101 | TASK-004 | pending | approved |

## Out of scope

Tagging and bulk import, deferred to a later initiative.
