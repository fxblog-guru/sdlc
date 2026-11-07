---
description: G3 · data model + reversible migration plan, then gate. After G2; sibling of G4 and G5.
disable-model-invocation: true
argument-hint: <slug>
---

Run G3 for `$1`. Follow `dev-stage-protocol` (invoke the skill if it is not already in context);
this file holds only what is specific to G3.

## Preflight (stage-specific)

- `DEV-PROFILE.md §Data stores` is required. A G3 run against an unnamed engine produces a schema
  that is portable, vague and wrong on both engines.
- Needs **G2** `PASS` or `SKIPPED`. G4 and G5 are siblings (§4.2), not preconditions — but if G4
  is already `PASS`, pass its contract through; it constrains the entities this model must serve.
- Brownfield: `<root>/knowledge/schema-as-is.md` must exist and be non-empty. It is introspected from
  the live database (§16.1); a model written without it models a database that does not exist.
- Decisions to surface before authoring: retention, volume limits, whether history may be deleted.

## Author

Spawn **`dev-data-architect`** with:

- `<root>/design/$1/architecture.md` and `impact.md` — read in full
- `<root>/requirements/$1/requirements.md`
- `<root>/knowledge/schema-as-is.md` and `known-debt.md`
- `<root>/api/$1/openapi.yaml`, when G4 has already run
- `<root>/_templates/{data-model,migration-plan,decisions}.md` and `limits.yaml`
- the source root, and a read-only database connection if the profile names one

It invokes `dev-modeling-data` and writes `data-model.md` and `migration-plan.md`.

State three things when you spawn it: `## Access patterns` is filled **before** `## Indexes` and
every index row names the pattern it serves; every `EXPLAIN` in the model was actually run, or is
labelled unverified with the environment that would prove it; every lock and duration estimate is
at **production row counts**, not seed volume.

## Review

Reviewing skill: **`dev-reviewing-data`** → `<root>/reviews/$1/G3-data-<run-id>.md`.

Paths: the two artifacts, the upstream design and requirements, `schema-as-is.md`, `known-debt.md`,
the standard set, the source root, and **the read-only database command** — the reviewer re-runs
an `EXPLAIN` and checks `schema-as-is.md` against the tables the model claims to extend.

## On CHANGES_REQUESTED

A migration made half-safe is `REOPENED` with the safe half described — a middle value is where a
lock that blocks production goes to be quietly downgraded. A `disputed` lock finding is legitimate;
the architect has the row counts.

## After

Report: the verdict, the `MIG-*` ids planned, any `DEC-NNN` opened, and what unlocks next. G6 needs
G3, G4 and G5 each `PASS` or `SKIPPED`; say which of the remaining two this change needs.

## Refuse (stage-specific)

- To run a migration, a backfill, or any statement that writes. G3 plans; G7 writes the SQL; G8
  proves the `up → down → up` round-trip (§7).
- To let the architect edit `architecture.md` (turns G2 `STALE`) or `schema-as-is.md` (GK's
  output; editing it hides the drift G3 exists to notice, §16.2).
- To accept "expand, migrate and contract all in this release" without the argument that goes
  with it. It is sometimes right — a new table, a flag never switched on — and the reviewer can
  only accept an argument that was made.
