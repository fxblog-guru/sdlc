# DEV-PROFILE.md — agentic-fx-dev configuration

Every agent, command, and skill in this bundle reads this file **first**. Fill it in for your
project; keep the section headings exactly as written — skills reference them by name
(e.g. "DEV-PROFILE §Stacks"). Values marked `(default)` are assumed when left untouched.

A value that is required by a stage and still a `<placeholder>` is a **project setup error**:
the stage stops with a `> **Project setup required:**` callout naming the section. It never guesses.

## Project

- **Name:** `<your product name>`
- **One-liner:** `<what the product does>`
- **SDLC root:** `.sdlc` (default) — the process root: every artifact this bundle writes (reviews,
  evidence, scripts, templates) lives under this folder, out of the product's tree. `dev` is accepted
  and is what projects installed before 1.6.0 use. Left at `(default)`, the scripts take `.sdlc/` or
  `dev/`, whichever exists; `node <root>/scripts/migrate-root.mjs --to .sdlc --write` moves one
  (DEV-CONTRACTS §2). The older label `Dev root` is still read.
- **Source root:** `.` (default) — where production code lives (`src/`, `cmd/`, `app/`, …).
- **Artifact language:** `en` (default) — the language skills write artifact PROSE in.
  Structural tokens stay English regardless — headings, ids (`REQ`/`ADR`/`TASK`/`CR`/`MIG`),
  table columns, verdict and status tokens — because gates match them byte-exact (see DEV-CONTRACTS.md §1).
- **Id prefixes:** `<none>` — id kinds this project adds to DEV-CONTRACTS §1.1, each with its owner
  doc (e.g. `NY` for a G1 increment list). An unregistered prefix is `warn` W091.
- **Tracker:** `none` (default) — `<none | jira | azure-devops | gitlab>`, key format `<e.g. PROJ-1234>`.
  Adapters are pluggable (DEV-CONTRACTS §14); a missing one degrades to `none` with a warning rather
  than blocking a gate.
- **Project maturity:** `<greenfield | brownfield>` — **this is not a label, it changes the gates.**
  In `brownfield`, the obligations in DEV-CONTRACTS §16.4 become gate conditions: "extend what exists
  or build new?" must be answered with evidence at G2, a design contradicting an existing ADR must
  supersede it in writing, `impact.md` must name everything the change touches, and code placement
  comes from `knowledge/conventions.md` rather than from taste.
- **Default change class:** `change` (default) — `<initiative | change | fix | refactor | spike | fast>`, the class assumed when
  `/sdlc-intake` is run without one (DEV-CONTRACTS §15.1). It decides which gates run at all, so a
  one-line fix does not cost five reviewer runs whose only output is "N/A".

## Stacks

Only the rows marked `yes` are active. A stage that meets code from a disabled stack stops and
asks — it never improvises a convention.

