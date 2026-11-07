# Query checks in Python — the reference for `dev-writing-python-code` §Query budgets

Two tests per change that touches the database (DEV-CONTRACTS §13.7), and one middleware that lets
the check-time smoke see the same number. SQLAlchemy 2.x on Postgres; adapt names to the
repository (`<root>/knowledge/conventions.md` wins), keep the assertions.

## 1. A per-request query counter (SQLAlchemy event)

```python
# app/platform/dbcount.py
from contextvars import ContextVar
from sqlalchemy import event
from sqlalchemy.engine import Engine

_count: ContextVar[list[int] | None] = ContextVar("query_count", default=None)


def install(engine: Engine) -> None:
    """Count every statement run while a counter is active. Async: pass engine.sync_engine."""

    @event.listens_for(engine, "before_cursor_execute")
    def _count_one(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        box = _count.get()
        if box is not None:
            box[0] += 1


class counting:
    """`with counting() as c: ...; c.n` — the statements run inside the block."""

    def __enter__(self) -> "counting":
        self._box = [0]
        self._token = _count.set(self._box)
        return self

    def __exit__(self, *exc: object) -> None:
        _count.reset(self._token)

    @property
    def n(self) -> int:
        return self._box[0]
```

The response header, for perf-smoke.mjs — mount it outside production only:

```python
# FastAPI / Starlette
@app.middleware("http")
async def query_count_header(request: Request, call_next):
    with counting() as c:
        response = await call_next(request)
    response.headers["X-Query-Count"] = str(c.n)
    return response
```

A `ContextVar` follows the request through `await` and into tasks created from it; a thread-pool
call made with `run_in_executor` without `contextvars.copy_context()` is invisible to it — which is
also a sign the call escapes the request's session.

## 2. The query-budget test — N+1 caught by a number

```python
# tests/integration/test_releases_queries.py
import pytest

MAX_QUERIES = 4  # openapi.yaml listReleases x-perf.max_queries — change it there, not here


@pytest.mark.integration
@pytest.mark.parametrize("rows", [3, 20])
def test_list_releases_query_budget(client, seed, rows):
    seed.releases(rows, scope_items=8)
    res = client.get("/v1/releases", params={"limit": 20})
    assert res.status_code == 200
    assert int(res.headers["X-Query-Count"]) <= MAX_QUERIES


@pytest.mark.integration
def test_list_releases_query_count_does_not_grow_with_rows(client, seed):
    def count(rows: int) -> int:
        seed.reset()
        seed.releases(rows, scope_items=8)
        return int(client.get("/v1/releases", params={"limit": 20}).headers["X-Query-Count"])

    assert count(3) == count(20), "a query per row (N+1): add selectinload/joinedload"
```

Without HTTP, wrap the service call: `with counting() as c: svc.list_releases(...)`, then assert
`c.n`. Prove the counter once on a call known to issue exactly two statements — a counter that
returns `0` passes every budget.

## 3. The plan test — every new query uses an index

```python
# tests/integration/plan.py
import json
from sqlalchemy import text
from sqlalchemy.orm import Session

LARGE_TABLES = {"releases", "scope_items", "activity_log"}  # the growing tables in data-model.md


def seq_scans(node: dict) -> list[str]:
    found = [node["Relation Name"]] if node.get("Node Type") == "Seq Scan" and node.get("Relation Name") in LARGE_TABLES else []
    for child in node.get("Plans", []):
        found += seq_scans(child)
    return found


def assert_indexed(session: Session, stmt, params: dict | None = None) -> None:
    """Fail when stmt would scan a large table sequentially, given every index that exists."""
    sql = str(stmt.compile(session.bind, compile_kwargs={"literal_binds": True})) if not isinstance(stmt, str) else stmt
    with session.begin_nested():
        session.execute(text("SET LOCAL enable_seqscan = off"))
        raw = session.execute(text(f"EXPLAIN (FORMAT JSON) {sql}"), params or {}).scalar_one()
    plan = (raw if isinstance(raw, list) else json.loads(raw))[0]["Plan"]
    scans = seq_scans(plan)
    assert not scans, f"sequential scan of {scans}: add the index data-model.md names, or name one\n{json.dumps(plan, indent=1)}"
```

```python
@pytest.mark.integration
def test_list_releases_query_uses_index(session):
    session.execute(text("""
        INSERT INTO releases (id, project_id, name, created_at)
        SELECT gen_random_uuid(), (g % 20) + 1, 'r' || g, now() - g * interval '1 minute'
        FROM generate_series(1, 5000) g"""))
    session.execute(text("ANALYZE releases"))
    assert_indexed(session, repo.list_releases_stmt(project_id=1, limit=21))
```

A few thousand rows built by `generate_series` is the small-but-realistic fixture: under a second,
and `enable_seqscan = off` makes a surviving `Seq Scan` mean *no usable index exists* rather than
*the table was small*. Assert the plan's shape, never its cost or timing.

## 4. When a test is slow

Slow is a measurement. Before touching a timeout, follow
`.claude/skills/dev-stage-protocol/slow-tests.md`.
