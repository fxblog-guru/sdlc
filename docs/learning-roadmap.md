# Learning roadmap: from a template that follows steps to one that improves

Written for: maintainers of this bundle, and later of stlc, recall and ai-eval, who will build the
pieces below and need to know what each one is for and how it will be judged.

Status (2026-10-23): Steps 1–8.0 and the automatic loop (§4.0) are built on `feat/sdlc-learn`, each
with tests and mutants; see [docs/evidence/](evidence/README.md) and §4.9 below for what is done,
what is only proven by tests, and what waits on real use. sdlc goes first; the criteria then carry to
stlc and the other products.

## 1. Why

The bundle is a template: anyone who installs it starts a project already knowing how to frame a
problem, design an API, review a migration and ship a release. That part is strong. What it does not
do is **get better from use**. A lesson found in one initiative stays in that initiative's
`post-release.md`; the next initiative, and the next project, start from the same template as the
first.

Two loops need to close, and they are the same loop at two sizes:

```
Inside one project                         Across projects
──────────────────                         ───────────────
idea → build → measure → learn ─┐          bring template → absorb project → apply → learn ─┐
  ▲                             │            ▲                                              │
  └──── next idea ◄─────────────┘            └──── lesson seen in 2+ projects → template ◄──┘
```

## 2. The criteria

Everything the bundle produces, and every piece of this roadmap, is held to five pillars. The first
three are about how the agent works, the fourth about proving it, the fifth about whether the result
is worth having. A pillar without a check that can fail is a slogan, so each one names its measure.

| Pillar | Means | Measured by |
|---|---|---|
| **P1 Intelligence** | Knowledge and design thinking in every aspect: ideation, implementation, design and management, in theory and in practice | Gate pass on first attempt; coverage of the areas a real project needs (§3.1) |
| **P2 Memory and learning** | Absorbs the project; reads what it learned before starting work; each run better than the last; measurement is itself knowledge that drives the next change | Repeated-mistake rate; a fixed benchmark scored per version |
| **P3 Judgement and integrity** | Does not invent what only a human knows; asks at the right moment; scales process to the size of the work; asks whether a feature is worth building | Uncited claims a design rests on; fabrication on out-of-scope questions |
| **P4 Verification and safety** | Gates with evidence, an independent reviewer, security, least privilege, rollback; no data loss, no secret leak, ask before an irreversible or outward step | Defects caught by a gate vs escaped to production; destructive commands that ran without a human |
| **P5 Value and experience** | The product is used, beautiful, easy, extensible, and costs what it should; tokens proportionate to the work | Kill criterion met or not; UX and performance scores; real usage; cost vs estimate |

## 3. Where sdlc stands today

| Pillar | Already there | Gap |
|---|---|---|
| P1 | 44 skills, a reviewer per gate, design system, cloud and observability | Ideation is architecture-only (`dev-brainstorming-architecture`, `dev-framing-problem`); no estimation, prioritisation or roadmap skill |
| P2 | GK knowledge cards read at every stage (§16); `/sdlc-improve` adds a checklist row from a production failure (§17); `/sdlc-feedback` pushes friction to Recall | No lessons store; no stage reads Recall (`knowledge_search` is never called); `post-release.md` findings stop at the report; nothing carries a lesson back into the bundle; no benchmark |
| P3 | Change classes `initiative` / `change` / `fix` (§15.1); the decision ledger forbids an agent answering a `DEC-NNN` (§15.2); G11 must answer `problem.md` | No rule for an agent that is unsure of a *fact* (not a decision); no check that a feature was worth building beyond G11's restatement |
| P4 | **The strongest pillar.** Independent reviewer that sees paths only (§4.5); SHA-256 of inputs and outputs, `STALE` cascades (§4.4); overrides carry `who:` ; `data-guard.mjs`, `pr-scan.mjs` (secrets, skipped tests), `ui-privacy.mjs`, `threat-trace.mjs`; `settings.json` asks before `git push` and migrations; rollback required at G10 | No measure of gate effectiveness: `/sdlc-monitor` names escaped defects but nothing counts caught vs escaped per gate; the `deny` list is empty (no hard block on `rm -rf`, `DROP`, force push); no permission audit of what agents actually ran |
| P5 | G0 asks for a success signal; G5 reviews against the approved visual; cloud skill prices options; layout perf budget | No kill criterion; no web performance or Lighthouse gate; no usability check with a person; extensibility is reviewed only as architecture; cost after release not compared with the estimate; token cost per change class not reported to the user |

### 3.1 P1 in detail: the knowledge map

Counted 2026-10-23 by skill, and by which skills treat a topic as a rule rather than mention it.
**Owned** means one skill owns the standard and one gate can fail on it (§13). **Touched** means
the topic appears in checklists but no skill owns it. **Absent** means a real project will need it
and nothing in the bundle knows it.

