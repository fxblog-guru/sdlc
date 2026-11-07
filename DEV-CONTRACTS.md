---
bundle: agentic-fx-dev
schema: 1
---

# DEV-CONTRACTS.md — the single source of truth for every cross-file contract

Skills, agents, and commands **reference** this file; they do not copy it. **When any other file
in this bundle disagrees with DEV-CONTRACTS.md, DEV-CONTRACTS.md wins** — fix the other file. The
mechanical half of these rules is enforced by `<root>/scripts/lint-dev.mjs` (`npm run dev:lint`).

Four ideas run through everything here:

1. **Every stage is a gate.** A stage produces artifacts, a review skill judges them against a
   published checklist, and the verdict goes into a gate log. The next stage refuses to run without
   a `PASS`. Nothing advances on silence.
2. **Gate logs and artifacts are the source of truth.** `state.json` is a *derived read model* —
   regenerated, never authoritative, never hand-edited. If they disagree, the markdown is right and
   the index is stale (§8).
3. **Dev and QA are separate tiers.** This bundle builds and proves the code (unit + integration).
   The `agentic-fx-qa` bundle verifies the product. Neither writes into the other's tree (§9).
4. **"Standard" is a written rule, not taste.** Pagination, error shape, design tokens, log fields,
   rollout strategy — each has one owning skill and one checklist a gate can fail you on (§13).

---

## 1. Identifiers

| Id | Format | Rules |
|---|---|---|
| Requirement | `REQ-NNN` (zero-padded, ≥3 digits) | permanent; never renumbered; the join key between PRD, design, tasks, tests |
| Architecture decision | `ADR-NNN` | permanent; a reversal is a NEW ADR that supersedes — never an edit. The one permitted change is a dated entry appended to an optional, trailing `## Amendments` section (`YYYY-MM-DD — <clarification or citation> — <who>`, oldest first, `error` E027 otherwise) that clarifies wording or cites later evidence and **never changes the decision, its scope or its consequences**. An amendment-only change is eligible for `--reaffirm` (§4.4) |
| Task | `TASK-NNN` | per slug, sequential; the unit of implementation and of `state.json` progress |
| Review finding | `CR-NNN` | per **slug**, sequential across all gates — so a finding can be tracked to resolution across rounds and stages (§5.3) |
| Migration | `MIG-<YYYYMMDDHHMM>` | matches the migration filename timestamp; one schema change = one MIG |
| Entity | `ENT-<UPPER_SNAKE>` | data-model entity, referenced from REQ and from the API schema |
| Endpoint | `API-<METHOD>-<path-kebab>` | e.g. `API-POST-jobs-id-assign`; the join key contract ↔ task ↔ test |
| Service Level Objective | `SLO-NNN` | per service; each has an alert and a dashboard panel (§13.5) |
| Open decision | `DEC-NNN` | per slug; a question only a human can answer, recorded instead of guessed at (§15) |
| Threat | `THR-NNN` | per slug; one row of the G2 STRIDE table, naming its control and the test that proves it (§13.6) |
| Behaviour row | `UB-NNN` | per slug; a row of the ui-spec's behaviour table — one observable interaction a test can name (§6, §13.10) |
| Pattern obligation | `PO-NNN` | per slug; a rule every matching component must follow, declared for `pattern-check.mjs` (§13.3) |
| Knowledge card | `KC-<AREA>` | a durable fact about the existing system, grounded to a commit (§16) |
| Gate | `G<N>`, N ∈ `0..11`, plus `GK` (§16) | one per stage, per slug; `GK` is per repository |
| Slug | lowercase-kebab, ≤40 chars | the initiative's name everywhere; never renamed after G1 |
| Run | `<run-id>` = `YYYYMMDD-HHMMSS-xxxx` — UTC time, then 4 lowercase hex characters | e.g. `20260918-143522-a81f`. Take it from `node <root>/scripts/run-id.mjs`; never type one. **One run-id spans the whole stage execution** — preflight, authoring, review, resolve — so a pipeline debug session can follow one thread through several files. |
| Attempt | `attempt: <n>`, starting at 1 | increments per author↔review round within a run (§4.3) |
| Tracker key | per `DEV-PROFILE §Project` | the real key from the tracker; never invented |

**Never reuse a retired id.** A deleted REQ stays deleted; the number is burned.

### 1.1 Id registry

Every id kind the bundle uses, with the one document that defines it and the one way a new number is
taken. A project adds its own kinds in `DEV-PROFILE §Project` `Id prefixes`; the tracker key's prefix
is registered by `Tracker`. An id-shaped token (`PREFIX-<digits>`) outside code whose prefix is in
none of the three is `warn` W091. Standard and algorithm names (`SHA-256`, `ISO-8601`, `RFC-9457`)
are not ids.

| Prefix | Kind | Owner doc | Format | Allocator |
|---|---|---|---|---|
| `REQ` | requirement | `requirements/<slug>/requirements.md` | `REQ-NNN` | next free number in that file |
| `AC` | acceptance criterion | `requirements/<slug>/acceptance-criteria.md` | `AC-NNN` | next free number in that file |
| `ADR` | architecture decision | `design/adr/` | `ADR-NNN` | next free number across `design/adr/` |
| `TASK` | task | `plan/<slug>/tasks.md` | `TASK-NNN` | next free number; a split keeps the old id |
| `CR` | review finding | the gate log that raises it | `CR-NNN`, per slug | `node <root>/scripts/run-id.mjs --next-cr <slug> [--count N]` — the highest CR in every log of the slug and every live claim, plus one; never per run |
| `DEC` | decision | `decisions/<slug>.md` | `DEC-NNN` | `node <root>/scripts/run-id.mjs --next-dec <slug>` — the ledger's highest and every live claim, plus one |
| `OQ` | open question local to one artifact; one only a human can answer is a `DEC` | that artifact's `## Open questions` | `OQ-NN` | next free number in that artifact |
| `THR` | threat | `design/<slug>/threat-model.md` | `THR-NNN` | next free number in that file |
| `SEC` | security finding | `security/findings.md` | `SEC-NNN` | `security-scan.mjs` for a scanner's; next free number in that file for a reviewer's |
| `SLO` | service level objective | `design/<slug>/architecture.md` (G2), then `monitoring/<slug>/observability.md` | `SLO-NNN` | next free number across the slug |
| `MIG` | migration | `data/<slug>/migration-plan.md` | `MIG-YYYYMMDDHHMM` | the migration file's timestamp |
| `WD` | a wireframe deviation | `ui/<slug>/ui-spec.md` | `WD-NN` | next free number in that file |
| `AP` | an access pattern | `data/<slug>/data-model.md` `## Access patterns` | `AP-NN` | next free number in that file |
| `UB` | behaviour row | `ui/<slug>/ui-spec.md` | `UB-NNN` | next free number in that file |
| `PO` | pattern obligation | `ui/<slug>/patterns.yaml` | `PO-NNN` | next free number in that file |
| `DEF` | QA defect | the QA bundle's `<qa-root>/defects/` | `DEF-<slug>-NNN` | the QA bundle |
| `ENT` · `API` · `KC` | entity · endpoint · knowledge card | data model · contract · `knowledge/` | named, not numbered (§1) | the name |

A CR or DEC id handed out is claimed under `<root>/.claims/<slug>/` (git-ignored) for two hours, so
agents running in parallel never take the same number before either has written it down.

---

## 2. Artifact paths (relative to the SDLC root, `<root>/`, default `.sdlc/`)

Every path below is relative to the **SDLC root**, written `<root>/` in this contract and in the
commands, agents and skills. It is `.sdlc/` for a new project, so the process artifacts (reviews,
verification evidence, scripts, templates) stay out of the product's tree and out of the way in
its pull requests. `dev/` is accepted, and is the root of every project installed before 1.6.0;
it keeps working unchanged. One folder per stage, named after the stage token (§10). Production
code never lives under `<root>/` — only artifacts *about* it.

**Which folder is the root.** Every script resolves it the same way (`scripts/lib/root.mjs`, and
`hooks/sdlc-root.mjs` for the hooks), first match wins:

1. an explicit `--root <path>` (`SDLC_DEV_ROOT` for the hooks);
2. DEV-PROFILE §Project `SDLC root` (the older label `Dev root` is read too), unless the line still
   says `(default)`;
3. `.sdlc/` if it exists, else `dev/` if it exists;
4. `.sdlc/`.

**Paths in gate logs.** A gate log, `state.json` and a `visual_reference` record repository-relative
paths, prefixed with the root (`.sdlc/requirements/<slug>/requirements.md`). Both prefixes, `.sdlc/`
and `dev/`, name the root, whatever it is called today, so a log written under one root is read
unchanged under the other. New paths are written with the root's own prefix. Hashes cover artifact
bodies only (§5.2), never a path, so the prefix never moves a hash.

**Moving a root.** `node <root>/scripts/migrate-root.mjs --to .sdlc` (or `--to dev`) is a dry run;
`--write` does a `git mv`, sets `SDLC root`, rewrites the prefix in gate-log front matter only
(where no hash reaches), rewires `package.json`, `.gitignore`, the CI files and `core.hooksPath`,
and rebuilds the index. A `dev/` path inside a hashed body is left as it is: it still resolves.

Two files sit outside this tree and every command reads at least one of them: `DEV-PROFILE.md` and
`DEV-CONTRACTS.md` are installed to `.claude/`, not to the SDLC root, because they configure the
bundle rather than describing a change. A command that cannot find `DEV-PROFILE.md` is looking in
`<root>/`.

```
knowledge/codebase-map.md                         # GK — modules, owners, entry points, layering
knowledge/conventions.md                          # GK — extracted FROM the code, with real examples
knowledge/schema-as-is.md                         # GK — the live schema, introspected (G3's baseline)
knowledge/api-as-is.md                            # GK — the contracts in production (G4's baseline)
knowledge/test-conventions.md                     # GK — where tests live, how they are named and run
knowledge/known-debt.md                           # GK — what not to touch, and why
decisions/<slug>.md                               # DEC-NNN — open questions only a human can answer
intake/<slug>/problem.md                          # G0
requirements/<slug>/prd.md                        # G1
requirements/<slug>/requirements.md               # G1  — REQ-NNN table (functional + NFR)
requirements/<slug>/acceptance-criteria.md        # G1  — testable, per REQ; the QA handoff payload
requirements/<slug>/glossary.md                   # G1  — term · definition · not (the banned synonyms) (§3.2)
design/<slug>/architecture.md                     # G2
design/<slug>/impact.md                           # G2 — what this change touches in the running system
design/<slug>/threat-model.md                     # G2
design/adr/ADR-NNN-<kebab-title>.md               # G2  — repo-wide, not per slug
data/<slug>/data-model.md                         # G3
data/<slug>/migration-plan.md                     # G3
data/<slug>/limits.yaml                           # G3  — every length, size and count limit, once (§13.11)
api/<slug>/openapi.yaml | <service>.proto         # G4  — the authoritative contract
api/<slug>/contract-diff.md                       # G4  — breaking-change analysis
api/<slug>/problems.yaml                          # G4  — the problem catalogue: every `type`, its one status and title (§13.11)
ui/<slug>/ui-spec.md                              # G5
ui/<slug>/wireframe.html                          # optional: the approved wireframe — binds content and layout, never look (§13.3)
ui/<slug>/visual-design.md                        # G5 — the high-fidelity look, approved by the requester (§13.3)
ui/<slug>/visual/index.html                       # G5 — the rendered high-fi screens visual-design.md describes
ui/<slug>/visual/shots/                           # G5 — ui-snap PNGs of them at 1440 / 1024 / 360: the look reference for G7 and G8
ui/<slug>/patterns.yaml                           # G5, optional — the pattern obligations (`PO-NNN`) pattern-check.mjs enforces at G7 (§13.3)
ui/<slug>/components.md                           # GENERATED by ui-inventory.mjs — the kit's primitives, variants, consumers and second implementations; never gated, never hashed (§13.3)
plan/<slug>/tasks.md                              # G6  — TASK-NNN, order, dependencies, estimate
plan/<slug>/slices.md                             # class `fast` only, in place of tasks.md — judged at each G7 slice log (§15.1)
implementation/<slug>/change-summary.md           # G7  — GENERATED by change-summary.mjs; never hand-written, never hashed (§4.4)
implementation/<slug>/progress.md                 # NOT gated — execution status per task (§8.1)
implementation/<slug>/ui-snap/                    # G7 evidence — ui-snap.mjs screenshots + compare.html (§13.3)
implementation/<slug>/exploration/slice-<n>.md    # G7 evidence — the exploratory pass over a slice's behaviour rows, per role (§13.3); `artifact: exploration`, never a gate output
implementation/<slug>/lanes/lane-<x>.md           # the implementer's notes the summary is built from — one per lane, or lane-main (§5.5)
verification/<slug>/runs/<run-id>/verify.md       # G8  — one row per quality gate + raw output paths
verification/<slug>/runs/<run-id>/coverage.md     # G8  — per-module line/branch on CHANGED modules
verification/<slug>/runs/<run-id>/logs/<gate>.txt # G8  — raw tool output, never summarised away
release/<slug>/pull-request.md                    # G9  — the PR body as submitted
release/<slug>/qa-handoff.md                      # G9  — the packet agentic-fx-qa consumes (§9)
deployment/<slug>/topology.yaml                   # G2 drafts, G10 completes — the cloud deployment model: provider, groups, components, edges (§13.14)
deployment/<slug>/release-plan.md                 # G10
deployment/<slug>/runs/<run-id>/deploy-run.md     # G10 — what actually happened, per environment
monitoring/<slug>/observability.md                # G11 — SLO-NNN, dashboards, alerts, signals
monitoring/<slug>/runbook.md                      # G11 — symptom → diagnosis → action
monitoring/<slug>/post-release.md                 # G11 — verification against real traffic
diagrams/<slug>/cloud/<slug>-<provider>.{drawio,svg} + index.html  # DERIVED by topology.mjs render — the cloud diagram on each provider, editable in draw.io; never hand-edited as the source (§13.14)
diagrams/<slug>/index.html + NN-G<n>-<artifact>-<title>.svg   # DERIVED by diagram.mjs render — every mermaid block of the slug, by gate; never hand-edited (§13.8)
reviews/<slug>/G<N>-<stage>-<run-id>[-a<N>].md    # gate logs (§5); `-a2` on a second round
reviews/_repo/GK-knowledge-<run-id>.md            # GK's log — per repository, not per slug (§16)
security/findings.md                              # §13.15 — every SEC-NNN, by scanner or reviewer; triaged by a human; read by G8 + G9
security/audits/<run-id>.md                       # /sdlc-security — one audit; NOT a gate log
security/runs/<run-id>/                           # raw SARIF + tools.md — git-ignored (§18.5)
pr-reviews/<pr-id>-<run-id>.md                    # /sdlc-review-pr — a teammate's PR (gitlab-<n> | github-<n> | <branch>); NOT a gate log, never parsed as one
state.json                                        # DERIVED read model (§8) — never hand-edited
DASHBOARD.md                                      # DERIVED render of state.json — never hand-edited
docs/codebase-map.md                              # long-lived: modules, owners, entry points
docs/stack-conventions.md                         # long-lived: decisions this repo has made
docs/design-tokens.json                           # long-lived: the design system's source — chosen by a named human (§13.3)
docs/design-tokens.md                             # long-lived: the UI source of truth, RENDERED from the json (§13.3)
docs/ui-patterns.md                               # long-lived: the shells and page patterns every screen starts from (§13.3)
docs/presets/<name>.json                          # a customised, Figma-derived or code-derived preset, before render
docs/<surface>/design-tokens.{json,md}            # only for a second surface with different users (e.g. mobile)
_templates/*.md                                   # the strict templates every stage copies from (§3)
ci/{gitlab-ci,github-workflow}.yml                # CI templates — the same checks, pipeline-side
ci/spectral.yaml                                  # the §13.11 API style as a Spectral ruleset; api-style-check.mjs is the no-dependency fallback
scripts/lint-dev.mjs                              # the contract linter (§11)
scripts/build-state.mjs                           # regenerates state.json + DASHBOARD.md (§8)
scripts/status.mjs                                # the board every command prints from; `<slug> --ready` lists task waves
scripts/doctor.mjs                                # environment preflight
scripts/run-id.mjs                                # prints a fresh run-id (§1)
scripts/reaffirm-check.mjs                        # is an own-artifact edit inside the self-edit reaffirm bound (§4.4)
scripts/migrate-ledger-inputs.mjs                 # rewrites whole-ledger gate-log inputs to the rows each log relied on (§5.2)
scripts/design-system.mjs                         # render · check (contrast, scale, ΔE, md = json) · scan (hard-coded values) · derive (tokens from a high-fi visual only) · preview (a preset's reference shots) · kit-check (the kit the spec names is built and used) · classes (every class emits a rule)
scripts/ui-inventory.mjs                          # writes ui/<slug>/components.md; fails on a second implementation of a kit role outside components/ui (§13.3)
scripts/copy-lint.mjs                             # the copy catalogue: key shape, duplicates, literals in JSX, contractions, Title Case, glossary (§13.3)
scripts/ui-consistency.mjs                        # computed-style histograms per role across routes; more than one value per role fails unless declared (§13.3)
scripts/ui-rubric.mjs                             # measures rendered pages: overflow, clipped columns, primary-button count, type scale, grid, nesting, status ΔE, axe-core (§13.3)
scripts/ui-snap.mjs                               # headless screenshots of app screens beside the approved visual, as compare.html (§13.3); `--golden` pixel-diffs against approved shots (§13.13)
scripts/topology.mjs                              # the cloud deployment model: provider rules (check), official-icon draw.io + SVG (render), service table (table), IaC drift (drift) (§13.14)
scripts/lib/clouds.mjs                            # the cloud registry: one adapter per provider (services, stencils, group nesting, IaC types) — every topology check reads it
scripts/diagram.mjs                               # mermaid diagrams in the artifacts: notation rules (check), and headless render into diagrams/<slug>/ (§13.8)
scripts/ui-score.mjs                              # the machine half of the UI score from the checkers' --json output (§13.13)
scripts/ui-privacy.mjs                            # web code: no secret in console, URL or web storage; destructive calls confirm (§13.13)
scripts/lib/ui-spec.mjs                           # reads the ui-spec's states, roles, traceability and responsive tables — one reader for lint-dev and ui-score (§13.13)
scripts/threat-trace.mjs                          # every THR-NNN names a control and a test that exists in the source; `--done` judges only the threats of done tasks, at each G7 merge (§13.6)
scripts/data-guard.mjs                            # seeds, fixtures and a preview-DB dump hold only allowed domains and e-mails (§13.6)
scripts/risk-paths.mjs                            # the changed files a G7 reviewer reads in full, from DEV-PROFILE §Security review (§13.6)
scripts/lane-brief.mjs                            # one lane's next tasks, ownership and open notes for a G7 spawn; `check` fails on a Files path another lane owns; `merge` merges a lane and removes its worktree, branch and database (§5.5)
scripts/visual-extract.mjs                        # one screen of the approved visual: its renderer, helpers and the CSS they use (§13.3)
scripts/perf-smoke.mjs                            # the ~30 s perf smoke: a handful of GETs on a small seed against each operation's `x-perf` budget, with headroom (§13.7)
scripts/web-perf.mjs                              # per-route JS transferred, LCP, TBT and long tasks of a built app in headless Edge/Chrome, against the profile's budgets (§13.7); --audit seo,a11y reads the rendered DOM
scripts/lib/perf.mjs                              # reads each OpenAPI operation's `x-perf` budget — one reader for lint-dev and perf-smoke (§13.7)
scripts/lib/langs.mjs                             # the language registry: one adapter per language (files, tests, comments, toolchain); every checker reads code through it
scripts/layout-check.mjs                          # checks the repo tree against its declared blueprint: folders, test placement, grab-bags, package size, import direction (§13.9)
scripts/trace.mjs                                 # maps every unit/integration AC and every UB row to the tests that name it; `--check` fails on a gap (§6)
scripts/pattern-check.mjs                         # greps the code for components that match a pattern obligation and skip its required wrapper (§13.3)
scripts/timeout-check.mjs                         # flags a diff that raises a test timeout or adds a retry with no recorded cause (§13.10)
scripts/mutation-score.mjs                        # reduces a Stryker or gremlins report to changed modules against the threshold (§13.10)
scripts/explore.mjs                               # Playwright (Edge) probes for a slice's behaviour rows, one browser context per role; NOT RUN without Playwright (§9, §13.3)
scripts/problems-check.mjs                        # problems.yaml ↔ openapi ProblemType ↔ the code: one status per type, one status table; --client for web handling (§13.11)
scripts/api-style-check.mjs                       # the contract against the §13.11 API style, x-idempotency and x-concurrency on every non-GET
scripts/limits-check.mjs                          # limits.yaml against Go, SQL, openapi and web limits; no digits in field messages (§13.11)
scripts/obs-check.mjs                             # every log event and metric in the code is in observability.md, and every entry is used (§13.11)
scripts/conventions-check.mjs                     # sqlc vocabulary, copied queries, duplicated test helpers, env prefix ↔ .env.example (§13.11)
scripts/schema-lint.mjs                           # *.up.sql against the §13.2 DB naming row (§13.11)
scripts/commit-lint.mjs                           # Conventional Commits, closed scopes, Refs:/Done: trailers, merge template, branch rule; `--progress` writes progress.md rows (§18.1)
scripts/propagate-dec.mjs                         # every artifact that cites an answered DEC and lacks its key token (§3.2)
scripts/skeleton-check.mjs                        # the G6 skeleton files exist, base images are digest-pinned, versions exact (§18.2)
scripts/api-contract-check.mjs                    # the contract's schemas, security, examples and x- declarations against §13.12
scripts/contract-compat.mjs                       # the no-dependency breaking-change diff of two OpenAPI files; `oasdiff breaking` when installed (§13.12)
scripts/fixture-check.mjs                         # every info.x-fixtures data file validates, record by record, against the schema it names (§13.1)
scripts/eol-check.mjs                             # fixture, golden and baseline paths are pinned eol=lf by git's effective attribute, none committed CRLF (§5.2)
scripts/autonomy.mjs                              # the unattended-run gatekeeper: mode, assumed defaults, hard stops, budget, the run report (§4.6)
scripts/api-score.mjs                             # the G4 scorecard: machine rows from the checkers' --json, human rows from the reviewer (§13.12)
scripts/migrate-root.mjs                          # moves the SDLC root between dev/ and .sdlc/: dry run by default, --write to move (§2)
scripts/lib/root.mjs                              # resolves the SDLC root and maps a gate-log path onto it — one resolver for every script (§2)
scripts/.manifest.json                            # sha256 of every shipped script — doctor flags a vendored script edited in place (§18.6)
ci/git-hooks/{commit-msg,pre-commit}              # commit-lint on every commit and the protected-branch rule (`git config core.hooksPath <root>/ci/git-hooks`)
.gitignore                                        # generated evidence and the derived index stay out of git (§8, §18.5)
_templates/skeleton/                              # the files the G6 skeleton tasks start from (§18.2)
```

---

## 3. Templates are mandatory and strict

Every artifact above is produced by **copying its template from `<root>/_templates/` and filling it
in** — not by free-form writing that happens to look similar.

| Rule | Meaning |
|---|---|
| **Headings are a contract** | A template's `##` headings are fixed: same wording, same order. The linter matches them byte-exact. Add detail *inside* a section, never a new top-level section. One exception: an ADR's trailing `## Amendments`, omitted until the first amendment (§1). |
| **No section left empty** | A section that does not apply is filled with `N/A — <reason>`. A blank section fails the gate. |
| **No placeholder survives a gate** | Any `<angle-bracket>` placeholder still present is a gate failure. |
| **Front matter is required** | Every artifact opens with the YAML block in §3.1. |
| **The rule lives in the skill** | The template holds the *shape*; the **authoring skill holds the rule** — what a good answer looks like, the checklist, the failure modes. A template carries at most one hint line per section. |
| **One template, one author, one reviewer** | Each template names its authoring skill and its reviewing skill in front matter. A template with no reviewer is a bug. |

### 3.1 Artifact front matter

```yaml
---
slug: <slug>
stage: <knowledge|intake|requirements|design|data|api|ui|plan|implementation|verification|release|deployment|monitoring>
artifact: <codebase-map|conventions|schema-as-is|api-as-is|test-conventions|known-debt|decisions|glossary|problem|prd|requirements|acceptance-criteria|architecture|impact|adr|threat-model|data-model|migration-plan|api-contract|contract-diff|ui-spec|visual-design|tasks|slices|change-summary|exploration|verify|coverage|pull-request|qa-handoff|release-plan|deploy-run|observability|runbook|post-release>
status: <draft|in-review|superseded>
authored_by: <skill name>
reviewed_by: <review skill name | pending>
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: [REQ-001, REQ-002]     # every artifact after G1 traces to REQs
---
```

Two artifact types take optional keys more. A `ui-spec` may carry `visual_reference`: one
`{ path, sha256, kind }` map, or a list of them, each a picture the requester approved, hashed as in
§5.2. `kind` is `wireframe` (binds content and layout) or `visual` (binds look); a reference with no
`kind` is read as `wireframe`, with `warn` W033. What each binds is in §13.3; `error` E028 checks
them. A `visual-design` carries `approved_by` and `approved_on` once the requester has approved its
shots: a named human, never an agent, a skill, `user` or `admin` (`error` E029). It may also carry
`approvals: { design, engineering, accessibility }`, the other three UI sign-offs, each a named
human (`error` E146, §13.13). Front matter is not
hashed (§5.2), so recording an approval after the G5 `PASS` stales nothing.

**There is no `approved` status, and the omission is deliberate.** An artifact's front matter says
what its author did with it: `draft` while it is being written, `in-review` once it is handed to the
gate, `superseded` when a later version replaces it. Whether it *passed* is not in the file at all —
it is in `reviews/<slug>/G<N>-<stage>-<run-id>.md`, which is one `ls` away, and derived from there
into `state.json` (§8).

The tempting alternative is to let the review skill write `approved` back into the artifact, and it
fails twice. It contradicts §12.2 — a reviewer with write access to the thing it is judging is not
independent, and the argument that admits one field admits the next one identically. And it puts the
verdict in two places, where the gate log and the artifact can disagree; the first time they do,
nobody will know which to believe. A second source of truth about approval is worse than none.

