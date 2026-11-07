# agentic-fx-dev — design plan (for approval before build)

> **Superseded — kept as a record, not as instructions.** This is the plan as it stood on
> 2026-09-18, before the bundle was built. Several names in it were changed during the build
> (`dev-frontend-engineer`, `dev-tech-lead`, `dev-designing-postgres-schema` and others never
> became files). `DEV-CONTRACTS.md` §4 is the live list; where the two disagree, §4 wins. This
> file is worth keeping because it says *why* each decision was taken, which §4 does not.

**Status:** revision 2 — architecture approved, all 7 decisions accepted · **Date:** 2026-09-18 ·
**Scope:** everything after Phase 1 (`DEV-CONTRACTS.md`, `DEV-PROFILE.md`, `README.md`,
`settings.json`, 23 templates are already written).

### What changed in revision 2

Two independent reviews accepted the architecture and all seven decisions. Five adjustments were
folded into `DEV-CONTRACTS.md` before any of Phase 2 gets built, plus three implementation details that
would otherwise have bitten during Phase 2:

| # | Adjustment | Where it landed |
|---|---|---|
| 1 | `state.json` is a **derived read model**, not the source of truth. Gate logs and artifacts are authoritative; the index carries `generator_version` + `source_hash` so a stale or hand-edited index is detectable rather than silently believed. | §8 |
| 2 | A gate hashes **all of its outputs and its inputs**, not one artifact. An upstream change makes a downstream gate `STALE` transitively — the dependency graph is now deterministic. | §5.1, §4.4 |
| 3 | `CHANGES_REQUESTED` is a **closed loop**: structured findings → author resolution map → reviewer verifies each finding by id → `RESOLVED`/`ACCEPTED`/`REOPENED`. A blanket "all addressed" no longer passes. | §4.3, §5.3 |
| 4 | `SKIPPED` is a **first-class verdict** with a typed reason (`NOT_APPLICABLE` · `DEFERRED` · `HUMAN_OVERRIDE`), declarable only by the reviewer or a named human — never by the author. `STALE` is defined by the state machine rather than by prose. | §4.1, §5.4 |
| 5 | The linter enforces **syntax and contract only**; semantic quality belongs to the reviewer. `error` blocks, `warn` is advisory, and the linter is explicitly forbidden from grading. | §11 |
| 6 *(added)* | **Hashes cover the artifact body only** — front matter is excluded, because `updated:` changes on every touch and `status:` is written by the review itself. Without this, every gate would go stale the instant it passed. | §5.2 |
| 7 *(added)* | **`--reaffirm` damps cascading staleness.** A typo fix upstream should not force a full re-review of G2–G11; the reviewer is given only the input diff and answers whether its prior verdict still holds. It may not reaffirm a diff it did not read. | §4.4 |
| 8 *(added)* | **Context isolation is an implementation rule.** The command passes the reviewer *paths only* — never pasted content, never the author subagent's summary. In Claude Code this is easy to violate by accident, and violating it quietly removes the independence the whole design rests on. | §4.5 |

Also adopted: `run-id` = `YYYYMMDD-HHMMSS-<4hex>` shared across the whole stage execution, one
folder per stage under `<root>/`, a `/sdlc-doctor` command, and a tracker **adapter** interface
(§14) so the pipeline is never welded to one tracker.

This document describes **how the bundle actually executes inside Claude Code** and **what will be
built**. Read the runtime flow first — every later decision follows from it.

---

## 1. How a stage runs in Claude Code

Claude Code gives us five primitives. The design uses each for exactly one job:

| Primitive | Used for | Why this one |
|---|---|---|
| **Slash command** (`.claude/commands/sdlc-*.md`) | the stage's control flow: preflight → author → review → resolve | A command file is a prompt injected into the main conversation — the right place for orchestration, because it can see the whole session. |
| **Subagent** (`Agent` tool) | authoring, and separately reviewing | A subagent has a **fresh context**. That is the entire mechanism that makes review real: a reviewer that watched the author reason inherits the author's blind spots. |
| **Skill** (`Skill` tool) | the domain rules: how to write a data model, how to review an API contract | Skills load on demand, keep the rules in one place, and version with the bundle. |
| **Hooks** (`settings.json`) | deterministic enforcement — lint on write, rebuild state on stop | Anything a script can check should never depend on the model remembering to check it. |
| **Permissions** (`settings.json`) | read-only tooling auto-allowed; `migrate up`, `git push`, `kubectl apply` always ask | The pipeline can gather evidence freely and cannot change the world by accident. |