| Aspect | Area | State | Owner today, or what is missing |
|---|---|---|---|
| Ideation | Problem framing | Owned | `dev-framing-problem` → G0 |
| | Product ideas, user research, competitors | Absent | No skill generates or compares ideas; nothing reads competitors |
| | Value check ("is it worth building?") | Touched | G0 asks for a success signal; G11 restates `problem.md`; no kill criterion |
| Requirements | PRD, decomposition, clarify | Owned | `dev-writing-prd`, `dev-decomposing-requirements` → G1 |
| Architecture | Options, ADRs, impact, cloud | Owned | `dev-brainstorming-architecture`, `dev-mapping-impact`, `dev-designing-cloud` → G2 |
| | Events, queues, caching | Touched | Mentioned across designs; no owned pattern catalogue |
| | AI features (LLM calls, RAG, prompts, evals) | Absent | A product that calls a model gets no guidance on cost, evals or prompt injection |
| Security | Threat model | Owned | `dev-modeling-threats` → G2 |
| | Privacy (PII, retention, consent) | Touched | In threat model and data review; no owned retention/consent standard |
| | Supply chain (licences, SBOM) | Touched | Dependency rules in §18; no licence policy |
| Data | Model, migrations, review | Owned | `dev-modeling-data`, `dev-writing-migrations` → G3 |
| API | Design, style, review | Owned | `dev-designing-api` → G4 |
| UI / UX | Design system, spec, visuals, review | Owned | `dev-defining-design-system`, `dev-specifying-ui`, `dev-designing-visuals` → G5 |
| | Accessibility | Owned | In G5 checks |
| | i18n / localisation | Touched | Copy lint only; no locale, plural or RTL standard |
| | SEO, web performance budget | Absent / Touched | No SEO rules; perf budget exists for layout only |
| | Native mobile | Absent | A `field-mobile` preset exists; no iOS / Android / React Native code skill |
| Build | Go, Python, TypeScript, React, Next.js | Owned | `dev-writing-*` + `lib/langs.mjs` adapters |
| | Other stacks (Java, .NET, Flutter) | Absent | Add through the language registry (4 places) |
| | Refactor, tech debt | Touched | `/sdlc-refactor` + `known-debt.md`; no debt budget |
| Verify | Tests, verification | Owned | `dev-running-verification` → G8; QA depth is stlc's |
| Ship | Release, deploy, rollout | Owned | `dev-packaging-release`, `dev-planning-deployment` → G9–G10 |
| Operate | Observability, runbook, post-release | Owned | `dev-designing-observability` → G11 |
| | Incidents, postmortems | Touched | Runbook covers response; no postmortem template feeding §17 |
| | Cost (FinOps) | Touched | Cloud skill prices options; no monthly budget check after release |
| Management | Estimation | Absent | stlc has `estimating-effort`; sdlc has none |
| | Prioritisation, roadmap | Absent | No backlog, no ranking, no roadmap view |
| | Documentation for users | Touched | `dev-documenting-changes` writes change notes; no user-guide standard |

What the map says: the bundle is deep from requirements to operation, and thin at the two ends a
person feels most: **before** a project (ideas, value, priorities) and **around** the code (AI
features, mobile, i18n, SEO, cost after release).

stlc for comparison: lessons exist (CONTRACTS §23), are gated, injection-scanned, and recalled by
`automation-engineer` and `hunting-flaky-tests`. That is the mechanism sdlc should reuse, not
reinvent.

## 4. The roadmap

Ordered by what closes a loop soonest. Each step lists its pillar, what changes, and the check that
proves it works. A step is done when its check can fail and does not.

### 4.0 How the learning loop runs, and what is automatic

The loop must run without anyone remembering to run it. A command a person has to remember is a
loop that runs twice and then stops. So every step below is wired to an event that already happens,
and a person is asked only where a wrong answer would spread to other projects.

| When | What runs | Trigger | Human? |
|---|---|---|---|
| Session opens | Briefing: the gate board, then `learn.mjs brief`: new signals, lessons written, ideas to rank, stale lessons, each said once | `SessionStart` hook (`session-start.mjs`) | no |
| A stage starts | Recall: local lessons matching the gate and module, then Recall `knowledge_search` if configured | `dev-stage-protocol` preflight (Step 2) | no |
| A stage ends | Harvest: `learn.mjs brief` names signals new since the last brief (repeat `CR` reason, `REOPENED`, attempt 2, post-release note); `/sdlc-learn` distils them into lessons a judge accepts | `dev-stage-protocol` §5 | approves through the judge |
| Knowledge cards drift | `/sdlc-onboard --refresh` offered for the stale cards only | `SessionStart` notices `STALE` GK | **yes**: one keypress |
| G11 passes | `## Next` rows written to `ideas.md`; lessons pushed to Recall | `/sdlc-monitor` | no |
| A lesson gets a second independent source | `provisional` → `established` | harvest | no |
| A human corrects the agent | `/sdlc-learn --from "<text>"`, `established` at once | the person, or the agent offers it when it is corrected | **yes**: the correction is the input |
| A lesson recurs in 2+ projects | Promotion proposal to the bundle | `/sdlc-learn --promote`, offered weekly by the briefing | **yes**: approve each |
| Ideas are ranked | Value / effort / confidence ranking of `ideas.md` | the person | **yes** |
| Every 60 days or 20 lessons | Audit: stale provisional lessons, duplicates, lessons whose evidence moved | the briefing offers `/sdlc-learn --audit` | no to run, yes to deprecate |

