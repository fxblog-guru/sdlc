---
template_for: impact
gate: G2
authored_by: dev-mapping-impact
reviewed_by: dev-reviewing-design
---

<!--
In a codebase that already exists, the expensive mistakes are rarely in the new code. They are in
what the new code touches: the query that now returns a different shape, the endpoint a mobile
version from eight months ago still calls, the job that assumed this column was never null.

This document is the answer to "what will this break?", written before anything is built and backed
by evidence from the code rather than by recollection. Every row needs a citation — a grep, a call
graph, a log query. "I don't think anything uses it" is the sentence that precedes most incidents.

It is also where the single most valuable brownfield question gets answered: should this extend
something that already exists instead of being built new?
-->

---
slug: <slug>
stage: design
artifact: impact
status: draft
authored_by: dev-mapping-impact
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Extend or build new

<The search that was done for existing capability — the commands run, what was found, and the decision with its reason. If something similar exists and is not being reused, say why. Skipping this is how a codebase acquires a third endpoint that nearly duplicates two others.>

| Existing thing found | Where | Close enough to extend? | Decision | Why |
|---|---|---|---|---|

## Modules touched

<Every module this change writes to or changes the behaviour of, with its owner and what else depends on it.>

| Module | Path | Change | Owner | Inbound dependents |
|---|---|---|---|---|

## Data touched

<Tables, columns and indexes read or written, and which other code reads the same rows. A column that gains a meaning is as much a change as a column that gains a value.>

| Entity / table | Read | Written | Other readers | Risk |
|---|---|---|---|---|

## Interfaces touched

<Endpoints, events, queues and jobs — and, for each, who calls it. Name the evidence: a gateway metric, a log query, a client registry. Mobile clients in the wild deserve their own row.>

| Interface | Change | Consumers | How consumers were identified | Breaking |
|---|---|---|---|---|

## Screens touched

<UI surfaces affected, including ones affected indirectly because the data behind them changes. N/A — <reason> when the change has no user-facing surface.>

## Tests affected

<Existing tests that will need to change, and existing tests that should catch a regression here and currently do not. The second list is more useful than the first.>

| Test | Location | Effect | Action |
|---|---|---|---|

## Blast radius

<If this change is wrong in production, what is the worst that happens, to whom, and how quickly would anyone notice? This paragraph decides the rollout strategy at G10, so write it for that reader.>

## Live ADRs in this area

<Architecture decisions that already govern this code. A design that contradicts one supersedes it in writing — leaving two live answers to one question is how a codebase stops having a shape.>

| ADR | What it decided | This change | Action |
|---|---|---|---|

## Known debt in the way

<From knowledge/known-debt.md: anything mid-migration, deprecated, or marked do-not-touch that this change runs into, and how it is handled.>
