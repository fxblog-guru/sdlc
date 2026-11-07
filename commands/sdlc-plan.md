---
description: G6 · TASK-NNN plan with files, REQ, test and estimate range, then gate. After G3–G5.
disable-model-invocation: true
argument-hint: <slug>
---

Run G6 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G6.

## Preflight (stage-specific)

- `DEV-PROFILE.md §Stacks` decides which implementation skills the tasks may name; `§Quality
  gates` decides what "done" costs.
- Needs **G3, G4 and G5** each `PASS` or `SKIPPED` (§4.2). Name which sibling is outstanding.
  Where G5 passed, `<root>/ui/$1/visual-design.md` carries `approved_by` (§13.3): no plan against a
  look the requester has not seen.
  Note **which** were skipped and why, and pass that through — the planner and the reviewer must
  tell "no UI spec because there is no UI" from "no UI spec yet".
- G6 goes `STALE` more often than any other gate (four upstream documents). The `--reaffirm` /
  re-run choice matters here.
- Brownfield: `<root>/knowledge/conventions.md` must exist. Placement from taste is a `MAJOR` at this
  gate (§16.4). Greenfield with no cards: this G6 writes `conventions.md` and `test-conventions.md`
  and lists them under its outputs (§13.11).

## Author

Spawn **`dev-delivery-planner`** with:

- `<root>/requirements/$1/requirements.md` and `acceptance-criteria.md` — read in full
- `<root>/design/$1/architecture.md` and `impact.md`
- `<root>/data/$1/data-model.md` and `migration-plan.md`, where G3 ran
- `<root>/api/$1/openapi.yaml`, where G4 ran
- `<root>/ui/$1/ui-spec.md`, where G5 ran
- `<root>/knowledge/conventions.md` and `codebase-map.md`
- `<root>/_templates/{tasks,decisions}.md`, `<root>/state.json`
- the source root, so it can name real file paths rather than plausible ones

It invokes `dev-planning-implementation` and writes `<root>/plan/$1/tasks.md`.

State three things when you spawn it: `TASK-NNN` ids are **permanent** and the join key to G7 and
G8 (§1), so nothing is renumbered on a second round; the REQ↔TASK mapping is verified **in both
directions with counts** before hand-back (§6); every estimate is a **range with a named high-end
condition**, never a single number.

## Review

Reviewing skill: **`dev-reviewing-plan`** → `<root>/reviews/$1/G6-plan-<run-id>.md`.

Paths: `tasks.md`, every upstream artifact that exists (requirements, acceptance criteria,
architecture, impact, data model, migration plan, contract, UI spec), `conventions.md`,
`<root>/state.json`, the standard set, and **the source root**. `state.json` lets the reviewer tell a
skipped gate from a missing artifact; the source root lets it check that the files the tasks name
exist where the plan says — a path one directory off is invisible to reading and obvious to `ls`.

## On CHANGES_REQUESTED

**Fixing a finding never renumbers a task.** Splitting `TASK-004` produces `TASK-004` and a new id
at the end of the sequence. The old numbering is already quoted in a gate log that may not be
edited (§5). A plan that closed three of five coverage gaps is `REOPENED` with the two REQs named.

## After

Report: the verdict, the task count and REQ coverage counts, any `DEC-NNN` opened, and that
`/sdlc-implement $1` is unlocked and will build **only** approved tasks, in the plan's order.

## Refuse (stage-specific)

- To let the planner write production code (§12.8).
- To renumber `TASK-NNN` ids, in any round, for any reason (§1).
- To accept a single-number estimate as "close enough". The stated high-end condition is the only
  part of an estimate anyone can act on.
