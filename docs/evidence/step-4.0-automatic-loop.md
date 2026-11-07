# Evidence — §4.0: the learning loop runs on its own

Written for: whoever has to decide later whether the loop in [the learning roadmap](../learning-roadmap.md)
§4.0 really runs without anyone remembering it. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P2 Memory and learning.

## What was built

| Piece | File |
|---|---|
| `learn.mjs brief [--peek]`: what is new since the last brief | `workspace/dev/scripts/learn.mjs` |
| Runs when a session opens | `hooks/session-start.mjs` |
| Runs when a stage ends | `skills/dev-stage-protocol/SKILL.md` §5 |
| What it said, per machine, ignored by git | `<root>/logs/learn-brief.json` |
| Contract | `DEV-CONTRACTS.md` §19.5 |
| Tests | `tests/learn-brief.test.mjs` (10), `node tests/mutate.mjs brief` (14/14) |

## Before and after

Before, only reading lessons was automatic (preflight step 7). Finding the signals depended on
someone remembering `/sdlc-learn`, and so did seeing new ideas and stale lessons.

After, each session start and each stage end prints, only when something is new:

```
Learning: 1 new signal(s) not yet a lesson — /sdlc-learn distils them
  recurring finding ×2  G4: List endpoint returns every row with no cursor pagination (orders CR-001, invoices CR-001)
Ideas: 1 new in ideas.md to rank (only a human ranks) — IDEA-001 Export to CSV
Lessons: 1 provisional with no new support in 60 days — /sdlc-learn --audit
```

A second session with nothing new prints nothing.

## Claims, each with the test that fails without it

| Claim | Test | Mutant |
|---|---|---|
| Nothing new prints nothing | an empty project briefs nothing | — |
| A signal is said once, and again when new evidence joins it | announced once … | said once; new evidence is news |
| A signal a lesson already cites stays quiet | a signal a lesson already cites | covered signals are quiet |
| A lesson written or changed is named | a lesson written or changed … | changed lesson named |
| New ideas are offered for ranking once; a newly stale lesson is named | new ideas … stale … | ideas said once; stale named |
| `--peek` records nothing; a corrupt record never fails the brief | --peek …; a broken brief file … | peek records nothing; bad brief file tolerated |
| The session hook and the stage end both run it | the SessionStart hook …; the stage protocol … | session start runs the brief; stage end runs the brief |

## A design choice that differs from the roadmap's first draft

§4.0 first proposed appending signals to `learnings/.signals.jsonl` from a hook on every gate-log
write. As built, `brief` recomputes them from the gate logs, which are already the record. A second
store could only drift from them. Distilling a signal into a lesson stays `/sdlc-learn`, where a
reviewer that did not write the lesson accepts or rejects it. A lesson nobody judged would be read by
every later stage.

## Not proven yet

That the brief changes behaviour, that is, that a signal it names becomes a lesson and the mistake
stops repeating. That needs a project running stages on 1.8.0, and then Step 6's `bench compare`.
