---
stage: knowledge
artifact: codebase-map
status: in-review
authored_by: dev-analysing-source
reviewed_by: dev-reviewing-knowledge
grounded_at: 8556e8f1333dbd5ae6e636f6ea650868685e5168
created: 2026-09-15
updated: 2026-09-15
---

## Shape

A single Go service with a React front end. HTTP requests enter through `cmd/api/main.go:31`, are
routed in `internal/api/router.go:18`, handled per resource in `internal/api/`, and reach the
database through `internal/store/`. There is no message queue.

## Modules

| Module | Path | Responsibility | Owner | Depends on | Depended on by |
|---|---|---|---|---|---|
| api | `internal/api/` | HTTP handlers, request decoding, response shaping | platform | service | cmd |
| service | `internal/service/` | business rules, transaction boundaries | platform | store | api |
| store | `internal/store/` | SQL, migrations, row mapping | platform | — | service |
| web | `web/` | React 19 SPA | product | — | — |

## Entry points

| Entry point | Registered at | Notes |
|---|---|---|
| HTTP API | `cmd/api/main.go:31` | the only server binary |
| Route table | `internal/api/router.go:18` | every route is registered here, none elsewhere |
| Migration runner | `cmd/migrate/main.go:12` | run out of band, never on boot |

## Layering

Strictly `api → service → store`, verified: `grep -rn "internal/api" internal/store/` returns 0 and
`grep -rn "internal/service" internal/store/` returns 0. No import cycles reported by `go vet ./...`.

## Cross-cutting concerns

Logging, request ids and panic recovery are middleware, composed once at
`internal/api/router.go:24`. Authentication is middleware on the protected subrouter
(`internal/api/router.go:39`); the health endpoints sit outside it.

## Build and run

`make build` (wraps `go build ./cmd/...`), `make run`, `make test`. The front end builds with
`npm --prefix web run build`. Docker compose brings up Postgres 16 for local work.

## Sources and gaps

Read at commit `8556e8f`: `cmd/`, `internal/`, `web/src/`. Not read: `deploy/` (Terraform, owned by
infrastructure) and `scripts/` — neither is a target for feature work, and neither was needed to
answer where code goes.
