---
name: dev-brainstorming-architecture
description: Use in /sdlc-design (G2) to weigh at least two viable architectures, name the sacrifice, and write architecture.md and the ADRs.
---

# Architecture brainstorming — G2

Adapted from `architecture-brainstorming` in `gitlab.com/agentic-fx/skills` @ `8556e8f`. The seven
phases, the quality-attribute ranking and the pitfall list are kept. Two things are replaced: the
output goes to this bundle's template and path instead of a root `architecture.md`, and the
incremental "does this section look correct?" approval loop is removed — the review at G2 is the
gate now, and it is independent by design (`docs/skill-sources.md`).

## What you are producing

- `<root>/design/<slug>/architecture.md` from its template
- `<root>/design/adr/ADR-NNN-<kebab-title>.md`, one per decision that would be expensive to reverse

Preconditions: G1 is `PASS`, and you have read `requirements.md` and `acceptance-criteria.md` in
full. In a brownfield repo, you have also read `<root>/knowledge/codebase-map.md` and `known-debt.md`.

## Do not converge early

> A new component, store, queue or integration, a replacement of a running system, more than one tenant, or two quality attributes in tension: read `architecture-principles.md` (principles, trade-offs, anti-patterns; G2 rows 25–29).
> The design calls a model (LLM, RAG, tools, classification): read `ai-features.md`; its threats go in the threat model and its eval set is G8's evidence.


The failure this skill exists to prevent is the design that was decided in the first thirty seconds
and documented afterwards. It reads as confident, it survives review, and nobody can tell it apart
from a design that was reasoned into.

So the order matters: **context, then priorities, then options, then a recommendation.** Not a
recommendation with supporting material assembled behind it.

**1 — Context and constraints.** Summarise the requirements that bear on structure: key use cases,
scale expectations, the NFRs. Then the hard constraints — infrastructure, compliance, the team's
actual skills, time to market, the systems you cannot change. Separate the explicit constraints from
the ones everyone assumes. Propose nothing yet.

**2 — Rank the quality attributes.** Scalability, availability, latency, security, cost,
maintainability, operability. Rank them, because they conflict, and an architecture that claims to
optimise all of them has chosen none of them. Where the ranking is genuinely a business call, that
is a `DEC-NNN` (§15.2) — recommend a default and proceed.

Every later choice must be defensible against this ranking. That is what the ranking is for.

**3 — Explore two or three distinct options.** Each with: its components and their responsibilities,
communication patterns (sync/async), data ownership and boundaries, and its deployment model.

The bar for "distinct" is that a competent engineer could have argued for it. A straw man written to
make the preferred option look inevitable is worse than presenting one option honestly, because it
converts the absence of a decision into the appearance of one — and it will be cited later as proof
that alternatives were weighed. The reviewer is specifically instructed to test for this.

Still recommend nothing.

**4 — Compare, then recommend.** Across functional fit, the ranked attributes, complexity, cost, team
readiness and room to evolve. Lead with your recommendation, justify it against the requirements,
and **state plainly what it gives up**. Every architecture sacrifices something; one whose write-up
sacrifices nothing has not been thought through.

**4b — Decide the two axes with the decision table.** The first G2 in a repository, and any G2
that adds a deployable or a repository, fills the table in §13.9 rule 6 into the blueprint ADR:
one row per criterion (team count and ownership, independent deploy need, independent scaling hot
spots, data ownership boundaries, release cadence, operational maturity), each with its evidence
and the option it points to. Decide **Repository model** and **Architecture** separately. Start
from the default, a modular monolith in a monorepo (Fowler, "MonolithFirst"); move off it only
for a row that forces it, and for `microservices` operational maturity must be *yes* per
deployable (Newman, "Monolith to Microservices"; the Google SRE book). Then read the blueprint
off `dev-resolving-code-placement/blueprints/README.md` §Choosing. How to write it:
`dev-detailing-design/blueprint-adr.md`.

**5 — Write it up in sections.** System overview · component responsibilities · data flow and
integration · deployment model · observability and operability. No approval pauses — write the
document, and let the gate review judge it.

**6 — Failure modes.** Single points of failure, bottlenecks, consistency risks, attack surface,
blast radius. For each dependency, ask the question people skip: **what happens when it is slow,
rather than down?** A dependency that is down trips a breaker; one that is slow exhausts your
connection pool and takes the rest of the system with it.

Every failure mode gets a mitigation or an explicit acceptance.

**7 — Validate against the requirements.** Go through the `REQ-NNN` table and name, for each, the
component or flow that satisfies it. Write the mapping into the document. Do this by grep, not by
memory — a design that reads coherently while missing requirement 11 of 14 is invisible to a reader
and obvious to a search.

## The standards are given, not chosen

§13 owns pagination, error shape, design tokens, log fields, rollout and migration strategy. Your
design conforms; it does not invent a local alternative. Where a standard genuinely does not fit,
that is an ADR arguing the exception — visible and reviewable — not a silent deviation.

The two that bind at G2: any collection this design introduces is **cursor-paginated with a unique
tiebreaker** (§13.1), and any schema change follows **expand → migrate → contract** (§7) so the code
deploy and the migration never have to be simultaneous.

## Design the observability now

§13.5 is decided here, built at G7, proved at G11. State which signals this emits, which `SLO-NNN` it
will carry, what an alert fires on and what the runbook entry would say. A feature that reaches G11
with no telemetry is a `BLOCKER` there, and this is the only cheap place to prevent it.

## ADRs are append-only

One per decision that would be expensive to reverse: context, the options, the decision, the
consequences, and what would make you revisit it.

**Reversing a decision is a new ADR that supersedes the old one, never an edit.** The record of what
you believed and when is most of the value. And a design that contradicts a live ADR without
superseding it in writing is a `BLOCKER` at review (§16.4) — two live answers to one question means
the codebase eventually contains both.

## Brownfield: answer "extend or build new"

Explicitly, in the document, with `file:line` evidence that you searched the existing system. Not "I
considered the existing services" — the paths you opened.

Skipping this is how a codebase acquires a third endpoint that nearly duplicates two others, each of
which was individually reasonable at the time.

## Pitfalls this gate keeps catching

Going straight to the obvious solution · building for scale nobody needs · capturing the decision but
not the reasoning · proposing something the constraints already ruled out · starting implementation
before the design is reviewed.

## Do not

Write code. Design the schema (G3) or the endpoint shapes (G4) or the screens (G5) — where your
design constrains them, say so and hand over the constraint. Set `status: approved`. Edit the
requirements because the design would be neater with different ones; that is a finding to raise, and
editing them turns G1 `STALE`.
