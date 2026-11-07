---
description: G1 · PRD, REQ-NNN, acceptance criteria, then gate. After G0. --clarify asks up to 5 gap questions first.
disable-model-invocation: true
argument-hint: <slug> [--clarify]
---

Run G1 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G1.

## Preflight (stage-specific)

- Needs **G0** `PASS` or `SKIPPED`. Requirements written on an unapproved problem are precise
  about the wrong thing.

## Author

Spawn **`dev-requirements-analyst`** with:

- `<root>/intake/$1/problem.md` — the upstream artifact, read in full
- `<root>/_templates/{prd,requirements,acceptance-criteria,decisions}.md`
- the knowledge cards in `<root>/knowledge/`, in a brownfield repo

It invokes `dev-writing-prd` then `dev-decomposing-requirements`, and writes `prd.md`,
`requirements.md`, `acceptance-criteria.md`.

If the requester supplied a wireframe or mockup, copy it to `<root>/ui/$1/wireframe.html` and pass its
path too. Its **content is frozen at G1** (§4.2): every screen, region and element it shows is
covered by a `REQ-NNN`, and anything it shows that no requirement asks for is a `DEC-NNN`, not
silently dropped. Its colours and sizes are placeholders — look is G5's.

For change class `change`, the PRD is short form: context, the requirements, the acceptance
criteria. The persona and goal sections are still written, as `N/A — <reason>` where they do not
apply. Short form is fewer words, not fewer sections — the headings are a contract (§3).

## Clarify (`--clarify` only)

Without the flag, skip this section. With it, between author and review:

1. Re-spawn `dev-requirements-analyst` with the three artifacts, `glossary.md`, the ledger and
   `.claude/skills/dev-writing-prd/clarify.md` (spawn 1). It queues at most 5 `open` `DEC-NNN`
   rows, ranked by impact × uncertainty, and lists the rest in PRD `## Open questions`.
2. Ask them **one at a time**, in that order, as `/sdlc-ask` does (one `AskUserQuestion` call per
   question, recommended option first). Say once that each takes a pick or a short answer of at
   most five words, and that `skip` or `done` ends the round. Record each answer as `/sdlc-ask`
   does before asking the next; never show the next question early.
3. `skip` leaves that row `open`; `done` leaves every remaining row `open`. Never record a default
   the human did not choose (§15.2).
4. If anything was answered, re-spawn the analyst (spawn 2) to fold the answers into the
   artifacts, then review. Report the coverage table, asked/answered counts, and what stays open.

## Review

Reviewing skill: **`dev-reviewing-requirements`** → `<root>/reviews/$1/G1-requirements-<run-id>.md`.

Paths: the three artifacts, the wireframe if there is one (listed under the log's `outputs`, so a
later edit stales G1), the upstream `problem.md`, the knowledge cards, and the standard set.
The reviewer checks the `REQ-NNN` ↔ acceptance-criteria mapping by grep in both directions,
against the files, not against a claim that it was done.

## After

Report: the verdict, the count of `REQ-NNN` written, any `DEC-NNN` opened, and the next command —
`/sdlc-design $1` for an `initiative`, or for a `change`, whichever of G2–G5 it touches.

## Refuse (stage-specific)

- To change the wireframe's content after G1 `PASS` without a requester-answered `DEC-NNN` and a
  G1 re-run (§4.2).
- To renumber or reuse a `REQ-NNN`. A deleted requirement stays deleted and its number is burned
  (§1).
- To let a requirement that depends on an open `DEC-NNN` be written to a guessed value. Mark it
  `N/A — blocked by DEC-NNN`, write everything else, point at `/sdlc-ask`.