There is a narrower version that *is* mechanically sound — write the status, then hash, so the
recorded output hash matches the final bytes — and it is still rejected, because it buys a
convenience at the cost of the one property this pipeline is built on.

### 3.2 One fact, one place

| Rule | Detail |
|---|---|
| **Terms** | `requirements/<slug>/glossary.md` (G1, `_templates/glossary.md`) is a `## Terms` table: `Term` · `Definition` · `Not` — the synonyms the slug does not use. Every artifact of the slug uses the term; a word from a `Not` cell, outside code, is `warn` W090. |
| **Ids** | Every id kind is registered in §1.1. An id-shaped token with an unregistered prefix is `warn` W091. A `CR-NNN` defined in the `## Findings` of two runs with different `Problem` text is `error` E090 — numbering restarted per run. |
| **Decided values** | A value a `DEC-NNN` fixes is stated in the ledger and in its **owning artifact** — the artifact of the gate the row's `Blocks` names (a task → `tasks.md`). Every other artifact cites the DEC id, never the value: a restated value is the copy that goes stale. |
| **Propagation** | When a DEC is answered, `node <root>/scripts/propagate-dec.mjs <slug>` lists, per answered DEC, every artifact that cites it and lacks the answer's **key token** — the first code span in the `Answer` cell, else its first number with its unit, or an explicit `Key: <token>`. An owning artifact missing it is `missing` (exit 1 with `--check`); any other is `cites` (correct); one that carries the token is `restates` (a single-source candidate for the reviewer). |
| **Defaults** | A value `DEV-PROFILE §Defaults` fixes is applied with its citation (`DEV-PROFILE §Defaults — OWASP ASVS 2.2.1`), never raised as a `DEC`. A DEC is raised only to deviate from it (§15.2). |

### 3.3 Size budgets

