# Evidence — three promises the plan made that the first build had not kept

Written for: whoever checks later that the roadmap's text and the code agree. Each claim names the
command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn`.

| Promise in the roadmap | Was | Now | Test | Mutants |
|---|---|---|---|---|
| 8.0: "checkers that cannot read the language say `N/A — no adapter` instead of passing silently" | only `doctor` said so | `limits-check`, `obs-check`, `conventions-check` and `problems-check` print `N/A no adapter for <stack> — this check did not read that code (§25)` for every enabled stack with no adapter | `tests/coverage.test.mjs` | `coverage` 15/15 |
| 7.2: "the range is scored against actuals" | the skill asked for a range; nothing compared it with what happened | `progress.md` takes an optional `Actual` column; `bench.mjs score` prints `estimates`: done tasks inside their range, and the median actual ÷ high end; `compare` shows it; the planning skill reads it to calibrate | `tests/bench.test.mjs` | `bench` 16/16 |
| 5c / 7.7: "G8 measures the budget on the built page" for SEO and accessibility | performance only; SEO and accessibility were a G5 checklist | `web-perf.mjs --audit seo,a11y` reads the rendered DOM: title, description, canonical, lang, one h1, indexable; alt text, labels, accessible names, unique ids, heading order. Each failed check is a breach; G8 row 23 requires it on a public page | `tests/web-perf.test.mjs` (live in Edge: the clean page 100/100, the broken page 0/0 with 12 breaches) | `audit` 13/13 |

What the audit does not do: colour contrast and focus order need a full engine or a person. They
stay with G5's review and the usability pass (§23).

What estimates need before they mean anything: implementers recording `Actual`. A project that does
not scores `of: 0`, never a guess.
