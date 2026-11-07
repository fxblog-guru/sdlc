# Refactor guide: brownfield `go-react` to `fullstack-go-react`

A repository on the `go-react` shape, or near it, has `cmd/ internal/ migrations/ web/` loose at
the root, ops split between `ops/` and `deploy/` (or a root `docker-compose.yml`), human docs in
`docs/` and design artifacts in `<root>/docs/`, and often one `internal/http` package holding every
domain's handlers. This guide moves it to `blueprints/fullstack-go-react.md`, one `TASK-NNN` per
step, each with its own review (§13.9 rule 4).

It is written against release-management (module `release-management`, 21 packages under
`internal/`, 122 files in `internal/http`, `ops/systemd/`, a root `docker-compose.yml`,
`scripts/check.sh` driving CI). Replace the names with yours.

## Before step 1

1. The blueprint ADR exists and chooses `fullstack-go-react`, with **Repository model** `monorepo`
   and **Architecture** `modular-monolith` in `DEV-PROFILE §Stacks`. The decision table is filled
   (§13.9 rule 6). `Project maturity` stays `brownfield` until step 6.
2. Run `node <root>/scripts/layout-check.mjs --blueprint fullstack-go-react --maturity brownfield
   --out before.json` and paste every finding into the ADR's deviation table, each with the step
   below that removes it (`Planned move: TASK-NNN`).
3. The main branch is green: `scripts/check.sh` (never two at once on one database).
4. Freeze other merges for steps 1 and 2. They touch every Go import, and a parallel branch
   conflicts on every file. Steps 3–5 can interleave with feature work.

Every step ends with the same three checks, plus its own:

```bash
scripts/check.sh                                  # or the Makefile's test + test-integration + lint
node <root>/scripts/layout-check.mjs --maturity brownfield --since origin/main   # 0 fail; the step's rows gone
git diff --stat -M origin/main | grep -c '=>'     # a move shows as a rename, not delete + add
```

Use `git mv`, one commit for the move and one for the edits it forces, so review reads the second
commit only and `git log --follow` keeps history.

## Step 1 — `backend/`: move the Go module (TASK, size L, no behaviour change)

**Move.** `git mv cmd internal migrations go.mod go.sum .golangci.yml sqlc.yaml backend/`.
Integration tests move in step 6, not here.

**Edit.**

1. Module path. Keep the module name (`module release-management` in `backend/go.mod`) — the
   folder changes, the import path does not, so no `.go` import line changes. Change it only if
   the module name embeds the layout (`…/shop` to `…/shop/backend`); then
   `cd backend && gofmt -l . && go mod edit -module <new>` and rewrite imports with
   `grep -rl '"<old>/' --include=*.go . | xargs sed -i 's#"<old>/#"<new>/#g'`.
2. Relative paths in tests count one level deeper from their package but not from the repo root.
   Find them: `grep -rn '"\.\./' --include=*.go backend/`. In release-management these point at
   `../../dev/api/…/openapi.yaml`, `../../.env.example` and `../../../migrations/…`. Each gains one
   `../` (`../../../dev/api/…`), except paths into `migrations/`, which moved with the code and
   are unchanged.
3. `sqlc.yaml` paths are relative to the file, so they hold. `sqlc diff` from `backend/` proves it.
4. `scripts/check.sh` and `.gitlab-ci.yml`: every `go …` command runs in `backend/`
   (`(cd backend && go test ./...)`). Grep `go test\|go build\|go vet\|golangci\|sqlc\|./internal\|./cmd`
   and fix each hit. Package paths in comments and allow-lists (`internal/markdown`,
   `internal/*/db`) become `backend/internal/…` wherever a path is matched against `git diff`.
5. `Makefile`: `build`, `test`, `lint`, `migrate` run in `backend/`.
6. The Dockerfile's `COPY go.mod go.sum ./` becomes `COPY backend/go.mod backend/go.sum ./`, and
   so on for each `COPY`.
7. `CODEOWNERS`: `/internal/` rules become `/backend/internal/`.

**Verify.** `cd backend && go build ./... && go vet ./... && go test ./...`;
`scripts/check.sh go-integration`; `sqlc diff` clean; the image builds. `layout-check`: the
`top-level-area cmd/`, `internal/` and `migrations/` rows and `missing-dir backend/…` rows are gone.

