---
name: dev-modeling-data
description: Use in /sdlc-data (G3) to write data-model.md and migration-plan.md: indexes from queries, PII classified, expand → migrate → contract.
---

# Data modelling — G3

Adapted from `data-modeling` in `gitlab.com/agentic-fx/skills` @ `8556e8f`, and **bound to this
bundle** (`docs/skill-sources.md`). Upstream's eight-phase flow is kept, because the order is right:
meaning before tables, ownership before relationships, access patterns before storage. What is
replaced is how it ends — upstream writes a dated free-form document and asks the user whether the
model is ready; here it writes through the templates to the §2 paths and ends at G3's gate, judged
by `dev-reviewing-data` on a fresh context.

Two upstream phases are also re-scoped. Phase 7's "evolution and versioning strategy" is not advice
here; it is §7, a contract with a reviewer attached. And "lifecycle and state" stops at the data —
the workflow that drives the transitions was designed at G2.

> `DEV-CONTRACTS.md` §7 (the migration contract), §13.2 (the query rules an index serves), §13.6
> (PII), §13.7 (`EXPLAIN` evidence), §15.2 (unknowns). `DEV-PROFILE §Data stores` for engine,
> version and migration tool.
> An entity another system copies or reads, history that must be kept, reporting or analytics, or a load from a pipeline: read `data-principles.md` (one source of truth, owners, data contracts, quality, lineage; G3 rows 28–32).

## What you produce

`<root>/data/<slug>/data-model.md`, `<root>/data/<slug>/migration-plan.md` and `<root>/data/<slug>/limits.yaml`, copied
from `<root>/_templates/` with every section filled (§3). A section that does not apply gets
`N/A — <reason>`; a blank one fails the gate before anyone reads it.

You do **not** write the migration SQL. The plan says what each `MIG-*` does, what it locks, how
long it takes and how it reverses; the file itself is written at G7 against that plan, so that the
thing reviewed here is the thing built there.

## Model meaning first, then storage

Upstream's first instruction is the one most worth keeping: you are modelling business concepts,
not tables. An entity that exists because a screen needs it, or that is named after a technical
mechanism, will be wrong in a way no index can fix.

So `## Entities` gets a business definition per `ENT-*` — what one row *means*, in language the
person who asked for this feature would recognise — before any column appears. Then ownership: one
service is authoritative for each entity. Two services that both write a table have no owner, and
the invariant that everybody assumed somebody else enforced is enforced by nobody.

`## Relationships` states cardinality, the owning side, and the **delete behaviour** — cascade,
restrict, set null, or soft delete. Delete behaviour decided here is a design; delete behaviour
discovered in production is an incident, usually the kind where a cascade removed more than anyone
expected and the backup is four hours old.

## Access patterns before indexes

Fill `## Access patterns` first, completely: every read and write this feature performs, with its
filter, its sort, expected rows, expected frequency and a latency budget. This is the input to the
index list and it is why the template puts it above.

Then each row of `## Indexes` names the access pattern it serves.

**An index is a permanent tax on writes.** Every insert, update and delete maintains it, it competes
for the buffer pool with the queries you actually run, and on a large table it doubles the cost of
the backfill you are about to plan. An index that no access pattern needs is not a safety margin; it
is dead weight nobody will ever dare remove, because nobody will be able to prove it is unused.

Three that are usually right and usually missing:

- **The composite order is equality first, then range, then sort.** An index on `(status,
  created_at)` serves `WHERE status = ? ORDER BY created_at DESC`; one on `(created_at, status)`
  does not.
- **Every unique business rule gets a unique constraint**, not an application check. Two concurrent
  requests both pass an application check; only one survives a unique index.
- **The index that supports the sort must include the tiebreaker** (§13.1), or keyset pagination
  falls back to a sort it cannot stream.

### Evidence, not confidence

Run `EXPLAIN` (`EXPLAIN ANALYZE` on Postgres, `EXPLAIN ANALYZE` or `EXPLAIN FORMAT=JSON` on MySQL 8)
and paste the plan line that shows the index being chosen. Use the profile's read-only inspection
command to reach a database; if you cannot reach one, write `not verified — no database reachable`
in the evidence cell and say which environment would prove it.

