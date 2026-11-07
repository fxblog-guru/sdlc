---
name: dev-decomposing-requirements
description: Use in /sdlc-requirements (G1), after the PRD, to write requirements.md (falsifiable REQ-NNN) and acceptance-criteria.md.
---

# Requirement decomposition — G1

Adapted from `requirement-decomposition` in `gitlab.com/agentic-fx/skills` @ `8556e8f`. The upstream
skill has no file output at all, which made it the cleanest of the six to adapt: its seven
decomposition dimensions are kept intact and bound to this bundle's two artifacts and id scheme
(`docs/skill-sources.md`).

> A business process with several steps or actors, or a word that may mean two things: read `domain-modelling.md` (ubiquitous language, bounded contexts, state machines, unhappy paths; G1 rows 19–20).

## What you are producing

- `<root>/requirements/<slug>/requirements.md` — the `REQ-NNN` table, functional and non-functional
- `<root>/requirements/<slug>/acceptance-criteria.md` — testable criteria, each naming its `REQ-NNN`
- `<root>/requirements/<slug>/glossary.md` — one term per thing, with the synonyms it replaces in
  `Not`; every later artifact uses the term, and `lint-dev` W090 reports a banned synonym (§3.2)

Both from their templates. `REQ-NNN` ids are permanent: never renumbered, never reused, and the join
key that carries through design, tasks, tests and the QA handoff (§1, §6).

## The test every requirement must pass

**Could an observer decide pass or fail without asking you what you meant?**

Apply it to each row before you keep it. The way to apply it honestly is to ask the inverse: *what
is the cheapest thing someone could build that satisfies this sentence literally?* If the cheap
answer is obviously not what you meant, the requirement is under-specified and will be settled by
whoever implements it.

| Draft | Cheapest literal build | Fix |
|---|---|---|
| "The list loads quickly" | any latency, defended | name the percentile, the payload size, the load, the measurement point |
| "Users can filter jobs" | one field, exact match | name the fields and the match semantics |
| "Invalid input is handled gracefully" | log it, return 200 | name the status, the body shape, what the user is told |
| "The export is reliable" | retry once | name the failure modes and the guarantee |

## Seven dimensions to decompose along

**1 — Functional.** For each: who triggers it, what happens, under what conditions, what the expected
outcome is. State changes and business rules are requirements, not implementation details.

**2 — Non-functional.** Latency, throughput, availability, durability, security, privacy, compliance,
auditability, observability, maintainability. Each with a number, a unit and a measurement point.
An NFR without one cannot be verified, and at G8 it will be quietly reinterpreted by whoever needs
the build to pass.

**3 — Scenarios and flows.** Happy path, edge cases, failure paths, and role-based variations. The
failure paths are the ones that get skipped and the ones that produce production incidents — a
requirement that only describes success has specified half a system.

**4 — Data.** Sources, formats, storage, lifecycle (create, update, delete, archive), ownership, and
privacy classification. Where personal or sensitive data is involved: what is stored, for how long,
who can read it. This feeds G3 directly.

**5 — Integrations and dependencies.** Upstream systems, downstream consumers, third parties, events,
batch jobs. For each: direction of data flow, sync or async, and **what happens when it is slow or
unavailable**. "It is a dependency" is not a requirement; "if the tax service does not answer within
2s, the job is queued and the user is told" is.

**6 — Constraints and assumptions.** Stack limits, backward compatibility, timeline, regulation.
Assumptions listed explicitly, so G2 can see what it is standing on.

**7 — Open questions.** Every ambiguity, conflict and unknown as a `DEC-NNN` in
`<root>/decisions/<slug>.md` — never resolved by assumption inside a requirement row, and **never
resolved by your own recommended default either**. `status: assumed` belongs to a named human
(§15.2); recommending a default is your job, acting on one is not. Write every requirement that does
not depend on the answer, and mark the one that does `N/A — blocked by DEC-NNN`.

## Collections: the rule with no exceptions

**Every requirement that returns a collection states its pagination, its default and maximum page
size, its ordering, and its tiebreaker** (§13.1).

This is not premature design. *How* a cursor is encoded is G2's. *That a caller receives a bounded
page in a defined order* is a promise the product makes, and it belongs here.

The tiebreaker is the part people leave out and the part that hurts. Without a unique final sort
key, pagination silently repeats and drops rows whenever two values tie — and it will be found by a
customer, months later, as "some jobs are missing from page 3".

The shape to write: *"returns at most 100 per page, default 20, ordered by `created_at` descending
with `id` descending as tiebreaker."* No cursors, no SQL.

## Acceptance criteria are a handoff, not paperwork

They are the payload `agentic-fx-qa` consumes at G9 (§9). Someone who has never read the PRD must be
able to execute them.

- **Given / when / then, with concrete values.** Not "a valid request" — an actual request.
- **Every `REQ-NNN` gets at least one criterion; every criterion names its `REQ-NNN`.** Check both
  directions before you finish, mechanically. A gap here becomes an untested requirement at G9,
  discovered by whoever is trying to certify a release.
- **Expected results are specific.** "The correct result" is not executable.
- Cover the failure and permission paths, not only the happy one.

## Defaults and decided values

A non-functional value `DEV-PROFILE §Defaults` fixes (lockout, session, password, page size,
upload limit, retention, collation, timestamps) is written into the requirement with its citation,
not raised as a `DEC-NNN`; a DEC is raised only to deviate. A value a DEC fixed is stated here only
when `requirements.md` owns it; otherwise cite the DEC id (§3.2).

## Brownfield

With `project_maturity: brownfield`, each requirement says whether it **extends existing behaviour or
adds new**, and cites what you read to know — a `file:line`, a row in `api-as-is.md`, an entry in the
knowledge cards. A requirement written as if the system were empty produces a design that duplicates
what is already there, and the duplicate is usually only discovered after both exist.

## Do not

Choose a technology, design a schema, specify an endpoint shape, estimate effort, or set
`status: approved`. Where a requirement seems to force a technical choice, write the constraint that
forces it and let G2 make the choice in the open.
