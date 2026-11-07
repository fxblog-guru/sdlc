---
template_for: test-conventions
gate: GK
authored_by: dev-extracting-conventions
reviewed_by: dev-reviewing-knowledge
---

<!--
How this repository tests itself today, read from the tests that exist rather than from what a
README promises. G7 writes tests that match this card; G8 runs the commands it names. A generated
test that lands in the wrong place with the wrong fixture style is a test the team will delete.
-->

---
stage: knowledge
artifact: test-conventions
status: draft
authored_by: dev-extracting-conventions
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Frameworks and runners

<Per stack: the test framework, the runner command, the coverage command, and where CI invokes them.>

| Stack | Framework | Run | Coverage | CI job |
|---|---|---|---|---|

## Placement and naming

<Where tests live relative to the code they test, and how files and cases are named — with an example of each.>

## Fixtures and test data

<How test data is created, shared and torn down; how the database is provided (container, embedded, shared instance); what is mocked and how.>

## What "integration" means here

<Which seams integration tests actually cross today, and which they avoid. This decides where the bundle's own integration tests belong.>

## Coverage baseline

<Current line and branch coverage per module, so G8's "changed modules only" rule has a number to compare against.>

## Gaps and smells

<Modules with no tests, tests that are skipped or quarantined, tests that depend on order or on the clock. G7 should not add to this list.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
