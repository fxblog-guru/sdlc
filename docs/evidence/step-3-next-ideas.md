# Evidence — Step 3: from one release to the next

Written for: whoever has to decide later whether Step 3 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillars: P2 Memory and learning, P5 Value.

## What was built

| Piece | File |
|---|---|
| Contract | `DEV-CONTRACTS.md` §20 |
| `## Next` in every post-release (idea · lesson · check · none) | `workspace/dev/_templates/post-release.md` |
| G11 checklist row 21: `## Next` matches what the report found | `skills/dev-reviewing-monitoring/SKILL.md` |
| `W095`: a post-release with an empty `## Next` | `workspace/dev/scripts/lint-dev.mjs`, §11.2 |
| Script: sync · check · list | `workspace/dev/scripts/ideas.mjs` |
| `/sdlc-monitor` syncs ideas; `/sdlc-intake` offers the top three | `commands/sdlc-monitor.md`, `commands/sdlc-intake.md` |
| Tests | `tests/ideas.test.mjs` (21), `tests/mutate.mjs ideas` |

## Claim 1: the loop closes

`node --test tests/ideas.test.mjs` → **21 pass, 0 fail**. A post-release with two `idea` rows and one
`lesson` row syncs exactly two `IDEA-NNN`s. A second sync adds nothing. A new idea continues the count.
`list` offers ranked ideas first and never offers a taken or dropped one. The command files carry the
wiring, and a test reads them.

## Claim 2: only a human ranks

The gate refuses a scored or `ranked` row that names nobody. `list` also ignores the score of such a
row, so an agent-scored idea cannot move up the queue even before the gate runs. That second guard
came from a test this step added, which failed against the first version of `list`.

## Claim 3: the tests can fail

`node tests/mutate.mjs ideas` → **21/21 killed**. On its first run, two mutants survived: the
template-placeholder skip, and ranked-before-unranked ordering. Each got a test that fails without
it. Steps 1 and 2 still kill 15/15 and 10/10.

## Claim 4: nothing existing broke

The new `## Next` heading changes the post-release template, and the linter's heading check is strict.
No project in this workspace has a `post-release.md` yet, so no file goes red. `contract-drift`
caught one clash while this was built: `W094` was already taken by commit-lint. The rule is `W095`.

## Not yet proven

That ideas taken from `ideas.md` lead to better releases than ideas from a blank intake. That is a
product outcome, and it needs several releases of a real project (fx-blog) to measure.
