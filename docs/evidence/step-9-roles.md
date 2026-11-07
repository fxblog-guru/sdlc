# Evidence — Step 9: master in every role

Written for: whoever has to decide later whether the bundle really reviews at principal level in each
role, and how to check it again. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P1 Intelligence, measured (P2).

## What was built

| Role | Principles file (principles · trade-offs · anti-patterns) | Reviewer rows | Exam cases |
|---|---|---|---|
| Product manager | `skills/dev-framing-problem/product-principles.md` | G0 15–17 | 4 |
| Business analyst | `skills/dev-decomposing-requirements/domain-modelling.md` | G1 19–20 | 3 |
| Solution architect | `skills/dev-brainstorming-architecture/architecture-principles.md` | G2 25–29 | 6 |
| Security | `skills/dev-modeling-threats/security-principles.md` | G2 30–33 | 5 |
| Data | `skills/dev-modeling-data/data-principles.md` | G3 28–32 | 6 |
| UX | `skills/dev-specifying-ui/ux-principles.md` | G5 33–34 | 3 |
| SRE | `skills/dev-planning-deployment/sre-principles.md` | G10 24–27 | 5 |

Each file is linked from the skill that writes the artifact, with "read this when". Each reviewer row
cites its file. Contract: `DEV-CONTRACTS.md` §24.3.

## The exam result

`node tests/exam/grade.mjs docs/evidence/exam/answers-2026-10-23.json`:

```
PASS  architect  5/5 flaws found, 0 false alarm(s)
PASS  security   4/4 flaws found, 0 false alarm(s)
PASS  data       5/5 flaws found, 0 false alarm(s)
PASS  sre        4/4 flaws found, 0 false alarm(s)
PASS  pm         3/3 flaws found, 0 false alarm(s)
PASS  ba         2/2 flaws found, 0 false alarm(s)
PASS  ux         2/2 flaws found, 0 false alarm(s)
```

25 of 25 seeded flaws found, 7 of 7 clean cases passed, no false alarm. The flaws include a dual
write, a distributed monolith, a big-bang cutover, a missing tenant predicate, a home-made token, an
IDOR, a committed secret, an unpinned dependency, two writable copies of one fact, direct reads of
another team's tables, overwritten audit history, an unchecked import, email as a key, an untested
backup, a rebuild per environment, a deploy to 100 % at once, retry forever, a vanity metric,
"a competitor has it", one word with two meanings, a happy-path-only process, hover-only actions and
a dialog with no focus handling.

## Tests

`node --test tests/role-packs.test.mjs` (7) and `node tests/mutate.mjs roles` (11/11). The tests keep the
exam honest. Every file has the three parts and 8–12 principles, each with its exception. Every exam
row is a real reviewer row that cites the file. The cases on disk match the key. Each flaw changes
one section. The clean case is never case-1. A reviewer that fails everything, or passes everything,
does not pass.

## What this does not prove

- **The exam was written by the same author as the principles.** A reviewer finding the flaws its
  own checklist names is the floor, not the ceiling. The next proof is real artifacts: G2, G3 and
  G10 first-pass rates and escaped defects in `bench.mjs` and `gate-effect.mjs` on initiatives run on
  this version.
- **The reviewers were told which rows to judge.** In a real gate they read the whole checklist.
  Including the other rows makes false alarms more likely; the full-checklist run belongs to the
  ai-eval suite (Step 6).
- **One run.** A model is not deterministic; rerun the exam when a pack changes and keep the answers.
