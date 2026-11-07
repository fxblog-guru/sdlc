---
name: dev-writing-go-code
description: Use in /sdlc-implement (G7) for .go targets: idiomatic errors, context threading, concurrency traps, the gofmt/vet/golangci-lint/race toolchain.
---

# Writing Go — G7

Go's failure modes are not the ones a reviewer notices while reading. The code that leaks a
goroutine, drops a `rows.Err()`, or returns a non-nil error interface holding a nil pointer looks
exactly like the code that does not. That is what this skill is for: the specific places where Go
is quiet about being wrong.

> `DEV-CONTRACTS.md` §13.2 (backend standards), §13.1 (what the handler owes the caller), §13.5
> (what it emits), §13.6 (what it refuses). `DEV-PROFILE §Stacks` for the version and the layout.
> In brownfield, `<root>/knowledge/conventions.md` outranks every default below — match the repo.
> The repository's tree and layering come from its blueprint, `dev-resolving-code-placement/blueprints/` (§13.9); in greenfield its HTTP split replaces the "Where handlers live" paragraph below.

## Errors

**Wrap with `%w`, once, with context the caller does not already have.**

```go
if err := s.repo.Get(ctx, id); err != nil {
    return fmt.Errorf("load job %s: %w", id, err)
}
```

`%w` keeps `errors.Is` and `errors.As` working up the stack; `%v` severs the chain and turns a
typed error into a string that some handler will eventually match on with `strings.Contains`. The
context you add is *what you were doing*, not what the error said — `"load job abc123: sql: no
rows in result set"` is useful; `"error: failed to get: %v"` is noise that appears eleven times in
one stack trace.

**Sentinel errors and typed errors at the domain boundary.** Define `var ErrNotFound = errors.New(...)`
in the domain package and map infrastructure errors to it in the repository, so that the service
layer never imports `database/sql` to know a row was missing. §13.2's "errors mapped to the §13.1
shape at exactly one boundary" means one status table and one typed domain-error → problem mapper,
never a `Status:` literal in a handler: follow [error-boundary.md](error-boundary.md).

**The typed-nil trap.** A `*MyError` that is nil, returned as an `error`, is **not** nil:

```go
var e *MyError            // nil pointer
return e                  // err != nil is TRUE — the interface holds a type
```

Return `nil` explicitly on the success path. This one gets past review by looking correct.

**Never** discard an error with `_ =` unless the line above says why in a comment, and never
`panic` in library code. A panic in a handler takes the process down or gets swallowed by a
recovery middleware that logs nothing useful; a returned error takes two lines and survives.

## Context

`ctx context.Context` is the first parameter of anything that does I/O, and it is passed down, not
stored in a struct. `context.Background()` belongs in `main` and in tests; `context.TODO()` belongs
in neither by the time you hand over.

Threading it is not paperwork. A request that the client abandoned keeps holding a database
connection until the query finishes unless the query was given the context — under load that is the
difference between a slow endpoint and a pool exhaustion incident. Use the `...Context` variants
everywhere: `QueryRowContext`, `ExecContext`, `http.NewRequestWithContext`.

Honour cancellation in loops that do real work:

```go
for _, batch := range batches {
    if err := ctx.Err(); err != nil {
        return err
    }
    ...
}
```

## Concurrency, in the order these actually bite

**A goroutine you cannot stop is a leak.** Every `go func()` needs an answer to "what ends this?" —
a closed channel, a cancelled context, a bounded loop. A goroutine blocked forever on a channel send
holds its whole stack and everything it references; the symptom is memory that grows over days, and
by then the cause is unfindable.

**`errgroup` over hand-rolled `WaitGroup` + error channel.** `errgroup.WithContext` cancels the
siblings when one fails, which is almost always what you meant and almost never what the hand-rolled
version does.

**`wg.Add(1)` before `go`, never inside it.** Inside, the `Wait` can return before the goroutine
has started.

