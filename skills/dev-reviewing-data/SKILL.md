---
name: dev-reviewing-data
description: G3 gate review. Use for its verdict: judges data-model.md and migration-plan.md against the checklist and writes the gate log.
---

# Reviewing G3 — data

You are judging whether this schema can be **deployed on a Tuesday afternoon**.

Not whether it is elegant, not whether it is third normal form. Whether the migrations in it can run
against a live database with traffic on it, and whether the shape they leave behind can be changed
again next quarter without another outage. Data is the only part of a system that cannot be rolled
back, so this is the gate where "we will fix it later" stops being true.

> `DEV-CONTRACTS.md` §5 (log format), §7 (the migration contract), §6 (the breaking-change rule for
> schema), §13.2 (the query rules an index serves), §13.6 (PII), §13.7 (`EXPLAIN` evidence), §15.2
> (the decision ledger). You write `<root>/reviews/<slug>/G3-data-<run-id>.md` and nothing else.

## What you receive

Paths: `data/<slug>/data-model.md` and `migration-plan.md`, the upstream
`requirements/<slug>/requirements.md`, `design/<slug>/architecture.md` and `impact.md`,
`<root>/knowledge/schema-as-is.md` and `known-debt.md`, `<root>/decisions/<slug>.md`, `DEV-PROFILE.md`,
the gate-log template, the source root, and the prior log on attempt 2.

Read `schema-as-is.md` and the requirements **before** the data model. A model you read first will
look internally consistent, because it was written to be — the question is whether it is consistent
with the database that exists, and you cannot ask that from memory.

## Applicability

> G3 applies to any change that alters persistent state: a new table, a new column, a changed type,
> a new or removed index, a changed constraint, a new retention or deletion rule, or a change to how
> existing rows are interpreted. A change that only reads existing data, in a shape that already
> exists, does not require G3.

For class `initiative`, G3 runs. For class `change`, it runs whenever the change touches persistent
state — that judgement is yours, and `NOT_APPLICABLE` requires you to quote the rule above and say
which part of it this change fails to meet (§5.4). For class `fix`, G3 is skipped at intake by
class. For a `fast` slug, G3 runs only when a slice escalates it, and judges that slice's
`migration-plan.md` in full; `data-model.md` rows are `N/A` unless the plan changes a table it
describes.