**Where the mechanism lives: local first, Recall optional.** The whole loop above runs on files in
the project's SDLC root (`learnings/`, `logs/learn-brief.json`, `ideas.md`) and scripts in the
bundle. A solo project with no Recall learns fully. Recall adds only what files in one repository
cannot do:

| Needs Recall | Why a local file cannot |
|---|---|
| Lessons from *other* projects at stage start | They are in other repositories |
| Promotion (a lesson in 2+ projects) | Counting projects needs one place that sees them all |
| Team sharing and the maintainer's view (feedback, usage per skill) | Several people, several machines |
| Domain knowledge too large for files (thousands of rules or test cases) | Needs search, roles and review |

So Recall is worth running for a team, a large or long project, or research across projects; it is
never a prerequisite. The same local lesson format is what Recall stores, so turning it on later
pushes the existing lessons without converting anything.

Guards that keep automatic learning smooth instead of noisy:

- **Budget.** At most three lessons per stage, a recall index of at most eight rows, bodies read only
  for the hits whose probe is the stage's question. Recall costs an index, not a corpus.
- **Silent when there is nothing.** No lessons, no Recall, no signal: the step prints nothing and
  costs nothing. A learning step must never block a stage or ask a question on its own.
- **Never evidence.** A recalled lesson is the first hypothesis; the code, the cards and the
  reviewer decide. A lesson that contradicts the code is flagged for audit, not obeyed.
- **Safe to inject.** Every lesson passes `lesson-scan.mjs` before it is written and again before it
  is recalled (stlc §23).
- **Fails open.** If Recall is down or a hook errors, the stage runs as it does today and the
  briefing says the loop is degraded.

As built (§19.5), harvest is recomputed from the gate logs rather than appended per write: the logs are
already the record, so a second store could only drift from them. Distilling stays a command with a
judge, because a lesson written with no reviewer would be read by every later stage.

The measure for the whole loop is Step 6's repeated-mistake count. If it does not fall, the loop is
not working, however automatic it is.

### Step 1: Lessons store for sdlc (P2: write)

- `/sdlc-learn [<slug>] | --from "<text>" | --audit | --promote`, the sdlc twin of `/qa-learn`. Harvest
  and distil run on their own (§4.0); the command is for corrections, audits and promotion.
- Same lesson format as stlc §23: `<root>/learnings/LRN-<TOPIC>.md`, `provisional` on one source,
  `established` on two or on a named human, at most three per pass, `Do · Why · Not` body.
- Sources it harvests: gate logs that went `CHANGES_REQUESTED` twice for the same reason, `CR-NNN`
  marked `REOPENED`, a fix that needed a second round, `post-release.md` findings, a human correction.
- Reuse `lesson-scan.mjs` from stlc for the safety scan. One copy, shared, not forked.
- A new contract section, §19 Lessons, mirrors stlc §23 and points at it for the shared format.
- **Check:** fixtures, one broken lesson per rule (missing evidence, unsafe text, duplicate probe)
  that `learn check` must reject and one valid lesson it must accept.

### Step 2: Read before work (P2: read)

- Preflight in `dev-stage-protocol` gains one step: `learn recall --stage G<N> --module <m>`
  prints an index (id, confidence, probe); the author reads the bodies whose probe is its question.
- If Recall is configured, the same step calls `knowledge_search` for the slug's modules and passes
  the hits to the author as **hypotheses, never evidence**. If not configured, skip silently.
- The protocol file is at its 950-word cap, so the step goes into a sibling file the protocol links
  (`dev-stage-protocol/recall.md`), and a sentence elsewhere in the protocol is cut to pay for the link.
- **Check:** a fixture initiative with a planted lesson ("G4 rejects list endpoints without a cursor")
  and a task that would repeat the mistake; the stage must cite the lesson, and with the lesson
  removed it must not.

### Step 3: Close the loop inside a project (P2 + P3)

- `post-release.md` gains a required `## Next` section. Each finding becomes one row: `IDEA-NNN`
  (a new or changed capability), `LRN-` candidate (a habit), or `/sdlc-improve` candidate (a check a
  gate should have made).
- `<root>/ideas.md`: one backlog per repository, each row citing the evidence that raised it, its
  change class guess, and a value / effort note a human ranks. Agents add rows; only a human ranks.
- `/sdlc-intake` reads `ideas.md` first and offers the top-ranked rows before a blank intake.
- **Check:** G11's reviewer fails a `post-release.md` whose findings have no `## Next` row; the
  linter fails an `IDEA-NNN` with no evidence path.

### Step 4: Carry lessons back into the template (P2, across projects)

- Every `established` lesson is pushed to Recall with `kind: lesson` and tags for bundle, gate and
  stack.