### 1.1 The flow for one stage

Taking `/sdlc-design job-assignment` (G2) as the worked example — every stage is the same shape:

```
USER
 │  /sdlc-design job-assignment
 ▼
MAIN AGENT  ← .claude/commands/sdlc-design.md is injected
 │
 ├─① PREFLIGHT  (in the command file, no subagent)
 │    read DEV-PROFILE.md      → required sections filled?
 │    read <root>/state.json          → does slug exist?
 │    check G1 verdict == PASS     → and not STALE (artifact hash still matches)
 │    ✗ → STOP. Print exactly what is missing and the command that fixes it.
 │
 ├─② AUTHOR          Agent(dev-solution-architect)  ── fresh context ──┐
 │    given: slug · template path · G0/G1 artifacts · DEV-PROFILE  │
 │    invokes Skill: dev-brainstorming-architecture                    │
 │                   dev-detailing-design                              │
 │                   dev-modeling-threats                               │
 │    writes: <root>/design/<slug>/architecture.md  (from _templates/)    │
 │            <root>/design/adr/ADR-NNN-*.md                              │
 │            <root>/design/<slug>/threat-model.md                        │
 │    ⚡ hook PostToolUse(Write|Edit on <root>/**) → lint-dev.mjs --file   │
 │       headings, front matter, leftover <placeholders> → fixed now   │
 │    returns: paths written + open questions  ──────────────────────◄─┘
 │
 ├─③ REVIEW          Agent(dev-design-reviewer)  ── fresh context, DIFFERENT subagent ──┐
 │    given: ONLY paths — the artifacts, the upstream artifacts, the profile            │
 │    NOT given: the author's reasoning, transcript, self-assessment, or pasted content  │
 │    invokes Skill: dev-reviewing-design  (its published checklist)              │
 │    writes: <root>/reviews/<slug>/G2-design-<run-id>.md                                  │
 │            ├ every checklist row + EVIDENCE (quote · file:line · command output)     │
 │            ├ structured findings CR-NNN: location · problem · evidence · required    │
 │            ├ outputs[] — a hash per artifact produced (body only, front matter out)  │
 │            └ inputs[]  — a hash per upstream artifact the decision rests on          │
 │    may NOT edit the artifact. Findings only.  ─────────────────────────────────────◄─┘
 │
 ├─④ RESOLVE  (main agent reads the gate log verdict)
 │    PASS ................ regenerate state.json → report → name the next command
 │    SKIPPED ............. only if the REVIEWER declared it, with a typed reason
 │    CHANGES_REQUESTED ... ┌─ author gets the findings as STRUCTURED items, not prose
 │    │                     ├─ author returns a resolution map: fixed / accepted / disputed
 │    │                     ├─ reviewer verifies EACH finding by id → RESOLVED/ACCEPTED/REOPENED
 │    │                     └─ attempt 2 max; attempt 3 is not attempted — ask the human
 │    BLOCKED ............. STOP. Print who must act and what unblocks it.
 │
 └─⑤ ALWAYS  node <root>/scripts/build-state.mjs   → state.json + DASHBOARD.md
      ⚡ hook Stop → same script, so state can never be left stale by an interrupted run
```

**Why author and review are two subagents and not one agent doing both.** A single agent that
writes then reviews its own work produces a predictable artefact: a confident checklist where every
row passes. The separation is not ceremony — the reviewer is given the artifact and the upstream
inputs and nothing else, so it has to reconstruct whether the document stands on its own. That is
the same reason the gate log records `artifact_sha256`: the reviewer's verdict is about a specific
version of a specific file, and any later edit invalidates it automatically.

**Why the review cannot edit.** If the reviewer fixes what it finds, nobody ever sees the finding,
the author skill never improves, and the gate log becomes a formality. Findings go in the log; the
authoring stage fixes them; the next log records whether the fix worked.

### 1.2 Hooks — what is enforced by code, not by prompt

| Hook | Runs | Does |
|---|---|---|
| `PostToolUse` · matcher `Write\|Edit` | after any write under `<root>/**` | `lint-dev.mjs --file <path>`: front matter present, headings match the template byte-exact, no `<placeholder>` left, ids well-formed. Violations surface immediately, while the context to fix them is still loaded. |
| `Stop` | end of every turn | `build-state.mjs`: regenerate `<root>/state.json` + `DASHBOARD.md`. State is derived, so it can never drift. |
| `SessionStart` | new session | Print the gate board: which initiatives are at which gate, what is blocked, what is stale. Every session starts oriented instead of asking. |