An artifact over its cap is `warn` W092: move the detail to an ADR, an appendix artifact or a
diagram and link it. A table cell over 300 characters in an artifact (not a gate log's evidence) is
`warn` W093: a cell that long is a paragraph, and a reviewer cannot quote it.

| Artifact | Words (body) | Artifact | Words (body) |
|---|---|---|---|
| `problem` | 1,500 | `architecture` | 12,000 — deep detail goes in ADRs |
| `prd` | 6,000 | `adr` | 1,500 |
| `requirements` | 10,000 | `impact` · `threat-model` | 5,000 · 6,000 |
| `acceptance-criteria` | 15,000 | `data-model` · `migration-plan` | 12,000 · 5,000 |
| `glossary` | 3,000 | `contract-diff` | 4,000 |
| `ui-spec` | 1,500 per `## Screens` row (min 3,000) | `visual-design` | 3,000 |
| `tasks` | 150 per `## Tasks` row (min 3,000) | `observability` · `runbook` | 4,000 · 6,000 |

---

## 4. The stage / gate ladder

| G | Stage | Command | Produces | Authoring skills | Review skill |
|---|---|---|---|---|---|
| **GK** | knowledge *(per repo, §16)* | `/sdlc-onboard` | `knowledge/*.md` | `dev-analysing-source`, `dev-extracting-conventions` | `dev-reviewing-knowledge` |
| G0 | intake | `/sdlc-intake` | `problem.md` | `dev-framing-problem` | `dev-reviewing-intake` |
| G1 | requirements | `/sdlc-requirements` | `prd.md`, `requirements.md`, `acceptance-criteria.md`, `glossary.md` (§3.2) | `dev-writing-prd`, `dev-decomposing-requirements` | `dev-reviewing-requirements` |
| G2 | design | `/sdlc-design` | `architecture.md`, `impact.md`, `ADR-NNN`, `threat-model.md` | `dev-brainstorming-architecture`, `dev-detailing-design`, `dev-mapping-impact`, `dev-modeling-threats` | `dev-reviewing-design` |
| G3 | data | `/sdlc-data` | `data-model.md`, `migration-plan.md` | `dev-modeling-data`, `dev-writing-migrations` | `dev-reviewing-data` |
| G4 | api | `/sdlc-api` | `openapi.yaml`/`.proto`, `contract-diff.md` | `dev-designing-api` | `dev-reviewing-api` |
| G5 | ui | `/sdlc-ui` | `ui-spec.md`, `visual-design.md` + `visual/` | `dev-specifying-ui`, `dev-designing-visuals` | `dev-reviewing-ui` |
| G6 | plan | `/sdlc-plan` | `tasks.md` | `dev-planning-implementation`, `dev-resolving-code-placement` | `dev-reviewing-plan` |
| G7 | implementation | `/sdlc-implement` | code + unit + integration tests, lane notes; `change-summary.md` generated | `dev-writing-{go,python,react,nextjs}-code`, `dev-writing-migrations`, `dev-documenting-changes` | `dev-reviewing-implementation` |
| G8 | verification | `/sdlc-verify` | `verify.md`, `coverage.md`, raw logs | `dev-running-verification` | `dev-reviewing-verification` |
| G9 | release | `/sdlc-release` | branch, commits, PR, `qa-handoff.md` | `dev-packaging-release` | `dev-reviewing-release` |
| G10 | deployment | `/sdlc-deploy` | `release-plan.md`, `deploy-run.md` | `dev-planning-deployment` | `dev-reviewing-deployment` |
| G11 | monitoring | `/sdlc-monitor` | `observability.md`, `runbook.md`, `post-release.md` | `dev-designing-observability` | `dev-reviewing-monitoring` |

### 4.1 Gate state machine

Every gate, for every slug, is in exactly one of these states. `build-state.mjs` derives the state
from the gate logs and the artifact hashes; no state is ever set by hand.

```
NOT_STARTED ──(upstream gates satisfied)──▶ READY ──▶ AUTHORING ──▶ REVIEWING
                                                          ▲              │
                                                          │              ├──▶ PASS ──┐
                                            (attempt + 1) └──── CHANGES_REQUESTED    │
                                                                         │           │
                                                                         ├──▶ BLOCKED│
                                                                         └──▶ SKIPPED│
                                                                                     │
                       STALE ◀──(an input or output hash changed, §4.4)──────────────┘
                         │
                         └──▶ REVIEWING  (full re-review, or --reaffirm, §4.4)
```

| State | Means | Next command may run? |
|---|---|---|
| `NOT_STARTED` | upstream gates not satisfied yet | no |
| `READY` | preflight passes; nothing authored yet | no |
| `AUTHORING` | a run is in progress, artifacts not yet reviewed | no |
| `REVIEWING` | artifacts exist, the reviewer has not concluded | no |
| `PASS` | reviewed, no open `BLOCKER`/`MAJOR` | **yes** |
| `CHANGES_REQUESTED` | fixable findings; awaiting another author round | no |
| `BLOCKED` | a precondition the stage cannot supply is missing | no |
| `SKIPPED` | not applicable to this change, justified per §5.4 | **yes** |
| `STALE` | previously `PASS`/`SKIPPED`, but an input or output changed | no — re-review first |

### 4.1a How a stage ends — the human is told, not asked

Every command ends by naming **one** next command and running toward it: "G0 is `PASS`; next is
`/sdlc-requirements <slug>`, which writes the PRD and the REQ table." It does not end with "do you
want me to continue?", a list of things the human might like, or a question with no recommended
answer. The person running the ladder is paying for judgement about what comes next; a menu hands
that work back.

| Situation | What the command says |
|---|---|
| Gate `PASS` / `SKIPPED` | the next command and, in one clause, what it will produce |
| `CHANGES_REQUESTED` with findings a human must answer | the `DEC-NNN` rows opened for them, through `/sdlc-ask` (options with a recommended default, §15.2), then the resume command |
| `BLOCKED` / `STALE` | the one command that clears it (`/sdlc-ask`, `/sdlc-gate --reaffirm`, re-run the stage), with the reason |
| A genuine fork only a human can take | an `/sdlc-ask`-style choice: 2–4 options, the recommended one first, free text always accepted |

The board's `next:` line (`status.mjs`) is the minimum. The command may add context, but never
subtract the recommendation.

### 4.2 Ordering

- **Sequential by default.** `G<N>` runs only when `G<N-1>` is `PASS` or `SKIPPED`.
- **G3, G4, G5 are siblings** — all depend on G2, may run in any order or in parallel. G6 requires
  all three to be `PASS` or `SKIPPED`. The graph is therefore G0 → G1 → G2 → {G3, G4, G5} → G6 →
  G7 → … → G11, and staleness travels along it (§4.4) — never sideways between siblings.
- **Screen content is frozen at G1.** A wireframe the requester supplies or approves
  (`ui/<slug>/wireframe.html`) is reviewed at G1 with the requirements and listed under the G1
  log's `outputs`: which screens exist, what each shows, in which region and order. From then on
  G2–G7 build that content; none of them adds, drops or moves an element. A content change is a
  change to G1 — a `DEC-NNN` answered by the requester, then G1 re-runs and staleness cascades
  (§4.4). The wireframe never fixes look; look is decided at G5 (§13.3).
- **G11 is designed at G2, built at G7, proved at G11.** A feature that reaches G11 with no
  telemetry is a `BLOCKER`, not a follow-up ticket.

### 4.3 The author ↔ review round

- The reviewer's findings are **structured** (§5.3), not prose, so the next author round can be
  driven per finding rather than by re-reading a whole log.
- The author returns a **resolution map**: every `CR-NNN` marked `fixed`, `accepted` (with the
  change made), `disputed` (with evidence the reviewer can re-check: `path` + symbol, a test and its
  output, a contract section, a `DEC-NNN`), or `decision — DEC-NNN` (only a human can close it).
  Silence on a finding is itself a violation. Before fixing any finding the author reads them all
  and stops to ask if one is unclear; no entry claims `fixed` without the proving command run after
  the last edit and its result cited. The procedure is `dev-stage-protocol/receiving-review.md`.
- The map, verbatim, is the one piece of author text the reviewer receives (§4.5): one factual
  entry per id. The reviewer copies each entry into `Author's action` and judges it against the
  files, never against the wording.
- The reviewer then verifies **each finding individually** and records `RESOLVED` / `ACCEPTED` /
  `REOPENED`, or `DEFERRED` for a `MINOR` or `INFO` carried on with an owner and a target (§5.3). This is what makes the loop closed rather than a second opinion.
- **Only `defect` findings spend an attempt.** `drift` and `bookkeeping` (§5.3) are fixed by the
  author inside the bounded self-edit and never open a round on their own: a log whose only open
  findings are `drift` or `bookkeeping` is a `PASS`.
- **At most two full reviews per gate, then a human decides (`E045`).** Rounds are counted per gate
  since its last `PASS` or `override:`: every log that is not a reaffirm or `SKIPPED` is one, whatever
  its run-id, so a new run after `CHANGES_REQUESTED` is not a fresh start. When the second round is
  not `PASS`, the command stops and puts the open findings to the human as one `DEC-NNN` with three
  options: **fix now** (one more round), **ship with known risks** (each finding carried with an owner
  and a target gate; the gate is held by an `override:` that cites the DEC), or **abandon the slug**.
  A third or later round's log carries `round_decision: DEC-NNN`, answered by a human. G7, G8 and G9
  count the same way: a fix lane after G7's second round, or a third G8 run, is a third round and
  needs the DEC. `attempt` within one run stays 1 or 2 (E009).
- **A finding that only a human can resolve** (a count, a cost, a priority, a date) becomes a
  `DEC-NNN` with options (§15.2) and goes through `/sdlc-ask` *before* attempt 2, never as a
  free-text question in chat. Attempt 2 is the last one. Spending it before the answer exists
  means the author has to invent the number, and the reviewer is required to reject it.
- `attempt` resets to 1 when a stage is re-entered after `STALE` or a human override.
- **A re-review reads what changed, not everything again.** The first review of a gate reads every
  path end to end, once. On attempt 2, and on a re-entry after `STALE`, the reviewer's brief is the
  prior log's open findings plus the diff of each output since that log judged it:
  `node <root>/scripts/reaffirm-check.mjs --since <prior log> --out <dir>` writes one diff per output,
  from the commit whose version hashes to what the log recorded, and names each output it could not
  find in history — those, and any upstream input that changed, are read in full. A G7 log with
  `reviewed_commit` gets the code diff since that commit instead of a diff of the generated
  change-summary or lane notes. The reviewer still
  opens any section a diff hunk or a finding points into, and its checklist still covers every row;
  rows the diff does not touch carry their evidence from the prior log, marked so.
- **What attempt 2 finds outside the delta does not block it (`E046`, `E047`).** A finding that is
  neither an attempt-1 finding nor in the diff is class `follow-up`: its severity is kept, it names an
  owner and a target gate, and it is carried, not fixed in this round. Only a `BLOCKER` on security or
  data loss stays a `defect`. An attempt-2 log whose attempt-1 findings are all `RESOLVED`,
  `ACCEPTED` or `DEFERRED`, and whose other open findings are `follow-up`, `drift` or `bookkeeping`,
  is a `PASS`. A reviewer that finds something new each round would otherwise never let a gate end.

### 4.4 Staleness — what invalidates a gate

A gate log records the hashes of both the artifacts it **produced** and the upstream artifacts it
**consumed** (§5.1). `build-state.mjs` recomputes both:

| Condition | Result |
|---|---|
| An output hash differs from the log | `STALE` — the reviewed document is not the document on disk |
| An input hash differs from the log | `STALE` — the decision was made against different upstream facts |
| A gate this gate depends on is `STALE`, directly or through the §4.2 graph | it goes `STALE` too — `(upstream G<N>)`, naming the gate that went stale on its own account |

Propagation follows the **dependency graph** of §4.2, not ladder order: a gate is `STALE` only if one
of its own inputs or outputs changed, or if a gate it depends on — directly or transitively — is
`STALE`. Siblings are not dependencies, so a stale G3 leaves G4 and G5 as they were, and still
reaches G6. An unstarted gate is no gap: a stale G2 reaches G6 even when G3 and G4 have no log.

**G7 binds code by commit, not by document.** The code G7 judges does not live under `<root>/`, and
the change summary that indexes it is **generated** — `node <root>/scripts/change-summary.mjs <slug>`
builds it from `git log <merge-base>..HEAD`, `tasks.md`, `progress.md` and the lane notes — so it
is neither hand-edited nor a hash input. The final G7 log records `reviewed_commit:` (§5.1) and
lists no `change-summary.md` under `outputs`; with `reviewed_commit` set, `outputs` may be empty.
The gate is `STALE` when code (anything outside `<root>/` and `.claude/` — the installed bundle and
the profile are not code) differs between `reviewed_commit` and `HEAD`
(`change-summary.mjs <slug> --code-changed-since <sha>` exits 1). Regenerating the summary, or
editing a lane note, stales nothing. `reviewed_commit` on another gate, or not a sha, is `error`
E031; a final G7 log without it, or still listing `change-summary.md` as an output, is `warn`
W031. A `change-summary.md` without `generated_by: change-summary.mjs`, or citing `file:line`,
is `warn` W032.

**A gate that passes commits its artifacts.** `--reaffirm` works by diffing the version a verdict was
reached against with the version on disk, so every reviewed version has to be recoverable. If gate
logs and artifacts are committed at irregular moments, the prior version is simply not there, the
reviewer correctly refuses to reaffirm a change it cannot bound, and the damping valve quietly stops
existing — in exactly the projects that need it, because those are the ones with long ladders.

So a `/sdlc-*` command commits `<root>/` after a `PASS`, with the gate and run-id in the message. This
is the cheapest possible mechanism and it is load-bearing: the alternative is a reviewer that
reaffirms a diff it could not verify, which is worse than no damping at all.

**Damping: `--reaffirm`.** Cascading staleness is correct but blunt — fixing a typo in
`requirements.md` should not force a full re-review of G2 through G11. `/sdlc-gate <slug> <G>
--reaffirm` gives the reviewer only the **diff of the changed input** and one question: does the
prior verdict still hold? It writes a new log with `revalidated_from: <prior log>` and a summary of
the diff it judged. If the diff is substantive, the reviewer declines to reaffirm and the stage
re-runs normally. What it must never do is reaffirm a change it did not read.

**Batch: `--reaffirm-all`.** One upstream change usually stales several gates at once: a ledger
answer cited by G0 to G6 is seven reaffirms of the same diff. `/sdlc-gate <slug> --reaffirm-all`
runs **one** reviewer pass over the cascade and writes **one log per gate**, each with its own
`revalidated_from`, its own checklist and its own verdict, so a decline on one gate re-runs that
gate alone. `node <root>/scripts/reaffirm-check.mjs --cascade <slug>` plans it mechanically:

| Group | Which gates | What happens |
|---|---|---|
| `reaffirm` | `STALE` on their own account, every changed entry an **input** whose recorded version is in git history | in the batch; each changed input is diffed once, from the commit the plan names |
| `follows` | `STALE` only as `(upstream G<N>)` | no log: they clear when their origin's new log is in force |
| `excluded` | an **output** changed (own-artifact edit, or `code` at G7), or a recorded version is not in history | not in the batch — the single-gate `--reaffirm` bound (self-edit) or a re-run |
| `excluded` (waits) | a gate that depends, through §4.2, on an excluded gate | not in the batch until that gate has a new log in force: reaffirming against an upstream nobody has re-judged approves an unreviewed foundation |

The reviewer judges each gate against the diffs of **its own** changed inputs only, in ladder order.
Batching changes how many passes run, never what a reaffirm is allowed to accept.

**Bounded self-edit reaffirm.** A gate's **own** artifact may also be reaffirmed rather than
re-reviewed, but only for a small edit, and only measured from the version the last **full** review
judged — never from an earlier reaffirm, or two small edits would add up to a large one nobody read.

| The bound | Checked by |
|---|---|
| At most **40 changed lines** (added + removed) in the artifact body | `node <root>/scripts/reaffirm-check.mjs <artifact> --against <recorded sha256>`, which finds the reviewed version in git history by the hash the last full review recorded |
| No `##` heading added, removed or renamed | the same script |
| No id appears or disappears, and no table row that **defines** an id (`REQ-NNN`, `TASK-NNN`, `ADR-NNN`, `DEC-NNN`, …) changes | the same script |
| No changed line sits in a section a checklist row of the gate's review judged | **the reviewer** — which section a check rests on is meaning, not syntax; the reviewer reads the prior log's Checklist evidence and every line of the diff |
| An ADR amendment: lines **added** to `## Amendments` only (the section itself may be new), nothing removed there | the same script reports it as amendment-only; ids cited in a new amendment are citations, not changes |

Inside the bound, the reviewer writes a new log with `revalidated_from: <the full review>`, the new
output hashes, and the diff it judged as a fenced `diff` block in `## Scope`. Outside it — or when
the reviewed version cannot be found in history — the stage re-runs. `dev:lint` checks what can be
checked after the fact: `revalidated_from` names an earlier log of the same gate, and a log whose
output hashes differ from that log's reaffirms a full review and carries the diff (`error` E026).
`state.json` records `revalidated_scope: upstream | own-output` on a reaffirmed stage.

### 4.5 Who may do what

- **No self-approval.** A stage's review skill is a different skill, run by a different subagent
  with a **fresh context**, and it **may not edit the artifact** — it writes findings; the authoring
  stage fixes them.
- **A reviewer may run read-only commands, and should.** Author and reviewer share a model, so a
  reviewer that only reasons is capped at the same ceiling as the author it is checking. What
  raises the ceiling is execution: run the linter, run `EXPLAIN` on a query the data model claims is
  indexed, build the branch, grep the codebase to test a claim that "nothing else uses this". A
  verdict backed by command output is worth more than a paragraph of plausible reasoning, and §5.3
  already demands evidence — this says where the good evidence comes from. Read-only only: a
  reviewer never migrates, pushes, deploys, or edits.
- **Returning `PASS` with zero findings is correct and common.** A reviewer is not scored on how
  much it finds. Padding a log with `MINOR` observations to look thorough is the fastest way to
  teach a team that gate logs are not worth reading, and a pipeline whose logs nobody reads has
  lost the only thing it was built for.
- **Context isolation is an implementation rule, not an aspiration.** The command passes the
  reviewer **paths only** — never pasted artifact content, never the author subagent's summary,
  transcript, or self-assessment. A reviewer that has read the author's reasoning inherits its
  blind spots, which is the exact failure this design exists to prevent. The one exception is the
  attempt-2 resolution map (§4.3): one claim per finding id, each checked against the files.
- **Mechanical work runs on the cheaper model.** `dev-reaffirmer` (a `--reaffirm` review, §4.4)
  and `dev-bookkeeper` (lint fixes, `drift`/`bookkeeping` fixes under the self-edit bound, the
  change-summary fold, worktree pruning) declare `model: sonnet`. Every author and every full review
  keeps the default; `tests/bundle.test.mjs` enforces both.
- **Override is human-only and recorded.** `override: <human name> — <reason>` in the gate log. An
  agent that writes an override row for itself is a contract violation.

---

### 4.6 Autonomy — an unattended run

`SDLC_AUTONOMY` (an env var), else `DEV-PROFILE §Gate policy` `Autonomy`, else `off`. A run is
started by a named human (`autonomy.mjs start --run <run-id> --by <name>`). Everything else in this
section holds in every mode: reviews, two attempts per gate, green tests.

| Mode | At a DEC | At a hard stop |
|---|---|---|
| `off` | asked through `/sdlc-ask`, as today | asked |
| `assisted` | one that blocks no gate is taken on its recommended default; one that blocks a gate is asked | stopped |
| `full` | taken on its recommended default | stopped |

**A taken default** is written by `autonomy.mjs assume <slug> <DEC> --run <run-id> --reason <why>`.
The row is `status: assumed`, and the answer is `<default> — who: autonomous-run <run-id> (started by
<name>); reason: …; alternatives: …`. It names the human who authorised the run, so E017 holds. It
is still an assumption: Needs you lists it, `/sdlc-ask` confirms it in one batch, and one that is
unconfirmed at G9 is `MAJOR` (§15.2).

**Hard stops.** `autonomy.mjs check <action> --run <run-id>` runs before every such action, and the
run obeys its exit code. Each stop is recorded in `runs/<run-id>/stops.jsonl` and written as an
activity event with `needs` set.

| Class | Actions | Exit |
|---|---|---|
| outward or irreversible | `deploy-prod` · `merge-main` · `push-main` · `delete-data` · `spend` | 3: stop and report |
| security exception | `suppress-scanner` · `widen-access` | 3 |
| named-human sign-off | `ui-approval` (G5) · `release-signoff` (G9) | 4: provisional. The run continues on its branch, and `merge-main` stays stopped until a human signs |
| budget | any action once `SDLC_BUDGET_TOKENS` or `SDLC_BUDGET_MINUTES` is exceeded (`autonomy.mjs budget --tokens <n>` adds a spend) | 3 |

**The report.** `autonomy.mjs report --run <run-id>` writes `runs/<run-id>/report.md`. It lists the
gates, the decisions the run took, and its stops, and it is the merge request description that
`ci/gitlab-autonomy.yml` opens as a Draft. The job never merges. After review, a human runs
`autonomy.mjs resolve --run <run-id> --by <name>`, which writes the `pass` that clears the run's
stops from Needs you. `build-state` clears G5's and G9's needs itself, when `visual-design.md` is
approved and when G10 passes.

## 5. Gate log format (the review artifact)

Path: `<root>/reviews/<slug>/G<N>-<stage>-<run-id>.md`, and `…-<run-id>-a<N>.md` from the second round
onward. In a written log `<root>` is the root's real name — `.sdlc/…` or `dev/…`, never the
placeholder; both are read (§2). Written **only** by that stage's review skill. Logs are never edited after the fact — a
second round writes a **new** log, because the history of what was wrong is as valuable as the final
`PASS`.

The suffix exists because three otherwise-sensible rules could not all hold at once: §1 gives a
whole stage execution **one** run-id, this section names the file after the run-id, and a second
round must write a **new** file. Something had to give, and the least costly was the filename —
inventing a second run-id would have broken the one property §1 is for, which is following a single
thread through preflight, authoring, review and resolution.

Attempt 1 omits the suffix, so every log written before this rule stays valid. **The filename is not
how the current log is chosen** — `build-state.mjs` orders by `run_id` then `attempt`, from the front
matter. It used to order by filename, and `-` sorting before `.` meant a second-round `PASS` lost to
the `CHANGES_REQUESTED` it had just resolved.

### 5.1 Front matter

```yaml
---
slug: <slug>
gate: G<N>
stage: <stage>
run_id: <YYYYMMDD-HHMMSS-xxxx>  # UTC + 4 lowercase hex, from <root>/scripts/run-id.mjs (§1)
attempt: <1|2>
verdict: <PASS | CHANGES_REQUESTED | BLOCKED | SKIPPED>
reviewer: <review skill name>
inputs:                       # upstream artifacts this decision depends on
  - path: <root>/requirements/<slug>/requirements.md
    sha256: <hex>
  - path: <root>/decisions/<slug>.md#DEC-002,DEC-007   # only the ledger rows relied on (§5.2)
    sha256: <hex of those rows>                     # build-state.mjs --hash '<root>/decisions/<slug>.md#DEC-002,DEC-007'
outputs:                      # every artifact this gate produced and this review judged
  - path: <root>/design/<slug>/architecture.md
    sha256: <hex>
  - path: <root>/design/<slug>/threat-model.md
    sha256: <hex>
findings: { blocker: 0, major: 0, minor: 2, info: 1 }
unlocks: <the gate(s) this PASS releases, or none>   # G2 unlocks G3·G4·G5 — see §4.2; derived state ignores this field and recomputes from the ladder, so it is documentation, not control
skip_reason: <null | { type: NOT_APPLICABLE|DEFERRED|HUMAN_OVERRIDE, explanation: "...", who: "...", ticket: "...", until: "YYYY-MM-DD" }>
override: <null | "<name> — <reason>">
revalidated_from: <null | <root>/reviews/<slug>/G<N>-<stage>-<prior-run-id>.md>
round_decision: DEC-NNN       # a third or later full review of this gate since its last PASS: the human's answer (§4.3)
reviewed_commit: <sha>      # final G7 log only — the code revision judged; replaces hashing change-summary.md (§4.4)
scope: slice-<n>              # optional, G7 only — a per-slice review, never the gate's verdict (§5.5)
---
```

A gate with several artifacts lists **all** of them under `outputs`. A single `artifact_sha256`
cannot represent a stage that produces three files, and a gate that hashes only one of them is
blind to edits in the other two.

### 5.2 Hashing rules

- The hash is **SHA-256 of the artifact body only** — everything after the closing `---` of the
  front matter, with CRLF normalised to LF and trailing whitespace stripped.
- Front matter is excluded on purpose: `updated:` changes on every touch and `status:` is written
  *by the reviewer itself* after the review. Hashing them would make every gate stale the moment it
  passed.
- For non-markdown artifacts (`openapi.yaml`, `.proto`, log files) the hash covers the whole file.
- **The decision ledger may be hashed by row.** An input `<root>/decisions/<slug>.md#DEC-002,DEC-007`
  covers only those rows of `## Decisions`: each row's cells trimmed and joined with ` | `, in id
  order, one per line, then hashed. Answering DEC-001 then stales no gate that did not cite it, and a
  new row stales nothing. A cited row that no longer exists hashes to nothing, and the gate is
  `STALE`. Only the ledger may be cited by row, and only by well-formed DEC ids that the ledger has:
  `error` E025. A reviewer cites the rows its gate relied on — the decisions its artifacts name or
  are blocked by.
- **A whole-ledger input is read as row-scoped.** An input `<root>/decisions/<slug>.md` with no `#`
  whose hash no longer matches is not `STALE` on that account alone. `build-state.mjs` finds the
  reviewed version of the ledger in git history by the recorded hash (as §4.4 does for an artifact)
  and compares only the **relied-on rows**: the `DEC-NNN` ids the log's body cites, plus the rows
  whose `Blocks` cell names the log's gate, as they stood in the reviewed version. The input is
  current while every one of those rows is unchanged; a new row stales nothing. When the reviewed
  version cannot be found, or the log relies on no row at all, whole-body semantics apply.
  `state.json` lists the rows it compared as `rows` on that input. A new log cites by row; a
  whole-ledger input is `warn` (§11.2).
- **Migrating old logs.** `node <root>/scripts/migrate-ledger-inputs.mjs` rewrites each whole-ledger
  input to the same relied-on rows in the `#DEC-…` form, hashed as they stood in the reviewed
  version, so a gate that was stale stays stale. It is a dry run unless `--write`, and it is the one
  sanctioned edit to a written log (§5): the input's `path` and `sha256`, never a verdict, a finding
  or the body. A log whose reviewed ledger cannot be found is left alone and reported.

### 5.3 Findings and their resolution

```markdown
## Checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | <check, quoted from the review skill's published checklist> | PASS / FAIL / N/A | <quote · file:line · command output> |

## Findings

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
| CR-001 | BLOCKER | defect | architecture.md §Data flow | <what is wrong> | <what shows it> | <what must change> | <stage / skill> |

## Finding resolution        <!-- attempt ≥ 2 only -->

| Id | Author's action | Reviewer verdict | Evidence |
|---|---|---|---|
| CR-001 | fixed — <what changed> | RESOLVED / ACCEPTED / REOPENED / DEFERRED | <file:line of the fix> |
| CR-002 | not fixed — <why not now> | DEFERRED | owner: <who> · target: <G<N> or TASK-NNN> |
```

**Deferring a finding.** `DEFERRED` carries a `MINOR` or `INFO` finding forward on purpose: the row
names an **owner** (`owner: <who>`) and a **target** — the gate or task where it is next dealt with
(`target: G11`, `target: TASK-014`) — as `owner:` and `target:` in the row, or in columns of those
names. It is the only resolution a reviewer may write on attempt 1, for a finding carried from an
earlier gate. A `BLOCKER` or `MAJOR` is never deferred: it blocks a `PASS`. `error` E023 for a
deferral with no owner or target, or of a `BLOCKER`/`MAJOR`. A deferred finding stays open in
`state.json`; it is owned, not closed.

**A `MINOR` carried by three gates is a warning.** When the `## Carried forward` sections of the logs
in force for three gates other than the one that raised it all name a `MINOR`, and no log in force
has resolved, accepted or deferred it, `dev:lint` reports `warn` W004 on the latest of those logs.
Fix it, or defer it with an owner and a target.

| Severity | Definition | Blocks a PASS |
|---|---|---|
| `BLOCKER` | Wrong, unsafe, or unimplementable as written | yes |
| `MAJOR` | Will cause rework, an outage, or a contract break later | yes |
| `MINOR` | Quality or clarity; does not change behaviour | no — recorded, carried forward, or `DEFERRED` with an owner and a target |
| `INFO` | Observation, alternative, future work | no — may be `DEFERRED` like a `MINOR` |

**Every finding has a class.** The `Class` column takes one of three values, and the class caps
the severity:

| Class | Means | Severity | Counts toward the 2-attempt limit (§4.3) |
|---|---|---|---|
| `defect` | the artifact or the code is wrong: it would build, ship or decide the wrong thing | any | yes |
| `drift` | two documents disagree, or a document no longer describes what it cites, and nothing built from it would change | `MINOR` or `INFO` | no |
| `bookkeeping` | front matter, counts, ids, cross-references, a citation that moved | `MINOR` or `INFO` | no |
| `follow-up` | an attempt-2 finding outside the attempt-1 findings and the diff (§4.3); names an owner and a target gate | any | no — carried, not fixed in this round |

A `drift` or `bookkeeping` finding at `BLOCKER` or `MAJOR` is `error` E030: if the disagreement
would change what gets built, it is a `defect`, and the reviewer says which reader it misleads. The
author fixes `drift` and `bookkeeping` findings inside the bounded self-edit of §4.4 — no new review
round, no attempt spent — and a later full review or reaffirm checks them. A log whose Findings table
has no `Class` column predates this rule and is read as all `defect`.

**Prose cites symbols, not lines.** A prose artifact points at code as a path plus a symbol —
`internal/job/service.go` `AssignJob` — never `file:line`, because a line number goes stale on the
next commit while the symbol does not. A `file:line` that has moved is therefore never a finding on
its own account; the evidence cell of a gate log may still quote `file:line`, since a log is
immutable and records one revision.

**Evidence is not optional.** A checklist row with an empty evidence cell is `FAIL`, because a check
nobody can retrace is not a check. Evidence is one of: a quote from the artifact, a `file:line`
reference, or command output. A reviewer that cannot read its artifact returns `BLOCKED`, never
`PASS`.

`N/A` applies to a **checklist row** ("this artifact has no migration, so the round-trip row is
N/A"). `SKIPPED` applies to a **whole gate**. They are not interchangeable.

### 5.4 SKIPPED — a written act, with a typed reason

A stage a change does not need still produces a gate log. Absence of a log is never a skip; it is a
block. `SKIPPED` is a first-class verdict — not a `PASS` with a note — so `state.json` and CI can
tell "we checked and it does not apply" apart from "we checked and it is fine".

| `skip_reason.type` | Who may declare it | Requires |
|---|---|---|
| `NOT_APPLICABLE` | **the reviewer only** | the applicability rule from the reviewing skill, quoted, plus why this change does not meet it |
| `DEFERRED` | a human | a ticket and an `until` date; the gate returns to `READY` on that date |
| `HUMAN_OVERRIDE` | a named human | the name and the reason, in writing |

**An author may never declare a skip.** If the authoring stage could skip its own gate, every gate
would be optional, and the ladder would be decoration.

### 5.5 Slice mode — lane notes and per-slice G7 logs

G7 may be built in slices, each split into lanes with disjoint files
(`skills/dev-stage-protocol/slice-mode.md`). Two things then exist that a single-implementer G7 does
not have, and neither may be confused with the gate's own record:

| Thing | Rule |
|---|---|
| **Lane notes** — `implementation/<slug>/lanes/lane-<x>.md` | `artifact: change-summary`, the same front matter and headings, the narrative for that lane's tasks only (what was built, deviations, known weaknesses); `<x>` is lowercase kebab, and a single implementer writes `lane-main.md`. Another name or artifact type there is `error` E015. Notes cite code as path + symbol, never `file:line` (§5.3). They are never a G7 output: `change-summary.mjs` folds them into `change-summary.md`, and `build-state.mjs` ignores either listed in a G7 log's `outputs`. |
| **Slice log** — a G7 log with `scope: slice-<n>` in its front matter | Its own run-id and file name (§5); `## Scope` names the slice's base and head commit shas, else `error` E024. `scope` on any gate but G7, or not of the form `slice-<n>`, is `error` E009. A slice log is in force for its slice only (§11.1), never decides G7's state, and appears in `state.json` as the G7 stage's `slices` list. |
| **Lane budget** | At most **6 lanes** run at once, and a slug's lanes are planned at G6 — G7 adds none. A review finding goes back to the lane that owns the file it names, as a new task row in that lane's list; a lane is never opened per finding or per review round. A lane rebases onto the feature branch before hand-back and merges `--no-ff` as `merge(lane-<x>): …` (§18.1); then its worktree is removed and its branch deleted (`git worktree remove`, `git branch -d`). |
| **Final G7 log** — no `scope` | The review of the whole branch against the PR merge base. It alone decides G7, so G8 and G9 depend on it. Until it exists, G7 is `AUTHORING` however many slices have passed. |

---

### 5.6 Deferred to CI — a NOT RUN that must be proven

A G8 row may be `NOT RUN` because this machine lacks a capability CI has — a cgo C compiler for
`-race`, `psql`, Docker — and CI runs the gate instead (`doctor.mjs --capabilities` names what is
missing). The reason then names CI. That is a promise, not evidence, and it is kept at G9:

1. `pull-request.md` `## Gate logs` carries one line per deferred row:
   `CI proof: <gate, as named in verify.md> — <CI job URL, or a <root>/ path to its saved log> — passed`.
2. G9 may not `PASS` while a deferred row of the verify.md the G8 log in force cites has no such
   line. `warn` W060 on that verify.md until the proof exists; `error` E060 on a G9 `PASS` log in force
   without it.
3. A CI job that failed, or that skipped the gate, is not proof; the row goes back to G8.

## 6. Traceability

```
problem → REQ-NNN → {ADR-NNN, ENT-*, API-*, screen, SLO-NNN} → TASK-NNN
        → code + unit/integration test → acceptance criterion → deployed + observed
```

| Rule | Enforced by |
|---|---|
| Every REQ has ≥1 acceptance criterion | `dev-reviewing-requirements` |
| Every REQ is realised by ≥1 TASK | `dev-reviewing-plan` |
| Every TASK names its target files | `dev-reviewing-plan` |
| Every non-trivial TASK ships with a test in the same commit, written and seen failing before the change (red first) | `dev-reviewing-implementation` |
| Every `API-*` in the contract is implemented or explicitly deferred | `dev-reviewing-api` |
| Every `ENT-*` change has a `MIG-*` with a working `down` | `dev-reviewing-data` |
| Every user-visible NFR has an `SLO-NNN` with an alert | `dev-reviewing-monitoring` |
| Every `unit` / `integration` AC and every `UB-NNN` behaviour row is named, by id, in a test's title or comment (§13.10) | `trace.mjs --check` at G7; `dev-reviewing-implementation` |
| An orphan reference — an id cited in one file that the file meant to define it does not define | `dev:lint` — hard error, per slug, below |

`dev:lint` checks these across files, per slug. Each check runs only when the defining file exists:
a `fix` has no `requirements.md`, and a reference to a file not yet written is the reviewer's
question, not a dangling id. Ids inside code spans and fenced blocks are quoted, not cited.

**AC → test.** `trace.mjs <slug>` reads the ids the `Criteria` and `Negative and edge cases`
tables define and the `UB-NNN` rows the ui-spec defines, then searches the test files (Go
`*_test.go`, TS/JS `*.test.*` / `*.spec.*` / `__tests__/`, Python `test_*.py` / `*_test.py`) for each
id by word boundary. An id of tier `automation` or `manual` is the QA bundle's and is listed, never
required (§9). An id named only in non-test code is untraced, and reported as such. `--check` exits 1
on any untraced id; the G7 evidence cell carries its counts.

| Code | A reference that fails | Defined in |
|---|---|---|
| `E018` | a `REQ-NNN` in the REQ column of an `acceptance-criteria.md` row or a `tasks.md` `## Tasks` row | `requirements.md` — `## Functional requirements`, `## Non-functional requirements` |
| `E019` | an `AC-NNN` anywhere in `tasks.md` | `acceptance-criteria.md` — `## Criteria`, `## Negative and edge cases` |
| `E020` | a `TASK-NNN` in a `Depends on` cell | the same `tasks.md` |
| `E021` | a dependency cycle among the tasks, a task that depends on itself included | — |

**Breaking-change rule (API and schema).** Removing or renaming a field, tightening a type, changing
a status code, or narrowing an enum is **breaking**. It requires an entry in `contract-diff.md`, an
ADR, a version or deprecation window, and a `MAJOR` acknowledgement in the G4 log. It may never be
*discovered* during implementation — if it is, implementation stops and G4 re-runs.

---

## 7. Migration contract

| Rule | Detail |
|---|---|
| Reversible | Every `*.up.sql` has a `*.down.sql` returning the schema to its prior state. Irreversible by nature (data loss) → stated in `migration-plan.md`, ADR required, human sign-off in the G3 log. |
| One concern per migration | One MIG changes one thing. Mixed DDL + backfill in one file is a `MAJOR` finding. |
| Expand → migrate → contract | Add nullable/new → backfill + dual-write → drop. Never drop in the release that stopped using it. |
| Backfill is separate and chunked | A backfill that long-locks a large table is a `BLOCKER`. |
| Engine-aware | Postgres and MySQL differ on DDL transactionality, `CREATE INDEX CONCURRENTLY` / `ALGORITHM=INPLACE`, enums, charset and collation. The two designing skills own those rules. |
| Ordered against deploy | `release-plan.md` states whether the migration runs before, with, or after the code — and the rollback order. |
| Stated at ship | Every class: `pull-request.md` `## Rollout and rollback` gives `db_change` (additive, expand, contract — <release>) and `data_change`, and states N-1 compatibility, lock risk, the backfill, the snapshot per host and the DB rollback. A migration that changes rows already there adds `### Data` (§13.4). `deploy-plan-check.mjs` fails a diff that needs it and lacks it. |
| Round-trip proof | `up → down → up` runs clean at G8; the output is attached to that log. |
| Naming | `<YYYYMMDDHHMM>_<lowercase_kebab>.{up,down}.sql`, timestamp = the MIG id. |

---

## 8. `state.json` — a derived read model, not a source of truth

The gate logs and the artifacts are authoritative. `state.json` is **generated** from them, never
hand-edited, and regenerated at the end of every `/sdlc-*` command and on the `Stop` hook. Its
purpose is that nothing outside this bundle has to parse markdown — `/sdlc-status`, `DASHBOARD.md`,
CI and any editor extension read this one file.

**`state.json` and `DASHBOARD.md` are not tracked in git** (`<root>/.gitignore`, §18.5). Every lane
rewrote both on every turn, so they were the two most-conflicted files in the repository, and a
conflict in a derived file has no right answer to pick. The `SessionStart` hook builds them when
they are missing, the `Stop` hook after every turn, CI before it reads them; the editor extension
reads the file on disk, which those hooks keep current. `merge=ours` was rejected: it needs a merge
driver configured in every clone, and without one git silently falls back to a text merge.

If `state.json` and the gate logs disagree, **the gate logs are right**. The header exists so that
disagreement is detectable rather than silent:

```jsonc
{
  "schema": 1,
  "generator_version": "1.6.0",     // bump when the derivation logic changes
  "generated_at": "2026-09-18T21:00:00Z",
  "source_hash": "<sha256 over all gate-log and artifact hashes, sorted>",
  "project": "<name from DEV-PROFILE>",

  // GK, per repository (§16.2). Shaped like a stage so consumers render it with the same code,
  // plus `cards` for the grounding commits. Its `outputs` are the six cards, which is how editing
  // a card after its review makes GK STALE through the ordinary rule rather than a special one.
  "knowledge": {
    "gate": "GK", "stage": "knowledge",
    "state": "PASS",
    "run_id": "20260918-101500-4c7b",
    "attempt": 1,
    "log": "<root>/reviews/_repo/GK-knowledge-20260918-101500-4c7b.md",
    "inputs": [],
    "outputs": [{ "path": "<root>/knowledge/codebase-map.md", "sha256": "…", "current": true }],
    "findings": { "blocker": 0, "major": 0, "minor": 1, "info": 0 },
    "open_findings": [],
    "skip_reason": null,
    "updated_at": "2026-09-18T10:15:00Z",
    "cards": [{ "path": "<root>/knowledge/codebase-map.md", "sha256": "…", "grounded_at": "8556e8f" }]
  },

  "initiatives": [{
    "slug": "test-case-management",
    "tracker": "none",
    "title": "Create, list and edit test cases",
    "change_class": "initiative",      // §15.1 — decides which gates run at all
    "current_gate": "G6",
    "blocked": false,
    "stages": [{
      "gate": "G2", "stage": "design",
      "state": "PASS",              // the §4.1 state machine, not a free-form string
      "run_id": "20260918-143522-a81f",
      "attempt": 1,
      "log": "<root>/reviews/test-case-management/G2-design-20260918-143522-a81f.md",
      "inputs":  [{ "path": "<root>/requirements/test-case-management/requirements.md", "sha256": "…", "current": true }],
      "outputs": [{ "path": "<root>/design/test-case-management/architecture.md",       "sha256": "…", "current": true }],
      "findings": { "blocker": 0, "major": 0, "minor": 2, "info": 1 },
      "open_findings": ["CR-004"],
      "skip_reason": null,
      "updated_at": "2026-09-18T14:35:22Z",
      "rounds": { "used": 1, "cap": 2 },      // full reviews since the last PASS or override; past the cap a human decides (§4.3)
      "first_log_at": "2026-09-18T14:35:22Z", // the gate's first log, so the board shows how long it has been open
      "tokens": null                          // only what size.mjs actual recorded; never estimated
    }],
    "requirements": [{ "id": "REQ-001", "title": "…", "tasks": ["TASK-003"], "covered": true }],
    "tasks": [{ "id": "TASK-003", "title": "…", "status": "done",
                "files": ["internal/testcase/create.go"], "requirements": ["REQ-001"],
                "depends_on": ["TASK-001"],   // the `Depends on` cell; `status.mjs <slug> --ready` plans waves from it
                "tests": ["internal/testcase/create_test.go"] }],
    "decisions": [{ "id": "DEC-001", "question": "…", "status": "open",   // §15.2
                    "blocks": ["G2", "TASK-004"],  // `blocking` is true only when a GATE is blocked;
                    "blocking": true,              // a decision that blocks one task does not stop the initiative
                    "answer": "—" }]               // the ledger's own placeholder, carried through verbatim
  }]
}
```

`current: false` on any input or output is what renders a stage `STALE`. **Compatibility:** `schema`
only increases; fields are added, never repurposed. A consumer meeting an unknown `schema` says so
rather than guessing. A consumer whose recomputed `source_hash` differs from the stored one treats
the file as stale and re-runs the builder.

### 8.1 Execution progress — `implementation/<slug>/progress.md`

`tasks.md` is the reviewed plan, and its body is hashed in the G6 log. Marking a task done there
changed that hash and turned G6 `STALE`, for a change no reviewer needs to see. So execution status
lives in a separate file:

```markdown
| Task | Status | Commit | Note |
|---|---|---|---|
| TASK-003 | done | 7b41e0d | — |
| TASK-004 | blocked | — | waiting on DEC-002 (the page size) |
```

| Rule | Detail |
|---|---|
| Not a gated artifact | No gate lists it as an input or output, no reviewer judges it, and it needs no front matter. Editing it never stales a gate. |
| Status | `todo` · `in-progress` · `blocked` · `done` (§10); `in_progress` is accepted as a spelling of `in-progress`. Anything else is `error` E009. |
| Append, last row wins | The implementer appends a row when a task changes state; several rows per task are allowed and the last one is current. `Commit` is the commit that finished the task, or `—`. |
| A blocked row says why | `Note` names what it waits on — a `DEC-NNN`, a `TASK-NNN`, or the outside dependency. A blocked row with an empty Note is `error` E022. |
| Planned tasks only | Every `Task` is a `TASK-NNN` in the same slug's `tasks.md`; any other is `error` E022. |
| `tasks.md` holds plan-time status | `todo` or `blocked` (blocked at plan time: a dependency the plan already knows is missing). `in-progress` or `done` in `tasks.md` is still read, for projects that predate this file, but is `warn` W007. |

`build-state.mjs` reads each task's status (and `commit`, and `blocked_by` from a blocked row's
Note) from `progress.md` when the file exists, and falls back to the `tasks.md` Status column for a
task with no progress row. `status.mjs <slug> --ready` plans its waves from that status.

---

## 9. The dev / QA boundary

`<qa-root>` is the QA bundle's root: `.stlc/` in a project installed with qa 2.2 or later, `qa/`
before. It is found the way that bundle finds it: `QA_ROOT`, then PROJECT-PROFILE `QA root` (not
while it says `(default)`), then whichever of `.stlc/` or `qa/` exists, `.stlc/` first
(`findQaRoot` in `<root>/scripts/lib/root.mjs`). A reader that finds nothing under one name looks
under the other.

| | `agentic-fx-dev` (this bundle) | `agentic-fx-qa` (`stlc`) |
|---|---|---|
| Commands | `/sdlc-*` | `/qa-*` |
| Writes | production code, `<root>/**` | `<qa-root>/**` only |
| Tests owned | unit, integration (beside the code) | test cases, e2e, performance, security, a11y, mobile |
| Reads | `<qa-root>/reports/**` and `<qa-root>/defects/**`, read-only, at G10 and G11 | `<root>/release/<slug>/qa-handoff.md` |
| Never | writes `<qa-root>/**`, invokes a `/qa-*` command, edits a test case | edits production code or `<root>/**` |

**The handoff packet** (`<root>/release/<slug>/qa-handoff.md`, written at G9) is the only channel. It
carries the slug, tracker key, the REQ table, the acceptance criteria, the API contract path, the
data model path, the shipped commit SHA, and the list of **automation-tier criteria** — those
observable only by running the product, which this bundle deliberately did *not* cover with unit or
integration tests. That list is the QA bundle's input, and a silent gap there is how regressions
ship.

The QA bundle consumes it with `/qa-analyze <slug> <root>/release/<slug>/qa-handoff.md`: it keeps the
`REQ-NNN` ids verbatim (both contracts forbid renumbering), treats the automation-tier list as its
scope, and cites the shipped SHA.

**The verdict comes back the same way.** `/qa-report` writes `<qa-root>/reports/<slug>/YYYY-MM-DD-report.md`
with one pass/fail line per quality gate, and `/qa-signoff` writes a GO / NO-GO / CONDITIONAL GO
recommendation under `<qa-root>/reports/release/`. **G10 is blocked until the latest QA report for the
slug is dated after the shipped SHA's G8 run and every gate line passes** (`overall: pass`; the
report's `date` is compared, not its `shipped_sha`), or a release sign-off covering the
slug says GO, or a named human has waived QA in writing (`DEC-NNN` answered, or `override:` in the
G10 log). A `fix` that answers a QA defect names its `DEF-<slug>-NNN` ids in the handoff so
`/qa-defect --verify` can close them. Escaped defects (`/qa-escape`) are read at G11 as input to
§17. Nothing else crosses in either direction.

**The exploratory pass is not QA.** At G7 a developer drives the slice's own screens through its
`UB-NNN` rows, per role, in a real browser (§13.3). It is a smoke check that the spec was built,
run before the review so findings return to the owning lane; it certifies nothing, writes nothing
under the QA root, and does not shrink the automation-tier list the handoff carries.

---

## 10. Vocabulary (matched byte-exact by gates, the linter, and `state.json`)

| Field | Allowed values |
|---|---|
| gate `verdict` (in a log) | `PASS` · `CHANGES_REQUESTED` · `BLOCKED` · `SKIPPED` |
| gate `state` (in `state.json`) | the four above + `NOT_STARTED` · `READY` · `AUTHORING` · `REVIEWING` · `STALE` |
| `severity` | `BLOCKER` · `MAJOR` · `MINOR` · `INFO` |
| finding `Class` | `defect` · `drift` · `bookkeeping` · `follow-up` (§5.3 — `drift` and `bookkeeping` are `MINOR` or `INFO`; `follow-up` only on attempt 2) |
| checklist `Result` | `PASS` · `FAIL` · `N/A` |
| finding resolution | `RESOLVED` · `ACCEPTED` · `REOPENED` · `DEFERRED` (§5.3 — `MINOR`/`INFO` only, with owner and target) |
| `skip_reason.type` | `NOT_APPLICABLE` · `DEFERRED` · `HUMAN_OVERRIDE` |
| `status` (artifact) | `draft` · `in-review` · `superseded` |
| `status` (task) | `todo` · `in-progress` · `blocked` · `done` — in `progress.md`; `tasks.md` holds only `todo` · `blocked` (§8.1) |
| `change_class` | `initiative` · `change` · `fix` · `refactor` · `spike` · `fast` (§15) |
| gate log `scope` | absent (the gate's own log) · `slice-<n>`, n ≥ 1, G7 only (§5.5) |
| `status` (decision) | `open` · `answered` · `assumed` · `withdrawn` (§15) |
| `project_maturity` | `greenfield` · `brownfield` (§16) |
| `stage` | `knowledge` · `intake` · `requirements` · `design` · `data` · `api` · `ui` · `plan` · `implementation` · `verification` · `release` · `deployment` · `monitoring` |
| checklist `Result`, G4 only | the three above + `NOT_RUN` (the check was not executed) · `UNKNOWN` (it cannot be judged from what exists); `N/A` always carries `— <reason>` (§13.12) |
| G4 score `status` | `PASS` · `REVIEW` · `BLOCKED` · `NEEDS_CLARIFICATION` — mapped onto a gate `verdict`, never written as one (§13.12) |

---

## 11. The linter's scope — syntax and contract, never meaning

`lint-dev.mjs` exists to make the mechanical half of this document automatic. It must stay
mechanical: **if a check needs judgement, it belongs to a review skill, not to the linter.** A
linter that starts grading quality becomes a second, worse reviewer that the author has to argue
with on every write — and because it runs on the `PostToolUse` hook, that argument costs a
write→lint→fix→write loop every time.

| Class | Blocks | Examples |
|---|---|---|
| `error` | yes — the write is reported as invalid immediately | malformed YAML front matter · missing required front-matter field · heading set differs from the template · leftover `<placeholder>` · malformed id (`REQ-1`, `CR-abc`) in prose — text inside a code span or a fenced block is quoted, not asserted, and is never judged as an id · `authored_by == reviewed_by` · gate log with an empty evidence cell · unknown vocabulary token (§10) · `state.json` edited by hand |
| `warn` | no — advisory only, collected for the reviewer | a section filled with very little content · a `N/A` with no reason · a finding with no owner · a `MINOR` carried across three gates and never deferred (`W004`, §5.3) · a stage whose artifacts and gate log name **none** of the slug's open decisions (`W018`) |

Semantic quality — is this architecture sound, is this index justified, does this SLO mean anything
— is the reviewing skill's job, on the reviewer's clean context, with evidence.

`W018` is the shape of check that stays on the right side of that line, and it is worth describing
because the temptation to push it over is strong. The expensive §15.2 failure is a stage that writes
its artifacts to one branch of an open decision — and no linter can see that, because whether a
sentence picks a branch is meaning. What a linter *can* see is that a stage produced artifacts while
a decision was open and never referred to it anywhere, including in its gate log. That is a shape,
not a judgement: it is either genuinely independent of the answer, which costs a glance, or it is
the silent version, which is the thing three consecutive gates leaked during this bundle's own
shakedown before a reviewer caught it each time. Advisory, because only the first reading is common
and a `warn` that is usually nothing must never block a write.

---

### 11.1 Superseded logs are advisory

A gate log is immutable (§5) and the improvement loop adds checks over time (§17), so a log written
before a rule existed will fail that rule forever and nothing may edit it to comply. Left alone,
`dev:lint` goes permanently red — and a build that is always red is a build nobody reads.

So the linter still **checks** every log, because a hand-edit that rewrites history must surface,
but only the log **currently in force** for a gate can fail the build. A superseded log's errors are
reported as warnings that say why. The log in force is chosen by the §5 rule: highest `run_id`, then
highest `attempt` — never by filename. It is chosen per gate **and per scope**: a slice log (§5.5) is
in force for its slice only, so a slice reviewed after the final G7 log never supersedes it.

The same holds for an **artifact** rule a reviewer enforces from a checklist row (`E080`, `E081` —
G5's Error-UX row; `E091` — G7's `ops/alerts` row): while the log in force for that gate was judged
without the row, the artifact was approved under the older checklist and the error is a warning
naming the gate to re-review. With no log for the gate yet, or one that carries the row, it is an
error. A later run that restates a finding under its id (`Carried`, `Narrowed`, `Reopened`,
`Still open`, `As in <run>`) is not a second definition for `E090`.

### 11.2 Rule codes

Every code `lint-dev.mjs` can emit, and nothing else. `tests/contract-drift.test.mjs` fails when this
table and the linter disagree, in either direction.

| Code | Class | Rule |
|---|---|---|
| `E000` | error | the file cannot be read |
| `E001` | error | no front matter, or front-matter lines outside the §3.1 / §5.1 shape |
| `E002` | error | a required front-matter field is missing; an `inputs`/`outputs` entry lacks `path` or `sha256` |
| `E003` | error | unknown artifact type — no template declares it |
| `E004` | error | the `##` headings differ from the template (§3); an ADR's `## Amendments` is optional and must come last (§1) |
| `E005` | error | a `<placeholder>` survived |
| `E006` | error | a malformed id, run-id or `grounded_at` (§1) |
| `E007` | error | `authored_by` equals `reviewed_by` |
| `E008` | error | a checklist row with no evidence (§5.3) |
| `E009` | error | a token outside the §10 vocabulary, or an `attempt` other than 1 or 2 |
| `E010` | error | `status: approved` (§3.1) |
| `E011` | error | a gate log's filename disagrees with its front matter (§5) |
| `E012` | error | `SKIPPED` without a typed `skip_reason`, or a `skip_reason` on another verdict (§5.4) |
| `E013` | error | `PASS` or `CHANGES_REQUESTED` with no `outputs` |
| `E014` | error | attempt 2 with no per-finding resolution rows (§4.3) |
| `E015` | error | an artifact filed under the wrong stage, or a lane note with the wrong name or type (§5.5) |
| `E016` | error | the decision ledger listed under `outputs` (§15.2) |
| `E017` | error | a decision `assumed` with no human named (§15.2) |
| `E018` | error | a cited `REQ-NNN` that `requirements.md` does not define (§6) |
| `E019` | error | a cited `AC-NNN` that `acceptance-criteria.md` does not define (§6) |
| `E020` | error | a `Depends on` id that is not a task in the same `tasks.md` (§6) |
| `E021` | error | a cycle in the task dependencies (§6) |
| `E022` | error | a `progress.md` row for a task `tasks.md` does not have, or a blocked row with no reason (§8.1) |
| `E023` | error | a `DEFERRED` resolution with no owner or target, or of a `BLOCKER`/`MAJOR` (§5.3) |
| `E024` | error | a slice log whose `## Scope` does not name the base and head commits (§5.5) |
| `E025` | error | a row-scoped reference that is not the ledger, is malformed, or cites a DEC the ledger lacks (§5.2) |
| `E026` | error | a reaffirm log whose `revalidated_from` is not an earlier log of the gate, or a self-edit reaffirm with no diff or chained from another reaffirm (§4.4) |
| `E027` | error | an ADR amendment entry with no leading date, or dated before the entry above it (§1) |
| `E028` | error | a ui-spec `visual_reference` that is not `{ path, sha256[, kind] }` (or a list of them), has a `kind` other than `wireframe` / `visual`, points outside the repo or at nothing, or no longer hashes as recorded (§13.3) |
| `E029` | error | a visual-design `approved_by` that names an agent, a skill, `user` or `admin`, or is set with no `approved_on` (§3.1) |
| `E030` | error | a finding `Class` of `drift` or `bookkeeping` at `BLOCKER` or `MAJOR` (§5.3) |
| `E031` | error | `reviewed_commit` on a gate other than G7, or not a commit sha (§4.4, §5.1) |
| `E032` | error | a table row whose cell count differs from its header; a `|` inside a cell is written `\|` (§3) |
| `E033` | error | a requirements.md row whose `Requirement` cell is only AC ids (`AC-001, AC-002`): the requirement itself is unwritten (§3.2) |
| `E034` | error | a committed gate log whose `run_id` is more than 10 minutes later than the commit that added it: typed by hand, not taken from `run-id.mjs` (§1) |
| `E035` | error | a `release-plan` whose `## Rollback` is empty, a comment only, or `N/A` / `none` / `TBD` (§13.4) |
| `E037` | error | an `UNVERIFIED:` claim inside an artifact's `## Decision` or `## Decisions` section: the decision rests on it (§21) |
| `E038` | error | an `initiative` problem with no `Kill:` line (§23) |
| `E040` | error | a `UB-NNN` behaviour row defined twice in one ui-spec (§1, §6) |
| `E041` | error | an architecture `## Deploy target` with a `Host:`, `Shape:`, `Environments:`, `Pipeline:` or `Who deploys:` line missing or empty, or a `Host:`/`Shape:` that cites no `DEC-NNN` and does not say `unchanged` (§18.7) |
| `E042` | error | an `initiative` `tasks.md` with no task whose `Task` starts `Walking skeleton` (§18.7) |
| `E043` | error | a G2 `PASS` in force while a `DEC-NNN` the `Host:` or `Shape:` line cites is not `answered` (§18.7) |
| `E044` | error | more than five `assumed` decisions in a ledger once a gate past G2 has a log (§15.2) |
| `E045` | error | a third or later full review of a gate since its last `PASS` or override with no `round_decision`, or one citing a `DEC-NNN` that is not `answered` (§4.3) |
| `E046` | error | an attempt-2 finding with no attempt-1 resolution row, of class `defect` below `BLOCKER`: it is a `follow-up` (§4.3) |
| `E047` | error | an attempt-2 log `CHANGES_REQUESTED` or `BLOCKED` while every attempt-1 finding is closed and only `follow-up`, `drift` or `bookkeeping` findings are open (§4.3) |
| `W001` | warn | a section with almost no content |
| `W002` | warn | `N/A` with no reason |
| `W003` | warn | a finding with no owner |
| `W004` | warn | a `MINOR` carried forward by three gates, still open and not deferred (§5.3) |
| `W005` | warn | the `findings:` counts disagree with the Findings table |
| `W006` | warn | an open decision with no recommended default |
| `W007` | warn | execution status (`in-progress`, `done`) written into `tasks.md` instead of `progress.md` (§8.1) |
| `W031` | warn | a final G7 log in force with no `reviewed_commit`, or one listing `change-summary.md` under `outputs` (§4.4) |
| `W032` | warn | a `change-summary.md` not generated by `change-summary.mjs`, or citing `file:line` (§4.4, §5.3) |
| `W018` | warn | a stage that names none of the slug's open decisions (§11) |
| `W019` | warn | a gate log in force that lists the decision ledger whole instead of the rows it relied on (§5.2) |
| `W033` | warn | a `visual_reference` with no `kind`, read as `wireframe` — it binds content and layout, not look (§13.3) |
| `E060` | error | a G9 `PASS` log in force while a G8 row deferred to CI has no `CI proof:` line in `pull-request.md` (§5.6) |
| `W060` | warn | a verify.md row `NOT RUN` because CI runs it, not yet proven by a `CI proof:` line (§5.6) |
| `W050` | warn | an OpenAPI operation in `api/<slug>/openapi.yaml` with no `x-perf` budget (§13.7) |
| `W051` | warn | an `x-perf` budget that lacks `p95_ms`, `max_queries` or `max_payload_kb`, or gives one that is not a positive number, or a `p95_ms` above the operation's `x-timeout-ms` (§13.7) |
| `E080` | error | a ui-spec of a slug with an API contract has no `### Error-UX matrix` under `## States`, or the matrix lacks a row for a `ProblemType` the contract declares or for one of the required statuses (§13.3) |
| `E081` | error | an Error-UX matrix row with an empty `Surface`, `Component`, `Copy key` or `Retry` cell (§13.3) |
| `W080` | warn | an Error-UX matrix row for a problem type the contract does not declare (§13.3) |
| `E090` | error | a `CR-NNN` defined in the `## Findings` of two runs of a slug with different `Problem` text (§3.2) |
| `E091` | error | once a slug has a G7 log, an `SLO-NNN` it defines that no `ops/alerts/*.yml` names (§18.3) |
| `W090` | warn | a banned synonym from the slug's `glossary.md` `Not` column, outside code (§3.2) |
| `W091` | warn | an id-shaped token whose prefix §1.1, `DEV-PROFILE` `Id prefixes` and the tracker key do not register (§1.1) |
| `W092` | warn | an artifact over its §3.3 word cap |
| `W093` | warn | a table cell over 300 characters in an artifact (§3.3) |
| `W095` | warn | a `post-release.md` whose `## Next` has no row (§20) |
| `W096` | warn | an artifact carries `UNVERIFIED:` claims, with the count (§21) |
| `W098` | warn | an `initiative` problem whose `## Pillars` misses a pillar or a measure (§24) |
| `E092` | error | `commit-lint.mjs`: a commit header outside Conventional Commits 1.0 or its type list (§18.1) |
| `E093` | error | `commit-lint.mjs`: no scope, or one outside `DEV-PROFILE §Delivery` `Commit scopes` + `sdlc` (§18.1) |
| `E094` | error | `commit-lint.mjs`: a subject over 72 characters, starting upper-case, or ending in a full stop (§18.1) |
| `E095` | error | `commit-lint.mjs`: a TASK, DEC or CR id in the message and not in a `Refs:` / `Done:` trailer (§18.1) |
| `E096` | error | `commit-lint.mjs`: a merge outside `merge(lane-<x>): …`, or the feature branch merged into a lane (§18.1) |
| `E097` | error | `commit-lint.mjs`: a `fixup!`, `squash!` or `wip` commit (§18.1) |
| `E098` | error | `commit-lint.mjs`: a commit on a protected branch, or a branch outside the convention (§18.1) |
| `W094` | warn | `commit-lint.mjs --range`: a commit over 500 changed lines, lock and generated files excluded (§18.1) |
| `E140` | error | a ui-spec `## States` table missing a §13.13 column, or absent (§13.13) |
| `E141` | error | a screen of `## Screens` with no `## States` row, or a states row with an empty cell (§13.13) |
| `W140` | warn | a states cell `N/A` with no reason (§13.13) |
| `E142` | error | a ui-spec with no `### Roles matrix`, a screen with no row in it, or a role cell outside `enabled`, `disabled`, `hidden`, `read-only`, `—` (§13.13) |
| `E143` | error | a roles-matrix or traceability `Operation` that is not an `operationId` of the slug's contract (§13.13) |
| `E144` | error | a screen with no `### Traceability` row, or a traceability `UB-NNN` the ui-spec does not define (§13.13) |
| `W141` | warn | a design-token breakpoint with no `## Responsive behaviour` row (§13.13) |
| `E145` | error | a gate log whose checklist has a UI score row and whose `### UI score` table is missing, malformed, or disagrees with its stated result or its verdict (§13.13) |
| `E146` | error | a visual-design `approvals` entry that is not a person, or `approvals` with no `approved_on` (§13.13) |

## 12. Rules that override an agent's judgement

These eight are cited elsewhere as `§12.1` through `§12.8`, meaning the numbered item and not a
subsection — §12 has none. The notation is worth stating because every other `§N.M` in this document
*is* a subsection, and a reader who assumes that here goes looking for a heading that does not exist.

1. **Never fake a gate.** No `PASS` without evidence for every checklist row. An honest `BLOCKED` is
   always correct; a green log that was not earned is the one unrecoverable failure.
2. **Never edit an artifact from a review skill.** Findings go in the log; the authoring stage fixes.
3. **Never let the reviewer see the author's reasoning.** Paths only (§4.5).
4. **Never invent** a tracker key, a requirement, a contract field, or a metric name. Ask, or record
   the gap as a finding.
5. **Never write a secret** into an artifact, a log, or a commit.
6. **Never widen scope inside a stage.** A discovery that changes an earlier decision goes back to
   that stage and re-opens its gate — it is not absorbed silently downstream.
7. **Never skip the template**, and never declare a gate `SKIPPED` from the authoring side.
8. **Production code is written only at G7**, only for an approved TASK, only where
   `dev-resolving-code-placement` says it goes.

---

## 13. Standards registry — what "standard" means here

Each row is a rule set a gate can fail you on. The **skill owns the detail**; this table owns *which*
skill and *which* gate. A stage may not invent a convention that contradicts a row below.

### 13.1 API standards — owner `dev-designing-api`, enforced at G4 + G7

| Topic | The rule (summary — the skill holds the full checklist) |
|---|---|
| **Collection endpoints** | **Every list endpoint is paginated. No exceptions, no "it's small for now".** Default `limit` 20, max 100, both in the contract. |
| **Pagination style** | **Cursor (keyset) by default** — `?limit=&cursor=`, opaque cursor, response `{ data, page: { next_cursor, has_more, limit } }`. Offset only when the UI genuinely needs jump-to-page, over a stable ordered key; a `MAJOR` above ~10k rows. Never both on one endpoint. |
| **Sorting** | `?sort=field,-other` — a **whitelist** in the contract; every sort ends with a unique tiebreaker (usually the primary key), or pagination silently repeats and drops rows when values tie. |
| **Filtering** | Declared per endpoint, typed, whitelisted. Free-form query strings reaching SQL are a `BLOCKER`. |
| **Total counts** | Opt-in (`?include=total`) — an unconditional `COUNT(*)` on a large table is a `MAJOR`. |
| **Errors** | RFC 9457 `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, `trace_id`, plus `errors[]` for field-level validation. One shape for the whole service. |
| **Status codes** | 200/201/202/204 · 400 · 401 · 403 · 404 · 409 · 412 · 422 · 429 · 5xx never carries a stack trace. |
| **Idempotency** | Every non-GET that creates or charges accepts `Idempotency-Key`; replay returns the original result. |
| **Concurrency** | Updates use `ETag` + `If-Match` (or a `version` field); last-write-wins needs an ADR. |
| **Naming** | Plural kebab paths, `snake_case` JSON, ISO-8601 UTC with `Z`, money as integer minor units + currency, ids opaque. |
| **Versioning** | `/v1` in the path; additive changes only within a version; breaking = new version + deprecation window + `Sunset`. |
| **Rate limits** | Documented per endpoint class; `429` returns `Retry-After` and `RateLimit-*`. |
| **Long operations** | >2s → `202 Accepted` + a status resource; never a hanging request. |
| **Bulk** | Bulk endpoints declare per-item results and partial-failure semantics. |
| **Performance budget** | Every operation carries `x-perf: { p95_ms, max_queries, max_payload_kb }` — the budget G7 tests, every check smokes and G8 measures at volume (§13.7). |
| **Problem catalogue** | Every `type` is a row of `api/<slug>/problems.yaml` with exactly one status and one sentence-case title, named by the §13.11 grammar. A single-field 422 rule is a `FieldError.code`, never a new type (§13.11). |
| **API style** | One custom-action style, one status per verb class, operationIds from the closed verb list, `is_`/`has_` boolean filters, `_id` id params, ETag on every GET of a mutable resource (§13.11). Inconsistency between two operations is a finding even where either style alone would be fine. |
| **Write declarations** | Every non-GET carries `x-idempotency: required\|exempt:<reason>` and `x-concurrency: if-match\|lww:<ADR-NNN>\|none:<reason>` (§13.11). |
| **Schema completeness** | Every property has a type, a `format` where one applies, and bounds: `maxLength`, `pattern`, `enum` or a bounded `format` on a string, `minimum` and `maximum` on a number, `maxItems` on an array. Every object lists `required` (`[]` when all are optional). Null is explicit, `type: [x, 'null']` and never `nullable`, and an optional field states its default or that absence means none. |
| **PATCH** | JSON Merge Patch (RFC 7396), `application/merge-patch+json`: `null` clears a member, an absent member is kept. |
| **Enums** | `info.x-enum-policy: extensible` means clients must tolerate unknown values and adding one is non-breaking; `closed` means adding one is breaking. |
| **Precision and time** | Money is integer minor units plus an ISO 4217 `currency`. Any other decimal is a string with a stated scale, never a float. An instant is UTC ending in `Z`; a local date or wall-clock time is paired with an IANA zone field. |
| **Sensitive fields** | A secret is `writeOnly: true` or `x-sensitive: true` and never appears in a response. The one exception is an operation that returns a secret once and says why in `x-sensitive-response: <reason>`. |
| **Mass assignment** | Every request-body object is `additionalProperties: false`; server-owned fields (`id`, timestamps, owner, role) are `readOnly`. |
| **Payload limits** | Every operation that takes a body declares `x-max-body-kb` and a `413`. |
| **Downstream failures** | An operation that calls a dependency lists it in `x-downstream` and maps a failure to 502 `upstream-failed`, a timeout to 504 `upstream-timeout`, and an outage or shed load to 503 `service-unavailable`, each with `Retry-After`. A multi-step or bulk write states what is left done when it stops part-way. |
| **Deprecation** | A deprecated operation is `deprecated: true` and answers `Deprecation` (RFC 9745) and `Sunset` (RFC 8594), with `Link: <…>; rel="successor-version"`. |
| **Pagination edge cases** | Each list documents its filter operators and its default order. An empty page is 200 with `data: []`; a cursor past the end is an empty page with `has_more: false`; an invalid, expired or foreign cursor is 400 `malformed-request`. A row inserted while paging is never returned twice, and no row that existed when paging began is skipped. |
| **Retry** | Every operation declares `x-retry: safe\|with-key\|never`. A key is kept for its stated retention window: the same key and body replay, the same key with another body is 422, and the same key while the first request is still running is 409 `idempotency-key-in-flight`. A partial write retried with its key completes what is left and never repeats what was done. |
| **Correlation and audit** | Every operation accepts `X-Request-Id` and W3C `traceparent` and echoes `X-Request-Id`. Every non-GET declares `x-audit: true\|false`, and each `true` has its audit event in the observability catalogue (§13.11). A writeOnly or `x-sensitive` field is never logged. |
| **Docs and examples** | Every operation has a `summary`, and every 2xx JSON response and every problem response has an example that validates against its schema. |
| **Contract ↔ code** | G7 ships a server contract test and a client generated from the contract, and CI fails when either drifts (§13.10). |
| **OWASP API Top 10 (2023)** | `contract-diff.md` maps each of API1–API10 to its control and the evidence for it (§13.12). |

### 13.2 Backend standards — owners `dev-writing-go-code`, `dev-writing-python-code`, `dev-writing-migrations`, enforced at G7

Layering (handler → service → repository; transport types never reach the domain) · errors wrapped
with context and mapped to the §13.1 shape at exactly one boundary · every outbound call has a
timeout, retry with jitter, and a breaker where a dependency can be slow · context and cancellation
threaded through · no N+1 — every repository method returning a collection is reviewed for it ·
every filtered or sorted query has a supporting index named in `data-model.md` · transactions scoped
at the service boundary, never spanning an HTTP call · configuration from the environment, validated
at start-up, failing fast · no secret in code, log, or error · structured logging only (§13.5) ·
the status of a problem is chosen in one status table and a typed domain-error → problem mapper,
never in a `Status:` literal elsewhere · one `FieldError` type per stack, its codes generated from
the contract's `FieldError.code` enum, its messages full sentences in sentence case with no digits
(the limit goes in `limit`) · every limit read from `limits.yaml`'s value, defined once per layer ·
**DB naming:** constraints and indexes `{table}_{cols}_{pk|fk|uq|ck|idx}` (`_uq` a UNIQUE constraint,
`_idx` every index, unique or not; no unnamed constraint, so no default `_pkey`) ·
`created_at timestamptz not null default now()` on every table · `updated_at timestamptz` on every
table rows are updated in, plus `version integer` where the contract declares `x-concurrency:
if-match`; an append-only table says so in a comment · enums as a named `CHECK (col IN (…))`, never
`CREATE TYPE … AS ENUM`; a lookup table only for a list users edit · code follows
`knowledge/conventions.md` — in greenfield too, where G6 writes it (§13.11) (`schema-lint.mjs`,
`limits-check.mjs`, `conventions-check.mjs`).

### 13.3 UI and design standards — owners `dev-defining-design-system`, `dev-making-brands`, `dev-specifying-ui`, `dev-writing-react-code`, `dev-writing-nextjs-code`, enforced at G5 + G7

**The design system is established once per repository by `/sdlc-design-system`** (owner
`dev-defining-design-system`): a vetted preset, a Figma file, or the existing theme, rendered by script into
`docs/design-tokens.{json,md}` + `tokens.css`, with `docs/ui-patterns.md` beside it. **Which** design
system is a product decision: the json records `chosen_by`, a named human, and an agent may not
choose or sign for one. The human chooses by looking: every shipped preset has reference shots, its
starter page (shell and one primary action, stat cards, a table with status badges, a form, an empty
state, built from the preset's tokens alone) at 1280 and 360 in the skill's `presets/shots/`, made by
`design-system.mjs preview`, passing `ui-rubric.mjs`'s hard rules, and kept current by a test; the
command shows them before it asks. `design-system.mjs check` must pass before G5 authors (every required colour
pair, built-in or a preset's `extra_contrast_pairs`, meets WCAG 2.2 AA in every shipped theme, and the
md is a render of the current json). ·
**Every screen starts from a shell and a pattern in `docs/ui-patterns.md`**, and a departure from
that pattern's anatomy is written as a deviation with a reason. An undeclared layout is a finding
at G5 and at G7 ·
**A wireframe binds content; a visual design binds look.** A wireframe (`kind: wireframe`) is a
low-fidelity sketch: what is on each screen, in which region and order. Its colours, greys, sizes and
radii are placeholders whether or not it says so. The look is decided in a separate G5 step, after
the ui-spec and before G6: `dev-designing-visuals` builds high-fidelity screens on the design
system's kit (shadcn/ui new-york or Radix Themes, as `design-tokens.md` §Kit names), renders them
as real HTML, runs `ui-rubric.mjs` over them and shoots them with `ui-snap` at 1440, 1024 and 360.
The requester approves the shots; the ui-spec then records `visual/index.html` as
`visual_reference` with `kind: visual`, and G6 does not start without that approval. This is a G5
sub-artifact, not a new gate: a new gate number would renumber G6–G11 in every gate log already
written, and the visual depends on exactly the inputs G5 already hashes. **Precedence**, highest
first: (1) a deviation the ui-spec records, with its reason; (2) on content and layout — which
regions, fields, columns and actions, their order and grouping — the wireframe, then
`docs/ui-patterns.md`; (3) on look — colour, type, spacing, radius, elevation, density, icons,
dialog size, scrim, theme — the approved visual design, then `docs/design-tokens.md`, then
`docs/ui-patterns.md`. A wireframe never outranks the tokens on look. Tokens are derived only from a
chosen preset or a high-fidelity visual: `design-system.mjs derive` refuses a source marked draft,
placeholder, low-fi or wireframe. G7 shoots each screen it touches beside the visual reference
(`<root>/scripts/ui-snap.mjs`) and runs `ui-rubric.mjs` over it; an undeclared departure is `MAJOR`,
and a rubric hard fail (horizontal overflow, a clipped column, more than one primary button in a
view) is `MAJOR`, and so is an axe-core violation of impact `serious` or `critical`, which
`ui-rubric.mjs` hard-fails when the project has `axe-core` installed (`NOT RUN` when it has not) ·
**behaviour is specified as rows**: each observable interaction (Esc, close, focus return, Back,
refresh, URL state, double submit, permission denial) is a `UB-NNN` row in `## Interaction and
feedback`, with its screen and roles, so a test can name it ·
**a shared pattern is an obligation, not a hope**: a rule every matching component must follow
(every dialog with input uses the discard guard) is a `PO-NNN` in `ui/<slug>/patterns.yaml`, and
`pattern-check.mjs` fails G7 on a component that matches and skips the wrapper · **every slice is
explored before its review**: when a slice's screens are done, `dev-exploring-behaviour` drives its
`UB-NNN` rows per role in Edge and files findings to the owning lane (§9 — a smoke check, not QA) ·
G8 runs `ui-snap` over every screen and records the requester's approval of the
`compare.html` ·
`docs/design-tokens.md` is the single source of colour, spacing, type scale, radius, elevation and
motion — **no hard-coded hex or px in a component** (`design-system.mjs scan`) · UI-kit components before anything bespoke ·
**every screen specifies all its states**: loading (skeleton, not a spinner page), empty (nothing
exists yet), no results (a filter matched nothing), error (timeout included), partial, permission-denied,
offline, long text / missing data, populated — nine columns, every cell filled or `N/A — <reason>`
(lint `E140`, `E141`); 401 / session expiry is decided once, in the Error-UX matrix · **every screen
and action is enabled, disabled, hidden or read-only per role** in a roles matrix that names the
operation behind it; the matrix reflects the contract's authorisation and never replaces it: a
hidden control whose data is still fetched is a `BLOCKER` (§13.13) · lists render the API's pagination honestly — a UI
that fetches "everything" from a paginated endpoint is a `BLOCKER` · tables declare per-breakpoint
behaviour and their sort ↔ API `sort` mapping · forms declare validation, inline error placement,
submit/disabled/pending, optimistic vs pessimistic · **WCAG 2.2 AA**: semantics, labels, focus order,
visible focus, 4.5:1 contrast, full keyboard path, live regions, and the 2.2 additions listed in
§13.13 · responsive from 360px, one row per token breakpoint, measured at 1024, 768 and 360 ·
`data-testid` per the declared convention so the QA bundle can find elements · Next.js: server vs
client component justified, caching strategy stated, no fetch waterfalls, `loading.tsx` and
`error.tsx` per route segment.

**The kit is built, not named.** A kit named in `design-tokens.md` §Kit and never built is how 36
button class sets reach production with every gate green. The bundle ships a reference kit
(`dev-defining-design-system/kit/`: the primitives on cva + Radix + TanStack Table, `lib/format`,
`copy/en.ts`, `problemToUi()` and an ESLint fragment); a UI initiative's G6 plan copies it into the
project as its first task, before any screen task, and G7 builds screens only from it:

- **Kit.** Every component the ui-spec's `## Components` names exists in `components/ui` (or, when
  bespoke, is exported somewhere in the source), and a listed cva, Radix or TanStack dependency is
  imported (`design-system.mjs kit-check`). A raw `<button>`, `<input>`, `<select>`, `<textarea>`,
  `<table>` or `role="menu"` outside `components/ui`, a local Skeleton, a `*Badge`/`*Chip` class
  function, a `BTN`/`INPUT` constant, a date or number formatter outside `lib/format`, or a
  `*_COPY` object is a second implementation (`ui-inventory.mjs`, which also writes
  `ui/<slug>/components.md`). Every class in the source emits a CSS rule, and an arbitrary value
  carries `tokens-ok:` (`design-system.mjs classes`).
- **Copy.** One catalogue, `copy/en.ts`, keyed `{area}.{screen}.{element}`, written to the copy
  style guide (sentence case, no contractions, one sentence per error pattern, plurals through
  `Intl.PluralRules`, no hard-coded locale), and to `<root>/glossary.md` where it exists
  (`copy-lint.mjs`).
- **Errors.** The ui-spec's `## States` carries a `### Error-UX matrix`: one row per `ProblemType`
  the contract declares and per status 401, 403, 404, 409, 412, 422, 429, 5xx, offline and unknown,
  with the columns `Problem | Surface | Component | Copy key | Retry` (lint `E080`, `E081`,
  `W080`). The code maps a problem to that row through one `problemToUi()`; no permission, not
  found and not a member each have their own look.
- **Consistency.** Across the routes G7 touches, one computed value per role — button height per
  variant and size, h1/h2/h3 size, table row height, status pill colour per status word, gap per
  kit slot — unless the ui-spec declares the deviation (`ui-consistency.mjs`). More than one
  undeclared value is `MAJOR` at G7, as is a mutating action outside the kit's mutating button, an
  input dialog without the discard guard, a form without `noValidate`, blur validation and an
  error summary, a menu that is not Radix, and `role="alert"` on content no user action produced.

**The brand is asked, then held in slots.** Before the G5 visual is drawn, the requester answers
two questions, recorded in `visual-design.md` `## Basis`: the brand, which is **(a)** a kit exists
(use it), **(b)** make one now (`dev-making-brands` builds `<repo>/brand/` from one `brand.json`, the
owner picking among 3–4 directions), or **(c)** later (a placeholder kit with the same file names,
and a `DEC-NNN` listing every screen and slot file that will change); and, per secondary area
(admin, back office), whether it is themed or plain. Every brand use — mark, wordmark, favicon set,
share image, 404 and empty-state illustrations, email logo, brand colours — is a slot: a file under
`brand/` or a `--brand-*` token, listed in `docs/brand-assets.md`, never drawn inline, so a later
brand is a file and token swap. Brand colours meet WCAG 2.2 AA in both themes; a failing colour
moves within its hue, the bar never moves. G5 fails a missing answer or an inline brand use
(`dev-reviewing-ui` rows 35–36); G6 fails a placeholder brand with no brand-swap task (row 23). GK
records the brand it finds in code and invents none. **A brand changed mid-project is a change
request**, not a redraw: one `DEC-NNN` naming the screens whose look changes, a rebuild of
`brand/`, only those screens redrawn and re-shot, one approval of them by the requester (the
`visual_reference` hash updated, E028), and one brand task in the plan. Screens built on slots
need no code change beyond the swap.

### 13.4 Deployment standards — owner `dev-planning-deployment`, enforced at G0 + G6 + G10

Every release names its **rollout strategy** (rolling · blue-green · canary with percentages and
promotion criteria) and its **rollback**: the exact command, the time budget, who decides · migration
ordering against the code deploy is explicit (§7) · anything risky ships behind a **feature flag**
with a default, an owner and a removal date · promotion `local → dev → staging → production`, each
with the gate that must be green · health and readiness endpoints wired to the orchestrator · the
deploy is **reproducible**: pinned image digest, recorded commit SHA, no unscripted manual step · a
dry run on production-like data precedes anything touching data · smoke checks run automatically,
and a failure triggers rollback rather than a debugging session in production.
The target, the environments and the pipeline are decided long before this gate (§18.7): G10
promotes what `staging` already ran.

**A change that touches the database or an API states its deploy plan at ship, whatever its
class.** G10 may never run for a `change`, and a `fast` slug deploys slice by slice, so the plan
lives where every class ships: `release/<slug>/pull-request.md` `## Rollout and rollback` (before G9
on a `fast` slug, `plan/<slug>/slices.md`). The section opens with plain `key: value` lines that the
QA bundle copies into its test plan, so their names and values are shared and never renamed:
`deploy_impact` (`none`, `db`, `api`, `db, api`), `db_change` (`additive`, `expand`, `contract — <the
release from which the code no longer uses the old shape>`), `data_change` (`none`, `backfill`,
`transform`, `split-merge`, `type-change`, `delete`, `import`), `rollback` (the methods, naming
`down-migration` or `snapshot-restore` for a database change), `backup` and `post_backup_writes`
(`delta-export`, `replay`, `write-freeze — <how>`) when `data_change` is not `none`, `api_change`
(`additive`, `versioned`, `deprecated`: a breaking change is never unversioned), and the optional
`other_impact` (`config-secrets`, `feature-flag`). A basic change writes `deploy_impact: none`. Then,
for the database: each migration, N-1 compatibility, expand → migrate → contract for renames and
drops, lock risk, the backfill, the snapshot command or pipeline step for this host, and the DB
rollback; an additive-only migration with `data_change: none` stays light. For an API: the version
or deprecation window, the clients still on the old shape, and the
server-before-client order. Then the order of steps and why, the check after each, the code
rollback, the person who decides and what ran on `staging`. A migration or script that changes,
moves, transforms or deletes rows already there adds `### Data`. Before the deploy: the backup
(what, how, where, how long, and a restore tried on staging), the baseline counts and checksums, and
a dry run at production volume. During: the order (expand → code that reads and writes both shapes
→ batched, resumable migration → switch reads → contract later) and whether the site stays up.
After: verification against the baseline, and when the old data and the backup go. Rollback: the
point after which only the restore gets back, what a restore loses and how it is kept.
`release-plan.md` copies the key lines into its own `## Rollout and rollback`, expands the rest in
`## Migration ordering` and `## Rollback`, and never contradicts the PR. The pipeline snapshots the
database before the first migration of each environment, and `staging` migrates first.

`deploy-plan-check.mjs` reads the diff (migration folders, `*.sql`, ORM schema files from the
language adapters, data and backfill scripts, OpenAPI, AsyncAPI, proto, GraphQL and event schemas)
and judges the section against it. It runs in CI on every merge request, at G9 and G10, and before
each `fast` slice merges.

| Code | Class | Script | Rule |
|---|---|---|---|
| `E180` | error | deploy-plan-check | the DB or API changed and no ship notes carry `## Rollout and rollback`, the section is empty, or has no `deploy_impact:` line; or `release-plan.md` `## Migration ordering` is empty |
| `E181` | error | deploy-plan-check | `deploy_impact: none`, or one that leaves out `db` or `api`, while the diff changes them; `data_change: none` while a migration rewrites rows |
| `E182` | error | deploy-plan-check | a key or line the impact needs is missing, empty or a placeholder; a value outside the shared vocabulary; a `contract` with no release; an `api_change` that is not additive, versioned or deprecated; a database `rollback` with neither `down-migration` nor `snapshot-restore`; a snapshot with no command or step |
| `E183` | error | deploy-plan-check | a migration or script changes existing rows and the section has no `### Data` part |
| `E184` | error | deploy-plan-check | rows change and `backup` or `post_backup_writes` is missing or outside its vocabulary, or the `### Data` part leaves a backup, before, during, after or rollback line missing or empty |
| `W180` | warn | deploy-plan-check | a route or handler file changed and no contract did |

**Where it runs and where its keys live are decided at G0, not at G10.** An `initiative` or a `fast` slug
has at least `local`, `staging` and `production`, even with one owner: one domain, a subdomain per
environment one label deep (`staging.<domain>`, `staging-admin.<domain>`, never
`admin.staging.<domain>`, which a managed one-level certificate does not cover). `staging` deploys
from the main branch on every merge; `production` is a manual job in the same pipeline. A developer's
machine is not a production host unless a `DEC-NNN` a named human answered says so. Every key the app
reads is a row in `ops/config/keys.md` (name, purpose, source, environments, holder, rotation,
format). Its value lives only in the secret store `DEV-PROFILE §Environments` names, and the host
picks that store: the host's runtime store when it has one (Cloudflare Worker secrets, AWS Secrets
Manager or SSM, Google Secret Manager, Azure Key Vault, the platform's secrets on Vercel or Fly).
Otherwise it is the CI platform's variables, scoped per environment (masked; protected for
production), or SOPS-encrypted files in the repository when the owner chooses. The CI store holds
only what the deploy job needs, through OIDC where the cloud supports it. The owner keeps a
recovery copy of the keys whose loss cannot be undone in a password manager.
`secrets-and-environments.md` has the table. A value is never kept in a `.env` copied or edited by
hand. A production value never sits in a file on a developer's machine: `local` runs on
development values only. The
deploy job writes the env file from the store, starts the app, and deletes the file; `env-doctor.mjs`
runs before every deploy and fails on a missing, empty or malformed key, an unreachable database or
a skewed clock. G6 plans two tasks in the first slice: the pipeline that builds the image and deploys
it to `staging` (a walking skeleton on the real host), and the keys in the store with `env-doctor.mjs`
green.

