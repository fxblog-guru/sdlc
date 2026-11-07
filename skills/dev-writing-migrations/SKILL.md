---
name: dev-writing-migrations
description: Use when a change touches a live Postgres/MySQL schema: migration-plan.md at G3, migration files at G7, expand → migrate → contract, real rollback.
---

# Writing migrations

A migration is the only artifact in this pipeline that **cannot be rolled back by reverting a
commit.** Everything else here is text; this one runs once against data somebody depends on.

That asymmetry is the whole reason this skill exists separately from `dev-modeling-data`. The model
answers *what the data should look like*. This answers *how to get there without an outage and
without losing a row*, which is a different question with different failure modes and a much worse
worst case.

> `DEV-CONTRACTS.md` §13.5 (expand → migrate → contract), §13.4 (deployment, rollback and canary),
> §2 for paths. At G3 you write `<root>/data/<slug>/migration-plan.md` from its template; at G7 you
> write the migration files themselves, where `dev-resolving-code-placement` says they go.

## Expand → migrate → contract, and why the shortcut always looks fine

The tempting shape is one migration that renames the column and one deploy that uses the new name.
It works in every test and fails in production for a reason that has nothing to do with the
migration: **during a rolling deploy, old code and new code run at the same time.** For the minutes
that takes, one of them is talking to a schema it does not know.

So a change to a live column is three deploys, not one:

| Phase | Schema | Code | What must be true before the next phase |
|---|---|---|---|
| **Expand** | add the new column, nullable, no default backfill | writes **both**, reads the old | the new column exists everywhere; nothing reads it yet |
| **Migrate** | backfill in batches | reads the new, still writes both | backfill is complete and verified by a count, not by the job exiting 0 |
| **Contract** | drop the old column | writes and reads only the new | no code path references the old name — proven by grep, and by a release that has been live long enough to roll back from |

The contract phase is the one that gets skipped, and skipping it is how a schema accumulates
`status_old`, `status_v2` and `status_new` — three columns whose relationship nobody alive knows.
State when contract runs, in the plan, even if the answer is "the release after next".

**When you may collapse it:** a genuinely additive change to a table nothing reads yet, and only
when you can say why in one line. Write that line.

## The four questions every migration answers before it is reviewable

1. **What happens to rows that already exist?** A `NOT NULL` column added to a populated table is
   this question in its simplest form, and "there are only a few thousand rows" is not the answer —
   it is a bet on today's row count that nobody will revisit. Say the default, say the backfill, say
   what a row that cannot be backfilled becomes.
2. **How long is the lock held, and does it block writes or only DDL?** This is the number that
   turns a migration into an incident. It is engine-specific and there is no general answer, which
   is exactly why the plan must contain one.
3. **What is the rollback?** Not "revert the commit" — that reverts the code, which was never the
   problem. State what happens to data already migrated. Sometimes the honest answer is "this is
   one-way after the backfill starts", and saying so is far better than implying a safety net that
   does not exist.
4. **How will you know it worked?** A count, a checksum, a spot query with expected values. A
   migration job that exits 0 having silently skipped every row exits 0 in exactly the same way as
   one that worked.

## Postgres and MySQL are not interchangeable here

The model can be engine-agnostic. The migration cannot, and a plan written for the wrong one reads
as competent until it runs.

| | Postgres | MySQL (8.0+, InnoDB) |
|---|---|---|
| DDL in a transaction | yes — a failed migration leaves nothing half-applied | **no.** Each statement commits. A three-statement migration can leave you in a state no file describes |
| Adding a column with a default | metadata-only since 11 — fast | instant for most cases since 8.0, but `ALGORITHM=INPLACE` is not universal; state which the statement will pick |
| Creating an index | `CREATE INDEX CONCURRENTLY` — no write lock, but **cannot run inside a transaction**, and leaves an `INVALID` index if it fails | online DDL, but the table copy can still hold metadata locks behind long-running queries |
| The lock that actually bites | `ACCESS EXCLUSIVE` waiting behind a long transaction, queueing every reader behind it | the metadata lock, acquired at the end and blocked by any open transaction touching the table |
| Long-running-transaction hazard | a single `ALTER` can stall an entire table indefinitely — always set a `lock_timeout` and retry | the same, via `lock_wait_timeout` |

MySQL's lack of transactional DDL is the item to carry into the plan: **write each statement so that
re-running the migration from the top is safe**, because partial application is not a hypothetical
there, it is the default failure mode.

## Batched backfills, because the single `UPDATE` is the trap

One statement over a large table holds locks and bloats the write-ahead log for as long as it runs,
and it cannot be paused. Write the loop: a bounded batch, a stable order with a unique tiebreaker
(the same rule as §13.1 for a reason — without one a batched backfill re-reads and skips rows), a
pause between batches, and a way to resume after a stop.

State the batch size and where the number came from. "1000" with no reasoning is a guess that will
be copied into every future migration in this repository.

## At G7: the file, not the plan

The migration file matches the plan the G3 gate passed. Where it cannot — you found something the
plan did not anticipate — that is a finding and a return to G3, not a quiet divergence (§12.6).
Every migration is checked in with the code that needs it, in the same commit, so that a bisect
lands on a coherent pair.

Both directions exist as files even when `down` is a comment explaining why it cannot undo the data.
An absent `down` reads as "not needed yet"; a `down` that says "irreversible after backfill —
restore from the snapshot named in the release plan" is information.

## Do not

- **Do not answer an open `DEC-NNN` by writing the migration one way.** §15.2: an agent may never
  set `status: assumed`. Write everything the decision does not touch and mark the rest `N/A —
  blocked by DEC-NNN`.
- Do not change the model here. If the schema is wrong, that is a G3 finding against
  `dev-modeling-data`, not something to fix in passing.
- Do not add an index "while we are in here". An index is a write cost paid on every insert forever;
  it belongs to the access pattern that justifies it (§13 data standards) or it does not belong.
- Do not write a destructive statement — `DROP`, `TRUNCATE`, a `DELETE` without a bounded predicate
  — without naming, in the plan, the backup it is recoverable from and who confirmed it exists.
