---
name: dev-analysing-source
description: Use in /sdlc-onboard to author the GK structural cards (codebase-map, schema-as-is, api-as-is), every claim cited file:line.
---

# Analysing the source — GK

You are describing a system that already exists, for readers who will act on what you write without
checking it. That is the whole risk and the whole discipline.

Informed by `source-analyzer` in `gitlab.com/agentic-fx/skills` @ `8556e8f` — its philosophy ("read
the real system, not the documentation about it") and its source-type coverage. Its Python analysers
are deliberately **not** vendored: they produce a summary, and a cartographer working from a summary
cites lines it has not opened. The citations are the product here (`docs/skill-sources.md`).

## What you are producing

`<root>/knowledge/codebase-map.md`, `schema-as-is.md`, `api-as-is.md` — from their templates, each with
`grounded_at: <commit sha>` from `git rev-parse HEAD`.

Conventions are a separate card and a separate skill (`dev-extracting-conventions`), because "where
things are" and "how things are written" go stale at different rates and should refresh
independently.

## The rule everything follows from

**Every claim cites a `file:line` you have opened.**

Not "the repo uses dependency injection" but "constructor injection throughout the service layer —
`internal/service/jobs.go:24`". A claim you cannot cite is a claim you should not make. Where you
did not look, say so in `## Sources and gaps` — an honest gap costs a later stage one question; a confident
error costs it a design.

A card that is merely plausible is worse than no card, because a missing card makes a stage ask and
a wrong card makes it certain.

## Describe. Never prescribe.

These cards say what **is**. Something you consider wrong is a row in `known-debt.md` with the reason
it exists — not a corrected version in the map. Someone reading at G6 is trying to make new code fit
the existing code; feeding them your preference produces code that fits nothing.

## codebase-map.md — where things are

Work outside in.

1. **Shape first.** `ls` the root, read the build files (`go.mod`, `package.json`, `pyproject.toml`,
   the Makefile, the compose file, the CI config). These tell you the languages, the services and how
   it is built, before you have read a line of application code.
2. **Every top-level source directory gets a row.** Its responsibility, its owner if `CODEOWNERS` or
   the commit history says, and its dependency direction. A directory you silently omit is one a
   later stage will not know to consider — and the omission is invisible, which is why the reviewer
   checks this mechanically.
3. **Entry points.** Binaries and `main` functions, HTTP routers and their route registrations,
   queue consumers, scheduled jobs, CLI commands. Cite the registration site, not the handler.
4. **Dependency direction, verified.** If you claim `store` does not depend on `api`,
   `grep -rn "<module>/api" <store path>` and record the count. Claiming a layering that the imports
   contradict is the most common way these maps are wrong, because the layering is usually what
   someone intended.
5. **The brand, if there is a UI.** Find what exists, and record it as the `Brand` row of
   `## Cross-cutting concerns`, each file cited: logo and mark files (`grep -rliE 'logo|brand'`
   over `public/`, `static/`, `assets/`, `src/`), the favicon and `apple-touch-icon` (`<link rel="icon"`
   in the HTML head or the framework's metadata), `site.webmanifest` / `manifest.json` (its
   `theme_color`, `background_color`, icons), `og:image`, and the theme colours (the primary in
   the Tailwind config, `:root` variables or the theme object). Record what is there, never what
   should be: no logo or palette is invented here. If nothing is found, write "none found"; G5
   then asks the requester the brand question (`dev-designing-visuals`), and an existing kit
   found here is answer (a).
6. **Request path.** One paragraph: how a request enters, what it passes through, where it leaves.
   This is what a new engineer needs before opening any file.

## schema-as-is.md — the schema that exists, not the one intended

Migrations describe what someone meant to produce. The live schema includes the hand-applied fix, the
index dropped during an incident, the column added directly at 2am. G3 plans migrations against this
card, and a migration planned against a fiction fails at the worst possible time.

**Introspect where you can.** `\d+` in psql, `information_schema.columns` / `.statistics`,
`SHOW CREATE TABLE`. Read-only queries only — you never write to a database, and never to
production.

**Where you cannot reach a database, reconstruct from the migrations and label the card as such.**
"Reconstructed from `migrations/` at `8556e8f`; no database reachable from this environment; drift
not checked" is a complete and honest answer, and G3 now knows to verify before planning. A schema
presented with no stated source is indistinguishable from a guess, and the reviewer will fail it on
that basis alone.

Record per table: columns with types and nullability, primary and unique keys, foreign keys with
their on-delete behaviour, indexes, and approximate row counts where you can get them. Row counts
matter more than they look — they are what tells G3 whether a migration needs a backfill strategy.

## api-as-is.md — the contracts in production

In preference order, and say which you used:

1. A served OpenAPI document or a spec file that is actually deployed
2. The router — enumerate the registered routes from the code
3. A gateway or ingress configuration

Per endpoint: method and path, auth requirement, request and response shape, status codes, and
**whether it is paginated and how**. That last column is what `contract-diff.md` at G4 compares
against, and it is the field most often missing from existing contracts — which is itself worth
recording, because it tells G4 that adding pagination to that endpoint is a breaking change.

Where a spec file exists *and* a router exists, check whether they agree, and record any divergence.
A spec that has drifted from the router is a fact about the system that G4 needs.

## Ground it, and say what you did not reach

`grounded_at` is the commit you actually read — `git rev-parse HEAD`, recorded honestly. It is the
only drift check this track has; a wrong one disables `--refresh` silently.

Then fill `## Sources and gaps`: what you examined, what you could not reach and why, and what you chose to
leave out. This section is the difference between a card that is trusted appropriately and one that
is trusted completely.

## Do not

Write a gate log, set `status: approved`, edit application code, run a migration, write to any
database, or make a recommendation. `dev-reviewing-knowledge` will open your citations and check
they say what you claimed.
