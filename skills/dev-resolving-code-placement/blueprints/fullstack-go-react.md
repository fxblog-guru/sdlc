# Blueprint: fullstack-go-react

A Go API and a React SPA in one repository, built into one binary, with each concern in one
top-level folder: `backend/`, `frontend/`, `ops/`, `docs/`, `tests/` and the process root. This
is the default for **Repository model** `monorepo` with **Architecture** `modular-monolith` or
`monolith` (§13.9). It is `go-react` with a top level that still makes sense at ten domains and
three teams: nothing loose at the root, one home for ops, one home for human docs, and handlers
split by domain from the first commit.

Pick `go-react` instead only for a small repository that already has that shape and no plan to
grow. A brownfield `go-react` repository moves here by `../refactor-go-react-to-fullstack.md`.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Go module shape | [Organizing a Go module](https://go.dev/doc/modules/layout) (go.dev, official) | `backend/` is the module: `cmd/<binary>/`, everything else in `internal/`, no `pkg/` |
| Backend shape | [Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (Cockburn) | `domain` → `app` → `adapters`, dependencies pointing inward, per domain |
| Modular monolith | Fowler, "MonolithFirst"; Newman, "Monolith to Microservices" | each `internal/<domain>/` is a module with one public surface (`app`), so a later extraction is a move, not a rewrite |
| Frontend shape | [bulletproof-react project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | features own their code; `app/` composes them |
| Config and processes | the Twelve-Factor App (config, build-release-run, dev/prod parity) | `.env.example` at the root, one config package, the same binary in every environment |
| Ops | Google SRE book (monitoring, alerting on symptoms, playbooks) | alerts, dashboards and runbooks sit together in `ops/`, so an alert links a runbook in the same tree |
| Go, React, naming, tests, root files | as `go-react.md` and `README.md` §What every blueprint shares | — |

## The tree

```
.
├── backend/                    the Go module; go.mod lives here, not at the root
│   ├── cmd/
│   │   └── server/             main.go: reads config, builds the graph, starts. Nothing else.
│   ├── internal/
│   │   ├── <domain>/           one per bounded context: release, project, identity, …
│   │   │   ├── domain/         entities, value objects, domain errors (apperr kinds); stdlib, apperr, ids, other domains' domain/
│   │   │   ├── app/            use cases (Service) and ports.go (the interfaces it needs)
│   │   │   └── adapters/
│   │   │       ├── postgres/   implements app's ports; sqlc output under postgres/db/
│   │   │       └── http/       this domain's handlers + Routes(r *httpx.Router, svc *app.Service)
│   │   ├── platform/           apperr/ httpx/ middleware/ config/ db/ obs/ clock/ ids/ spa/
│   │   │   └── spa/            embed.go (`//go:embed all:dist`) + dist/.keep; the build copies frontend/dist here
│   │   └── server/             composition root: builds adapters, mounts every domain's Routes, owns http.Server
│   ├── migrations/             YYYYMMDDHHMM_<name>.{up,down}.sql (§7), embed.go for migrate-on-start
│   ├── tests/
│   │   └── integration/<domain>/   real Postgres + real router, `//go:build integration`; inside the module so it may import internal/
│   ├── go.mod  go.sum  .golangci.yml  sqlc.yaml
│   └── README.md
├── frontend/                   the SPA (Vite); the same inner layout as go-react's web/
│   ├── src/
│   │   ├── app/                router.tsx, provider.tsx, routes/<route>.tsx: composition only
│   │   ├── features/<feature>/ api/  components/  hooks/  types/  index.ts (the only import surface)
│   │   ├── components/         ui/ (the design-system kit), layouts/
│   │   ├── hooks/  lib/  config/  types/  styles/  testing/
│   │   └── main.tsx
│   ├── index.html  package.json  vite.config.ts  tsconfig.json  eslint.config.js
│   └── README.md
├── ops/                        everything sysops, in one place
│   ├── deploy/                 docker/Dockerfile, compose/compose.yaml, helm/<app>/ | systemd/, terraform/
│   ├── config/                 per-environment non-secret config, otel-collector.yaml
│   ├── alerts/                 alert rules; every rule names its runbook in ops/runbooks/
│   ├── dashboards/             dashboard JSON, one per service or SLO
│   ├── runbooks/               the living runbook per service; G11 folds <root>/monitoring/<slug>/runbook.md in
│   └── README.md
├── docs/                       the only root of human docs
│   ├── architecture.md         context and container view, links the current ADRs
│   ├── onboarding.md  operators/  …
│   └── README.md               the index, including the ADR index: links <root>/design/adr/, copies nothing
├── tests/                      only what crosses backend and frontend
│   ├── e2e/                    Playwright *.spec.ts
│   ├── contract/               the running API against <root>/api/<slug>/openapi.yaml
│   ├── perf/                   k6 scripts and budgets
│   ├── fixtures/               seed SQL, golden files shared across tiers
│   └── README.md
├── scripts/                    developer shell scripts the Makefile calls; no product code
├── <root>/                     the sdlc process root (`.sdlc/` by default, `dev/` accepted; DEV-PROFILE `SDLC root`); qa/ for stlc
├── .gitlab-ci.yml  ci/         the pipeline, with ci/*.yml includes past ~150 lines
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
```

**Root files.** Only these, plus dotfiles: `README.md`, `CONTRIBUTING.md`, `Makefile` (or
`Taskfile.yml`), `.editorconfig`, `.env.example`, `CODEOWNERS`, `.gitlab-ci.yml`, `.gitignore`,
`.gitattributes`. No `go.mod`, no `package.json`, no `docker-compose.yml` at the root: each belongs
to the folder that owns it. The Makefile keeps the shared verbs (`build`, `test`,
`test-integration`, `lint`, `fmt`, `up`, `migrate`) and runs them in `backend/` and `frontend/`.

**The embedded SPA.** `go:embed` cannot reach outside the module folder, so the binary cannot
embed `frontend/dist` directly. `make build` runs `npm --prefix frontend run build`, then copies
`frontend/dist/` to `backend/internal/platform/spa/dist/`, then runs `go build`. `dist/` is
gitignored except `dist/.keep`, so `go build ./...` works on a fresh clone.

**`<root>/docs/` is not human docs.** It holds the bundle's long-lived design artifacts (design
tokens, UI patterns, §2). People read `docs/`. `docs/README.md` links what they need from `<root>/`.

## Backend layering, and the dependency rule

The same five rules as `go-react.md` §Backend layering, with `backend/` in front of every path:

1. `domain` imports the stdlib, `platform/apperr`, `platform/ids` and other domains' `domain/`.
   Never `app`, an adapter, `net/http`, `database/sql` or a driver.
2. `app` imports its `domain`, `platform` and other domains' `domain/`. It declares the ports it
   needs. It never imports an adapter.
3. `adapters/postgres` and `adapters/http` import their own `app` and `domain`, plus `platform`.
   Never each other, never another domain's adapters, never `server`.
4. A use case that needs another domain declares a port in its `app`; `internal/server` supplies
   the other domain's service. Reviewer's check.
5. `platform/*` imports no domain and not `server`.

There is no `backend/internal/http/` package. One package for every domain's handlers grows with
the product (release-management reached 122 files in one). Handlers live in
`<domain>/adapters/http`, the problem mapper in `platform/httpx`, the router in `server`
(`go-react.md` §HTTP explains why this split has no cycle). `layout-check.mjs` flags an `http/`
folder anywhere else as `single-home`.

## One home per concern

| Folder name | Its only home | Why |
|---|---|---|
| `deploy/` | `ops/deploy/` | ops split between `ops/` and `deploy/` means an operator searches two trees |
| `runbooks/`, `alerts/`, `dashboards/` | `ops/…` | an alert and its runbook are reviewed together |
| `docs/` | `docs/` | a second docs folder (`backend/docs/`) is where docs go to be missed |
| `migrations/` | `backend/migrations/` | the embed and the migrate command read one folder |
| `http/` | `backend/internal/<domain>/adapters/http/` | see above |

Folder names inside `backend/internal/` and `frontend/src/` are domain and feature names, so a
domain named `deploy` or `alerts` is not a finding. The process roots (`.sdlc/` or `dev/`, and `qa/`) are the
bundle's and are not checked.

## Rules

```json
{
  "name": "fullstack-go-react",
  "fits": { "repositoryModel": ["monorepo"], "architecture": ["monolith", "modular-monolith"] },
  "topLevel": ["backend", "frontend", "ops", "docs", "tests", "scripts", "ci", "dev", "qa"],
  "requiredDirs": ["backend", "backend/cmd", "backend/internal", "backend/migrations", "frontend", "frontend/src", "ops", "ops/deploy", "ops/config", "ops/alerts", "ops/dashboards", "ops/runbooks", "docs", "tests"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "backend/go.mod", "frontend/package.json", "docs/architecture.md"],
  "codeRoots": ["backend", "frontend", "tests", "ops", "scripts", "ci", "dev", "qa"],
  "rootCode": [],
  "goModules": ["backend"],
  "tests": {
    "roots": [
      { "root": "tests", "tiers": ["e2e", "contract", "perf", "fixtures"], "rootFiles": ["README.md"] },
      { "root": "backend/tests", "tiers": ["integration"], "rootFiles": ["README.md"] }
    ],
    "placement": [
      { "name": "_integration_test\\.go$", "under": ["backend/tests/integration/"], "why": "Go integration tests live in backend/tests/integration/<domain>/" },
      { "ext": ".go", "content": "^//go:build .*\\bintegration\\b", "under": ["backend/tests/integration/"], "why": "an integration-tagged test lives in backend/tests/integration/<domain>/" },
      { "name": "\\.spec\\.ts$", "under": ["tests/e2e/"], "why": "Playwright journeys live in tests/e2e/" }
    ]
  },
  "singleHome": [
    { "name": "deploy", "homes": ["ops/deploy"], "ignore": ["backend/internal", "frontend/src", "dev", "qa"], "why": "deploy files live in ops/deploy/; one home for sysops" },
    { "name": "runbooks", "homes": ["ops/runbooks"], "ignore": ["backend/internal", "frontend/src", "dev", "qa"], "why": "runbooks live in ops/runbooks/" },
    { "name": "alerts", "homes": ["ops/alerts"], "ignore": ["backend/internal", "frontend/src", "dev", "qa"], "why": "alert rules live in ops/alerts/" },
    { "name": "dashboards", "homes": ["ops/dashboards"], "ignore": ["backend/internal", "frontend/src", "dev", "qa"], "why": "dashboards live in ops/dashboards/" },
    { "name": "docs", "homes": ["docs"], "ignore": ["backend/internal", "frontend/src", "dev", "qa"], "why": "docs/ is the only root of human docs" },
    { "name": "migrations", "homes": ["backend/migrations"], "ignore": ["dev", "qa"], "why": "migrations live in backend/migrations/" },
    { "name": "http", "homes": ["backend/internal/*/adapters/http"], "ignore": ["frontend", "dev", "qa"], "why": "one http package for every domain grows with the product; handlers live in backend/internal/<domain>/adapters/http/" }
  ],
  "packageCeiling": 40,
  "alias": { "@/": "frontend/src/" },
  "imports": [
    { "lang": "go", "from": "backend/internal/{d}/domain/**", "deny": ["backend/internal/*/app/**", "backend/internal/*/adapters/**", "backend/internal/server/**", "backend/internal/platform/httpx/**", "backend/internal/platform/db/**", "net/http", "database/sql", "github.com/jackc/**"], "why": "domain imports no layer above it, no transport and no driver" },
    { "lang": "go", "from": "backend/internal/{d}/app/**", "deny": ["backend/internal/*/adapters/**", "backend/internal/server/**", "net/http"], "why": "app declares ports; adapters implement them" },
    { "lang": "go", "from": "backend/internal/{d}/adapters/postgres/**", "deny": ["backend/internal/*/adapters/http/**", "backend/internal/!{d}/adapters/**", "backend/internal/server/**"], "why": "an adapter never reaches another adapter" },
    { "lang": "go", "from": "backend/internal/{d}/adapters/http/**", "deny": ["backend/internal/*/adapters/postgres/**", "backend/internal/!{d}/adapters/**", "backend/internal/server/**"], "why": "handlers call their own app, never a repository or another domain's handlers" },
    { "lang": "go", "from": "backend/internal/platform/**", "deny": ["backend/internal/!platform/**"], "why": "platform is the leaf; importing a domain or the server makes a cycle possible" },
    { "lang": "ts", "from": "frontend/src/features/{f}/**", "deny": ["frontend/src/features/!{f}/**", "frontend/src/app/**"], "why": "features never import each other; app/ composes them" },
    { "lang": "ts", "from": "frontend/src/components/**", "deny": ["frontend/src/features/**", "frontend/src/app/**"], "why": "shared code never imports a feature" },
    { "lang": "ts", "from": "frontend/src/lib/**", "deny": ["frontend/src/features/**", "frontend/src/app/**"], "why": "shared code never imports a feature" },
    { "lang": "ts", "from": "frontend/src/hooks/**", "deny": ["frontend/src/features/**", "frontend/src/app/**"], "why": "shared code never imports a feature" }
  ]
}
```
