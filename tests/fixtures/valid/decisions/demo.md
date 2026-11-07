---
slug: demo
stage: requirements
artifact: decisions
status: draft
authored_by: dev-decomposing-requirements
reviewed_by: n/a
tracker: none
created: 2026-09-16
updated: 2026-09-18
requirements: [REQ-002]
---

## Decisions

| Id | Question | Why it is needed | Options | Recommended default | Blocks | Status | Answer |
|---|---|---|---|---|---|---|---|
| DEC-001 | Is title search enough, or do testers need to search step text? | Decides whether this is a b-tree index or a full-text index, and whether G3 needs a rethink | title only · title + steps (tsvector) | title only for v1 | TASK-003 | open | — |
| DEC-002 | Default page size for the case list? | Sets the contract default and the UI's load-more behaviour | 20 · 50 · 100 | 20 | none | answered | 20 |

## Assumptions in force

DEC-001 is being worked around with `status: open` rather than assumed, because guessing wrong here changes the schema — which is the kind of mistake that has to be migrated rather than edited.

## Withdrawn

None.
