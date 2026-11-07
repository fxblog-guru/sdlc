---
description: G4 · API contract + breaking-change diff, then gate. After G2; sibling of G3 and G5.
disable-model-invocation: true
argument-hint: <slug>
---

Run G4 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G4.

## Preflight (stage-specific)

- `DEV-PROFILE.md §API surface` is required: the style decides whether the artifact is
  `openapi.yaml` or `<service>.proto`, and the versioning and auth rows are checked at review.
- Needs **G2** `PASS` or `SKIPPED`.
- Brownfield: `<root>/knowledge/api-as-is.md` must exist and be non-empty. `contract-diff.md` is
  diffed against it (§16.1) — against what is deployed, not the spec file in the repository.
- Decisions to surface before authoring: rate limits, page-size ceilings, deprecation windows. A
  contract written to an agent's own default gets generated into clients, and then it is true.
- List the existing ADRs in `<root>/design/adr/` and pass them through — versioning and
  last-write-wins both live in ADRs.

## Author

Spawn **`dev-api-designer`** with:

- `<root>/requirements/$1/requirements.md` and `acceptance-criteria.md` — read in full
- `<root>/design/$1/architecture.md` and `impact.md`
- `<root>/knowledge/api-as-is.md` and `known-debt.md`
- `<root>/data/$1/data-model.md`, when G3 has already run
- every existing `<root>/design/adr/ADR-*.md`
- `<root>/_templates/api-contract.yaml`, `problems.yaml`, `<root>/_templates/{contract-diff,decisions}.md`
- the source root, so it can search for existing consumers of the fields it changes

It invokes `dev-designing-api` and writes `openapi.yaml` (or `<service>.proto`),
`problems.yaml` and `contract-diff.md`; `problems-check.mjs`, `api-style-check.mjs`,
`api-contract-check.mjs` and `contract-compat.mjs` (or `oasdiff breaking`) run with the validator.

State three things when you spawn it: the contract must **validate**, and the validator command
and exit status come back in the handback; `contract-diff.md` is computed against `api-as-is.md`,
not the previous draft; consumer claims in `## Consumers` are searched for, not asserted — "no
client uses it" needs a count. Where G3 has run, say plainly that the contract is **not** the
schema with HTTP in front of it.

## Review

Reviewing skill: **`dev-reviewing-api`** → `<root>/reviews/$1/G4-api-<run-id>.md`.

Paths: the contract, `problems.yaml`, `contract-diff.md`, the upstream requirements and design, `api-as-is.md`,
`known-debt.md`, the existing ADRs, the standard set, and **the source root** — the reviewer
validates the contract with a real command, counts paginated collections against total
collections, and greps for consumers of a removed field. Never pass the designer's own
breaking-change assessment; the diff is the thing being checked. The reviewer scores the log with
`api-score.mjs` (§13.12) and writes the verdict the score maps to.

## On CHANGES_REQUESTED

A breaking change given a deprecation note but no `Sunset` date is `REOPENED`, not partially
resolved. The finding most likely to be `disputed` is a breaking-change classification, and that
dispute is worth having in writing — a future incident review will want to read it.

## After

Report: the verdict, the breaking changes with their version and sunset date, any `DEC-NNN`
opened, and what unlocks next. G6 needs G3, G4 and G5 each `PASS` or `SKIPPED`; say which of the
remaining two this change needs. A breaking change is the one output of this gate that somebody
outside this repository has to act on — put it in the last line.

## Refuse (stage-specific)

- To let the designer edit `<root>/knowledge/api-as-is.md` (GK's output, §16.2).
- To accept a breaking change without all four parts: the row in `contract-diff.md`, an ADR, a
  version or deprecation window with a date and a `Sunset` header, and the `MAJOR` acknowledgement
  in the G4 log (§6). Three of four is a surprise with paperwork.
- To let a contract change be made later during implementation. It comes back through
  `/sdlc-api` and re-runs this gate (§6); if G7 discovers a breaking change, implementation stops.