### 1.3 What `/sdlc-status` and the editor read

Nothing outside this bundle parses the markdown. `<root>/state.json` (schema frozen in
`DEV-CONTRACTS.md §8`) is the only interface:

```
gate logs (markdown) ──▶ build-state.mjs ──▶ <root>/state.json ──┬──▶ /sdlc-status  (terminal)
                                                              ├──▶ DASHBOARD.md  (markdown board)
                                                              ├──▶ CI            (fail the pipeline on a red gate)
                                                              └──▶ VS Code extension (later — a viewer, zero rules)
```

---

## 2. What gets built

### 2.1 Commands — 19 files (`.claude/commands/sdlc-*.md`)

Each is the same five-step control flow above, with its own preflight conditions and its own
author/review subagent pair.

| Command | Gate | Preflight requires | Author agent | Review skill |
|---|---|---|---|---|
| `/sdlc-intake <slug>` | G0 | profile §Project | `dev-requirements-analyst` | `dev-reviewing-intake` |
| `/sdlc-requirements <slug>` | G1 | G0 PASS | `dev-requirements-analyst` | `dev-reviewing-requirements` |
| `/sdlc-design <slug>` | G2 | G1 PASS | `dev-solution-architect` | `dev-reviewing-design` |
| `/sdlc-data <slug>` | G3 | G2 PASS | `dev-data-architect` | `dev-reviewing-data` |
| `/sdlc-api <slug>` | G4 | G2 PASS | `dev-api-designer` | `dev-reviewing-api` |
| `/sdlc-ui <slug>` | G5 | G2 PASS | `dev-frontend-engineer` | `dev-reviewing-ui` |
| `/sdlc-plan <slug>` | G6 | G3·G4·G5 PASS or skipped | `dev-tech-lead` | `dev-reviewing-plan` |
| `/sdlc-implement <slug> [task]` | G7 | G6 PASS | `dev-backend-engineer` / `dev-frontend-engineer` | `dev-reviewing-implementation` |
| `/sdlc-verify <slug>` | G8 | G7 PASS | `dev-test-engineer` | `dev-reviewing-verification` |
| `/sdlc-release <slug>` | G9 | G8 PASS | `dev-release-engineer` | `dev-reviewing-release` |
| `/sdlc-deploy <slug> <env>` | G10 | G9 PASS | `dev-release-engineer` | `dev-reviewing-deployment` |
| `/sdlc-monitor <slug>` | G11 | G10 PASS | `dev-sre` | `dev-reviewing-monitoring` |
| `/sdlc-status [slug]` | — | — | none — reads `state.json` | — |
| `/sdlc-gate <slug> <G>` | — | — | re-runs one review without re-authoring | the matching reviewer |
| `/sdlc-onboard` | — | — | `dev-solution-architect` | — (writes `docs/codebase-map.md`) |
| `/sdlc-debug <symptom>` | — | — | `dev-backend-engineer` | — (outside the ladder, on purpose) |
| `/sdlc-refactor <target>` | — | — | `dev-backend-engineer` | `dev-reviewing-implementation` |
| `/sdlc-doctor` | — | — | none — a script, not a model | — |
| `/sdlc-help` | — | — | none | — |

`/sdlc-debug` sits outside the ladder deliberately: production is on fire is not the moment to
require a G1 gate log. It writes findings, and if the fix is non-trivial it tells you which stage to
re-enter.

`/sdlc-doctor` is a health check over the installation itself, and it is a **script** rather than a
model prompt — a diagnostic that can hallucinate is worse than none. It verifies the Claude Code
structure (commands, agents, skills, hooks, `settings.json`), the bundle files (templates, contracts,
scripts), the profile (required sections filled, enabled stacks ↔ available runners), the toolchain
(Node, Go, Python, the linters and DB clients the profile names), and the state (`state.json`
parses, matches its `source_hash`, no gate `STALE`). The same checks run in `afx doctor --bundle
dev`, so a team member with a broken install gets a list rather than a mystery:

