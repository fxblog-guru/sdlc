# Evidence — the learning roadmap

Written for: Luan, and anyone who later asks "did this actually work?". Every row names the command
that reproduces it. Branch `feat/sdlc-learn`, stacked on `feat/learning-roadmap`, 2026-10-23.

| Step | Pillar | What it does | Tests | Mutants killed | File |
|---|---|---|---|---|---|
| 1 | Memory | `/sdlc-learn`, `learnings/`, gated lessons from repeated review signals | 29 | 15/15 | [step-1](step-1-sdlc-learn.md) |
| 2 | Memory | every stage reads lessons before it authors; `--shared` via Recall | 8 | 10/10 | [step-2](step-2-recall-before-work.md) |
| 3 | Memory, Value | post-release `## Next` → `ideas.md` → intake offers the top ideas | 21 | 21/21 | [step-3](step-3-next-ideas.md) |
| 4 | Memory | established lessons pushed to Recall; lessons from 2+ projects → bundle candidates | 10 | 14/14 | [step-4](step-4-promote-lessons.md) |
| 5 | Judgment | `UNVERIFIED:` claims: authors mark, reviewers grade, lint counts | 5 | 7/7 | [step-5](step-5-unverified-claims.md) |
| 5b | Verification | bash guard + deny list; caught vs escaped per gate | 17 | 21/21 | [step-5b](step-5b-gate-effectiveness.md) |
| 5c | Value | kill criterion, extensibility, usability pass, value and cost | 6 | 9/9 | [step-5c](step-5c-value-gates.md) |
| 6 | Memory (measured) | `bench.mjs` score and compare; 1.7.0 baseline from 3 projects | 5 | 10/10 | [step-6](step-6-bench.md) |
| 7 | Intelligence | five pillars at intake; ideas, AI, privacy, i18n, SEO, postmortem | 13 | 11/11 | [step-7](step-7-knowledge.md) |
| 4.0 | Memory | the loop runs on its own: `learn.mjs brief` at session start and stage end | 10 | 14/14 | [step-4.0](step-4.0-automatic-loop.md) |
| debts | Intelligence, Value | checkers say N/A; estimates scored against actuals; SEO and accessibility measured at G8 | 13 | 44/44 | [debts](step-debts.md) |
| 9 | Intelligence | master in every role: 7 role packs, 25 reviewer rows, an exam per role | 7 | 11/11 | [step-9](step-9-roles.md) |
| 10 | Intelligence | five product packs (preview) and six lifecycle skills; 11 more exams | — | 12/12 | [step-10](step-10-packs-and-skills.md) |
| 8.0 | Intelligence | coverage tiers for every language and product type | 7 | 9/9 | [step-8](step-8-coverage.md) |

**Reproduce everything:**

```bash
node --test tests/*.test.mjs                 # 905 tests: 902 pass, 0 fail, 3 skipped (the two live Edge tests can time out under full-suite load; alone they pass)
for s in learn recall brief ideas promote unverified guard value bench knowledge coverage audit roles packs; do node tests/mutate.mjs $s; done
                                             # 204/204 mutants killed
```

## What is proven, and what is not

Proven by tests: each mechanism does what the contract says, refuses what it must refuse, and each
check fails when its rule is removed.

Not proven yet, and why:

- **That agents behave better with lessons.** Steps 2 and 5 prove the lesson and the rule reach the
  agent. Whether the model then changes its output needs real stage runs, labelled by a person, and
  ai-eval's judge validated on them (Step 6, "What this step does not do yet").
- **That the bundle improves across versions.** The 1.7.0 baseline is recorded. An improvement
  needs several initiatives run on the new version: with 7–17 gate reviews per project today, the
  intervals are too wide for one initiative to prove anything.
- **Packs beyond web (8.1–8.7).** Each needs a real repository taken through G9, and a decision from
  Luan about which comes first (`docs/pack-template.md`).
- **Live Recall.** Steps 2 and 4 were tested against a stand-in CLI. No Recall server was running.
