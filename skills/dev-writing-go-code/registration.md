# Per-module registration — no wiring hubs

On release-management the files most often edited by two lanes at once were `main.go` (48 commits),
`router.go` (39), `services.go` (33) and `routes.go` (32): every feature added its handler, its route
and its service to one shared function. Each lane's merge then conflicted on lines no lane owned.

The rule (DEV-CONTRACTS §18.6): **a domain wires itself in files it owns; a shared file only lists
domains, one sorted line each.** Two lanes adding two domains then touch different lines, and git
merges them. The layout stays the one `SKILL.md` names — handlers in `internal/http`, beside the
router and the one problem mapper.

## The shape

```go
// internal/release/wire.go — owned by the release lane. The domain builds its own service graph.
package release

type Deps struct {
	DB    *pgxpool.Pool
	Clock func() time.Time
}

func NewService(d Deps) *Service { return newService(newRepo(d.DB), d.Clock) }
```

```go
// internal/http/release_routes.go — owned by the release lane, beside release_handlers.go.
package http

func init() { register("release", mountRelease) }

func mountRelease(r chi.Router, s *Services) {
	h := &releaseHandlers{svc: s.Release, errs: s.Problems}
	r.Route("/v1/releases", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/", h.create)
		r.Get("/{id}", h.get)
	})
}
```

```go
// internal/http/router.go — never changes for a feature.
package http

type mount func(chi.Router, *Services)

var mounts = map[string]mount{}

func register(name string, m mount) {
	if _, dup := mounts[name]; dup {
		panic("http: route group registered twice: " + name)
	}
	mounts[name] = m
}

func NewRouter(s *Services) chi.Router {
	r := chi.NewRouter()
	r.Use(requestID, recoverer, authenticate(s.Sessions)) // middleware order lives here, once
	names := make([]string, 0, len(mounts))
	for n := range mounts {
		names = append(names, n)
	}
	sort.Strings(names) // deterministic mount order
	for _, n := range names {
		mounts[n](r, s)
	}
	return r
}
```

```go
// internal/http/services.go — the one shared list: a field per domain, one line each, sorted.
package http

type Services struct {
	Problems *problem.Mapper
	Sessions *identity.Sessions
	Project  *project.Service
	Release  *release.Service
}
```

```go
// cmd/server/main.go — builds Deps once and hands each domain its own constructor.
s := &http.Services{
	Problems: problem.NewMapper(),
	Sessions: identity.NewSessions(identity.Deps{DB: db}),
	Project:  project.NewService(project.Deps{DB: db}),
	Release:  release.NewService(release.Deps{DB: db, Clock: time.Now}),
}
```

A new domain adds one `Services` field and one constructor line, sorted by name; its routes,
handlers and service graph are in files only it edits.

## What still lives in one place

- **The problem mapper** (domain error → RFC 9457): one per service (§13.1). A domain adds its
  errors to a table in its own package; the mapper reads every table.
- **Middleware order**: in `NewRouter`, applied before any group is mounted.
- **Migrations**: one directory with timestamped names — they never conflict.

## What a reviewer checks

- A feature diff that edits `router.go`, `main.go` or `services.go` beyond one sorted line per new
  domain is a finding: the wiring belongs in the domain's own files.
- A route group mounts only under its own prefix; one that registers another domain's path is a
  layering finding (§13.2).
