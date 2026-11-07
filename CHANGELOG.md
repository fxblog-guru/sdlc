# Changelog

All notable changes to the agentic-fx-dev bundle. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the version is the one in `VERSION`.
`DEV-CONTRACTS.md` is versioned with the bundle: a change that renumbers or removes a section is
a MAJOR bump, a new section or rule is MINOR, wording is PATCH. Upgrade steps are in
[UPGRADE.md](UPGRADE.md).

## [Unreleased]

### Added

- **Every deployable says which build it is (§13.4).** The deploy plan names, per deployable, a
  surface a test runner can read without credentials — a version endpoint or header, a web bundle's
  build tag, a client's build number, the applied migration, a flag-set digest — and the first smoke
  assertion is that what is live equals the commit just deployed. `qa-handoff.md` says how to read
  it, so QA pins every run to the shipped commit; a deployable with no such surface is a task in the
  release.

- **A value changed in a store is a deploy (§13.4).** It goes through the pipeline, or
  `env-doctor.mjs` checks the store's values in a CI job first, by name and format; the plan keeps
  the previous deployment promotable and names the host's way back. A Format in `keys.md` may carry a
  note on the exact shape (`email (bare address, no display name)`), and `email` now refuses a
  display name. G10 row 31.
- **Product mail from a domain the product owns (§13.4).** The sender address and its domain are
  decided at G0 with the host (G0 row 18), never a free mailbox. `secrets-and-environments.md` lists
  the DKIM, DMARC, SPF or return-path and verification records and asks for a real test to a Gmail
  and an Outlook inbox. `env-doctor.mjs` gains the `email-sender` kind and a sender check: a sender
  key (`*_SMTP_FROM`, `*_MAIL_FROM`, `*_EMAIL_FROM` or Format `email-sender`) fails on a
  free-mailbox domain or a domain with no `v=DMARC1` record, and warns on no `rua=` or no DKIM key
  (`--dkim-selector`); `--no-dns` skips the lookups. G10 row 32.

- **A DB or API change states its deploy plan at ship (§7, §13.4).** `pull-request.md`,
  `release-plan.md` and the fast track's `slices.md` gain `## Rollout and rollback`. It opens with
  plain `key: value` lines the QA bundle reads (`deploy_impact`, `db_change`, `data_change`,
  `rollback`, `backup`, `post_backup_writes`, `api_change`; `deploy_impact: none` for a basic
  change), then N-1 compatibility, lock risk, the snapshot per host, the API rollout order, the
  order of steps, the check after each, rollback per layer, who decides and what ran on staging.
  A migration that changes existing rows adds `### Data`: restore tried, baseline, dry run,
  batched order, verification after, cleanup, and what a restore loses. New
  `deploy-plan-check.mjs` reads the diff and fails a plan that is missing, `TBD` or contradicted
  (E180 to E184, W180), in CI as `sdlc:deploy-plan`. Reviewer rows G9 27, G10 33, fast slice F4.
  The skeleton's `ops/snapshot.sh` copies the database before a deploy migrates it.
- **Where it runs, carried into design (§18.7).** Builds on §13.4: `architecture.md` gains
  `## Deploy target` (`Host:`, `Shape:`, `Environments:`, `Pipeline:`, `Who deploys:`), Host and
  Shape citing decisions the owner answered; the repository shape (separate client and server,
  modular monolith, serverless) is the owner's decision, not a default. The first G6 task is the
  pipeline, started from the skeleton's deploying `.gitlab-ci.yml`. G8 runs on `staging` at the
  shipped SHA and code freezes at G8. New lint errors E041 to E043; reviewer rows G2 34, G8 27.
- **A go-live checklist for public web releases** (`dev-planning-deployment/go-live.md`, G10
  row 30): legal pages, sign-in provider branding and domains, search console, `ads.txt`, the
  first admin with a second factor, mail DNS, a restored backup, and `env-doctor.mjs`.
- **`env-doctor.mjs` checks the machine too.** With `--clock-url`, the host must resolve here;
  it warns on `core.autocrlf=true` and on a database URL through a transaction pooler, without
  printing it.