- `/sdlc-learn --promote` lists lessons that Recall holds from **two or more projects** and proposes
  each as a bundle change: a skill edit, a `/sdlc-improve` checklist row, or a `DEV-PROFILE` default.
  A human approves each one; the bundle CHANGELOG cites the lesson ids, not the projects.
- Project facts never cross over. A lesson that names a project's table, endpoint or customer fails
  the promotion check and stays local.
- **Check:** a promotion fixture with one generic lesson (accepted) and one project-specific lesson
  (refused).

### Step 5: Honesty rule (P3)

- One rule in the agent brief: a fact the agent cannot cite (a file, a card, a decision, a lesson) is
  written as `UNVERIFIED: <claim>`, and a reviewer treats any `UNVERIFIED` claim on which a design
  choice rests as a `MAJOR` finding until it is cited or turned into a `DEC-NNN`.
- **Check:** a fixture design that rests on an uncited claim; the reviewer must flag it.

### Step 5b: Verification you can count (P4)

- **Gate effectiveness.** `post-release.md` and `/sdlc-review-pr` record each defect with the gate
  that should have caught it; `/sdlc-status --gates` shows per gate: caught (findings resolved) vs
  escaped. A gate that has caught nothing in ten initiatives is a removal candidate (§17).
- **Hard denies.** `settings.json` `deny`: `git push --force*`, `rm -rf *`, `DROP DATABASE*`,
  `TRUNCATE*`, writes to `.env*`. Today all of these depend on the agent's judgement.
- **Run audit.** The SessionEnd hook lists every `ask`-class command that ran and who approved it;
  Recall stores it next to the session.
- **Check:** a fixture session that runs a denied command must be blocked; a defect logged against
  G4 must show as escaped on the G4 row.

### Step 5c: Value you can see (P5)

- **Kill criterion** at G0 (also Step 7.1): what result, by when, means the feature is removed.
  G11 reports met / not met.
- **Web quality gate** at G8 for UI work: Lighthouse performance, accessibility and SEO scores, LCP
  and bundle size against `DEV-PROFILE §Defaults` budgets.
- **Usability pass** at G5: one task walked by a named human on the preview, written as
  `usability.md` (task, time, where they hesitated). The human is the measure, not the agent.
- **Extensibility probe** at G2: name the next two likely features and show the design takes them
  without changing the core; G2 fails a design that cannot.
- **Cost line** in `post-release.md`: cloud cost and token cost of the initiative vs the estimate.
- **Check:** G8 fails a page over budget; G11 fails a release with no kill-criterion result.

### Step 6: Measure across versions (P2 + P4 folded in)

