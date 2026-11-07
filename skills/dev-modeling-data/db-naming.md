# DB naming and the limits catalogue (§13.2, §13.11)

`schema-lint.mjs` checks the migrations against this file; `limits-check.mjs` checks every layer
against `limits.yaml`. Both run at G3 on the migration plan's SQL and again at G7.

## Names

| Object | Name | Example |
|---|---|---|
| table | singular snake_case noun | `release`, `release_link` |
| primary key | `{table}_{cols}_pk` | `release_id_pk` |
| foreign key | `{table}_{cols}_fk` | `release_project_id_fk` |
| unique constraint | `{table}_{cols}_uq` | `release_project_id_name_uq` |
| check | `{table}_{col}[_{what}]_ck` | `release_name_ck`, `release_name_len_ck` |
| index (unique or not) | `{table}_{cols}_idx` — the leading columns are enough | `release_project_id_created_at_idx` |

Every constraint is declared `CONSTRAINT <name> …`. An inline `id uuid PRIMARY KEY` or `REFERENCES x`
gets a server-chosen name (`release_pkey`, `release_project_id_fkey`), and a later migration that
must drop it has to guess.

A unique rule is a `UNIQUE` constraint (`_uq`) when it is on plain columns, and a unique index
(`_idx`) only when it needs an expression or a `WHERE`; the suffix says which, so a reader knows
whether `ALTER TABLE … DROP CONSTRAINT` or `DROP INDEX` removes it.

## Columns every table has

```sql
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),   -- every table whose rows are updated
version    integer     NOT NULL DEFAULT 1,       -- where the contract says x-concurrency: if-match
```

A table whose rows are never updated says so in a comment directly above `CREATE TABLE`:
`-- Append-only: rows are never updated.` A domain verb column (`posted_at`, `decided_at`) is in
addition to `created_at`, not instead of it: `created_at` is the one column every audit query,
retention job and backfill can rely on without reading the model.

## Enums

A fixed list is a named `CHECK (col IN ('a', 'b'))` on a `text` column — one migration to extend,
visible in `\d`, and comparable with the openapi `enum`. Never `CREATE TYPE … AS ENUM`: adding a
value cannot run in a transaction on older engines and removing one needs a type rebuild. A list
users edit at runtime is a lookup table with a foreign key, not an enum.

## limits.yaml

Every length, size and count the model constrains goes in `<root>/data/<slug>/limits.yaml`, copied
from `<root>/_templates/limits.yaml`, one entry per limit with its `ref`. Write the `match` lists for
the layers that exist; G4 and G7 add theirs as the contract and the code arrive. Two limits that
share a constant name (`MaxReason` 500 and 2000) are two entries with two names — the catalogue is
what tells them apart, and an entry is what keeps `quoted_text <= 501` from drifting past the
500 the requirement states.
