---
name: dev-stage-protocol
description: The protocol every /sdlc-* stage command runs: preflight, spawn rules, review round, how a stage ends. Invoked by stage commands only.
user-invocable: false
---

# Stage protocol

Every `/sdlc-<stage> <slug>` command runs this protocol. The command file holds only what differs
for its gate: the artifacts, the paths each subagent gets, its own preflight checks, its own
refusals. Where a command and this file disagree, the command wins; where either disagrees with
`DEV-CONTRACTS.md`, the contract wins.

`G<N>` is the gate the command runs. `$1` is the slug. Section references (`§4.5`) are to
`DEV-CONTRACTS.md`; print one with `node <root>/scripts/contracts.mjs 4.5`.

## 1. Preflight — in this order, stop at the first failure

1. Print the `DEV-PROFILE` sections this stage needs (`node <root>/scripts/profile.mjs Stacks …`).
   A `placeholder:` line there is a setup error: stop with `> **Project setup required:**`. Never guess.
2. `node <root>/scripts/build-state.mjs --quiet`, then read `<root>/state.json`.
3. `$1` must exist — else "no initiative `$1` — run `/sdlc-intake $1` first". The gates this
   stage needs must be `PASS` or `SKIPPED`. Otherwise stop; name the gate, its state, and the one
   command that resolves it.
4. If `G<N>` is already `PASS`, stop: re-running overwrites a reviewed artifact, and
   `/sdlc-gate $1 G<N>` re-reviews. If `STALE`, name the changed input and offer
   `/sdlc-gate $1 G<N> --reaffirm` for a cosmetic upstream change, or a full re-run for a
   substantive one.
5. Brownfield (`project_maturity: brownfield`): the knowledge cards the command names must exist
   in `<root>/knowledge/`, else stop — "run `/sdlc-onboard` first" (§16.4).
6. Read `<root>/decisions/$1.md` if it exists. Surface any `open` `DEC-NNN` that blocks this stage
   **before** authoring, and point at `/sdlc-ask $1`.
7. Lessons: `learn.mjs recall --gate G<N> --stage <stage> --shared`; see `recall.md`.
8. `size.mjs check $1`: exit 1 is over budget; record a reason or stop (§15.3).
9. Then the command's own checks.

## 2. Author

Spawn the agent the command names with a **fresh run-id** from `node <root>/scripts/run-id.mjs` (`YYYYMMDD-HHMMSS-xxxx`, 4 lowercase hex) and **paths
only**: the command's inputs and templates, `DEV-PROFILE.md`, the `contracts.mjs` sections
(never the whole contract), and on attempt 2 the prior gate log. Repeat the command's stage-specific
instructions: authors miss them most.

The author copies the template, fills every section (`N/A — <reason>` where one does not apply),
leaves `status: draft` and `reviewed_by: pending`, and hands back **paths only** (§4.5). It never
writes a gate log, never edits an upstream artifact, never answers a `DEC-NNN`.

Every spawn prompt ends with `dev-stage-protocol/agent-brief.md`'s block, filled in. Authors running
code also get `environment.md`; writing code, `comments.md`.

Agents invoke skills by name; on "unknown skill", Read `.claude/skills/<name>/SKILL.md` and follow it.

## 3. Review

Write the brief, `review-brief.mjs $1 G<N> --out <root>/reviews/$1/.brief-<run-id>.json`, and spawn
`dev-gate-reviewer` on its `model` with the **same run-id** and **paths only**: the brief, the
upstream artifacts, `<root>/decisions/$1.md`, `<root>/_templates/gate-log.md`, the prior log.

Name the reviewing skill the command specifies. The reviewer invokes that one skill and no other.

Pass **nothing** from the author — no summary, no reasoning, no handback text (save the §4.3 map),
no self-assessment (§4.5, §12.3). The reviewer writes `<root>/reviews/$1/G<N>-<stage>-<run-id>.md`
(`…-<run-id>-a2.md` on attempt 2, §5).

## 4. On CHANGES_REQUESTED

1. Sort the findings. One only a human can close — a count, a cost, a priority, a date — becomes
   a `DEC-NNN` with options and goes through `/sdlc-ask $1` **before** attempt 2 (§4.3, §15.2).
2. Re-spawn the author with the gate log path and `dev-stage-protocol/receiving-review.md`. It
   resolves every `CR-NNN` **by id**, with evidence, and returns a resolution map (§4.3). A
   `disputed` finding is legitimate; it is recorded, not argued.
3. Re-spawn the reviewer for attempt 2 (or after `STALE`) with the `reaffirm-check.mjs --since
   <prior log> --out <root>/reviews/$1/.brief-<run-id>` brief and the map, verbatim. It verifies
   each finding: `RESOLVED` / `ACCEPTED` / `REOPENED`.
4. After round 2 at this gate, counted across runs since its last `PASS`, stop: one `DEC-NNN` via
   `/sdlc-ask` — fix now · ship with known risks · abandon. A third round cites it as `round_decision` (E045, §4.3).
5. A finding owned by an earlier gate — a contract break, a schema change, a requirement the
   design cannot meet — re-opens that gate; this stage stops (§12.6).

On `BLOCKED` do not open attempt 2: name the missing precondition and the command that supplies it.

## 5. After

1. `node <root>/scripts/build-state.mjs --quiet`; then print `status.mjs $1` and
   `learn.mjs brief` verbatim (§19.5).
2. At most three lines: the verdict, what the command says to report, and the next command as
   what happens next — never "do you want me to…?" (§4.1a). A choice only where a human decision
   exists: two to four options, recommended first.
3. On `PASS`, commit: `git add <root> && git commit -m "docs(sdlc): G<N> $1 PASS (<run-id>)"`.
   `--reaffirm` needs the reviewed version committed (§4.4).

## 6. Always refuse

- To write the artifact or the gate log yourself. Three roles, three contexts (§4.5).
- To proceed past a required gate that is not `PASS` or `SKIPPED` (§4.2).
- To let the author edit an upstream, already-passed artifact. That is a finding, and the edit
  turns its gate `STALE` with everything downstream (§4.4).
- To answer a `DEC-NNN` or proceed on a default of your own. `status: assumed` needs a named human
  (§15.2).
- To declare the gate `SKIPPED` from the command or the author. Only the reviewer may, against its
  published applicability rule (§5.4).
- To renumber or reuse any `REQ` / `TASK` / `SLO` / `ADR` / `MIG` id (§1).

Unattended (`autonomy.mjs mode` not `off`): follow `autonomy.md`.

## Context discipline

Spawn prompts carry paths, never file contents. Contract and profile are read by section
(`contracts.mjs`, `profile.mjs`). One stage per session: state is on disk,
so `/clear` between stages keeps turns small. Nothing from an author's context reaches a reviewer's.
