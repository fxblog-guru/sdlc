# The repository blueprint ADR — G2

The first G2 in a repository records its blueprint as an ADR (§13.9). A later G2 writes a new ADR
only when the change adds a top-level area the blueprint does not have. That ADR supersedes the
first one.

## When

| Situation | What you write |
|---|---|
| Greenfield, first change | `ADR-NNN-repository-blueprint.md` choosing one of `dev-resolving-code-placement/blueprints/` |
| Brownfield, first change through this bundle | the same ADR, choosing the nearest blueprint and listing every deviation `layout-check.mjs` reports |
| A change adding a new top-level area, a second deployable, a second repository, or a new stack | a new ADR that supersedes the last one, with the decision table redone; the new area follows the blueprint |
| Anything else | nothing; cite the existing ADR in `architecture.md` |

## How to fill the template

1. **Decision:** "Repository model `<monorepo | polyrepo>`, Architecture `<monolith |
   modular-monolith | microservices>`, so we will use the `<name>` blueprint." Write all three
   into `DEV-PROFILE §Stacks`, with this ADR as **Blueprint ADR**. The blueprint is the one
   `blueprints/README.md` §Choosing gives for the pair.
1b. **Decision table** (§13.9 rules 6–7), before the Alternatives:

   | Criterion | Evidence | Points to |
   |---|---|---|
   | Team count and ownership | 1 team of 5; one CODEOWNERS group | monorepo · modular-monolith |
   | Independent deploy need | none: every release ships the whole product (`git log --merges`, 40 releases) | modular-monolith |
   | Independent scaling hot spots | `NFR-004` 50 rps total; no part differs by 10× | modular-monolith |
   | Data ownership boundaries | each domain writes only its tables (`schema-as-is.md`); `audit` is append-only from all | modular-monolith, `audit` a module |
   | Release cadence | weekly, the same for backend and frontend | monorepo |
   | Operational maturity | one pipeline, logs + metrics, no tracing across processes, one on-call | not ready for microservices |

   Every row has evidence a reviewer can retrace (a file, a `git log` count, an `NFR-NNN`), never
   an opinion. **The shape is the owner's.** In greenfield, raise a `DEC-NNN` before the ADR is
   final: client and server as separate deployables (`web-api-ts` for TypeScript) · modular
   monolith (`nextjs`, `fullstack-go-react`) · serverless, each option with the host it implies
   and what it costs to change later; the table's answer is the
   recommended default. `architecture.md` `Shape:` cites that DEC, and G2 does not pass while it is
   unanswered (`E043`, §18.7). The default — modular monolith, monorepo — needs no row to force it. Any other
   value names the rows that force it; `microservices` needs operational maturity *yes* for each
   deployable. Name the references you lean on (Fowler "MonolithFirst", Newman "Monolith to
   Microservices", the Twelve-Factor App, the Google SRE book); do not quote them. A polyrepo or
   microservices decision says **V2 — schema only** and fills `DEV-PROFILE §Services`.
2. **Context:** what ships (one binary, an SPA, a worker), which stacks `§Stacks` enables, and, in
   brownfield, `codebase-map.md`'s summary of the tree as it is.
3. **Alternatives:** the other values of each axis and the other blueprints that could fit, and
   which table row rules each out. Do not list "no blueprint" as an alternative. The contract does
   not allow it.
4. **Consequences:** in greenfield, the scaffold tasks G6 will plan. In brownfield, a deviation
   table copied from `node <root>/scripts/layout-check.mjs --blueprint <name> --maturity brownfield`:

   | Deviation | Why it stays | Planned move |
   |---|---|---|
   | `test-placement internal/http/**` | 70 integration tests; moving them is its own change | `TASK-NNN` in a later slug, or `none` |

   Write one row per `` `<rule> <path>` ``, in that exact form, because the script matches it. Use
   `<dir>/**` for a whole subtree. A deviation that has no reason in its row is a finding.
5. **Compliance:** "`layout-check.mjs` exits 0 at G7. In brownfield, run it with
   `--since <merge base>`, so a new top-level area or grab-bag fails."

## What the ADR must not do

Plan a mass move. A move is a refactor, and it gets its own slug, tasks and review (§13.9 rule 4).
The ADR records which moves are worth doing, so that a future change can pick one up. For
`go-react` to `fullstack-go-react` the moves and their order are in
`dev-resolving-code-placement/refactor-go-react-to-fullstack.md`; cite its step per deviation row.
