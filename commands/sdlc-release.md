---
description: G9 · branch, commits, PR as submitted, qa-handoff.md, then gate. After G8; every change class.
disable-model-invocation: true
argument-hint: <slug>
---

Run G9 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G9.

## Preflight (stage-specific)

- `DEV-PROFILE.md`: no placeholder in `§Delivery`, `§Quality gates` or `§Testing ownership` — the
  branch convention, the gate thresholds and the tier boundary all bind this stage.
- Needs **G8** `PASS` or `SKIPPED`, run at the SHA this release ships: code changed after the run is
  `BLOCKED` until G8 runs again — or the change waits for the next release (§18.7).
- **Re-read the G8 log's quality-gate rows.** This command refuses to open a PR while any is red,
  unless the G8 log carries a written waiver with a human's name — and then the PR body must name
  the gate and the waiver.
- G9 runs for **every** change class (§15.1). Do not offer to skip it for a `fix`.
- Any `DEC-NNN` still `open` that the shipped behaviour depends on, or `assumed` without a named
  human, is a `MAJOR` waiting at the gate (§15.2) — surface it now.
- Read `DEV-PROFILE §Project` for `tracker.provider`. With an adapter, the key is written back and
  the PR linked after the gate passes (§14). With none, degrade to the slug and say so.

## Author

Spawn **`dev-release-engineer`** with:

- `<root>/requirements/$1/requirements.md` and `acceptance-criteria.md` — **read in full**; every
  `REQ-NNN` and every criterion has to cross into the handoff intact
- `<root>/implementation/$1/change-summary.md`
- `<root>/verification/$1/runs/<run-id>/verify.md` and the G7 and G8 gate logs
- `<root>/api/$1/contract-diff.md` and the contract, and `<root>/data/$1/migration-plan.md`, where they exist
- `<root>/_templates/{pull-request,qa-handoff,decisions}.md`
- the repository, so it can inspect the branch and the commits
- the CI pipeline for the shipped commit: each gate G8 deferred to CI needs its job's pass (§5.6)

It invokes `dev-packaging-release` and writes `<root>/release/$1/pull-request.md` and
`<root>/release/$1/qa-handoff.md`.

State four things when you spawn it: the PR body in the repository is **the text actually
submitted** — the gate hashes that file; a diff that touches a migration, a schema file, a contract
or an event schema states `## Rollout and rollback`, and `node <root>/scripts/deploy-plan-check.mjs $1`
exits 0 (a basic change writes `deploy_impact: none`; a migration that changes existing rows adds
`### Data`); every `REQ-NNN` and acceptance criterion crosses into the
handoff **verbatim**, verified by grep both ways; the automation-tier list is the **complement** of
what this bundle tested — the QA bundle's entire input, and §9 makes it the only channel.

## Review

Reviewing skill: **`dev-reviewing-release`** → `<root>/reviews/$1/G9-release-<run-id>.md`.

Paths: the two release artifacts, the upstream requirements and acceptance criteria,
`change-summary.md`, the G7 and G8 logs, `verify.md`, the contract and migration plan where they
exist, the standard set, and **the repository** — the reviewer counts `REQ-NNN` coverage with
`grep`, confirms the shipped SHA is on the branch, reads the commit messages, and compares the
stored PR body with what was submitted. Never pass the author's account of why a gate was waived.

## On CHANGES_REQUESTED

A missing acceptance criterion is almost never a documentation fix. If it did not cross because
nothing tests it and nobody owns it, the fix is to put it in the automation-tier list — not to
delete the row so the counts match.

## After

Report: the verdict, the branch and PR, the automation-tier criterion count handed over, and what
unlocks next. Where an adapter is installed, write the key back and link the PR (§14).

Say plainly that the QA bundle starts from `/qa-analyze $1 <root>/release/$1/qa-handoff.md`, and
that this bundle does not run `/qa-*` commands or write under `qa/` (§9). For class `change` and `fix`, G10 and G11
are `SKIPPED` by class — say which gates remain rather than implying the ladder continues.

## Refuse (stage-specific)

- To open a PR while a quality gate is red with no written, named waiver in the G8 log.
- To merge the PR, deploy, or run a migration. This gate submits; humans and G10 do the rest.
- To let the release engineer edit `requirements.md` or `acceptance-criteria.md` so the coverage
  comes out even (turns G1 `STALE`, §4.4).
