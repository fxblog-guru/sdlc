---
name: dev-writing-python-code
description: Use in /sdlc-implement (G7) for .py targets: strict typing, exception chaining, async traps, SQLAlchemy N+1, ruff/mypy/bandit/pytest.
---

# Writing Python — G7

Adapted from `python-backend` and `python-coding-standard` in `gitlab.com/agentic-fx/skills`
@ `8556e8f` (`docs/skill-sources.md`). What was kept is the tooling stance — ruff, strict mypy,
bandit, `uv` — and the layering discipline. What was dropped is the bootstrap workflow and the
four-layer directory it mandates: layout here comes from `DEV-PROFILE §Stacks`, and in a brownfield
repo from `<root>/knowledge/conventions.md`, because a skill that relocates an existing codebase to
match its own diagram is a refactor nobody asked for.

> `DEV-CONTRACTS.md` §13.2 (backend standards), §13.1 (what the handler owes the caller), §13.5
> (what it emits), §13.6 (what it refuses).
> The repository's tree and layering come from its blueprint, `dev-resolving-code-placement/blueprints/` (§13.9).

Python's characteristic G7 failures are not style. They are the blocking call inside `async def`,
the exception chain thrown away by `raise X()` instead of `raise X() from exc`, and the ORM query
that is one line long and eleven round trips deep.

## Typing is the cheapest review you get

Every function signature is annotated, including `-> None`. mypy runs in strict mode
(`disallow_untyped_defs = true`), and an untyped function is a hole strict mode cannot see into —
one missing annotation silently unchecks everything it touches.

Use built-in generics (`list[str]`, `dict[str, int]`), `T | None` over `Optional[T]`, and a
`TypedDict` or dataclass instead of passing `dict[str, Any]` between layers. Every `Any` costs a
comment saying why; every `# type: ignore` carries its error code (`# type: ignore[arg-type]`) so
that a bare ignore cannot quietly absorb a second, real error later.

## Exceptions

**Never a bare `except:`** — it catches `KeyboardInterrupt` and `SystemExit` and turns a shutdown
into a hang. **Never `except Exception: pass`**; if there is genuinely nothing to do, log at the
level that matches and say why in one comment.

**Always chain.** `raise JobNotFoundError(job_id) from exc` keeps the original traceback; `raise
JobNotFoundError(job_id)` inside an `except` block throws away the line that would have told you
which query failed, and leaves `During handling of the above exception, another exception
occurred` in the log — which reads as a bug in your error handling rather than the cause.

Define domain exceptions in the domain layer and map infrastructure exceptions to them at the
boundary that owns the technology:

```python
try:
    row = await session.execute(stmt)
except IntegrityError as exc:
    raise DuplicateAssignmentError(job_id=job_id) from exc
```

§13.2 asks for exactly **one** boundary that turns a domain exception into the §13.1 RFC 9457
response. In FastAPI that is an exception handler, not a `try/except` in every route; the moment
two places construct the error body, the two shapes drift and a client starts parsing both.
The status table, the mapper and the one `FieldErrors` are in `dev-writing-go-code`
[error-boundary.md](../dev-writing-go-code/error-boundary.md), whose shape carries over to Python (template `<root>/_templates/code/python/fielderr.py`).

**Do not use `assert` for runtime validation.** `python -O` removes it, so a security check written
as an assert is a check that does not exist in the deployment that matters.

## Async — where the load-test surprises live

**A blocking call inside `async def` stalls the entire event loop**, not just that request. The
usual offenders are `requests`, `time.sleep`, a sync database driver, and `open()` on a slow mount.
Use `httpx.AsyncClient`, `asyncio.sleep`, an async driver; push genuinely blocking work through
`asyncio.to_thread`.

**Timeouts are not default.** `httpx` defaults to 5 seconds, `aiohttp` to none at all. §13.2 wants
an explicit timeout on every outbound call, with a retry and jitter where the dependency can be
slow. Wrap a whole operation with `async with asyncio.timeout(...)` when the budget belongs to the
operation rather than to one request.

**`asyncio.gather(..., return_exceptions=True)` returns exceptions as results.** If nobody inspects
the list, the failure is now a value nobody looked at — the concurrency equivalent of `except: pass`.

**A bare `asyncio.create_task(...)` can be garbage-collected mid-flight.** Keep a reference (a set
the task removes itself from on done) or await it. Fire-and-forget that vanishes under load is
extremely hard to diagnose after the fact.

**Cancellation:** never swallow `asyncio.CancelledError`. Catch it only to clean up, then re-raise.

## Layering

Dependencies point inward: presentation → application → domain, with infrastructure implementing
interfaces the inner layers define. The domain imports no framework and no ORM. The practical test
is one grep: if `domain/` imports `fastapi`, `sqlalchemy` or `httpx`, the layering has already
failed, and the cost lands the first time somebody wants the same rule in a worker with no HTTP.

Queries return DTOs, not ORM entities. Returning an entity from a read path hands the caller a
live session-bound object whose lazy attributes fire queries wherever it is rendered — usually in a
template, usually in a loop.

## Database

