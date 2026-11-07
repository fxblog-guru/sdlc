# Agentic SDLC — VS Code viewer

A live, read-only board for the [`agentic-fx-dev`](https://gitlab.com/agentic-fx/sdlc) pipeline. It shows where every
initiative is, which gate is holding it up, and what is left to build — without you opening a single
markdown file, and without it ever writing one.

## What it shows

**Board** (`SDLC: Open Board`)

- **The initiative**: its phase, progress ring, and G0–G11 as a connected stepper. Each gate is
  passed, stale, changes requested, blocked, reviewing, authoring, ready or not started, shown as
  an icon, a colour and a word.
- **KPI tiles**: tasks done, open findings by severity, the current gate, its review attempt,
  requirements covered and open decisions.
- **What next, open findings and activity**: suggested actions with the bundle command to copy,
  every open `CR-NNN` with its severity and problem, and a feed of commits and pipeline files with
  relative times that keep ticking.
- **Tasks** in the four statuses from `DEV-CONTRACTS.md §10` (todo · in-progress · blocked · done),
  filterable and searchable, with a detail panel; then the requirements and the tasks behind each.

- **Summary, Decisions and Needs you**: what the initiative does, the gate it is on, every gate's
  state and the percent done. Every `DEC-NNN`, grouped as open, assumed and answered, with the
  `/sdlc-ask` command that answers or confirms them in one batch. Everything that waits on a person:
  decisions, UI approvals, sign-offs, and an autonomy run's stops.

**Sidebar Overview**: the same page at sidebar width, with the tabs Summary · Activity · Decisions ·
Findings · Needs you · Tasks · Agents.

**Activity log**: the bundle appends gate and decision events to `<root>/logs/activity.jsonl`
(`docs/activity-format.md`). Runs and stops recorded there show in Activity, and anything with
`needs` set shows in Needs you until a later event clears it. stlc, ai-eval and qa-standup read and
write the same format.

**Agents** — a tab on the board, beside *Board*, and the last tab in the sidebar. It shows who is
working on the selected project right now: every Claude Code chat that touched it, whether that
chat was opened in the project, in a parent folder or in a sibling worktree, and the subagents each
chat spawned. Each agent is a figure with a name, the work items it was given, and its last step.
Agents that ran together sit at one round table. Click one to read what it was asked and to open its
transcript. The tab reads `~/.claude/projects` and writes nothing there. The count next to the tab
name shows how many agents are working. **SDLC: Open Agents** opens the board on this tab.

The sidebar used to have separate *Initiatives* and *Open findings* trees. They are gone, because the
Overview's Tasks and Findings tabs show the same things.

**Status bar** — the initiative furthest along that is still in flight: its gate and that gate's
state, task progress and open findings, in the accent colour, with a filled dot while files are moving.

**Look** — a soft lavender accent on the editor's own surfaces, in dark, light and high-contrast
themes. Every state is an icon, a colour and a word together. `sdlc.accent` switches to a more
saturated `purple`, or to `theme` to follow the editor's accent.

## Live while agents work

`state.json` is rebuilt at the end of a command and on the Stop hook. A G7 lane or a G8 run can take
hours, and the files it writes in that time are what the board shows, as they are written:

| Source | What the board does with it |
|---|---|
| `implementation/<slug>/progress.md` | Task status and counts, when the file is newer than the index; "TASK-095 done" in the feed |
| `reviews/<slug>/G*.md` | A gate log newer than the index's shows its verdict beside the gate, marked *from log* |
| `verification/<slug>/runs/*` | G8 shows as authoring or reviewing, marked *live* and explained as inferred |
| `implementation/<slug>/lanes/*.md` | G7 shows as authoring, marked *live*; lane updates in the feed |
| `decisions/<slug>.md` | Decision status, when the ledger is newer than the index |
| `.git/HEAD`, `.git/logs/HEAD`, `.git/refs/heads/**` | Branch and head in the header, commits in the feed (read from the reflog, so no git process) |

Three file watchers cover all of it, debounced at about 300 ms, ignoring dot folders such as
`.claude/worktrees`. There is no polling and no extra process. An overlay never replaces the
builder's state: it is drawn beside it with its source, and the next rebuild settles it. Copying a
newer gate log's own `verdict` is reading, not deriving, since §8 says the logs win when the two
disagree. With `sdlc.backgroundRebuild` on, the project's `build-state.mjs` also runs in the
background, at most once per `sdlc.backgroundRebuildSeconds`.

## What it deliberately does not do

It does not derive a gate state, apply a threshold, or judge anything. It reads
`dev/state.json` — the derived read model whose schema is frozen in `DEV-CONTRACTS.md §8` — and renders
it. It reads a few tables directly (above) only to show what has happened since the index was built. Every rule lives in the bundle, enforced by the review skills and `build-state.mjs`.

That restraint is the point. A second implementation of the gate rules inside an editor plugin would
drift from the contract within weeks, silently, because nobody diffs a viewer against a
specification. If something looks wrong on this board, the bug is in a gate log or in the builder —
and that is exactly where you want to be sent.

It never runs a `/sdlc-*` command, and it writes to the workspace only if you turn on
`sdlc.backgroundRebuild`, which runs the same builder the Stop hook runs. The gate logs are an audit
trail; a viewer that could nudge them would make every green board a little less believable.

## Freshness

The index is generated. If a file it references has been modified since `generated_at`, the board
shows a banner rather than pretending to be current.

The obvious check — recompute `source_hash` and compare — would mean re-implementing the builder's
exact hashing rules (body only, CRLF folded, trailing whitespace stripped). That is the duplication
this extension exists to avoid, so it compares modification times instead: cheap, and it fails in
the safe direction. It can say "possibly stale" when nothing meaningful changed; it cannot stay
silent when something did.

## Bundle updates

When `afx` has found a newer agentic-fx-dev release, it writes `.claude/.agentic-fx-updates.json`.
The board reads that file (it never goes to the network) and turns the version pill amber, with an
arrow and the word "update". Click it, or run **SDLC: Bundle Update Options**, for three choices:
open the CHANGELOG, run `afx update --bundle dev` in a new terminal (after you confirm; the
extension writes nothing itself), or dismiss that version, remembered per workspace until a newer
one appears. A MAJOR says to read `UPGRADE.md` first. `AFX_NO_UPDATE_CHECK=1` hides the notice.

With several projects in the workspace, the notice and the install manifest
(`.claude/.agentic-fx.json`) are read from the project chosen with **SDLC: Select Project**, and the
terminal opens in that project's root.

## Requirements

A workspace containing `.sdlc/state.json` or `dev/state.json`, produced by the bundle. Set
`sdlc.statePath` only when DEV-PROFILE `SDLC root` names another folder.

## Develop

```bash
npm install
npm run compile      # tsc → out/
npm test             # unit tests: the model, the view model and the live layer
npm run test:integration   # downloads VS Code and runs the suite inside it
npx @vscode/vsce package --no-dependencies   # build the .vsix
# then press F5 in VS Code to launch an Extension Development Host
```

`state.sample.json` is shared with the bundle: it is both what these tests render against and the
expected output of `build-state.mjs`. If the builder and this viewer ever disagree about the shape
of the index, that fixture is where it surfaces first.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `sdlc.statePath` | empty | Where the index lives, relative to the project folder. Empty: `.sdlc/state.json`, else `dev/state.json` |
| `sdlc.showStatusBar` | `true` | Show the active initiative in the status bar |
| `sdlc.accent` | `lavender` | `lavender`, `purple`, or `theme` (follow the editor accent) |
| `sdlc.backgroundRebuild` | `false` | Run `build-state.mjs` in the background when a source changes. It writes `state.json` and `DASHBOARD.md` |
| `sdlc.backgroundRebuildSeconds` | `120` | Minimum seconds between two background rebuilds |
