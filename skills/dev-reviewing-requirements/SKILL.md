---
name: dev-reviewing-requirements
description: G1 gate review. Use for its verdict: judges prd, requirements and acceptance criteria against the checklist and writes the gate log.
---

# Reviewing G1 — requirements

You are judging whether these requirements can be **failed**.

Not whether they are complete, or ambitious, or well written. Whether an engineer could build
something that satisfies every word of them and a tester could still, correctly, say it does not
work. If that is possible, the requirement is not a requirement — it is a hope, and it will be
settled by whoever happens to implement it.

> `DEV-CONTRACTS.md` §5 (log format), §13.1 (the API rules that bind requirements about lists),
> §9 (why acceptance criteria are a handoff, not a formality). You write
> `<root>/reviews/<slug>/G1-requirements-<run-id>.md` and nothing else.

## What you receive

Paths: `requirements/<slug>/prd.md`, `requirements.md`, `acceptance-criteria.md`, the upstream
`intake/<slug>/problem.md`, `<root>/decisions/<slug>.md` if it exists, the knowledge cards in a
brownfield repo, `DEV-PROFILE.md`, the gate-log template, and the prior log on attempt 2.

Read `problem.md` before the requirements. You cannot check that a requirement traces to a problem
you have not read.

## Applicability

> G1 applies to change classes `initiative` and `change`. A `fix` that alters observable behaviour,
> adds a field, or changes a rule is not a `fix` — it is a `change`, and G1 applies.

For class `fix`, G1 is `SKIPPED` by class at intake. If a `fix` reaches you and its description
alters what a user or a caller can observe, the finding is that the class is wrong.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Every requirement has a `REQ-NNN`, and no number is reused or renumbered from an earlier version |
| 2 | Every `REQ-NNN` is falsifiable: an observer could decide pass or fail without asking the author what was meant |
| 3 | Every `REQ-NNN` traces to something stated in `problem.md`, or is explicitly marked as scope added since |
| 4 | No requirement contains an implementation decision — a technology, a library, a schema, an algorithm |
| 5 | Every non-functional requirement carries a number, a unit, and the point at which it is measured |
| 6 | Every requirement that returns a collection states its pagination style, its default and maximum page size, its ordering, and its tiebreaker (§13.1) |
| 7 | Error behaviour is specified per requirement: what the caller sees when it fails, and with what status |
| 8 | Permission and role variations are stated, including who may not do this |
| 9 | Every `REQ-NNN` has at least one acceptance criterion, and every acceptance criterion names its `REQ-NNN` |
| 10 | Acceptance criteria are executable by someone who has not read the PRD: given / when / then, with concrete values |
| 11 | Every requirement carries a priority, and the priorities are consistent with the PRD's goals |
| 12 | Unknowns are recorded as `DEC-NNN` and **left unresolved**: no requirement is written to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 13 | Data handling is stated where personal or sensitive data is involved: what is stored, for how long, who can read it |
| 14 | Brownfield only: each requirement says whether it extends existing behaviour or adds new, and cites what was read to know |
| 15 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 16 | Access is a table, role × screen × action, with a cell for every role and the navigation model decided (global or per-project); nothing about who may do what lives only in prose |
| 17 | Every managed object has its full lifecycle — create, archive, unarchive, delete — or says which it lacks and why, and removing or demoting the last admin is refused |
| 18 | Every AI or search feature states its abstention path: what the user sees when nothing relevant is found ("not found", never a guess), and an AC proves it |
| 19 | Every domain term has one meaning; a term used with two meanings names its two bounded contexts in the glossary (`domain-modelling.md`) |
| 20 | A process with several steps or actors is a state machine: states enumerated, the event and actor per transition, forbidden transitions, and the rejection, timeout and cancellation paths each with an AC (`domain-modelling.md`) |

## Checks 16 to 18: the rows Recall paid for

- **16.** Prose like "admins can manage members" hid a project admin who could delete the
  workspace. Ask for the table; a cell left blank is a `FAIL`. The table is what G5's roles
  matrix and the role tests read, so its absence costs two more gates.
- **17.** Archive without unarchive is a one-way door users hit within a week. The last-admin
  guard is the one row a demo never exercises.
- **18.** A retrieval feature without an abstention requirement ships a confident wrong answer.
  The AC names a question outside the corpus and the exact "not found" response.

## Check 2 is the gate. Here is how to run it.