**Never copy a mutex or a struct containing one.** `go vet`'s `copylocks` catches most of it; a
method with a value receiver on a struct with a `sync.Mutex` is the case people still write.

**Maps are not safe for concurrent use** — concurrent writes crash the process with a fatal error
that no `recover` will catch. Guard with a mutex or use a channel; `sync.Map` only for the two
access patterns it documents.

**Loop-variable capture:** Go 1.22 and later give each iteration a fresh variable, so the old
`i := i` shadow is no longer needed. Two consequences: do not add it back as ritual, and do not
assume it on a module whose `go` directive is below 1.22 — check `go.mod` before you rely on it.

**`time.Sleep` is not synchronisation.** Not in production code, and especially not in tests, where
it converts a race into a flake that G8 will report as a finding rather than retry away.

Run `go test -race` on anything concurrent. The race detector finds in one run what a reviewer will
not find in an hour.

## Resources, defer and the checks people skip

```go
rows, err := db.QueryContext(ctx, q, args...)
if err != nil {
    return nil, fmt.Errorf("list jobs: %w", err)
}
defer rows.Close()

for rows.Next() { ... }
if err := rows.Err(); err != nil {      // the line that gets forgotten
    return nil, fmt.Errorf("list jobs: %w", err)
}
```

Without `rows.Err()`, a connection dropped mid-iteration returns a **short result set and no
error** — a list endpoint that silently returns nine of twelve rows. Same family: an HTTP response
body that is not closed and not drained leaks a connection out of the pool.

**`defer` inside a loop** runs at function exit, not iteration exit. Either move the body into its
own function or close explicitly.

**Transactions:** `defer tx.Rollback()` immediately after `Begin` (a rollback after a successful
commit is a no-op error you ignore deliberately), and keep the transaction inside the service
boundary. §13.2 forbids a transaction spanning an HTTP call — holding a row lock across somebody
else's network timeout is how one slow dependency becomes a database-wide outage.

## HTTP and outbound calls

`http.DefaultClient` and `http.Get` have **no timeout**. A single unresponsive dependency will
accumulate blocked goroutines until the process dies. Every client this change creates sets
`Timeout` (or a per-request context deadline), and §13.2 additionally wants a retry with jitter and
a breaker where the dependency can be slow. On the server side set `ReadHeaderTimeout` — the
default `http.Server` is open to Slowloris.

Handlers stay thin: decode, validate, call the service, map the error, encode. Transport types
(request/response structs, `url.Values`) never reach the domain (§13.2), because the day a second
caller arrives the domain drags HTTP along with it.

**Where handlers live.** All of them in the one `internal/http` package, one file per domain —
`internal/http/<domain>_handlers.go` — beside the router and the single problem mapper. Never an
`internal/http/handlers` subpackage: the router imports the handlers and the handlers import the
mapper, so splitting them is an import cycle, and the usual "fix" is a second mapper, which breaks
§13.2's one boundary. A brownfield `conventions.md` that records a different working layout wins.

**Each domain wires itself.** Its routes register from `internal/http/<domain>_routes.go` and its
service graph is built in `internal/<domain>/wire.go`; `main.go`, the router and the services list
gain at most one sorted line per new domain. The pattern is `registration.md` beside this file.

## Tests

Table-driven, with subtests and a named case per row:

```go
tests := map[string]struct{ in string; want Job; wantErr error }{ ... }
for name, tc := range tests {
    t.Run(name, func(t *testing.T) {
        t.Parallel()
        ...
    })
}
```

Assert on behaviour, not on how many times a mock was called — a test that asserts the call count
fails on every refactor and passes on every regression. `t.Cleanup` over `defer` in helpers.
`httptest.NewServer` over a mocked transport when the thing under test is an HTTP client. Use
`testify` where `DEV-PROFILE` says so, but `require` for anything whose failure makes the rest of
the test meaningless, otherwise the log fills with cascading panics.

Integration tests carry the build tag the repo already uses (`//go:build integration`) so G8 can run
the tier separately. A test that needs a database and has no tag will run in the unit suite on a
machine that has none, and the fix somebody reaches for is `t.Skip`.

