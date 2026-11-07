# Changelog

All notable changes to the Agentic SDLC viewer. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the version is the one in `package.json`.

## [Unreleased]

## [0.5.3] — 2026-11-02

### Changed
- The board accepts the `fast`, `refactor` and `spike` change classes of sdlc 1.11.0.
- The update menu runs `npx agentic-fx@latest update --bundle dev` for a project installed with
  the public npx package (notice `source` starting `npm:`), and `afx update --bundle dev`
  otherwise. Before, a public user clicking "Run" got `afx: command not found`.

## [0.5.2] — 2026-10-24

### Fixed

- Long text no longer squeezes a row into a narrow column. Needs you lists at most three ids and
  shows a longer list as a range. Rows in Needs you and Decisions wrap in their own column; a
  decision's question is clamped to three lines and its answer to two.

## [0.5.1] — 2026-10-24

### Changed

- Agents is a tab on the board instead of a separate sidebar view, whose inline styles the
  webview's Content-Security-Policy blocked.

### Removed

- The *Initiatives* and *Open findings* sidebar trees; the Overview's Tasks and Findings tabs show
  the same things.

## [0.5.0] — 2026-10-24

### Added

- **Agents view.** Shows who is working on the selected project: each Claude Code subagent with
  the work items it names, what it did last, and whether it is working, idle or done. Agents that
  ran together sit at one table. **SDLC: Open Agents** opens it. Transcripts are read, never written.
- **Summary, Decisions and Needs you views** on the board and in the sidebar.
- **Activity log.** Reads `<root>/logs/activity.jsonl` (format in `docs/activity-format.md`).

## [0.4.1] — 2026-10-16

### Changed

- **Follows the SDLC root (sdlc 1.6.0).** `sdlc.statePath` defaults to empty: each project reads
  `.sdlc/state.json` when it has a `.sdlc/` root, else `dev/state.json`. **SDLC: Select Project**
  lists `.sdlc/` and `dev/` projects together, the live reader and watchers follow the selected
  project's own root, and the `.sdlc` dot folder is no longer dropped as a copy. An explicit
  `sdlc.statePath` still wins. Also activates on `workspaceContains:**/.sdlc/state.json`.

## [0.4.0] — 2026-10-15

### Added

- **Update available.** When `.claude/.agentic-fx-updates.json` (written by `afx`, read here with
  no network) says a newer dev bundle exists, the version pill turns amber with an arrow and the
  word "update", and is a button with a spoken label. It opens a quick pick: open the CHANGELOG,
  run `afx update --bundle dev` in a terminal after a confirmation, or dismiss that version
  (stored in workspace state). A MAJOR says to read `UPGRADE.md` first. New command
  **SDLC: Bundle Update Options**. `AFX_NO_UPDATE_CHECK=1` silences it.

### Changed

- **The update notice follows the selected project.** In a workspace with several projects the
  notice is read from the `.claude/` folder of the project chosen with **SDLC: Select Project**
  (or the most recently updated one), the pill redraws when the selection changes, and
  `afx update` opens its terminal in that project's root, not the workspace root.
- Also activates on `onStartupFinished`, so a nested project whose `dev/state.json` is gitignored
  (and so invisible to `workspaceContains`) still gets the views.

## [0.3.0] — 2026-10-15

### Added

- **Project picker for large workspaces.** When the workspace holds several projects on the bundle
  — nested folders, or several workspace folders — every one is found, and **SDLC: Select Project**
  (the folder icon on each view) switches the board, the trees, the watchers and the status bar
  between them. The choice is remembered per workspace; "Most recently updated" keeps the old
  behaviour of following the last command. The views name the project on show. Search depth is
  now five levels, and a folder with an index is not searched further.

## [0.2.1] — 2026-10-14

### Added

- **Versions on screen.** The board header shows a pill with the addon version and the sdlc
  bundle version that built the index (`board v0.2.1 · sdlc v1.4.0`), and the status bar tooltip
  lists both, so a project still on an older bundle is visible at a glance.

## [0.2.0] — 2026-10-13

### Added

- **Realtime.** The board used to move only when `dev/state.json` was rewritten, at the end of a
  command or on the Stop hook, so hours of lane work, reviews and verification showed nothing. It
  now watches the files the index is built from and redraws about 300 ms after a burst of writes:
  `progress.md`, gate logs under `dev/reviews/`, verification runs, lane notes, the decision
  ledger, and git's `HEAD`, reflog and branch refs. Three watchers in all, dot folders such as
  `.claude/worktrees` ignored, no polling, no extra process.
- **Read where the index is stale.** Task status comes from `progress.md`, and decision status from
  the ledger, when those files are newer than the index. A gate log newer than the one the index
  recorded shows its verdict *beside* the builder's state, marked "from log". A verification run
  or lane notes written after the index show the gate as reviewing or authoring, marked "live" and
  explained as inferred. Nothing replaces the builder's state, and the next rebuild settles it.
