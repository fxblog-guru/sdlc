# agentic-fx-dev — flows

Seven diagrams, from the whole ladder down to a single hash. Read them in order: each one zooms
into something the previous one drew as a single box. Authority for every rule shown here is
[`DEV-CONTRACTS.md`](../DEV-CONTRACTS.md) — if a diagram and the contract disagree, the contract is right.

---

## 1. The ladder — twelve stages, twelve gates

```
   COMMAND                 ARTIFACTS (under <root>/)                    GATE REVIEW              UNLOCKS
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ G0  /sdlc-intake         intake/<slug>/problem.md                  reviewing-intake          G1   │
│                                                                                                   │
│ G1  /sdlc-requirements   requirements/<slug>/prd.md                reviewing-requirements    G2   │
│                          requirements/<slug>/requirements.md                                      │
│                          requirements/<slug>/acceptance-criteria.md                               │
│                                                                                                   │
│ G2  /sdlc-design         design/<slug>/architecture.md             reviewing-architecture  G3·G4·G5
│                          design/<slug>/threat-model.md                                            │
│                          design/adr/ADR-NNN-*.md                                                  │
└───────────────────────────────────────┬───────────────────────────────────────────────────────────┘
                    ┌──────────────────┼──────────────────┐        siblings: any order, or parallel
                    ▼                  ▼                  ▼
   G3 /sdlc-data          G4 /sdlc-api            G5 /sdlc-ui
   data/<slug>/           api/<slug>/             ui/<slug>/
     data-model.md          openapi.yaml            ui-spec.md
     migration-plan.md      contract-diff.md
   reviewing-data         reviewing-api           reviewing-ui
                    └──────────────────┼──────────────────┘
                                       ▼   all three PASS or SKIPPED
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ G6  /sdlc-plan           plan/<slug>/tasks.md  (TASK-NNN)          reviewing-plan            G7   │
│                                                                                                   │
│ G7  /sdlc-implement      <repo>/…  production code + unit +        reviewing-implementation G8   │
│                          integration tests                                                        │
│                          implementation/<slug>/change-summary.md                                  │
│                                                                                                   │
│ G8  /sdlc-verify         verification/<slug>/runs/<run-id>/        reviewing-verification    G9   │
│                            verify.md · coverage.md · logs/                                        │
│                                                                                                   │
│ G9  /sdlc-release           branch · commits · PR                     reviewing-release        G10   │
│                          release/<slug>/pull-request.md                                           │
│                          release/<slug>/qa-handoff.md ──────────────────▶ agentic-fx-qa           │
│                                                                                                   │
│ G10 /sdlc-deploy         deployment/<slug>/release-plan.md         reviewing-deployment     G11   │
│                          deployment/<slug>/runs/<run-id>/deploy-run.md                            │
│                                                                                                   │
│ G11 /sdlc-monitor        monitoring/<slug>/observability.md        reviewing-monitoring      —    │
│                          monitoring/<slug>/runbook.md                                             │
│                          monitoring/<slug>/post-release.md                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

  outside the ladder:  /sdlc-status  /sdlc-gate [--reaffirm]  /sdlc-doctor  /sdlc-onboard
                       /sdlc-design-system (once per repo, before the first G5 — G5 preflight requires it)
                       /sdlc-debug (incidents — deliberately gate-free)  /sdlc-refactor  /sdlc-help
```

Observability is not only G11: it is **designed at G2** (candidate SLOs in `architecture.md`),
**built at G7** (log events, metrics, spans as tasks), and **proved at G11** against real traffic.
A feature arriving at G11 with no telemetry is a `BLOCKER`, not a follow-up ticket.

---

## 2. One stage, in Claude Code primitives

Taking `/sdlc-design job-assignment`. Every stage is this same shape.