**Changing a key's value in any store is a deploy.** A value edited in the host's runtime store or
the CI store reaches users on the next restart or redeploy, and a host's "redeploy" button skips the
pipeline that runs `env-doctor.mjs`. So the change goes through the pipeline, or `env-doctor.mjs`
runs against the store's values first, in a job that reads them, never on a developer's machine. It
checks by name and format and never prints a value. Each key's Format in `keys.md` states the exact
shape the app accepts (`email` is a bare address with no display name). Before the change, the
previous deployment stays promotable, and the plan names the host's way back to it. A redeploy that
bypasses the check is a G10 finding.

**The mail sender is decided at G0, with the host.** A product that sends mail names its sender
address and the domain it sends from. The domain is one the product owns, authenticated with the
provider's DKIM, a DMARC record and SPF or a return-path. A free-mailbox domain
(`gmail.com`, `googlemail.com`, `yahoo.*`, `outlook.com`, `hotmail.com`, `live.com`, `icloud.com`,
`proton.me`, `aol.com`) is never the sender of product mail: relayed through a provider, it fails
DMARC alignment and the inbox drops it, while the provider still reports it sent. `env-doctor.mjs`
fails a sender key on a free-mailbox domain or a domain with no DMARC record. Before the first mail
ships, a real message reaches a Gmail and an Outlook inbox.

