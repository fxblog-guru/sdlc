---
description: Re-run a gate's review without re-authoring; --reaffirm judges only the diff, --reaffirm-all a cascade.
disable-model-invocation: true
argument-hint: <slug> <G0..G11> [--reaffirm] | <slug> --reaffirm-all
---

Re-review gate `$2` for initiative `$1`. Nothing is authored here; this command exists for the two
cases where the artifact is already written and only the verdict is in question.

## Preflight

1. `node <root>/scripts/build-state.mjs --quiet`, then read `<root>/state.json`.
2. The slug must exist and the gate must have artifacts on disk. If the stage has never produced
   anything, stop: "`$2` has nothing to review yet — run `/sdlc-<stage> $1`."
3. `node <root>/scripts/contracts.mjs 4 2` — §4 names the **review skill** for this gate (never the
   authoring skill), §2 the artifact paths. Do not read the whole contract.

## Mode A — full re-review (default)

Use when a `CHANGES_REQUESTED` was fixed, when a gate is `STALE` after a substantive change, or when
a human simply wants a second look.

Spawn **one** subagent — `dev-gate-reviewer`, for every gate including G7 — and give it
**paths only**:

- the artifact paths for this gate (from `§2`)
- the upstream artifact paths it depends on
- the brief from `node <root>/scripts/review-brief.mjs $1 $2 --out <root>/reviews/$1/.brief-<run-id>.json`;
  spawn on its `model` (opus for heavy gates, sonnet for light ones on a `change` or `fix`, §15.3)
- `DEV-PROFILE.md`; contract sections via `contracts.mjs`, never the whole file
- the template `<root>/_templates/gate-log.md`
- the previous gate log for this gate, if any — so findings are resolved **by id** (§4.3)
- when there is one, the re-review brief from `node <root>/scripts/reaffirm-check.mjs --since <previous
  log> --out <root>/reviews/$1/.brief-<run-id>`: the reviewer reads the diffs, the open findings and
  the paths it lists in full, not the whole artifact again (§4.3)

Do **not** paste artifact content, your own summary of it, or anything from an authoring subagent.
The reviewer's value is that it has seen nothing but the files; a summary from you is the author's
framing arriving by the back door (§4.5).

The subagent invokes the review skill, may run **read-only** commands as evidence (lint, build,
`EXPLAIN`, grep — never migrate, push or edit), and writes a **new** gate log with a fresh `run_id`
and `attempt` = previous attempt + 1 (max 2). It never edits the artifact.

## Mode B — `--reaffirm`

Use only when the gate is `STALE` because an **input** changed and the change looks cosmetic. This
is the damping valve on cascading staleness (§4.4): a typo fix upstream should not force eleven full
re-reviews.

1. From `state.json`, take `stale_because` for this gate. If it names an **output** (the gate's own
   artifact was edited), stop: "`$2`'s own artifact changed — reaffirm is for upstream changes;
   re-run the stage." Reaffirm is never a way to approve an edit to the thing under review.
2. For each changed input, produce the diff between the recorded version and the current file:
   `git log -S` / `git diff` on that path (this is why `<root>/` lives in git). If no prior version
   is recoverable, stop and say so — a reviewer may never reaffirm a diff it did not read.
3. Spawn `dev-reaffirmer` (the mechanical reviewer, on the cheaper model) with **paths only**: the gate's artifacts, the diff file(s) you
   wrote to `<root>/reviews/$1/.reaffirm-$2-<run-id>.diff`, and the prior gate log.
4. Its one question: *does the prior verdict still hold given exactly this change?*
   - **Yes** → a new log, `verdict: PASS`, `revalidated_from: <prior log>`, inputs re-hashed to the
     current content, checklist rows carried from the prior log with evidence
     "unchanged by diff <run-id>" on each.
   - **No** → it declines in the log's `## Verdict` and sets `verdict: CHANGES_REQUESTED`. The stage
     re-runs in full. This is the correct outcome for a substantive change; the reviewer is not
     being difficult.

## Mode C — `--reaffirm-all` (no gate argument)

Use when one upstream change staled several gates — typically a ledger answer cited from G0 to G6.
One reviewer pass, one log per gate (§4.4).

1. Run `node <root>/scripts/run-id.mjs` once, then `node <root>/scripts/reaffirm-check.mjs --cascade $1
   --out <root>/reviews/$1/.reaffirm-<run-id>`. It groups the `STALE` gates: `reaffirm` (input-only,
   reviewed version in history, a diff file per changed input), `follows` (stale only through an
   upstream gate — no log), `excluded` (an output edit, missing history, or waiting on an excluded
   gate). Exit 1 means nothing can be batched: report the `excluded` reasons and stop.
2. Spawn **one** `dev-gate-reviewer` with **paths only**: for each `reaffirm` gate in ladder order,
   its artifacts, its prior log, the review skill §4 names for it, and the diff paths the plan lists
   for that gate. Give it the run-id; it writes `G<N>-<stage>-<run-id>.md` for each gate.
3. Its question, per gate and against that gate's diffs only: does the prior verdict still hold? Yes
   and No are as in Mode B, one log each. A decline on one gate does not decline the others.
4. Re-run step 1. A gate that was `excluded (waits)` and whose blocker now has a log in force may
   enter a second batch; a gate excluded on its own account is reported with its command.

## After any mode

`node <root>/scripts/build-state.mjs --quiet`, then `node <root>/scripts/status.mjs $1` verbatim, then one
line: the verdict and the next command.

## Refuse

- Reaffirm on a gate that is not `STALE`, or whose staleness is an output edit — in a batch, any
  gate the cascade plan did not put in `reaffirm`.
- Any request to "just mark it PASS". A human may `override:` a gate in the log with their name and
  reason (§4.5); an agent may not, and this command will not write one.
- A third full review of a gate since its last `PASS` without an answered DEC (§4.3, E045). Put
  the open findings to the human as one `DEC-NNN`: **fix now** (one more round) · **ship with known
  risks** (each finding with an owner and a target gate; the human writes `override:` citing the DEC)
  · **abandon the slug**. Write `round_decision` only once it is answered. This holds at G7, G8 and G9.