```
 USER            MAIN AGENT                  AUTHOR SUBAGENT        REVIEWER SUBAGENT      DISK + HOOKS
   │          (command file injected)        (fresh context)         (fresh context)
   │
   │ /sdlc-design <slug>
   ├──────────────▶│
                   │
                   │ ① PREFLIGHT  — no subagent, no tokens wasted
                   │   read DEV-PROFILE.md   → required sections filled?
                   │   read <root>/state.json       → slug known?
                   │   G1 state == PASS|SKIPPED? → and not STALE?
                   │   ✗ ─────────────▶ STOP: print what is missing + the command that fixes it
                   │
                   │ ② Agent(dev-solution-architect)
                   ├──────────────────────────────▶│
                   │   passes: slug · template     │ Skill(dev-brainstorming-architecture)
                   │   paths · upstream paths      │ Skill(dev-detailing-design)
                   │   · profile                   │ Skill(dev-modeling-threats)
                   │                               │
                   │                               │ Write architecture.md ─────────────────▶│
                   │                               │                                         │ ⚡ PostToolUse
                   │                               │                                         │   lint-dev.mjs --file
                   │                               │◀── error: heading mismatch / placeholder ┤   (syntax only)
                   │                               │ fix ───────────────────────────────────▶│
                   │                               │ Write threat-model.md, ADR-004 ────────▶│
                   │◀──────────────────────────────┤ returns: paths written + open questions
                   │
                   │ ③ Agent(dev-gate-reviewer)
                   ├───────────────────────────────────────────────────▶│
                   │   passes: PATHS ONLY — artifacts + upstream        │ Skill(dev-reviewing-design)
                   │   ✗ never: pasted content, the author's summary,   │
                   │            transcript, or self-assessment          │ reads artifacts from disk
                   │                                                    │ computes sha256 of each body
                   │                                                    │ walks its published checklist
                   │                                                    │ Write reviews/<slug>/          ──▶│
                   │                                                    │   G2-design-<run-id>.md           │
                   │                                                    │ ✗ may NOT edit the artifacts      │
                   │◀───────────────────────────────────────────────────┤ returns: verdict + finding count
                   │
                   │ ④ RESOLVE
                   │   PASS ─────────────▶ ⑤
                   │   SKIPPED ──────────▶ ⑤        (only the reviewer may declare it)
                   │   CHANGES_REQUESTED ─▶ back to ② with structured findings — see diagram 4
                   │   BLOCKED ──────────▶ STOP: name who must act and what unblocks it
                   │
                   │ ⑤ node <root>/scripts/build-state.mjs ──────────────────────────────────────▶│
                   │      state.json + DASHBOARD.md regenerated                                 │
   │◀──────────────┤ report: verdict · findings · the next command                              │
   │                                                                          ⚡ Stop hook ──────┤
   │                                                                            build-state.mjs again,
   │                                                                            so an interrupted run
   │                                                                            can never leave state stale
```

**Why two subagents instead of one agent doing both.** An agent that writes and then reviews its own
work produces a predictable artefact: a confident checklist where every row passes. The reviewer is
given the artifacts and the upstream inputs and nothing else, so it has to establish whether the
document stands on its own — which is the only version of review worth the tokens.

**Why the reviewer cannot edit.** If it fixes what it finds, nobody sees the finding, the authoring
skill never improves, and the gate log becomes a receipt instead of a record.

---

## 3. Gate state machine

`build-state.mjs` derives this from the gate logs and the hashes. No state is ever set by hand.

```
                      upstream gates PASS|SKIPPED
   NOT_STARTED ──────────────────────────────────▶ READY
                                                     │  /sdlc-<stage> starts
                                                     ▼
                                                 AUTHORING ──── artifacts written ───▶ REVIEWING
                                                     ▲                                     │
                                                     │                                     │
                              attempt + 1 (max 2) ───┴───── CHANGES_REQUESTED ◀────────────┤
                                                                                           │
                                         BLOCKED ◀────────────────────────────────────────┤
                                            │  (precondition supplied by a human)          │
                                            └──▶ READY                                     │
                                                                                           │
                        ┌──────────────────────────────────────────────────────────────────┤
                        ▼                                                                  ▼
                      PASS                                                             SKIPPED
                        │                                                                  │
                        └────────────────┬─────────────────────────────────────────────────┘
                                         │  an input or output hash changed (diagram 5)
                                         ▼
                                       STALE
                                         │
                       ┌─────────────────┴──────────────────┐
                       ▼                                    ▼
             /sdlc-<stage>  (full re-run)      /sdlc-gate <G> --reaffirm
                       │                        reviewer sees ONLY the input diff
                       ▼                        and answers: does the verdict still hold?
                   REVIEWING                              │
                                                 ┌────────┴────────┐
                                                 ▼                 ▼
                                               PASS            declines →  REVIEWING
                                        (revalidated_from:              (full re-review)
                                         <prior log>)
```

Only `PASS` and `SKIPPED` unlock the next stage. Everything else stops the ladder — including
`STALE`, which is the state that makes "we approved this" mean "we approved *this version* of this".

---

## 4. The CHANGES_REQUESTED loop — closed, per finding

```
  ATTEMPT 1                                                       gate log #1
  ─────────                                                       ───────────
  reviewer ──▶ finds problems ──▶ writes STRUCTURED findings ──▶  verdict: CHANGES_REQUESTED
                                   ┌──────────────────────────┐   findings: {major:1, minor:2}
                                   │ CR-001 MAJOR             │
                                   │   location: …:42         │
                                   │   problem:  …            │
                                   │   evidence: …            │
                                   │   required: …            │
                                   │ CR-002 MINOR …           │
                                   │ CR-003 MINOR …           │
                                   └────────────┬─────────────┘
                                                │ passed to the author as ITEMS, not prose
                                                ▼
  author ──▶ acts on each id ──▶ returns a RESOLUTION MAP
                                   CR-001 → fixed     (what changed, where)
                                   CR-002 → accepted  (changed as asked)
                                   CR-003 → disputed  (why the finding is wrong)
                                   ── silence on any id is itself a violation ──
                                                │
  ATTEMPT 2                                     ▼                  gate log #2  (a NEW file)
  ─────────                          reviewer verifies EACH id     ───────────
                                   CR-001 → RESOLVED   evidence: …:44
                                   CR-002 → RESOLVED   evidence: …:81
                                   CR-003 → REOPENED   (dispute rejected, with reason)
                                                │
                                                ▼
                              any BLOCKER/MAJOR still open?  ──yes──▶ STOP, ask the human
                                                │ no                   (attempt 3 is never run —
                                                ▼                       a third round means the
                                              PASS                      disagreement is not about
                                                                        the artifact)
```

