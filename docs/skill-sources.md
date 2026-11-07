# Skill provenance

Several of this bundle's authoring skills are adapted from `gitlab.com/agentic-fx/skills`. This file
records what was taken, what was changed, and why — so that a future upstream change can be diffed
against a known starting point rather than guessed at.

**Upstream commit:** `8556e8f1333dbd5ae6e636f6ea650868685e5168` (2026-08-23,
*"Add the full QA Skill Library (80 skills) alongside the STLC pipeline set"*).

## Why adaptation and not vendoring

The upstream skills are good at the thing they were written for: walking a competent person through
a phase of work, with the red flags that phase tends to hide. That part is kept nearly intact, and it
is the reason to start from them at all.

What could not be kept is how they end. Each upstream skill terminates in a **free-form document at
its own hardcoded path** and an **ask-the-user-for-approval loop**:

| Skill | Upstream output path | Upstream ending |
|---|---|---|
| `problem-framing` | `docs/problem/YYYY-MM-DD--problem-framing.md` | "Is the problem ready for architecture-brainstorming?" |
| `writing-prd` | `docs/prd/YYYY-MM-DD--prd.md` | "Is the PRD finalized?" |
| `requirement-decomposition` | *(none — no file output at all)* | — |
| `architecture-brainstorming` | `architecture.md` in the project root or `.agent/` | per-section "does this look correct so far?" |
| `technical-design` | `/docs/architecture/{hld,db,api-contracts,lld}/` | "Halt and ask for user's feedback" at each of four steps |
| `threat-modeling` | `docs/security/YYYY-MM-DD-<system>-threat-model.md` | "Are the threats mitigated enough to proceed?" |

Both halves conflict with this bundle:

- **Paths and shape.** Artifacts here live at the §2 paths, are copied from `<root>/_templates/`, and
  have byte-exact headings the linter matches (§3). A dated free-form document cannot be linted,
  cannot be hashed into a gate log's `outputs`, and cannot be found by the stage that consumes it.
- **Who approves.** Upstream, the author asks the user whether the work is good. Here, an independent
  reviewer with a fresh context judges it against a published checklist and writes a gate log
  (§4.5). Keeping both would mean two approval mechanisms, one of which is the author grading itself
  — which is the exact failure the ladder exists to prevent.

So each skill was rewritten to write **through this bundle's templates to the §2 paths**, and to end
at the gate rather than at a question.

## Per-skill changes

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `dev-framing-problem` | `problem-framing` | the seven phases, the problem-statement template, the red flags | output → `<root>/intake/<slug>/problem.md` via template; approval loop removed; unknowns become `DEC-NNN` (§15.2); an explicit test for "is this a solution in disguise" |
| `dev-writing-prd` | `writing-prd` | the nine phases, the red flags, the what-vs-how discipline | output → `<root>/requirements/<slug>/prd.md`; the `REQ-NNN` table moved out to `dev-decomposing-requirements`; stakeholder approval loop removed; a vague-word hunt added |
| `dev-decomposing-requirements` | `requirement-decomposition` | all seven decomposition dimensions, the anti-patterns | bound to `requirements.md` + `acceptance-criteria.md` and to `REQ-NNN`; the falsifiability test and the §13.1 collection rule added. **This was the cleanest adaptation** — with no file output upstream, there was no path to unwind |
| `dev-brainstorming-architecture` | `architecture-brainstorming` | the seven phases, quality-attribute ranking, the pitfall list | output → `<root>/design/<slug>/architecture.md` + `ADR-NNN`; the incremental "does this section look correct?" loop removed in favour of the G2 review; §13 bound as given; observability design made part of G2 |
| `dev-detailing-design` | `technical-design` | steps 2.1 and 2.4 (HLD, LLD) | **re-scoped.** Steps 2.2 (data modelling) and 2.3 (API contracts) are G3 and G4 here, with their own reviewers — upstream, one approval covered all four. The four halt-and-ask steps are removed |
| `dev-modeling-threats` | `threat-modeling` | the seven phases, STRIDE, the anti-patterns | output → `<root>/design/<slug>/threat-model.md`; **every mitigation now names the gate that will enforce it**, where upstream recorded mitigations and left them to goodwill; risk acceptance requires a named human (§4.5) |

