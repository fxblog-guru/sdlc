---
name: dev-detailing-design
description: Use in /sdlc-design (G2), after brainstorming, to take the chosen architecture down to interfaces, sequences, state and error handling.
---

# Technical design — G2, component level

Adapted from `technical-design` in `gitlab.com/agentic-fx/skills` @ `8556e8f`, and **re-scoped**.
Upstream this skill spans four steps: high-level design, data modelling, API contracts and low-level
design. In this bundle those are four different gates with four different reviewers — data modelling
is G3, API contracts are G4 — so only steps 2.1 and 2.4 belong here (`docs/skill-sources.md`).

That split is the point. Upstream, one approval covered all four, which meant a schema decision was
reviewed by whoever was reviewing the architecture, at the moment they were thinking about
components. Here each gets its own gate, its own checklist and its own reviewer.

## What you are producing

The component-level sections of `<root>/design/<slug>/architecture.md` — the detail that turns "these
are the components" into "this is how they behave". `dev-brainstorming-architecture` has already
chosen the shape; you are making it buildable.

**Do not generate code.** A design that contains implementations has skipped G6's task planning and
G7's review, and the code in it will be copied without either.

## Where the boundary sits

| Belongs here (G2) | Belongs to a later gate |
|---|---|
| the interface a component exposes, in prose or a signature | the wire contract, `openapi.yaml` — G4 |
| which entities exist and who owns them | columns, types, indexes, migrations — G3 |
| the sequence for each core use case | the screens and their states — G5 |
| where state lives and how it is made consistent | the actual SQL — G7 |
| error handling strategy and the boundary that maps errors | the error body shape — G4 (§13.1) |

When your design constrains a later gate, **write the constraint down and hand it over**. "The
assignment flow requires a unique constraint on (job_id, engineer_id)" is exactly right here — it is
a decision G3 must honour, recorded where G3 will read it. Writing the migration yourself is not.

## What to establish

**Component responsibilities and boundaries.** For each: what it owns, what it must not reach into,
and what it depends on. A boundary that is not written down is not a boundary — it is a convention
that erodes at the first deadline.

**Interfaces between components.** What each exposes, what it expects, what it guarantees. Prose or
a signature; the contract itself is G4's.

**Sequences for the core use cases.** One per primary flow from the PRD, step by step across
components, including where transactions begin and end and where a call leaves the process.

Do this for the failure paths too. Sequence diagrams that only show the happy path are how partial
failure gets discovered in production — the second write succeeded, the first was rolled back, and
nobody drew that.

**State and consistency.** Where each piece of state lives, who may write it, and what consistency
it actually needs. Where two components hold overlapping state, say what reconciles them and when.

**Concurrency.** What happens when two requests do this simultaneously. Idempotency for anything
that creates or charges; optimistic concurrency (`ETag`/`If-Match` or a version column) for updates
where last-write-wins would lose data silently (§13.1). Where last-write-wins is genuinely fine, say
so — that is a decision, and it should look like one.

**Error handling.** Which errors are retried, which are surfaced, which are swallowed, and the *one*
boundary where internal errors are mapped to the caller-facing shape. Every outbound call gets a
timeout, a retry policy with jitter, and a breaker where the dependency can be slow (§13.2).

**Instrumentation points.** Where spans start, which events are logged, which counters increment
(§13.5). Naming them here is what makes G7's implementation reviewable against something.

**The repository blueprint.** The first G2 in a repository, and any G2 that adds a top-level area, records the blueprint as an ADR: `blueprint-adr.md` (§13.9).

**The deploy target.** `## Deploy target` names `Host:`, `Shape:`, `Environments:`, `Pipeline:` and `Who deploys:`. Host and Shape cite the `DEC-NNN` the owner answered (or `unchanged` with a link), and the design states what the host forbids or forces: background jobs, file storage, the database pooler, runtime limits. `staging` runs on the production host type (`E041`, `E043`, §18.7).

## Depth is a judgement, and both errors are real

Too little and G6 cannot plan tasks, so it invents the design while writing them, unreviewed. Too
much and you have written the code in prose — slower to read than the code, and it will drift from
it within a week.

The test: **could a competent engineer who has not been in this conversation implement this without
making a decision you would want to review?** That is the right depth. Not "could they type it in".

## Brownfield

Say how each new component fits the existing layering, cite the existing example it follows from
`<root>/knowledge/conventions.md`, and name what you are deliberately doing differently and why. A
design that ignores the house structure produces code that a G7 reviewer cannot tell apart from a
mistake.

## Do not

Write code. Design the schema or the API contract. Estimate. Set `status: approved`. Where you find
yourself deciding something that belongs to G3, G4 or G5, write it as a constraint they must satisfy
and move on.
