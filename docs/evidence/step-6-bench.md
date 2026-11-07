# Evidence — Step 6: measure across versions

Written for: whoever has to decide later whether Step 6 of [the learning roadmap](../learning-roadmap.md)
really works, and anyone comparing a future bundle version with today's. Each claim names the command
that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P2 Memory and learning (measured).

## What was built

`workspace/dev/scripts/bench.mjs`:
- `score` reads what the pipeline wrote in a project and prints: first-pass rate with a 95 % Wilson
  interval, rework, reopened findings, repeated findings (total and uncovered by a lesson),
  `UNVERIFIED` claims, and lessons.
- `compare a.json b.json` exits 1 when the later version is worse on a gated measure, unless
  `--reason` says why.

Tests: `tests/bench.test.mjs` (5), `tests/mutate.mjs bench`.

## Claim 1: the baseline for 1.7.0, from three real projects

`bench.mjs score --root <project>/.sdlc`, saved in `docs/evidence/baseline/1.7.0-*.json`:

| Project | Initiatives | First-pass rate [95 % CI] | Rework | Reopened |
|---|---|---|---|---|
| recall | 3 | 0.176 [0.062, 0.410] | 14 | 12 |
| release-management | 1 | 0.125 [0.022, 0.471] | 8 | 27 |
| fx-blog | 1 | 0.143 [0.026, 0.513] | 6 | 13 |

What this says: on 1.7.0, a gate passes on its first review about one time in six. Most gates need a
second round. That is the number the learning loop (Steps 1–4) exists to raise.

## Claim 2: the comparison refuses to call noise a change

Overlapping intervals are reported as `not a measurable change at this sample size`. Only intervals
that separate count as better or worse. With 7–17 gate reviews per project, the intervals above are
wide, so **one more initiative per project will not prove an improvement**. Several will.

## Claim 3: the tests can fail

`node --test tests/bench.test.mjs` → **5 pass**. `node tests/mutate.mjs bench` → **10/10 killed**.

## What this step does not do yet, and why

The roadmap asked for an ai-eval suite with a calibrated LLM judge (did a stage repeat a known
mistake?). That was **not** built here. ai-eval's own contract (EVAL-CONTRACTS §5.4, §8.3) forbids
gating on a judge before it is validated on at least 30, and ideally 100, hand-labelled cases. No such
labels exist yet. `bench.mjs` is the part that needs no judge: every number is read from files.

The judged part needs a person to label real stage runs:

1. Run 30+ stages on the new bundle with lessons in place.
2. Label each: did the author repeat a mistake a recalled lesson covered?
3. `/eval-judge` and `/eval-validate` in ai-eval.

That is the next measurement step, and it needs your time, not code.