That is an honest gap a reviewer can weigh. An invented plan is not, and the reviewer is instructed
to re-run these (§4.5).

Mark each table **large** or **small** in `## Access patterns` (large: grows with use — one row per
event, per item, per customer). G7 turns every index here into a test: the query's plan on a few
thousand generated rows with sequential scans disabled must use an index on every large table
(§13.7, `dev-writing-go-code/query-checks.md`). A table left unmarked cannot be tested.

## Nullability, defaults, and existing rows

| Decision | The question that settles it | The cost of getting it wrong |
|---|---|---|
| Nullable | Can this fact legitimately be unknown for a valid row? | A `NULL` that means "not filled in yet" is indistinguishable from one that means "genuinely none", forever, for every reader |
| Default | What does a row written by *old* code get? | A default added for new rows leaves old code writing rows without it, and the "always present" field is absent for a week's worth of data |
| Existing rows | What value do the rows already in the table get, and who writes it? | The backfill nobody planned becomes an unbounded `UPDATE` run by hand during the release call |

`NOT NULL` on a populated table is three steps, never one: add nullable → backfill in batches →
tighten. Write it as three `MIG-*` rows, because it is three deploys' worth of risk.

## Constraints belong in the database

Names, timestamps, enums and the limits catalogue follow [db-naming.md](db-naming.md).

`## Constraints and invariants` says what must always be true and where it is enforced. Prefer the
database: it is the only layer that cannot be bypassed by a script, a console session, a second
service written next year, or the one code path that forgot to call the validator.

Application-level enforcement is a legitimate choice for rules the database cannot express — but
then say so explicitly, and name the code path that owns it, so G7 has something to be reviewed
against.

## Expand → migrate → contract (§7)

The default for any change to a live schema, and the reason is rollback asymmetry: code reverts in
ninety seconds, a dropped column does not revert at all.

| Phase | What lands | What must be true before the next phase |
|---|---|---|
| **expand** | new nullable column / new table / new index, plus dual-write if the old shape is still read | old code and new code both work against this schema |
| **migrate** | backfill, chunked and resumable; reads switch to the new shape | the backfill is verified complete, by a count, not by "it finished" |
| **contract** | drop the old column, constraint or table | nothing reads it — proved by a search, in a **later release** |

`## Phase` states which of the three this release is and which release the rest land in. All three
in one release is allowed only with an argument: the table is new, or the feature has never been
switched on. Write the argument; a reviewer can accept one, and cannot accept silence.

## Migrations: one concern, one rollback, one honest lock estimate

Per `MIG-*` row:

- **One concern.** DDL and backfill never share a file (§7) — different runtimes, different locks,
  different rollbacks. A merged file can only undo half of itself.
- **Reversible.** Every `*.up.sql` has a `*.down.sql` that returns the schema to its prior state. If
  it is irreversible by nature — the data is gone — say so in `## Rollback`, raise an ADR, and note
  that the G3 log needs a human sign-off (§7).
- **Online or not.** Name the lock the statement takes, and how long it holds it **at production row
  counts**. Everything is online at ten thousand rows.
- **Backfill is chunked, throttled, checkpointed and resumable**, with a query that proves
  completion. A single unbounded `UPDATE` on a large table is a `BLOCKER`, not a preference — it
  holds a transaction open for the duration, blocks the vacuum or the purge, and cannot be stopped
  halfway without losing its progress.

`## Order of operations` states the sequence against the code deploy — what runs before the new
code, what runs with it, what runs after — including the feature-flag state at each step, because
"deploy the migration first" and "deploy the code first" are different plans with different failure
modes and only one of them is yours.

## The engine differences that actually bite

Name the engine and version in `## Engine`, from `DEV-PROFILE §Data stores`, then design for that
one. These are the differences that change the *plan*, not the syntax:

| | PostgreSQL | MySQL 8 / InnoDB |
|---|---|---|
| **DDL in a transaction** | yes — a failed migration rolls back cleanly | **no.** Each statement commits implicitly. A migration that fails halfway leaves the schema half-changed, so "rollback" is a compensating migration you have to have written |
| **Index without blocking writes** | `CREATE INDEX CONCURRENTLY` — but it cannot run inside a transaction, and it leaves an `INVALID` index behind if it fails, which must be dropped | `ALTER TABLE … ALGORITHM=INPLACE, LOCK=NONE`; where the server silently falls back to `COPY`, the table is locked for the copy. State the algorithm explicitly and let it fail loudly instead |
| **Adding a column** | `ADD COLUMN … DEFAULT <constant>` is metadata-only since 11; a volatile default rewrites the table | `ALGORITHM=INSTANT` for most adds on 8.0.12+, but the instant-column budget per table is finite and then the next one rebuilds |
| **Tightening to NOT NULL** | full table scan under `ACCESS EXCLUSIVE`, unless a validated `CHECK` lets 12+ skip it — that two-step is the safe route | rebuild unless the column already has no `NULL`s and the algorithm allows it |
| **Locks under load** | an `ACCESS EXCLUSIVE` request queues behind one long transaction and blocks **everything behind it**. Use `lock_timeout` and retry rather than waiting | metadata locks do the same thing; a long-running `SELECT` blocks the DDL and the DDL blocks every query after it |
| **Index types** | btree, partial, expression, GIN for `jsonb` and full-text, BRIN for append-only time series — a partial index is often the whole answer | btree and hash only, functional indexes from 8.0.13, no partial indexes. The Postgres design that leaned on a partial index needs a different shape here |
| **Enums** | `ALTER TYPE … ADD VALUE` is cheap; **removing a value is not possible.** A lookup table or a `CHECK` constraint is usually the better call | appending at the end can be instant; reordering or removing rebuilds the table |
| **Text** | one encoding, collation per column | charset and collation are per column and changing them rewrites the table; `utf8mb4` with a 3072-byte index key limit means a long `VARCHAR` may not be indexable in full |
| **Default isolation** | `READ COMMITTED` | `REPEATABLE READ`, with gap locks — the same `SELECT … FOR UPDATE` pattern deadlocks differently, so `## Concurrency` is engine-specific too |

A plan that would work identically on both has almost certainly not been thought about on either.

## Privacy and retention (§13.6)

Classify **every** field: `public` · `internal` · `personal` · `sensitive`. Then, for anything
personal or sensitive: the lawful basis, the retention period, the deletion mechanism, and what
"delete" actually means for backups, replicas and derived data — warehouses, caches, search indexes,
event streams. "The row is deleted" is rarely the whole answer and is never the whole answer once
there is a data warehouse.

Classification is cheap now and expensive later, because a field classified after it ships has
already been logged, exported and copied.

> The full rule set — retention per field, deletion across every store, consent, processors — is `privacy.md`; G3 fails personal data with no retention period.

## Growth, and which query degrades first

`## Growth and volume` takes rows today, growth per month, retention, and the archival or
partitioning plan. Then name **which query degrades first** as this grows, and roughly when.

That sentence is the most useful one in the document. A model that works at today's volume and has
no idea which part fails at ten times it has not been designed for the second year, and the second
year is when somebody else owns it.

## Unknowns become DEC-NNN

Retention period, maximum import size, whether historic rows may be deleted or must be archived —
these are business answers, not derivable ones (§15.2). Record `DEC-NNN` in
`<root>/decisions/<slug>.md`, design everything that does not depend on it, and mark the dependent
sections `N/A — blocked by DEC-NNN`.

**Never set `status: assumed`.** Only a named human may. Recording the question, recommending a
default and then designing to that default is the same guess with better paperwork — and the schema
is the worst place to discover one, because it is the hardest thing to change afterwards.

## Do not

Run any statement that writes. Write the migration SQL — that is G7 against this plan. Design the
API shape from the tables (G4 designs the contract, and it is not the schema with HTTP in front of
it). Set `status: approved`. Declare your own gate `SKIPPED`.