## Step 2 — `frontend/`: move the SPA and the embed (TASK, size M)

`go:embed` cannot reach outside its module folder, so `web/embed.go` (`//go:embed all:dist`) cannot
embed `frontend/dist` from `backend/`.

**Move.** `git mv web frontend`, then `git mv frontend/embed.go frontend/embed_test.go
backend/internal/platform/spa/` and rename the package `web` to `spa`. Create
`backend/internal/platform/spa/dist/.keep` and gitignore `backend/internal/platform/spa/dist/*`
except `.keep`.

**Edit.**

1. The one import of the old package (`"release-management/web"` in `cmd/server/main.go`)
   becomes `"release-management/internal/platform/spa"`, and `web.Dist()` becomes `spa.Dist()`.
2. `Makefile` `build`: `npm --prefix frontend ci && npm --prefix frontend run build`, then
   `rm -rf backend/internal/platform/spa/dist/* && cp -r frontend/dist/. backend/internal/platform/spa/dist/`
   (keep `.keep`), then `go build`. The Dockerfile does the same in its node stage and copies into
   the Go stage.
3. `scripts/check.sh` and `.gitlab-ci.yml`: `cd web` becomes `cd frontend`; cache keys and
   artifact paths (`web/package-lock.json`, `web/node_modules`, `web/dist`) likewise;
   `SDLC_UI_SRC: web/src` becomes `frontend/src`; the coverage path filter
   `s#^web/\(src/…\)#` becomes `s#^frontend/\(src/…\)#`.
4. `frontend/vite.config.ts`: `outDir` stays `dist`. Any alias or path that climbed to the repo
   root (`../dev/api/…` for an OpenAPI codegen) is unchanged, because the depth is the same.
5. `DEV-PROFILE`: `<root>/scripts/design-system.mjs scan web/src` and every `web/src` path become
   `frontend/src`.

**Verify.** `make build` produces a binary that serves `/` from the embedded SPA on a fresh clone
(`git clean -xfd` first); before `npm run build` it answers SPA routes with its 503 problem, as
before. `npm --prefix frontend test`, `npx eslint .` in `frontend/`, the Playwright smoke in
`tests/e2e/`. `layout-check`: `top-level-area web/` gone.

## Step 3 — `ops/`: one home for sysops (TASK, size S)

**Move.**

| From | To |
|---|---|
| `deploy/docker/`, a root `Dockerfile` | `ops/deploy/docker/` |
| `docker-compose.yml`, `deploy/compose/` | `ops/deploy/compose/compose.yaml` |
| `ops/systemd/`, `deploy/systemd/` | `ops/deploy/systemd/` |
| `deploy/helm/`, `deploy/terraform/` | `ops/deploy/helm/`, `ops/deploy/terraform/` |
| `ops/observability/dashboards/` | `ops/dashboards/` |
| `ops/observability/alerts/` | `ops/alerts/` |
| collector and per-environment config | `ops/config/` |
| `ops/runbooks/` | stays |

Create `ops/README.md` with the five folders, and empty folders with a `README.md` each where
nothing exists yet (release-management has no alerts or dashboards in the repo; the README says
where they live today).

**Edit.** Compose's relative mounts (`./scripts/dev-db-roles.sql`) become `../../../scripts/…`, or
set `name:` and run it with `--project-directory .` from `make up`. `make up` points at
`ops/deploy/compose/compose.yaml`. systemd unit files referenced by a path in a runbook or an
install script get the new path. Every alert rule names a runbook in `ops/runbooks/`.

**Verify.** `make up` starts the local stack; `docker compose -f ops/deploy/compose/compose.yaml
config` exits 0; `systemd-analyze verify ops/deploy/systemd/*.service` where available;
`grep -rn "ops/systemd\|docker-compose.yml\|deploy/" --include=*.md --include=*.sh --include=*.yml .`
finds no stale path outside `<root>/` history. `layout-check`: no `single-home deploy/`, no
`missing-dir ops/…`.

## Step 4 — `docs/`: one root for human docs (TASK, size S)

**Move.** Human-facing docs found anywhere else (a `backend/docs/`, a `frontend/README` grown into a
guide, operator notes inside `ops/systemd/README.md`) move to `docs/` (`docs/operators/`,
`docs/onboarding.md`). Write `docs/architecture.md` from the current design's context and
container view if it does not exist.