| Stack | Enabled | Version | Implementation skill | Unit test tool |
|---|---|---|---|---|
| `go` | yes | `<a supported release>` | `dev-writing-go-code` | `go test` + `testify` (default) |
| `python` | yes | `<3.12>` | `dev-writing-python-code` | `pytest` |
| `react` | yes | `<19>` | `dev-writing-react-code` | `vitest` + Testing Library |
| `nextjs` | yes | `<15, App Router>` | `dev-writing-nextjs-code` | `vitest` + Playwright component |
| `sql` | yes | — | none for queries (the calling stack's skill covers them); migrations: `dev-writing-migrations` | tested via integration tier |

**Versions.** Pin a release the vendor still supports — for Go, one of the newest two minor releases,
since only those get security fixes. Check end of life when you fill this in (go.dev/doc/devel/release),
and write the exact version (`1.N`) into `go.mod` and CI rather than here only.

- **Product type:** `web` (default) — `<web | desktop | mobile | extension | cli | library | ai | data | game | embedded>`.
  What ships. It decides what release and operate mean (G9–G11) and which pack applies.
  `doctor.mjs` prints each stack's coverage tier, `full` · `preview` · `generic` (DEV-CONTRACTS §25).

**Repository model:** `monorepo` (default) — `<monorepo | polyrepo>`. One repository for the whole
product, or one per service. Decided at G2 with the decision table in DEV-CONTRACTS §13.9 rule 6;
`polyrepo` is V2 — schema only (§13.9 rule 9).

**Architecture:** `modular-monolith` (default) — `<monolith | modular-monolith | microservices>`.
One deployable with enforced module boundaries is the default; `microservices` needs the G2 ADR to
show which criteria force it (§13.9 rule 7). Independent of the repository model.

**Repository blueprint:** `fullstack-go-react` (default) — `<fullstack-go-react | go-react | go-service | service-go | python-react | nextjs | electron | vscode-extension | cli | ai-app | react-native | web-api-ts>`,
one of `dev-resolving-code-placement/blueprints/`, picked from the two axes above (its
`README.md` §Choosing). The default serves a new Go + React product. A brownfield repository on
the older flat shape names `go-react` here explicitly, and moves only by
`refactor-go-react-to-fullstack.md`. It fixes the whole tree, not only where code
goes: backend, client, `tests/`, ops, `docs/`, the process root and the root files (DEV-CONTRACTS
§13.9). `node dev/scripts/layout-check.mjs` checks the repository against it, and fails
`blueprint-fit` when the blueprint does not serve the two axes.

- **Blueprint ADR:** `<dev/design/adr/ADR-NNN-repository-blueprint.md>` — written at the first G2. In
  brownfield it lists the accepted deviations. `layout-check.mjs` reads them from here.

The defaults each blueprint fills in, so a greenfield project starts with no placeholder here:

- **go** (`go-react`, `go-service`; under `backend/` in `fullstack-go-react`): `cmd/<binary>/main.go` · `internal/<domain>/{domain,app,adapters/{postgres,http}}/`
  · `internal/platform/{apperr,httpx,middleware,config,db,obs}/` · `internal/server/` (composition root).
  Handlers live in their domain's `adapters/http`; the one RFC 9457 mapper is `platform/httpx`, which
  imports no domain, so there is no cycle. No `pkg/` until an outside module imports it.
- **python** (`python-react`): `backend/src/<package>/<domain>/{domain,app,adapters/{sql,api}}/` ·
  `backend/src/<package>/platform/` · `backend/migrations/` (Alembic) · unit tests in `tests/unit/`.
- **react** (`go-react`: `web/src/`, `fullstack-go-react` and `python-react`: `frontend/src/`): `app/` (routes, providers) ·
  `features/<feature>/{api,components,hooks,types}/` · `components/{ui,layouts}/` · `hooks/` · `lib/` ·
  `styles/`. Features never import each other.
- **nextjs**: `src/app/` (routes only) · `src/features/<feature>/` · `src/server/<domain>/{domain,app,adapters}/`
  (`server-only`) · `src/components/{ui,layouts}/`.
- **web + api, TypeScript** (`web-api-ts`): `apps/web/` (UI only) · `apps/api/src/<domain>/{domain,app,adapters}/`
  · `packages/contract/` (generated from the G4 OpenAPI file). The web app never imports the API's code.
- **sql / migrations:** `backend/migrations/` (`fullstack-go-react`, Python) or `migrations/` at the root (`go-react`, `go-service`) — see §Data stores.
- **tests, every stack:** unit tests beside the code; `tests/{integration,e2e,contract,perf,fixtures}/`.
- **ops, every stack:** `deploy/{docker,compose,helm|systemd,terraform}/` · `.gitlab-ci.yml` + `ci/` ·
  `ops/{runbooks,observability}/`. In `fullstack-go-react` and `service-go`, one home:
  `ops/{deploy,config,alerts,dashboards,runbooks}/`.

## Services

V2 — schema only (DEV-CONTRACTS §13.9 rule 9). One row per deployable service. A monolith has one
row; leave the table at its placeholder row until there is a second service. Nothing checks it
yet; V3 cross-service impact analysis reads it to find each service's repository, owner and
contract.

| Service | Repo | Owner | Contract path |
|---|---|---|---|
| `<name, kebab-case>` | `<repository URL or monorepo folder, e.g. backend/>` | `<team or named human>` | `<api/openapi.yaml, or contracts/<service>/v1/openapi.yaml>` |

## Data stores

| Engine | Enabled | Version | Migration tool | Design skill |
|---|---|---|---|---|
| `postgres` | yes | `<16>` | `<golang-migrate · alembic · drizzle>` | `dev-modeling-data` + `dev-writing-migrations` |
| `mysql` | yes | `<8.0, InnoDB, utf8mb4>` | `<golang-migrate · alembic>` | `dev-modeling-data` + `dev-writing-migrations` |

- **Migration directory:** `<migrations/>` — every migration is **reversible**; see DEV-CONTRACTS.md §7.
- **Naming convention:** `<YYYYMMDDHHMM>_<lowercase_kebab>.{up,down}.sql`
- **Schema-change policy:** `expand → migrate → contract` (default) — no destructive change in
  the same release as the code that stops using the column.
- **Access from app:** `<sqlc | pgx | SQLAlchemy | Prisma | Drizzle>`
- **Read-only inspection command:** `<psql -c '\d+ <table>' | mysql -e 'SHOW CREATE TABLE <t>'>`

## API surface

- **Style:** `<REST | gRPC | GraphQL>` (default REST)
- **Contract file:** `<<root>/api/<slug>/openapi.yaml>` — OpenAPI 3.1 for REST, `.proto` for gRPC
- **Versioning:** `<URI /v1 | header>` — breaking change policy: DEV-CONTRACTS.md §6
- **Auth:** `<bearer JWT | session | mTLS>`
- **Contract is authoritative:** implementation follows the contract; a needed contract change
  goes back through `/sdlc-api` and its gate, never edited inline during implementation.

## Environments

| Env | Purpose | App URL | Host | DB | Who deploys |
|---|---|---|---|---|---|
| `local` | dev loop | `<http://localhost:3000>` | developer machine | `<local docker>` | developer |
| `dev` | integration (optional) | `<url>` | `<host>` | `<db>` | CI |
| `staging` | pre-prod, same host type as production | `<https://staging.example.com>` | `<host>` | `<db, its own branch>` | CI, on every merge to main |
| `production` | live | `<https://example.com>` | `<host — not a developer machine>` | `<db>` | CI, a manual job |

Decided at G0 (DEV-CONTRACTS §13.4): one domain, a subdomain per environment one label deep
(`staging.`, `staging-admin.`). A placeholder left in this table is a `DEC-NNN` that blocks G2.

- **Secret store:** `<GitLab CI/CD variables, scoped per environment, masked; protected for production · SOPS + age, ops/config/<env>.enc.env>` —
  the only place a key's value lives. `ops/config/keys.md` lists every key; the deploy job writes the
  env file from the store and deletes it after; `env-doctor.mjs` checks it before every deploy.
- **Store keyholder:** `<who can read and rotate the store, and where the recovery copy is kept>`
- **Mail sender:** `<the address product mail is sent from, on a domain the product owns (never gmail.com or another free mailbox), and the provider · the product sends no mail>` —
  decided at G0 with the host; its DKIM, DMARC and SPF or return-path records are in DNS before the
  first mail ships (`secrets-and-environments.md`).

A secret is **never** written into an artifact, a log, a commit or a `.env` copied by hand. The G8
secret scan, and `dev-reviewing-implementation` at G7, fail a gate that finds one.

- **Allowed data domains:** `example` · `test` · `invalid` · `localhost` · `example.com` (default), plus
  `<the invented names your seeds use, e.g. kestrel.example, kestrel-seed.atlassian.net>` — every
  e-mail and host in seeds, fixtures and the preview database must end in one of these.
  `data-guard.mjs` checks the files, and a text dump of the preview DB before every review of a
  running preview (DEV-CONTRACTS §13.6). A real customer's domain is never added here.
- **Test database:** `<TEST_DATABASE_URL>` — the only database an agent's tests may use; never the
  `local` or a shared one (`agent-brief.md`).
- **Preview dump command:** `<pg_dump --data-only --inserts "$PREVIEW_DATABASE_URL" > /tmp/preview.sql>` —
  what `data-guard.mjs --dump` reads.

## Cloud

Read by `dev-designing-cloud` at G2 and G10 (DEV-CONTRACTS §13.14). Leave a line as a placeholder when
the organisation has no answer: the provider then becomes a `DEC-NNN`, never an assumption.

- **Provider:** `<aws | azure | gcp | alibaba | oci | none>` — the default for every slug; another is an ADR
- **Runtime default:** `<container-service>` — `vm` · `container-service` · `kubernetes` · `serverless-function`
- **Regions:** `<eu-west-1 (primary) · eu-central-1 (DR)>` — residency and latency decide these
- **Accounts / subscriptions / projects:** `<one per environment: shop-dev · shop-staging · shop-prod>`
- **IaC:** `<opentofu>` — `opentofu` · `terraform` · `bicep` · `cdk` · `pulumi`; folders `<infra/>`, `<deploy/k8s/>`
- **Approved services:** `<all managed services in the registry>` — or the list a platform team allows
- **Tags:** `app` · `env` · `owner` · `cost-center` (default) — on every resource, through provider default tags
- **Budget alert:** `<US$ 500 / month / environment>` — alerts at 50 / 80 / 100 %

## Quality gates

`/sdlc-verify` (G8) runs these; `/sdlc-release` (G9) refuses to open a PR while any is red.

| Gate | Command | Threshold |
|---|---|---|
| Build | `<go build ./... · uv run python -m compileall · npm run build>` | exit 0 |
| Lint | `<golangci-lint run · ruff check · eslint>` | 0 error |
| Format | `<gofmt -l · ruff format --check · prettier --check>` | 0 diff |
| Types | `<go vet ./... · mypy · tsc --noEmit>` | 0 error |
| Unit tests | `<go test ./... · pytest · vitest run>` | 0 failing |
| Unit coverage | `<go test -cover · pytest --cov · vitest --coverage>` | **line ≥ `<80>`%, branch ≥ `<70>`% on changed modules** |
| Integration tests | `<go test -tags=integration · pytest -m integration>` | 0 failing |
| Migration round-trip | `<migrate up && migrate down && migrate up>` | reversible, exit 0 |
| Secret scan | `node <root>/scripts/security-scan.mjs run --source . --tools gitleaks` (default; `<gitleaks git>` works too) | 0 untriaged finding in `security/findings.md` |
| Vulnerable deps | `node <root>/scripts/security-scan.mjs run --source . --tools semgrep,trivy,checkov` (default; add `<govulncheck · pip-audit>` for reachability) | `security-scan.mjs check` exits 0 (§13.15) |
| DAST baseline | `docker run --rm -t zaproxy/zap-stable:2.16.1@sha256:7840969c7c9fead565bf9734b12f49f6886db90b1d35b1f74d79710bbd081dab zap-baseline.py -t <preview URL> -J zap.json` (default) | 0 untriaged high/medium |
| Threat trace | `node <root>/scripts/threat-trace.mjs <slug> --source .` (default) | every THR-NNN traced |
| Real-data guard | `node <root>/scripts/data-guard.mjs --dump <preview dump>` (default) | 0 finding |
| Perf smoke | `node <root>/scripts/perf-smoke.mjs --base <local API url> --contract <root>/api/<slug>/openapi.yaml --call <op>=<path> … --headroom <0.5>` on the small dev seed | every smoked GET within `x-perf` × headroom; ≈30 s |
| Web perf | `<npm run build> && node <root>/scripts/web-perf.mjs --dist <build dir> --route <name>=<path> … --budget js_kb=<170>,lcp_ms=<2500>,tbt_ms=<200>,long_tasks=<5>,cls=<0.1>` | every route within budget |
| UI privacy | `node <root>/scripts/ui-privacy.mjs --src <web/src>` (default) | 0 error |
| Performance (volume) | `<seed the volume profile> && <the load script>` — **G8 only** | every `x-perf` operation's p95 ≤ `p95_ms` at the volume below |
| Mutation score | `<npx stryker run · gremlins unleash --diff <base> --output gremlins.json>`, reduced by `node <root>/scripts/mutation-score.mjs` | **≥ `<60>`% per changed module**; a module with no mutant is `NOT RUN` |
| Slow-test check | `node <root>/scripts/timeout-check.mjs --base <coverage base ref>` | 0 unexplained timeout raise or retry |
| Problem catalogue | `node <root>/scripts/problems-check.mjs <slug> --source . --client <web/src>` (default) | 0 error |
| API style | `node <root>/scripts/api-style-check.mjs <slug>` (default) | 0 error |
| Limits | `node <root>/scripts/limits-check.mjs <slug> --source . --web <web/src>` (default) | 0 error |
| Observability catalogue | `node <root>/scripts/obs-check.mjs <slug> --source .` (default) | 0 error |
| Schema naming | `node <root>/scripts/schema-lint.mjs --migrations <migrations/>` (default) | 0 error |
| Conventions | `node <root>/scripts/conventions-check.mjs --source .` (default) | 0 error |

**Performance budgets (DEV-CONTRACTS §13.7).** Per-endpoint budgets live in the contract (`x-perf`
on each operation, set at G4); these are the rest:

- **Perf smoke** runs **on every check** — it belongs in the project's check script beside the unit
  tests, not only at G8. Small seed (`<the dev seed>`), at most eight GETs (`<the hot paths: the main
  list, the main detail, …>`), headroom `<0.5>`: the seed is smaller than the volume, so an endpoint
  already at its budget here will be over it there. Its query check needs the app's
  `X-Query-Count` header in dev builds (the counter in `dev-writing-go-code` / `dev-writing-python-code`).
- **Web perf** runs on every check that builds the frontend: per route, cold cache, JS transferred
  `<170>` KB, LCP `<2500>` ms, TBT `<200>` ms (the lab proxy for INP), long tasks `<5>`, CLS `<0.1>`;
  CPU slowdown `<1 | 4>`. Routes: `<the screens in ui-spec.md>`. INP p75 ≤ 200 ms is a field target.
- **Browsers:** `defaults and not dead` (default) — a browserslist query; the build's targets and the
  supported list (DEV-CONTRACTS §13.13). Chromium (Edge) is measured by `ui-rubric` and `ui-snap`;
  Firefox and WebKit are measured where Playwright has them installed, else `NOT_RUN` with that reason.
  Devices: `<desktop 1024+, tablet 768, phone 360>`.
- **Performance (volume)** runs at G8 only: `<rows per growing table, e.g. 750 releases, 30,000
  items>` — the realistic row count, never the dev seed.

Coverage applies **only to modules the change touched** — raising a legacy repo's global number
is never part of a feature task. Three keys say what that number means:

- **Coverage tiers:** `unit` (default) — `<unit | unit+integration>`, the test tiers whose coverage
  counts toward the gate. Choose `unit+integration` when repositories and handlers are only
  exercised against a real database; merge the profiles (e.g. `go tool covdata merge`) before measuring.
- **Coverage exclusions:** `<globs>` — generated or non-authored code left out of the number, e.g.
  sqlc output `*/db/*.go`, mocks `**/mocks/**`, protobuf `*.pb.go`. Each glob is a reviewed claim
  that nobody hand-writes those files; an exclusion that hides authored code is a G8 finding.
- **Coverage base ref:** `merge-base` (default) — "changed modules" are the ones in
  `git diff <base>...HEAD`, where `<base>` is the PR's merge base with the target branch; when G7
  runs in slices, each slice measures against its slice base (the feature-branch commit it started from).
- **Mutation tools:** project dev dependencies, never the bundle's. Web/TS: `@stryker-mutator/core`
  plus the runner plugin (`@stryker-mutator/vitest-runner`), `mutate` limited to the changed files,
  reporter `json` (`reports/mutation/mutation.json`). Go: `gremlins` (`go install
  github.com/go-gremlins/gremlins/cmd/gremlins@<pinned>`) with `--diff <base>`. Windows notes are in
  `docs/mutation-testing.md`.

## Backend checks

What the §13.11 checkers read (DEV-CONTRACTS §13.11). A `<placeholder>` or a missing key keeps the
default.

- **Status table:** `<**/problem*.go>` — the files allowed to choose an HTTP status for a problem;
  a `Status:` anywhere else is `problems-check` E103.
- **Status pattern:** `<default>` — a regex whose group 1 is the status expression, if the code
  does not write `Status: http.StatusXxx`.
- Page size is not set here: `api-style-check.mjs` reads it from `## Defaults` (one fact, one place, §3.2).
- **Extra action verbs:** `<none>` — operationId verbs beyond §13.11's list, each with a `DEC-NNN`.
- **Env prefix:** `<APP_>` — every `.env.example` key starts with it.
- **Query verbs:** `<none>` — sqlc verbs beyond Get/List/Create/Update/Delete/Exists/Count (e.g. `Lock`).
- **Helper threshold:** `2` (default) — a test helper in more packages than this belongs in `testkit`.
- **Event API:** `obs.Event` (default; `obs.event` on python) — the one logging call, from `_templates/code/<lang>/obs`; `Other log APIs` lists the rest.
- **Extra event verbs:** `<none>` — event verbs beyond §13.11's set.
- **Metric prefix:** `<app>` — every metric name starts with `<app>_`.

## Security review

`dev-reviewing-implementation` reads a changed file matching these globs **in full**, against its
security checklist; every other file by its diff. `node <root>/scripts/risk-paths.mjs --base <ref>`
lists the matches (DEV-CONTRACTS §13.6). Add the project's own paths; removing a default needs a reason.

| Risk | Globs (default) |
|---|---|
| auth / authz | `**/auth/**` · `**/authz/**` · `**/identity/**` · `**/*permission*` · `**/*policy*` · `**/*rbac*` · `**/middleware*` |
| session | `**/*session*` · `**/*cookie*` · `**/*csrf*` · `**/*token*` |
| SQL | `**/*.sql` · `**/*repo*` · `**/*store*` · `**/queries/**` · `**/*query*` (generated query code, e.g. sqlc `db/*.go`, is read through its `.sql` source) |
| crypto | `**/crypto/**` · `**/*crypt*` · `**/*cipher*` · `**/*hash*` · `**/*sign*` · `**/*kms*` · `**/*secret*` |
| file upload | `**/*upload*` · `**/*attachment*` · `**/*multipart*` · `**/*sniff*` |
| deserialisation | `**/*decode*` · `**/*unmarshal*` · `**/*parse*` · `**/*pickle*` · `**/*yaml*` |
| secrets and config | `**/.env*` · `**/config/**` · `**/*credential*` · `**/vault/**` · `**/*settings*.{go,py,ts}` · `**/*cors*` · `**/*headers*` |

## Testing ownership (the dev / QA boundary)

| Tier | Owner | Lives in | Written by |
|---|---|---|---|
| unit | **this bundle** | beside the code, per stack convention | `/sdlc-implement` (same commit as the code) |
| integration (DB, seam, contract) | **this bundle** | `<tests/integration/ | *_integration_test.go>` | `/sdlc-implement` + `/sdlc-verify` |
| test cases, e2e, performance, security, accessibility, mobile | **agentic-fx-qa (`stlc`)** | `qa/` | the QA bundle's `/qa-*` pipeline |

This bundle **never** writes under `qa/` and never invokes a `/qa-*` command. It hands over with
`/sdlc-release`. See DEV-CONTRACTS.md §9.

## Delivery

- **Branch convention:** `feature/<slug>` (default) — or `feature/<tracker-key>-<slug>`; a lane adds
  `-lane-<x>`. Checked on every commit by the shipped `pre-commit` hook (`commit-lint.mjs --branch`)
  and at G9 by `dev-packaging-release`.
- **Protected branches:** `main` (default) — no commit lands on one directly.
- **Commit convention:** Conventional Commits 1.0 (DEV-CONTRACTS §18.1) — `<type>(<scope>): <subject>`,
  ≤ 72 characters, lower-case start; ids in `Refs:` / `Done:` trailers; gate commits
  `docs(sdlc): …`; lane merges `merge(lane-<x>): …`. Checked by the `commit-msg` hook and CI.
- **Commit author:** `<Name <email>>` — the identity every agent commits as (`agent-brief.md`); empty
  means `git config user.name` / `user.email`.
- **Commit scopes:** `<one per module: e.g. release · identity · http · web>` — the closed list; `sdlc`
  is always allowed. A layer, a stage or a gate is not a scope.
- **Git hooks:** `git config core.hooksPath <root>/ci/git-hooks` once per clone — `commit-msg` and
  `pre-commit` (the branch rule, formerly `git-branch-enforce`).
- **PR target:** `<main | develop>` · **PR template:** `<root>/_templates/pull-request.md`
- **Reviewers required:** `<1>` human, plus the G7 + G8 gate logs attached to the PR body
- **Changelog:** `<CHANGELOG.md | none>` — Keep a Changelog format
- **CI:** `<gitlab | github | azure>` — templates in `<root>/ci/`; `doctor.mjs --prune --yes` removes the
  one this project does not use.

## Defaults

Engineering values a standard already answers. A stage applies them **with the citation** and
raises a `DEC-NNN` only to deviate (DEV-CONTRACTS §3.2, §15.2). Change a row here, once, for the
project; never per initiative. Scripts read the bullet lines (`api-style-check.mjs` reads `Page
size` as `<default> / <max>`); the table holds the rest.

- **Page size:** `20 / 100` — the `limit` default and maximum on every list; cursor pagination (DEV-CONTRACTS §13.1).
- **Upload limit:** `25 MB` — per file, type sniffed from the content, not the name (OWASP File Upload Cheat Sheet).
- **Auth lockout:** `5 / 15 min` — failed attempts per account, then a 15-minute lock; a per-IP rate limit on top (OWASP ASVS 4.0.3 §2.2.1).
- **Session:** `12 h / 30 min` — absolute lifetime / idle timeout; rotate the id on sign-in (OWASP ASVS §3.3.1–3.3.2, §3.2.1).

| Topic | Default | Standard |
|---|---|---|
| Passwords | minimum 12 characters, maximum ≥ 64, no composition rules, checked against a breached list; no forced rotation | NIST SP 800-63B §5.1.1.2 |
| Password hashing | argon2id (m=19 MiB, t=2, p=1), else bcrypt cost 12 | OWASP Password Storage Cheat Sheet |
| Retention | audit events 1 year; application logs 30 days; deleted records purged after 30 days | GDPR Art. 5(1)(e), storage limitation |
| Names and e-mails | compared case-insensitively (`lower()` or ICU `und-u-ks-level2`); stored as entered; e-mail unique after case folding | RFC 5321 §2.4 in practice; Unicode UTS #10 |
| Timestamps | stored and sent as UTC ISO-8601 with `Z`; rendered in the viewer's zone | RFC 3339 |
| Ids | opaque, random (UUIDv7 or ULID); never a sequence in a URL | DEV-CONTRACTS §13.1 |
| Pagination style | cursor (keyset), `{ data, page: { next_cursor, has_more, limit } }` | DEV-CONTRACTS §13.1 |
| Toolchain patches | patch releases of the language, runtime and dependencies are taken without a DEC; a minor or major bump needs an ADR line | SemVer 2.0.0 |
| Errors | RFC 9457 problem+json | DEV-CONTRACTS §13.1 |

## Dependencies

- **Pin policy:** exact versions (`.npmrc` `save-exact=true`, `go.mod` as resolved, `uv.lock`); a lock
  file is committed; base images pinned by digest.
- **Update bot:** Renovate (`renovate.json` from `<root>/_templates/skeleton/`) — grouped by ecosystem,
  weekly, merged only on a green pipeline.
- **Licence allowlist:** `MIT` · `Apache-2.0` · `BSD-2-Clause` · `BSD-3-Clause` · `ISC` · `MPL-2.0` ·
  `0BSD` · `Unlicense` · `CC0-1.0` — anything else needs a DEC answered by a named human.
- **A new direct dependency** carries one line in an ADR (or the architecture's `## Decisions`): what
  it does, what in the tree already does it, its licence. G7 rejects one that is unjustified,
  outside the allowlist, or a second library for one job (DEV-CONTRACTS §18.4).

## Gate policy

- **Gate order is fixed** (DEV-CONTRACTS.md §4). A stage runs only when the previous required gate
  log exists with verdict `PASS` or `SKIPPED`.
- **Which gates run at all** comes from the change class (§15.1), declared at intake. Gates outside
  the class are `SKIPPED` once, at intake, with the class as the reason — not re-decided per stage.
- **Extra skips:** `<any gate this project never needs, with the reason>` — a skip is always written
  down, is always declared by the reviewer or a named human, and is never claimed by the author.
- **Autonomy:** `off` (default) · `assisted` · `full` — how an unattended run decides (DEV-CONTRACTS §4.6);
  `SDLC_AUTONOMY` overrides it per run. Hard stops hold in every mode.
- **Token budget:** `<2000000>` tokens per initiative — `size.mjs estimate` stops and asks above it (DEV-CONTRACTS §15.3).
- **Who may override:** a human, in writing, recorded in the gate log's `Override` row with a
  name and a reason. An agent may **never** override its own gate.
- **Re-review after change:** editing an artifact after its gate passed **invalidates** that gate
  (the log records the artifact hash) — the stage re-runs.
