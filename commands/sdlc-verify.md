---
description: G8 · run the quality gates at a named commit, raw logs, coverage per changed module, then gate. After G7.
disable-model-invocation: true
argument-hint: <slug>
---

Run G8 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G8.

## Preflight (stage-specific)

- `DEV-PROFILE.md §Quality gates` **must be filled in**. A `<placeholder>` command there is a
  project setup error, not a gate to skip.
- Needs **G7 `PASS`**. `SKIPPED` is not a route here: a slug with code has a G7 verdict. A `STALE`
  G7 stops the stage — verifying unreviewed code produces a green log for work nobody checked.
- Confirm the working tree is clean (`git status --porcelain`) and record the commit SHA. A run on
  a dirty tree describes a state that will never exist again; the honest verdict is `BLOCKED`.
- A `STALE` G8 re-runs; it never reaffirms. The evidence is about a revision that no longer exists.
- Note which optional gates this change needs: a migration round-trip only where there is a
  migration (§7), the volume performance run wherever the contract carries `x-perf` budgets (§13.7). They are
  `N/A` **with a reason** in the sheet, never absent from it.

## Author

Spawn **`dev-verifier`** with:

- `DEV-PROFILE.md` — `§Quality gates` is the list it runs and the thresholds it measures against
- `<root>/implementation/$1/change-summary.md` and `<root>/plan/$1/tasks.md`
- `<root>/requirements/$1/acceptance-criteria.md` — for the coverage-of-criteria list the handoff needs
- `<root>/data/$1/migration-plan.md`, where there is one
- `<root>/ui/$1/ui-spec.md` and its `visual_reference`, where there is one, for the `ui-snap` run (§13.3)
- `<root>/knowledge/test-conventions.md`
- `<root>/design/$1/threat-model.md` and the preview URL (§13.6)
- `<root>/_templates/{verify,coverage}.md`
- the source root, the commit SHA and the merge base against the PR target

It invokes `dev-running-verification` and writes `<root>/verification/$1/runs/<run-id>/verify.md`,
`coverage.md` and `logs/<gate>.txt` per gate. It has no `Edit` tool on purpose: a red gate returns
to G7.

State three things when you spawn it: **raw output is written verbatim, never summarised**;
**coverage is measured per changed module**, from the diff against the merge base — a repo-wide
percentage hides a new module with none; **a flaky test is a finding, not a retry** — recorded by
name with both runs.

## Review

Reviewing skill: **`dev-reviewing-verification`** →
`<root>/reviews/$1/G8-verification-<run-id>.md`, listing both artifacts and the log files under
`outputs:`.

Paths: `verify.md`, `coverage.md`, the whole `logs/` directory, `change-summary.md`, `tasks.md`,
`acceptance-criteria.md`, `migration-plan.md` where there is one, the standard set, and **the
source root at the verified commit**. The reviewer **re-runs at least one gate itself** and
compares exit code, test counts and skipped list against the log. Nothing from the verifier's
handback.

## On CHANGES_REQUESTED

| The finding is about | Route |
|---|---|
| the **run** — a missing log, coverage measured repo-wide, a flaky test retried to green, an untriaged scan finding, a gate absent from the sheet | re-spawn `dev-verifier` for attempt 2, same run-id, each `CR-NNN` by id |
| the **code** — a failing test that is a real defect, a module with no tests, a test that cannot fail | G7 re-opens. Stop this stage; re-running the gates produces the same red |

On `BLOCKED` the remedy is a **new run-id**, not attempt 2. A third G8 review since the last `PASS` needs the human's `round_decision` (§4.3).

## After

Report: the verdict, the gates that failed or were `NOT RUN`, the changed modules below threshold,
and that `/sdlc-release $1` is next. A `Visual` row awaiting approval goes to the requester through
`/sdlc-ask`, with the `compare.html` path; only their answer turns it `PASS`. The raw logs are part of the `<root>/` commit; an uncommitted
log is a claim again.

Say what G8 did **not** cover: the automation-tier acceptance criteria in `verify.md` are the QA
bundle's input, handed over in the packet G9 writes (§9). Functional certification, e2e,
performance, security and accessibility testing belong to `agentic-fx-qa`.

## Refuse (stage-specific)

- To run the gates yourself, or let anything in this stage edit code, a test or an upstream
  artifact. A verifier that fixes the import has certified unreviewed code in the same context.
- To re-run a failing test hoping for a different answer, or accept a run that did. Quarantine is a
  human decision with a ticket and an owner.
- To relax a threshold in `DEV-PROFILE`, report one as met by rounding, or accept a `PASS` on a
  gate whose log is missing or empty.
- To accept a summarised log. The raw output is the artifact (§2).
