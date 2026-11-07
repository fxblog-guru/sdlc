# Blueprint: service-go — V2, schema only

> **V2 — schema only.** The tree and the rules are fixed so a polyrepo can start on them, and
> `layout-check.mjs` checks a single service repository against them. Nothing yet checks across
> repositories: contract compatibility between services, the `Services` table in DEV-PROFILE, and
> cross-service impact analysis are V3.

One service in a **polyrepo** (`Repository model: polyrepo`, usually `Architecture:
microservices`): its own repository, its own deploy, its own contract, its own on-call. The
backend inside is the `go-service` layering (`domain` → `app` → `adapters`), and its dependency
rules are the same. What changes is the top level: the service publishes its contract in `api/`,
and carries its own `ops/` and `docs/`, because nobody else's repository will hold them.

Choose this only when the G2 decision table shows the criteria that force separate deploys
(§13.9). The default is `fullstack-go-react`.

## The tree

```
.
├── cmd/<binary>/               one per process (server, worker); main.go stays a few lines
├── internal/
│   ├── <domain>/{domain,app,adapters/{postgres,http,grpc,queue}}/
│   ├── platform/{apperr,httpx,middleware,config,db,obs,clock,ids}/
│   └── server/                 composition root
├── api/                        this service's published contract, and the only one it owns
│   ├── openapi.yaml            or proto/<pkg>/v1/*.proto + buf.yaml
│   └── CHANGELOG.md            every contract change, with its compatibility class
├── migrations/                 this service's database only; no other service reads its tables
├── tests/{integration,contract,perf,fixtures}/
├── ops/{deploy,config,alerts,dashboards,runbooks}/
├── docs/                       architecture.md (this service's container view), operators/
├── scripts/  ci/
├── <root>/                     this service's process root: its own changes, gates and ledger
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
├── go.mod  go.sum  .golangci.yml
```

`api/` is the contract the service *publishes*. A contract it *consumes* is never copied in. It is
pinned by version from the other service's repository or the `contracts` repository (below), and
generated into `internal/<domain>/adapters/<client>/gen/`.

## The repositories around it

| Repository | Holds | Process root |
|---|---|---|
| `<service>` (this blueprint), one per service | the service, its contract, its ops, its docs | `<root>/` in that repository, for changes that touch only this service |
| `contracts` | every published contract by service and major version (`<service>/v1/openapi.yaml`), the compatibility check in CI, the generated clients | none of its own; a change here is a task of the initiative that needs it |
| `platform` | the shared Go packages that would otherwise be copied (`apperr`, `httpx`, `obs`, `middleware`), versioned and imported as a module; shared CI templates; the base images | its own `<root>/`, because a platform change is a product of its own |
| `initiative` (or the `platform` repository's process root) | the cross-service work: an initiative's requirements, design, the impact across services, the release plan that orders the deploys | an initiative-level `<root>/`; each service repository's own change links back to the initiative's `INI-`/slug |

A change that touches one service runs end to end in that service's repository. A change that
touches two or more runs G0–G2 at the initiative level (one design, one decision table, one
cross-service impact), and G6–G10 in each service repository, one slug per repository, each
citing the initiative. The `Services` table in DEV-PROFILE (§Stacks) is where the initiative
level finds each service's repository, owner and contract path.

## Rules

```json
{
  "name": "service-go",
  "fits": { "repositoryModel": ["polyrepo"], "architecture": ["microservices", "modular-monolith", "monolith"] },
  "topLevel": ["cmd", "internal", "api", "migrations", "tests", "ops", "docs", "scripts", "ci", "dev", "qa"],
  "requiredDirs": ["cmd", "internal", "api", "tests", "ops", "ops/deploy", "ops/runbooks", "docs"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "go.mod", ["api/openapi.yaml", "api/buf.yaml"]],
  "codeRoots": ["cmd", "internal", "api", "migrations", "tests", "ops", "scripts", "ci", "dev", "qa"],
  "rootCode": [],
  "tests": {
    "root": "tests",
    "tiers": ["integration", "contract", "perf", "fixtures"],
    "rootFiles": ["README.md"],
    "placement": [
      { "name": "_integration_test\\.go$", "under": ["tests/integration/"], "why": "integration tests live in tests/integration/<domain>/" },
      { "ext": ".go", "content": "^//go:build .*\\bintegration\\b", "under": ["tests/integration/"], "why": "an integration-tagged test lives in tests/integration/<domain>/" }
    ]
  },
  "singleHome": [
    { "name": "deploy", "homes": ["ops/deploy"], "ignore": ["internal", "dev", "qa"], "why": "deploy files live in ops/deploy/" },
    { "name": "runbooks", "homes": ["ops/runbooks"], "ignore": ["internal", "dev", "qa"], "why": "runbooks live in ops/runbooks/" },
    { "name": "docs", "homes": ["docs"], "ignore": ["internal", "dev", "qa"], "why": "docs/ is the only root of human docs" },
    { "name": "http", "homes": ["internal/*/adapters/http"], "ignore": ["dev", "qa"], "why": "handlers live in internal/<domain>/adapters/http/" }
  ],
  "packageCeiling": 40,
  "imports": [
    { "lang": "go", "from": "internal/{d}/domain/**", "deny": ["internal/*/app/**", "internal/*/adapters/**", "internal/server/**", "internal/platform/httpx/**", "internal/platform/db/**", "net/http", "database/sql", "github.com/jackc/**", "google.golang.org/grpc/**"], "why": "domain imports no layer above it, no transport and no driver" },
    { "lang": "go", "from": "internal/{d}/app/**", "deny": ["internal/*/adapters/**", "internal/server/**", "net/http"], "why": "app declares ports; adapters implement them" },
    { "lang": "go", "from": "internal/{d}/adapters/*/**", "deny": ["internal/!{d}/adapters/**", "internal/server/**"], "why": "an adapter never reaches another domain's adapter or the composition root" },
    { "lang": "go", "from": "internal/platform/**", "deny": ["internal/!platform/**"], "why": "platform is the leaf; importing a domain or the server makes a cycle possible" }
  ]
}
```
