---
template_for: exploration
gate: G7
authored_by: dev-exploring-behaviour
reviewed_by: dev-reviewing-implementation
---

<!--
Written by `node <root>/scripts/explore.mjs` for one slice, before that slice's G7 review. It is G7
evidence the reviewer reads, never a gate output: rerunning it stales nothing.

This is a developer's smoke check that the slice built its own ui-spec behaviour rows — Esc, focus
return, Back, refresh, URL state, double submit, permission denial — per role, in a real browser.
It is not functional certification. The QA bundle's scope (the automation-tier list in the G9
handoff) does not shrink because a row passed here (DEV-CONTRACTS §9).
-->

---
slug: <slug>
stage: implementation
artifact: exploration
status: draft
authored_by: dev-exploring-behaviour
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Scope

<The slice, its head commit, the app URL, and the roles explored.>

## Rows explored

<One row per probe: the UB id, the role, the probe kind, PASS or FAIL, what was seen, and the accessibility snapshot path. NOT RUN with the reason when Playwright or the app was not available.>

| UB | Role | Probe | Result | Evidence | Snapshot |
|---|---|---|---|---|---|

## Findings

<Each FAIL, with the lane that owns the file it names. Each becomes a task in that lane's next wave, before the slice review.>

## Not explored

<Behaviour rows of this slice with no probe, and why. "None" when every row has one.>
