# Evidence — Step 5c: value you can see

Written for: whoever has to decide later whether Step 5c of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P5 Value and experience.

## What was built

Value checks went into the templates each stage already writes, judged by the gate that already reads
them. There is no new stage and no new command.

| Where | Check | Gate row |
|---|---|---|
| `problem.md` | `Kill: <result, by when>` for an initiative; `W097` without it | G0 row 13 |
| `architecture.md` | an `extensibility` row: the next two features, no core change | G2 row 23 |
| `visual-design.md` | `Usability: <task> — <who> — <time> — <hesitation>`, walked by a named person | G5 row 31 |
| G8 | web budgets through `web-perf.mjs` (already row 23, §13.7; reused) | G8 row 23 |
| `post-release.md` | `## Value and cost`: kill met or not, usage, cloud and token cost against the estimate | G11 row 23 |

Contract: `DEV-CONTRACTS.md` §23. Tests: `tests/value-gates.test.mjs` (6), `tests/mutate.mjs value`.

## Claim 1: the kill criterion is checked mechanically

`node --test tests/value-gates.test.mjs` → **6 pass, 0 fail**. An initiative with no `Kill:` gets
`W097`. With one, it is quiet. A `change` or a `fix` is never asked. An empty `Kill:` is flagged:
this test caught a real bug in the first version, where `\s*` matched across the line break.

## Claim 2: rows were appended, never inserted

The test reads each checklist and checks that rows run 1..n in order and that the new row is the last.
Gate logs already written cite rows by number, and renumbering would break them.

## Claim 3: the tests can fail

`node tests/mutate.mjs value` → **9/9 killed**.

## What this changes for existing projects

`W097` is a warning, and it fires on the problems already written: fx-blog `anime-blog`, recall
`domain-knowledge` and release-management are initiatives with no `Kill:` line. A warning never fails
the build. The fix is one line each, and it is left to the human, because a kill criterion is a
product decision.

## Not proven

That the people who answer these prompts give honest numbers. The checks make the questions
unskippable; they cannot make the answers true. G11's `met / not met` is where a dishonest answer
surfaces.

## Full suite at this step

`node --test tests/*.test.mjs` → **852 tests: 848 pass, 1 fail, 3 skipped**. The failure is
`ui-snap: a late-rendering http page is shot at 360px`, a live headless-Edge test. Run alone, it
passed three times: once on the clean base (changes stashed) and twice with these changes. It drives a
real browser against a timer while 850 other tests compete for the machine, and none of these steps
touches `ui-snap.mjs`. It is recorded as flaky under load, not as fixed.
