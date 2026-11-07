---
template_for: requirements
gate: G1
authored_by: dev-decomposing-requirements
reviewed_by: dev-reviewing-requirements
---

<!--
REQ-NNN is the join key of the whole pipeline: design decisions, tasks, tests, and acceptance
criteria all point back here. That is why ids are permanent and never renumbered — a renumber
silently rewires every downstream reference. Retire a requirement by marking it superseded; the
number stays burned.

A requirement is testable or it is not a requirement. "The system should be user-friendly" cannot
fail, so it cannot pass, so it tells an implementer nothing.
-->

---
slug: <slug>
stage: requirements
artifact: requirements
status: draft
authored_by: dev-decomposing-requirements
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Functional requirements

<One row per requirement. Priority: P0 cannot ship without it, P1 ships in this release, P2 is next. Source cites the PRD section or the stakeholder who asked.>

| Id | Requirement | Priority | Source | Rationale |
|---|---|---|---|---|
| REQ-001 | <The system shall …, observable from outside> | <P0/P1/P2> | <PRD §…> | <why it exists> |

## Non-functional requirements

<Each with a number and a measurement method. An NFR you cannot measure is a wish.>

| Id | Category | Requirement | Target | How measured |
|---|---|---|---|---|
| REQ-101 | <performance/availability/security/scalability/usability/compliance> | <…> | <p95 < 300ms at 50 rps> | <where the number comes from> |

## Data requirements

<Entities this touches, the fields that matter, volume and growth rate, retention, and classification (public / internal / personal / sensitive). This is the input to G3.>

## Interface requirements

<Systems this talks to: protocol, direction, contract location, failure behaviour, and rate limits. This is the input to G4.>

## Constraints

<Technical and organisational limits that narrow the solution space — existing schema, a vendor SLA, a framework version, a team boundary.>

## Assumptions

<What is taken as true without proof, and what happens if each turns out false.>

## Traceability

<Every REQ mapped forward. Filled at G1 for criteria, completed at G6 for tasks; a row that never gains a task is an orphan the linter rejects.>

| REQ | Acceptance criteria | Tasks | Tests | Status |
|---|---|---|---|---|
| REQ-001 | <AC ids> | <TASK ids — filled at G6> | <test paths — filled at G7> | <draft/approved/implemented/verified> |

## Out of scope

<Requirements considered and deliberately excluded, with the reason. This is what stops the same debate reopening at G6.>