- **Live activity**: a live pulse, the last event ("TASK-120 done · 2 min ago"), and an activity
  feed of commits (read from `.git/logs/HEAD`), progress transitions, gate logs, verification runs
  and lane notes. The relative times keep ticking.
- **`sdlc.backgroundRebuild`** (off by default) runs the project's own
  `node dev/scripts/build-state.mjs` when a source changes, at most once per
  `sdlc.backgroundRebuildSeconds` (120 s) and never twice at once. It is off because it is the one
  path that writes to the workspace.
- **Redesign, lavender accent.** A connected G0–G11 stepper in which every state has an icon, a
  colour and a word. A progress ring. KPI tiles for tasks done, open findings by severity, the
  current gate and its attempt. A findings list with severity chips and each finding's problem
  read from its gate log, plus a Findings tab in the sidebar. Empty states, and subtle transitions
  that `prefers-reduced-motion` turns off. Surfaces and text stay theme tokens. Lavender is the
  accent, the focus ring, selection and progress, with a faint wash behind the hero. Purple text
  uses a deeper shade that passes WCAG AA on dark, light and tinted surfaces. High-contrast themes
  drop the washes and use the theme's borders.
- **`sdlc.accent`**: `lavender` (default), `purple` (more saturated), or `theme` to follow the
  editor's accent.
- **Status bar**: accent-tinted, leading with the current gate and its state, with a filled dot
  while files are moving and the last event in the tooltip.

### Added earlier, first released in 0.2.0

- **Sidebar Overview** — a webview view at the top of the Agentic SDLC container, tabbed
  **Now / Tasks / Requirements**, so the state of the initiative is one glance away while coding.
  *Now* leads with a progress ring, the gates as a vertical stepper, suggested actions, what is up
  next and recent gate activity. *Tasks* has the counts as tiles, status and stack filters, search,
  and a detail view with the task's description, its "Done when" clause, requirements, files and
  tests. *Requirements* lists every requirement with the fraction of its tasks done and expands to
  those tasks.
- **Suggested actions.** Each card restates a state the builder recorded — a blocked gate, changes
  requested, a blocking decision, stale gates, the gate being authored, carried findings — and
  names the bundle command for it, with a copy button. The board still runs nothing.
- **Board tab redesigned** around the same sections: hero with progress, readable gate ladder,
  actions, stat tiles, up next, recent activity, a filterable task table with a detail panel, and
  the requirements list. The view model (`viewmodel.ts`) is unit-tested and the page only draws it.
- Task counts in the tree view description and in the status bar (`40/122`).

### Fixed

- **A parent folder of several projects showed nothing.** The index was only looked for at the
  workspace root. It is now found up to three levels down, skipping dot folders (agent worktrees
  under `.claude/` hold copies that are not the project of record); when several projects have one,
  the most recently rebuilt wins. Artifact links and the freshness check resolve against that
  project.
- A requirement "priority" that is prose rather than `P0`-style no longer becomes a filter chip.

## [0.1.1] — 2026-09-19

### Fixed

- **GK was parsed and then rendered nowhere.** `status.mjs` prints the knowledge gate above the
  ladder on every run; the extension dropped it, so two renderings of one index disagreed about
  which gates exist — and the omitted one is what every brownfield gate downstream rests on. The
  board, the tree and the status bar now share one `knowledgeSummary`, so they cannot drift apart
  again.
- **A new install looked broken.** With no initiatives the board rendered five empty columns and
  nothing else, which reads as a failed extension rather than as an empty pipeline. It now says the
  index is real and current, gives the command to start one, and adds the `/sdlc-onboard` note when
  the repository has no knowledge cards.
- **The findings view could not tell "nothing in flight" from "everything clean".** Both showed the
  same thing; only the second is good news.

## [0.1.0] — 2026-09-19

First packaged release. The viewer is read-only by design and stays that way: it renders
`dev/state.json` and never writes to the workspace, never runs a `/sdlc-*` command, and never
re-derives a gate state for itself.

### Added

- **Board** (`SDLC: Open Board`) — initiatives in five columns derived from the current gate, each
  card carrying a twelve-cell gate strip, with the selected initiative's tasks in the four statuses
  from `DEV-CONTRACTS.md` §10.
- **Initiatives tree** — initiative to gate to the artifacts it produced, the inputs it rests on and
  its gate log, each opening the file. A stale gate shows which input changed and between which
  hashes.
- **Open findings tree** — every unresolved `CR-NNN` across every initiative, linking to the gate
  log that raised it.
- **Status bar** — the initiative furthest along that is still in flight, its gate and its open
  finding count. Toggle with `sdlc.showStatusBar`.
- **Staleness banner** — shown when a referenced file is newer than the index's `generated_at`.
  It compares modification times rather than recomputing `source_hash`, which would mean a second
  implementation of the builder's hashing rules; this errs towards saying "possibly stale" and
  cannot stay silent when something has changed.
- **`sdlc.statePath`** for workspaces whose dev root is not `dev/`.
- Refusal, with the reason shown, on a missing index, malformed JSON or an unrecognised
  `schema_version` — none of which is guessed at.