```
Agentic SDLC Doctor
[PASS] Commands        19/19      [PASS] Templates      23/23
[PASS] Agents          11/11      [PASS] Hooks            3/3
[PASS] Skills          38/38      [PASS] DEV-CONTRACTS.md   schema 1
[PASS] DEV-PROFILE  filled    [WARN] tracker        none configured
[PASS] state.json       fresh     [FAIL] golangci-lint  not on PATH (stack `go` is enabled)
```

### 2.2 Skills — 38 files (`.claude/skills/dev-*/SKILL.md`)

**Every skill in this bundle is prefixed `dev-`.** It coexists with `agentic-fx-qa` in the same
`.claude/skills/` directory, and three names collide outright without a prefix
(`clarifying-requirements`, `grounding-in-code`, `analyzing-docs`). The prefix also makes bundle
ownership obvious in the installer manifest, which is what lets `uninstall --bundle dev` be safe.

| Group | Skills | Source |
|---|---|---|
| **Gate reviewers (12)** | `dev-reviewing-`{intake, requirements, architecture, data-model, api-contract, ui-design, plan, code, verification, release, deployment, observability} | **new** — each carries a published checklist, the evidence rules, and severity guidance |
| **Go (2)** | `dev-writing-go-code`, `dev-testing-go-code` | **new** — nothing in the shared library covers Go |
| **Data (4)** | `dev-designing-postgres-schema`, `dev-designing-mysql-schema`, `dev-writing-migrations`, `dev-writing-sql-code` | **new** — engine-specific rules (CONCURRENTLY vs online DDL, collation, lock behaviour) |
| **Web (2)** | `dev-writing-nextjs-code`, `dev-specifying-ui` | **new** — App Router boundaries, token discipline, the seven states |
| **Ops (3)** | `dev-designing-observability`, `dev-planning-deployment`, `dev-writing-runbook` | **new** |
| **Supporting (3)** | `dev-resolving-code-placement`, `dev-running-verification`, `dev-packaging-release` | **new** |
| **Vendored (12)** | `dev-framing-problem`, `dev-writing-prd`, `dev-decomposing-requirements`, `dev-brainstorming-architecture`, `dev-detailing-design`, `dev-modeling-threats`, `dev-designing-api`, `dev-modeling-data`, `dev-planning-implementation`, `dev-writing-python-code`, `dev-writing-react-code`, `dev-reviewing-code-base` | from `gitlab.com/agentic-fx/skills` @ `8556e8f`, adapted to this bundle's templates and gate log, origin recorded in `docs/skill-sources.md` |

Authoring follows the Anthropic `skill-creator` conventions: frontmatter `name` + a description
written to trigger (naming the contexts, not just the capability), SKILL.md under 500 lines, and
per-stack detail pushed into `references/` so only the relevant file loads.

### 2.3 Agents — 11 files (`.claude/agents/dev-*.md`)

`dev-orchestrator` · `dev-requirements-analyst` · `dev-solution-architect` · `dev-data-architect` ·
`dev-api-designer` · `dev-backend-engineer` · `dev-frontend-engineer` · `dev-test-engineer` ·
`dev-code-reviewer` · `dev-release-engineer` · `dev-sre`.

Reviewer agents are thin on purpose: their whole job is to load one reviewing skill with a clean
context and produce a gate log. Authoring agents carry the stack routing (read
`DEV-PROFILE §Stacks`, pick the matching writing skill).

### 2.4 Scripts — 2 files (`workspace/dev/scripts/`)

| Script | Job |
|---|---|
| `lint-dev.mjs` | The contract linter. Template headings byte-exact · front matter complete and valid · no leftover placeholders · id formats · gate log evidence cells non-empty · no self-approval (`authored_by` ≠ `reviewed_by`) · traceability orphans · artifact hash vs gate log (STALE detection). Runs on the PostToolUse hook, on `npm run dev:lint`, and in CI. |
| `build-state.mjs` | Reads the gate logs and artifacts, writes `state.json` + `DASHBOARD.md`. Pure derivation, idempotent, no side effects. |

### 2.5 CI + CLI + docs

- `workspace/dev/ci/{gitlab,github}.yml` — run `dev:lint` and the DEV-PROFILE quality gates
  server-side, so a red gate fails the pipeline rather than relying on anyone's local run.
- `cli-afx` gains a **third bundle entry** (`dev`) in `registry.py` plus `doctor` checks — roughly
  40 lines, versus a new Python package that would have to re-implement clone, backup, manifest and
  uninstall. Rollout becomes `afx install --bundle all`.