- **At most five `assumed` decisions past G2 (§15.2, E044).** The rest go to the owner while an
  answer can still change the design.
- **The bundle learns from its own process (§19).** `learn.mjs harvest` adds four signals from one
  initiative's gate logs: `costly gate`, `override`, `reaffirm cascade`, `out of order`.
  `promote --local --approved-by <who>` offers a project's `process` lessons to the bundle on a
  human's word. A shipped initiative ends with a retro: `/sdlc-learn --from` on the owner's review,
  and a scorecard row in `docs/benchmark.md`.
- **Two rounds per gate, then the human decides (§4.3, E045).** Rounds are counted per gate across
  runs since its last `PASS` or override, at every gate including G7, G8 and G9. After a second
  round that is not `PASS`, the command puts the open findings to the human as one decision: fix
  now, ship with known risks, or abandon the slug. A third round's log cites it as
  `round_decision`.
- **Attempt 2 reads the delta (§4.3, E046, E047).** A finding new at attempt 2 and outside the diff
  is class `follow-up`: severity kept, carried to a target gate, never holding the round unless it
  is a security or data-loss `BLOCKER`. An attempt 2 with only follow-ups open is a `PASS`.
- **Each gate's cost on the board (§8).** `state.json` stages carry `rounds` (used and cap),
  `first_log_at` and `tokens` (only what `size.mjs actual` recorded); `DASHBOARD.md` names a gate
  at the cap.
- **`web-api-ts` blueprint: client and server as separate deployables.** `apps/web` (UI only),
  `apps/api` (domain, database, jobs) and `packages/contract` (generated from the G4 OpenAPI file),
  two images. `layout-check.mjs` refuses a web import of the API, by path or package, or of a
  database driver, and an API import of React. It is the TypeScript answer to the `Shape:` decision.
- **The skeleton pipeline deploys.** `.gitlab-ci.yml` runs test → build → publish (the GitLab
  registry, tagged with the commit SHA) → deploy_staging (automatic on the default branch) →
  deploy_production (manual, the same SHA). New `ops/deploy.sh <env> <sha>` (ssh and docker compose
  by default, swappable) and `ops/compose.prod.yaml`; the walking-skeleton task starts from them.

## [1.11.0] — 2026-11-02

A product can ship in usable slices on a G1 spec, its host and keys are decided at G0, and two more change classes fit work that used to be filed as a fix.

### Added

- **Product packs: desktop, VS Code extension, CLI and library, AI application, mobile** (DEV-CONTRACTS
  §25). Each is a blueprint (`electron`, `vscode-extension`, `cli`, `ai-app`, `react-native`, checked
  by `layout-check.mjs`) and a verify, release and operate reference under `dev-packaging-release/`,
  judged by G9 rows 22–26. `doctor.mjs` now reports these types as `preview` rather than `generic`.
  A pack becomes `full` only after a real repository of its type passes G6–G9 on it.
- **Six lifecycle areas that had no owner** (DEV-CONTRACTS §24.3): user research (G0 19),
  prioritisation (G6 25), documentation for users (G9 21), CI/CD pipeline design (G10 29), incident
  response (G11 25) and cost after release (G11 26). Each is a principles file beside the skill that
  writes the artifact, with a reviewer row that fails on it.
- **Eleven more exams** in `tests/exam/`, one per new row.
- **A seventh change class, `fast`, and `/sdlc-fast` (§15.1).** For a product the requester wants
  usable now: G0 (host, environments and secret store included), G1 and, with UI, the approved look
  at G5 still run; G2, G3, G4, G6 and G11 are `SKIPPED` by class. `/sdlc-fast` writes
  `plan/<slug>/slices.md` in place of `tasks.md`: the requester's words and date, slice 1 as the
  deploying skeleton (pipeline, keys in the store, `env-doctor.mjs`), then one usable slice per
  row, each built, tested, started and smoked under its own G7 slice log. A slice touching sign-in,
  secrets, money, personal data, a destructive migration or a published API escalates G2, G3 or G4
  for that part only. G8, G9 and G10 run once over the branch; G10 deploys through the slice-1
  pipeline. Modelled on the Recall build, where six slices shipped overnight on a G1 spec and an
  approved prototype.