### 13.5 Observability standards — owner `dev-designing-observability`, enforced at G7 + G11

**Logs:** structured JSON, one event per line, with `timestamp`, `level`, `service`, `env`,
`trace_id`, `span_id`, `request_id`, pseudonymous `user_id`, `event` and typed fields — never an
interpolated sentence. No PII, no secrets, no full bodies. `error` is paged-or-fixed, `warn` is
degraded, `info` is a business event.

**Metrics:** RED per service (Rate, Errors, Duration as a histogram — p50/p95/p99, never only a
mean) and USE per resource. Business counters for what the PRD cares about. Bounded label
cardinality — no user id, no raw path.

**Traces:** OpenTelemetry, context propagated across every service and queue hop; spans on inbound
handlers, outbound calls and DB queries; the trace id appears in logs and in error responses.

**SLOs:** each user-visible NFR becomes an `SLO-NNN` with an objective, a window, an error budget, a
dashboard panel and **one alert that pages only when the budget is burning**. An alert without a
runbook entry is a `BLOCKER` at G11.

**Post-release:** G11 confirms against real traffic that the telemetry exists, the dashboard shows
the change, error rate and latency are in budget, and the rollback path still works.

**Catalogue:** `observability.md` `## Log events` and `## Metrics` are the closed list of every event
and metric the code emits, named by the §13.11 grammar, each event at one fixed level. One request
log line per request (`http.request_completed`, OTel `http.*` attributes) and the request id echoed
in `X-Request-Id`. One logging API. `obs-check.mjs` binds code and catalogue both ways.

### 13.6 Security standards — owners `dev-modeling-threats` (G2) and `dev-reviewing-implementation` (G7), enforced at G2 + G7 + G8

Authn and authz at the service boundary on **every** endpoint, including the ones "only the admin UI
calls" · object-level authorisation on every client-supplied id (IDOR is the default bug) · all input
validated and typed at the edge; parameterised queries only · output encoding by context · secrets
from vault/env, rotated, never logged · dependency and secret scanning in CI · rate limiting and
lockout on auth paths · security headers and CORS explicit · audit events for privileged actions ·
PII classified in `data-model.md` with a retention rule.

Five rules make those checkable rather than hoped for:

1. **Threat → control → test.** Every STRIDE row in `threat-model.md` has a `THR-NNN` id, names
   its control in `Mitigation`, and names in `Test` the test id that will prove it (`TestName`,
   `path/to/file_test.go:TestName`, `gate:<DEV-PROFILE gate>` for a G8 scan), or
   `accepted: <name>` with the id repeated under `## Residual risk`. G2 names the test; G8 runs
   `threat-trace.mjs <slug> --source <root>` and records the threats with no test, or whose test is
   not in the source, as a `FAIL` row.
2. **DAST baseline at G8.** OWASP ZAP's passive baseline (`zaproxy/zap-stable zap-baseline.py`)
   runs against the running preview at the pinned commit; each alert is triaged like any scan
   finding. No Docker is `NOT RUN` with that reason.
