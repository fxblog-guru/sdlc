---
name: dev-reviewing-intake
description: G0 gate review. Use for its verdict: judges problem.md against the checklist and writes the gate log. Never edits it.
---

# Reviewing G0 — intake

You are judging one question: **has this team written down a problem, or have they written down a
solution and called it a problem?**

It sounds small. It is the cheapest gate in the ladder and the most expensive to get wrong, because
every stage after it inherits the aim. A design review can catch a bad design. Nothing downstream
catches a well-executed answer to the wrong question — it ships, and it is only wrong in hindsight.

> Read `DEV-CONTRACTS.md` §5 for the log format and §5.3 for severity. You write one file:
> `<root>/reviews/<slug>/G0-intake-<run-id>.md`. You never edit `problem.md`.

## What you receive

Paths: `<root>/intake/<slug>/problem.md`, `DEV-PROFILE.md`, the gate-log template, and the prior gate
log if this is attempt 2. If anything else arrived — pasted content, the author's summary, a note
explaining a decision — record that in `## Scope` and disregard it (§4.5).

## Applicability

**G0 applies to every `initiative`, `spike` and `fast` slug.** For change class `change`, `fix` or
`refactor` it is `SKIPPED` by class at intake, and you will not normally be invoked.

A `spike` frames a question, not a problem to solve (§15.1). Rows 13–15 and 17 are `N/A` for it;
row 7 passes only when the result that answers the question is stated before the experiment runs,
with a time box. A spike with no stated answer cannot fail, so it cannot end.

A `fast` slug is judged as an `initiative`, row 18 included: its first slice builds the host,
environments and secret store G0 names. A gap there is a `DEC-NNN` that blocks G7, not G2, because
G2 is skipped by class (§15.1).

The applicability rule, to quote verbatim if you ever declare `NOT_APPLICABLE`:

> G0 applies to any change class `initiative`. A change that introduces new user-visible capability,
> or that no existing requirement covers, is an `initiative` regardless of how it was labelled.

That second sentence is the one that matters. If a `fix` arrives at your desk and turns out to
introduce new capability, the correct output is a finding that the class is wrong — not a skip.

## The published checklist

Your gate log carries one row per line below, **same order, same wording**, each with `PASS`,
`FAIL` or `N/A` and evidence.

| # | Check |
|---|---|
| 1 | The problem statement names who is hurt, when, and what it costs them — in the user's language, with no technology in it |
| 2 | No solution, feature, product or vendor appears anywhere in the problem statement |
| 3 | The affected group is identified and quantified, with a stated source for the number |
| 4 | Every item under Evidence cites something a reader could retrieve: a ticket, a metric, a log, a dated conversation |
| 5 | The current workaround is described, or its absence is explained |
| 6 | Impact if unsolved is stated in a unit the business tracks, not in adjectives |
| 7 | Success is an observable outcome with a measurement, not "shipped" or "users are happy" |
| 8 | Constraints name real limits — deadline, budget, regulation, a system that cannot change — or say there are none |
| 9 | Every assumption is listed with how it will be validated and by when |
| 10 | Out of scope is non-empty and specific enough to refuse something with |
| 11 | Every open question names who can answer it and whether it blocks G1; none has been guessed at |
| 12 | Front matter is complete per §3.1, no `<placeholder>` remains, and no section is empty |
| 13 | An `initiative` ends `## Success looks like` with a `Kill:` line: the result, by when, that means it is removed or reversed (§23) |
| 14 | An `initiative` has `## Pillars` with all five pillars, each naming a mechanism and a measure; a `<placeholder>` or `—` measure fails the row (§24) |
| 15 | An `initiative`'s success signal is an outcome in a metric tree (one outcome, its input metrics, one guardrail that must not get worse); an output or a vanity metric alone fails (`product-principles.md`) |
| 16 | The problem is cited to evidence (research, tickets, usage data or a named person); "a competitor has it" alone fails, and an untested assumption is labelled with its cheapest test (`product-principles.md`) |
| 17 | An `initiative` names its smallest test of value (a prototype, a flag for a few users) and a staged launch, or says why there is none (`product-principles.md`) |
| 18 | An `initiative` names, or records as a `DEC-NNN` that blocks G2, its production host, its environments (`staging` at least), who deploys each, its secret store, and, when it sends mail, its mail sender on a domain it owns (a free-mailbox domain fails); a blank, an `assumed` row or a gate of G10 fails the row (§13.4) |
| 19 | Research behind an `initiative` names who was asked (or the channel and count), records quotes or observations apart from conclusions, asks about past behaviour rather than "would you use", and records what argued against the plan (`user-research.md`) |

## How to check the one that matters

Check 2 is where this gate earns its cost, and it is subtler than scanning for product names.

A solution can hide inside a problem statement as an implied mechanism:

| Written as a problem | Actually a solution because |
|---|---|
| "Users cannot search their job history" | assumes search is the answer; the problem may be that history is unreachable, and a filter or a better default view would solve it |
| "The report takes 40 seconds to generate" | assumes generation is the thing to fix; perhaps nobody needed it synchronously |
| "We have no audit log" | names a missing artifact, not a harm. Who is hurt by its absence, and how? |

The test: **strip the sentence of every noun that is a thing you could build. Is there still a
problem left?** If not, it is a solution.

Be proportionate. A problem statement that mentions the existing system by name is not solutioning —
"the mobile app crashes when the job list exceeds 500 items" is a fact about where the problem lives.
Raise check 2 as a finding when the statement **presupposes what will be built**, not when it
describes where the pain occurs.

## Evidence, and what makes it fail

Check 4 fails on anything a reader cannot retrieve. Three that always fail:

- "Multiple customers have complained" — how many, where recorded?
- "This is a known issue" — known where?
- "Support says it happens often" — a ticket query, or it did not happen.

When the artifact cites a ticket id or a dashboard, say in your evidence cell whether you could
reach it. You usually cannot reach an external tracker, and that is fine: "cites JL-4821; not
reachable from this environment, citation is specific enough to check" is honest evidence. "Looks
fine" is not.

## Severity for this gate

- `BLOCKER` — the problem statement is a solution (check 2), or there is no evidence at all
  (check 4). Requirements written on either will be aimed wrong, and every later gate will pass them.
- `MAJOR` — success is unmeasurable (check 7), or impact is unquantified (check 6). Both mean nobody
  can tell afterwards whether this worked, which makes the entire initiative unfalsifiable.
- `MINOR` — thin constraints, a vague out-of-scope, an assumption with no validation date.
- `INFO` — an adjacent problem worth framing separately, a source worth citing.

## Findings that are usually wrong

Three objections that feel rigorous and are not:

1. **"The problem is too broad."** Sometimes it is genuinely broad. Raise it only if the breadth
   makes it impossible to tell what would count as solved — which is check 7, not a separate one.
2. **"There is no data."** Distinguish *no evidence offered* (a real `BLOCKER`) from *the evidence
   is qualitative*. Six recorded customer interviews are evidence. Demanding a metric where the
   problem is genuinely about experience is checklist theatre.
3. **"They should also consider X."** That is `INFO` at most. G0 does not owe you completeness about
   every adjacent concern; it owes you one problem, stated honestly.

A `PASS` with zero findings is the expected outcome for a well-framed problem, and writing one is
not a failure to be thorough (§4.5).
