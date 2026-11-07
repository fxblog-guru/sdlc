---
name: dev-resolving-code-placement
description: Use at G2/G6/G7 to decide where a file, test or top-level area goes, or which blueprint fits the repo. Answers with a path and citation.
---

# Resolving code placement

You answer one question: **where does this go?** And you answer it with a path and a citation, never
with a principle.

The failure this exists to prevent is small each time and compounds fast. An agent that cannot find
where something belongs puts it somewhere defensible — a new `utils/`, a new `services/` beside the
existing `service/`, a test next to the source in a repo that keeps tests in `tests/`. Every one of
those is arguable in isolation. Together they are how a codebase stops having a shape, and the
person who eventually has to restore one will not be able to tell which files were deliberate.

> `DEV-CONTRACTS.md` §12.8 — production code is written only at G7, only for an approved
> `TASK-NNN`, and only where this skill says it goes. §16 for the knowledge cards you read from;
> §13.9 and `blueprints/README.md` for the repository blueprint.

## Which source wins

| The thing being placed | Brownfield | Greenfield |
|---|---|---|
| a file inside an existing area | the repo's own conventions, steps 1–4 below | the blueprint's tree, then steps 1–4 once code exists |
| a new top-level area, a new domain, a new test tier | the blueprint, recorded in the blueprint ADR | the blueprint |
| something that does not fit either | step 5, a `DEC-NNN` | step 5 |

The blueprint is the one named in `DEV-PROFILE §Stacks` as **Repository blueprint**. Its file is
`blueprints/<name>.md`. A deviation that the blueprint ADR accepts is the repo's convention, so
you follow it and do not correct it.

## Picking the blueprint from the two axes

At G2 the blueprint is not chosen directly. It follows from two values the blueprint ADR decides
first, with the decision table in §13.9 rule 6:

1. **Repository model** — `monorepo` or `polyrepo`. **Architecture** — `monolith`,
   `modular-monolith` or `microservices`. They are independent; decide each on its own rows.
2. With no criterion forcing otherwise, the answer is `monorepo` + `modular-monolith` (§13.9
   rule 7), and for Go + React that is `fullstack-go-react`.
3. Read the pair off `blueprints/README.md` §Choosing. `service-go` and every polyrepo or
   microservices row are **V2 — schema only**: say so in the ADR, and fill `DEV-PROFILE §Services`.
4. `layout-check.mjs` fails `blueprint-fit` if the blueprint does not serve the pair.

A brownfield `go-react` repository that adopts `fullstack-go-react` records the old shape as
deviations and moves by `refactor-go-react-to-fullstack.md`, one `TASK-NNN` per step — never on
the way past (§13.9 rule 4).

## The order you answer in, and why it is this order

**1. An existing file that already does this job.** The best new file is no new file. Grep for the
nearest existing behaviour before you reach for a path — `grep -rn` on the noun, the verb, and the
existing type name. If something within one concept of your change already exists, extend it and
cite it.

**2. `<root>/knowledge/codebase-map.md`.** It names the modules, their entry points and their layering.
If the map says where this layer lives, that is the answer, and you cite the card line.

**3. `<root>/knowledge/conventions.md`.** It was extracted *from* this code with real examples, so it
tells you where tests go, how files are named, and which directories mean what. Cite the example it
carries, not the rule — an example is checkable and a rule paraphrased drifts.

**4. Three sibling files, read.** When the cards are silent, the code is not. Find the three files
most like the one you are placing and see where *they* are. Three agreeing siblings are a
convention; two are a coincidence and you say so.

**5. Nothing settles it.** Then you have found a real gap, and the honest output is a `DEC-NNN`, not
a decision. Recommend a placement, give your reasoning, and mark the task `N/A — blocked by
DEC-NNN` if it cannot proceed without the answer. **You may not resolve it yourself by choosing your
own recommendation** — §15.2 — and `status: assumed` belongs to a named human, never to you.

## What your answer looks like

Every placement is a row, and every row carries its evidence:

| What | Path | Why, with a citation |
|---|---|---|
| `InventoryReport` type | `cli_afx/inventory.py` | new module; `codebase-map.md:31` puts one command per module, `cli.py:115` shows the pattern |
| its unit tests | `tests/test_inventory.py` | `conventions.md:44` — tests mirror the module name, three siblings agree (`tests/test_installer.py`, `test_registry.py`, `test_environment.py`) |
| the shared path constant | `cli_afx/registry.py:20` | extend, not add: the four sibling constants already live there |

A row with an empty "why" cell is a guess wearing a table's clothes. If you cannot fill it, you are
at step 5.

## Extend or build new — say which, every time

This is the same question G2 answers for architecture, asked at file granularity, and it has the
same failure mode: a duplicate is cheap to create and expensive to find. Before you propose a new
file, state what you searched and what you found:

```
grep -rn "manifest" cli_afx/ | wc -l     # 14 hits, all in installer.py
grep -rn "class .*Report" cli_afx/       # none
```

Quote the searches, not the conclusion. Whoever reviews your placement will re-run them.

## Things that look like placement decisions and are not

1. **"This deserves its own package."** Sometimes true, and at G6 it is nearly always premature —
   you are placing one file, not restructuring. If the structure is genuinely wrong, that is a
   finding for `known-debt.md`, not a path you quietly invent on the way past.
2. **"The tests should go next to the source."** Not your call, and not a matter of taste. It is
   whatever `conventions.md` recorded from the actual repository. A greenfield repo with no
   convention yet is step 5, not step 4.
3. **"There is no obvious home, so a `common/` or `utils/` directory."** Those two names are where
   placement decisions go to be deferred forever. If nothing owns this behaviour, the interesting
   question is which module *should*, and that is worth a sentence rather than a new directory.
4. **"Handlers get their own package."** In Go they go in their domain's `adapters/http`, and the
   problem mapper goes in `platform/httpx`, which imports no domain (in `fullstack-go-react`, all
   under `backend/internal/`). `blueprints/go-react.md` §HTTP
   explains why this split has no cycle. A plain `internal/http/handlers` subpackage beside the
   router does have one. A brownfield repo that keeps one `internal/http` package continues to use
   it, until the ADR plans the split.

## In a greenfield repository

There are no cards and no siblings, and the blueprint fills that gap. Cite its tree as the evidence:
"`internal/release/app/service.go` — `blueprints/go-react.md` §The tree, `<domain>/app/`". Only
the choice of blueprint is a decision. G2 records it in the blueprint ADR, and if `§Stacks` cannot
decide it, it becomes a single `DEC-NNN` for the shape of the whole tree. After that, a file the
blueprint does not place is step 5.

Before you answer, run `node <root>/scripts/layout-check.mjs` over the paths you propose. A placement
that the script would flag is wrong, unless the ADR accepts it.