3. **No real data in a preview.** Seeds, fixtures and the preview database hold only domains and
   e-mails in DEV-PROFILE `Allowed data domains`. `data-guard.mjs` checks the files and a text dump
   of the preview DB; a dump is checked before every review of a running preview (G7 shots, G8,
   a requester's approval), because a session can type a real value into it.
4. **Risk-weighted G7.** A changed file matching DEV-PROFILE `§Security review` risk paths (auth,
   session, SQL, crypto, upload, deserialisation, secrets) is read in full against the security
   checklist; others are read by diff. `risk-paths.mjs` lists them.
5. **Lanes share no environment.** The rules for parallel agents — processes, ports, containers,
   databases, commits — are `skills/dev-stage-protocol/environment.md`.

### 13.7 Performance standards — owner `dev-running-verification`, enforced at G8

Every endpoint has a stated latency budget · a query on a growing table has an index and an `EXPLAIN`
in the data model · no unbounded result set anywhere in the stack (§13.1) · pagination proved on a
realistic row count, not ten seed rows · caching decisions (what, where, TTL, invalidation) written
in `architecture.md`, never improvised in a handler · a frontend bundle budget and lazy-loaded
below-the-fold routes · measure before optimising: a performance claim without a number is not a
claim.

**Budgets are written at G4 and tested from G7, not discovered at G8.** A budget first measured on
the G8 volume run arrives after every task is built; the fixes it forces re-open G7 for code that
was reviewed as done. So each layer gets a number early, and each gate that can see a breach checks
it:

| Where | What | Checked by |
|---|---|---|
| G4 contract | every operation carries `x-perf: { p95_ms, max_queries, max_payload_kb }` — p95 latency at the G8 volume, database queries per request, response body size. A breach is a `MAJOR` at G7 or G8, never a renegotiation inside a stage: a budget that cannot be met goes back to `/sdlc-api` (§12.6) | `lint-dev.mjs` `W050`/`W051`; `dev-reviewing-api` |
| G7 query tests | every new or changed query has a test that runs `EXPLAIN` on a small-but-realistic fixture and fails on a sequential scan of a table the data model calls large; every integration test of an endpoint counts the requests' queries and fails above `max_queries` — the N+1 catch | `dev-reviewing-implementation` |
| G7 UI tests | a long list has a render-count test: one update re-renders the changed row, not the list; a remount or a measure-every-render shows up as a count, not as a slow test | `dev-reviewing-implementation` |
| every check | the perf smoke: `perf-smoke.mjs` on the small seed, a handful of endpoints, p95 under `x-perf` × headroom, queries and payload at budget; `web-perf.mjs` on the built app against `DEV-PROFILE §Quality gates` | the project's check script, and `DEV-PROFILE §Quality gates` at G8 |
| G8 | the full volume run, every budgeted endpoint, at the realistic row count | `dev-reviewing-verification` |
| G4 traffic | every operation names an `x-traffic` class; `info.x-traffic-classes` gives each class `rps`, `peak_factor`, `concurrency` and `rate_limit`, sourced from a quality attribute, an NFR or an answered DEC. Rate limits and quotas live there, per class | `api-contract-check.mjs` E133; `dev-reviewing-api` |
| G4 timeouts, retries, async | every operation has `x-timeout-ms` at or above its `p95_ms`, and `x-retry`. The client backs off exponentially with full jitter and honours `Retry-After`. An operation that can pass 2 s answers 202 with an operation resource whose `Retry-After` is the polling interval | `api-contract-check.mjs` E127, E128, W122 |
| G4 caching and transfer | every GET declares `x-cache: none\|private:<ttl>\|public:<ttl>` with a `Cache-Control` header, and `Vary` where the body varies by a header; a GET with an `ETag` takes `If-None-Match` and answers 304. `info.x-compression` states the response compression and its minimum size. `architecture.md` states keep-alive and HTTP/2 | `api-contract-check.mjs` E129, W123, W129; `perf-smoke.mjs` |
| G4 query shape | every list and get has `x-query: { shape, indexes }`, where each index is one that `data-model.md` names (§13.2). The page maximum is set so that a full page fits `max_payload_kb`, and a bulk operation caps items per request in its schema | `api-contract-check.mjs` W126 |
| G8 load | `api-contract-check.mjs --load-plan` gives one scenario per traffic class: target `rps × peak_factor`, `concurrency`, the class's operations and their budgets. G8 runs them, and the QA handoff carries them | `dev-running-verification`, `dev-reviewing-verification` |

**A slow test is a performance report until shown otherwise.** Before any timeout is raised, the
test's slowness is investigated for a product cause — a remount, a render loop, a query per row —
and the finding is recorded with the change. Raising the timeout first deletes the only early
signal the product gave.

---

### 13.8 Diagrams — owner `dev-drawing-diagrams`, enforced wherever one appears

A diagram carries structure — topology, ordering, containment, cardinality. It never carries the
reasoning, because a picture cannot be quoted in a finding. **No gate is failed for lacking a
diagram, and no gate is passed on a diagram whose claims the prose does not also make.**

A diagram is a ` ```mermaid ` block **inside the artifact it illustrates**, drawn to the industry
notation `dev-drawing-diagrams` names per kind (C4, UML 2.5 sequence/activity/state, crow's-foot ER,
DFD with trust boundaries). It is hashed with the artifact (§5.2), so redrawing it after a `PASS`
makes that gate `STALE`, which is the point: the stale diagram is the one people trust most and check
least. `diagram.mjs check <slug>` holds the notation rules (`E701`–`E704`, `W710`–`W717`); a
diagram whose names the prose does not use is `W716`, because the prose is the authority.

`diagram.mjs render <slug>` draws every block with mermaid in headless Edge/Chrome — no other
software — into **one folder, `<root>/diagrams/<slug>/`**: `index.html` (contents by gate, then every
diagram, each linked to its source line) and `NN-G<n>-<artifact>-<title>.svg`. That folder is
derived, rebuilt on every run, never hand-edited, never a gate output. A block mermaid cannot parse
(`E703`) is a defect at the severity of the artifact that holds it.

| Code | Class | Rule |
|---|---|---|
| `E701` | error | a mermaid block whose type is not one this bundle draws |
| `E702` | error | a mermaid block with no content |
| `E703` | error | `render`: mermaid cannot parse the block |
| `E704` | error | `render`: mermaid parsed the block but drew nothing |
| `W710` | warn | no title (front matter `title:`) |
| `W711` | warn | sequence: a lifeline used without a `participant` / `actor` line |
| `W712` | warn | sequence: no `alt` / `opt` / `break` — the happy path only |
| `W713` | warn | flowchart: an edge out of a decision with no guard label |
| `W714` | warn | ER: an entity with no `PK` attribute |
| `W716` | warn | a participant, entity or C4 element the prose never names |
| `W717` | warn | more elements than one diagram can carry (20; 40 nodes in a flowchart) |

### 13.9 Repository layout — owner `dev-resolving-code-placement`, enforced at G2 + G6 + G7

Every repository declares one blueprint in `DEV-PROFILE §Stacks` (**Repository blueprint**), chosen
from `dev-resolving-code-placement/blueprints/`: the full tree, the purpose of every top-level folder,
the backend layering, and the named standards each part follows. The rules:

1. **G2 records it as an `ADR-NNN`**, named in `DEV-PROFILE` as the **Blueprint ADR**, whose
   Compliance names `layout-check.mjs`. In brownfield the ADR lists every accepted deviation as a
   `` `<rule> <path>` `` table row copied from the script's output.
2. **G6 scaffolds it** in greenfield: the first tasks create the tree, with a `README.md` per
   top-level folder saying what belongs there.
3. **`layout-check.mjs` checks it** — required folders and root files, code outside the allowed
   roots, test placement, grab-bag names (`utils/`, `helpers/`, `common/`), a per-package file
   ceiling, and import direction. In greenfield every finding fails except the ceiling, which warns.
   In brownfield every finding is advisory, except one on a top-level area or a grab-bag folder
   created after `--since <ref>`; an accepted deviation never fails.
4. **No stage moves existing code to match a blueprint.** A move is a refactor with its own
   `TASK-NNN` and its own review; drift is recorded, not corrected on the way past.
5. **Two axes, decided apart, before the blueprint.** `DEV-PROFILE §Stacks` declares
   **Repository model** (`monorepo | polyrepo`) and **Architecture** (`monolith |
   modular-monolith | microservices`). They are independent: a modular monolith can live in a
   polyrepo of libraries, and microservices can live in one monorepo. The blueprint follows from
   the two (rule 8), never the other way round.
6. **G2 decides both axes in the blueprint ADR, with a decision table.** One row per criterion,
   each with the evidence and the option it points to:

   | Criterion | What the evidence is |
   |---|---|
   | Team count and ownership | how many teams, and whether each can own a part end to end (Conway's law) |
   | Independent deploy need | a part that must ship on a different day from the rest, and why |
   | Independent scaling hot spots | a part whose load profile differs by an order of magnitude, measured or required by an NFR |
   | Data ownership boundaries | entities only one part writes; a shared write is a boundary that does not exist |
   | Release cadence | how often each part changes, from `git log` in brownfield, from the roadmap in greenfield |
   | Operational maturity | CI/CD per deployable, observability (traces across processes), on-call per service |

   The ADR names its references by name — Fowler "MonolithFirst", Newman "Monolith to
   Microservices", the Twelve-Factor App, the Google SRE book — and does not quote them at length.
7. **The default is a modular monolith in a monorepo.** It needs no criterion to justify it.
   `microservices` needs the table to show which criteria force it, and `operational maturity`
   must read *yes* for each deployable before it can; a split justified only by "it scales" or
   "it is cleaner" is a finding. `polyrepo` needs either `microservices` or a team boundary the
   table shows. `monolith` (no internal module boundaries) is allowed for a short-lived or
   single-domain product, and the ADR says so.
8. **The blueprint follows from the axes.** `blueprints/README.md` §Choosing has the table. A
   blueprint declares the axes it serves in its rules (`fits`); `layout-check.mjs` fails
   `blueprint-fit` when the profile names an axis the blueprint does not serve, in either maturity.
9. **Polyrepo and microservices are V2 — schema only.** `service-go` fixes one service
   repository's tree and `layout-check.mjs` checks it; nothing yet checks across repositories.
   `DEV-PROFILE §Services` lists every service (name, repo, owner, contract path), so V3
   cross-service impact analysis has the data. In a polyrepo every service repository carries
   its own `<root>/`, and cross-service work runs G0–G2 in one initiative-level `<root>/`
   (in the `platform` repository or its own), with one slug per service repository from G6.

---

### 13.10 Test standards — owners `dev-writing-go-code`, `dev-writing-python-code`, `dev-writing-react-code`, `dev-writing-nextjs-code` (G7) and `dev-running-verification` (G8), enforced at G7 + G8

| Rule | Detail |
|---|---|
| **A test names what it proves** | A test for an AC or a behaviour row carries the id in its title or a comment beside it (`it('keeps input on 422 (AC-109)')`, `// UB-014`). `trace.mjs --check` is the G7 evidence (§6). |
| **A slow test is a finding** | Raising a test timeout (`timeout:`, `testTimeout`, `hookTimeout`, `-timeout`, `test.setTimeout`, `@pytest.mark.timeout`) or adding a retry (`.retry(`, `retries:`, `retryTimes`, `flaky`) needs a recorded cause on that line or the one above: `slow-test: <cause>`. The cause names what is slow or racy; "flaky" is not a cause. `timeout-check.mjs --base <merge base>` fails the diff otherwise. |
| **Mutation score on changed modules** | Stryker (web/TS) and gremlins (Go) run over the modules the change touched, against `DEV-PROFILE §Quality gates` (default 60%); `mutation-score.mjs` reduces the report and G8 records it. A surviving mutant in a changed module is the evidence a test cannot fail. The tools are project dev dependencies, never the bundle's. |
| **The contract is tested, not trusted** | A G7 task with an API ships a server contract test. It loads `api/<slug>/openapi.yaml` and fails when a contract operation is neither served nor on a pending list that only shrinks, when a served route is not in the contract, or when a response's status, problem `type` or body breaks its schema. The web client's types are generated from the contract (`openapi-typescript`, `oapi-codegen` or the like), and CI regenerates them and fails on a diff. A contract-based mock (`prism mock`) stands in for the API wherever a test needs one. |

---

### 13.11 Backend consistency catalogues — owners `dev-designing-api` (G4), `dev-modeling-data` (G3), `dev-designing-observability` (G2, G7), `dev-planning-implementation` (G6), enforced at G3 + G4 + G7

A shape rule says what one error, one limit or one log line looks like; it does not stop three of
them meaning the same thing. Each catalogue below is the one list a checker compares the code with.

**`api/<slug>/problems.yaml`** (G4, template `_templates/problems.yaml`). The source for the
ui-spec error-UX matrix (§13.3): a screen handles a type by its `client_ux`.

```yaml
problems:                       # one entry per type
  - type: /problems/release-not-found   # unique; the openapi ProblemType enum lists exactly these
    status: 404                 # exactly one integer, 400–599
    title: Release not found    # sentence case, fixed per type; the code uses it byte-exact
    when: The release does not exist, or the caller may not see it.   # one sentence
    extensions: []              # Problem members this type carries (e.g. [conflicting]); [] when none
    client_ux: page             # field · form · toast · page · sign-in · retry · conflict
    refs: [REQ-012]             # optional: REQ / DEC / ADR ids
```

`client_ux`: `field` (inline at each `errors[].field`) · `form` (a banner on the form) · `toast`
(transient, the view stays) · `page` (the view's error state) · `sign-in` (back to sign-in) ·
`retry` (retry after `Retry-After`) · `conflict` (show the conflicting record, offer reload).

**Type grammar.** `/problems/<noun>-<state>`, kebab-case, with one suffix per meaning:
`-not-found` (does not exist for this caller) · `-unavailable` (exists, cannot be used now: expired,
spent, window closed) · `-limit-reached` (a count or size cap) · `-conflict` (clashes with another
record or the current state) · `-forbidden` (the caller may not) · `-invalid` (a rule across several
fields) · `-required` (a header or confirmation the request lacks). Reserved, outside the grammar:
`validation`, `malformed-request`, `unauthenticated`, `rate-limited`, `precondition-failed`,
`service-unavailable`, `internal`, `payload-too-large`, `upstream-failed`, `upstream-timeout`,
`idempotency-key-in-flight`. **A rule on one field is `validation` with a `FieldError`**:
codes are snake_case values of the one `FieldError.code` enum, never a new type.

**API style** (G4, `dev-designing-api` `api-style.md`). One custom-action style:
`POST /{collection}/{id}/<verb>`; a state the caller sets or clears is a sub-resource,
`PUT`/`DELETE /{collection}/{id}/<state-noun>`. Per verb class:

| Verb class | operationId verbs | Method | Success |
|---|---|---|---|
| read | `get`, `list` | GET | 200, `ETag` on a resource that has a write |
| create | `create` | POST on the collection | 201 + `Location` |
| update | `update` | PATCH | 200 |
| delete | `delete` | DELETE | 204 |
| state | `set` / `unset`, `add` / `remove` (membership of an existing record) | PUT / DELETE | 204 |
| action | `approve` `reject` `cancel` `archive` `restore` `move` `start` `complete` `send` `verify` `refresh` `undo` `export` `import` `search` | POST | 200, or 202 for >2s |

The verb list is closed; a new verb is a change to this table. Boolean filters are `is_<adjective>`
or `has_<noun>`. Id parameters end `_id`. Page size default and maximum come from DEV-PROFILE
`## Defaults` `Page size` (`<default> / <max>`; an older profile's `## Backend checks` line is read
when Defaults has none), else §13.1's 20 / 100. The sort parameter is `sort`. Every non-GET carries
`x-idempotency: required` (and accepts `Idempotency-Key`) or `exempt:<reason>`, and
`x-concurrency: if-match` (with `If-Match` and a 412), `lww:ADR-NNN` or `none:<reason>`.

**`data/<slug>/limits.yaml`** (G3, template `_templates/limits.yaml`): one entry per limit —
`name` (`<entity>.<field>`), `value`, `unit` (`chars` · `bytes` · `items` · `count` · `seconds`),
`ref` (a REQ or DEC id), and `match` (the identifiers each layer uses for it: a Go constant, a
`table.column`, an openapi property, a web constant). Each layer defines a limit once; a field
message names no number — the limit travels in `FieldError.limit`.

**Observability catalogue** (`monitoring/<slug>/observability.md`). G2 seeds `## Log events` and
`## Metrics`; G7 revises them with the code; G11 reviews the whole artifact. G2 does not list the
file under its outputs, so a G7 revision stales nothing upstream. Events are
`<domain>.<noun>_<verb>` with `<verb>` from `created` `updated` `deleted` `completed` `failed`
`started` `refused` `skipped` `retried` `expired` `sent` `received`, each at one level. Metrics are
`<app>_<noun>_<unit>` per Prometheus and OTel naming: counters end `_total`, sizes `_bytes`, times
`_seconds`, a latency histogram `_duration_seconds`; a gauge names its unit.

**Greenfield conventions.** With `project_maturity: greenfield`, the first G6 writes
`knowledge/conventions.md` and `knowledge/test-conventions.md` from the conventions templates and
the defaults in `dev-planning-implementation` `greenfield-cards.md`, lists them in its outputs, and
G7's conventions check applies as it does in brownfield. GK reads them as cards once
`/sdlc-onboard` runs over real code.

**Codes.** Every checker exits 1 on an error and 0 on warnings alone; `--json` prints the findings.
`--write-baseline <file>` records today's findings and `--baseline <file>` turns those back into
warnings marked `(baseline)`, so a project that adopts a checker late fails only on findings it
adds. A finding is matched on code, file and message with digits blanked, never on line. The
summary counts the recorded findings that have gone, so the file can be rewritten smaller. The
baseline lives at `<root>/ci/baselines/<script>.json`, and paying it down is backlog work, not a
gate exemption.

| Code | Class | Script | Rule |
|---|---|---|---|
| `E100` | error | problems-check | a catalogue entry is malformed: a missing field, a status that is not one integer 400–599, a `client_ux` outside the set, a duplicate type |
| `E101` | error | problems-check | a type in the catalogue and not in the openapi `ProblemType` enum, or the reverse |
| `E102` | error | problems-check | a type in the code and not in the catalogue, or a catalogue type with no constant in the code |
| `E103` | error | problems-check | a status chosen outside the status table (DEV-PROFILE §Backend checks) |
| `E104` | error | problems-check | a type emitted with two statuses, or with a status other than its catalogue status |
| `E105` | error | problems-check | a catalogue type the code never emits |
| `E106` | error | problems-check | a title that differs from the catalogue, or a title in Title Case |
| `E107` | error | problems-check | a `FieldError` code outside the contract enum, or written as a raw string |
| `W100` | warn | problems-check | a type name outside the grammar |
| `W101` | warn | problems-check `--client` | a catalogue type with no client handling site |
| `W102` | warn | problems-check `--client` | a bare status comparison (`status === 4xx`) in web code |
| `E108` | error | api-style-check | a non-GET without a valid `x-idempotency`, or `required` without `Idempotency-Key` |
| `E109` | error | api-style-check | a non-GET without a valid `x-concurrency`, or `if-match` without `If-Match` and a 412 |
| `E110` | error | api-style-check | a method or success status outside its verb class's row |
| `E111` | error | api-style-check | an operationId verb outside the closed list |
| `W103` | warn | api-style-check | a second action style, a boolean filter not `is_`/`has_`, an id parameter without `_id`, a sort parameter not `sort`, a page size off the default |
| `W104` | warn | api-style-check | a GET of a resource that has a write, with no `ETag` |
| `E112` | error | limits-check | a limit whose value differs from `limits.yaml`, or between two layers |
| `E113` | error | limits-check | one limit defined twice in one layer |
| `W105` | warn | limits-check | a digit inside a user or field message |
| `W106` | warn | limits-check | a limit no catalogue entry matches |
| `E114` | error | obs-check | an event or metric in the code and not in the catalogue, or a catalogue entry the code never uses |
| `E115` | error | obs-check | a dynamic (built, not literal) event name |
| `E116` | error | obs-check | a log line written through a second logging API |
| `W107` | warn | obs-check | an event name outside the grammar, or an event at a level other than its catalogue level |
| `W108` | warn | obs-check | a metric name outside the grammar |
| `E117` | error | conventions-check | an sqlc query name outside the vocabulary (`Get` `List` `Create` `Update` `Delete` `Exists` `Count` + a noun) |
| `E118` | error | conventions-check | an env key without the app prefix, an `.env.example` key config never reads, or a read key `.env.example` lacks |
| `W109` | warn | conventions-check | a test helper defined in more packages than the threshold, outside the testkit |
| `W110` | warn | conventions-check | one SQL query copied into several `queries.sql` |
| `E119` | error | schema-lint | a constraint or index name outside `{table}_{cols}_{pk\|fk\|uq\|ck\|idx}`, or an unnamed constraint |
| `W111` | warn | schema-lint | a table without `created_at timestamptz not null default now()` |
| `W112` | warn | schema-lint | a table with neither `updated_at` nor an append-only comment |
| `W113` | warn | schema-lint | an enum as `CREATE TYPE … AS ENUM` |

### 13.12 API evaluation — owners `dev-designing-api` and `dev-reviewing-api`, enforced at G4

The G4 review scores the contract on top of the checklist, and the score decides which of the §10
verdicts the reviewer writes. Every row of the `dev-reviewing-api` checklist belongs to one of the
thirteen areas below. Some rows are **mandatory**, and the checklist marks them `M`. A G4 log's
`## Checklist` copies the skill's `Area` and `M` columns along with the rows.

| # | Area | Weight | # | Area | Weight |
|---|---|---|---|---|---|
| 1 | Requirement and contract | 8 | 8 | Performance | 10 |
| 2 | REST and naming | 6 | 9 | Idempotency and concurrency | 7 |
| 3 | Schema | 10 | 10 | Observability | 5 |
| 4 | Errors | 8 | 11 | Docs and standards | 6 |
| 5 | Security | 14 | 12 | Testability | 5 |
| 6 | Versioning | 10 | 13 | Gate | 4 |
| 7 | Pagination, filter, sort | 7 | | **Total** | **100** |

**Criterion status.** At G4 each checklist row's `Result` is `PASS`, `FAIL`, `NOT_RUN` (the check
was not executed), `UNKNOWN` (it cannot be judged from what exists) or `N/A — <reason>`.

- An area scores `weight × PASS rows ÷ rows not N/A`, and an area whose rows are all `N/A` scores
  its full weight. An area with no row at all scores 0. `FAIL`, `NOT_RUN` and `UNKNOWN` count as 0.
- A `PASS` needs evidence: a command and its counts, a quote, or a `file:line`. A `PASS` with an
  empty evidence cell, or one the checker output contradicts, is scored `FAIL`.

**Status, and the verdict it maps to.** Apply the rules in this order; the first that matches wins.

| Score status | When | Gate `verdict` |
|---|---|---|
| `NEEDS_CLARIFICATION` | a mandatory row is `UNKNOWN`, or depends on an `open` DEC-NNN | `BLOCKED`. Each missing answer is a DEC-NNN, and `/sdlc-ask` is what unblocks it (§15.2) |
| `BLOCKED` | a mandatory row is `FAIL` or `NOT_RUN`, or the score is below 75 | `CHANGES_REQUESTED` |
| `REVIEW` | the score is 75 to 89, or there is an open `BLOCKER` or `MAJOR` | `CHANGES_REQUESTED` |
| `PASS` | the score is 90 or more, every mandatory row passes, and there is no open `BLOCKER` or `MAJOR` | `PASS` |

A mandatory failure overrides the score. **A high-risk exception needs a named human.** A
mandatory or security row passed by exception carries `exception: <ADR-NNN> — approved by <name>`
in its evidence, and that name is a human, as in E029. An exception is never written by the agent
that would benefit from it.

`api-score.mjs <slug>` reads the checkers' `--json` outputs and scores the rows a machine can
decide. It reads the human rows from the draft log's `## Checklist`, and prints the scorecard that
goes under the log's `## Verdict`. A machine row cites its checker and codes in its `Check` text.
The row fails on any of those error codes in the checker's output. If the checker's output was
not given, the row is `NOT_RUN`. The reviewer still writes every row's evidence.

**A machine row a decision rules out.** A machine row with no checker output is `N/A`, and leaves
the denominator like any other `N/A`, only when all three hold:

1. its `Result` or `Evidence` cell cites a `DEC-NNN`;
2. that DEC's status in `<root>/decisions/<slug>.md` is `answered`, so a human ruled the checker's
   input out (for example, no HTTP server, so no `openapi.yaml`);
3. the checker exited 2, its "no input" status, given to the scorer as `--exit <script>=2`.

Otherwise the row stays `NOT_RUN`, with a `W137` that names what is missing: no DEC cited, a DEC that
is open or not in the ledger, or no exit 2. A checker that exited 1 failed: its rows are `FAIL`
(`E138`), whatever the ledger says.

**OWASP API Security Top 10 (2023).** `contract-diff.md` `### Security mapping`, under `## Standards conformance`, has one row per risk.
Each row names its control and its evidence, or `N/A — <reason>`.

| Risk | The control the contract must show |
|---|---|
| API1 Broken object level authorization | an object-level check on every client-supplied id (§13.6) |
| API2 Broken authentication | a scheme on every operation, or `x-public: <reason>`; the auth endpoints are rate-limited with lockout |
| API3 Broken object property level authorization | request bodies are `additionalProperties: false` and server fields `readOnly`; no secret or internal field in a response |
| API4 Unrestricted resource consumption | `x-max-body-kb` and 413, bounded strings and arrays, paginated lists, `x-traffic` rate limits and 429, `x-timeout-ms` |
| API5 Broken function level authorization | each operation's required role (`x-authz` or its description); admin operations are not reachable with a member role |
| API6 Unrestricted access to sensitive business flows | the flows open to abuse (sign-up, invite, reset, checkout) get their own rate class |
| API7 Server side request forgery | a URL a client supplies is `format: uri`, matched against an allowlist, and fetched with private ranges blocked |
| API8 Security misconfiguration | `info.x-cors` and `info.x-security-headers` are stated, 5xx bodies hold no internals, and TLS is required |
| API9 Improper inventory management | every operation is in the contract, `/v1` versioning holds, and a deprecated operation answers `Deprecation` and `Sunset` |
| API10 Unsafe consumption of APIs | each `x-downstream` dependency has a timeout, a validated response and a 502/503/504 mapping |

**Breaking changes, by machine.** `contract-diff.md` `### Compatibility check` records the command and
its output. The command is `oasdiff breaking <baseline> <new>`, run from the Go binary, from
`docker run --rm -v "$PWD:/w" tufin/oasdiff breaking /w/<baseline> /w/<new>`, or from an npx
wrapper. With none of these available, use `contract-compat.mjs <baseline> <new>`, which checks
for a removed operation or status, a removed or newly required field, and a narrowed type, enum or
bound. Every break either tool reports is a `## Changed` or `## Removed` row marked breaking.

**Codes** (each checker exits 1 on an error; `--json` prints the findings).

| Code | Class | Script | Rule |
|---|---|---|---|
| `E120` | error | api-contract-check | a schema property with no `type` (and no `$ref`, `const`, `enum` or composition) |
| `E121` | error | api-contract-check | a request-body object without `additionalProperties: false` |
| `E122` | error | api-contract-check | `nullable:` instead of `type: [x, 'null']` |
| `E123` | error | api-contract-check | a response schema with a secret-like property (password, secret, token, api_key, private_key, credential) or an `x-sensitive` one that is not `writeOnly`, in an operation with no `x-sensitive-response: <reason>` |
| `E124` | error | api-contract-check | an operation with no security requirement, or with `security: []` and no `x-public: <reason>` |
| `E125` | error | api-contract-check | an operation with no `summary` |
| `E126` | error | api-contract-check | an example that does not validate against its schema |
| `E127` | error | api-contract-check | an operation without a positive `x-timeout-ms`, or with one below its `p95_ms` |
| `E128` | error | api-contract-check | an operation without `x-retry: safe\|with-key\|never`, or `safe` on a non-GET with no `exempt:` reason |
| `E129` | error | api-contract-check | a GET without `x-cache: none\|private:<ttl>\|public:<ttl>` |
| `E130` | error | api-contract-check | a non-GET without `x-audit: true\|false` |
| `E131` | error | api-contract-check | an operation with a body and no `x-max-body-kb`, or no 413 |
| `E132` | error | api-contract-check | a deprecated operation whose responses carry no `Deprecation` and `Sunset` headers |
| `E133` | error | api-contract-check | an operation without `x-traffic`, or with a class that `info.x-traffic-classes` lacks or gives no `rps`, `peak_factor`, `concurrency` and `rate_limit` |
| `E134` | error | api-contract-check | `x-retry: with-key` without an `Idempotency-Key` parameter and a 409 |
| `W120` | warn | api-contract-check | a string with no `maxLength`, `enum`, `pattern`, `const` or bounded `format`; a number with no `minimum` or `maximum`; an array with no `maxItems` |
| `W121` | warn | api-contract-check | an object schema with properties and no `required` list |
| `W122` | warn | api-contract-check | an `x-timeout-ms` above 2000 on an operation that does not answer 202 |
| `W123` | warn | api-contract-check | a GET with an `ETag` that takes no `If-None-Match` or has no 304, or an `x-cache` other than `none` with no `Cache-Control` header |
| `W124` | warn | api-contract-check | a 2xx JSON response with no example |
| `W125` | warn | api-contract-check | a `ProblemType` that no problem response example shows |
| `W126` | warn | api-contract-check | a get or list without `x-query: { shape, indexes }`, or an index that `data-model.md` does not name |
| `W127` | warn | api-contract-check | an operation with no 429 response |
| `W128` | warn | api-contract-check | an operation with `x-downstream` and no 502, 503 or 504, or one of them with no `Retry-After` |
| `W129` | warn | api-contract-check | `info` without `x-compression`, `x-cors`, `x-security-headers` or `x-enum-policy` |
| `W130` | warn | api-contract-check | a PATCH body that is not `application/merge-patch+json` |
| `W131` | warn | api-contract-check | an operation with no `x-requirements` |
| `W132` | warn | api-contract-check | an operation that does not accept `X-Request-Id` |
| `W133` | warn | api-contract-check | a money-like property (`amount`, `price`, `cost`, `fee`, `balance`) typed `number` |
| `E135` | error | contract-compat | an operation, or a status code it answered, removed |
| `E136` | error | contract-compat | a response field removed, or a request field or parameter newly required |
| `E137` | error | contract-compat | a type changed, an enum value removed (or added under `x-enum-policy: closed`), or a bound tightened |
| `W135` | warn | contract-compat | a break that `contract-diff.md` already names (`--declared`) |
| `W136` | warn | contract-compat | an enum value added with no `x-enum-policy` stated |
| `E138` | error | api-score | a checklist `PASS` with no evidence or contradicted by a checker, a machine row whose checker exited 1, a `Result` outside the vocabulary, a row with no `Area`, or a log `verdict` other than the one the score maps to |
| `E139` | error | api-score | an exception with no human approver named |
| `W137` | warn | api-score | a machine row `NOT_RUN` because its checker output was not given, or an `N/A` on it that cites no answered DEC or no checker exit 2 |

### 13.13 UI readiness and the UI score — owners `dev-specifying-ui` (G5), `dev-reviewing-ui` (G5), `dev-reviewing-implementation` (G7), `dev-reviewing-verification` (G8)

A gate that asks "does it look right?" passes a screen whose roles, states and keyboard path nobody
wrote down. These are the tables a ui-spec carries so that each of them is a fact a check can count,
and the score a reviewer computes from them.

**The ui-spec tables** (template `_templates/ui-spec.md`; lint codes in §11.2):

| Table | Where | Columns | Rule |
|---|---|---|---|
| Roles matrix | `## Screens` → `### Roles matrix` | `Screen \| Action \| Operation \| <one column per role>` | every screen has a row; a role cell is `enabled`, `disabled`, `hidden`, `read-only` or `—`; `Operation` is an `operationId` of the contract, or `—` for a client-only action (`E142`, `E143`). The matrix reflects the contract's per-operation authorisation and never replaces it: the server refuses what the matrix hides |
| States | `## States` | `Screen \| Loading \| Empty \| No results \| Error \| Partial / stale \| No permission \| Offline \| Long text / missing data \| Populated` | every screen has a row and every cell is filled, or `N/A — <reason>` (`E140`, `E141`, `W140`). Error names its timeout; 401 and session expiry are the Error-UX matrix's (§13.3); success after an action is a `UB-NNN` row |
| Traceability | `## Components` → `### Traceability` | `Screen \| Component \| Operation \| Ids` | every screen has a row; `Operation` is an `operationId` the screen reads or calls (its data requirement); `Ids` are the `AC-NNN` and `UB-NNN` the row satisfies, each defined (`E143`, `E144`) |
| Responsive | `## Responsive behaviour` | `Breakpoint \| Shell \| Lists and tables \| Dialogs and forms \| Media` | one row per `docs/design-tokens.json` breakpoint, as `bp.<name>` (`W141`) |

**Forms** follow the `form` pattern rules in `docs/ui-patterns.md`; the ui-spec writes only each
form's fields and its deviations. **Supported browsers** are `DEV-PROFILE §Quality gates`
`Browsers`, a browserslist query, written once per project: Chromium is measured on this machine by
`ui-rubric.mjs` and `ui-snap.mjs`; Firefox and WebKit are measured when Playwright has them, and are
`NOT_RUN` with that reason otherwise. **Open design questions** are `DEC-NNN` (§15.2), never prose.

**WCAG 2.2 AA, the criteria a 2.1 checklist misses:** 2.4.11 focus not obscured (`ui-rubric`
`focus-obscured`), 2.5.7 a single-pointer alternative to every drag, 2.5.8 targets at least 24 × 24
CSS px (`target-size`; axe-core `target-size`), 3.2.6 help in the same place on every screen, 3.3.7
no re-entry of what the user already gave in this process, 3.3.8 no cognitive test to sign in
(paste and password managers work). Alt text: an informative image has an `alt` that says what it
shows; a decorative one has `alt=""`. Live regions: `role="status"` for a result the user waits for,
`role="alert"` only for an error a user action produced (§13.3). A screen-reader pass (NVDA or
VoiceOver over the critical journeys) is a manual row the QA bundle owns (§9).

**Rendering.** A list longer than the page size is paginated from the server (§13.1); a list that
must show more than 200 rows at once is virtualised, and `ui-rubric` `long-list` flags more than
200 rendered rows. Images carry `width` and `height`, load `lazy` below the fold and are served no
larger than twice their rendered width (`image-assets`). Under `prefers-reduced-motion: reduce`
nothing animates (`motion-reduce`). `web-perf.mjs` budgets CLS (default 0.1) beside JS, LCP, TBT and
long tasks; INP is a field metric (p75 ≤ 200 ms), and TBT is its lab proxy. **Text expansion:**
`ui-rubric --pseudo` lengthens every text node by 40% with accented characters before measuring, so
overflow and clipping from a longer language show at G5 and G7. RTL is in scope only when a
requirement names a right-to-left locale.

**Security and privacy in the UI.** A secret, a token, a password or a full personal identifier is
never logged by the client, never in a URL, and never in web storage; a sensitive value is masked
by default with an explicit reveal; a destructive or high-impact action asks first or offers undo
(`docs/ui-patterns.md` Confirmation); session expiry follows the Error-UX matrix 401 row and keeps
the user's input (`ui-privacy.mjs`).

| Code | Class | Script | Rule |
|---|---|---|---|
| `E150` | error | ui-privacy | a `console.*` call that logs a token, password, secret, cookie or authorization value |
| `E151` | error | ui-privacy | a token, password or secret written into a URL or into `localStorage` / `sessionStorage` |
| `W150` | warn | ui-privacy | a file that calls a delete or other destructive mutation and renders no confirm or undo |

**Data that must match.** Fixtures and pilot data are listed in the contract's `info.x-fixtures`
(`path`, `schema`, optional `mode`), and `fixture-check.mjs` validates every record before G4 passes.
Files compared byte for byte are pinned `eol=lf`, and `eol-check.mjs` reads git's effective attribute
for each, never the `.gitattributes` text. Evidence is hashed from `git -c core.autocrlf=false
archive`, never the working tree.

| Code | Class | Script | Rule |
|---|---|---|---|
| `E160` | error | fixture-check | an `x-fixtures` entry whose file is missing or unreadable, or whose schema the contract lacks |
| `E161` | error | fixture-check | a fixture record that does not validate against its schema |
| `W160` | warn | fixture-check | data files under `testdata/`, `fixtures/` or `pilot/` and no `x-fixtures` listed |
| `E170` | error | eol-check | a fixture, golden, snapshot or baseline file whose effective `eol` is not `lf` |
| `E171` | error | eol-check | such a file committed with CRLF in the index |

**Visual regression.** `ui-snap.mjs --golden <dir>` compares each app shot with the PNG of the
same name in `<dir>` and fails a shot whose changed pixels exceed `--threshold` (default 0.5%);
`--write-golden` records today's shots. The golden set is the app on the fixed seed after a human
approved it at G8, never the visual reference: sample data and real data differ in every pixel.

**The UI score.** Layered on the gate verdicts, never replacing them. `<root>/scripts/ui-score.mjs`
writes the rows a checker decides, from the other checkers' `--json` output; the reviewer decides
the rest, and the table goes into the gate log under `## Verdict` as `### UI score`, one row per
criterion: `Section | Criterion | Status | Weight | Evidence`. Status is `PASS`, `FAIL`, `NOT_RUN`,
`UNKNOWN`, or `N/A — <reason>`. The sections and weights (sum 100) are `lib/ui-score.mjs`
`CRITERIA`; the mandatory ones are design-system compliance, the states matrix, the roles matrix,
accessibility AA, and no unresolved critical usability, accessibility or security finding.

| Result | When | Gate verdict |
|---|---|---|
| `PASS` | score ≥ 90 and every mandatory criterion `PASS` | `PASS` may be written |
| `REVIEW` | score 75–89, or a mandatory criterion `NOT_RUN`, or an `UNKNOWN` | `CHANGES_REQUESTED` |
| `BLOCKED` | score < 75, or a mandatory criterion `FAIL` | `CHANGES_REQUESTED` (`BLOCKED` when the fix is upstream) |
| `NEEDS_CLARIFICATION` | a criterion `UNKNOWN` because an open `DEC-NNN` it cites decides it | `CHANGES_REQUESTED`, the DEC stays open for `/sdlc-ask` |

Score = weight of `PASS` rows ÷ weight of rows that are not `N/A`, × 100. A mandatory failure
overrides any score. **Never approve on appearance alone**: shots are evidence for the look rows
only; the states, accessibility and behaviour rows need their own evidence. **Approvals**: the
visual design's `approved_by` is the product owner; `approvals: { design, engineering,
accessibility }` name the other three, each a human (`E146`). G6 needs all four; G8 records them
with the UI QA rows. `lint-dev.mjs` recomputes the score from the table and fails a log whose
verdict or stated result disagrees with it (`E145`).

---

### 13.14 Cloud architecture — owner `dev-designing-cloud`, enforced at G2 + G10

A change that deploys to a cloud provider decides **where it runs before it is built** (G2) and
**builds exactly that** (G10). One model carries both: `deployment/<slug>/topology.yaml` names the
provider (`aws` · `azure` · `gcp` · `alibaba` · `oci`), the provider's groups (account, region,
network, zone, subnet, and `cluster` / `namespace` for Kubernetes on any of them) and every
component as a **neutral kind** (`container-service`, `sql-database`, `queue` …). The service name,
the official icon and the diagram rules come from the provider's adapter in `scripts/lib/clouds.mjs`
— never from the author.

1. **Provider choice is an ADR.** The first G2 that puts a slug on a cloud records the provider and the
   runtime model (VM, managed containers, Kubernetes, functions) in an `ADR-NNN` with at least two
   options scored against the quality-attribute ranking. The options may be different providers;
   `topology.mjs table <slug> --as <providers>` gives the service mapping, and the framework pillars
   of the chosen provider are the review headings. Kubernetes is a choice with a cost: it is chosen
   only when a row of `dev-designing-cloud/runtime.md` forces it.
2. **The diagram follows the provider's standard.** Groups nest the way the provider draws them (an AWS
   subnet inside a VPC inside a region; an Azure subnet inside a VNet; an OCI subnet inside a VCN);
   the provider's required groups are drawn; components use the provider's official icon set, drawn
   by draw.io's own renderer. `topology.mjs render` writes `diagrams/<slug>/cloud/`: an editable
   `.drawio` per provider, its SVG and `index.html`. The architecture and release plan link the SVG
   and carry the service table; the YAML is hashed with the gate (§5.2), the drawing is derived.
3. **Data stays private.** A data store (`sql-database`, `cache`, `nosql-database`, `file-storage`,
   `search`, a StatefulSet) in a public subnet is `W731` — an ADR argues the exception or it moves.
4. **Every edge is labelled** with the protocol and port, or what flows (`W732`).
5. **The IaC builds the model.** From G7, the Terraform / OpenTofu, Bicep or Kubernetes files that
   build the slug are held against the model: `topology.mjs drift <slug> --iac <dirs>` exits 0 at
   G10 — every component has its resource (`E740`), and a resource of a mapped type with no
   component is `W741`. A component not built by IaC says `iac: false` and the artifact says why.
6. **Defaults** (deviate by ADR): IaC in OpenTofu or Terraform with remote state, one state per
   environment; images pinned by digest (§13.4); secrets in the provider's secret store, read at run
   time, never in an environment file committed to git; every resource tagged `app`, `env`, `owner`,
   `cost-center`; least-privilege workload identity, no long-lived keys; private networking for every
   data store; at least two zones for production; a budget alert per environment.

| Code | Class | Rule |
|---|---|---|
| `E720` | error | no `provider:`, or one that is not in the registry |
| `E721` | error | a component kind that is not in `KINDS` |
| `E722` | error | a group kind the provider (or Kubernetes) does not draw |
| `E723` | error | an id that is not lower-kebab-case, or declared twice |
| `E724` | error | `in:` names a group that is not declared |
| `E725` | error | a group inside a parent the provider does not allow, or a Kubernetes object outside a `cluster` |
| `E726` | error | a group the provider requires on every diagram is missing |
| `E727` | error | an edge end that is not a declared node or group |
| `W730` | warn | a cloud component drawn outside every group |
| `W731` | warn | a data store in a public subnet |
| `W732` | warn | an edge with no label |
| `W733` | warn | more components than one diagram carries (40) |
| `W734` | warn | no `title:` |
| `W735` | warn | `render --as`: the model uses a group another provider cannot draw — the comparison page is approximate |
| `E740` | error | `drift`: a component or group with no IaC resource of its kind |
| `W741` | warn | `drift`: an IaC resource of a mapped type that no component declares |
| `E742` | error | `drift`: no IaC resource under the folders given |
| `E743` | error | `render`: draw.io could not draw a page |
| `W744` | warn | `render`: no browser or no network — the `.drawio` files are written, the SVG is not |


### 13.15 Security findings ledger — owner `dev-hunting-vulnerabilities`, enforced at G8 + G9

`<root>/security/findings.md` is the one record of every vulnerability found in the repository, by
a scanner or by a reviewer. `security-scan.mjs` writes it; a human triages it; G8 and G9 read it.

1. **One row per finding, for life.** `SEC-NNN`, keyed by a fingerprint (tool, rule, file, the
   scanner's own stable key) that survives a line move. A rerun never creates a second row for the
   same finding and never undoes a triage.
2. **Four statuses.** `open` · `fixed` (set by the script when a scanner that **ran** no longer
   finds it; a scanner `NOT RUN` proves nothing fixed) · `accepted` (Owner and an `Until` date,
   set only by a named human, §4.5) · `false-positive` (Evidence that says why). A `fixed` row that
   comes back is reopened.
3. **What blocks.** `security-scan.mjs check` exits 1 on an `open` row at or above the block
   severities (default `critical,high`), an `accepted` row without an owner or past its date, a
   `false-positive` without evidence, or an unknown status. G8 row 14 and G9 row 17 fail on it.
4. **Reviewer findings join the ledger.** `/sdlc-security` and G7's risk-path read add rows with
   `Tool` `review`; no scanner closes them.
5. **Pinned scanners.** Each scanner image is `version@sha256:`, a release at least two weeks old.
   A scanner that cannot run is `NOT RUN` in `security/runs/<run-id>/tools.md`, never absent.
6. **Nothing secret is written.** Finding text is redacted before it is stored; the ledger is
   committed, the raw `security/runs/` output is not (§18.5).

## 14. Tracker adapter

The pipeline must not be welded to one tracker. `DEV-PROFILE §Project` declares
`tracker.provider`, and only the edges of two commands change:

| Provider | `/sdlc-intake` | `/sdlc-release` |
|---|---|---|
| `none` *(default)* | slug only; no key | branch and PR named from the slug |
| `azure-devops` | fetch the work item, snapshot it into `intake/<slug>/` | write the key back, link the PR |
| `jira` | fetch the issue | same |
| `gitlab` | fetch the issue | same, plus MR |

Adapters are skills (`dev-tracker-<provider>`) behind one interface: `fetch(key) → snapshot` and
`link(key, url, state)`. A provider with no adapter installed degrades to `none` with a warning — it
never blocks a gate, because a ticketing outage is not a reason to stop engineering.

---

## 15. Change class, and the decision ledger

### 15.1 Change class

Twelve gates are right for a new capability and absurd for a nullable column. A pipeline with one
speed gets bypassed for everything small, and a pipeline that is bypassed is decoration. So the
class is **declared at intake**, recorded in `state.json`, and decides which gates apply:

| Class | Gates that run | Typical work |
|---|---|---|
| `initiative` | GK · G0 → G11, all of them | a new capability |
| `change` | GK · G1 (short form) · G6 · G7 · G8 · G9 — and any of G2–G5 and G10–G11 the change actually touches | a new field, a changed rule, a new endpoint on an existing resource |
| `fix` | GK · G7 · G8 · G9 | a defect, with no contract, schema or UI change |
| `refactor` | GK · G7 · G8 · G9, through `/sdlc-refactor` | a structural change nothing outside the code can observe |
| `spike` | GK · G0 · G2 | a question that only an experiment can answer: will it work, how fast, how much |
| `fast` | GK · G0 · G1 · G7 per slice · G8 · G9 · G10 — and G5 when there is UI, G2/G3/G4 when a slice escalates, through `/sdlc-fast` | a product the requester wants usable now, on a spec they can approve in a day |

The gates a class does not run are `SKIPPED` **by class**, written once at intake with
`skip_reason.type: NOT_APPLICABLE` and the class as the explanation. That is the point of declaring
it: without a class, a one-line fix still costs five reviewer runs whose only output is the word
"N/A".

**Classes are claims, and claims are checked.** If a `fix` turns out to change the API contract or
the schema, the stage that discovers it stops and re-classifies — a `fix` that quietly ships a
migration is precisely the change that should have had a G3 review.

**G10 and G11 are decided the same way G2–G5 are, and for the same reason.** A `change` is not
skipped past deployment and monitoring by its class; both are left `NOT_STARTED` and each gate's
reviewer applies its own published applicability rule (§5.4). Intake may not guess, because the
thing that decides is not the size of the change: a one-field `change` that carries a migration
needs a rollback plan for data already migrated (§13.4), and a `change` that moves a latency number
needs the SLO that will notice (§13.5). A class table that skipped them by size would skip exactly
the changes that most need them — and it would do so silently, at intake, weeks before anyone could
see the cost.

For `fix` the skip stands, and it is safe only because of the rule above it: a defect fix that needs
a migration or moves an SLO has already stopped being a `fix`.

**A `refactor` runs the gates of a `fix` and is held to more.** Its G7 adds the behaviour-preserving
checks of `/sdlc-refactor` (no test changed, the same tests pass by name, no public surface moved).
Without the class, a refactor is filed as a `fix` with no defect, or a `change` with five gates
saying "as before"; with it, the one condition that matters is the one reviewed. A test that had to
change re-classifies it as a `change`.

**A `spike` ships an answer, never code.** G0 frames the question, its time box and what result
answers it; the experiment runs on a `spike/<slug>` branch; G2 judges the answer as an `ADR-NNN` with
the evidence the experiment produced. G1 and G3–G11 are `SKIPPED` by class, so nothing reaches G9 and
the branch is never merged. Building on the answer is a new slug — `change` or `initiative` — that
cites the ADR. A spike whose code someone wants to keep has stopped being a spike: that is the
prototype that becomes production without a single review.

**A `fast` slug decides once, then builds in slices.** The requester asks for it in writing (the
quote and the date go in `plan/<slug>/slices.md` `## Requested`). What stays is what is expensive
to get wrong late: G0 (the problem, and where it runs and where its keys live, §13.4), G1 (REQ-NNN
and acceptance criteria) and, when there is UI, the G5 look the requester approves. G2, G3, G4, G6
and G11 are `SKIPPED` by class at intake. In their place `/sdlc-fast` writes `slices.md`: slice 1
is the deploying skeleton (the pipeline that builds, deploys `staging` on every merge and
`production` by hand, the keys in the store, `env-doctor.mjs` green), and every later slice is
something a user can do on its own, with the smoke that proves it. Each slice is one G7 slice log
(§5.5): tests green, built, started, smoked. G8, G9 and G10 then run once, over the whole branch,
and G10 deploys through that pipeline.