**Do not move** `<root>/docs/` (design tokens, UI patterns, presets): it is the bundle's artifact
folder (§2) and its scripts read it there. `docs/README.md` links it and the ADR index
(`<root>/design/adr/`), and copies nothing from either.

**Verify.** Every link in `docs/` and the root `README.md` resolves (a markdown link check, or
`grep -o '](\([^)]*\))' -r docs README.md` and test each path). `layout-check`: no `single-home …/docs/`,
`missing-file docs/architecture.md` gone.

## Step 5 — split `internal/http` by domain (one TASK per domain, size S–M each)

Do this after step 1, one domain per task, smallest domain first. Every task leaves the build green
and the API byte-identical.

**Task 5.0 — make the mapper a leaf (once).** Move `Problem`, `WriteError`, `WriteJSON`,
pagination and ETag helpers from `internal/http` to `backend/internal/platform/httpx`. Replace the
switch over every domain's errors with `apperr.Kind` → status and `apperr.Code` → problem `type`
(`go-react.md` §HTTP). Domains return `apperr` errors; a domain that returns its own sentinel gets
a wrapper in its `domain/` first. Verify: `tests/contract/` (or the OpenAPI contract test) passes
unchanged; `grep -rn "internal/http\"" backend/internal/platform` finds nothing.

**Task 5.1 — the router to the composition root (once).** Move the router, middleware mounting
and `http.Server` construction to `backend/internal/server`; middleware to
`backend/internal/platform/middleware`. `internal/http` now holds only handlers. Verify: the
integration suite; `go list -deps ./internal/platform/... | grep internal/http` finds nothing.

**Task 5.N — one domain's handlers.** For domain `<d>` (release-management order: `share`,
`watch`, `discussion`, `attachment`, `backlog`, `bug`, `suite`, `gonogo`, `deploy`, `release`,
`project`, `identity`, `authz`):

1. `git mv backend/internal/http/<d>_handlers.go backend/internal/<d>/adapters/http/handlers.go`
   and its `_test.go` (handler tests with `httptest` stay beside the handlers).
2. Package `http`; export `Routes(r *httpx.Router, svc *app.Service)`; `server` calls it in place
   of the old registration.
3. The handler calls its own domain's `app` only. A handler that reached a repository or another
   domain gets a port on its `app` instead.
4. Request and response types move with it and live only there.
5. `<d>_integration_test.go` files move to `backend/tests/integration/<d>/` (step 6 does the rest).

Verify, every domain: `go build ./... && go test ./internal/<d>/... ./internal/server/...`; the
contract test; `layout-check` shows no `import-direction` for `backend/internal/<d>/` and the
package-ceiling count for `internal/http` falls. The last task deletes `backend/internal/http`, and
`single-home backend/internal/http/` disappears.

## Step 6 — tests and the switch to greenfield checks (TASK, size M)

**Move.** Go integration tests (`*_integration_test.go`, `//go:build integration`) to
`backend/tests/integration/<domain>/`, using the exported API only. Playwright, contract, perf and
shared fixtures to `tests/{e2e,contract,perf,fixtures}/` at the root. A test that needs an
unexported symbol stays a unit test in its package, or the symbol becomes part of the domain's API.

**Edit.** `scripts/check.sh go-integration` runs `go test -tags=integration ./tests/integration/...`
in `backend/`; the coverage allow-lists follow. Delete the ADR deviation rows this guide removed;
whatever remains has a reason and a `Planned move: none`.

**Verify.** The integration suite runs the same number of tests as before the step (compare
`go test -tags=integration -json ./... | grep -c '"Action":"pass"'` before and after).
`layout-check --maturity greenfield` exits 0, or every finding left is an accepted deviation; then
`Project maturity` may stay `brownfield` (it governs more than layout) but the ADR's Compliance
line drops `--since`.

## Order, and what can run in parallel

```
1 backend/ ──► 2 frontend/ ──► 6 tests
     │
     ├──► 5.0 mapper ──► 5.1 router ──► 5.N one per domain (sequential; each small)
     │
3 ops/  and  4 docs/  are independent of everything: any time, in any order
```

Rollback is `git revert` of the step's two commits; no step changes data or the API.
