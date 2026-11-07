# Evidence — Step 5: honesty about facts (`UNVERIFIED`)

Written for: whoever has to decide later whether Step 5 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P3 Judgment and integrity.

## What was built

| Piece | File |
|---|---|
| Contract | `DEV-CONTRACTS.md` §21 |
| Author rule, in every spawn prompt | `skills/dev-stage-protocol/agent-brief.md` (`Facts:`) |
| Reviewer grading: `MAJOR` when a decision rests on it | `agents/dev-gate-reviewer.md` |
| `W096`: the count of `UNVERIFIED:` claims per artifact | `workspace/dev/scripts/lint-dev.mjs`, §11.2 |
| Tests | `tests/unverified.test.mjs` (5), `tests/mutate.mjs unverified` |

## Claim 1: a planted uncited claim is visible; the cited version is quiet

`node --test tests/unverified.test.mjs` → **5 pass, 0 fail**. The valid fixture's `problem.md` with two
`UNVERIFIED:` claims gets one `W096` warning that counts two. The same sentence, cited, gets none.
The marker quoted in a code span, or the word "unverified" in prose, is not a claim. A gate log that
quotes the marker is exempt.

## Claim 2: the tests can fail

`node tests/mutate.mjs unverified` → **7/7 killed**: the rule firing, code-span exemption, the colon,
gate-log exemption, the count, the author instruction, and the reviewer's `MAJOR`.

## Not yet proven

That an agent actually writes the marker instead of stating a guess. The rule is in every spawn prompt;
whether the model follows it is a behaviour, and Step 6 measures it (the `UNVERIFIED` count and the
uncited-claim judge in the ai-eval suite).
