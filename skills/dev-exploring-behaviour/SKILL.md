---
name: dev-exploring-behaviour
description: Use in G7 when a slice's screens are built, before review: drive its ui-spec UB rows per role in Edge; each failure goes to its lane.
---

# Exploring behaviour — the per-slice smoke pass at G7

release-management's QC pass found, after G8, six behaviour bugs its ui-spec had written down: no
discard guard on five dialogs, focus not returned to the opener, filters not in the URL, Back not
guarded, an empty problem title. The G7 re-review then found three more in the fix. Every one took a
single Playwright probe to see. This pass runs those probes while the slice is still open, so a
finding is a task in the owning lane's next wave rather than a defect after verification.

> `DEV-CONTRACTS.md` §9 (the boundary below), §13.3 (behaviour rows, pattern obligations), §5.5
> (findings go to the owning lane), §12.5 (no secret in a plan or a note). Print only those:
> `node <root>/scripts/contracts.mjs 5.5 9 12.5 13.3`.

## What this is not

A developer's smoke check that the slice built **its own spec's rows**. It is not functional
certification, not an e2e suite, and not accessibility testing: those are `agentic-fx-qa`'s and
arrive through the G9 handoff (§9). Write nothing under `qa/`, call no `/qa-*` command, and never
shorten the automation-tier list because a row passed here. The plan and the note live under
`<root>/implementation/<slug>/exploration/`; no test file comes out of this pass.

## When

After a slice's lanes have merged and its screens run, **before** the slice's G7 review (and once
over the whole branch before the final G7 review, as `--slice final`). A slice with no screen is
`N/A` in the slice log, with that reason.

## 1. Pick the rows

From `<root>/ui/<slug>/ui-spec.md` `## Interaction and feedback`, take every `UB-NNN` row whose screen
this slice built. For each, the roles it names. Cover at least, wherever the spec states them:

| Behaviour | Probe kind |
|---|---|
| Esc, close and Cancel with typed input ask "Discard changes?"; Back does too | `discard-guard` with `via: [escape, close, back]` |
| closing a dialog returns focus to the control that opened it | `focus-return` (Escape, and `closeBy` for the close button) |
| filters, tab, open dialog live in the URL and survive a refresh | `url-state` with `params` and `keep` |
| a second click on Save sends nothing | `double-submit` |
| a role without permission does not see the action, and a direct URL shows the denial | `permission`, in that role's context |
| the action is reachable by Tab and works by Enter | `keyboard` |
| anything else the row states | `steps` |

Then the pattern obligations: run `node <root>/scripts/pattern-check.mjs <slug>` when
`<root>/ui/<slug>/patterns.yaml` (or the ui-spec's obligations block) exists. Its violations are
findings of this pass too.

## 2. Write the plan

`<root>/implementation/<slug>/exploration/slice-<n>.plan.json`, in the shape the header of
`<root>/scripts/explore.mjs` documents: the app URL, **one entry per role** (each gets its own browser
context), and one probe per row and role. Locate by role and accessible name first, `data-testid`
second, CSS last: a probe that needs a CSS path has found an accessibility gap.

Credentials are `$ENV` names (`"$RM_VIEWER_PASSWORD"`), or a `storageState` file outside git. A
literal password is refused by the script and is a §12.5 breach in a committed file.

## 3. Run it

```bash
node <root>/scripts/explore.mjs --plan <plan.json> --slug <slug> --slice <n> \
  --commit "$(git rev-parse --short HEAD)" [--owners <ub-to-lane.json>]
```

It launches Edge through Playwright (`chromium.launch({ channel: 'msedge' })`), opens one context per
role, saves an accessibility snapshot per probe under `exploration/snaps/`, and writes
`exploration/slice-<n>.md` (`artifact: exploration`). Playwright is the project's dev dependency;
when it is absent the note says `NOT RUN` with the reason, and the slice log says so too. Never
mark a row passed that did not run.

On Windows: run from Git Bash or PowerShell with `ELECTRON_RUN_AS_NODE` unset; Edge is the browser
that is present (no Chrome); `npx playwright install msedge` is not needed when Edge is installed.

## 4. Send findings back

Each `FAIL` names a screen, so a file, so a lane. Add it as a task row in **that lane's** list for
its next wave (§5.5), with the UB id, the role and the evidence line. Never open a new lane for it.
Fill `## Not explored` with every row of the slice that has no probe, and why. Re-run the pass on
the fixed slice before the review; the reviewer reads the newest note.

## Refuse

- To count a row as explored from reading the code. A probe ran, or the row is not explored.
- To write a probe whose assertion the defect would pass: a guard probe that types nothing, a
  focus probe that checks only that the dialog closed.