**Risk brings the gate back, for that part only.** A slice that touches sign-in or permissions,
secrets, money or personal data names `G2` in its `Escalates` column, and G2 runs the threat model
(`design/<slug>/threat-model.md`) for that slice before its G7. A migration that is not purely
additive names `G3`, and G3 runs `migration-plan.md`. A breaking change to a published API names
`G4`, and G4 runs `contract-diff.md`. The intake skip for that gate is superseded by the run;
nothing else of the gate's full form is written. `fast-check.mjs` fails a slice that escalates to a
gate still `SKIPPED`, and warns on a slice whose words suggest one of these with `Escalates: none`.
A decision taken on the requester's behalf is a `DEC-NNN` with `status: assumed`, listed in
`## Decisions`, so they can overturn it. A `fast` slug that grows a second service, or a schema
nobody can describe in one table, has stopped being `fast`: re-classify it as an `initiative`.

### 15.2 The decision ledger

Some answers do not exist in the repository: what customers will pay for, what risk is acceptable,
what the maximum import size should be, when this must ship. No skill can derive them, and an agent
that invents them produces confident, well-formatted nonsense.

So a stage that meets one **does not guess**. It records `DEC-NNN` in `<root>/decisions/<slug>.md` and
carries on with everything that does not depend on it:

```markdown
| Id | Question | Why it is needed | Options | Recommended default | Blocks | Status | Answer |
|---|---|---|---|---|---|---|---|
| DEC-001 | Maximum CSV size we support? | Decides streaming vs in-memory, and the 413 threshold | 5MB · 50MB · unbounded+async | 50MB, streamed | G2 design, TASK-004 | open | — |
```

| Rule | Why |
|---|---|
| `/sdlc-requirements <slug> --clarify` scans the G1 draft for gaps (scope, data, NFRs, edge cases, integration, terms, completion signals), raises at most **5** as `open` rows ranked by impact × uncertainty, asks them **one at a time** before review, and folds each answer into its owning section. A skipped question stays `open`; the rest stay in PRD `## Open questions` | Asks the few questions whose answers move the most requirements while the draft is still cheap to change, and stays optional: without the flag G1 runs as before |
| `/sdlc-ask <slug>` puts every `open` decision to the human, batched | One conversation of five questions beats five interruptions, and it is the whole mechanism for "less human effort" — not fewer stops, but stops that are worth making |
| **Options are 2–4 mutually exclusive choices a human can pick, and the recommended default is one of them.** A question about a quantity offers ranges the design would treat differently, plus `not measured yet`. `/sdlc-ask` presents the default first, marked recommended, and always accepts an answer in the human's own words | A question with nothing to pick makes the human do the analysis the stage was supposed to do. A default that is not among the options cannot be chosen with one answer |
| **An agent may never set `status: assumed`.** Only a named human may say "proceed on that default" | This is the rule the whole ledger rests on, and the escape hatch was quietly eating it. A default an agent chose for itself is still the agent's answer to a question it was told it could not answer — the only difference from guessing is that the guess is minuted. `assumed` therefore carries `who:`, exactly like an override (§4.5), and a row without one is `error` E017 |
| A stage that meets an open decision **carries on with everything that does not depend on it**, and marks what does `N/A — blocked by DEC-NNN` | This is what stops the prohibition becoming a deadlock. Waiting on an answer that does not change the next three tasks is still waste; the fix is to keep working around the gap, not to fill it |
| **A default is not a decision.** A value `DEV-PROFILE §Defaults` fixes is applied with its citation; a DEC is raised only to deviate from it | On release-management about 25 of 98 DECs asked a human for a lockout count, a page size or a session life that a standard already answers |
| An `assumed` decision that reaches G9 unanswered is a `MAJOR` finding | An assumption that ships is a decision nobody made |
| Past G2, at most **5** rows are `assumed` at once (`E044`) | A delegated run on anime-blog carried 29 assumed rows to G9, where they blocked the release in one batch: the questions were asked at the one moment the answers could no longer change anything |
| The ledger is always an **input** in a gate log, never an output — even for the gate that opened the decision | An `outputs:` entry is *the thing this gate was judged on*, and the reviewer did not judge answers that did not exist yet. Filing it as an output means answering one question marks the reviewed artifact as edited, and the damping valve refuses to help: `--reaffirm` damps an output change only inside the small self-edit bound (§4.4), and a ledger answer is not an edit to the reviewed artifact, so a single answer would force a full stage re-run. `error` E016 |
| Answering a decision is an **input change** — the gates that relied on that `DEC-NNN` row go `STALE` (§4.4), whether they cited it by row or listed the whole ledger and cite it in the log (§5.2) | The existing machinery already handles it. Row-scoped reading (§5.2) keeps one answer, or one new question, from staling every gate on the slug |
| A decision is never answered by an agent | That is the one thing it cannot do honestly |

### 15.3 Size before acting, and spend no more than that

Cost grows with what agents re-read, and a run discovers an overrun only when it has been paid.
So the work is sized at intake, before any author runs, and held to that size at every gate.

| Rule | Mechanism |
|---|---|
| Intake runs `size.mjs estimate <slug>`: the fewest gates the class needs, each skipped gate with its reason, tokens, cost and a spawn budget, in `<root>/estimates/<slug>.json` | the class table (§15.1) and per-gate token weights |
| An estimate over `DEV-PROFILE §Gate policy` `Token budget` (or `SDLC_BUDGET_TOKENS`) stops the stage before it starts, exit 3, until a named human approves (`--approved-by`) | a cost is a human's decision (§15.2) |
| Each stage's preflight and G11 row 23 run `size.mjs check`: exit 1 when recorded tokens exceed the estimate by more than 50 %, or spawns counted from the gate logs exceed the budget, with no recorded reason | `size.mjs reason --cost` / `--spawns` records one |
| Actual tokens are what `size.mjs actual --gate <G> --tokens <n>` recorded; nothing is guessed | `bench.mjs` reports them per stage, `null` where unknown |
| A reviewer starts from `review-brief.mjs`: the stage's files, the ones changed since the last log, their lint findings, the prior log's failed rows, the contract sections to print, and its model | heavy gates (G2, G3, G4, G7, G10) and every `initiative` gate keep opus; the rest run on sonnet |
| No agent reads `DEV-CONTRACTS.md` whole; it prints the sections it needs with `contracts.mjs` | `tests/token-levers.test.mjs` |
| An agent takes the next `REQ`, `AC` or `TASK` id from `run-id.mjs --next <kind> <slug>` and sets a traceability cell with `trace-upsert.mjs`, without reading the file | the same claim lock as `CR` and `DEC` ids (§1.1) |

---

## 16. The repository knowledge track (`GK`)

The G0–G11 ladder answers *what to build*. In a codebase that already exists, three questions have
answers **already written in the code** — where does this go, what does it have to match, what will
it break — and an agent that reasons them out instead of reading them out produces work that is
correct in general and wrong here. That is the difference between a design that could be about any
system and one that is about yours.

### 16.1 The track

`GK` runs **per repository**, not per slug: once to build, then refreshed where it drifts.

| Card | Contains | Is the baseline for |
|---|---|---|
| `codebase-map.md` | modules, owners, entry points, layering, dependency direction | G2, G6 |
| `conventions.md` | naming, error handling, logging, config, testing — **extracted from the code, each with a real `file:line` example** | G6, G7 |
| `schema-as-is.md` | the live schema, introspected from the database rather than inferred from migrations | G3 |
| `api-as-is.md` | the contracts actually in production | G4 (`contract-diff.md` diffs against this) |
| `test-conventions.md` | where tests live, how they are named, how they are run | G7, G8 |
| `known-debt.md` | what not to touch, what is mid-migration, and why | every stage |

### 16.2 GK is a gate, not a folder

`GK` runs the same machinery as G0–G11 and appears in `state.json` as a stage-shaped object with a
state from the §4.1 machine. Its log is `<root>/reviews/_repo/GK-knowledge-<run-id>.md`; `_repo` is
reserved and cannot collide with an initiative, because a slug is lowercase-kebab (§1) and so never
begins with an underscore.

The log's `outputs` are the six cards. That is what makes the ordinary staleness rule do the work
here: **edit a card after its review and GK goes `STALE`** (§4.4), exactly as editing an approved
design does. Cards on disk with no log are `AUTHORING` — written, not yet checked.

The distinction that matters: *the cards exist* and *someone verified the cards* are different
claims, and only the second one licenses the gates downstream to trust them. Six confidently wrong
cards exist too.

### 16.3 Grounding and drift

Every card carries `grounded_at: <commit sha>` and cites `file:line` for each claim it makes. When
the cited files change, **that card** is stale — not the whole map. `/sdlc-onboard --refresh`
rebuilds only the stale cards.

Because gate logs already hash their inputs (§5.1), and every gate lists the knowledge cards it
relied on among them, **a knowledge change propagates staleness through the ladder with no new
mechanism**. This is the same rule doing more work, which is the only kind of rule worth adding.

### 16.4 Brownfield obligations

`DEV-PROFILE §Project` declares `project_maturity`. In `brownfield` these stop being good practice
and become gate conditions:

| Obligation | Gate | Failure |
|---|---|---|
| **"Extend what exists, or build new?"** — answered explicitly, with evidence that the existing system was searched | G2 | `MAJOR`. Skipping this is how a codebase acquires a third endpoint that nearly duplicates two others |
| A design that contradicts an existing ADR **supersedes it in writing** | G2 | `BLOCKER` — silent divergence leaves two live answers to one question |
| An ADR amendment that changes the decision, its scope or its consequences, rather than clarifying or citing (§1) | G2 | `BLOCKER` — it is a reversal wearing an amendment's date; write a new ADR that supersedes |
| `impact.md` names every module, table, endpoint, screen and test this touches, and what breaks | G2 | `MAJOR` |
| Code placement comes from `conventions.md`, not from taste | G6 | `MAJOR` |
| New code matches the repo's real examples, not a generic house style | G7 | `MINOR`–`MAJOR` by distance |
| Greenfield too: G6 writes `conventions.md` and `test-conventions.md`, and G7 holds new code to them (§13.11) | G6, G7 | `MAJOR` |

---

## 17. The improvement loop

A pipeline that cannot learn plateaus at whatever its first author knew. The only feedback that
matters is the one that arrives after real traffic — so `post-release.md` (§G11) is not the end of a
document, it is the input to the next version of a reviewing skill.

```
G11 post-release finds something that went wrong
        │
        ├─ would a gate review have caught it, if it had asked?
        │        │
        │        ├─ no  → record it and move on; not every failure is preventable
        │        │
        │        └─ yes → /sdlc-improve <gate> "<the check that was missing>"
        │                    ├─ adds one row to that reviewing skill's published checklist
        │                    ├─ adds a fixture to tests/fixtures/broken/ that the check must catch
        │                    └─ adds a fixture to tests/fixtures/valid/ it must leave alone
        ▼
   the next initiative is reviewed against a checklist that knows about this failure
```

Two rules keep it from turning into checklist sprawl: a new check needs both fixtures (§L2), and a
check that has never fired across ten initiatives is a candidate for removal. A checklist that only
grows becomes a checklist nobody reads carefully.

---

## 18. Delivery hygiene — commits, skeleton, ops, dependencies

The product around the code — its history, its first files, its alerts, its dependencies — is
built and checked like the code: at G6 and G7, by script, not at G9–G11 by memory.

### 18.1 Commits and branches — `commit-lint.mjs`

| Rule | Detail |
|---|---|
| **Header** | Conventional Commits 1.0: `<type>(<scope>)!: <subject>`. Types: `feat` `fix` `perf` `refactor` `test` `docs` `build` `ci` `chore` `style` `revert`. |
| **Scope** | Closed: a module from `DEV-PROFILE §Delivery` `Commit scopes`, or `sdlc`. A gate, state or ledger commit is `docs(sdlc): G<N> <slug> <verdict> (<run-id>)`. |
| **Subject** | ≤ 72 characters, starts lower-case, no trailing full stop. |
| **Trailers** | Every `TASK-NNN`, `DEC-NNN` and `CR-NNN` the commit concerns is in a `Refs:` trailer; a commit that finishes a task says `Done: TASK-NNN`. An id in the subject or body and not in a trailer is a finding. With more than one `plan/<slug>/`, a task commit also says `Slug: <slug>`: TASK numbers restart per slug, and an untrailed commit is then no slug's. |
| **Merge** | `merge(lane-<x>): <TASK ids or summary>`. Lanes rebase onto the feature branch before hand-back; the feature branch is never merged back into a lane. |
| **Size** | A commit over 500 changed lines is `warn` (generated and lock files excluded). |
| **Branch** | No commit on a protected branch (`DEV-PROFILE §Delivery` `Protected branches`), and a new branch matches the branch convention. |
| **Where it runs** | `<root>/ci/git-hooks/commit-msg` and `pre-commit` (`git config core.hooksPath <root>/ci/git-hooks`), and CI over the merge request's range. |
| **Progress** | `commit-lint.mjs --progress <slug>` appends one `progress.md` row per `Done:` trailer not yet recorded, with the commit's short sha, from the slug's own commits only (as `change-summary.mjs` counts them). The implementer does not type progress rows. |

### 18.2 The G6 skeleton

Every `initiative` plan (and any `change` into a repository missing one) carries a skeleton task per
missing row, from `<root>/_templates/skeleton/`. G6 fails a plan that lacks one; G7 runs
`node <root>/scripts/skeleton-check.mjs` and fails on any `MISSING`.

| File | What it must be |
|---|---|
| `README.md` | a Diátaxis tutorial: clone, run and test in ≤ 10 command lines |
| `ARCHITECTURE.md` | C4 level 1 (context) and level 2 (containers) as mermaid; detail links to `<root>/design/` |
| `CHANGELOG.md` | Keep a Changelog 1.1, an `## [Unreleased]` section |
| version | SemVer, reported by `--version` (Go `-ldflags "-X main.version=…"`, else `package.json` `version`) |
| `Dockerfile` | multi-stage; every `FROM` pinned by `@sha256:` digest |
| `Taskfile.yml` | `setup` · `dev` · `seed` · `check` · `check:fast` (under 2 minutes) |
| `renovate.json` | the update bot, grouped, patch automerge off until CI is green (§18.4) |
| licence check | a `check` step that fails on a licence outside `DEV-PROFILE §Dependencies` |
| `.editorconfig` · `.nvmrc` / `engines` · `.npmrc` | `save-exact=true` where npm is used |