**N+1 is the default outcome of lazy loading.** A list endpoint that loops over jobs and reads
`job.engineer.name` issues one query per row. Use `selectinload` / `joinedload` explicitly, and
name the supporting index in `data-model.md` (§13.2). Echo SQL locally once and count the
statements — the number is the finding.

Session scope is per request or per unit of work, and the transaction is scoped at the service
boundary, never spanning an outbound HTTP call. Parameterised queries only; an f-string in SQL is a
`BLOCKER` at review (§13.6), and `text()` with interpolation is the same bug with extra steps.

### Query budgets (§13.7)

Every endpoint has `x-perf` in the contract; the tests hold the code to it at G7:

1. **Count statements per request** with a `before_cursor_execute` listener and a `ContextVar`,
   reported in `X-Query-Count` outside production. Each integration test of an endpoint asserts the
   count is within `x-perf.max_queries` **and equal at 3 rows and 20** — the N+1 catch.
2. **`EXPLAIN (FORMAT JSON)` every new or changed query** on a few thousand `generate_series` rows
   with `SET LOCAL enable_seqscan = off`; fail on a `Seq Scan` of a table `data-model.md` calls large.

The listener, the middleware and both tests: `query-checks.md` beside this file. A slow test is
investigated for a product cause before any timeout changes:
`.claude/skills/dev-stage-protocol/slow-tests.md`.

## Common traps the linter will not always catch

**Mutable default arguments** (`def f(items: list[str] = [])`) share one list across every call.
Use `None` and build inside. Same for dataclass fields — `field(default_factory=list)`.

**A module-level constant that is mutable** is global state with a friendly name.

**`datetime.now()` without a timezone.** Store and compare aware UTC datetimes; naive datetimes
compare fine and are wrong twice a year.

**`logging` with f-strings** (`logger.info(f"user {uid} ...")`) defeats structured logging and
interpolates even when the level is off. §13.5 wants one structured event per line, through one
API copied from `<root>/_templates/code/python/obs.py` (DEV-PROFILE `Event API`: `obs.event`):

```python
obs.event("job.assignment_created", job_id=job_id, engineer_id=engineer_id)
```

It adds the trace, request and user ids, redacts secret and PII keys, and its `Requests` ASGI
middleware writes `http.request_completed` and echoes `X-Request-Id`. No full request bodies.
`print()` and a bare `logger.info("x.y")` are not logging here.

## Tests

`pytest`, with `parametrize` instead of a loop inside one test — a loop reports one failure and
hides the other four cases. `pytest.raises(DuplicateAssignmentError, match="...")` rather than a
bare `raises`, so a different exception of the right class cannot pass.

Unit tests touch no network and no real database; fake the port, do not mock the ORM's internals —
a test that patches `Session.execute` asserts the shape of SQLAlchemy, not of your code. Integration
tests use a real (containerised) database and carry the marker the repo already uses
(`pytest -m integration`) so G8 can run the tiers separately.

Control the clock (`freezegun` or an injected clock) rather than sleeping. Every `time.sleep` in a
test is a flake G8 will report as a finding rather than retry away.

**Name the id, and do not buy time (§13.10).** A test that proves an `AC-NNN` or a `UB-NNN` names it
in its docstring or a comment (`# AC-109: 422 keeps the input`); `trace.mjs <slug> --check` must
exit 0 before handback. `@pytest.mark.timeout`, `flaky` or `--reruns` needs `# slow-test: <cause>`
beside it; otherwise fix the cause.

## Toolchain — run these before you hand over

| Tool | Command | Catches |
|---|---|---|
| format | `ruff format --check .` | the format gate at G8, exit-code binary |
| lint | `ruff check .` | `B006` mutable defaults, `E711` `== None`, unused, import order |
| types | `mypy .` (strict) | the annotation hole, the `None` that was not handled |
| security | `bandit -r src/` | `eval`, `assert` as validation, hardcoded secrets |
| tests | `pytest --cov` | the number G8 measures per changed module |
| deps | `pip-audit` | §13.6's dependency gate |

The repo's `pyproject.toml` configuration wins over any default above.

## What a reviewer will grep for

| Grep | What it usually means |
|---|---|
| `except Exception` / `except:` | a swallowed failure, or a retry loop that hides a bug |
| `raise ` inside `except` without ` from ` | a discarded traceback |
| `# type: ignore` with no `[code]` | an ignore that will absorb the next real error |
| `Any` in a signature | a type boundary that gave up |
| `requests.`, `time.sleep(` inside `async def` | a blocked event loop |
| `create_task(` with no reference kept | a task that can be collected mid-flight |
| an f-string next to `execute(` or `text(` | SQL injection |
| `print(` in `src/` | logging that will not survive production |
| `assert ` outside `tests/` | a check `python -O` deletes |
| `.all()` with no `limit` | an unbounded result set (§13.1) |
| an endpoint test with no `X-Query-Count` assertion, a new query with no `assert_indexed` | an unbudgeted endpoint, an unproved index (§13.7) |

## Do not

Write the migration (`dev-writing-migrations`), design the schema (G3) or the API contract (G4).
Introduce a dependency `architecture.md` did not name. Reformat or re-layer files the task did not
touch — it buries the change in the diff, and the reviewer reads what is in front of them.
