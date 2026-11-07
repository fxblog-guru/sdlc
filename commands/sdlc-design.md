---
description: G2 · architecture, impact, ADRs, threat model, then gate. After G1.
disable-model-invocation: true
argument-hint: <slug>
---

Run G2 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G2.

## Preflight (stage-specific)

- Needs **G1** `PASS` or `SKIPPED`.
- Brownfield: `<root>/knowledge/` must be populated — §16.4 turns four brownfield obligations into
  G2 gate conditions, and all four need the cards.
- List the existing `<root>/design/adr/ADR-*.md` and pass them through. A design that contradicts a
  live ADR without superseding it in writing is a `BLOCKER` (§16.4), and the author cannot
  supersede what it has not seen.

## Author

Spawn **`dev-solution-architect`** with:

- `<root>/requirements/$1/requirements.md` and `acceptance-criteria.md` — read in full
- `<root>/requirements/$1/prd.md`
- `<root>/knowledge/codebase-map.md`, `conventions.md`, `known-debt.md`, and `schema-as-is.md` /
  `api-as-is.md` where the change touches them
- every existing `<root>/design/adr/ADR-*.md`
- `<root>/_templates/{architecture,impact,threat-model,adr,decisions}.md`
- the source root, so it can actually search it
- `<root>/_templates/topology.yaml` and `DEV-PROFILE §Cloud` when the change runs on a cloud (§13.14)

It invokes `dev-brainstorming-architecture`, `dev-detailing-design`, `dev-mapping-impact` and
`dev-modeling-threats`, and writes `architecture.md`, `impact.md`, `threat-model.md` and any
`ADR-NNN-<kebab-title>.md`. When the change runs on a cloud it also invokes `dev-designing-cloud`
and writes `deployment/$1/topology.yaml`.

For a `spike` (§15.1), the author runs the experiment on `spike/$1` and writes only the ADR that
answers `problem.md`'s question, with the evidence; no architecture, impact or threat model.

State two things when you spawn it: `impact.md` carries the **searches it ran**, not the
conclusions; and the design maps **every** `REQ-NNN` to a component, verified by grep.

## Review

Reviewing skill: **`dev-reviewing-design`** → `<root>/reviews/$1/G2-design-<run-id>.md`.

Paths: the four artifacts (and `topology.yaml` with `diagrams/$1/cloud/` where it exists), the upstream requirements and PRD, the knowledge cards, the existing
ADRs, `<root>/decisions/$1.md`, and **the source root** — the reviewer spot-checks `impact.md` with
`grep` and counts `REQ-NNN` coverage, and can do neither without the code.

## On CHANGES_REQUESTED

An architecture finding is the one most likely to be `disputed` rather than `fixed`, and that is
legitimate — the architect may be right. Record the reasoning; the reviewer verifies it like any
other finding.

## After

Report: the verdict, the ADRs created or superseded, any `DEC-NNN` opened, and what unlocks next.

G3, G4 and G5 are siblings — all depend on G2, none on each other (§4.2). Say which of them this
change actually needs, and that they can run in any order or together.

## Refuse (stage-specific)

- To let the architect edit `requirements.md`. A requirement the design cannot satisfy is a
  finding, and the edit turns G1 `STALE` (§4.4).
- To let the design pre-empt its own `SKIPPED` determination for G3–G5 (§5.4).
- To accept a threat model whose mitigations cannot be built. If you can see it before spawning
  the reviewer, say so — the round costs a model run either way.
