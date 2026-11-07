---
name: dev-reviewing-knowledge
description: GK gate review. Use when a GK verdict is needed: judges the six knowledge cards against the checklist and writes the gate log.
---

# Reviewing GK — repository knowledge

You are judging whether these cards are **true about this repository**, not whether they are
well organised.

That is an unusual review, and it needs an unusual method: almost every check here is performed by
opening a cited file and looking, or by running a command, rather than by reading the card. A
knowledge card that reads well and is wrong is the most dangerous artifact this pipeline can
produce — every later stage will trust it, none will re-derive it, and the error will surface as a
design that is confidently wrong about the system it is designing for.

> `DEV-CONTRACTS.md` §16 is the contract for this track, §5 for the log format. You write
> `<root>/reviews/_repo/GK-knowledge-<run-id>.md` — GK belongs to the repository rather than to an
> initiative, and `_repo` is the reserved folder that keeps it off the initiative board (§16.2).
> Your log's `outputs` are the six cards, which is what makes a card edited after review turn GK
> `STALE`. You never edit a card.

## What you receive

Paths: the six cards under `<root>/knowledge/`, `DEV-PROFILE.md`, the gate-log template, the prior log
on attempt 2 — and **the repository itself**, which is the point. Your tools are `Read`, `Grep`,
`Glob` and read-only `Bash`, and you are expected to use all four.

## Applicability

> GK applies to every repository with existing source code. It is `NOT_APPLICABLE` only where
> `project_maturity: greenfield` and the repository contains no application code yet — an empty
> repository has no conventions to extract.

A greenfield project acquires code quickly. `NOT_APPLICABLE` here is a statement about today, and
the card set should be built as soon as there is something to describe.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | `grounded_at` on every card is a commit that exists in this repository |
| 2 | A sample of at least five citations across the cards was opened, and each says what the card claims |
| 3 | `codebase-map.md` accounts for every top-level source directory in the repository — nothing is silently omitted |
| 4 | Module dependency directions in the map match what the imports actually show |
| 5 | Every convention in `conventions.md` cites a real `file:line` example, and the example demonstrates the convention |
| 6 | Where the codebase is inconsistent, `conventions.md` says so and names the dominant form with a count |
| 7 | `conventions.md` describes what the code does, never what it ought to do |
| 8 | Code placement rules in `conventions.md` are specific enough for G6 to place a new file without guessing |
| 9 | `schema-as-is.md` states its source — introspected from a live database, or reconstructed from migrations and labelled as such |
| 10 | `api-as-is.md` states where the contracts came from: a served spec, the router, a gateway config |
| 11 | `test-conventions.md` gives the command to run the tests, and the card records that it was actually run, with its output |
| 12 | `known-debt.md` names what not to touch and why, with enough specificity to act on |
| 13 | No card contains a recommendation, a plan, or a judgement about what should change |
| 14 | Every card fills `## Sources and gaps`: what was read, what could not be reached and why, and what was deliberately left out |
| 15 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |

## Check 2 is the whole review

Do not sample politely. Pick the citations the later gates will lean on hardest — the error handling
convention, the layering claim in the map, the primary table in the schema card — and open each one.

Record what you found, precisely:

- `conventions.md` says errors are wrapped with context, cites `internal/api/jobs.go:88` — opened, line 88 is `return fmt.Errorf("fetch jobs: %w", err)`. **Confirms.**
- `codebase-map.md` says `internal/store` depends on nothing in `internal/api` — `grep -rn "internal/api" internal/store/` returns 0. **Confirms.**
- `schema-as-is.md` says `jobs.tenant_id` is indexed — not found in the migrations, and no database is reachable from here. **Cannot confirm; raised as CR-00N.**

Five confirmations written like that are worth more than a full read of all six cards, and they are
the only thing that distinguishes this review from proofreading.

If a citation does not say what the card claims, that is a `BLOCKER` — not because one line matters,
but because a card with one fabricated citation cannot be trusted on the ones you did not check.

## Check 7 and 13: descriptive, not prescriptive

The cards say what **is**. The moment one says what should be, later stages follow the opinion as
though it were a fact about the codebase.

| In a card | Verdict |
|---|---|
| "handlers return wrapped errors — `api/jobs.go:88`" | fine, descriptive |
| "handlers should return wrapped errors" | FAIL check 7 |
| "the repository layer is inconsistent; we should standardise on sqlc" | FAIL check 13 — the first clause belongs in the card, the second does not |
| "`internal/legacy` is mid-migration to `internal/store`; new code goes in `store`" | fine — that is a fact about an in-flight migration, in `known-debt.md` |

The last row is the subtle one. Reporting a decision the team has already made is description.
Making the decision is not.

## Check 9: why the schema card gets extra scrutiny

Migrations describe the schema someone intended to produce. The live schema is what exists —
including the hand-applied fix, the index dropped during an incident, the column someone added
directly. G3 plans migrations against this card, and a migration planned against a fiction fails at
the worst possible moment.

So the card must say which it is. "Introspected from staging on 2026-09-14 via `information_schema`"
is a `PASS`. "Reconstructed from `migrations/`, no database reachable — drift not checked" is also a
`PASS`, because it is honest and G3 now knows to verify. A card that simply presents a schema with
no stated source is a `MAJOR`: it is indistinguishable from the fiction.

## Check 14: absence is a finding about the card, not about the repo

An author who could not reach the production API should say so. If `api-as-is.md` covers four
services and the repository has six, and the card does not mention the other two, that is a `MAJOR`
— a later gate will read the card as complete and design against a system it has only two thirds of.

Check this by listing what exists and comparing: `ls` the service directories, count the routers,
compare with the card. Again: run it, do not read it.

## Severity for this gate

- `BLOCKER` — a citation that does not support its claim (check 2); `grounded_at` that is not a real
  commit (check 1). Both mean the card set cannot be trusted at all.
- `MAJOR` — a source directory missing from the map (check 3); a schema card with no stated source
  (check 9); undeclared coverage gaps (check 14); a prescription presented as a convention (check 7).
- `MINOR` — a convention with a weak example, an inconsistency noted without a count, a thin debt
  entry.
- `INFO` — an area worth a future card, a citation that could be more precise.

## Findings that are usually wrong

1. **"The map is incomplete."** Against what standard? If a top-level source directory is missing,
   that is check 3 and you can name it. If you mean it lacks depth, that is `MINOR` at most — these
   cards are a starting point that `--refresh` improves, not an encyclopaedia.
2. **"The conventions are bad."** Not your call, and not this gate's. Bad conventions honestly
   described are a `PASS`. The card's job is accuracy.
3. **Grading tidiness.** Formatting is checked by the linter (§11). Your evidence cells should be
   full of file paths and command output, not observations about phrasing.

`PASS` with zero findings happens when the cards are accurate — which, for a careful cartographer
run, is often.