## Skills written for this bundle

`dev-analysing-source`, `dev-extracting-conventions` and `dev-mapping-impact` have no upstream
equivalent, because the knowledge track (§16) and the brownfield obligations (§16.4) do not exist
upstream.

`dev-analysing-source` is **informed** by upstream `source-analyzer` — its philosophy, "read the real
system, not the documentation about it", and its coverage of source, schema and API. Its five Python
analysers were deliberately not vendored, for two reasons: they emit a wiki-shaped summary this
bundle has no use for, and more importantly a cartographer working from a generated summary will cite
`file:line` references it has not opened. Since the citations are the entire product of GK — the
reviewer's main check is to open them and see whether they say what the card claims — a tool that
makes citation cheaper than reading would defeat the gate. Standard `Glob`, `Grep` and `Read` keep
reading and citing the same act.

`dev-defining-design-system` has no upstream equivalent either. Upstream `ui-ux-design` chose the look
inside each feature's design, which is how every feature got a slightly different one. Here the
look is a repository-wide decision made once by a named human: seven presets (two derived, with provenance, from GitHub Primer (MIT) and IBM Carbon (Apache-2.0)) whose contrast is
verified by `design-system.mjs` rather than asserted, plus a catalogue of ten page patterns that G5
cites per screen and G7 builds. Figma and existing-theme import are mappings onto the same schema,
so all three sources are checked by one script.

`dev-making-brands` and `brand.mjs` have no upstream skill. The approach (brand as code, one
brand.json drawing every asset, directions shown before one is built) comes from a private brand
kit Luan built for another product; nothing was copied, and the drawings, slot table and contrast
check are this bundle's own. The bundled font is Nunito 5.3.0 from `@fontsource/nunito` (SIL OFL
1.1, licence in `workspace/dev/scripts/lib/fonts/OFL.txt`).

## Depended on, not vendored

Nothing. Up to 1.5.0 `dev-drawing-diagrams` delegated rendering to the separate `diagram-design`
skill (`github.com/cathrynlavery/diagram-design`, MIT), which in practice was never installed, so
every diagram fell back to a table or ASCII. Since 1.6.0 diagrams are mermaid blocks inside the
artifact, drawn to C4 / UML 2.5 / crow's-foot / DFD notation, checked by `diagram.mjs check` and
rendered by `diagram.mjs render` in the headless Edge or Chrome the UI gates already use. Mermaid is
loaded from a pinned CDN build at render time (or `--mermaid <file>` offline) and is never vendored.

Cloud diagrams (1.7.0) work the same way. `topology.mjs render` loads draw.io's own viewer
(`jgraph/drawio`, Apache-2.0) from a pinned jsDelivr build and draws with the stencils draw.io
ships: AWS Architecture Icons, Azure, Google Cloud, Alibaba Cloud and the Kubernetes community
icons, each under its owner's terms (see `dev-designing-cloud/providers.md`). Nothing is vendored;
the names `lib/clouds.mjs` uses were extracted from the draw.io sidebars and are held to that
catalogue by `tests/fixtures/topology/stencils.json`. OCI's toolkit is not built into draw.io, so
OCI pages follow Oracle's OCI Style Guide for draw.io v24.2 groups and draw services as its
component cards. The workflow (analyse, recommend, estimate, generate, deploy only on confirmation)
follows the shape of `awslabs/agent-plugins` `deploy-on-aws`, generalised to five providers and
split across G2 and G10.

## Keeping this current

To diff against a newer upstream:

```bash
git clone --depth 50 https://gitlab.com/agentic-fx/skills.git /tmp/upstream-skills
cd /tmp/upstream-skills && git diff 8556e8f..HEAD -- problem-framing writing-prd \
  requirement-decomposition architecture-brainstorming technical-design threat-modeling
```