Logs are never edited. Attempt 2 writes a second file, so the record of what was wrong survives
alongside the eventual `PASS` — which is most of what makes the audit trail worth keeping.

---

## 5. Hashes, staleness, and the damping valve

Each gate log records a hash per **output** it produced and per **input** it consumed. Hashes cover
the artifact **body only** — front matter is excluded, because `updated:` changes on every touch and
`status: approved` is written by the review itself; hashing them would make every gate stale the
instant it passed.

```
   requirements.md ──[A]──┐
                          ├──▶  G2 log  { inputs: [A], outputs: [B, C, D] }  verdict PASS
       (G1 outputs)       │              ▲
                          │              │
   architecture.md ──[B]──┤              │
   threat-model.md ──[C]──┤              │
   ADR-004.md      ──[D]──┘              │
                                         │
   ┌─────────────────────────────────────┴──────────────────────────────────────┐
   │ build-state.mjs recomputes every hash on every run                          │
   │                                                                             │
   │   output hash ≠ log  →  the reviewed document is not the one on disk        │
   │   input  hash ≠ log  →  the decision was made against different facts       │
   │   either one         →  STALE, and every gate downstream goes STALE too     │
   └─────────────────────────────────────────────────────────────────────────────┘

   Someone fixes a typo in requirements.md:

     G1 ✓     G2 STALE ──▶ G3 STALE ──▶ G4 STALE ──▶ G5 STALE ──▶ G6 STALE ──▶ … G11 STALE
                  │
                  │  correct, but blunt — a typo should not cost eleven re-reviews
                  ▼
     /sdlc-gate <slug> G2 --reaffirm
                  │
                  │  the reviewer is handed ONLY the diff of the changed input
                  │  and one question: does your prior verdict still hold?
                  │
          ┌───────┴────────┐
          ▼                ▼
   yes → new log      no → declines, the stage re-runs in full
   verdict PASS            (a substantive change is not a typo, and the
   revalidated_from:        reviewer may never reaffirm a diff it did not read)
     <prior log>
```

---

## 6. From markdown to every consumer

```
      SOURCE OF TRUTH                        DERIVED READ MODEL              CONSUMERS
   ┌──────────────────────┐
   │ <root>/**/*.md          │                                             ┌──▶ /sdlc-status   (terminal)
   │   artifacts          │   ┌────────────────────┐                    │
   │ <root>/reviews/*.md     │──▶│ build-state.mjs    │──▶ <root>/state.json ─┼──▶ DASHBOARD.md   (markdown)
   │   gate logs          │   │  · walks the logs  │    { schema        │
   │ openapi.yaml, …      │   │  · recomputes hash │      generator_ver │──▶ CI             (fail on red)
   └──────────────────────┘   │  · derives state   │      generated_at  │
              ▲               │    (diagram 3)     │      source_hash   │──▶ vscode-sdlc    (later —
              │               └────────────────────┘      initiatives } │    a viewer with zero rules)
              │                                                          │
              │  if these two ever disagree, the MARKDOWN is right.      │
              │  state.json is regenerated; it is never authoritative,   │
              │  never hand-edited, and `source_hash` is what makes a    │
              │  stale or edited copy detectable instead of believed.    │
              └──────────────────────────────────────────────────────────┘

   triggers:  every /sdlc-* command (step ⑤)  ·  the Stop hook  ·  npm run dev:state  ·  CI
```

---

## 7. Where this bundle stops, and QA begins

```
        agentic-fx-dev  (/sdlc-*)                    │        agentic-fx-qa  (/qa-*)
   ─────────────────────────────────────────────────┼──────────────────────────────────────────
    writes: production code, <root>/**                 │   writes: qa/** only
    owns:   unit + integration tests                │   owns:   test cases · e2e · performance
            (same commit as the code they prove)    │           security · a11y · mobile
                                                    │
    G9 ──▶ release/<slug>/qa-handoff.md ────────────┼──────────▶ /qa-analyze
              ├ REQ table + priorities              │
              ├ acceptance criteria + what proved   │   never edits production code or <root>/**
              │   each of them                      │
              ├ AUTOMATION-TIER CRITERIA ◀──────────┼── the part that earns this document:
              │   what is observable only by        │   behaviours this bundle deliberately did
              │   running the real product          │   NOT cover with unit or integration tests
              ├ API contract + data model paths     │
              ├ shipped commit SHA                  │   a silent gap in that list is exactly how
              └ risk areas, in the implementer's    │   a regression ships with everything green
                own words                           │
                                                    │
    ✗ never writes qa/**, never calls a /qa-*       │   ✗ never edits src/ or <root>/**
```

Both bundles install into the same `.claude/` directory and coexist by construction: `/sdlc-*` vs
`/qa-*`, `dev-` skill prefix vs unprefixed, `DEV-PROFILE.md` sections that do not overlap. The
installer records which files each bundle owns, so `afx uninstall --bundle dev` removes exactly
this one.
