---
name: dev-framing-problem
description: Use in /sdlc-intake (G0) to write problem.md: the problem framed before any solution, with retrievable evidence and a measurable success.
---

# Problem framing — G0

Adapted from `problem-framing` in `gitlab.com/agentic-fx/skills` @ `8556e8f`. The upstream skill's
seven phases and red flags are kept; its output path, its ask-the-user approval loop and its free-form
document are replaced by this bundle's template, path and gate (`docs/skill-sources.md`).

## What you are producing

`<root>/intake/<slug>/problem.md`, copied from `<root>/_templates/problem.md` and filled in. Headings are
byte-exact and in order (§3). `dev-reviewing-intake` judges it; you do not decide whether it passed.

## The mindset that makes this gate worth its cost

> Starting from `ideas.md`, feedback or "what next?" rather than a request: read `exploring-ideas.md` first.
> An `initiative`, or any change whose value is not obvious: read `product-principles.md` (metric tree, evidence, smallest test of value; G0 rows 15–17).
> Users whose needs nobody has asked about, or evidence that is a belief: read `user-research.md` (G0 row 19).


You are not designing anything, and you are sceptical of the problem statement you were given —
including, especially, the one the requester is confident about.

Requests arrive as solutions almost every time: "we need a search endpoint", "add an export button",
"the report should be faster". Each contains a problem, a guess at its cause, and a proposed fix,
compressed into one sentence and impossible to review. Your job is to pull them apart.

Work backwards. "We need a search endpoint" → *what are people failing to do?* → "they cannot find
jobs from last month" → *why does that hurt?* → "they re-enter the data, and duplicates reach
invoicing". The last sentence is the problem. Search is one possible answer to it, and now it can be
compared with the others at G2 instead of being assumed here.

Say in `## Open questions` when you have reframed a request, so the requester can correct you.

## Seven things to establish

**1 — Trigger.** Why now? Reactive or proactive? What happens if nothing is done? A problem with no
answer to "why now" is often a preference.

**2 — Who is affected.** Named groups, counted, with a source. Red flags: no owner or sponsor;
"everyone" as the stakeholder; stakeholders whose goals conflict — write the conflict down, it does
not resolve itself later.

**3 — The problem statement.** *"We are experiencing [undesired outcome] for [affected group]
because [root cause]."* No technology. No feature. Understandable by someone non-technical.

Test it before you keep it: **strip every noun that names a thing you could build. Is there still a
problem?** If not, you have written a solution.

**4 — Scope and constraints.** What is explicitly in, what is explicitly out, and the real limits —
deadline, budget, regulation, a system that cannot change, a team that must be involved. Out of scope
must be specific enough to refuse something with; "we won't gold-plate it" refuses nothing.

**5 — Success.** Observable and falsifiable. Red flags: success defined as "shipped"; no measurement;
a goal that moves. If nobody could tell six months later whether this worked, nothing downstream can
be aimed.

**6 — Assumptions and risk.** Every belief this framing rests on, and how it will be checked. Beliefs
about users, about scale, about data quality, about whether the organisation is ready. An
unvalidated assumption that survives to G2 is how a project fails late and expensively.

**7 — Readiness.** Is this ready for G1? Where it is not, the gaps are named in `## Open questions`
with who can answer them.

## Evidence, and what does not count

Every claim under `## Evidence` must cite something a reader could retrieve: a ticket query with a
count, a metric with a time range, a log sample, a dated interview, a missed deadline.

These do not count: "the team feels", "this is a known issue", "customers have complained",
"support says it happens a lot". They may all be true — they are just not checkable, and a framing
built on them will pass G0 and then misdirect ten stages with nothing to appeal to.

Qualitative evidence is still evidence. Six recorded customer interviews beat a metric nobody agrees
on. What matters is that it can be retrieved, not that it is a number.

## What you do not know, record

Budget, acceptable risk, deadlines, what the business will pay for — these are `DEC-NNN` in
`<root>/decisions/<slug>.md` (§15.2), with a recommended default and what they block. Never an
assumption made on the business's behalf, and never a blank section.

The same goes for the counts this skill needs and usually cannot find: how many people, how often,
how long it takes today. Raise each as a `DEC-NNN` with range options plus `not measured yet`,
rather than as a question in `## Open questions`. A reviewer can accept a dated plan to measure;
it cannot accept a bare "unknown".

**Where it will run is asked now, not at G10** (§13.4). For an `initiative`, every one of these that
`DEV-PROFILE §Environments` leaves as a placeholder is a `DEC-NNN` whose `Blocks` is G2: the
production host (a developer's machine is an answer only as a dated stopgap a named human signs),
the environments (`staging` at least, its own database, a subdomain one label deep), who deploys
each, the secret store, and, when the product sends mail, the mail sender
address on a domain the product owns (never a free mailbox: relayed mail from `gmail.com` fails
DMARC and never arrives). The host shapes the architecture, so G2 cannot be designed without it.
The options and the recommended defaults are in
`dev-planning-deployment/secrets-and-environments.md`.

**A default is not a question.** Lockout, session life, password rule, page size, upload limit,
retention, collation, timestamps, toolchain patches: `DEV-PROFILE §Defaults` answers them with a
standard. State the value with its citation (`DEV-PROFILE §Defaults — OWASP ASVS 2.2.1`); raise a
`DEC-NNN` only where this problem needs a different value (§3.2, §15.2).

## Do not

Propose a solution, name a technology, estimate effort, or write `status: approved`. If a solution
occurs to you and seems obviously right, that is worth exactly one line in `## Open questions` —
where G2 can weigh it against alternatives instead of inheriting it as settled.