- `docs/user-guide.md` — one real session end to end, every stop and what to do about it.
- `docs/skill-sources.md` — what was vendored, from where, at which commit.

---

## 3. Build order

| Phase | Contents | Files |
|---|---|---|
| ~~1~~ | ~~CONTRACTS · DEV-PROFILE · README · settings · 23 templates~~ | **done — 27** |
| ~~**2 — foundation**~~ | ~~`lint-dev.mjs` · `build-state.mjs` · `status.mjs` · `doctor.mjs` · `/sdlc-status` `/sdlc-gate` `/sdlc-doctor` `/sdlc-help` · three hooks~~ | **done — 15 files, 38 tests green.** Linter: 15 rules, each with a broken fixture it must catch and a valid corpus it must leave alone. Builder: latest attempt wins, findings close by id, body-only hashing, transitive STALE. Both scripts share one `lib/doc.mjs`, so "how do we hash an artifact" has exactly one answer. The contract gained §15 (change class + decision ledger), §16 (knowledge track), §17 (improvement loop) before any of it was written. |
| **3 — G0–G2 + shakedown** | intake · requirements · design: commands, agents, 3 reviewer skills, the vendored lifecycle skills — then run `test-case-management` through G0→G2 for real and fix what the run exposes | ~15 |
| 4 | G3–G6: data · api · ui · plan (Postgres, MySQL, migrations, UI-system, placement skills) | ~16 |
| 5 | G7–G8: implement · verify (Go, SQL, Next.js, build verification, observability instrumentation) | ~14 |
| 6 | G9–G11: ship · deploy · monitor (+ QA handoff, tracker adapter for one provider) | ~12 |
| 7 | CI templates · `cli-afx --bundle dev` · user guide · a self-check fixture the linter must accept and a deliberately broken one it must reject | ~8 |
| 8 *(later)* | `vscode-sdlc` extension — TreeView over `state.json`, zero rules of its own | separate repo |

**Phase 2 first, and the shakedown inside Phase 3 rather than at the end.** Everything after Phase 2
is testable the moment the linter and the state builder exist: a new command can be run against a
scratch slug and checked mechanically instead of by eye. And building all 38 skills before running
one initiative end to end would mean discovering a flow problem 38 times over — so G0–G2 gets
exercised on a real slug before G3 is written.

---

## 4. Decisions — all approved

| # | Decision | Status | Note carried into the build |
|---|---|---|---|
| 1 | Review runs as a **separate subagent with fresh context** | approved | Enforced as an implementation rule: paths only, never pasted content (§4.5). |
| 2 | Auto-fix loop on `CHANGES_REQUESTED` | approved | Max 2 rounds, and each round resolves findings **by id**, not in bulk (§4.3). |
| 3 | All bundle skills prefixed `dev-` | approved | Origin of vendored skills recorded in `docs/skill-sources.md`. |
| 4 | Hooks enforce lint on write + state on stop | approved | Scoped to `<root>/**`, and **syntax-only** — the linter never grades quality (§11). |
| 5 | CLI = a third bundle in `cli-afx` | approved | Registry entry with repo, version and manifest; no URL hard-coded in logic. |
| 6 | Vendor the 12 lifecycle skills, pinned at `8556e8f` | approved | Offline-friendly; `docs/skill-sources.md` says what to diff when upstream moves. |
| 7 | `/sdlc-debug` outside the gate ladder | approved | An incident path requiring gate logs is one nobody uses. |

---

## 5. Open questions — answered

| Question | Answer | Consequence for the build |
|---|---|---|
| **Tracker** | `none` to start, behind an **adapter interface** (§14) | Phase 2 is not blocked. `fetch(key) → snapshot` and `link(key, url, state)` are the only two calls any provider must implement; Azure DevOps is the first adapter, in Phase 6. A missing adapter degrades to `none` with a warning rather than failing a gate — a ticketing outage is not a reason to stop engineering. |
| **First real slug** | `test-case-management`, scoped to **one CRUD resource + one Postgres table + one Next.js list page** | Real enough to exercise requirements → architecture → data → API → UI → implementation, small enough to reach G11 without drowning in business complexity. It runs G0–G2 inside Phase 3, before the rest of the skills exist. |
| **Repo** | Create `gitlab.com/agentic-fx/sdlc` early (private is fine) | So `afx install --bundle dev` is tested against a real clone rather than `--from-path`, which is the path most likely to hide an install bug. |