The trap runs the other way here. A `fix` that arrives carrying a migration is not a `fix`: §15.1
says a class is a claim and claims are checked, and a one-line defect that quietly ships a schema
change is exactly the change that needed this gate. Say so, and say the class is wrong.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Every `ENT-*` and every field traces to a `REQ-NNN`, and every requirement that stores data has an entity |
| 2 | The engine and version are named from `DEV-PROFILE §Data stores`, and the design is specific to that engine rather than portable-and-vague |
| 3 | `knowledge/schema-as-is.md` was read and cited: every table this change touches appears with its current columns, indexes and row count (§16.1) |
| 4 | Every access pattern is stated with its filter, sort, expected rows, frequency and latency budget — and appears before the index list |
| 5 | Every index is justified by a named access pattern, and no index exists that no access pattern needs |
| 6 | Every filtered or sorted query on a growing table has a supporting index named in the model (§13.2) |
| 7 | Every index carries `EXPLAIN` evidence that the planner chooses it, or an explicit statement that it could not be verified and where it would be |
| 8 | Nullability is decided per column with a business reason; no column is nullable because the value is not known yet |
| 9 | Every new column states its default and what **existing rows** receive, and who writes that value |
| 10 | Every unique business rule is enforced by a database constraint, not only by application code |
| 11 | Relationship cardinality, the owning side, and the delete behaviour are stated per relationship |
| 12 | Any change to a live schema follows expand → migrate → contract, with the phase of this release and the release each remaining phase lands in (§7) |
| 13 | Every `ENT-*` change has a `MIG-*`, and every `MIG-*` has a `down` returning the prior state — or, where irreversible, an ADR and a human sign-off recorded in this log (§6, §7) |
| 14 | Every `MIG-*` changes one concern; DDL and backfill are never in the same file (§7) |
| 15 | Every `MIG-*` states its lock behaviour at production row counts and whether it is online for the named engine |
| 16 | Every `MIG-*` states its rollback command, its duration, the data that cannot be recovered, and the point after which rollback is forward-only |
| 17 | Backfills are chunked, throttled, resumable and verified by a count; no unbounded `UPDATE` on a populated table |
| 18 | The order of operations against the code deploy is explicit, including the feature-flag state at each step |
| 19 | The compatibility window is stated: what old code and new code can each read and write while both are running |
| 20 | Every field is classified `public` / `internal` / `personal` / `sensitive`, and every personal or sensitive field has a retention period and a deletion mechanism covering backups and derived data (§13.6) |
| 21 | Growth, retention and **which query degrades first** are stated with numbers |
| 22 | Concurrency is addressed: isolation level, locking strategy, the hot rows, and how lost updates are prevented |
| 23 | Unknowns are recorded as `DEC-NNN` and left unresolved: no section is written to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 24 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 25 | Every constraint and index is named `{table}_{cols}_{pk\|fk\|uq\|ck\|idx}`, every table has `created_at timestamptz not null default now()` and `updated_at` (or is marked append-only), enums are named CHECKs, and every limit is one `limits.yaml` entry; `schema-lint.mjs` over the existing migrations shows no new finding the plan introduces (§13.2, §13.11) |
| 26 | Every content hash or fingerprint the model stores excludes volatile fields — line numbers, commit shas, timestamps, ordering — and no id is renumbered when rows are added or removed |
| 27 | Every personal or sensitive field has a purpose, a retention period with the job that enforces it, and a deletion path that reaches every copy (`dev-modeling-data/privacy.md`) |
| 28 | Every fact has one writable source; a copy names its source and staleness bound; one attribute writable in two stores fails (`data-principles.md`) |
| 29 | Every table or dataset names its owner, and data another system reads is behind a contract (view, API or versioned export) with a change policy; direct reads of our tables fail (`data-principles.md`) |
| 30 | History that matters (audit, billing, approval, legal) is appended or versioned, never updated in place (`data-principles.md`) |
| 31 | Data loaded by an import or pipeline has quality checks where it enters (not-null, unique, accepted values, freshness) and a plan for a failing row; reporting models state their grain (`data-principles.md`) |
| 32 | Keys are stable surrogates, never a value a person can change (email, name); timestamps are UTC instants and say whether they are event or load time (`data-principles.md`) |

## Check 3: run it, do not read it

`schema-as-is.md` is introspected from the live database (§16.1). The data model claims to extend
certain tables. Test the claim rather than believing it:

- Grep `schema-as-is.md` for each table the model touches. Does it exist? Does it have the columns
  the model assumes?
- Does the model add an index the table **already has**? That happens constantly, because the author
  read the migration folder and the migration folder is not the database.
- Does the model add a column that already exists under a different name? Check `known-debt.md` for
  a mid-migration table before you accept a design that adds a third variant of the same field.

In a brownfield repo, a data model that touches an existing table and cites `schema-as-is.md`
nowhere fails check 3 outright, however plausible it reads. That is not pedantry about citations: a
design written without the live schema in front of it is a design for a different database, and
nobody will notice until the migration fails at the point it acquires a lock.

## Check 7: the EXPLAIN is the check

This is the row that separates a reviewed data model from a plausible one, and it is the row a
reading reviewer skips because the index list *looks* obviously right.

If you can reach a database — the profile names a read-only inspection command — run the access
pattern's query with `EXPLAIN` and read the plan. Then put the plan line in your evidence cell.

What you are looking for:

| Symptom in the plan | What it means |
|---|---|
| sequential / full table scan on the filtered column | the index does not exist, or its column order is wrong |
| the index is used but the sort is not | the sort key, including the tiebreaker, is not in the index — pagination will not stream |
| a filter applied after the index, not by it | leading column mismatch; the composite order is equality, then range, then sort |
| an index the model does not list | somebody added it by hand; `schema-as-is.md` should have caught this |

If you cannot reach a database, the row is **not** `PASS` on reasoning. It is `FAIL` with "cannot
verify read-only" when the model claims verified evidence it does not have, and `PASS` when the
model itself states honestly that it is unverified and names the environment that would prove it.
The distinction matters: the second is a known gap carried into G8, the first is a fabricated one.

## Checks 15 and 17: lock and backfill, at real volume

Two questions, asked of every `MIG-*`, and both have engine-specific answers you can check against
`DEV-PROFILE §Data stores`:

**Does it lock?** On Postgres, does an `ALTER TABLE` take `ACCESS EXCLUSIVE` and queue every query
behind it — and is there a `lock_timeout`? Is `CREATE INDEX CONCURRENTLY` used, and does the plan
know it cannot run inside a transaction and leaves an invalid index behind on failure? On MySQL, is
the `ALGORITHM` stated explicitly, so a silent fallback to `COPY` fails loudly instead of locking
the table for the duration? And is the plan aware that **MySQL DDL is not transactional**, so a
failure halfway leaves the schema half-changed and "rollback" means a compensating migration that
has to already exist?

**Does the backfill end?** Multiply. A plan that says "backfill 40 million rows" and does not say
the batch size, the pause between batches, the checkpoint column, or how it resumes after being
killed has not been run — it has been imagined. A single unbounded `UPDATE` there is a `BLOCKER`:
it holds one transaction open for the whole run, blocks vacuum or purge behind it, and loses all
its progress when somebody stops it at 40%.

An estimated duration with no stated row count is not an estimate. Ask for the number.

## Check 12: the exception you should accept

Expand → migrate → contract in one release is not automatically wrong. A table nothing reads yet, or
a feature behind a flag that has never been switched on, genuinely has no compatibility window to
protect.

What makes it acceptable is that the plan **says which of those it is**. Accept a stated argument;
you can check it — grep the source root for reads of the column. Do not accept the absence of one,
because the failure mode is identical from the outside and only one of them was decided.

## Check 23: the quiet version of guessing

An agent that invents a retention period is easy to catch. The version that gets through looks like
diligence: `DEC-001` is recorded, a default is recommended, and the schema is then designed to that
default with a note nobody reads at G7.

The result is a column, a partition scheme and a purge job built on an answer no human gave, while
the ledger still shows the question open. And the schema is the worst place for it, because by the
time anyone asks, the data has been written in that shape for months.

The remedy is not "mark it assumed" — `assumed` needs a named human (§15.2), and an agent that sets
it has answered the question in the one format designed to look like it did not. The remedy is
`N/A — blocked by DEC-NNN` on the dependent section, with everything independent designed in full.

Severity is `MAJOR`: the design is not wrong, it is **unauthorised**.

## Severity for this gate

- `BLOCKER` — an unbounded `UPDATE` or an index build that locks a large table with no online path
  (checks 15, 17); a migration with no `down` and no ADR (check 13); a destructive change in the
  same release as the code that stopped using the column (check 12); personal data with no retention
  rule (check 20); a design built on a table that does not exist as described (check 3).
- `MAJOR` — an index with no access pattern or an access pattern with no index (checks 5, 6); a
  fabricated `EXPLAIN` (check 7); a `NOT NULL` added in one step on a populated table (check 9); a
  business-unique rule left to application code (check 10); an unstated delete behaviour (check 11);
  a section written to an open decision (check 23); no compatibility window where two versions will
  run (check 19).
- `MINOR` — a thin growth section, a classification that is defensible but unargued, a naming
  inconsistency against the conventions card or §13.2 (check 25), a limit missing from `limits.yaml`.
- `INFO` — a denormalisation worth revisiting, a partitioning option for later, an index that could
  be partial on Postgres.

## Findings that are usually wrong

1. **"This should be normalised further."** Normal form is not a requirement; correctness and the
   access patterns are. If the denormalisation creates an update anomaly, name the two places the
   same fact is written and which one wins. If you cannot, it is `INFO`.
2. **"Add an index on this column."** You are asking for a permanent write cost. Name the access
   pattern it serves, from the model's own table. If no access pattern needs it, your finding is the
   opposite one — and if a pattern does need it, cite the row, which makes it a real check-6 `MAJOR`.
3. **"Use UUIDs / use bigints / use a different id strategy."** Only a finding when it breaks
   something the model claims — insertion locality on a hot table, an index size that will not fit,
   an id the API promised was opaque. Otherwise it is taste, and the schema is not yours.
4. **"The migration will be slow."** Slow is not a severity. Slow *while holding a lock that blocks
   traffic* is. Say which lock, on which statement, for how long — and if you cannot, ask for the
   number rather than asserting one.
5. **Rewriting the schema in your finding.** State what is wrong and what must be true. Writing the
   replacement DDL is authoring, and you may not author (§4.5).

`PASS` with zero findings is the correct outcome for a data model whose indexes were derived and
whose migrations were rehearsed.
