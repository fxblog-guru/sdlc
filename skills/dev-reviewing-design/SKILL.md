---
name: dev-reviewing-design
description: G2 gate review. Use for its verdict: judges architecture, impact, ADRs and threat model against the checklist and writes the gate log.
---

# Reviewing G2 — design

You are judging whether this design is **a decision or a description**.

A description tells you what the author intends to build. A decision tells you what else was
possible, what was chosen, and what that choice costs. Only the second can be reviewed, because only
the second can be wrong in a way anybody can point at. This gate exists to keep architectures from
arriving as faits accomplis with the reasoning left in someone's head.

> `DEV-CONTRACTS.md` §5 (log format), §13 (the standards a design may not quietly contradict),
> §16.4 (what brownfield makes mandatory), §7 (migration strategy). You write
> `<root>/reviews/<slug>/G2-design-<run-id>.md` and nothing else.

## What you receive

Paths: `design/<slug>/architecture.md`, `impact.md`, `threat-model.md`, any `design/adr/ADR-*.md`
created or superseded, the upstream `requirements/<slug>/requirements.md` and
`acceptance-criteria.md`, `<root>/knowledge/*.md`, `<root>/decisions/<slug>.md`, `DEV-PROFILE.md`, the
gate-log template, and the prior log on attempt 2.

Read the requirements **before** the design. Checking that a design satisfies requirements you have
not read is not a review.

## Applicability

> G2 applies to any change that alters how the system is structured: a new component, a new
> dependency, a new integration, a change to a trust boundary, or a change to how data flows between
> existing components. A change that adds a field to an existing flow, using the existing structure,
> does not require G2.

For class `change`, G2 runs only when the change actually touches structure — that judgement is
yours, and `NOT_APPLICABLE` here requires you to quote the rule above and say which part of it this
change fails to meet. For class `fix` or `refactor`, G2 is skipped at intake by class.

For a `fast` slug, G2 runs only when a slice escalates it, and judges that slice's
`threat-model.md` (and the `impact.md` lines it needs); rows about architecture options, ADRs and
REQ coverage are `N/A`. The threat model is held to the full standard (§13.6).

For a `spike`, G2 judges the answer, not a design to build: one `ADR-NNN` that answers the question
`problem.md` asked, with the experiment's evidence (commands, numbers, the `spike/<slug>` commit) and
the options it rules out. Rows 1, 2, 7 and 16 apply; the rest are `N/A` unless the ADR decides them.
An ADR that asks for the spike code to be merged is a `BLOCKER` — that code had no G7 (§15.1).

