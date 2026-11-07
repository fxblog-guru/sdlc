# Scaffold tasks — G6, greenfield

When the blueprint ADR is new and the tree does not exist yet, the plan's first tasks build the tree
(§13.9 rule 2). Every later task then has a place to put its files. This happens once per
repository. After that, the blueprint is the place to look up.

## The tasks

Each one fits in one sitting, traces to the blueprint `ADR-NNN` (not to a REQ), and is finished
when the stated command exits 0.

| Order | Task | Files | Test |
|---|---|---|---|
| 1 | Root files | `README.md`, `CONTRIBUTING.md`, `Makefile` (`build test test-integration lint fmt up migrate`), `.editorconfig`, `.env.example`, `CODEOWNERS` | `make lint` runs |
| 2 | Top-level folders, each with a `README.md` of a few lines: what belongs here and what does not | every `requiredDirs` entry of the blueprint's `## Rules` except `<root>/` | `layout-check.mjs` reports no `missing-dir` and no `folder-readme` |
| 3 | The backend skeleton: `cmd/<binary>/main.go`, `internal/platform/{apperr,httpx,config,obs}/`, `internal/server/` with a health route | the paths the blueprint's tree names | `go build ./...` (or the stack's build) and the health handler test |
| 4 | The first domain, empty but layered: `internal/<domain>/{domain,app,adapters/{postgres,http}}/` with one port and one route | the slice the riskiest REQ needs | `layout-check.mjs` has no `import-direction` finding |
| 5 | The client skeleton: `web/src/{app,features,components,lib,styles}/`, with the ESLint `import/no-restricted-paths` zones from the blueprint | `web/` | `npm run build`, `npm run lint` |
| 6 | Test tiers: `tests/{integration,e2e,contract,perf,fixtures}/` each with a README; one integration test against the health route | `tests/` | `make test-integration` |
| 7 | Walking skeleton: `deploy/docker/Dockerfile`, `deploy/compose/compose.yaml`, and from `<root>/_templates/skeleton/` the `.gitlab-ci.yml` (test → build → publish → deploy_staging → deploy_production), `ops/deploy.sh` and `ops/compose.prod.yaml`, adapted to the host `## Deploy target` names | `deploy/`, `ci/`, `ops/`, `.gitlab-ci.yml` | the pipeline runs green and the health route answers on `staging` |

Tasks 3 and 4 may be one task when the first domain is small. Tasks 5 to 7 can run in parallel
lanes (`web-shell`, `tests`, `ops`), because their file sets do not overlap.

## Brownfield

Plan no scaffold and no moves. Plan a scaffold task only for a top-level area the blueprint ADR
adds in this change. Place each file of every other task with `dev-resolving-code-placement`.
