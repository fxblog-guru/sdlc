---
name: dev-writing-prd
description: Use in /sdlc-requirements (G1) to write prd.md: what is built, for whom, why now, what is excluded.
---

# Writing the PRD — G1

Adapted from `writing-prd` in `gitlab.com/agentic-fx/skills` @ `8556e8f`. The nine phases and red
flags are kept; the dated free-form output path and the stakeholder approval loop are replaced by
this bundle's template and gate (`docs/skill-sources.md`).

## What you are producing

`<root>/requirements/<slug>/prd.md`, copied from `<root>/_templates/prd.md`. The `REQ-NNN` table lives in
`requirements.md` and belongs to `dev-decomposing-requirements`; the PRD is the context that makes
those requirements make sense.

Preconditions: `<root>/intake/<slug>/problem.md` exists and G0 is `PASS`. If it is not, stop — a PRD
written before the problem was framed documents a guess in more detail.

## Write for someone who was not in the room

That is the whole discipline. Not persuasion, not a pitch, not a summary of a meeting. Someone
joining in three months should be able to read this and know what was being built and why, without
asking anyone.

It follows that you do not write "as discussed", "per the usual approach", or "the standard flow".
Each of those is a pointer to a room the reader was not in.

## Nine things to cover

**1 — Context.** The problem, summarised from `problem.md` and cited, plus why now. Enough to orient,
not a restatement of G0. If you find yourself rewriting the problem here, link it instead.

**2 — Goals and success metrics.** What the business gets, what users get, and the numbers that will
say whether it happened. Red flags: a goal phrased as "build X"; no measurable outcome; goals that
quietly conflict.

**3 — Users.** Primary and secondary personas, roles and permissions, and **who is explicitly
excluded**. The exclusion is the useful half — it is what stops a feature growing an admin mode
nobody asked for.

**4 — Use cases.** What users need to do, with preconditions, triggers and expected outcomes. Red
flags: a use case with implementation baked into it; a use case with no user context; two that are
the same one written twice.

**5 — Functional scope.** What the system must do, in outcome terms. The testable `REQ-NNN` rows come
from `dev-decomposing-requirements` — here you establish the shape and the priorities. Anything
that looks like a schema, an endpoint or a library belongs to G2, not here.

**6 — Non-functional expectations.** Performance, availability, security, compliance, scale,
accessibility, maintainability. Each with a number and the point where it is measured, or it will be
quietly dropped at G8 by someone trying to make the build green.

**7 — Constraints and assumptions.** Time, budget, regulation, existing contracts, systems that
cannot change. Red flags: a constraint discovered late because nobody wrote it down; an assumption
recorded as a fact.

**8 — Out of scope.** Explicitly excluded features, deferred ideas, the boundary of responsibility.
This section is what scope creep bumps against, so make it specific enough to refuse something with.

**9 — Open questions.** Every unresolved item as `DEC-NNN` in `<root>/decisions/<slug>.md`, with a
recommended default. Not resolved by assumption inside the PRD.

## Requirements, not solutions

The line is *what* versus *how*, and the PRD stays on the *what* side.

| Belongs in the PRD | Belongs in G2 |
|---|---|
| "Users can retrieve their jobs from the last 12 months" | which index makes that fast |
| "A page returns at most 100 items, newest first, ties broken by id" | cursor encoding, the SQL |
| "An export larger than the limit is produced asynchronously and the user is notified" | the queue, the worker, the storage |
| "Failures tell the user what to do next" | the RFC 9457 error body |

Naming a technology in a PRD pre-empts a design review that has not happened. If a technology is
genuinely constrained — "must run on the existing MySQL instance" — that is a **constraint** in
section 7, stated as one, and G2 can see that it was imposed rather than chosen.

## Vague words to hunt before you finish

"Fast", "easy", "intuitive", "seamless", "robust", "scalable", "user-friendly", "as needed",
"where appropriate". Each is a decision deferred to whoever implements it. Search your draft for
them and replace each with either a number or an explicit `DEC-NNN`.

## Do not

Design the solution, choose a technology, estimate effort, write the `REQ-NNN` table, or set
`status: approved`. `dev-reviewing-requirements` decides whether this passed.