- **`fast-check.mjs`.** Checks a `fast` plan before each slice: the request is quoted and dated, the
  pipeline exists and runs env-doctor, `ops/config/keys.md` exists, slices are numbered in order,
  an escalated gate is not still `SKIPPED`, and assumed decisions are in the ledger; it warns on a
  slice whose words suggest a risk it does not escalate. G7 reviewer rows F1–F3. `size.mjs`,
  `lint-dev.mjs` (E009), `ideas.mjs` and the board's `ChangeClass` accept the class; template
  `slices.md`.
- **Where it runs and where its keys live are decided at G0, and built in the first slice (§13.4).**
  For an `initiative`, G0 asks for the production host, the environments (`local`, `staging`,
  `production` at least, one subdomain each), who deploys, and the secret store, and records every
  gap as a `DEC-NNN` that blocks G2. G6 plans two first-slice tasks: a pipeline that builds the
  image and deploys it to `staging` on the real host, and every key in the store. A key's value
  lives only in the store (CI variables scoped per environment, or SOPS-encrypted files); the
  repository holds `ops/config/keys.md`, the list of names, and the deploy job writes the env file
  from the store and deletes it after. Reviewer rows: G0 18, G6 24, G10 28.
- **`env-doctor.mjs`.** Checks `ops/config/keys.md` before a deploy: every key the environment needs
  is set, non-empty, in its format and free of a carriage return, the database answers and the clock
  is within 30 s; or, with `--store gitlab`, that each key is in the project's CI variables for that
  environment and production ones are protected. It never prints a value. `/sdlc-deploy` stops with
  `BLOCKED` on a finding, and `release-plan.md` has a `## Secrets and config` section.

- **Two more change classes: `refactor` and `spike` (§15.1).** A `refactor` runs the gates of a
  `fix` (G7 · G8 · G9), and its G7 also applies the behaviour-preserving checks of
  `/sdlc-refactor`: no test changed, the same tests pass by name, no public surface moved. A test
  that had to change makes it a `change`. A `spike` runs G0 and G2 only: G0 frames the question, its
  time box and the result that answers it, and G2 records the answer as an ADR backed by the
  experiment's evidence. The `spike/<slug>` branch is never merged, and building on the answer
  starts a new slug. Before this, a feasibility check or a refactor had to be filed as a `fix` or a
  `change`, and ran gates that only said "N/A" or "as before".
- `size.mjs`, `lint-dev.mjs` (E009), `ideas.mjs` and the board's `ChangeClass` type accept both
  classes. `/sdlc-intake --class refactor|spike` writes the skips, and `/sdlc-refactor` now starts
  from a `refactor` slug instead of writing its own skips.

### Changed

- **The host picks the secret store (§13.4, `secrets-and-environments.md`).** A key's value lives in
  up to three places. The host's runtime store is what the app reads: Cloudflare Worker secrets,
  AWS Secrets Manager or SSM, Google Secret Manager, Azure Key Vault, or the platform's secrets on
  Vercel or Fly. On a plain VM, that role falls to the CI store. The CI store holds only what the
  deploy job needs, through OIDC where the cloud supports it. The owner keeps a recovery copy in a
  password manager. A per-host table says how a deploy sets each store. `local` runs on development
  values only: a production value in a file on a developer machine fails G10 row 28. So do app keys
  in CI variables when the host has its own store, and a long-lived cloud key in CI where OIDC is
  available. Prompted by fx-blog: production keys sat in a laptop `.env` while it moved to
  Cloudflare Workers.
- **Shared lessons come only from what Recall shares with every project (§19.4).** A stage's
  `learn.mjs recall --shared` asks Recall for shared lessons only, so a project key no longer hands
  back the project's own pushed lessons as if another project had learned them. `push` sends each
  lesson's confidence. `promote` still groups the lessons several projects hold, and now prints the
  `recall share request <id>` that asks the Recall Owner to share each candidate; `--request` sends
  them. An older Recall without these options is asked once more without them, and the stage never
  waits on Recall.
