# agentic-fx-dev

[![pipeline](https://gitlab.com/agentic-fx/sdlc/badges/main/pipeline.svg)](https://gitlab.com/agentic-fx/sdlc/-/pipelines) · **v1.11.0** ([changelog](CHANGELOG.md) · [upgrading](UPGRADE.md)) · MIT · runs in **Claude Code**

A **development-only** agentic SDLC workflow for Claude Code. One pipeline takes an idea from a raw
problem statement to code running in production with telemetry on it — across **twelve gated
stages**, every project-specific value read from a single config file, and **a review gate with its
own written log between every stage**. Nothing advances on silence.

It does development, not testing. Unit and integration tests are written here because they ship in
the same commit as the code they prove. Test cases, e2e, performance, security, accessibility and
mobile belong to the sibling bundle [agentic-fx-qa](https://gitlab.com/agentic-fx/stlc), which this
bundle hands off to and never writes into. The two meet at one file and one command: G9 writes
`<root>/release/<slug>/qa-handoff.md`, and QA begins with `/qa-analyze <slug> <root>/release/<slug>/qa-handoff.md`. The verdict comes back the
same way: G10 will not deploy until the latest `<qa-root>/reports/<slug>/*-report.md` is dated after the shipped commit's G8 run and passes every gate (or
a named human waives it in writing), and G11 reads QA's escaped defects into the improvement loop.

```
problem ──/sdlc-intake───────▶ G0  problem framed, not solved            ─┐
        ──/sdlc-requirements─▶ G1  PRD · REQ-NNN · acceptance criteria    │  each arrow
        ──/sdlc-design───────▶ G2  architecture · ADR · threat model      │  is a GATE:
        ──/sdlc-data─────────▶ G3  data model · migration plan            │  a review skill
        ──/sdlc-api──────────▶ G4  API contract · breaking-change diff    │  judges the
        ──/sdlc-ui───────────▶ G5  UI spec · states · tokens · a11y       │  artifact,
        ──/sdlc-plan─────────▶ G6  TASK-NNN · order · estimate            │  writes a log,
        ──/sdlc-implement────▶ G7  code + unit + integration tests        │  and the next
        ──/sdlc-verify───────▶ G8  build · lint · types · coverage · scan │  stage refuses
        ──/sdlc-release──────▶ G9  branch · commits · PR · QA handoff     │  to run without
        ──/sdlc-deploy───────▶ G10 rollout · migration order · rollback   │  a PASS
        ──/sdlc-monitor──────▶ G11 SLO · dashboards · alerts · runbook   ─┘
  support:  /sdlc-status  /sdlc-gate  /sdlc-ask  /sdlc-onboard  /sdlc-design-system  /sdlc-doctor
            /sdlc-learn  /sdlc-improve  /sdlc-debug  /sdlc-refactor  /sdlc-fast  /sdlc-review-pr  /sdlc-security  /sdlc-feedback  /sdlc-help
```

## The two ideas that make this different

**1. A gate between every stage, with a log you can audit.** Each stage has an *authoring* skill
and a separate *review* skill. The reviewer never edits the artifact — it judges it against a
published checklist and writes `<root>/reviews/<slug>/G<N>-<stage>-<run-id>.md` with a verdict
(`PASS` · `CHANGES_REQUESTED` · `BLOCKED`), the evidence for every check, and findings with
severities. The next command reads that log. No log, or no `PASS`, and it stops.

The log records the artifact's SHA-256, so editing an approved document silently is not possible:
the gate goes `STALE` and the stage re-runs. A human can override, in writing, with a name and a
reason. An agent may never override its own gate.

**2. "Standard" is a written rule, not taste.** `DEV-CONTRACTS.md §13` is a standards registry: every
list endpoint is paginated (cursor by default, with the response envelope and the tiebreaker rule
spelled out), errors are RFC 9457, every screen declares its loading/empty/error/permission states,
logs are structured JSON with a trace id, every user-visible NFR becomes an `SLO-NNN` with an alert
that links to a runbook entry, every release names its rollback command and time budget. Each rule
has one owning skill and one gate that can fail you on it.

## What's inside

| Part | Count | Purpose |
|---|---|---|
| `DEV-PROFILE.md` | 1 | **The single config file** — stacks, data stores, API style, environments, quality gates, testing ownership, delivery, gate policy |
| `DEV-CONTRACTS.md` | 1 | **The single source of truth** — ids, artifact paths, template rules, the gate ladder, gate log format, traceability, migration contract, `state.json` schema, the dev / QA boundary, and the standards registry |
| `agents/` | 15 | `dev-orchestrator` (entry point, delegates only) · `dev-gate-reviewer` (every gate) · `dev-codebase-cartographer` (GK) · `dev-security-engineer` (`/sdlc-security`) · and one author per stage: requirements, solution, data, api, ui, delivery-planner, implementer, verifier, release-engineer |
| `commands/` | 27 | 12 pipeline stages + `/sdlc-onboard` `/sdlc-design-system` `/sdlc-ask` `/sdlc-gate` `/sdlc-status` `/sdlc-doctor` `/sdlc-learn` `/sdlc-improve` `/sdlc-debug` `/sdlc-refactor` `/sdlc-fast` `/sdlc-review-pr` `/sdlc-security` `/sdlc-feedback` `/sdlc-help` |
| `skills/` | 46 | `dev-stage-protocol` (the protocol every stage command shares, loaded once per session) + 13 gate reviewers + stack authoring skills (Go, Python, React, Next.js, migrations) + lifecycle skills + `dev-defining-design-system` (7 presets, shadcn/tweakcn import, 10 page patterns) + `dev-hunting-vulnerabilities` (white-box audit: OWASP web/API, per-language sinks, OWASP LLM, DevSecOps pipeline) + `dev-designing-cloud` (provider and runtime at G2, topology drawn to the provider's own standard with official icons, IaC drift at G10) + `dev-making-brands` (a brand kit from one brand.json: directions to pick, every slot asset, AA contrast), several adapted from the shared library and recorded in `docs/skill-sources.md` |
| `workspace/dev/_templates/` | 27 + 6 | Strict templates: fixed headings, required front matter, one hint line per section — plus the six GK knowledge cards |
| `workspace/dev/scripts/` | 6 | `lint-dev.mjs` (the contract linter) · `contracts.mjs` (prints only the cited sections of the contract) · `build-state.mjs` (regenerates `state.json` + `DASHBOARD.md`) · `status.mjs` (the board) · `doctor.mjs` (environment preflight) · `design-system.mjs` (renders tokens, checks contrast, imports shadcn themes, scans for hard-coded values) |
| `workspace/dev/ci/` | 2 | GitLab · GitHub pipeline templates that run the same gates CI-side |

## The design system — decided once, not per screen

Most "the UI looks wrong" comes down to the look never having been decided. Each screen improvises
its own colours, spacing and layout, and the product ends up looking like it was built by twelve
people. `/sdlc-design-system` makes that decision once per repository, before the first `/sdlc-ui`:

| Preset | For | Shell · density |
|---|---|---|
| `clean-saas` | modern B2B tools, and the default when nobody has a view | sidebar · comfortable |
| `dense-enterprise` | ops, dispatch, finance: people who live in tables | topbar + sidebar · compact |
| `friendly-consumer` | self-serve, booking, portals, untrained users | top nav · spacious |
| `field-mobile` | technicians and drivers: phone, outdoors, one hand | bottom tabs · touch |
| `editorial` | docs, marketing, long reading | top nav · spacious |
| `primer-product` | developer tools; GitHub Primer's values (MIT) | topbar + sidebar · comfortable |
| `carbon-enterprise` | regulated enterprise; IBM Carbon's values (Apache-2.0) | topbar + sidebar · comfortable |

A named human picks one, or imports any shadcn/ui or tweakcn theme (`--from-shadcn theme.css`),
tokens from Figma (`--from-figma`) or the existing theme (`--from-code`). `design-system.mjs` renders `docs/design-tokens.{json,md}` and `tokens.css`, and
checks all 15 WCAG contrast pairs in light and dark. It also copies `docs/ui-patterns.md`: four
shells and ten page patterns (`list`, `detail`, `form`, `wizard`, `dashboard`, `settings`,
`master-detail`, `board`, `auth`, `first-run`), each with its anatomy, seven default states and
responsive rules. At G5 every screen names its pattern and writes only its deviations. At G7
`design-system.mjs scan` catches hard-coded hex and px, and the reviewer compares each screen with
its pattern.

## Supported stacks

Declared in `DEV-PROFILE.md §Stacks`; a stage that meets a disabled stack stops and asks rather
than improvising a convention.

| Stack | Authoring skill | Unit tests | Notes |
|---|---|---|---|
| **Go** | `dev-writing-go-code` | `go test` + testify | Clean layering, context threading, error wrapping, no N+1, `golangci-lint` |
| **Python** | `dev-writing-python-code` | `pytest` | Clean Architecture, `uv` · `ruff` · `mypy --strict` |
| **React** | `dev-writing-react-code` | Vitest + Testing Library | Design tokens only, every state declared, WCAG 2.2 AA |
| **Next.js** | `dev-writing-nextjs-code` | Vitest + Playwright CT | Server/client boundary justified, caching stated, no fetch waterfalls |
| **PostgreSQL** | `dev-modeling-data` + `dev-writing-migrations` | integration tier | `CONCURRENTLY`, transactional DDL, partial/expression indexes, `EXPLAIN` in the data model |
| **MySQL** | `dev-modeling-data` + `dev-writing-migrations` | integration tier | InnoDB, `utf8mb4`, online DDL algorithms, no implicit-conversion index misses |

## Install

Through the shared installer, alongside the QA and eval bundles — nothing collides, because no
command, agent or skill name is shared and the config files are named apart:

```bash
pip install git+https://gitlab.com/agentic-fx/cli-afx.git
cd your-project
afx install --bundle dev        # .claude/{agents,commands,skills,hooks} + DEV-PROFILE + DEV-CONTRACTS + <root>/ workspace
afx install --bundle all        # dev + qa + eval together
afx doctor  --bundle dev        # required files · node 20+ · hooks wired · then <root>/scripts/doctor.mjs verbatim
```

Then fill in `DEV-PROFILE.md` — the stages stop with a `> **Project setup required:**` callout
rather than guessing at anything you left as a placeholder. For a first run, four sections are
enough: `§Project` (name, maturity), one row of `§Stacks`, `§Quality gates`, and `§Delivery`.
Then `/sdlc-doctor`, and `/sdlc-onboard` if the repository already has code.

## Staying up to date

`afx update --bundle dev` refreshes the bundle-owned files and leaves your profile, settings and
artifacts alone. When `afx` has found a newer version, the session opens with one line saying so
(installed, latest, patch/minor/major, the changelog link), and the VS Code board's version pill
turns amber. Neither goes to the network: both read `.claude/.agentic-fx-updates.json`, which `afx`
writes. `AFX_NO_UPDATE_CHECK=1` silences them. Before a MAJOR, read [UPGRADE.md](UPGRADE.md): it
has the steps for every version that needs them.

## Rolling it out: who uses what, and what it costs

Adoption is measured, not guessed. The bundle ships two hooks that talk to
[Recall](https://gitlab.com/agentic-fx/recall) — the team memory service — and both **exit
silently on machines where `recall` or `RECALL_URL` is absent**, so nothing breaks for a laptop
that has not opted in:

- `SessionStart: recall context` prints the team's current knowledge briefing into the session.
- `SessionEnd: recall session end` records the session **and its token usage per command and
  per skill**, computed locally from the transcript. Tokens spent outside any skill are counted
  too, as `(none)` — that number is the work the rollout has not reached yet.

Recall's **Usage tab** (and `recall usage` in the terminal) then answers the rollout questions
with numbers: tokens by skill, by user, by project, by model, by day; sessions and distinct
users per row. For the *why* behind the numbers, `/sdlc-feedback` files friction with the
bundle itself — a too-strict gate, a skill that guessed wrong — into Recall's reviewed
`feedback` queue, where the maintainer reads it.

To enable on a machine: install the `recall` CLI and set `RECALL_URL` (plus `RECALL_API_KEY`
and optionally `RECALL_PROJECT`) in the environment. Nothing else changes.

## A session, end to end

```bash
/sdlc-intake job-assignment       # → <root>/intake/job-assignment/problem.md    → G0 review
/sdlc-requirements job-assignment # → prd · requirements · acceptance-criteria → G1 review
/sdlc-design job-assignment       # → architecture · ADR-004 · threat-model    → G2 review
/sdlc-data job-assignment         # → data-model · migration-plan (MIG-*)      → G3 review
/sdlc-api job-assignment          # → openapi.yaml · contract-diff             → G4 review
/sdlc-ui job-assignment           # → ui-spec (states, tokens, a11y)           → G5 review
/sdlc-plan job-assignment         # → tasks.md (TASK-001…TASK-012)             → G6 review
/sdlc-implement job-assignment    # → code + unit + integration tests          → G7 review
/sdlc-verify job-assignment       # → runs/<run-id>/ evidence                  → G8 review
/sdlc-release job-assignment         # → branch · commits · PR · qa-handoff.md    → G9 review
/sdlc-deploy job-assignment       # → release-plan · canary · rollback         → G10 review
/sdlc-monitor job-assignment      # → SLO · dashboards · alerts · runbook      → G11 review
/sdlc-status                      # the gate board for every initiative
```

`/sdlc-status` reads `<root>/state.json` — a **derived read model**, regenerated after every command
and on the `Stop` hook. The gate logs and the artifacts remain the source of truth; the index exists
so that nothing outside this bundle has to parse markdown, and it carries a `source_hash` so a stale
or hand-edited copy is detectable rather than believed. Its schema is frozen in `DEV-CONTRACTS.md §8`.

## Where it stops

This bundle will not fake a gate. A review that cannot find its evidence returns `BLOCKED`, not a
generous `PASS`. It will not invent a tracker key, a requirement, or a metric name. It will not
write a secret into an artifact or a commit. It will not absorb a discovery that invalidates an
earlier decision — that goes back to the stage that owns it and re-opens the gate. And it will not
write production code outside an approved TASK at G7.

Those are not politeness rules; they are the only thing that makes a green board mean something.

## Built to be cheap to run

Every file an agent loads is paid for on every spawn, so the bundle is sized for that and the
size is tested (`tests/bundle.test.mjs`, budgets at the top of the file).

| Surface | Size | How it stays small |
|---|---|---|
| always-on listing (all skill + agent descriptions) | ~7,100 chars | one trigger line each; commands are `disable-model-invocation`, so the `/` menu does not cost context |
| a stage command | 270–700 words | deltas only; the shared protocol is `dev-stage-protocol`, loaded once and resident |
| the contract, per agent | ~1,000 of 9,000 words | `node <root>/scripts/contracts.mjs 4.5 5 10` prints only the sections an agent is told to read |
| the reviewer, per spawn | one checklist | it invokes the reviewing skill the command names; nothing is preloaded |
| the author → reviewer handoff | paths only | nothing from the author's context reaches the reviewer's (§4.5) |

## Why you can trust it

- **The gate cannot be faked.** `PASS` needs evidence per checklist row, the log hashes what it
  judged, the reviewer never sees the author's reasoning, and an agent cannot override a gate.
- **The bundle lints itself.** Names, sizes, every `dev-*` reference, every `§` citation, every
  stage's wiring — `node --test tests/*.test.mjs` fails on any of them, and CI runs it on every change.
- **Versioned, with a changelog.** `VERSION` + [CHANGELOG.md](CHANGELOG.md); the contract's section
  numbers are part of the public surface and follow the same rules.
- **Named by one convention.** `sdlc-*` commands, `dev-*` agents and skills, `dev-reviewing-<stage>`
  for every reviewer, `dev-<verb-ing>-<object>` for every author, permanent ids that are never
  reused. The convention is written down in [CONTRIBUTING.md](CONTRIBUTING.md) and enforced.
- **Honest scope.** Claude Code only, today. No network calls of its own; usage telemetry is
  opt-in through Recall and silent where it is not installed ([SECURITY.md](SECURITY.md)). How it compares with the other frameworks, and what was borrowed:
  [docs/benchmark.md](docs/benchmark.md).

## Documentation

- [`DEV-CONTRACTS.md`](DEV-CONTRACTS.md) — read this before changing anything in the bundle
- [`DEV-PROFILE.md`](DEV-PROFILE.md) — read this before your first run
- [`docs/user-guide.md`](docs/user-guide.md) — a real session end to end, every stop and what to do
- [`docs/flows.md`](docs/flows.md) — seven diagrams, from the whole ladder down to a single hash
- [`docs/showcase/pipeline.html`](docs/showcase/pipeline.html) — one change through all thirteen gates, animated, with each
  stage's artifact format and a present mode for a room. Open it in a browser; it works offline
- [`docs/skill-sources.md`](docs/skill-sources.md) — which skills are vendored, from where, at which commit
- [`editor/vscode-sdlc/`](editor/vscode-sdlc) — the read-only VS Code board
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — naming, size budgets, where a change goes, how to release
- [`docs/benchmark.md`](docs/benchmark.md) — against aidlc-workflows, Spec Kit, OpenSpec, Superpowers, BMAD
