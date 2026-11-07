# Repository blueprints

A blueprint is the one recommended tree for a stack combination: every top-level folder, what it
holds, the backend layering, and the named standards it follows. `DEV-PROFILE §Stacks` declares
one as **Repository blueprint**; G2 records it as an ADR (§13.9); G6 scaffolds it; `layout-check.mjs`
checks it. Each blueprint ends with a `## Rules` block of JSON. That block is what the script reads.
Change the tree and its rules in the same commit.

| Blueprint | For | File |
|---|---|---|
| `go-react` | a Go API plus a React SPA in one repository (one binary, one deploy) | `go-react.md` |
| `python-react` | a Python (FastAPI) API plus a React SPA | `python-react.md` |
| `nextjs` | a Next.js App Router application, its server code included | `nextjs.md` |
| `web-api-ts` | TypeScript, client and server as separate deployables: `apps/web` (UI only) and `apps/api` (domain, database, jobs) talking over `packages/contract`, two images | `web-api-ts.md` |
| `go-service` | a Go service with no UI (API, worker, consumer) | `go-service.md` |
| `fullstack-go-react` | a Go API plus a React SPA, one binary, with `backend/ frontend/ ops/ docs/ tests/` and nothing loose at the root | `fullstack-go-react.md` |
| `service-go` | **V2 — schema only.** One service of a polyrepo: its own `api/` contract, `ops/` and `docs/` | `service-go.md` |
| `electron` | **preview.** A desktop app: main, preload, renderer; IPC as the contract | `electron.md` |
| `vscode-extension` | **preview.** A VS Code extension: contributions as the contract, webviews | `vscode-extension.md` |
| `cli` | **preview.** A CLI or library: flags, exit codes and `--json` as the contract | `cli.md` |
| `ai-app` | **preview.** Prompts, retrieval, tools and an eval set, beside the app's web blueprint | `ai-app.md` |
| `react-native` | **preview.** A mobile app on React Native | `react-native.md` |

## Choosing, from the two axes

`DEV-PROFILE §Stacks` declares **Repository model** and **Architecture**, and G2 decides both in the
blueprint ADR with the decision table in DEV-CONTRACTS §13.9 rule 6. The blueprint follows:

| Repository model | Architecture | Go + React | Go, no UI | Status |
|---|---|---|---|---|
| `monorepo` | `modular-monolith` (default) | `fullstack-go-react` | `go-service` | MVP, checked |
| `monorepo` | `monolith` | `fullstack-go-react`; `go-react` for a small repo that already has its shape | `go-service` | checked |
| `monorepo` | `microservices` | one `service-go` tree per folder under `services/<name>/`, a shared `frontend/` | — | V2 — not checked yet |
| `polyrepo` | `microservices` | `service-go` per service repo; the SPA is its own repo | `service-go` | V2 — schema only, one repo at a time |
| `polyrepo` | `modular-monolith` | the product repo takes `fullstack-go-react`; libraries are versioned modules in `platform` | — | V2 |

Python and Next.js products use `python-react` and `nextjs` for `monorepo` + `monolith` or
`modular-monolith`; they have no polyrepo variant yet. A TypeScript product whose owner chose
client and server as separate deployables (the `Shape:` decision, §18.7) uses `web-api-ts`. A blueprint declares the pairs it serves in
its rules as `fits`, and `layout-check.mjs` fails `blueprint-fit` when the profile names an axis
the blueprint does not serve. A blueprint without `fits` (the four older ones) checks no axis.

Pick by what ships. Two deployables with separate release cycles are two repositories, or one of
these per top-level folder of a monorepo, each with its own blueprint row.

`fullstack-go-react` and `service-go` override the shared ops layout below with one home,
`ops/{deploy,config,alerts,dashboards,runbooks}/`, and keep Go integration tests inside the
module (`backend/tests/integration/`), because Go cannot import `internal/` from outside it.
Their own files are authoritative where they differ from this page.

## What every blueprint shares

These parts are the same in the four original blueprints (the two newer ones override ops and Go integration tests, above). Each blueprint's tree repeats them so it can be read alone.

