---
description: The gate board: every initiative, its gate, what is stale or blocked, and the next command.
disable-model-invocation: true
argument-hint: [<slug>] | --gates | --roadmap
---

Show the pipeline's current state. This command changes nothing.

## Run

1. Rebuild the index so the board reflects the files on disk, not the last run:
   `node <root>/scripts/build-state.mjs --quiet`
2. Print it:
   - no argument → `node <root>/scripts/status.mjs`
   - with a slug → `node <root>/scripts/status.mjs $ARGUMENTS`

Show the script's output **verbatim**. Do not summarise it, reorder it, or soften a `BLOCKED` into
"needs attention" — the board is a fact about files, and the value of a fact is that it arrives
unedited.

## Then, briefly

After the output, add at most three lines of your own:

- If any gate is `STALE`, name the file that changed and offer the two ways forward:
  `/sdlc-gate <slug> <G> --reaffirm` (the change was cosmetic) or re-running the stage (it was not).
- If any gate is `BLOCKED`, name who must act, from the `blocked_reason`.
- If any decision is `open`, point at `/sdlc-ask <slug>`.

With `--roadmap`, run `node <root>/scripts/ideas.mjs list --top 10` after the board and show it
verbatim: what is in flight, then what the last releases said to build next, ranked by a human (§20).

With `--gates`, run `node <root>/scripts/gate-effect.mjs` instead and show it verbatim: what each gate
caught and what escaped it (§22). Name a gate the script flags and the command it suggests.

If there is nothing stale, blocked or open, say only what the next command is. Nothing else is
needed, and a paragraph of reassurance teaches people to skim the one line that matters.

## If the index cannot be built

`build-state.mjs` fails only when `<root>/` is missing or unreadable. Report the error as printed and
stop. Do not reconstruct the board from the markdown yourself — that is exactly the second
implementation of the state rules that `DEV-CONTRACTS.md §8` exists to prevent.