**Name the id, and do not buy time (§13.10).** A test that proves an `AC-NNN` or a `UB-NNN` names it
in a comment on the test (`// AC-109: 422 keeps the input`); `trace.mjs <slug> --check` must exit 0
before handback. A larger `-timeout` or a retry loop around a test needs `// slow-test: <cause>`;
otherwise fix the race or the slow fixture.

## Toolchain — run these before you hand over

| Tool | Command | Catches |
|---|---|---|
| format | `gofmt -l .` (or `gofumpt`) | the format gate at G8, which is exit-code binary |
| imports | `goimports -l .` | grouping and unused imports |
| vet | `go vet ./...` | copylocks, printf arity, lost cancel, unreachable |
| lint | `golangci-lint run` | `errcheck` (the ignored error), `ineffassign`, `bodyclose` |
| tests | `go test ./... -race -cover` | the race, and the number G8 measures per module |
| vulns | `govulncheck ./...` | §13.6's dependency gate |

If `golangci-lint` is configured in the repo, its config wins over anything here.

## Observability (§13.5)

One logging API, copied from `<root>/_templates/code/go/obs/` into `internal/platform/obs/` at the
first G7 task: a catalogued event name and typed attributes, never an interpolated sentence:

```go
obs.Event(ctx, "job.assignment_created", "job_id", job.ID, "engineer_id", eng.ID)
```

The package adds `trace_id`, `span_id`, `request_id` and `user_id` from the context, redacts secret
and PII keys, and `obs.Requests` writes `http.request_completed` and echoes `X-Request-Id`. A direct
`slog.InfoContext` beside it is a second logging path (obs-check E116). Spans on outbound calls and
DB queries via OpenTelemetry with the context passed on every hop; `obs.TraceID(ctx)` goes in the
error response, so the id a user quotes is the one the runbook searches for at G11.

## Query budgets (§13.7)

Every endpoint has `x-perf` in the contract; the tests hold the code to it, at G7, not G8:

1. **Count queries per request.** A pgx tracer counts the queries of a request's context and the
   router reports them in `X-Query-Count` outside production. Each integration test of an endpoint
   asserts the count is within `x-perf.max_queries` **and does not grow from 3 rows to 20** — the
   second assertion is the N+1 catch on a small fixture.
2. **`EXPLAIN` every new or changed query** on a few thousand `generate_series` rows, with
   `SET LOCAL enable_seqscan = off`, and fail on a `Seq Scan` of a table `data-model.md` calls
   large: a scan that survives it means no usable index exists. Assert the plan's shape, never its
   cost.

The tracer, the middleware and both tests: `query-checks.md` beside this file. A slow test is
investigated for a product cause before any timeout changes:
`.claude/skills/dev-stage-protocol/slow-tests.md`.

## What a reviewer will grep for

Run these on your own diff first; each one is a finding somebody else would have written.

| Grep | What it usually means |
|---|---|
| `context.TODO(` | a boundary that was never threaded |
| `_ = ` before a call returning `error` | a discarded error with no comment |
| `fmt.Errorf(` without `%w` | a severed error chain |
| `panic(` outside `main` | an outage waiting for one bad input |
| `http.Get(`, `http.DefaultClient` | an outbound call with no timeout |
| `defer` inside `for` | a resource held until the function returns |
| a `Query`/`QueryContext` with no `rows.Err()` nearby | silent truncation |
| `time.Sleep` in `_test.go` | a flake G8 will report |
| a handler test with no `X-Query-Count` assertion, a new query with no `AssertIndexed` | an unbudgeted endpoint, an unproved index (§13.7) |
| `interface{}` / `any` in a domain signature | a type boundary that gave up |

## Do not

Write the migration (that is `dev-writing-migrations`), design the schema (G3) or the wire contract
(G4). Add a dependency that `architecture.md` did not name. Reformat files the task did not touch —
it buries the change in the diff and the reviewer reads what is in front of them.
