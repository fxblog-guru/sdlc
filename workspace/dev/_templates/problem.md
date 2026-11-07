---
template_for: problem
gate: G0
authored_by: dev-framing-problem
reviewed_by: dev-reviewing-intake
---

<!--
G0 exists to stop the most expensive failure in software: building the right thing for the wrong
problem. Everything here is about the problem as it exists today, for real people, with evidence.
A solution that appears in this document is a finding, not a contribution — it belongs in G2.
-->

---
slug: <slug>
stage: intake
artifact: problem
status: draft
authored_by: dev-framing-problem
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Problem statement

<One paragraph in the user's language: who is hurt, when, and what it costs them. No technology.>

## Who has this problem

<The affected users or systems, how many, and how you know — a count, a ticket volume, a quote.>

## Evidence

<What makes this real today: support tickets, metrics, logs, interviews, a failed deadline. Cite each one. "The team feels" is not evidence.>

## Current workaround

<What people do today instead. If nobody works around it, question whether the problem is real.>

## Impact if unsolved

<The cost of doing nothing, in the unit the business actually tracks: hours, churn, revenue, risk, compliance exposure.>

## Success looks like

<The observable change that would mean this is solved — stated as an outcome, not a feature, and measurable. For an initiative, end with one line `Kill: <the result, by when, that means this is removed or reversed>` — G11 reports it met or not (§23).>

## Constraints

<Deadlines, budget, regulation, existing contracts, systems that cannot change, teams that must be involved.>

## Assumptions to validate

<Each belief this framing rests on, and how it will be checked. An unvalidated assumption that reaches G2 is how projects fail late.>

## Out of scope

<What this initiative deliberately does not address, so scope creep has something to bump against.>

## Open questions

<Each unknown, who can answer it, and whether it blocks G1. Unanswered questions are recorded here, never guessed at.>

## Pillars

<The five questions every product answers (§24), at the depth its class needs: one line each for a `change`, a mechanism and a measure each for an `initiative` or `fast`. Optional for a `fix`, `refactor` or `spike`; delete this section there.>

| Pillar | For this product | Measured by |
|---|---|---|
| Intelligence | <what it must know or do well> | <how you would see it> |
| Memory and learning | <how it learns from use: data it keeps, signals it reads> | <the number that should move> |
| Judgment and integrity | <where it must be honest with users: errors, limits, no dark patterns> | <how a lie would show> |
| Verification and safety | <what must never break, and the rollback> | <the check that fails first> |
| Value and experience | <who uses it, and why they come back> | <the usage number; the Kill line above> |
