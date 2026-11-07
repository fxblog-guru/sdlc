# Greenfield: the conventions cards G6 writes (§13.11, §16.4)

With `project_maturity: greenfield` there is no code to extract conventions from, so the first G6
writes `<root>/knowledge/conventions.md` and `<root>/knowledge/test-conventions.md` itself, from the GK
templates in `<root>/_templates/knowledge/` and the defaults below, and lists both under its outputs.
`grounded_at` is the commit G6 starts from; the example column cites the file the first task
will create (`internal/release/service.go` — planned). G7 check 18 then holds every task to the
cards; `/sdlc-onboard --refresh` re-grounds them once the code exists. A default that does not fit
is changed in the card with a `DEC-NNN`, never silently in the code.

## conventions.md — the defaults per section (Go; Python in brackets)

**Naming**

| What | Convention |
|---|---|
| package / module | one per domain noun, singular: `release`, `identity` [`release/`] |
| constructor | `New(deps Deps) *Service` — one `Deps` struct, no error return; validation of config is start-up's job [`Service(deps: Deps)`] |
| sqlc query | `<Verb><Noun>`, verb from `Get List Create Update Delete Exists Count` (+ DEV-PROFILE `Query verbs` such as `Lock`); never a bare noun (`ReleaseParent`) or a synonym (`Insert`, `Store`, `Save`, `Record`) |
| env var | `<APP>_<NAME>` (DEV-PROFILE `Env prefix`); every key in `.env.example` is read by config, every key config reads is in `.env.example` |
| problem type, limit, event, metric | the §13.11 catalogues |
| DB objects | `dev-modeling-data` `db-naming.md` |

**Code placement** — one package per domain:

| File | Holds |
|---|---|
| `internal/<domain>/service.go` | `Service`, `New`, the use cases; transactions begin here |
| `internal/<domain>/repo.go` | the sqlc wrapper; maps `pgx.ErrNoRows` to `ErrNotFound` |
| `internal/<domain>/errors.go` | sentinels and typed errors; no HTTP |
| `internal/<domain>/queries.sql` | this domain's queries only |
| `internal/platform/db/lookups.sql` | cross-domain lookups (`ExistsProject`, `GetReleaseStatus`), one copy |
| `internal/http/<domain>_handlers.go` | decode, call, return the error; the mapper is `internal/http/problem.go` |
| `internal/fielderr` | the one `FieldError` (template `_templates/code/go/fielderr`) |

**Error handling** — `dev-writing-go-code` `error-boundary.md`: one status table, one mapper.

**Data access** — two helpers in `internal/platform/db`, used by every service, never hand-rolled:

```go
func InTx(ctx context.Context, pool *pgxpool.Pool, fn func(q *Queries) error) error             // read-write
func InReadSnapshot(ctx context.Context, pool *pgxpool.Pool, fn func(q *Queries) error) error   // REPEATABLE READ, READ ONLY
```

**Logging, metrics, tracing** — `dev-designing-observability` `catalogue.md`: one event API,
`internal/platform/obs` from `_templates/code/go/obs` (JSON lines, ids from the context, the request
middleware, RED histogram, OTLP spans); telemetry leaves through `ops/otel/collector.yaml`.

**Configuration and secrets** — one `config.Load(getenv)` at start-up, failing on the first bad key.

## test-conventions.md — the defaults

| Section | Default |
|---|---|
| Placement and naming | `<file>_test.go` beside the code; integration tests carry `//go:build integration` [`tests/unit`, `tests/integration`, marker `integration`] |
| Case shape | table-driven with named cases and `t.Run` — one function per behaviour, not per input [`@pytest.mark.parametrize` with `ids=`] |
| Fixtures and test data | `internal/testkit`: `NewEnv(t)` (DB, clock, IDs), builders (`testkit.Release(t, env, opts…)`), assertion helpers. A helper two packages need moves there; `conventions-check.mjs` warns past DEV-PROFILE `Helper threshold` |
| The database | one container per run; each test in a transaction rolled back by `t.Cleanup` |
| Clock and ids | injected through `Deps`; tests never sleep |