- The SessionStart update line names the installer that set the project up: a project installed
  with the public `npx agentic-fx` is told `npx agentic-fx@latest update --bundle dev`, one
  installed with `afx` still `afx update --bundle dev`. The choice reads the notice's `source`
  (`npm:` prefix) and picks one of two fixed strings; the file's own command is still never used.

## [1.10.0] — 2026-10-26

The bundle sizes the work before it starts, spends fewer tokens per gate, and turns key judgment checks into lint errors.

### Added

- **Size before acting.** At intake, `size.mjs estimate` chooses the fewest gates the change class
  needs and lists each skipped gate with its reason. It also estimates tokens, cost and a spawn
  budget. Above the profile's `Token budget` the stage stops until a named person approves.
- **Cost held to the estimate.** `size.mjs check` runs in each stage's preflight and at G11. It fails
  when the recorded tokens exceed the estimate by more than 50 %, or the spawns exceed the budget,
  and no reason is recorded.
- **Token levers.** Reviewers start from a JSON brief (`review-brief.mjs`) that lists changed
  files, lint results and failed rows. Heavy gates keep the strongest model; light gates on a
  `change` or `fix` use a smaller one. No agent reads the full contract. `run-id.mjs --next
  REQ|AC|TASK` and `trace-upsert.mjs` hand out ids and update traceability without reading whole
  files. A reviewer now reads about 17 KB of contract instead of 204 KB.
- **The learning ladder.** When a finding repeats a lesson that was already recalled, it counts as
  a repeat error. After two repeats, harvest proposes turning the lesson into a lint rule, hook or
  CI script. After five initiatives without a match, it proposes retiring the lesson.
- **Benchmark fields** for cross-version comparison: `task_id`, `bundle`, `version`, `condition`,
  `repeat_errors`, `lessons_active`, and `tokens` and `duration_s` per stage (`null` when unknown).
  `bench.mjs compare` fails when repeat errors rise. `bench.mjs export` writes one record per
  initiative and gate in the format ai-eval's `compare_bench` reads.

### Changed

- **Errors, not warnings:** an initiative with no `Kill:` criterion (`E038`, was `W097`), a release
  plan whose `## Rollback` is empty (`E035`), and an `UNVERIFIED:` claim inside a `## Decision`
  section (`E037`). Other `UNVERIFIED:` claims remain warning `W096`, because a script cannot tell
  whether a decision depends on them.

### Fixed

- The VS Code add-on changelog now lists the 0.5.x releases its package already ships.
## [1.9.0] — 2026-10-26

The brand is asked before a screen is drawn and kept in slots, so a later brand is a file swap.

### Added

- **G5 asks about the brand and the admin look before drawing.** The answer (existing kit, make
  one now, or a placeholder with a decision listing what will change) is recorded in the visual
  design, and the gates fail a visual without it.
- **Brand slots.** Every brand use (mark, favicon set, share image, illustrations, email logo,
  colours) is a file under `brand/` or a `--brand-*` token, never drawn inline.
- **`dev-making-brands` and `brand.mjs`.** One `brand.json` produces a full brand kit in light and
  dark, held to WCAG 2.2 AA contrast; `concepts` offers four directions and `placeholder` writes
  neutral stand-ins.
- A mid-project brand change is a change request: one decision, only the affected screens redrawn.
- Lane notes feed lessons, security and speed are checked at every lane merge, `/sdlc-debug`
  starts from a failing reproduction, and a lane merge cleans up its own worktree.

### Changed

- G7 implementer spawns are cheaper, and file ownership is checked before they start.
- Six skill descriptions were shortened to keep the listing under its budget.

## [1.8.0] — 2026-10-23

The project learns from its own reviews, a security engineer joins, and the backend checkers read Next.js server code.

### Added

- `/sdlc-learn` and gated lessons that every stage recalls, shared across projects when a
  shared store is available.
- Role packs for product, analysis, architecture, data, security, SRE and UX, each with an exam.
- `/sdlc-security` and a `SEC-NNN` ledger backed by secret, dependency and static-analysis scanning.
- Unverified claims are marked, verification is counted per gate, and the value of each change is
  checked in the templates every stage already writes.