**Tests.** Unit tests sit beside the code they test (`x_test.go`, `Thing.test.tsx`). Python is the
one exception: under the PyPA src layout its unit tests go in `tests/unit/`, mirroring `src/`
([pytest good practices](https://docs.pytest.org/en/stable/explanation/goodpractices.html)). Every
test that crosses a process or package boundary lives under the top-level `tests/`:

| Folder | Holds | Tool |
|---|---|---|
| `tests/integration/` | the service against a real database and its real router, by domain | `go test -tags=integration` · `pytest -m integration` |
| `tests/e2e/` | browser journeys, `*.spec.ts` | Playwright |
| `tests/contract/` | the running API checked against the published OpenAPI document | Schemathesis or a generated client |
| `tests/perf/` | load scripts and their budgets | k6 |
| `tests/fixtures/` | seed data, golden files and recorded responses that more than one tier shares | — |

A Go integration test is `_integration_test.go` or carries `//go:build integration`. Either way it
goes under `tests/integration/`. Go lets code at the module root import `internal/`
([Go 1.4 internal packages](https://go.dev/doc/go1.4#internalpackages)), so those tests can use the
real constructors. They must use the exported API, and that is deliberate: they test what callers see.

**Ops.** How the system ships and how it runs are kept apart:

| Folder | Holds | Standard |
|---|---|---|
| `deploy/docker/` | `Dockerfile` (multi-stage, distroless or slim runtime) | [Dockerfile best practices](https://docs.docker.com/build/building/best-practices/) |
| `deploy/compose/` | `compose.yaml` for the local stack, which `make up` wraps | [Compose application model](https://docs.docker.com/compose/intro/compose-application-model/) |
| `deploy/helm/<app>/` | the chart, when the target is Kubernetes | [Helm chart best practices](https://helm.sh/docs/chart_best_practices/) |
| `deploy/terraform/` | `modules/` and `envs/<env>/`, when infrastructure is code | [Terraform standard module structure](https://developer.hashicorp.com/terraform/language/modules/develop/structure) |
| `deploy/systemd/` | unit files, when the target is a VM | — |
| `.gitlab-ci.yml` | the pipeline, at the root where GitLab looks for it; past ~150 lines it `include:`s files from `ci/` | [GitLab CI includes](https://docs.gitlab.com/ci/yaml/includes/) |
| `ops/runbooks/` | the living runbook per service. G11 folds each change's `<root>/monitoring/<slug>/runbook.md` into it | — |
| `ops/observability/` | `dashboards/`, `alerts/`, collector config (`otel-collector.yaml`) | [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/configuration/) |

**Docs.** `docs/` is for people who use or run the system: `architecture.md` (the context and
container view), onboarding, and operator guides. ADRs stay where §2 puts them,
`<root>/design/adr/`, in [Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
`docs/README.md` links that folder and copies nothing from it. `<root>/` holds the sdlc artifacts and
nothing else (§2).

**Root files.** Each one is required:

| File | Why |
|---|---|
| `README.md` | what this is, how to run it in three commands, where to read next |
| `CONTRIBUTING.md` | branch, commit and review rules, and the `make` targets |
| `Makefile` (or `Taskfile.yml`) | the same verbs in every repo: `build`, `test`, `test-integration`, `lint`, `fmt`, `up`, `migrate` |
| `.editorconfig` | indentation and line endings, the same in every editor ([EditorConfig](https://editorconfig.org)) |
| `.env.example` | every variable the process reads, with a safe placeholder, and never a secret ([twelve-factor config](https://12factor.net/config)) |
| `CODEOWNERS` | at the root, `.gitlab/` or `docs/`: who reviews which folder ([GitLab code owners](https://docs.gitlab.com/user/project/codeowners/)) |

Every top-level folder carries a `README.md` of a few lines: what belongs here and what does not.
G6 writes them while it scaffolds the tree.

**Forbidden names.** No package or folder is named `utils`, `util`, `helpers`, `helper`, `common`
or `misc`. A name that says nothing about its contents collects everything. Name a package for what
it provides (`money`, `pagination`, `clock`), as [Go's package-names guidance](https://go.dev/blog/package-names)
and the [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments#package-names) say.

**Package size.** If one package holds more than 40 non-test files, it has more than one reason to
change. `layout-check.mjs` warns. Split it along the domain, never along the layer.

## Brownfield

A repository that predates its blueprint keeps its shape. `layout-check.mjs --maturity brownfield`
reports every difference as advisory. The blueprint ADR copies each accepted one into a deviation
table, one row per `` `<rule> <path>` ``, and the script then lists it as accepted. Two findings
still fail, for anything created after `--since <ref>`: a new top-level area the blueprint does
not have, and a new grab-bag folder. New areas follow the blueprint. Old areas move only by a
planned refactor task (§13.9 rule 4).

## Running the check

```bash
node <root>/scripts/layout-check.mjs                      # reads blueprint, maturity and ADR from DEV-PROFILE
node <root>/scripts/layout-check.mjs --blueprint go-react --maturity greenfield --root .
node <root>/scripts/layout-check.mjs --maturity brownfield --accept <root>/design/adr/ADR-012-repository-blueprint.md --since origin/main
```

Exit `0` means nothing failed. Exit `1` means a finding failed. Exit `2` means a usage error or an
unknown blueprint. With Go installed it runs `go list -json ./...` to find imports; without Go it
reads the `import` blocks.