The folder tree a task creates is `dev-resolving-code-placement`'s; these are the files at its root.

### 18.3 Ops as files, from G6

`dev-designing-observability` writes, at G6 and built at G7: `ops/alerts/<service>.yml` (Prometheus
rule groups, one alert per `SLO-NNN`, the id in a `slo` label or the alert name),
`ops/dashboards/<service>.json`, `ops/runbooks/<alert>.md` (the Google SRE shape: symptom, impact,
diagnose, mitigate, escalate) and `ops/config/<env>.env.example` per `DEV-PROFILE §Environments` row.
Telemetry leaves through `ops/otel/collector.yaml` (OTLP traces, stdout logs linked to their trace,
the `/metrics` scrape); a backend is an overlay in `ops/otel/backends/` (Grafana, Datadog, S3), so the
code never names a vendor. The one logging API is `<root>/_templates/code/<lang>/obs`. The bundle's
own checkers log the same way, to `<root>/logs/runs.jsonl` (git-ignored, `SDLC_RUN_ID` per gate).
Once a slug has a G7 log, an `SLO-NNN` its artifacts define that no alert file names is `error` E091.
`skeleton-check.mjs` checks digest pins at G7. **G7's exit criterion includes the first push and a
green pipeline URL** for the reviewed commit, in the final G7 log's `## Scope`; a repository with
no remote is `BLOCKED`, not passed. A CI template `DEV-PROFILE §Delivery` `CI` does not name is
flagged by `doctor.mjs` and removed by `doctor.mjs --prune --yes`.

### 18.4 Dependencies

`DEV-PROFILE §Dependencies` holds the pin policy, the update bot and the licence allowlist. A new
direct dependency carries one line in an ADR (or the slug's architecture `## Decisions`): what it
does, the alternatives already in the tree, its licence. G7 fails a new dependency that is not
justified, not on the allowlist, or a second library for a job one already does.

### 18.5 Generated evidence stays out of git

`<root>/.gitignore` (shipped) excludes `state.json`, `DASHBOARD.md`, `implementation/*/ui-snap/`,
`verification/*/runs/*/ui-snap/`, `*.png` and `*.html` under `verification/`, `*.gz`, and
`reviews/*/.reaffirm-*` / `.brief-*`. A gate log hashes a raw log it relies on (§5.2), so the hash
survives the file; `verify.md` names where the run kept it. A project that committed these
before the ignore file shipped untracks them once (`git rm --cached`); `doctor.mjs` warns until
it does.

### 18.6 Lane hygiene and DX

| Rule | Detail |
|---|---|
| **Vendored scripts** | `<root>/scripts/` is bundle code. `doctor.mjs` compares each against `scripts/.manifest.json` and warns on one edited in place; a fix goes upstream through `/sdlc-feedback`. |
| **Parallel checks** | A project check script takes a lock (`flock`) or a per-run database name (`${DB_NAME}_${RUN_ID}`); two runs never drop each other's database. |
| **Fail, not skip** | In CI (`CI` set), a test that needs an environment variable that is unset fails; a skip is allowed only locally. |
| **Wiring hubs** | Each module registers its own routes and services (`skills/dev-writing-go-code/registration.md`); `main.go`, the router and the service container do not grow per feature. |


### 18.7 Where it runs, decided before it is designed

The host, the environments, the pipeline and who deploys shape the design: background jobs, media
storage, an edge runtime, a database pooler, the secrets store. Left to G10, they are decided on
release day, against code that assumed something else. So they bind from G0, and G10 only promotes.

| Rule | Checked by |
|---|---|
| **G0.** The host, the environments, who deploys and the secret store are decided at intake, or raised as a `DEC-NNN` whose `Blocks` is **G2** (§13.4) | `dev-reviewing-intake` row 18 |
| **G2.** `architecture.md` `## Deploy target` carries five lines: `Host:`, `Shape:`, `Environments:`, `Pipeline:`, `Who deploys:`. `Host:` and `Shape:` (client and server as separate deployables · modular monolith · serverless) each cite the `DEC-NNN` the owner answered, or say `unchanged` with a link | `E041` (a line missing, empty or `TBD`; `Host:`/`Shape:` with neither a DEC nor `unchanged`) · `E043` (a G2 `PASS` in force while a DEC cited there is not `answered`) |
| **Environments.** At least `local`, `staging` and `production`. `staging` runs on the production host type with its own database (a branch is enough) and its own subdomain; one domain serves every environment | the G2 reviewer, against `DEV-PROFILE §Environments` |
| **G6.** An `initiative` plan has the §13.4 pipeline task (its `Task` starts `Pipeline` or `Walking skeleton`), started from the skeleton's `.gitlab-ci.yml`, `ops/deploy.sh` and `ops/compose.prod.yaml`, with no feature task ordered before it | `lint-dev.mjs` E042; `dev-reviewing-plan` row 24 |
| **G8** runs against `staging` when `DEV-PROFILE §Environments` declares one; a local-only run says why in `verify.md` | the G8 reviewer |
| **Code freezes at G8.** The SHA G9 ships is the SHA the G8 run in force verified. A fix after G8 goes to the next release, or re-opens G7 on the owner's word, and G8 runs again | the G9 preflight (shipped SHA ≠ run SHA is `BLOCKED`) |
| **G10 only promotes** a build the pipeline already deployed to `staging`; a production host that is a developer's machine needs an answered interim `DEC-NNN` (§13.4) | `dev-reviewing-deployment` rows 25 and 28 |
| **Go-live.** A public web release adds the checklist in `dev-planning-deployment/go-live.md` (legal pages, sign-in provider branding and domains, search console, `ads.txt`, the first admin with a second factor, a backup, `env-doctor.mjs --clock-url`) to the release plan's `## Preconditions` | `dev-reviewing-deployment` row 30 |

---

## 19. Lessons — what the project learns (`/sdlc-learn`)

§17 improves the bundle from a failure in production. This section improves the **project** from
everything before that: a gate that sent the same thing back on two initiatives, a finding the
author said was fixed and the reviewer reopened, a `post-release.md` that learned something. A
pipeline that only remembers what reached production relearns every review it ever lost.

### 19.1 The lesson

`<root>/learnings/LRN-<TOPIC>.md`, one lesson per file, from `_templates/learning.md`. The format is
the QA bundle's (its CONTRACTS §23), so both bundles and one Recall store read one shape.

| Key | Rule |
|---|---|
| `id` | `LRN-<TOPIC>` (uppercase kebab), equal to the file name; permanent, never reused |
| `title` | one line: the habit, not the incident |
| `status` | `active` \| `deprecated` (with `superseded_by: LRN-…` or `reason:`); files are never deleted |
| `confidence` | `provisional` on one initiative; `established` only on two initiatives or a `human:` entry |
| `applies_to` | `[ … ]` gates (`g4`), stages (`api`), skill names, modules or globs — what recall matches |
| `evidence` | `[ … ]` paths under the root that exist (a gate log, a `post-release.md`, any artifact) or `human: <who> — <what>` |
| `probe` | the question a future stage would ask that this answers, ending in `?` |
| `created` · `updated` | `YYYY-MM-DD` |

The body is at most 30 lines: **Do** · **Why** · **Not** (the tempting wrong fix). **Evidence counts
by initiative**: every artifact of one slug (its gate logs, attempts 1 and 2, its post-release) is one
source, because an initiative repeating its own mistake in its own retry predicts nothing about the
next one. A lesson is never a fact about the system — that is a knowledge card (§16) — and never
evidence: a stage that recalls one treats it as the first hypothesis, and the code, the cards and
the reviewer decide.

### 19.2 The gate

`node <root>/scripts/learn.mjs check` must print `0 error(s)` before a lesson counts. It refuses a
missing key, a malformed id or date, a file name that is not the id, a status or confidence outside
the vocabulary, a probe that is not a question, evidence that does not exist, `established` on one
initiative, a deprecation with no reason, a body that is empty or over 30 lines, a near-duplicate
of an active lesson (title + probe overlap ≥ 60 %), and any text `lib/lesson-scan.mjs` flags.

**Lesson safety.** A recalled lesson enters an agent's prompt, so every field and the body pass
`lib/lesson-scan.mjs`, the same file as the QA bundle's, kept byte-identical by a test. It refuses
four categories — injection, exfiltration, secret, invisible or bidi unicode — and reports the rule,
never the matched text. `recall` and `show` withhold a flagged lesson with a warning; `harvest`
prints a flagged signal without its subject and exits 1. There is no override flag: a flagged lesson
is rewritten without the text.

### 19.3 Harvest, recall, audit

| Command | Does |
|---|---|
| `learn.mjs harvest [--min 2]` | Proposes, never writes. Signals: **recurring rework** (one gate at attempt 2 on ≥ min initiatives), **recurring finding** (findings at one gate on ≥ min initiatives whose problem says the same thing), **reopened finding**, **post-release** (a `## What we learned` that says something), **lane friction** (a `## Process friction` bullet that ≥ min lane notes say in the same words), and the **process** signals of one initiative: **costly gate** (one gate logged ≥ 4 times on a slug), **override** (a gate in force on a human `override:`), **reaffirm cascade** (≥ 3 reaffirm logs on a slug), **out of order** (a later gate logged while an earlier one is neither `PASS`, `SKIPPED` nor overridden). A signal every active lesson already cites is `covered` |
| `learn.mjs recall [--gate] [--stage] [--skill] [--module]` | An index of the active lessons that apply — id, confidence, title, probe — ranked by matched terms, then established first, capped at `--limit` (8) |
| `learn.mjs show <id> …` | The bodies of the hits whose probe is the reader's question, never every hit |
| `learn.mjs audit` | Provisional lessons with no new support in 60 days, broken evidence, flagged text |

`/sdlc-learn` writes at most three new or updated lessons per pass, and the agent that writes a
lesson does not judge it: `dev-gate-reviewer` accepts or rejects each one against its evidence.
Lessons are not stage artifacts: `lint-dev` skips `learnings/`, no gate hashes a lesson, and
answering or deprecating one stales nothing.

### 19.4 Across projects

The lessons stay files in the project, and the project learns with no server. Recall is the optional
layer that lets one project's lesson reach another, and lets the bundle itself learn from several.

| Command | Does | Never |
|---|---|---|
| `learn.mjs push` | Sends each **established** lesson to Recall as `kind: lesson` with its confidence, tagged `sdlc`, its gates and stages, and `project:<DEV-PROFILE §Project Name>`. `learnings/.pushed.json` records what went, so a lesson goes once and again only when it changes; Recall refusing the same text twice counts as sent | Sends a provisional or a flagged lesson; records a failed send |
| `learn.mjs recall --shared` | Adds up to three lessons Recall shares with every project (`--scope shared`, so a project key never returns the project's own lessons) to the stage's index, labelled as another project's habit (§19.3) | Treats one as a rule here |
| `learn.mjs promote` | Groups shared lessons that say the same thing; a group from **two or more projects** is a candidate for the bundle, offered to a human through `/sdlc-improve` or a skill edit that cites the entries. For each candidate entry it prints `recall share request <id>`; `--request` sends them, and the Recall Owner reviews a cleaned copy before every project sees it `--local --approved-by <who>` offers this project's active lessons that apply to `process` (the bundle's own steps, not the product): a human's word stands in for the second project | Edits the bundle; promotes a lesson that names one system's path, endpoint, table or pipeline id — that is a fact, not a habit, and it is reported `REFUSED` |

With no Recall, `push` and `promote` say so and exit 0: learning across projects is an addition, not
a precondition.

### 19.5 The loop runs on its own

A step someone has to remember runs twice and stops. So the loop is wired to events that already
happen, and a human is asked only where a wrong answer would spread.

| Event | What runs | Human |
|---|---|---|
| A session opens | `learn.mjs brief` from the SessionStart hook | no |
| A stage starts | `learn.mjs recall` (protocol preflight 7) | no |
| A stage ends | `learn.mjs brief` after the status line (protocol §5) | no |
| G11 passes | `ideas.mjs sync`; `learn.mjs push` after an established lesson is accepted | ranks ideas |
| A brief names a signal | `/sdlc-learn` distils it; `dev-gate-reviewer` accepts or rejects each lesson | approves through the judge |
| An initiative ships (G10 `PASS`, or a deploy outside G10) | the retro: the owner reviews the run in their own words and `/sdlc-learn --from` distils it, `harvest` adding the process signals; its scorecard (rounds per gate, overrides, days to the first `staging` and `production` deploy) goes to the bundle through `/sdlc-feedback` | writes the review |

`brief` prints only what is new since it last spoke: signals not yet a lesson, lessons written or
retired, ideas not yet ranked, provisional lessons newly stale. It records what it said in
`<root>/logs/learn-brief.json` (ignored by git), so a signal is announced once and again only when new
evidence joins it. Nothing new prints nothing. It never writes a lesson, never fails a session or a
stage, and `--peek` prints without recording.

### 19.6 The ladder: lesson, then check, then retirement

A finding written after an active lesson, at a gate the lesson applies to, that says what the lesson
says, is a **repeat error**: the lesson was recalled and the mistake happened anyway. `harvest`
proposes `promote to check` after two repeats: a lint rule, a hook or a CI script through
`/sdlc-improve`, never another checklist row, because prose has failed twice. A lesson that matched
nothing in five initiatives reviewed at its gates is proposed for `retire`. A human makes both
changes. `bench.mjs` counts repeat errors, and `compare` fails a version that has more.

---

## 20. The idea backlog — from one release to the next (`ideas.md`)

G11 is the only gate that measures against reality, and §17 and §19 carry what it finds back into the
*process*. This section carries it into the *product*: what a release taught about what to build
next. Without it the loop inside a project ends in a report nobody reopens.

### 20.1 `## Next` in post-release

Every `post-release.md` ends its findings with `## Next`, one row per thing worth carrying forward:

| Kind | Goes to | Read by |
|---|---|---|
| `idea` | `<root>/ideas.md` as `IDEA-NNN`, through `ideas.mjs sync` | `/sdlc-intake`, which offers the top ideas before a blank intake |
| `lesson` | `/sdlc-learn` (§19) | the next stage's preflight |
| `check` | `/sdlc-improve` (§17) | the gate whose checklist gains the row |
| `none` | nothing; the row says why nothing is worth carrying | the G11 reviewer |

G11 checklist row 21 judges whether the rows match what the report found. An empty table is `warn`
W095.

### 20.2 `ideas.md`

One backlog per repository, a `## Ideas` table with the columns
`Id · Idea · Evidence · Class · Value · Effort · Confidence · Ranked by · Status`.

| Rule | Why |
|---|---|
| `ideas.mjs sync` appends; it never edits or renumbers a row, and never adds the same idea from the same report twice | An idea's id is cited by the problem that takes it up; a renumbered backlog breaks that link |
| Every row cites evidence that exists: the post-release that raised it, or `human: <who> — <what>` | An idea with no evidence is a wish, and a backlog of wishes is ranked by whoever shouts |
| **Only a human ranks.** Value, Effort and Confidence are `high` · `medium` · `low`, and a row with any of them, or with status `ranked`, names who ranked it | The same rule as `status: assumed` on a DEC (§15.2): a priority an agent chose for itself is a guess with a format |
| Status is `new` · `ranked` · `taken: <slug>` (the slug has a `problem.md`) · `dropped: <reason>` | A taken idea must lead somewhere; a dropped one must say why, so it is not raised again next release |
| `ideas.mjs check` exits 1 on any breach; `lint-dev` skips `ideas.md` | The backlog is not a stage artifact and no gate hashes it, so ranking an idea stales nothing |

---

## 21. Unverified claims — honesty about facts

The decision ledger (§15.2) covers questions only a human can answer. This section covers the other
kind of gap: a **fact** about this system or its users that the author believes but cannot cite. An
author that states such a fact as known produces a design that is confidently wrong in exactly the
way a reviewer is least likely to catch, because it reads like knowledge.

| Rule | Why |
|---|---|
| A claim the author cannot cite (a file, a knowledge card, a DEC, a gate log, a lesson, a measurement) is written `UNVERIFIED: <claim>` | The marker makes the gap visible. Without it, a guess and a fact look the same |
| A question only a human can answer is a `DEC-NNN` instead (§15.2), never an `UNVERIFIED` claim | A DEC has options and an owner. An unverified claim has neither |
| The reviewer treats an `UNVERIFIED` claim that a decision rests on as `MAJOR` until it is cited or becomes a DEC. One that nothing rests on is `INFO` | The marker is honest, not a pass. A design built on an uncited claim is rework waiting to happen |
| `lint-dev` warns `W096` with the count on any artifact that carries the marker. Gate logs are exempt | A draft should not ship with them unread. Whether one matters is the reviewer's call |
| One inside a `## Decision` / `## Decisions` section is `E037` | There a decision visibly rests on it. Elsewhere a script cannot tell, so it stays a warning |

An agent never deletes an `UNVERIFIED` marker to pass a review. It cites the claim or raises the DEC.

---

## 22. Verification you can count, and commands that never run unattended

§4.5 makes the reviewer independent; this section makes its value measurable, and puts the most
destructive commands beyond any agent's judgement.

### 22.1 Gate effectiveness

`node <root>/scripts/gate-effect.mjs` prints, per gate: **caught** (BLOCKER and MAJOR findings it
raised that a later attempt resolved) over **raised**, and **escaped** (rows of `## Escaped` in every
`post-release.md` that name it). A gate whose escapes reach its catches is asking the wrong
questions; one that has caught nothing in ten initiatives is a removal candidate (§17). The numbers
decide neither; they make the question impossible to skip. `post-release.md` lists every defect found
after release under `## Escaped` with the gate that should have caught it, or `none` (G11 row 22).

### 22.2 Hard denies

`settings.json` `deny` and the `PreToolUse` hook `hooks/bash-guard.mjs` refuse, whoever asks:

| Rule | Refuses |
|---|---|
| `force-push` | `git push` with `-f`, `--force`, `--force-with-lease` or a `+ref` |
| `rm-root` | a recursive forced delete of `/`, `~`, `.`, `*` or `$HOME` |
| `drop-database` | `DROP DATABASE` / `DROP SCHEMA` |
| `truncate` | `TRUNCATE` sent to a database client or in a quoted statement |
| `reset-hard-remote` | `git reset --hard origin/…` |
| `env-write` | a redirect or `tee` into `.env` or `.env.<name>` (`.env.example` is allowed) |
| `no-verify` | `git commit` / `git push` with `--no-verify` |

The settings list is the first fence (globs); the hook parses the command line, so `git push origin
main --force` and `rm -r -f .` are caught too. There is no override: a human who means it runs it
themselves.

### 22.3 The run audit

The same hook, on `PostToolUse`, appends each command of an `ask` class that ran (push, merge
request, migrate, apply, publish) to `<root>/logs/commands.jsonl`, with secrets redacted. It ran, so
a human approved it; the log is the record of what they approved. `gate-effect.mjs` prints the count
by class. `logs/` is git-ignored (§18.5): the record is local to the machine that ran the command.

---

## 23. Value you can see — did it earn its place

The ladder proves the work was done well. This section asks whether it was worth doing. Each check
lives in the template a stage already writes, and the gate that already reads that template judges
it, so value costs a line per stage, not a new stage.

| Where | What | Gate row |
|---|---|---|
| `problem.md` `## Success looks like` | an `initiative` ends with `Kill: <the result, by when, that means this is removed or reversed>`. error `E038` without it | G0 row 13 |
| `architecture.md` `## Quality attributes` | an `extensibility` row: the next two likely features, and how the design takes them without changing its core | G2 row 23 |
| `visual-design.md` `## Approval` | `Usability: <task> — <who> — <time> — <where they hesitated>`: one task a named person walked on the preview. The agent is not the measure | G5 row 31 |
| G8, UI work | `web-perf.mjs` against the `DEV-PROFILE §Defaults` budgets (LCP, JS, TBT, CLS), already G8 row 23 (§13.7); a public page adds `--audit seo,a11y`: title, description, canonical, lang, one h1, indexable; alt text, labels, accessible names, unique ids, heading order, each a check that fails | G8 row 23 |
| `post-release.md` `## Value and cost` | the kill criterion quoted and judged `met` / `not met` with the number; real usage; cloud cost per month against the G2 estimate; the initiative's token cost, or `none recorded`. A gap over 50 % needs a reason | G11 row 23 |

A kill criterion that is met is not a failure of the pipeline. It is the pipeline working: the
`## Next` row (§20) for it is a `dropped` idea or a removal task, and it costs less than a feature
nobody uses kept alive for a year.

---

## 24. Knowledge the bundle carries, and the five pillars

### 24.1 The pillars

Everything this bundle builds, and everything built with it, is held to five pillars. They are
asked of the **product** at intake, so every initiative states them before any design exists:

| Pillar | Asked of the product |
|---|---|
| Intelligence | what it must know or do well |
| Memory and learning | how it learns from its own use |
| Judgment and integrity | where it must be honest with its users |
| Verification and safety | what must never break, and how it is rolled back |
| Value and experience | who uses it and why they come back, with the `Kill:` line (§23) |

`problem.md` `## Pillars` holds one row each with a measure. It is an optional trailing section, so
problems written before it stay valid. An `initiative` without it, or with a pillar that has no
measure, is `warn` W098, and the G0 reviewer fails it (G0 row 14). A `change` may answer in one line
each, as may a `fast` slug, and a `fix`, `refactor` or `spike` may omit it (§15.1).

### 24.2 Where the knowledge lives

A topic is owned by one skill, and a gate can fail on it. Depth that only some initiatives need
lives in a reference file beside the skill, linked from it with "read this when", so it costs
nothing until it applies:

| Topic | Reference | Owning skill | Gate row |
|---|---|---|---|
| Product ideas, competitors, value hypotheses | `exploring-ideas.md` | `dev-framing-problem` | G0 rows 7, 13 |
| Features that call a model | `ai-features.md` | `dev-brainstorming-architecture` | G2 row 24, G8 row 26 |
| Personal data, retention, deletion, consent | `privacy.md` | `dev-modeling-data` | G3 row 27 |
| Strings, plurals, locale formats, RTL | `i18n.md` | `dev-specifying-ui` | G5 row 32 |
| Public pages: search and sharing | `seo.md` | `dev-specifying-ui` | G5 row 32 |
| Incidents and postmortems | `postmortem.md` | `dev-designing-observability` | G11 row 24 |
| Estimates calibrated on history | `dev-planning-implementation` § Estimates | `dev-planning-implementation` | G6 |

### 24.3 Master in every role

The bundle plays every role a project needs, and in each it must work at principal level: principles
with their reasons and exceptions, the trade-offs between the usual options, and the anti-patterns a
reviewer can spot. Each role pack is one principles file beside the skill that authors the artifact,
and reviewer rows that cite it. A pack is never a new stage or gate.

| Role | Principles file | Authoring skill | Reviewer rows |
|---|---|---|---|
| Product manager | `product-principles.md` | `dev-framing-problem` | G0 15–17 |
| Business analyst | `domain-modelling.md` | `dev-decomposing-requirements` | G1 19–20 |
| Solution architect | `architecture-principles.md` | `dev-brainstorming-architecture` | G2 25–29 |
| Security | `security-principles.md` | `dev-modeling-threats` | G2 30–33 |
| Data | `data-principles.md` | `dev-modeling-data` | G3 28–32 |
| UX | `ux-principles.md` | `dev-specifying-ui` | G5 33–34 |
| SRE | `sre-principles.md` | `dev-planning-deployment` | G10 24–27 |
| User research | `user-research.md` | `dev-framing-problem` | G0 19 |
| Prioritisation | `prioritisation.md` | `dev-planning-implementation` | G6 25 |
| Documentation for users | `user-docs.md` | `dev-packaging-release` | G9 21 |
| CI/CD pipeline | `ci-cd.md` | `dev-designing-cloud` | G10 29 |
| Incident response | `incident-response.md` | `dev-designing-observability` | G11 25 |
| Cost after release | `cost-after-release.md` | `dev-designing-observability` | G11 26 |

A pack counts only with its **exam** (`tests/exam/`): per role, one clean artifact and one variant per
row, each breaking that row alone, in an order that gives nothing away. An independent
`dev-gate-reviewer`, given the case and its reviewing skill and never the key, must fail every
seeded row and pass the clean case. A missed flaw or a false alarm fails the role. The exam is rerun
when a pack changes, so knowledge that regresses fails like code. The developer role per product
type is §25.

---

## 25. Beyond web — coverage tiers and packs

Every product type and every language gets the gates. What varies is how much the bundle knows
beyond them, and the bundle says how much instead of implying it knows everything.

Five packs have landed as `preview` (`lib/coverage.mjs` `PREVIEW_PACKS`): each is a blueprint under
`dev-resolving-code-placement/blueprints/` and a verify, release and operate reference under
`dev-packaging-release/`, judged by G9 rows 22–26, with an exam in `tests/exam/`.

| Product type | Blueprint | Reference | G9 row | Proving repository |
|---|---|---|---|---|
| `desktop` | `electron` | `desktop.md` | 22 | meeting-capture, screen-spider |
| `extension` | `vscode-extension` | `vscode-extension.md` | 23 | afx-router, editor/vscode-sdlc |
| `cli`, `library` | `cli` | `cli.md` | 24 | cli-afx |
| `ai` | `ai-app` | `ai-app.md` | 25 | rag-reference-guide |
| `mobile` | `react-native` | `mobile.md` | 26 | none yet |

A preview pack moves to `PACKS` (full) only by the proof in `docs/pack-template.md`.

| Tier | The project gets | Reported as |
|---|---|---|
| `full` | the gates, a language adapter every checker reads through, a writing skill, and a proven pack for its product type | `doctor.mjs` `[PASS] coverage` |
| `preview` | the gates and the pack; this language is not yet proven on this product type | `[WARN] coverage` |
| `generic` | the gates; code placement and conventions from the repository's own knowledge cards (§16); code checkers that need an adapter do not read this stack | `[WARN] coverage`, naming the stack |

`DEV-PROFILE §Stacks` `Product type` names what ships (`web` by default). A product type is
`preview` until its pack is proven (`docs/pack-template.md`: GK and one `change` through G9 on a real
repository, scored by `bench.mjs`). Until then G9–G11 say what release and operate mean for that type
(`lib/coverage.mjs` `PRODUCT_TYPES`) and do not follow the web defaults. A stack with no adapter is no
longer a `doctor.mjs` failure: the project runs at `generic`, and the warning says the checkers do not
read that stack.
