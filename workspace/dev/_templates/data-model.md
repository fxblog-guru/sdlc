---
template_for: data-model
gate: G3
authored_by: dev-modeling-data
reviewed_by: dev-reviewing-data
---

<!--
Schema mistakes are the most expensive kind, because data outlives every service that touches it
and a wrong shape has to be migrated under load, with users watching.

Two sections do the real work. "Access patterns" comes before "Indexes" on purpose: indexes are
derived from how the data is read, and an index list written without the queries in front of you is
guesswork. "Growth" is what turns a design that works on seed data into one that works at year three.
-->

---
slug: <slug>
stage: data
artifact: data-model
status: draft
authored_by: dev-modeling-data
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Engine

<Which store from DEV-PROFILE §Data stores, version, and why this data belongs there rather than in another store already in the system.>

## Entities

<One block per entity. ENT ids are referenced from the API schema and from tasks.>

| Id | Entity | Table | Purpose | Owner service |
|---|---|---|---|---|
| ENT-<NAME> | <name> | <table_name> | <what one row means> | <service> |

## Fields

<Per entity: every column with its type, nullability, default, and constraint. Nullability is a business decision — "nullable because we don't know yet" is how a column becomes permanently untrustworthy.>

| Entity | Column | Type | Null | Default | Constraint | Classification | Notes |
|---|---|---|---|---|---|---|---|
| ENT-<NAME> | <col> | <engine type> | <no/yes> | <…> | <PK/FK/unique/check> | <public/internal/personal/sensitive> | <…> |

## Relationships

<Cardinality, the owning side, and the delete behaviour (cascade, restrict, set null, soft delete), with the crow's-foot ER diagram as a mermaid block (dev-drawing-diagrams catalogue §6). Delete behaviour decided here rather than discovered in production.>

## Access patterns

<Every read and write this feature performs: the query, its filters and sort, expected rows returned, expected frequency, and the latency budget. This is the input to the index list below.>

| # | Operation | Filter / sort | Rows | Frequency | Budget |
|---|---|---|---|---|---|

## Indexes

<One row per index, each justified by an access pattern above. Include the EXPLAIN evidence that it is used. An index with no matching access pattern is dead weight on every write.>

| Index | Columns | Type | Serves | Unique | EXPLAIN evidence |
|---|---|---|---|---|---|

## Constraints and invariants

<What must always be true, and where it is enforced — database constraint, application check, or both. Prefer the database: it is the only layer that cannot be bypassed.>

## Growth and volume

<Rows today, growth per month, retention, and the archival or partitioning plan. State which queries degrade first as this grows.>

## Concurrency

<Expected contention, isolation level, locking strategy, and how lost updates are prevented. Name the hot rows.>

## Privacy and retention

<Personal and sensitive fields, the lawful basis, retention period, deletion mechanism, and what "delete" means for backups and derived data.>

## Migration impact

<What changes for existing data and existing code. Detail lives in migration-plan.md; this section states the blast radius.>

## Alternatives considered

<Other shapes considered — denormalisation, a different store, an event log — and why this one won.>
