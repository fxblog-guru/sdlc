---
template_for: schema-as-is
gate: GK
authored_by: dev-analysing-source
reviewed_by: dev-reviewing-knowledge
---

<!--
The live schema, introspected from a real database rather than inferred from the migration
history. The two differ more often than anyone expects — a hotfix applied by hand, a migration that
half-ran, an index someone added in production. G3 designs against this card, so what it describes
must be what the database actually contains.

Record the introspection command and the environment. A schema card with no provenance cannot be
trusted, and cannot be refreshed.
-->

---
stage: knowledge
artifact: schema-as-is
status: draft
authored_by: dev-analysing-source
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Provenance

<Engine and version, the environment introspected, the command used, and the migration version it reported. Without this the card is a rumour.>

## Tables

<One row per table: what a row means, approximate size, and growth. Size decides which changes are safe to run online.>

| Table | Rows (approx) | Growth | One row is | Owner module |
|---|---|---|---|---|

## Key columns and constraints

<Primary keys, foreign keys, unique constraints, check constraints, and the columns whose nullability carries business meaning.>

## Indexes

<Every index, the queries it serves, and whether it is used — from `pg_stat_user_indexes` or equivalent. Unused indexes are write cost with no reader.>

| Index | Table | Columns | Serves | Used |
|---|---|---|---|---|

## Migration state

<The tool in use, the current version, and anything applied outside it. A schema that drifted from its migrations is a fact G3 needs before planning the next one.>

## Hazards

<Large tables where DDL locks matter, columns with implicit-conversion traps, enums that are painful to extend, anything that has bitten before.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
