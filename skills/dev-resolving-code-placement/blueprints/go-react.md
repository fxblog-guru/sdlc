# Blueprint: go-react

A Go HTTP API and a React single-page app in one repository, built into one binary that serves the
SPA, with one database. Start here unless the UI needs server rendering (use `nextjs`) or there is
no UI (use `go-service`).

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Go module shape | [Organizing a Go module](https://go.dev/doc/modules/layout) (go.dev, official) | `cmd/<binary>/` for each command, everything else in `internal/`, and no `pkg/` until an outside module imports it |
| Go folder names | [golang-standards/project-layout](https://github.com/golang-standards/project-layout) (community reference, not official) | `cmd/`, `internal/`, `scripts/`, `docs/`. This blueprint writes `tests/` for its `test/` and `deploy/` for its `deployments/` + `build/`, so all four blueprints share one set of names |
| Go code | [Effective Go](https://go.dev/doc/effective_go), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md) | package names, interfaces owned by the consumer, error wrapping, no init side effects |
| Backend shape | [Hexagonal architecture / ports and adapters](https://alistair.cockburn.us/hexagonal-architecture/) (Cockburn) | `domain` → `app` → `adapters`, with dependencies pointing inward |
| Frontend shape | [bulletproof-react project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | features own their code; `app/` composes them; sharing goes one way only |
| Frontend naming | [Airbnb React/JSX naming](https://github.com/airbnb/javascript/tree/master/react#naming), [typescript-eslint naming-convention](https://typescript-eslint.io/rules/naming-convention/) | `PascalCase.tsx` components, `useThing.ts` hooks, `camelCase.ts` modules, kebab-case folders |
| Shared parts | tests, ops, docs and root files are in `README.md` §What every blueprint shares | — |

## The tree

```
.
├── cmd/
│   └── server/                 main.go: reads config, builds the graph, starts. Nothing else.
├── internal/
│   ├── <domain>/               one per bounded context: release, project, identity, …
│   │   ├── domain/             entities, value objects, domain errors (as apperr kinds). Imports nothing outside the stdlib, platform/apperr and other domains' domain/
│   │   ├── app/                use cases (Service), the ports it needs (ports.go: Repo, Clock, Mailer interfaces), transactions
│   │   └── adapters/
│   │       ├── postgres/       implements app's ports; sqlc output under postgres/db/
│   │       └── http/           this domain's handlers + Routes(r *httpx.Router); request/response types live here only
│   ├── platform/               the technical kernel, one named package per concern
│   │   ├── apperr/             error kinds (NotFound, Conflict, Validation, Forbidden, …): what domains return
│   │   ├── httpx/              Problem (RFC 9457), WriteError: the one error→HTTP mapper; pagination, ETag, Router type
│   │   ├── middleware/         auth, CSRF, request id, rate limit, recover
│   │   ├── config/  db/  obs/  clock/  ids/
│   └── server/                 composition root: builds every adapter, mounts every domain's Routes, owns http.Server
├── migrations/                 YYYYMMDDHHMM_<name>.{up,down}.sql (§7), plus embed.go for migrate-on-start
├── web/                        the SPA (Vite); web/embed.go embeds dist/ into the binary
│   ├── src/
│   │   ├── app/                router.tsx, provider.tsx, routes/<route>.tsx: composition only
│   │   ├── features/<feature>/ api/  components/  hooks/  types/  index.ts (the only import surface)
│   │   ├── components/         ui/ (the design-system kit), layouts/ (shells from docs/ui-patterns.md)
│   │   ├── hooks/  lib/  config/  types/  styles/  testing/
│   │   └── main.tsx
│   ├── index.html  package.json  vite.config.ts  tsconfig.json  eslint.config.js
├── tests/
│   ├── integration/<domain>/   real Postgres + real router, `//go:build integration`
│   ├── e2e/                    Playwright *.spec.ts
│   ├── contract/               the running API against dev/api/<slug>/openapi.yaml
│   ├── perf/                   k6 scripts and budgets
│   └── fixtures/               seed SQL, golden files shared across tiers
├── deploy/
│   ├── docker/Dockerfile       multi-stage: node build → go build → distroless
│   ├── compose/compose.yaml    local Postgres, mail catcher, the app
│   └── helm/<app>/  or  systemd/   one target, the one the release plan uses
├── ops/
│   ├── runbooks/               the living runbook per service
│   └── observability/          dashboards/, alerts/, otel-collector.yaml
├── scripts/                    developer shell scripts the Makefile calls; no product code
├── docs/                       architecture.md, onboarding, operator guides; links dev/design/adr/
├── dev/                        sdlc artifacts only (§2)
├── .gitlab-ci.yml  ci/         the pipeline, with ci/*.yml includes past ~150 lines
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
├── go.mod  go.sum  .golangci.yml  sqlc.yaml
```

Generated code stays next to its owner (`internal/<domain>/adapters/postgres/db/`), marked with
the standard `// Code generated … DO NOT EDIT.` line. The file ceiling skips files that carry it.

## Backend layering, and the dependency rule

```
          cmd/server
              │
        internal/server ───────────────┐  (composition root: the only package that sees every domain)
         │          │                   │
 <d>/adapters/http  <d>/adapters/postgres
         │    └───────┬───────┘         │
         │         <d>/app ─────────────┤
         │            │                 ▼
         └──────► <d>/domain      platform/{apperr,httpx,db,obs,…}
```

1. `domain` imports the stdlib, `platform/apperr`, `platform/ids` and other domains' `domain/`. It
   never imports `app`, any `adapters`, `net/http`, `database/sql` or a driver.
2. `app` imports `domain`, `platform` and other domains' `domain/`. It declares the interfaces it
   needs in `ports.go`, because Go interfaces belong to the consumer
   ([Code Review Comments § Interfaces](https://go.dev/wiki/CodeReviewComments#interfaces)). It never imports an adapter.
3. `adapters/postgres` and `adapters/http` import their own domain's `app` and `domain`, plus
   `platform`. They never import each other, and never another domain's adapters.
4. When a use case needs another domain, its `app` declares a port, and `internal/server` supplies
   the other domain's service to it. Two domains never call into each other's adapters.
5. `platform/*` imports no domain. It is the leaf, so it cannot be part of a cycle.

`layout-check.mjs` checks rules 1, 2, 3 and 5 (`## Rules` below). Rule 4 is the reviewer's.

## HTTP without a 122-file package, and without the cycle

There are two failures to avoid. The first is one `internal/http` package that holds every
domain's handlers, so it grows with the product: release-management reached 45 source files and
77 tests in it. The second is the naive split. It moves handlers to `internal/http/handlers`. The
router still imports the handlers, and the handlers still import the problem mapper that lives
beside the router, so the import graph has a cycle. The mapper also switches on every domain's
error, which ties it to every domain.

The split that works moves three things:

1. **The mapper becomes a leaf.** `platform/httpx` owns `Problem`, `WriteError`, `WriteJSON`,
   pagination and ETags, and imports no domain. It maps `apperr.Kind` to a status and
   `apperr.Code` to the problem `type` (`/problems/<code>`). That is still one mapping boundary,
   as §13.2 requires, but a domain adds an error by returning a new code, without editing a switch.
2. **Handlers go to their domain.** `internal/release/adapters/http` exports
   `Routes(r *httpx.Router, svc *app.Service)` and imports `httpx` and its own `app`. It never
   imports the router package.
3. **The router goes to the composition root.** `internal/server` imports each domain's
   `adapters/http` and `platform/middleware`, and mounts them. Nothing imports `internal/server`
   except `cmd/server`.

Every import now points down the picture above, so there is no cycle. The warning in the old
profile was correct for a mapper that lived beside the router. It does not apply once the mapper
is `platform/httpx`.

Handler tests (`httptest`, fake service) stay beside the handlers. Tests that drive the full router
against Postgres move to `tests/integration/<domain>/`.

## Frontend rules

1. `features/<a>` never imports `features/<b>`. When two features need the same thing, it moves
   down into `components/`, `hooks/` or `lib/`, or the composition moves up into `app/`. Enforce it
   in ESLint with `import/no-restricted-paths`, as bulletproof-react does. `layout-check.mjs` checks it too.
2. `components/`, `hooks/` and `lib/` never import `features/` or `app/`.
3. A feature is imported through its `index.ts`. Deep imports from outside the feature are the
   reviewer's finding.
4. bulletproof-react has a `utils/` folder. This blueprint does not: helpers go in `lib/<name>.ts`,
   named for what they do (`lib/format-date.ts`, `lib/cn.ts`).

## Rules

```json
{
  "name": "go-react",
  "requiredDirs": ["cmd", "internal", "migrations", "web", "tests", "deploy", "ops", "docs", "dev"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "go.mod"],
  "codeRoots": ["cmd", "internal", "migrations", "web", "tests", "deploy", "scripts", "ci", "dev"],
  "rootCode": [],
  "tests": {
    "root": "tests",
    "tiers": ["integration", "e2e", "contract", "perf", "fixtures"],
    "rootFiles": ["README.md"],
    "placement": [
      { "name": "_integration_test\\.go$", "under": ["tests/integration/"], "why": "integration tests live in tests/integration/<domain>/" },
      { "ext": ".go", "content": "^//go:build .*\\bintegration\\b", "under": ["tests/integration/"], "why": "an integration-tagged test lives in tests/integration/<domain>/" },
      { "name": "\\.spec\\.ts$", "under": ["tests/e2e/"], "why": "Playwright journeys live in tests/e2e/" }
    ]
  },
  "packageCeiling": 40,
  "alias": { "@/": "web/src/" },
  "imports": [
    { "lang": "go", "from": "internal/{d}/domain/**", "deny": ["internal/*/app/**", "internal/*/adapters/**", "internal/server/**", "internal/platform/httpx/**", "internal/platform/db/**", "net/http", "database/sql", "github.com/jackc/**"], "why": "domain imports no layer above it, no transport and no driver" },
    { "lang": "go", "from": "internal/{d}/app/**", "deny": ["internal/*/adapters/**", "internal/server/**", "net/http"], "why": "app declares ports; adapters implement them" },
    { "lang": "go", "from": "internal/{d}/adapters/postgres/**", "deny": ["internal/*/adapters/http/**", "internal/!{d}/adapters/**", "internal/server/**"], "why": "an adapter never reaches another adapter" },
    { "lang": "go", "from": "internal/{d}/adapters/http/**", "deny": ["internal/*/adapters/postgres/**", "internal/!{d}/adapters/**", "internal/server/**"], "why": "handlers call their own app, never a repository or another domain's handlers" },
    { "lang": "go", "from": "internal/platform/**", "deny": ["internal/!platform/**"], "why": "platform is the leaf; importing a domain or the server makes a cycle possible" },
    { "lang": "ts", "from": "web/src/features/{f}/**", "deny": ["web/src/features/!{f}/**", "web/src/app/**"], "why": "features never import each other; app/ composes them" },
    { "lang": "ts", "from": "web/src/components/**", "deny": ["web/src/features/**", "web/src/app/**"], "why": "shared code never imports a feature" },
    { "lang": "ts", "from": "web/src/lib/**", "deny": ["web/src/features/**", "web/src/app/**"], "why": "shared code never imports a feature" },
    { "lang": "ts", "from": "web/src/hooks/**", "deny": ["web/src/features/**", "web/src/app/**"], "why": "shared code never imports a feature" }
  ]
}
```
