# Evidence — Step 7: the knowledge gaps, and the five pillars at intake

Written for: whoever has to decide later whether Step 7 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P1 Intelligence (all five, at intake).

## What was built

| Roadmap item | Delivered | Gate that can fail on it |
|---|---|---|
| 7.0 Five pillars at intake | `problem.md` `## Pillars` (optional trailing section); `W098` for an initiative missing a pillar or a measure | G0 (W098) |
| 7.1 Ideas, competitors, value | `dev-framing-problem/exploring-ideas.md` | G0 rows 7, 13 |
| 7.2 Estimation | calibration on this repo's history, in `dev-planning-implementation` § Estimates | G6 |
| 7.3 Prioritisation, roadmap | `ideas.md` ranking (Step 3) + `/sdlc-status --roadmap` | — |
| 7.4 AI features | `dev-brainstorming-architecture/ai-features.md` | G2 row 24, G8 row 26 |
| 7.5 Privacy | `dev-modeling-data/privacy.md` | G3 row 27 |
| 7.6 i18n | `dev-specifying-ui/i18n.md` | G5 row 32 |
| 7.7 SEO, web performance | `dev-specifying-ui/seo.md`; web budgets already at G8 row 23 | G5 row 32, G8 row 23 |
| 7.8 Incidents → learning | `dev-designing-observability/postmortem.md`, fed to `## Escaped` and `## Next` | G11 row 24 |
| 7.9 Cost after release | `## Value and cost` (Step 5c) | G11 row 23 |
| 7.10 Beyond web | Step 8 | — |

Contract: `DEV-CONTRACTS.md` §24. Each reference file opens with "Read this when …", is linked from its
skill, and costs nothing until it applies. That is how the always-on skill listing stays inside its
8 000-character budget (7 904 used).

## Claim 1: each topic has an owner and a gate that can fail

`node --test tests/value-gates.test.mjs` → all pass. The test checks four things:
- every new gate row holds its number;
- each checklist still runs 1..n;
- each row cites its source;
- each reference file is linked from its skill and states what fails its gate.

## Claim 2: the five pillars are asked of every initiative

An initiative with all five pillars measured is quiet. One with no section, four pillars, or a pillar
with no measure gets `W098`. A `change` with no section stays valid, and the optional heading does not
break the strict heading check.

## Claim 3: the tests can fail

`node tests/mutate.mjs knowledge` → **11/11 killed**. Step 5c still kills **9/9** after its test was
generalised from "the last row" to "the row with this number".

## Honest limits

- These reference files are written knowledge. They were not tested on a real initiative here. Whether
  an agent applies `privacy.md` well is a behaviour, and the bench (Step 6) is where it would show.
- Estimation calibration is guidance, not a script. Actual hours are not recorded anywhere today
  (`progress.md` has commits, not time), so a script would invent its input.