The trap: a change that adds "just one integration with a third party" has changed a trust boundary,
introduced a failure mode and added an availability dependency. That is structure. Skipping G2
because the diff looks small is how an outage acquires a root cause that nobody reviewed.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | At least two viable options were considered, and the rejected ones are recorded with the reason they were rejected |
| 2 | The recommendation names what it sacrifices — a design that gives nothing up has not been decided |
| 3 | Every `REQ-NNN` from G1 is satisfied by a named component or flow, and the mapping is written down |
| 4 | Every non-functional requirement is addressed by a mechanism, not an intention |
| 5 | Component responsibilities and boundaries are stated: what each owns, what it may not reach into |
| 6 | Data ownership is explicit — which component is authoritative for which entity |
| 7 | Every decision that would be expensive to reverse has an `ADR-NNN`; every ADR that this design contradicts is superseded in writing; no `## Amendments` entry changes a decision, its scope or its consequences |
| 8 | Failure modes are analysed: single points of failure, bottlenecks, consistency risk, blast radius, and what happens when each dependency is slow rather than down |
| 9 | `impact.md` names every module, table, endpoint, screen, job and test this touches, with evidence that the codebase was searched rather than reasoned about |
| 10 | Backward compatibility is addressed: what existing callers, data or screens depend on this, and what breaks |
| 11 | Any schema change follows expand → migrate → contract, and the design says which deploy each phase lands in (§7) |
| 12 | Any collection this design introduces is cursor-paginated with a unique tiebreaker, and errors use the RFC 9457 shape (§13.1) — or an ADR argues the exception |
| 13 | Observability is designed here: which signals this emits, which `SLO-NNN` it will carry, what an alert would fire on (§13.5) |
| 14 | The threat model covers every entry point with STRIDE, and every threat has a mitigation specific enough to implement, assigned to a gate |
| 15 | Trust boundaries and data classification are explicit, including what crosses them |
| 16 | Brownfield only: "extend what exists, or build new" is answered explicitly, with `file:line` evidence that the existing system was searched (§16.4) |
| 17 | The design contains no code, and no decision that belongs to G3, G4 or G5 has been pre-empted without saying so |
| 18 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 19 | Every STRIDE row has a `THR-NNN` id, names its control, and names the test id that will prove it, or an acceptance by a named human listed under `## Residual risk` — `threat-trace.mjs <slug>` exits 0 (§13.6) |
| 20 | The repository blueprint is recorded in an `ADR-NNN`, this design's or an earlier one it cites, that names one of `dev-resolving-code-placement/blueprints/` and `DEV-PROFILE` points at it; in brownfield every deviation `layout-check.mjs` reports is a `` `<rule> <path>` `` row with a reason, and no mass move is planned (§13.9) |
| 21 | The blueprint ADR decides **Repository model** and **Architecture** with the §13.9 decision table — every criterion a row with retraceable evidence; a value other than modular monolith in a monorepo names the rows that force it, and `microservices` shows operational maturity per deployable; the blueprint is the one `blueprints/README.md` §Choosing gives for the pair, `layout-check.mjs` reports no `blueprint-fit`, and a V2 choice says so and fills `DEV-PROFILE §Services` (§13.9 rules 5–9) |
| 22 | Where the change runs on a cloud: an `ADR-NNN` records the provider and the runtime model with at least two options scored against the ranked attributes, Kubernetes only with a `dev-designing-cloud/runtime.md` row that forces it; `topology.mjs check <slug>` exits 0; you opened the rendered SVG and every component, group and edge in it is one the prose names, in the place the prose puts it; no data store sits in a public subnet without an ADR (§13.14) |
| 23 | `## Quality attributes` has an `extensibility` row naming the next two likely features and how the design takes them without changing its core (§23) |
| 24 | Where the design calls a model: the model id is pinned, the monthly cost bound is in `## Quality attributes`, prompt injection and data leakage are rows in the threat model, and the failure behaviour says what the user sees (`ai-features.md`) |
| 25 | Every quality attribute is a measurable scenario (stimulus, environment, response measure), and the design names which attribute it traded for which (`architecture-principles.md`) |
| 26 | Each new deployable names the independent deploy, scaling or ownership it buys; a split whose only reason is "separation of concerns" fails (`architecture-principles.md`) |
| 27 | No dual write: a flow that writes a store and publishes, or writes two owners, uses one transaction, an outbox or a saga with a compensation per step (`architecture-principles.md`) |
| 28 | Replacing a running system: the migration is staged (strangler or parallel run) with a rollback per step and the point of no return named; one cutover date with no stages fails (`architecture-principles.md`) |
| 29 | More than one tenant: the isolation model is an ADR, and every data access in the design carries the tenant predicate, not only the gateway check (`architecture-principles.md`) |
| 30 | Authentication uses a named standard (OIDC / OAuth 2.1 with PKCE, or the platform session); a token format designed in the document fails (`security-principles.md`) |
| 31 | Every object fetched or changed by id has an ownership or tenant check on the server, named per endpoint; a role check at the route alone fails (`security-principles.md`) |
| 32 | Credentials are short-lived and revocable, and every secret lives in a secret store; a secret in a committed or built file fails (`security-principles.md`) |
| 33 | Every new dependency is pinned, from a known registry, scanned and licence-checked; a range or `latest` in an application fails (`security-principles.md`) |
| 34 | `## Deploy target` is real, not a default: the host's limits (jobs, storage, pooler, runtime) appear in the design; `staging` exists on the production host type with its own database; Host and Shape rest on DECs the owner answered (`E041`, `E043`, §18.7) |

## Check 1: how to tell a real alternative from a straw man

Two options are recorded. That is easy to satisfy and easy to fake.

A straw man is an option written so that rejecting it is obvious — "Option B: store everything in a
single JSON column". Its presence is worse than a single honest option, because it converts the
absence of a decision into the appearance of one, and it will be cited later as evidence that
alternatives were weighed.

The test: **would a competent engineer have argued for the rejected option?** If the rejection
reason is a single sentence and the option has no stated upside, it is a straw man. A real
alternative has something going for it — which is why the recommendation has to name a sacrifice
(check 2).

