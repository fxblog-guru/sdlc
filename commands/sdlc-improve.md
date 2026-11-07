---
description: Add one check to a reviewing skill's checklist, with the two fixtures that prove it (§17).
disable-model-invocation: true
argument-hint: <gate> "<the check that was missing>"
---

Add a check to gate `$1`'s reviewing skill: `$2`.

This is the only sanctioned way a checklist grows. A reviewing skill edited by hand acquires checks
nobody can fail and loses the property that makes a gate log worth reading — that every row was
earned by something that once went wrong.

## Preflight

1. Resolve `$1` to its reviewing skill through `DEV-CONTRACTS.md` §4. Stop if the gate has none.
2. Read that skill's published checklist in full, and **stop if the check already exists in another
   wording**. Two rows asking the same question is how a checklist becomes noise; if the existing
   row is too weak, this is an amendment to that row, not a new one.
3. Ask for the evidence, and refuse to proceed without it: **what reached production, and where is
   it recorded?** A `post-release.md`, an incident, a `CR-NNN` that was raised too late. §17 exists
   because a check earned by a real failure is worth ten invented in a planning session, and this is
   the step that keeps that true.
4. **Ask whether a row is the right tool.** If the miss is mechanical (a forbidden call, a missing
   id, a file in the wrong place), a lint rule, hook or CI script decides it on every commit, where
   a row decides it only when a reviewer reads carefully. Say so and propose the check instead; a
   row is for judgement. Look first for such a check that already exists but is not wired in, or
   is failing silently: wiring it is the fix.
5. Count how many rows the checklist already has. Past roughly twenty-five, say so — the honest
   options are to merge two rows or to retire one, and a checklist that only ever grows is one
   nobody reads carefully.

## The change

Three edits, and all three are required. Two of them are the reason this is a command rather than an
instruction to edit a file.

**1. One row on the published checklist.** Same table, same shape, appended — never inserted in the
middle, because the row numbers appear in every gate log already written and renumbering makes the
history unreadable. Write it as something an observer can decide: *"every migration states what
happens to rows that already exist"* can be failed; *"the migration is safe"* cannot.

**2. A fixture in `tests/fixtures/broken/` that the new check must catch.** Add it, then run the
suite and **watch it fail**. A check that passes against its own counter-example does not work, and
you will not find that out later — you will simply believe the gate is stronger than it is.

**3. A fixture in `tests/fixtures/valid/` the check must leave alone.** This is the one people skip,
and it is the one that prevents the worse failure: a check that fires on everything trains reviewers
to wave findings through, which is strictly worse than not having the check.

Then run `node --test tests/*.test.mjs` and show the counts.

## Also record why

Append to the skill a line naming the failure this row came from — the date, the slug, and the
`post-release.md` or incident it is traceable to. Without it the row is indistinguishable from
somebody's preference within a year, and the first person doing a checklist cleanup will delete it.

## Retiring a check

`/sdlc-improve $1 --retire <row number>` is the other half of the loop, and using it is not a
failure. A check that has not fired across ten initiatives is either covered by another row or
asking about a problem this codebase does not have. Removing it makes the remaining rows more likely
to be read.

Retiring requires the same rigour as adding: say which initiatives it was applied to, and keep the
fixtures — they document a shape this repository has decided it does not care about, which is worth
knowing later.

## Refuse

- To add a check with no failure behind it. "It seems like a good idea" is how a checklist reaches
  forty rows and stops being read. Record the idea in `docs/test-plan.md` and wait for evidence.
- To add a check that grades quality rather than deciding a fact. §11 draws this line for the
  linter and it holds here: "the design is well structured" is not a check, it is an opinion with a
  checkbox.
- To edit a reviewing skill's checklist without both fixtures, however obvious the check looks.
- To renumber, reword or delete an existing row as a side effect. That is its own change, with its
  own evidence.
- To change a gate log. §5 forbids it, and a check added today does not make yesterday's logs wrong
  — §11.1 is what stops the new rule turning the build permanently red.
