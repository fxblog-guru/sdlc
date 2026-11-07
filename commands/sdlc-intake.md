---
description: G0 · frame the problem, declare the change class, then gate. The first command for a new slug.
disable-model-invocation: true
argument-hint: <slug> [--class initiative|change|fix|refactor|spike|fast]
---

Run G0 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G0.

## Preflight (stage-specific)

- `DEV-PROFILE.md`: `Name` and `Project maturity` must not be placeholders. For an `initiative` or `fast`,
  ask now what `§Environments` leaves open (host, `staging`, who deploys, secret store, mail sender) and
  record each gap as a `DEC-NNN` blocking G2, never G10 (§13.4).
- If `$1` already exists as an initiative, stop and print its status — a slug is never reused.
- Validate the slug: lowercase kebab, ≤40 characters. It is permanent after G1 (§1).
- Brownfield: `<root>/knowledge/` must be populated (GK is upstream of the ladder, §16).
- Determine the change class, in this order: the `--class` argument · the intake description when
  it is unambiguous · `Default change class` from the profile. **Say which one you used and why.**

## Start from what the last release found

If `<root>/ideas.md` exists and the human gave no request of their own, run
`node <root>/scripts/ideas.mjs list --top 3` and offer those ideas first, recommended one first.
When the slug takes one, set its row's Status to `taken: $1` and cite the `IDEA-NNN` in `problem.md`.
Never rank an idea yourself (§20).

## Declare the class, and skip by class

Write the class into `problem.md`'s front matter, then size it: `node <root>/scripts/size.mjs
estimate $1` (`--touches G3,G4` for a `change`) prints the gates, the skips and why, tokens, cost
and the spawn budget (§15.3). Exit 3 is over the profile's `Token budget`: stop, show the estimate,
and ask; re-run with `--approved-by "<name>"` only when a human agrees. Then, for every gate the class does not run,
write a `SKIPPED` gate log with `skip_reason.type: NOT_APPLICABLE` and the class as the
explanation (§15.1) — **now**, not lazily. A gate with no log is blocked, not skipped (§5.4).

| Class | Gates that run | Skipped by class at intake |
|---|---|---|
| `initiative` | G0 → G11 | none |
| `change` | G1 (short form) · G6 · G7 · G8 · G9, plus any of G2–G5 and G10–G11 the change touches | G0 only |
| `fix`, `refactor` | G7 · G8 · G9 | G0 · G1 · G2 · G3 · G4 · G5 · G6 |
| `spike` | G0 · G2 | G1 · G3 → G11 |
| `fast` | G0 · G1 · G7–G10; G2–G5 when needed (`/sdlc-fast`) | G2 · G3 · G4 · G6 · G11 |

For class `change`, do **not** guess which of G2–G5, G10 or G11 apply: leave them `NOT_STARTED`
for each stage's reviewer to decide (§5.4; why G10 and G11 too: §15.1).

For `change`, `fix` or `refactor`, G0 is skipped; what remains is to write the skip logs, create
`<root>/decisions/$1.md` for any question, rebuild the state, and point at `/sdlc-requirements
$1` (`change`), `/sdlc-plan $1` (`fix`) or `/sdlc-refactor <target>` (`refactor`). If the fix answers
a QA defect, record its `DEF-<slug>-NNN` id(s) now, in the skip log's `## Scope` and in
`<root>/decisions/$1.md`; G9 carries them into the handoff so `/qa-defect --verify` can close them (§9).

## Author — every class that runs G0

Spawn **`dev-requirements-analyst`** with `<root>/_templates/problem.md`,
`<root>/_templates/decisions.md`, the knowledge cards if they exist, and whatever raw input the human
gave — a ticket, a paragraph, a conversation.

It invokes `dev-framing-problem` and writes `<root>/intake/$1/problem.md`.

The request usually arrives as a solution: the analyst works back to the problem and says so in
`## Open questions`, so the requester can correct the reframing early.

A `spike`'s `problem.md` frames the **question**, time box and answering result; G2 records the
answer as an ADR, and `spike/$1` is never merged (§15.1).

## Review

Reviewing skill: **`dev-reviewing-intake`** → `<root>/reviews/$1/G0-intake-<run-id>.md`.

Paths: `<root>/intake/$1/problem.md`, `<root>/decisions/$1.md` and the standard set; never why the
analyst reframed the request — the reviewer judges that itself.

## On CHANGES_REQUESTED

G0's usual human-only findings are "how many people have this problem" and "what does it cost
today". Raise them as `DEC-NNN` with range options through `/sdlc-ask $1` **before** attempt 2.

## After

Report: the verdict, any `DEC-NNN` opened, and the next command.

## Refuse (stage-specific)

- To accept a class that contradicts the description. "Add a field and a migration" is not a
  `fix`, whatever the flag says (§15.1).
- To invent scope, budget, deadlines or risk tolerance. Those are `DEC-NNN` (§15.2).