Raise this as `MAJOR`, not `BLOCKER`. The design may still be right; what is missing is the evidence
that it was chosen.

## Check 3: run it, do not read it

Grep the design for each `REQ-NNN` in the requirements table. Put the count in your evidence cell,
and name any requirement with no match.

This is the check that most often finds something real and that a reading reviewer most often
misses, because a design that reads coherently feels complete. Requirement 11 of 14 being absent is
invisible to a reader and obvious to `grep`.

## Check 9: impact analysis is verifiable, so verify it

`impact.md` claims a set of things is affected. You can test that claim. Pick the two or three
riskiest items and check them:

- It says three call sites use this function. `grep -rn` and count.
- It says no other screen reads this field. Search the frontend.
- It says this table has no foreign keys pointing at it. Read the schema.

An impact analysis that is *missing* something is the failure this check exists for, and the only
way to find it is to look. A `MAJOR` finding here — "`grep` shows 7 call sites, impact.md names 3"
— is worth more than every other row in your log combined, because at G7 that gap becomes a
regression in code nobody knew to change.

In a brownfield repo, an `impact.md` with no `file:line` evidence anywhere fails check 9 outright
regardless of how plausible it reads.

## Check 14: what makes a mitigation implementable

"Validate input" is not a mitigation. Nobody can build it and nobody can test it.

"Reject `sort` values outside the whitelist in the handler; return 422 with the RFC 9457 shape;
covered by the contract test at G7" is a mitigation: it names the place, the behaviour and the gate
that will enforce it.

Check each threat's mitigation for all three. A threat model whose mitigations are a list of
security nouns has identified threats and mitigated none of them, and the gap will not be visible
again until something is exploited.

## Check 19: a threat with no test is a threat nobody will check

Run `node <root>/scripts/threat-trace.mjs <slug>` and put its last line in the evidence cell. Each line
it prints is a finding: no id is `MINOR`; no control, or no test on a `high`-impact threat, is
`MAJOR`; an acceptance with nobody named is `MAJOR` (§4.5). The test need not exist yet — G8 checks
that with `--source` — but its name must be one an implementer can write and a grep can find.

## Check 21: the axes are decided, not asserted

Re-run one row of the decision table yourself: the `git log` count, the `NFR-NNN`, the CODEOWNERS
line. A row whose evidence is an adjective ("scales better", "cleaner") is not evidence.
`microservices` on a team with one pipeline and no cross-process tracing is `MAJOR`, however the
other rows read; so is a polyrepo with no team boundary. A modular monolith in a monorepo with
thin rows is `MINOR`: it is the default and needs nothing forced. Run
`node <root>/scripts/layout-check.mjs` and quote any `blueprint-fit` line.

## Severity for this gate

- `BLOCKER` — a requirement no component satisfies (check 3); a design that contradicts a live ADR
  without superseding it (check 7); a threat with no mitigation on a path handling credentials,
  money or personal data (check 14); a schema change with no compatibility story (check 11).
- `MAJOR` — a single option presented as a decision (check 1); impact analysis that misses a real
  dependency (check 9); NFRs addressed by intention rather than mechanism (check 4); no observability
  design (check 13); brownfield "extend or build new" unanswered (check 16).
- `MINOR` — thin failure-mode analysis, an ADR that could be clearer, an unstated but obvious
  boundary.
- `INFO` — an alternative worth recording, a future concern, a simplification.

## Findings that are usually wrong

1. **"I would have designed it differently."** Not a finding. The design is wrong if it fails a
   requirement, contradicts a standard, or breaks something — not if it is not your preference. If
   you cannot attach your objection to a checklist row, it is `INFO` at most.
2. **"This is over-engineered."** Real sometimes, and lazy often. Make it concrete: name the
   component, name the requirement it is not serving, and say what would be lost by removing it.
   Otherwise it is an aesthetic judgement dressed as rigour.
3. **"Needs more detail."** Which section, for whom, to decide what? A design is detailed enough
   when the next gate can proceed. If G3 can build a data model from this, the detail is sufficient
   even if you would have liked more prose.
4. **Demanding a diagram.** A diagram is not a checklist row. Ask for one only when the text
   genuinely cannot convey the flow — and then it is `MINOR`.

`PASS` with zero findings is a correct outcome for a design that was actually decided.