Read the diff for **domain content** — a new red flag, a phase that was missing, a failure mode
somebody hit. Those are worth pulling in. Changes to output paths and approval flows are not: this
bundle answers those questions differently on purpose, and re-importing them would reintroduce the
self-approval this ladder was built to remove.

When you do pull something in, update the commit sha at the top of this file and the `@ 8556e8f`
reference in the affected skill's own header. A provenance note that points at the wrong commit is
worse than none.

---

## Added with the data and api gates (G3, G4)

Two more upstream skills were adapted when G3 and G4 were built, from the same commit
`8556e8f1333dbd5ae6e636f6ea650868685e5168`. Both ended upstream the same way the first six did — a
dated free-form document plus a self-awarded approval — so the same two unwindings applied.

| Upstream | Upstream output path | Upstream ending |
|---|---|---|
| `data-modeling` | `docs/data-models/YYYY-MM-DD-<domain>.md` | "Is the data model validated and ready for API and persistence design?" |
| `api-design` | `docs/api/YYYY-MM-DD--api-design.md` (+ OpenAPI, optional) | a self-awarded ✅ / ⚠️ / ❌ readiness decision |

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `dev-modeling-data` | `data-modeling` | the eight-phase flow and its order — meaning before tables, ownership before relationships, access patterns before storage — the red flags, and the anti-pattern list | output → `<root>/data/<slug>/data-model.md` + `migration-plan.md` via template; approval question removed in favour of G3. Phase 7 ("evolution and versioning strategy") became **§7, a contract with a reviewer**: expand → migrate → contract, one concern per `MIG-*`, a `down` for every `up`, chunked backfills. Phase 6 gained the rule that **indexes are derived from `## Access patterns`, with `EXPLAIN` evidence** (§13.7), where upstream only asked that indexing be "considered". Added: the engine-difference table (Postgres vs MySQL — transactional DDL, online index builds, lock queues, index types, enums, default isolation), PII classification with retention (§13.6), and `DEC-NNN` for the answers only a human has (§15.2) |
| `dev-designing-api` | `api-design` | phases 1–6 nearly intact — requirements-to-API mapping, boundary and ownership, resource design, request/response contracts, errors and versioning, the security review — and the consumer-first mindset | output → `<root>/api/<slug>/openapi.yaml` (or `.proto`) + `contract-diff.md`; the self-awarded readiness decision removed, since §10 allows four verdicts and only a reviewer writes them. Upstream's conventions became **§13.1 as a registry a gate fails you on** — pagination with a tiebreaker, RFC 9457, idempotency, `ETag`/`If-Match`, rate limits, `202` for long operations. Upstream phase 8 ("strict endpoint matching") is **§6**, enforced at G7, not advice here. Added: the contract is validated with a real command before handback; `contract-diff.md` is diffed against `<root>/knowledge/api-as-is.md` (§16.1) rather than the repository's spec file; object-level authorisation stated per client-supplied id (§13.6) |

**The sharpest edge in both.** Upstream `data-modeling` says it "MUST be used … before `api-design`",
and `api-design` assumes the data model is settled. Here they are **siblings** (§4.2): G3 and G4 both
depend on G2 and neither on the other, and each gets its own reviewer. That is deliberate. Sequencing
them was upstream's way of stopping the contract from being a rename of the schema; this bundle stops
it with a rule instead — the contract is not the schema with HTTP in front of it — and gets parallel
gates in exchange. Where one has already run, the other is given its path as an input, which is what
the gate log's `inputs:` hashing is for.

To diff these two against a newer upstream, extend the command above:

```bash
cd /tmp/upstream-skills && git diff 8556e8f..HEAD -- data-modeling api-design
```

## Added with the ui and plan gates (G5, G6)

Four more upstream skills were drawn on when G5 and G6 were built, from the same commit
`8556e8f1333dbd5ae6e636f6ea650868685e5168`. Two were adapted into bundle skills; two were read for
their domain content and folded in rather than adapted whole, because neither maps to a gate here.

