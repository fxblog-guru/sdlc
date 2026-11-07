---
description: G7 · build approved tasks: code + tests in one commit + lane notes, generate the summary, gate. After G6.
disable-model-invocation: true
argument-hint: <slug> [TASK-NNN]
---

Run G7 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G7.

## Preflight (stage-specific)

- `DEV-PROFILE` §Stacks (layout per stack), §Data stores if the change touches data.
- Every gate the **change class** runs before G7 must be `PASS` or `SKIPPED` (§15.1): for
  `initiative` and `change` that includes G6; for a `fix` or `fast`, G6 is `SKIPPED` by class and
  `GK` must be green (`fast`: `/sdlc-fast`).
- G7 `STALE` because the **code** changed: `--reaffirm` does not apply (it judges a changed
  input; this is the output). Re-run the stage.
- Brownfield: `<root>/knowledge/` must be populated. Placement and conventions come from the cards
  (§16.4).
- A feature branch per `DEV-PROFILE §Delivery`; record the merge base against the PR target (a G7
  review is a diff review — no baseline, `BLOCKED`).

## Author

Spawn **`dev-implementer`** with:

- `node <root>/scripts/lane-brief.mjs $1 --lane <x> --tasks <ids>` output, not `tasks.md`
- `<root>/design/$1/architecture.md` and `impact.md`
- `<root>/api/$1/openapi.yaml` (or the `.proto`), `<root>/data/$1/data-model.md` and
  `migration-plan.md`, `<root>/ui/$1/ui-spec.md` and, per screen, `visual-extract.mjs $1 --screen <kind>`, not the visual — whichever the change touches
- `<root>/requirements/$1/acceptance-criteria.md`
- `<root>/knowledge/conventions.md`, `codebase-map.md`, `known-debt.md`, `test-conventions.md`
- `<root>/_templates/{change-summary,decisions}.md`
- the source root, and the merge base from preflight

It invokes the `dev-writing-*-code`, `dev-writing-migrations` and `dev-designing-observability`
skills the change touches, then `dev-documenting-changes`, and writes code, tests and its lane note
`<root>/implementation/$1/lanes/lane-main.md` (§5.5). It works the tasks in its
brief, commits per task, and records execution status in
`progress.md` from `Done:` trailers (`commit-lint.mjs --progress $1`, §18.1), never in `tasks.md`.

State four things when you spawn it: **the test is seen red, then ships in the task's
commit** (§6); **a
contract or schema change found here stops the stage** (§6, §12.6); **every commit names its TASK
and the lane note cites `path` + `Symbol`, never `file:line`**; **resume from `git log` and
`progress.md`; hand back partial progress cleanly** when turns run low. **Bounded spawns:** give each spawn at most 5 `TASK`s (or one G6 slice), then a fresh
spawn — never resume or continue a spent one. Before each, `lane-brief.mjs check` must exit 0.

### Slice mode (optional)

G6's lanes can run as parallel implementers (own worktree, branch, database port; rebased, merged
as `merge(lane-<x>)`), a G7 per slice after `dev-exploring-behaviour`, a final G7 over the branch.
**At most 6 lanes, only the ones G6 named; findings go back to the owning lane, never to a new
one; merged worktrees are removed** (§5.5). Procedure: `.claude/skills/dev-stage-protocol/slice-mode.md`.

## Review

Reviewing skill: **`dev-reviewing-implementation`** →
`<root>/reviews/$1/G7-implementation-<run-id>.md`. Before spawning it, run
`node <root>/scripts/change-summary.mjs $1 --base <merge base>` and commit the result, after `dev-exploring-behaviour`
where there are screens. The log
records **`reviewed_commit: <sha>`** in its front matter and does not hash `change-summary.md`:
the verdict binds a revision of code, and the summary is generated (§4.4). Push first: the log's
`## Scope` carries the green pipeline URL for that commit (§18.3).

Paths: `change-summary.md`, `tasks.md`, the design, the contract, the data model, the UI spec and
its `visual_reference`, `acceptance-criteria.md`, the knowledge cards, the standard set, and **the source root, the branch
and the merge base**. The reviewer diffs, greps, opens the cited symbols, and runs the named
test alone. Never pass the implementer's list of what it thinks is weak — the reviewer would
inherit the author's map of the risk.

## On CHANGES_REQUESTED

After two rounds the human decides (§4.3): a third fix lane, or re-opening a gate, needs the
`round_decision` DEC. A finding owned by **G4 or G3** — a contract break or a schema change found
here — re-opens that gate; this stage stops.

**Upstream doc debt** is `drift` (§5.3): one batched pass per owning gate at a planned stop (`slice-mode.md` §6).

## After

Report: the verdict, tasks done against planned, any `DEC-NNN` opened or gate to re-open, and
that `/sdlc-verify $1` is next. Say the code is **not shipped**: the PR and QA handoff are G9's.

## Refuse (stage-specific)

- To let the implementer edit `tasks.md`, `openapi.yaml`, `data-model.md` or `architecture.md`.
  Each turns its gate `STALE` (§4.4).
- To build a task whose answer is an open `DEC-NNN`. Mark it `N/A — blocked by DEC-NNN`, build
  everything else, point at `/sdlc-ask $1`.
- To accept a completed task with no test as a matter of scheduling.
- To let this stage write under `qa/` or call a `/qa-*` command (§9).
