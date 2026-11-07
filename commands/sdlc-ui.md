---
description: G5 · UI spec: roles, nine states, real pagination, traceability, a11y, UI score, then gate. After G2.
disable-model-invocation: true
argument-hint: <slug>
---

Run G5 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G5.

## Preflight (stage-specific)

- `DEV-PROFILE.md §Stacks` decides whether there is a frontend at all.
- Needs **G2** `PASS` or `SKIPPED`. G3 and G4 are siblings (§4.2), not preconditions. If G4 is
  `PASS`, pass `<root>/api/$1/openapi.yaml` through — it already fixed page size, ordering, sort
  whitelist and error shape. If G4 has not run, tell the author: the list sections state the
  pagination the requirements demand (§13.1) and G4 must then honour it.
- `node <root>/scripts/design-system.mjs check`. If `<root>/docs/design-tokens.json` does not exist,
  **stop** and name `/sdlc-design-system` as the command that resolves it. Any other failure (md
  out of sync, no `chosen_by`, a failing contrast pair): stop and show the output. With several
  surfaces (`<root>/docs/<surface>/`), check the one this change touches.
- **Decide whether to author at all.** No screen, no changed field, no changed error a user reads,
  no changed permission a screen reflects → skip the author and go straight to `## Review` for an
  applicability determination. Do not have the author write a spec of `N/A` rows. You are not
  declaring the skip — only the reviewer may (§5.4).

## Author

Spawn **`dev-ui-designer`** with:

- `<root>/requirements/$1/requirements.md` and `acceptance-criteria.md` — read in full
- `<root>/design/$1/architecture.md` — it already decided what is async and what fails partially
- `<root>/api/$1/openapi.yaml`, where G4 has run
- `<root>/docs/design-tokens.md` and `<root>/docs/ui-patterns.md` — the design system every screen starts from
- the wireframe or mockup the requester approved, if any — recorded as `visual_reference` (§13.3)
- `<root>/knowledge/conventions.md`, where it exists
- `<root>/_templates/{ui-spec,decisions}.md`
- the source root, so it can find the kit components that already exist

It invokes `dev-specifying-ui` and writes `<root>/ui/$1/ui-spec.md`.

State three things when you spawn it: every screen names a **shell and a pattern** from
`ui-patterns.md` and writes only its deviations, each with a reason; the `## States` table is
`screens × 9`, the roles matrix and the traceability table cover every screen, and **every cell is
filled** (§13.13); every list renders the pagination the
contract actually returns — a screen showing "all" of a paginated collection is a `BLOCKER`.

## Visual design (after the spec, before review)

First ask the requester: a brand kit exists, make one now (`dev-making-brands` runs first), or
later; and per admin area, themed or plain (§13.3). Never answer for them.

Spawn **`dev-ui-designer`** again with the written `ui-spec.md`, the wireframe, the token files and
`<root>/_templates/visual-design.md`. It invokes `dev-designing-visuals` and writes
`<root>/ui/$1/visual-design.md`, `visual/index.html` and `visual/shots/` at 1440, 1024 and 360, and
adds the `kind: visual` entry to the spec's `visual_reference`. This is a G5 sub-artifact, not a
gate (§13.3): it is reviewed in this G5 round. Show the requester `visual/shots/compare.html`;
their name and date go in `approved_by` / `approved_on`, and the Design, Engineering and
Accessibility sign-offs in `approvals` (§13.13). Never fill those yourself.

## Review

Reviewing skill: **`dev-reviewing-ui`** → `<root>/reviews/$1/G5-ui-<run-id>.md`.

Paths: `ui-spec.md`, `visual-design.md` and `visual/`, the upstream requirements, acceptance criteria and architecture,
`openapi.yaml`, `design-tokens.md`, `ui-patterns.md`, `conventions.md`, the standard set, and
**the source root** — the reviewer counts the states table mechanically, greps for unbounded
fetching, compares every sortable column against the contract's whitelist, and puts the UI score
(`ui-score.mjs $1 --gate G5`, §13.13) under its verdict.

When preflight found no user-facing surface, spawn the reviewer **without** a spec path and ask
for an applicability determination. It returns `SKIPPED` with `skip_reason.type: NOT_APPLICABLE`
(rule quoted, reason given) or `BLOCKED` saying a spec is required after all — which means the
change reaches a screen you did not see.

## On CHANGES_REQUESTED

The likeliest `disputed` finding is a state the designer believes cannot occur; record why. A states table that gained four of six missing cells is `REOPENED` with the two
named.

## After

Report: the verdict, any `DEC-NNN` opened, any token or contract change the spec needs, and
whether the visual is approved. G6 needs G3, G4 and G5 `PASS` or `SKIPPED` and the visual
approved; name what is outstanding, or say `/sdlc-plan $1` is ready.

## Refuse (stage-specific)

- To let the designer edit `openapi.yaml` or `requirements.md`. A contract that cannot support
  the screen is a finding; the edit turns G4 `STALE` (§4.4).
- To accept a states table with blank cells because the change is small. The cells are the gate.