| Upstream | Upstream output path | Upstream ending |
|---|---|---|
| `ui-ux-design` | `docs/ui-ux/YYYY-MM-DD-<feature>.md` + generated mockup images | "Is the UI/UX design approved and ready for implementation?" |
| `react-ui-analyze` | *(none — feeds the next skill in the chain)* | a readiness review before implementation planning |
| `react-accessibility-testability-reviewer` | *(none — a report)* | a self-awarded 🟢 / 🟡 / 🔴 decision |
| `implementation-plan` | `implementation_plan.md`, archived to `docs/implementation-plan/` | "get user approval before writing any production code" |

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `dev-specifying-ui` | `ui-ux-design`, with `react-ui-analyze` and `react-accessibility-testability-reviewer` folded in | the eight-phase flow — scope, flows, information architecture, wireframes, interaction and state, high fidelity, accessibility, handoff — the anti-patterns, and the question phase 5 is built around, "what does the user see when things go wrong?" | output → `<root>/ui/<slug>/ui-spec.md` via template; the approval question removed in favour of G5; the mockup-image workflow dropped, since a bundle artifact is linted markdown and a picture shows exactly one state. Upstream's state list (loading, empty, error, disabled, success) became **§13.3's seven states as a filled table a gate fails you on** — partial/stale, permission-denied and offline are added, and every cell must say what triggers the state, what is shown, what actions remain and how the user leaves it. WCAG raised from upstream's 2.1 AA baseline to **2.2 AA** (§13.3). Added, with no upstream equivalent: lists bound to the G4 contract's real pagination, sort whitelist and tiebreaker (§13.1); optimistic-vs-pessimistic declared per mutation with its rollback; tokens cited from `docs/design-tokens.md` rather than chosen; `data-testid` declared as the QA bundle's handoff surface (§9); `DEC-NNN` for product judgements (§15.2). From `react-ui-analyze`: kit-first component decomposition and the justification an owner owes for anything bespoke — its React-specific composition guidance was left upstream, since G5 is stack-neutral and G7 owns the code. From `react-accessibility-testability-reviewer`: the per-component accessibility contract (role, name, focus, keyboard path, live region) and the stable-selector rule — its blocking decision levels were dropped, because severity here is §5.3's four values and only a reviewer assigns them |
| `dev-planning-implementation` | `implementation-plan` | the mandatory-sections idea, work isolation, incremental phasing into testable milestones, and verification as part of the plan rather than after it | output → `<root>/plan/<slug>/tasks.md` via template; the approval loop removed in favour of G6. **Re-scoped**: upstream's "Context & Root Cause" is G0 and its "Scope & Impact" is G2 here, each with its own reviewer, so neither is restated in the plan — a plan that re-argues the design is a plan that re-opens it. Its pseudo-code and Mermaid design section was dropped for the same reason `dev-detailing-design` does not generate code. Added: `TASK-NNN` as a permanent join key to G7 and G8 (§1, §10); two-way REQ↔TASK coverage, counted; the one-sitting rule; a dependency DAG that is proved with a command rather than asserted; the four fixed task states (§10); migration ordering with expand and contract as separate tasks (§7); flag and observability work as tasks (§13.4, §13.5); and `DEC-NNN` in place of a planned guess (§15.2) |

**Estimates.** `estimating-effort` was read but not adapted: it forecasts *QA* effort from a QA
analysis document, using case-count rules that belong to the other bundle (§9). What was taken is its
prime directive — **an estimate is a model, shown as one** — which becomes this bundle's rule that
every estimate is a range with a named condition for its high end, plus stated assumptions and
exclusions. A single number is not an estimate, because there is nothing in it anyone can check early.

**`react-ui-kit-standard`** was deliberately not adapted. It is the law for one project template's
component library — import paths, a cheatsheet of kit components, Tailwind composition rules — and
those are G7's business and a project's own. What G5 takes from it is one rule with no template in
it: kit components before anything bespoke, and a bespoke component needs a justification and an
owner.

