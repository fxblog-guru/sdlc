---
name: dev-documenting-changes
description: Use at the end of /sdlc-implement (G7): lane notes and change-summary.md, each TASK-NNN with path + symbol evidence, never file:line.
---

# Documenting changes — G7

You write **lane notes**. A script writes `change-summary.md`.

> `DEV-CONTRACTS.md` §4.4 (G7 binds code by commit; the summary is generated), §5.3 (cite symbols,
> not lines), §5.5 (lane notes), §6 for the id chain, §10 for task states.

## 1. What you write: the lane note

`<root>/implementation/<slug>/lanes/lane-<x>.md` from `_templates/change-summary.md` — your lane's
letter in slice mode, `lane-main.md` for a single implementer. Same front matter and headings.

| Section | What goes in it |
|---|---|
| Tasks completed | the TASK ids you worked, one line each. No commit or file list — git has those |
| What was built | the shape of the solution, pointing at code as `` `path` `Symbol` `` |
| Deviations from the plan | everything done differently from `tasks.md`, the architecture, the data model or the contract, with the gate it re-opens |
| Tests | the test that fails if the task is reverted, by name and path, with the failing line it printed before the change |
| Known weaknesses | where it is weakest: the concurrency you are unsure of, the case not covered |
| Not done | what is unfinished and what blocks it (`DEC-NNN`, `TASK-NNN`) |

**Cite symbols, never lines.** `internal/job/service.go` `AssignJob`, not `service.go:42-57`. A line
number is stale after the next commit; re-pointing hundreds of them is pure bookkeeping, and a
moved line is never a finding (§5.3).

**Every task's status goes in `progress.md`** (`TASK-NNN | done | <commit>`), and every commit names
its `TASK-NNN` in the message. Those two are what the generator reads.

## 2. What the script writes: `change-summary.md`

```bash
node <root>/scripts/change-summary.mjs <slug> --base <PR target>   # writes implementation/<slug>/change-summary.md
node <root>/scripts/change-summary.mjs <slug> --check              # exit 1 when it is out of date
```

It builds the task table (TASK, REQ, status, commits, files changed) from `tasks.md`,
`progress.md` and `git log <merge-base>..HEAD`; lists commits that name no task under Deviations;
lists unfinished tasks under Not done; and folds every lane note's sections in, lane by lane.
**Never edit the output.** Fix a lane note, or a commit message, and re-run. Regenerating it stales
nothing: G7 binds the code by `reviewed_commit` (§4.4).

## What you must write down even though it is uncomfortable

- **Everything you touched that no task asked for** — a refactor, a rename, a dependency bump. The
  generator lists the commits; the note says why. §12.6 forbids widening scope silently.
- **Every deviation from the design**, with the reason, so the reviewer decides whether G2 re-opens.
- **Every task you did not finish, and why.** "Needs DEC-007 answered" is a blocker; "ran out of
  scope" is not.

## Do not

- **Do not summarise the diff.** "Refactored the installer for clarity" is not checkable. Name the
  symbol that changed and the test that proves it.
- **Do not grade your own work.** No "clean implementation", no "well tested" (§4.5).
- **Do not resolve an open `DEC-NNN` by implementing one of its branches** (§15.2). Its task is
  `N/A — blocked by DEC-NNN`; everything else is finished.
- **Do not write `status: approved`** (§3.1).
