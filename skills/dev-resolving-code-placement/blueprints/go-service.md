# Blueprint: go-service

A Go service with no UI: an HTTP or gRPC API, a queue consumer, a scheduled worker, or several of
these sharing one module. The backend is the `go-react` blueprint without `web/`. Its layering,
dependency rule and HTTP split are in `go-react.md` §Backend layering and §HTTP without a 122-file
package. Read those sections there; they are not repeated here.

## Standards it follows

| Area | Standard |
|---|---|
| Module shape | [Organizing a Go module](https://go.dev/doc/modules/layout) (official): `cmd/<binary>/` for each process, `internal/` for the rest |
| Folder names | [golang-standards/project-layout](https://github.com/golang-standards/project-layout) (community reference); `tests/` and `deploy/` as in every blueprint |
| Code | [Effective Go](https://go.dev/doc/effective_go), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md) |
| Shape | [Ports and adapters](https://alistair.cockburn.us/hexagonal-architecture/): `internal/<domain>/{domain,app,adapters/*}` |
| gRPC, when used | [Buf style guide](https://buf.build/docs/best-practices/style-guide/): `api/proto/<pkg>/v1/*.proto`, generated code in `internal/<domain>/adapters/grpc/gen/` |
| Shared parts | `README.md` §What every blueprint shares |

## The tree

```
.
├── cmd/
│   ├── server/                 the API process
│   └── worker/                 one directory per extra process (consumer, scheduler); each main.go stays a few lines
├── internal/
│   ├── <domain>/{domain,app,adapters/{postgres,http,grpc,queue}}/
│   ├── platform/{apperr,httpx,middleware,config,db,obs,clock,ids}/
│   └── server/                 composition root for cmd/server; worker/ for cmd/worker, if it wires differently
├── api/                        only for gRPC or a published schema: proto/<pkg>/v1/, buf.yaml
├── migrations/
├── tests/{integration,contract,perf,fixtures}/
├── deploy/{docker,compose,helm|systemd,terraform}/
├── ops/{runbooks,observability}/
├── scripts/  docs/  dev/  ci/
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
├── go.mod  go.sum  .golangci.yml
```

An adapter is named for what it talks to: `queue/` for a consumer and `grpc/` for a gRPC server.
It follows the same rule as `http/`. It calls its own domain's `app`, and the composition root
mounts it.

## Rules

```json
{
  "name": "go-service",
  "requiredDirs": ["cmd", "internal", "tests", "deploy", "ops", "docs", "dev"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "go.mod"],
  "codeRoots": ["cmd", "internal", "api", "migrations", "tests", "deploy", "scripts", "ci", "dev"],
  "rootCode": [],
  "tests": {
    "root": "tests",
    "tiers": ["integration", "e2e", "contract", "perf", "fixtures"],
    "rootFiles": ["README.md"],
    "placement": [
      { "name": "_integration_test\\.go$", "under": ["tests/integration/"], "why": "integration tests live in tests/integration/<domain>/" },
      { "ext": ".go", "content": "^//go:build .*\\bintegration\\b", "under": ["tests/integration/"], "why": "an integration-tagged test lives in tests/integration/<domain>/" }
    ]
  },
  "packageCeiling": 40,
  "imports": [
    { "lang": "go", "from": "internal/{d}/domain/**", "deny": ["internal/*/app/**", "internal/*/adapters/**", "internal/server/**", "internal/platform/httpx/**", "internal/platform/db/**", "net/http", "database/sql", "github.com/jackc/**", "google.golang.org/grpc/**"], "why": "domain imports no layer above it, no transport and no driver" },
    { "lang": "go", "from": "internal/{d}/app/**", "deny": ["internal/*/adapters/**", "internal/server/**", "net/http"], "why": "app declares ports; adapters implement them" },
    { "lang": "go", "from": "internal/{d}/adapters/*/**", "deny": ["internal/!{d}/adapters/**", "internal/server/**"], "why": "an adapter never reaches another domain's adapter or the composition root" },
    { "lang": "go", "from": "internal/platform/**", "deny": ["internal/!platform/**"], "why": "platform is the leaf; importing a domain or the server makes a cycle possible" }
  ]
}
```