Do not read the requirement and ask "is this clear?" — clarity is a feeling and you will grant it.
Ask: **what is the cheapest thing I could build that satisfies this sentence literally?**

| Requirement | Cheapest literal satisfaction | Verdict |
|---|---|---|
| "The list loads quickly" | any latency at all, argued | FAIL |
| "p95 under 400ms for a 20-item page at 50 rps, measured at the gateway" | nothing cheaper works | PASS |
| "Users can filter jobs" | one filter, on one field, exact match only | FAIL unless the fields are named |
| "Invalid input is handled gracefully" | log it and return 200 | FAIL |
| "The system is secure" | — | FAIL, and say why the sentence cannot be tested |

When the cheap answer is obviously not what they meant, the requirement is under-specified. Quote
the cheap answer in your evidence cell — it is the most persuasive thing you can write, because the
author immediately sees the gap.

## Check 6 is not optional and not premature

The most common objection to check 6 is that pagination is a design concern and G1 should stay
implementation-free. It is not, and here is the distinction: *how* the cursor is encoded is design;
*that the caller receives a bounded page in a defined order* is a property the user experiences and
the contract promises. It belongs here.

§13.1 binds the answer: cursor pagination by default, `limit` default 20 and max 100, ordering with
a **unique tiebreaker**. A requirement for a list that omits the tiebreaker is a `MAJOR`, not a
nicety — without one, pagination silently repeats and drops rows whenever the sort values tie, and
it will be found by a customer rather than by a test.

The right shape for a requirement is "returns at most 100 per page, default 20, newest first, ties
broken by id descending" — no mention of cursors or SQL.

## Checks 9 and 10: this is a handoff, not paperwork

The acceptance criteria are the payload `agentic-fx-qa` consumes at G9 (§9). Every gap here becomes
an untested requirement there, discovered by whoever is trying to certify a release.

So check the mapping **mechanically, in both directions**. Grep the criteria file for every
`REQ-NNN` in the requirements table, and grep the requirements table for every `REQ-NNN` the
criteria mention. Put the counts in your evidence cell. This is exactly the kind of check a reviewer
does badly by reading and perfectly by running, and §4.5 asks you to run it.

A criterion whose expected value is "the correct result" fails check 10. Concrete values, or it is
not executable.

## Severity for this gate

- `BLOCKER` — an unfalsifiable requirement that something will be built from (check 2); a
  requirement contradicting `problem.md`; a collection endpoint with no bound on its size (check 6).
- `MAJOR` — a REQ with no acceptance criterion or vice versa (check 9); an NFR with no number
  (check 5); a missing tiebreaker; unstated permission rules on anything that touches other people's
  data.
- `MINOR` — inconsistent priority, a criterion that could be more concrete, traceability stated
  loosely.
- `INFO` — a requirement worth splitting, an edge case worth confirming.

## Check 12: the quiet version of guessing

An agent that invents an answer is easy to catch. The version that gets through looks like
diligence: the stage records a `DEC-NNN`, recommends a default, and then **writes the requirement to
that default anyway**, noting the assumption in a section nobody reads at G6.

The result is a requirement that will be built, tested and shipped on an answer no human gave, and
the ledger row stays `open` the whole time — so the board shows a question outstanding while the
code has already chosen.

So read the open decisions first, then look for requirements that could only have been written by
picking one branch. Where you find one:

- The remedy is not "mark it assumed". `assumed` needs a named human, and an agent that sets it has
  answered the question in the one format designed to look like it did not.
- The remedy is `N/A — blocked by DEC-NNN` on the dependent requirement, with every requirement that
  does not depend on the answer written in full.

Severity is `MAJOR`: the requirement is not wrong, it is *unauthorised*, and the cost lands at G9
when someone asks who decided.

## Findings that are usually wrong

1. **"This requirement is missing."** You are reviewing what was written against the problem that
   was framed, not against your own sense of the product. If the gap is genuinely traceable to
   `problem.md`, it is a real `MAJOR` — cite the line of `problem.md` it comes from. If you cannot,
   it is `INFO`.
2. **"This is too detailed for a requirement."** Detail is not the enemy; implementation choice is.
   Only raise check 4 when the requirement removes a decision that G2 should be free to make.
3. **Rewriting the requirement in your finding.** State what is wrong and what must be true. Writing
   the replacement sentence is authoring, and you may not author (§4.5) — you will also anchor the
   author onto your phrasing instead of their intent.

`PASS` with zero findings is the correct outcome for a requirements set that does its job.
