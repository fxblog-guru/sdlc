---
template_for: conventions
gate: GK
authored_by: dev-extracting-conventions
reviewed_by: dev-reviewing-knowledge
---

<!--
Conventions are extracted from the code, not written from opinion. Every row cites a real
`file:line` that does it the way described — because "we use structured logging" is a claim, and
`internal/http/middleware/log.go:41` is evidence. The writing skills at G7 read this card and copy
the examples; a convention with no example is a convention nobody follows.

Where the codebase is inconsistent, say so and name the dominant form. Pretending there is one
convention when there are three produces code that matches none of them.
-->

---
stage: knowledge
artifact: conventions
status: draft
authored_by: dev-extracting-conventions
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Naming

<Files, packages, types, functions, database objects, routes, env vars — with one real example each.>

| What | Convention | Example (file:line) | Consistency |
|---|---|---|---|

## Code placement

<Where each kind of code goes — handler, service, repository, migration, test, config. This is what `dev-resolving-code-placement` reads instead of guessing.>

| Kind of code | Goes in | Example |
|---|---|---|

## Error handling

<How errors are created, wrapped, mapped to HTTP and logged, with the one file that does it right.>

## Logging, metrics, tracing

<The libraries in use, the field names, how context is threaded, where the trace id comes from.>

## Configuration and secrets

<How config is loaded and validated, and where secrets come from. Note anything that reads env vars directly in the middle of business logic — that is a convention being broken, not a convention.>

## Data access

<The query layer in use, transaction scoping, how pagination is done today, the N+1 patterns already present.>

## Testing

<Test file placement and naming, fixtures, how the DB is provided in tests, what "integration" means here. Cross-reference test-conventions.md.>

## Inconsistencies

<Where the code disagrees with itself, the dominant form, and which form new code should follow. Honest here saves a review argument later.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