- `bench.mjs` scores a project and compares two bundle versions; estimates are checked against
  actual effort.
- Autonomy modes (`off`, `assisted`, `full`) with hard stops that every mode respects.
- `/sdlc-requirements --clarify`, logging templates with an OpenTelemetry collector, and a
  run log for every checker.

### Changed

- Implementers write the test first and see it fail. Each implementer handles at most five tasks,
  and the profile is read by section, not in full.

### Fixed

- Parallel reviewers no longer share a finding id, and the backend checkers now read TypeScript
  and Python server code.

## [1.7.0] — 2026-10-17

Cloud architecture is decided at design time and held to at deployment.

### Added

- `topology.yaml` and `topology.mjs`: provider rules, drift against infrastructure code, and a
  rendered diagram, for AWS, Azure, Google Cloud, Alibaba Cloud and OCI.
- The `dev-designing-cloud` skill, a `DEV-PROFILE §Cloud` section, and new G2 and G10 checklist rows.

## [1.6.3] — 2026-10-17

### Fixed

- Reaffirm now finds a file's reviewed version after the process folder was moved.

## [1.6.2] — 2026-10-17

### Fixed

- `skeleton-check` finds `go.mod` in a full-stack layout's backend folder.

## [1.6.1] — 2026-10-16

### Fixed

- The QA root is located in the same order the QA bundle uses, and `pr-scan` treats `.stlc/` as
  the QA side.

## [1.6.0] — 2026-10-16

The process folder moves out of the product's way, and the repository layout is chosen to fit the project.

### Added

- A configurable process root, `.sdlc/` by default (`dev/` still accepted), with
  `migrate-root.mjs` to move an existing project.
- Repository model and architecture choices, blueprints (default `fullstack-go-react`) and
  `layout-check` rules for them.
- Mermaid diagrams for every stage, a language registry, `/sdlc-review-pr`, and an update notice
  at session start.

### Changed

- `DEV-PROFILE` `Dev root` is now `SDLC root`. See [UPGRADE.md](UPGRADE.md).

## [1.5.0] — 2026-10-14

API and UI design are scored at their gates, and an existing project can record its current debt as a baseline.

### Added

- API contract and UI readiness checklists, each with a checker and a score that decides the verdict.
- Baselines, so a late adopter fails only on new debt.

## [1.4.0] — 2026-10-14

Consistency is checked: a component kit that is actually used, one error shape, and limits that match the contract.

### Added

- Kit, class and copy checkers; problem-type, limits and observability checks against the contract.
- VS Code add-on 0.2.0. See [UPGRADE.md](UPGRADE.md) for steps from 1.3.0.

## [1.3.0] — 2026-10-13

Gates are faster, and visual design is a real step.

### Added

- Row-scoped decision staleness, batched reaffirms, a generated G7 change summary, and a rendered
  UI rubric.
- Finding classes (`defect`, `drift`, `bookkeeping`), so drift no longer blocks a gate.

## [1.2.2] — 2026-10-11

### Fixed

- Narrow screenshots no longer come out blank.

## [1.2.0] — 2026-10-08

An approved visual design is a recorded, binding input.

### Added

- `visual_reference` on a UI spec, checked by hash, and `ui-snap.mjs` to compare screens with it.

## [1.1.0] — 2026-10-04

Fixes from the first large run. Every new rule is additive.

### Added

- Cross-file traceability checks, `DEFERRED` findings, `progress.md` for execution status, scoped
  staleness, bounded self-edit reaffirm, slice mode, and ADR amendments.
- A rule-code table in the contract, kept in sync with the linter by a test.

## [1.0.0] — 2026-10-04

First release.

### Added

- Twelve gated stages (G0–G11) plus a knowledge track, each with an author and an independent
  reviewer that receives file paths only.
- Change classes, a decision ledger for questions only a person can answer, and a standards
  registry.
- A derived `state.json`, a contract linter, a VS Code board, and a QA handoff at G9.
