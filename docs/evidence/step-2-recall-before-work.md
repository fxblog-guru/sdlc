# Evidence — Step 2: read before work

Written for: whoever has to decide later whether Step 2 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P2 Memory and learning.

## What was built

| Piece | File |
|---|---|
| Preflight step 7: recall before the author is spawned | `skills/dev-stage-protocol/SKILL.md` |
| What to do with each recall output, and why the reviewer gets none | `skills/dev-stage-protocol/recall.md` |
| `--shared`: up to three lessons from other projects through the Recall CLI | `workspace/dev/scripts/learn.mjs` (`sharedLessons`) |
| Tests | `tests/recall-before-work.test.mjs` (8), `tests/mutate.mjs recall` |

## Claim 1: the planted lesson reaches the stage, and only when it is there

`node --test tests/recall-before-work.test.mjs` → **8 pass, 0 fail**. With a G4 lesson planted, the
exact command preflight runs prints it with its probe, and a G3 lesson in the same folder stays out.
With the lesson removed, the same command prints `No lesson applies.` (4 tokens).

## Claim 2: Recall is optional and can never stop a stage

The tests use a stand-in Recall binary. No binary: nothing is printed. Recall fails or answers with
garbage: one line is printed, the local index still prints, and the exit code is 0. A hung Recall is
cut off by a 5 s timeout. A poisoned shared lesson is withheld, and only the count is printed.

## Claim 3: the tests can fail

`node tests/mutate.mjs recall` → **10/10 killed**. The mutants: the gate filter, the protocol command,
the unprimed reviewer, the shared scan, fail-open, the timeout, kind=lesson, the limit, the label, and
silence when there is no binary. `node tests/mutate.mjs learn` still kills **15/15**.

While writing this, the mutation runner found two of its own bugs: one mutant pattern quoted `\n`
wrongly, and one file had CRLF line endings that a Python edit introduced. Both were fixed, and the
files were normalised to LF as `.gitattributes` requires.

## Claim 4: cost

Measured on 2026-10-23: the index for 12 lessons capped at 8 is ~360 tokens and takes 0.15 s; one
lesson body is ~90 tokens; no match is ~4 tokens. The reviewer reads none of it.

## Not yet proven

That an *author agent* changes its output because of a recalled lesson. This step proves the lesson
reaches the stage's context. Whether that context changes what the agent writes is a model behaviour,
and Step 6 measures it (ai-eval: the repeated-mistake count with and without lessons).
