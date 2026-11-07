---
description: GK · build <root>/knowledge/ from the code that exists; --refresh rebuilds only stale cards.
disable-model-invocation: true
argument-hint: [--refresh]
---

Build or refresh this repository's knowledge cards, then have them reviewed.

This is the stage that makes the rest of the pipeline work on a codebase that already exists. Without
it, every design is reasoned from first principles and lands somewhere plausible and wrong.

## Preflight

1. Print `DEV-PROFILE` §Project (`profile.mjs Project`). If `Name` or `Project maturity` is a `placeholder:`, stop with a
   `> **Project setup required:**` callout naming the section. Guessing a project's own name is how
   `My Project` reaches a production dashboard.
2. If `project_maturity: greenfield` **and** the source root contains no application code, stop and
   say so: there are no conventions to extract from an empty repository, and GK becomes worth running
   the moment there are. Do not write empty cards.
3. `git rev-parse HEAD` — this is the `grounded_at` for every card written in this run. If this is
   not a git repository, stop: without a commit there is no drift detection, and the cards would be
   permanently unverifiable.
4. `node <root>/scripts/build-state.mjs --quiet`, then read `<root>/state.json`.

## Mode: first run

Spawn **`dev-codebase-cartographer`** with a fresh run-id (`YYYYMMDD-HHMMSS-<4hex>`, §1) and the
paths it needs: `DEV-PROFILE.md`, `contracts.mjs 16 2` (never the whole contract), the six templates under
`<root>/_templates/knowledge/`, and the source root.

It writes all six cards. Give it the commit sha and tell it plainly that the citations are the
product — a card whose `file:line` references do not resolve fails its review outright.

## Mode: `--refresh`

Rebuild only what has drifted, because rebuilding all six every time is how a team learns to skip
this step.

1. For each card, read its `grounded_at` and collect the `file:line` citations in its body.
2. `git diff --name-only <grounded_at>..HEAD` — a card is **stale** if any file it cites appears in
   that list, or if a top-level source directory has appeared or disappeared since (which makes
   `codebase-map.md` stale by definition).
3. Report which cards are stale and which are current, with the reason, before doing anything.
4. Spawn the cartographer for the **stale cards only**, passing the current card so it revises rather
   than rewrites — a rewrite loses the nuance somebody added and produces a diff nobody can review.
5. Cards that are current keep their existing `grounded_at`. Do not bump it: a card that was not
   re-read has not been re-grounded, and pretending otherwise disables the only drift check this
   track has.

## Review

Spawn **`dev-gate-reviewer`** with the same run-id, and give it **paths only**: the six card paths,
`DEV-PROFILE.md`, `contracts.mjs 4.5 5 10`, `<root>/_templates/gate-log.md`, the repository itself, and the
prior GK log if this is attempt 2.

Do not pass the cartographer's report, your summary of it, or any explanation of what it did. The
reviewer's whole value is that it opens the citations without knowing which ones the author was
confident about (§4.5).

It invokes `dev-reviewing-knowledge` and writes `<root>/reviews/_repo/GK-knowledge-<run-id>.md`.
`_repo` is reserved (§16.2): GK belongs to the repository, and a slug can never begin with an
underscore, so the knowledge track cannot appear on the board as an initiative.

## On CHANGES_REQUESTED

Re-spawn the cartographer with the gate log path and the findings to resolve **by id**. It returns a
resolution map — every `CR-NNN` marked `fixed`, `accepted` or `disputed`. Then re-spawn the reviewer
for attempt 2, which verifies each finding individually.

Stop after two rounds; a third needs the human's `round_decision` (§4.3).

## After

Say the next command as the thing that happens next, with one clause on what it produces — never as "do you want me to…?" (§4.1a). Offer a choice only where a human decision genuinely exists, and then as options with a recommended default, the way `/sdlc-ask` does.

`node <root>/scripts/build-state.mjs --quiet`, then `node <root>/scripts/status.mjs` verbatim, then at most
three lines: the verdict, anything the cartographer could not reach, and the next command.

On a `PASS`, **commit `<root>/`** — `git add <root> && git commit -m "<gate> <slug> <verdict> (<run-id>)"`.
Not bookkeeping: `--reaffirm` diffs the version a verdict was reached against with the version on
disk (§4.4), so a reviewed version that was never committed cannot be recovered, and the reviewer
will correctly refuse to reaffirm a change it cannot bound. Skip this and the damping valve stops
existing, silently, in the projects with the longest ladders.

If GK passed and no initiative exists yet, that next command is `/sdlc-intake <slug>`.

## Refuse

- To write a card yourself. This command orchestrates; the cartographer authors and the reviewer
  judges. A command that writes the artifact has collapsed all three roles into one context.
- To mark a card reviewed without a gate log. Absence of a log is a block, never a pass (§5.4).
- To let the cartographer edit application code. GK is read-only with respect to the repository —
  it writes into `<root>/knowledge/` and nowhere else.
