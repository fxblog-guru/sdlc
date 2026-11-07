# Query checks in Go — the reference for `dev-writing-go-code` §Query budgets

Two tests per change that touches the database (DEV-CONTRACTS §13.7), and one piece of middleware
that lets the check-time smoke see the same number. Adapt the names to the repository's layout
(`<root>/knowledge/conventions.md` wins); keep the assertions.

## 1. A per-request query counter (pgx v5)

A tracer on the pool counts every query whose context carries a counter. Build it into test and
dev builds; in production it costs one context lookup per query, so most teams keep it everywhere
and only emit the header outside production.

```go
// internal/platform/dbcount/dbcount.go
package dbcount

type counterKey struct{}

// Counter counts the queries run with a context that carries it.
type Counter struct{ n atomic.Int64 }

func (c *Counter) N() int64 { return c.n.Load() }

func With(ctx context.Context) (context.Context, *Counter) {
    c := &Counter{}
    return context.WithValue(ctx, counterKey{}, c), c
}

// Tracer is a pgx.QueryTracer and pgx.BatchTracer: cfg.ConnConfig.Tracer = dbcount.Tracer{}.
type Tracer struct{}

func (Tracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
    if c, ok := ctx.Value(counterKey{}).(*Counter); ok {
        c.n.Add(1)
    }
    return ctx
}
func (Tracer) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func (Tracer) TraceBatchStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceBatchStartData) context.Context { return ctx }
func (Tracer) TraceBatchQuery(ctx context.Context, _ *pgx.Conn, _ pgx.TraceBatchQueryData) {
    if c, ok := ctx.Value(counterKey{}).(*Counter); ok {
        c.n.Add(1)
    }
}
func (Tracer) TraceBatchEnd(context.Context, *pgx.Conn, pgx.TraceBatchEndData) {}

// Middleware counts each request's queries and reports them in X-Query-Count — the header
// perf-smoke.mjs reads. Mount it outside production only (ENV != production).
func Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx, c := With(r.Context())
        next.ServeHTTP(&countingWriter{ResponseWriter: w, c: c}, r.WithContext(ctx))
    })
}

type countingWriter struct {
    http.ResponseWriter
    c     *Counter
    wrote bool
}

func (w *countingWriter) WriteHeader(code int) {
    if !w.wrote {
        w.wrote = true
        w.Header().Set("X-Query-Count", strconv.FormatInt(w.c.N(), 10))
    }
    w.ResponseWriter.WriteHeader(code)
}

func (w *countingWriter) Write(b []byte) (int, error) {
    if !w.wrote {
        w.WriteHeader(http.StatusOK)
    }
    return w.ResponseWriter.Write(b)
}
```

A count lower than you expect is a query run with `context.Background()` — the counter cannot see
it, and neither can cancellation. That is a context-threading finding in its own right.

## 2. The query-budget test — N+1 caught by a number

Per endpoint the change touches, in the integration tier. Two assertions: the count is within the
operation's `x-perf.max_queries`, and **it does not grow with the rows**. The second is the one that
catches N+1 on a fixture too small for the first to trip.

```go
//go:build integration

func TestListReleases_QueryBudget(t *testing.T) {
    const maxQueries = 4 // openapi.yaml listReleases x-perf.max_queries — change it there, not here
    srv := newTestServer(t) // the pool with dbcount.Tracer, the router with dbcount.Middleware

    count := func(rows int) int {
        t.Helper()
        resetAndSeed(t, srv.DB, fixture.Releases(rows, fixture.WithScopeItems(8)))
        res := srv.Get(t, "/v1/releases?limit=20")
        require.Equal(t, http.StatusOK, res.StatusCode)
        n, err := strconv.Atoi(res.Header.Get("X-Query-Count"))
        require.NoError(t, err, "no X-Query-Count — is dbcount.Middleware mounted in the test server?")
        return n
    }

    small, large := count(3), count(20)
    require.LessOrEqual(t, large, maxQueries, "queries per request over x-perf.max_queries")
    require.Equal(t, small, large, "the query count grows with the rows: a query per row (N+1)")
}
```

Prove the counter once: a handler known to run exactly two queries reports `2`. A counter that
reports `0` everywhere passes every budget.

## 3. The plan test — every new query uses an index

Per new or changed query. A fixture of a few thousand rows in each table `data-model.md` calls
large, built with `generate_series` (well under a second), then `ANALYZE`, then the query's plan.
`enable_seqscan = off` makes the planner take an index whenever one can serve the query, so a
`Seq Scan` that survives it means **no usable index exists** — a fact about the schema, not about
the fixture's size.

```go
//go:build integration

// Tables data-model.md marks as growing. A seq scan of a lookup table is fine.
var largeTables = map[string]bool{"releases": true, "scope_items": true, "activity_log": true}

type planNode struct {
    NodeType string     `json:"Node Type"`
    Relation string     `json:"Relation Name"`
    Plans    []planNode `json:"Plans"`
}

func seqScans(n planNode, out *[]string) {
    if n.NodeType == "Seq Scan" && largeTables[n.Relation] {
        *out = append(*out, n.Relation)
    }
    for _, c := range n.Plans {
        seqScans(c, out)
    }
}

// AssertIndexed fails when query, with args, would scan a large table sequentially.
func AssertIndexed(t *testing.T, db *pgxpool.Pool, query string, args ...any) {
    t.Helper()
    ctx := context.Background()
    tx, err := db.Begin(ctx)
    require.NoError(t, err)
    defer tx.Rollback(ctx)
    _, err = tx.Exec(ctx, "SET LOCAL enable_seqscan = off")
    require.NoError(t, err)

    var raw []byte
    require.NoError(t, tx.QueryRow(ctx, "EXPLAIN (FORMAT JSON) "+query, args...).Scan(&raw))
    var plans []struct{ Plan planNode `json:"Plan"` }
    require.NoError(t, json.Unmarshal(raw, &plans))

    var scans []string
    seqScans(plans[0].Plan, &scans)
    require.Empty(t, scans, "sequential scan of a large table — add the index data-model.md names, or name one:\n%s", raw)
}

func TestListReleasesQuery_UsesIndex(t *testing.T) {
    db := newTestDB(t)
    _, err := db.Exec(context.Background(), `
        INSERT INTO releases (id, project_id, name, created_at)
        SELECT gen_random_uuid(), (g % 20) + 1, 'r' || g, now() - g * interval '1 minute'
        FROM generate_series(1, 5000) g;
        ANALYZE releases;`)
    require.NoError(t, err)
    // sqlc's query text is an unexported const in package db: put this test in that package.
    AssertIndexed(t, db, listReleases, int64(1), time.Now(), uuid.Nil, int32(21))
}
```

Assert on the plan's shape, never on its cost or its timing: both move with the fixture and the
machine, and a test that does not hold on CI gets deleted.

**MySQL 8:** `EXPLAIN FORMAT=JSON`, and fail on any table whose `access_type` is `ALL` among the
large tables; there is no `enable_seqscan`, so the fixture must be large enough (tens of thousands of
rows, `ANALYZE TABLE`) for the optimiser to prefer an index it has.

## 4. When a test is slow

Slow is a measurement. Before touching a timeout, follow
`.claude/skills/dev-stage-protocol/slow-tests.md`.
