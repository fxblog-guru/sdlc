---
template_for: acceptance-criteria
gate: G1
authored_by: dev-decomposing-requirements
reviewed_by: dev-reviewing-requirements
---

<!--
This file is the handoff payload to the QA bundle, so it is written for someone who was not in the
room. Each criterion is checkable by a person or a machine without asking a follow-up question.

The Tier column is the honest part. "unit" and "integration" are covered here at G7. "automation"
means it is only observable by running the real product — that list is exactly what agentic-fx-qa
picks up, and a criterion silently left off it is how a regression ships.
-->

---
slug: <slug>
stage: requirements
artifact: acceptance-criteria
status: draft
authored_by: dev-decomposing-requirements
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Criteria

<Given/When/Then, one row per criterion, each tracing to a REQ. Tier decides who proves it: unit and integration are proved by this bundle at G7; automation and manual are proved by the QA bundle.>

| Id | REQ | Given | When | Then | Tier | Priority |
|---|---|---|---|---|---|---|
| AC-001 | REQ-001 | <precondition> | <action> | <observable, specific outcome> | <unit/integration/automation/manual> | <P0/P1/P2> |

## Negative and edge cases

<What must NOT happen, and the boundaries: empty, one, many, maximum, malformed, unauthorised, concurrent, duplicate, expired, offline. Most production bugs live here, which is why this section is not optional.>

| Id | REQ | Scenario | Expected behaviour | Tier |
|---|---|---|---|---|
| AC-101 | REQ-001 | <edge or abuse case> | <exact expected behaviour, including the error shape> | <tier> |

## Data conditions

<The fixtures, seed data, accounts, roles and volumes a check needs. Vague data is the usual reason a criterion cannot be automated later.>

## Automation-tier criteria (QA handoff)

<Just the criteria marked `automation` or `manual`, restated as a list. This is copied into <root>/release/<slug>/qa-handoff.md at G9 and is the QA bundle's starting point.>

## Not covered

<Anything deliberately left unverified, and why. An explicit gap is a decision; an implicit one is an accident.>