- An ai-eval suite for sdlc: a fixed small brownfield repo and five tasks, one per change class plus
  two that a lesson should change (Step 2's fixture).
- Scored per bundle version: gate pass on first attempt, repeated-mistake count, `UNVERIFIED` count,
  tokens per class. Results go to Recall so the trend is visible next to usage.
- A version that scores worse on any measure does not ship without a written reason.
- Why ai-eval and not a script: sdlc is itself an agent product, and its sessions are the traces
  ai-eval reads. Most measures are counts a code assertion decides (gate verdicts, tokens). The two
  that need a judge ("did the stage repeat a known mistake", "does this design rest on an uncited
  claim") must not gate a release until `/eval-validate` has calibrated that judge on hand-labelled
  runs (EVAL-CONTRACTS §5.4). Repeats per task with Wilson intervals keep one lucky run from reading
  as an improvement.
- This is also ai-eval's first real pilot: the traces are ours, so nothing waits on another team.
- **Check:** run the suite on 1.7.0 for a baseline, then on the first version with Steps 1–2; the
  repeated-mistake count must drop. If it does not, Steps 1–2 did not work and are revisited before
  anything else is added.

### Step 7: Fill P1, the knowledge gaps

Last, because P1 is the strongest pillar today, and because Steps 3 and 6 will show which gap costs
most. Each new skill follows the house rule: one skill owns the standard, one gate can fail on it,
and it ships with a broken and a valid fixture (§17). Ordered by how many projects need it.

| # | Gap (§3.1) | Deliverable | Gate | Check |
|---|---|---|---|---|
| 7.0 | Five pillars in every product | `/sdlc-intake` asks one question per pillar of the product being built (what it knows, how it learns from use, how it stays honest with users, how it is verified and kept safe, what value it gives and how that is measured); depth scales with the change class: one line each for a `fix`, a mechanism and a measure each for an `initiative`. Answers land in `problem.md ## Pillars` | G0 | G0 fails an `initiative` whose `## Pillars` has a pillar with no measure |
| 7.1 | Product ideas, competitors, value | `dev-exploring-ideas`: from `ideas.md`, feedback in Recall and named competitors, propose 2–4 options with a value hypothesis and a **kill criterion** (what result means stop) | G0 | G0 fails a problem with no kill criterion; G11 compares the real result with it |
| 7.2 | Estimation | `dev-estimating-effort`: sizes `tasks.md` from history (past `tasks.md` vs actual runs), gives a range, not a point | G6 | The range is scored against actuals in Step 6 |
| 7.3 | Prioritisation and roadmap | `ideas.md` gains value / effort / confidence columns; `/sdlc-status --roadmap` shows ranked ideas and in-flight slugs | — | Linter: every ranked row has a human `ranked_by` |
| 7.4 | AI features | `dev-designing-ai-features`: model choice, cost per call, an eval set before ship, prompt-injection and data-leak threats, fallback when the model fails | G2, G8 | G8 fails an AI feature with no eval result |
| 7.5 | Privacy | Retention, consent and deletion become an owned standard in `dev-modeling-data` | G3 | G3 fails PII with no retention period |
| 7.6 | i18n | Locale, plural and date rules in `dev-specifying-ui`; copy lint gains a hard-coded-string check | G5, G7 | Lint fixture with a hard-coded string |
| 7.7 | Web performance and SEO | Budget (LCP, bundle size) and SEO basics (titles, meta, sitemap) in `dev-specifying-ui` for public pages | G5, G8 | G8 measures the budget on the built page |
| 7.8 | Incidents → learning | `postmortem.md` template; its findings go to `## Next` (Step 3) and `/sdlc-learn` | G11 | G11 fails an incident with no postmortem |
| 7.9 | Cost after release | `post-release.md` records monthly cost vs the G2 estimate | G11 | A gap over 50 % without a reason is `MAJOR` |
| 7.10 | Product types beyond web | See Step 8 | G2, G6–G11 | Step 8 |

Not in the bundle on purpose: deep testing knowledge (that is stlc), team management and hiring.

### Step 8: Beyond web — product packs (P1, measured by P2)

Today every blueprint is a web service or a web app, and the only languages are Go, Python and
TypeScript. G0–G6 are language-neutral, so what a new kind of product needs is not new gates but a
**product pack**: the parts of the ladder that change with what ships.

| Part of a pack | Why it changes per product type | Where it plugs in |
|---|---|---|
| Blueprint | The tree of a desktop app or a dbt project is not a web tree | `dev-resolving-code-placement/blueprints/` + `layout-check.mjs` rules |
| Code skill | Idioms, error handling, threading, packaging | `dev-writing-<lang>-code` + `lib/langs.mjs` adapter (the four places in CONTRIBUTING) |
| Verify recipe | A desktop app is tested by driving its window, a pipeline by data tests | `dev-running-verification` reference file per type |
| Release and deploy | An installer, a `.vsix`, a PyPI wheel, a store build — not a container | `dev-packaging-release`, `dev-planning-deployment` reference per type |
| Operate | No SLO on a laptop: crash reports, update adoption, opt-in telemetry | `dev-designing-observability` reference per type |
| Profile row | So `DEV-PROFILE §Stacks` can name it and the checks can read it | `DEV-PROFILE.md` + `profile.mjs` |

There are many languages and many product types, and hand-writing a full pack for every pair does
not scale: ten types × ten languages is a hundred packs nobody maintains. So coverage has three
tiers, and every pair is in one of them on day one.

| Tier | What the bundle gives | How a pair gets there |
|---|---|---|
| **Generic** | Every gate runs; code placement and conventions come from the repository itself (GK `conventions.md`, `codebase-map.md`), not from a blueprint; verify, release and operate use the product type's reference file; checkers that cannot read the language say `N/A — no adapter` instead of passing silently | Automatic for any language: `langs.mjs` gains a `generic` adapter (file extensions, comment syntax, test-file pattern from the profile) |
| **Preview** | Generic, plus the product type's blueprint and references | The type's pack has landed; this language has not been proven on it |
| **Full** | Preview, plus a `dev-writing-<lang>-code` skill, a language adapter and an ai-eval score within the web baseline | Proven on a real repository (rules below) |

The developer role is not one role: each product type is its own kind of developer, with knowledge no
other type needs. Each type gets a pack; each language a `dev-writing-<lang>-code` skill; a pack and a
skill combine, so ten types and ten languages need twenty pieces, not a hundred. Every cell starts
**Generic**:

| Kind of developer | Main languages and frameworks | Knowledge only this kind needs | Release shape | What "operate" means | Today |
|---|---|---|---|---|---|
| Web frontend | TS (React, Next.js), Vue | Rendering (SSR, CSR, streaming), state, Core Web Vitals, SEO, accessibility | static or server deploy | Web Vitals in the field, errors per session | **full** (React, Next.js) |
| Web backend / API | Go, Python, Java (Spring), C# (.NET), Node, PHP, Ruby | API contracts, transactions, caching, queues, scaling | container, serverless | SLO, traces, alerts | **full** (Go, Python) |
| Desktop | TS (Electron, Tauri), C# (WPF, WinUI), Swift, C++ (Qt), Rust | Main / renderer split, IPC, signed installer, auto-update, offline | signed installer, auto-update | crash reports, update adoption | generic → 8.1 |
| Editor extension | TS (VS Code), Kotlin (JetBrains) | Activation, the extension host, no leaked resources | `.vsix`, marketplace | activation errors, install count | generic → 8.2 |
| CLI / library / SDK | Go, Rust, Python, TS, Java | Exit codes, semver, the public API, every OS | semver package, binary per OS | download count, issue rate | generic → 8.3 |
| AI / LLM | Python, TS | Prompts, evals, cost per call, fallback | as web, plus a versioned prompt and model id | eval score, cost per call, refusals | generic → 8.4 |
| Data engineer | SQL (dbt), Python (Airflow, Spark), Scala | Pipelines, freshness, backfill | scheduled job | freshness, row-count drift | generic → 8.5 |
| Mobile | TS (React Native), Dart (Flutter), Kotlin, Swift | App lifecycle, offline, push, store rules, battery and network | store build, staged rollout | crash-free rate, store rating | generic → 8.6 |
| Game | C# (Unity), C++ (Unreal), GDScript (Godot) | Frame time, the game loop, assets | store build | crash rate, frame time | generic, waits for a project |
| Embedded / IoT | C, C++, Rust | Constrained memory, firmware, OTA | firmware image, OTA | device fleet health | generic, waits for a project |

Ordered by what is actually built in this workspace, so each pack is proven on a real repository
the day it lands rather than on a toy (game and embedded wait for a real project):

| # | Pack | Proven on | Adds |
|---|---|---|---|
| 8.0 | **Generic tier** | any repo in an unsupported language (e.g. a small Java or Rust repo) | `generic` adapter in `langs.mjs`; checkers report `N/A — no adapter` instead of a silent pass; `DEV-PROFILE §Stacks` gains `product_type` and the coverage tier is printed by `/sdlc-doctor`; a **pack template** so the next pack is filled in, not designed |
| 8.1 | **Desktop (Electron)** | screen-spider, meeting-capture | `electron` blueprint (main / preload / renderer split, IPC contract as the API), signed installer and auto-update release, crash telemetry |
| 8.2 | **Editor extension (VS Code)** | vscode-sdlc, afx-router, vietlott addon | `vscode-extension` blueprint, activation and contribution points as the contract, `.vsix` packaging, extension-host rules (no listening socket left open, env leak) |
| 8.3 | **CLI and library** | cli-afx, vietlott-lab | `cli` and `library` blueprints, semver and changelog as the contract, PyPI / npm release, exit codes and `--json` output as the API |
| 8.4 | **AI / LLM application** | rag-reference-guide, recall's AI, ai-eval | Pairs with 7.4: prompt and retrieval as versioned artifacts, eval set as the G8 evidence, cost per call budget, model fallback |
| 8.5 | **Data pipeline** | dbt-elt, spack-elt | `dbt` and `python-etl` blueprints, data contracts and freshness as the SLO, data tests as verification, backfill as the migration |
| 8.6 | **Mobile** | mobilewright-automation targets | React Native first (reuses TypeScript), then Kotlin / Swift adapters when a project needs them |
| 8.7 | **Other server stacks** | on demand | Java (Spring), C# (.NET), PHP — one adapter each, added only when a real project brings it |

Rules for a pack:
- **One pack per branch**, and it is not done until `/sdlc-onboard` plus one `change`-class
  initiative has run on its proving repository and passed G6–G9.
- A pack reuses the gates; a pack that needs a new gate is a sign the gate is web-shaped and should
  be generalised instead.
- **Check:** each pack adds one ai-eval task on its proving repository (Step 6). The pack counts only
  when the score on that task is within the web baseline; until then the bundle says, in
  `DEV-PROFILE`, that the type is `preview`.

This is also the honest answer to "how confident are we outside web": not at all until a pack has a
score, and only as confident as that score afterwards.

### Step 9: Master in every role (P1, measured by P2)

Step 8 is one axis: what ships. This is the other: who decides. The bundle plays every role a
project needs, and in each it must work at principal level, not just follow the gate. Principal
level is not more checklists. It is principles with their reasons, the trade-offs between the usual
options, the anti-patterns a junior falls into, and the judgement to say when a rule does not apply.

Level today is judged from the 44 skills on 2026-10-23: **strong** (principal level in most of the
role), **fair** (most of the role, gaps named), **medium** (the gate runs, the depth is partial), **weak** (a reference file at most).

| Role | Level today | Gates it owns | Has | What principal level adds |
|---|---|---|---|---|
| Developer, per product type | strong on web | G7 | Go, Python, React, Next.js skills | The kinds of developer in Step 8; not repeated here |
| Solution architect | fair | G2 | options, ADR, cloud, threat model, diagrams | Quality-attribute scenarios (ATAM) and an NFR trade-off matrix; integration patterns (sync, events, queues, sagas, outbox); build vs buy; migration (strangler, parallel run); multi-tenancy; when *not* to split a service |
| Data (engineer, architect, principal) | medium | G3 | modelling, migrations, privacy | Data principles: one source of truth, an owner per dataset, data contracts, immutability where history matters; analytical models (dimensional, wide); quality and lineage; master data; governance scaled to size |
| Security | medium | G2, G7 | threat model, secret scan, data guard | Authentication and authorisation design (OIDC, sessions, RBAC/ABAC); secret management; supply chain (SBOM, pinning); mapping controls to GDPR or SOC 2 when a project names one |
| SRE / DevOps | medium | G9–G11 | observability, deploy, rollback, postmortem | Backup and restore with RPO/RTO proved by a restore; capacity and load planning; CI/CD design; toil budgets |
| Product manager | weak → fair | G0–G1, G11 | framing, PRD, ideas, `Kill:` | Metric trees (one north-star, input metrics); user research that a decision cites; pricing and packaging questions; launch and adoption plan |
| UX / UI | fair | G5 | design system, visuals, i18n, SEO, usability | Information architecture; accessibility beyond contrast (focus order, screen reader flows); content design |
| Business analyst | fair | G1 | requirements, behaviour exploration | Process models (BPMN); domain modelling (bounded contexts, event storming) feeding G2 |
| ML / AI engineer | weak | G2, G8 | `ai-features.md` | Folded into the AI pack (8.4): one place for prompts, evals and model cost |
| QA | — | — | — | Lives in stlc, which has its own roadmap |
| Tech lead / engineering manager | out of scope | — | — | Team management and hiring are not a bundle's job (§7) |

**A role pack** plugs into the gates it owns. It never adds a pipeline. It has five parts:

1. `principles.md` in the owning skill: 8–12 principles, each with why, and the counter-example that
   shows when it does not hold.
2. `trade-offs.md`: the recurring choices, each with the forces that decide it.
3. `anti-patterns.md`: what a junior does, how a reviewer spots it.
4. Reviewer checklist rows, through `/sdlc-improve`, each failing on a fixture.
5. Lessons tagged with the role in `applies_to`, so the architect at G2 recalls architects' lessons.

**How "master" is measured.** A claim of expertise with no exam is the knowledge §16 warns about. So
each pack ships an **exam**: 5–10 artifacts (a design, a schema, a threat model), each seeded with
one flaw a principal would catch and a junior would not, and one clean artifact. The pack counts
only when the owning reviewer finds every seeded flaw and passes the clean one. The exam is rerun on
every bundle version, so knowledge that regresses fails like code. In real projects the measure is
the owning gate's first-pass rate in `bench.mjs`, and how many defects escape it (§22).

**Order**: architect, data, security, SRE, PM, then UX and BA. Architect and data first because every
project passes G2 and G3, so every project gains the moment they land.

| # | Pack | Exam lives in | Check |
|---|---|---|---|
| 9.1 | Solution architect | `tests/exam/architect/` | G2 reviewer finds every seeded flaw |
| 9.2 | Data | `tests/exam/data/` | G3 reviewer finds every seeded flaw |
| 9.3 | Security | `tests/exam/security/` | G2 security rows find every seeded flaw |
| 9.4 | SRE | `tests/exam/sre/` | G9/G10 reviewer finds every seeded flaw |
| 9.5 | PM | `tests/exam/pm/` | G0/G1 reviewer finds every seeded flaw |
| 9.6 | UX, BA | per role | per role |

An exam the deterministic checks can grade (a missing RPO, a table with no owner) is a node test.
One that needs a reviewer's judgement is an ai-eval task, graded against the seeded answer key, so
it never depends on a model grading itself.

### 4.9 Where each step stands

| Step | Pillar | Built | Proven by tests | Waits on real use |
|---|---|---|---|---|
| 4.0 automatic loop | P2 | brief at session start and stage end, incl. unshared lessons | yes (10 tests, 14 mutants) | a project running a stage on 1.8.0 |
| 1 lessons | P2 | yes | yes | the first real `/sdlc-learn` on fx-blog or recall |
| 2 recall before work | P2 | yes | yes | that a lesson changes what the author writes (labelled runs) |
| 3 next → ideas | P2, P5 | yes | yes | a G11 on 1.8.0 |
| 4 across projects | P2 | yes | against a stand-in CLI | a live Recall server |
| 5 unverified claims | P3 | yes | yes | count of `UNVERIFIED` in real artifacts |
| 5b gate effect, guard | P4 | yes | yes | the guard inside a real Claude Code session |
| 5c value gates | P5 | yes | yes | `Kill:` lines Luan writes for open initiatives |
| 6 bench | P2 | baseline 1.7.0 | yes | `bench compare` after initiatives on 1.8.0; a labelled ai-eval judge (≥ 30 runs) |
| 7 knowledge | P1 | yes, incl. G0 row 14 (pillars), G8 SEO + a11y audit, estimates vs actuals | yes | implementers recording `Actual` |
| 8.0 coverage tiers | P1 | yes, incl. N/A from every code checker | yes | — |
| 8.1–8.4, 8.6 packs | P1 | preview: desktop, VS Code, CLI, AI, mobile — blueprint, release reference, G9 rows 22–26, exam | yes (tests, exam) | full: `/sdlc-onboard` + one `change` through G6–G9 on meeting-capture, afx-router, cli-afx, rag-reference-guide; mobile waits for an app |
| 8.5, 8.7 packs | P1 | no | — | data pipeline (dbt-elt, spack-elt are idle since August) and other server stacks wait for a real project |
| missing skills | P1 | user research (G0 19), prioritisation (G6 25), user docs (G9 21), CI/CD (G10 29), incident response (G11 25), cost after release (G11 26) | yes (tests, exam) | real artifacts at those gates |
| 9 role packs | P1 | PM, BA, architect, security, data, UX, SRE: principles files, 25 reviewer rows | yes (7 tests, 11 mutants); exam 25/25 found, 0 false alarms | first-pass rates and escaped defects at G0–G3, G5, G10 on real initiatives |

## 5. Delivery plan

One branch per step, one MR each, merged in order. Version bumps follow the change: a new command
or contract section is a minor version.

| Step | Branch | Files touched | Tests added | Version |
|---|---|---|---|---|
| 1 | `feat/sdlc-learn` | `commands/sdlc-learn.md`, `skills/dev-learning-from-work/`, `workspace/dev/_templates/learning.md`, `workspace/dev/scripts/learn.mjs`, shared `lesson-scan.mjs`, `DEV-CONTRACTS.md` §19 | `tests/learn.test.mjs` + broken/valid lesson fixtures | 1.8.0 |
| 2 | `feat/recall-before-work` | `skills/dev-stage-protocol/SKILL.md` (one step), `dev-stage-protocol/recall.md`, `agent-brief.md` | Planted-lesson fixture; `bundle.test.mjs` word cap still holds | 1.8.x |
| 3 | `feat/next-ideas` | `_templates/post-release.md` (`## Next`), `_templates/ideas.md`, `commands/sdlc-intake.md`, `dev-reviewing-monitoring` checklist row via `/sdlc-improve` | Linter fixture for `IDEA-NNN` with no evidence | 1.9.0 |
| 4 | `feat/promote-lessons` | `learn.mjs promote`, `/sdlc-learn --promote`, Recall push | Generic vs project-specific promotion fixtures | 1.9.x |
| 5 | `feat/unverified-claims` | `agent-brief.md`, reviewer checklists via `/sdlc-improve` | Uncited-claim fixture | 1.9.x |
| 5b | `feat/gate-effectiveness` | `settings.json` deny list, `_templates/post-release.md`, `commands/sdlc-status.md`, `hooks/` run audit | Denied-command fixture; escaped-defect fixture | 1.10.0 |
| 5c | `feat/value-gates` | `dev-framing-problem`, `dev-reviewing-verification`, `dev-specifying-ui`, `_templates/usability.md`, `dev-brainstorming-architecture` | Over-budget page fixture; missing kill-criterion fixture | 1.10.x |
| 6 | ai-eval `feat/sdlc-suite` | ai-eval suite + fixture repo; results to Recall | The suite itself; baseline on 1.7.0 | — |
| 7.x | one branch per row | per row in Step 7 | per row | 2.x |
| 8.0 | `feat/generic-tier` | `lib/langs.mjs`, checkers, `DEV-PROFILE.md`, `commands/sdlc-doctor.md`, `docs/pack-template.md` | A checker on an unknown language must say N/A, not pass | 2.0.0 |
| 9.x | `feat/role-<role>` per role | `principles.md`, `trade-offs.md`, `anti-patterns.md` in the owning skill; reviewer rows via `/sdlc-improve` | The role's exam: seeded flaws found, the clean artifact passed | 2.x, a minor per role |
| 8.x | `feat/pack-<type>` per pack | blueprint, code skill, verify / release / observability references, `langs.mjs`, `DEV-PROFILE` | `layout-check` and `langs` fixtures; one ai-eval task on the proving repo | 2.x, a minor per pack |

Each MR states which pillar it serves and its check (the **Check** line above); an MR whose check
cannot fail is not ready.

## 6. Carrying the criteria to the other products

| Product | P1 | P2 | P3 | P4 | P5 | First move |
|---|---|---|---|---|---|---|
| stlc | strong | lessons + recall done (§23) | partial | heal guard, lesson scan | — | Step 4 (promote) and Step 6 (benchmark) |
| recall | — | the shared store | abstention designed | redaction at the door | UI approved | Make `knowledge_search` worth calling: the RAG benchmark (DK task 2) |
| ai-eval | — | the measure itself | — | — | — | Host the Step 6 suites for sdlc and stlc |
| fx-blog | product | — | — | — | the reason it exists | The first real project run end to end on the improved bundle; P5 measured by Lighthouse and Luan's UI review until it is hosted |

## 7. What this roadmap will not do

- No vector store or embedding service in the bundle. Lessons are small files with a two-step recall;
  Recall owns search.
- No lesson an agent marks `established` on its own.
- No step that is not paid for. If Step 6 shows a step adds tokens and no fewer mistakes, it is removed.
