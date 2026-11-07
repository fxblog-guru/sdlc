# Blueprint: python-react

A Python API (FastAPI, SQLAlchemy 2, Alembic) and a React SPA in one repository. The SPA half is
the same as in `go-react`: `frontend/` here holds the tree that `go-react.md` §The tree gives for
`web/`, with the same rules, described in its §Frontend rules. This repository uses `frontend/`,
not `web/`, because inside a Python package `web` reads as a module name.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Package layout | [PyPA: src layout vs flat layout](https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/) | the importable package lives under `backend/src/<package>/`, so tests run against the installed package and never the working tree |
| Project metadata | [PyPA: writing pyproject.toml](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/) | one `pyproject.toml` with the ruff, mypy and pytest config; `uv` for the lock |
| Style | [PEP 8](https://peps.python.org/pep-0008/), enforced by [ruff](https://docs.astral.sh/ruff/) (`ruff check` + `ruff format`) | `snake_case` modules and functions, `PascalCase` classes, no wildcard imports |
| Types | [mypy strict](https://mypy.readthedocs.io/en/stable/existing_code.html#introduce-stricter-options) | every public function annotated |
| Tests | [pytest good practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html) | tests outside the package; `tests/unit/` mirrors `src/` |
| Shape | [Ports and adapters](https://alistair.cockburn.us/hexagonal-architecture/) | `domain` → `app` → `adapters`, as in `dev-writing-python-code` §Layering |
| Frontend | [bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md), [Airbnb naming](https://github.com/airbnb/javascript/tree/master/react#naming) | as in `go-react` |

## The tree

```
.
├── backend/
│   ├── src/<package>/
│   │   ├── <domain>/
│   │   │   ├── domain/         entities, value objects, domain exceptions. Imports no fastapi, sqlalchemy or httpx
│   │   │   ├── app/            services (use cases), ports.py (Protocol classes), unit of work
│   │   │   └── adapters/
│   │   │       ├── sql/        SQLAlchemy models, repositories implementing app.ports
│   │   │       └── api/        FastAPI APIRouter, Pydantic request/response schemas
│   │   ├── platform/           errors.py (the RFC 9457 mapper, one handler), config.py, db.py, obs.py, clock.py
│   │   ├── main.py             create_app(): mounts each domain's router, installs the one exception handler
│   │   └── __init__.py
│   ├── migrations/             Alembic: env.py, versions/ (reversible, §7)
│   ├── pyproject.toml  uv.lock  alembic.ini
├── frontend/                   the SPA: src/{app,features,components,hooks,lib,config,types,styles,testing}/
├── tests/
│   ├── unit/<package>/<domain>/   mirrors backend/src; fast, no I/O
│   ├── integration/<domain>/   real database, the real app via httpx.AsyncClient; marker `integration`
│   ├── e2e/  contract/  perf/  fixtures/
│   └── conftest.py
├── deploy/{docker,compose,helm|systemd,terraform}/
├── ops/{runbooks,observability}/
├── scripts/  docs/  dev/  ci/
├── README.md  CONTRIBUTING.md  Makefile  .editorconfig  .env.example  CODEOWNERS
```

The frontend's own unit tests (`*.test.tsx`) stay beside its components, as in every React tree.

## The error boundary

Each domain raises its own exceptions, all subclasses of `platform.errors.AppError`, with a
`kind` and a `code`. `platform/errors.py` installs one FastAPI exception handler that maps the
`kind` to a status and the `code` to the problem `type`. It does this once for the whole app, so
no router catches and translates errors itself. In Python this layout cannot cause an import cycle,
because `platform` imports no domain. Keep it that way, and `layout-check.mjs` checks that you do.

## Rules

```json
{
  "name": "python-react",
  "requiredDirs": ["backend", "frontend", "tests", "deploy", "ops", "docs", "dev"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ["Makefile", "Taskfile.yml"], ".editorconfig", ".env.example", ["CODEOWNERS", ".gitlab/CODEOWNERS", "docs/CODEOWNERS"], "backend/pyproject.toml"],
  "codeRoots": ["backend", "frontend", "tests", "deploy", "scripts", "ci", "dev"],
  "rootCode": [],
  "tests": {
    "root": "tests",
    "tiers": ["unit", "integration", "e2e", "contract", "perf", "fixtures"],
    "rootFiles": ["README.md", "conftest.py", "__init__.py"],
    "placement": [
      { "name": "^test_.*\\.py$|_test\\.py$", "under": ["tests/"], "why": "src layout: Python tests live outside the package, in tests/unit/ or tests/integration/" },
      { "name": "\\.spec\\.ts$", "under": ["tests/e2e/"], "why": "Playwright journeys live in tests/e2e/" }
    ]
  },
  "packageCeiling": 40,
  "alias": { "@/": "frontend/src/" },
  "imports": [
    { "lang": "py", "from": "backend/src/{pkg}/{d}/domain/**", "deny": ["fastapi", "starlette", "sqlalchemy", "httpx", "pydantic_settings", "{pkg}.*.app", "{pkg}.*.adapters"], "why": "domain imports no framework, ORM or client, and no layer above it" },
    { "lang": "py", "from": "backend/src/{pkg}/{d}/app/**", "deny": ["fastapi", "starlette", "{pkg}.*.adapters"], "why": "app declares ports; adapters implement them" },
    { "lang": "py", "from": "backend/src/{pkg}/platform/**", "deny": ["{pkg}.!platform"], "why": "platform imports no domain" },
    { "lang": "ts", "from": "frontend/src/features/{f}/**", "deny": ["frontend/src/features/!{f}/**", "frontend/src/app/**"], "why": "features never import each other; app/ composes them" },
    { "lang": "ts", "from": "frontend/src/components/**", "deny": ["frontend/src/features/**", "frontend/src/app/**"], "why": "shared code never imports a feature" },
    { "lang": "ts", "from": "frontend/src/lib/**", "deny": ["frontend/src/features/**", "frontend/src/app/**"], "why": "shared code never imports a feature" }
  ]
}
```
