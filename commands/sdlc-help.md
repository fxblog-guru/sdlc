---
description: The /sdlc-* command map and where to start.
disable-model-invocation: true
argument-hint:
---

Print this map, then one line on where the person is (from `node <root>/scripts/status.mjs --brief`)
and what to run next. Keep your own words to that one line.

```
agentic-fx-dev — a gated development pipeline. Every stage writes an artifact, an
independent reviewer judges it, and the next stage will not run without a PASS.

  first time in a repo
    /sdlc-doctor                      is the install healthy? (script — cannot hallucinate)
    /sdlc-onboard                     GK  build <root>/knowledge/ from the code that exists
    /sdlc-onboard --refresh               rebuild only the cards whose cited files changed
    /sdlc-design-system [<preset>]        the look, decided once: tokens · kit · page patterns
                                          (a named human chooses; G5 stops until it exists)

  the ladder  (which gates run depends on the change class declared at intake)
    /sdlc-intake <slug> [--class initiative|change|fix|refactor|spike|fast]
                                      G0  the problem, framed — not a solution
    /sdlc-requirements <slug> [--clarify]
                                      G1  PRD · REQ-NNN · acceptance criteria
                                          (--clarify: up to 5 gap questions, one at a time)
    /sdlc-design <slug>               G2  architecture · impact · ADR · threat model
    /sdlc-data <slug>                 G3  data model · migration plan
    /sdlc-api <slug>                  G4  API contract · breaking-change diff
    /sdlc-ui <slug>                   G5  UI spec — every screen, every state
    /sdlc-plan <slug>                 G6  TASK-NNN, ordered by risk
    /sdlc-implement <slug> [TASK-NNN] G7  code + unit + integration tests, same commit
    /sdlc-verify <slug>               G8  build · lint · types · coverage · scans · migration round-trip
    /sdlc-release <slug>                 G9  branch · commits · PR · handoff to agentic-fx-qa
    /sdlc-deploy <slug> <env>         G10 rollout strategy · migration order · rollback
    /sdlc-monitor <slug>              G11 SLOs · dashboards · alerts · runbook · post-release

  around the ladder
    /sdlc-status [<slug>]             the gate board, and the next command
    /sdlc-ask <slug>                  every open DEC-NNN — the questions only a human can answer
    /sdlc-gate <slug> <G> [--reaffirm] re-run one review; --reaffirm judges only the input diff
    /sdlc-debug <symptom>             incidents — deliberately outside the gates
    /sdlc-refactor <target>           behaviour-preserving change, reviewed at G7 standards
    /sdlc-fast <slug>                 G0 · G1 · the look, then usable slices on a deploying skeleton
    /sdlc-review-pr <n | branch>      review a teammate's PR/MR (GitLab or GitHub) → APPROVE / REQUEST CHANGES
    /sdlc-learn [<slug>|--audit]      turn repeated review signals into lessons later stages recall
                                      ideas.mjs list — what the last releases said to build next
    /sdlc-security [repo|pipeline|ai|<slug>]  white-box audit: scanners + an attacker's read → SEC-NNN ledger
    /sdlc-improve <G> "<check>"       turn a post-release lesson into a reviewer checklist row
    /sdlc-feedback "<what happened>"  file friction with the BUNDLE itself to the maintainer (Recall)
    /sdlc-help                        this map

  the three rules people trip on
    · a gate log is written by the REVIEWER, never the author — and the reviewer never edits
    · editing an approved artifact makes its gate STALE, and everything downstream with it
    · SKIPPED is declared by the reviewer or a named human, with a typed reason — never by the author

  reference   DEV-PROFILE.md (your settings)  ·  DEV-CONTRACTS.md (the rules)  ·  <root>/DASHBOARD.md
```
