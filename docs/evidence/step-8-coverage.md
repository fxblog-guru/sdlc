# Evidence — Step 8.0: every language and product type gets the gates

Written for: whoever has to decide later whether Step 8 of [the learning roadmap](../learning-roadmap.md)
really works. Each claim names the command that reproduces it.

Date: 2026-10-23 · Branch: `feat/sdlc-learn` · Pillar: P1 Intelligence (beyond web), P3 (honest about it).

## What was built (8.0 only)

| Piece | File |
|---|---|
| Coverage tiers `full` · `preview` · `generic`, ten product types | `workspace/dev/scripts/lib/coverage.mjs` |
| `doctor.mjs` prints each stack's tier and says what each gap means | `workspace/dev/scripts/doctor.mjs` |
| `Product type` in the profile (`web` by default) | `DEV-PROFILE.md` §Stacks |
| The six parts of a pack, and the proof it needs | `docs/pack-template.md`, CONTRIBUTING "Adding a product type" |
| Contract | `DEV-CONTRACTS.md` §25 |
| Tests | `tests/coverage.test.mjs` (7), `tests/mutate.mjs coverage` |

## Claim 1: an unknown language no longer stops a project, and no longer passes silently

Before: `doctor.mjs` printed `[FAIL] profile` for a stack with no adapter (e.g. `rust`).
After: `[WARN] coverage web · go full · rust generic`, plus what it means. The gates run, conventions
come from `knowledge/conventions.md`, and code checkers do not read `rust`.

## Claim 2: a product type with no pack says what release and operate mean

`Product type: desktop` → `no pack for desktop yet: release means signed installer, auto-update,
operate means crash reports, update adoption`. G9–G11 have a definition to work from instead of the
web defaults.

## Claim 3: the tests can fail

`node --test tests/coverage.test.mjs` → **7 pass**. `node tests/mutate.mjs coverage` → **9/9 killed**.
One mutant checks that the profile's list of product types matches `coverage.mjs` exactly.

## Not done: packs 8.1–8.7

The roadmap's own rule says a pack counts only after GK plus one `change` initiative have passed
G6–G9 on a real repository of that type. That is days of pipeline work per pack, on screen-spider,
cli-afx and the others, and several decisions are yours: which pack first, and which initiative to
run. Writing six packs without that proof would be the "knowledge that reads well and is wrong" that
§16 warns about. So this step stops at the tier system that makes the gap visible.
`docs/pack-template.md` says how to do each pack.
