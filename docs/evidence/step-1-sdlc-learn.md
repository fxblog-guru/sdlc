# Evidence — Step 1: lessons store (`/sdlc-learn`)

Written for: whoever has to decide later whether Step 1 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim below names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` (on top of `feat/learning-roadmap`) · Pillar: P2 Memory and learning.

## What was built

| Piece | File |
|---|---|
| Contract | `DEV-CONTRACTS.md` §19 |
| Command | `commands/sdlc-learn.md` |
| Script: check · harvest · recall · show · audit | `workspace/dev/scripts/learn.mjs` |
| Safety scanner (the QA bundle's file, byte for byte) | `workspace/dev/scripts/lib/lesson-scan.mjs` |
| Template and folder | `workspace/dev/_templates/learning.md`, `workspace/dev/learnings/README.md` |
| Tests | `tests/learn.test.mjs` (29), `tests/mutate.mjs learn` (mutation check) |

## Claim 1: the gate refuses every broken lesson, and accepts the valid one

`node --test tests/learn.test.mjs` → **29 pass, 0 fail**. Eighteen tests each feed one broken lesson
and assert the refusal reason. The broken cases are: no front matter, a missing key, a bad id, a file
name that differs from the id, a bad status, a bad confidence, a bad date, a probe that is not a
question, a non-kebab `applies_to`, missing evidence, `established` on one initiative, a deprecation
with no reason, `superseded_by` pointing at nothing, an empty body, a body over 30 lines, an injection,
a secret, and a near-duplicate. The shipped template, filled in, passes.

## Claim 2: the tests can fail (they are not decoration)

`node tests/mutate.mjs learn` disables each rule in `learn.mjs` in turn and runs the tests. Result:
**15/15 mutants killed**. Every rule tested this way makes at least one test fail when it is removed.
Rules covered: two-initiative `established`, evidence exists, unsafe scan, near-duplicate, recall
withholding, the repeat and rework thresholds, reopened findings, template placeholders not being a
lesson, `covered`, one slug counting as one source, deprecated lessons not recalled, flagged subjects,
probe ends in `?`, body line cap.

## Claim 3: it finds real signals in real projects

`learn.mjs harvest --root <project>/.sdlc`, read-only, on the three sdlc projects in this workspace:

| Project | Signals | Example |
|---|---|---|
| recall | 13 | G1, G2, G6 and G8 each needed a second attempt on two different initiatives |
| release-management | 19 | findings reopened at G0, G1, G4 and G7 |
| fx-blog | 11 | findings reopened repeatedly at G1 and G2 |

No project was written to. Whether these signals turn into *useful* lessons is not claimed yet. That
needs `/sdlc-learn` to be run on them, with a human judging the output.

## Claim 4: nothing else broke

`node --test tests/*.test.mjs` → **785 tests, 782 pass, 0 fail, 3 skipped** (the same 3 skip on `main`).
The bundle invariants caught one overrun while this was built (`dev-gate-reviewer` at 1609 words,
cap 1600). The fix was to shorten the text, not to raise the cap.

## Not yet proven (later steps)

- That a stage *reads* a lesson and avoids the mistake. That is Step 2's check (planted-lesson fixture).
- That the repeated-mistake count falls across versions. That is Step 6 (ai-eval).
