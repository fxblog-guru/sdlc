---
slug: demo
stage: intake
artifact: problem
change_class: change
status: in-review
authored_by: dev-framing-problem
reviewed_by: dev-reviewing-intake
tracker: none
created: 2026-09-16
updated: 2026-09-16
requirements: []
---

## Problem statement

Testers cannot find a case they wrote last month, so they rewrite it — and the duplicate then drifts from the original.

## Who has this problem

The four testers on the platform team, every sprint.

## Evidence

47 near-duplicate cases in `cases/` as of 2026-09-10, found by title similarity.

## Current workaround

People keep a personal spreadsheet of case titles.

## Impact if unsolved

Roughly half a day per tester per sprint, plus contradictory expectations between duplicates.

## Success looks like

A tester finds an existing case in under ten seconds, and duplicate creation drops to near zero.

## Constraints

Must work against the existing Postgres instance; no new service.

## Assumptions to validate

That title search is enough, and full-text search over steps is not needed on day one.

## Out of scope

Bulk import, tagging, and permissions changes.

## Open questions

See DEC-001 in the decision ledger.
