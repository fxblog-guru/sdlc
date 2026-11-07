---
template_for: adr
gate: G2
authored_by: dev-detailing-design
reviewed_by: dev-reviewing-design
---

<!--
An ADR records one decision, at the moment it was made, with the information available then. Its
value is almost entirely in "Context" and "Consequences": a year later, the team needs to know what
was true at the time, not what we now wish had been true.

ADRs are immutable. Changing your mind is a NEW ADR that supersedes this one — editing the old one
destroys the record of why the original choice made sense. The one exception is the optional,
append-only "Amendments" section: dated entries that clarify wording or cite later evidence, and
never change the decision. Omit the section until the first amendment.
-->

---
slug: <slug>
stage: design
artifact: adr
status: <draft|in-review|superseded>
authored_by: dev-detailing-design
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

# ADR-NNN — <the decision, as a short statement>

## Status

<proposed | accepted on YYYY-MM-DD, G2 PASS in run <run-id> | superseded by ADR-NNN on YYYY-MM-DD>

## Context

<The forces at play: requirements, constraints, existing systems, team skills, deadlines. Write it so a reader in a year understands the situation without asking anyone.>

## Decision

<What was decided, in the active voice: "We will …". One decision per ADR.>

## Alternatives

<Each option seriously considered, with the trade-off that decided against it.>

| Option | Trade-off | Why not |
|---|---|---|

## Consequences

<What becomes easier, what becomes harder, and what is now locked in. Include the cost of reversing this later — that number is what a future team will want most.>

## Compliance

<How the team will know this decision is being followed: a lint rule, a review checklist item, a test, or an architecture fitness function. A decision nobody can check erodes within two sprints.>

## Amendments

<Optional and append-only; omit until the first entry. One line per entry: "YYYY-MM-DD — <clarification or citation> — <who>". An amendment clarifies or cites (a later DEC-NNN, a measured number, a renamed path); it never changes the Decision, its scope or its Consequences — that is a new ADR that supersedes this one.>