**The sharpest edge here.** Upstream, `ui-ux-design` produces mockups that "become the UI source of
truth", and `implementation-plan` is the document a human approves before code. Both put the decision
in an image or a conversation. Here the source of truth is a linted document whose states table is
counted mechanically, and the approval is a gate log written by a reviewer who never saw the author's
reasoning. That is the same unwinding the first six skills needed, applied to the two stages where it
is most tempting to skip: a mockup *looks* finished, and a plan *feels* agreed.

To diff these two against a newer upstream, extend the command above:

```bash
cd /tmp/upstream-skills && git diff 8556e8f..HEAD -- ui-ux-design implementation-plan \
  react-ui-analyze react-accessibility-testability-reviewer estimating-effort
```

## The release track (G9–G11)

Three more upstream skills were adapted for the release, deployment and monitoring gates. The count
in this file's opening line predates them.

**Upstream commit:** as above, `8556e8f`.

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `dev-packaging-release` | `git-branch-enforce` + `git-commit-submitted` | branch discipline, the protected-branch guard, the intent-typed branch names, the squash rules, and the problem/solution/**impact** commit-message structure — the impact paragraph is the part teams drop and the part reviewers need | **merged into one skill**, because upstream they are two enforcement passes over the same moment and this bundle already has one gate there. Both upstream skills end in an ask-the-user approval loop (`git-commit-submitted` Phase 5 calls `notify_user` and waits); approval here is the G9 review against a published checklist, so both loops are removed. Branch and commit conventions now come from `DEV-PROFILE §Delivery` rather than being hardcoded, and the output is two templated artifacts at the §2 paths instead of an optional note in `docs/process/`. The whole `qa-handoff.md` half (§9) has no upstream equivalent |
| `dev-designing-observability` | *(no direct upstream)* | — | written for this bundle; see below |
| `dev-planning-deployment` | *(no direct upstream)* | — | written for this bundle; see below |

### `summarizing-release` — read, deliberately not adapted

`summarizing-release` was read as a candidate for G9 and rejected, which is worth recording so the
next person does not re-evaluate it from scratch.

It aggregates **several features' QA verdicts into one release sign-off** with a GO / NO-GO /
CONDITIONAL recommendation. That is a real job, but it is three kinds of wrong for this gate. It
belongs to the **QA bundle** — it reads `<qa-root>/reports/`, `<qa-root>/defects/` and traceability tables, all of
which this bundle may never touch (§9). It is **release-scoped**, aggregating many slugs, where
every gate here is per-slug. And its output is a **recommendation** rather than a verdict, with the
accept/override decision left to whoever holds release authority — whereas §5 gives a gate exactly
four verdicts and a reviewer who states one.

Two ideas from it were kept, restated in this bundle's terms. Its freshness check ("a report that
predates the newest run cannot sign a release") is the same instinct as §4.4 staleness, which this
bundle already enforces by hashing. And its rule that an unevaluable criterion is `CONDITIONAL`
rather than silently `GO` is §12's "an honest `BLOCKED` is always correct" — which is why
`dev-reviewing-release` fails a checklist row it could not verify read-only rather than guessing.

### Written for this bundle

`dev-planning-deployment`, `dev-reviewing-deployment`, `dev-designing-observability`,
`dev-reviewing-monitoring` and `dev-reviewing-release` have no upstream equivalent. The upstream set
is a QA library plus a development lifecycle that stops at the pull request; there is nothing
upstream for a release plan, a rollback that accounts for migrated data, an SLO register, a runbook,
or a post-release report judged against the original problem statement. §13.4 and §13.5 are this
bundle's own standards, and the skills that enforce them had to be written against those sections
rather than adapted from anything.

### Keeping the release track current

The diff command above covers the six lifecycle skills only. For this track:

```bash
cd /tmp/upstream-skills && git diff 8556e8f..HEAD -- \
  git-branch-enforce git-commit-submitted summarizing-release
```

The same reading rule applies: pull in domain content — a new red flag, a failure mode somebody hit
— and leave the output paths and the approval loops where they are.

## Added with the implementation and verification gates (G7, G8)

Two more upstream skills were adapted for G7. The count in this file's opening line predates them.

**Upstream commit:** as above, `8556e8f`.

| This bundle | From | Kept | Changed |
|---|---|---|---|
| `dev-writing-python-code` | `python-backend` + `python-coding-standard` (and its `formatting`, `linting`, `type-checking` references) | the tooling stance — ruff for format and lint, mypy in strict mode, bandit, `pip-audit`, `uv` — and the layering discipline: dependencies point inward, the domain imports no framework or ORM, queries return DTOs rather than entities | **merged into one skill**, because upstream `python-backend` is mostly a router into `python-coding-standard` plus a project-bootstrap workflow, and this bundle bootstraps nothing at G7. The `init-project` workflow and the four-layer directory it mandates are dropped: layout comes from `DEV-PROFILE §Stacks`, and in brownfield from `<root>/knowledge/conventions.md`, because a skill that relocates an existing codebase to match its own diagram is a refactor nobody asked for. The mandatory-planning and mandatory-review clauses are removed — planning is G6 and review is a gate. Added, with no upstream equivalent: exception **chaining** (`raise … from exc`, which upstream's error-handling section omits entirely), the async section (a blocking call in `async def`, unset `httpx`/`aiohttp` timeouts, `gather(return_exceptions=True)` results nobody reads, a `create_task` reference that can be collected), the N+1 and session-scope rules from §13.2, and the reviewer grep table |
| `dev-writing-react-code` | `react-coding-standard` | type-only imports, no `any`, exported `ComponentNameProps`, derived state computed rather than stored, stable list keys, the barrel-file warning | its project layout and its Tailwind + `cn()` convention are **not binding** here — layout comes from `DEV-PROFILE §Stacks` and styling from `docs/design-tokens.md` (§13.3), which is this bundle's single source of colour, spacing, type and motion. Its mock-data section is dropped as an early-phase concern. Added: the seven screen states as a discriminated union rather than three booleans, the out-of-order response and the `AbortController`, the lying dependency array, StrictMode double-invocation as a missing-cleanup signal, honest pagination against the §13.1 contract (a client that fetches "everything" is a `BLOCKER`), WCAG 2.2 AA as a build obligation, and `data-testid` as the QA bundle's hook rather than the unit tests' (§9) |

### `code-review` and `python-code-review` — read, deliberately not adapted

Both were read as candidates for `dev-reviewing-implementation` and rejected, which is worth
recording so the next person does not re-evaluate them from scratch.

Their content is sound and some of it is visible in this bundle's shape: the six review tiers —
correctness, security, reliability, maintainability, performance, style — are close to how §5.3's
severities sort in practice, and their "golden rule" that a formatting finding belongs to the
linter is exactly §11's boundary, restated in this bundle as a *Findings that are usually wrong*
entry.

What could not be adapted is everything structural. They use a **`P1`–`P4` severity vocabulary**,
and §10's tokens are matched byte-exact by `lint-dev.mjs` and `build-state.mjs`; a review skill that
teaches the wrong four words produces logs that never reach the board. They end in **Approve /
Request Changes / Comment**, which is a pull-request verb set, not the four verdicts in §5, and
`Comment` in particular has no meaning in a ladder where the next stage refuses to run without a
`PASS`. They route to a language reference **at review time** and stop if one is missing, where this
bundle's reviewer must read the artifact it was given and return `BLOCKED` only when it genuinely
cannot. And neither publishes a **fixed, numbered checklist** — §5.3 requires one row per published
check, in order, with evidence, so a log can be compared with the log before it.

The remaining gap is the one this gate is actually about: both skills review a diff on its own
terms, and G7 reviews a diff **against approved tasks, an approved contract and an approved data
model**, with `change-summary.md` as the index. That is a different job, and it needed to be written
rather than adapted.

### `executing-tests` — read, adapted in spirit only

`executing-tests` is a QA-tier skill: it runs `<qa-root>/package.json` runners, writes under
`<qa-root>/runs/**`, and updates a test plan's traceability columns — all of which this bundle may never
touch (§9). It was read for its evidence discipline, and two of its ideas are in
`dev-running-verification` in this bundle's terms.

Its **failure-detail contract** — never a bare "failed", always the quoted assertion, the artifact
path and a classified cause — became G8's rule that every failure records the assertion as printed
plus a product / test / environment classification. Its **prime directive**, run and report but
never auto-fix, is why `dev-verifier` is spawned without an `Edit` tool at all rather than merely
told not to edit.

One rule was deliberately **not** carried over. Upstream re-runs a failed case once, immediately and
unchanged, to classify it as `FLAKY`. G8 does not re-run: it records the failure and reports the
flakiness if it saw both outcomes. The reason is that the reviewer re-runs a gate anyway, so the
second data point arrives from an independent context rather than from the stage that wants a green
board — and an automatic retry inside the authoring stage is one edit away from a sheet that
records only the second result.

### `github/spec-kit` `templates/commands/clarify.md` — the clarify round (MIT, © GitHub, Inc., read at `f68ffca` on 2026-10-20)

Became `/sdlc-requirements --clarify` and `skills/dev-writing-prd/clarify.md`. Kept: the coverage
scan by category marked Clear / Partial / Missing, ranking by impact × uncertainty, at most five
questions asked one at a time with a recommended option or a short answer of five words or fewer,
and each answer written into the section it decides with no contradicting text left behind.
Changed: every question is a `DEC-NNN` row in the ledger (§15.2), so the answer is attributed, stales
the gates that cite it and is checked by `propagate-dec.mjs`; the author queues and folds while the
command asks, so the agent never talks to the human; a skipped question stays `open` and unqueued
gaps go to PRD `## Open questions`. Not taken: the `## Clarifications` session section (the
template's headings are a contract, §3), the extension hooks, the checklist re-validation, and the
wording.

### `mattpocock/skills` `tdd` — one rule, no text (MIT, read on 2026-10-19)

The red → green → refactor loop. Kept: the test is written first and must be seen failing for the
behaviour's reason before any production code. Changed: it lives inside `dev-implementer`'s per-task
steps rather than a separate skill; the red line goes in the lane note, and the G7 reviewer proves it
by reverting the production half of one commit. Not taken: the skill's own wording and its
"pre-agreed seams" (G6's tasks already fix the seams).

### `obra/superpowers` `receiving-code-review` and `verification-before-completion` — ideas, no text (MIT, read on 2026-10-20 at `bb92a77`)

Copyright (c) 2025 Jesse Vincent, MIT. Became `skills/dev-stage-protocol/receiving-review.md`.
Kept: read all feedback before acting, stop on any unclear item before fixing any, verify against
the codebase, push back with technical reasoning, one fix at a time with a test each, no
performative agreement or thanks, and "no completion claim without fresh verification evidence".
Changed: bound to this bundle's loop — findings are `CR-NNN` rows, the response is the §4.3
resolution map, an item only a human can settle becomes a `DEC-NNN` instead of a chat question, and
push-back evidence must be re-checkable by the reviewer (`path` + symbol, test output, contract §).
Not taken: the wording, the "human partner" trust split (every review here is independent) and the
GitHub thread-reply mechanics. A reference file rather than a skill, because the description
listing is near its budget and the procedure is only needed when a re-spawn carries a log.

### Written for this bundle

`dev-writing-go-code`, `dev-reviewing-implementation`, `dev-running-verification` and
`dev-reviewing-verification` have no upstream equivalent. The upstream set has no Go skill at all;
`code-review`'s language routing names one and the file is not present. The two review skills are
gate reviews against published checklists with hashed inputs and outputs, which is this bundle's own
mechanism, and `dev-running-verification` is bound to `DEV-PROFILE §Quality gates`, §7's migration
round-trip and §13.6–§13.7, none of which exist upstream.

### Keeping these current

```bash
cd /tmp/upstream-skills && git diff 8556e8f..HEAD -- \
  python-backend python-coding-standard react-coding-standard \
  code-review python-code-review executing-tests
```

The same reading rule applies: a new trap, a failure mode somebody actually hit, a tool that
replaced another one — those are worth pulling in. Severity vocabularies, approval loops and output
paths are answered differently here on purpose.
