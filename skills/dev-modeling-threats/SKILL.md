---
name: dev-modeling-threats
description: Use in /sdlc-design (G2), or when a change touches auth, PII, money or a trust boundary: STRIDE per entry point, implementable mitigations.
---

# Threat modelling — G2

Adapted from `threat-modeling` in `gitlab.com/agentic-fx/skills` @ `8556e8f`. The seven phases,
STRIDE and the anti-pattern list are kept. Two changes: the output is this bundle's template at the
§2 path rather than a dated file under `docs/security/`, and every mitigation is **assigned to the
gate that will enforce it** — upstream, mitigations were recorded and then left to goodwill
(`docs/skill-sources.md`).

## What you are producing

`<root>/design/<slug>/threat-model.md` from its template, alongside the architecture. Preconditions:
the architecture's boundaries, data flows and integrations are defined — you cannot model threats
against a shape that does not exist yet.

> Authentication, object-level authorisation, secrets or a new dependency: read `security-principles.md` (standard mechanisms, trade-offs, anti-patterns; G2 rows 30–33).

## Assume it will be attacked

Not by a genius, usually. By someone who tried the obvious thing, or by one of your own services
behaving badly, or by a user who found that changing an id in a URL returns someone else's data.

Think like an attacker, assume components fail and get misused, question what is trusted by default,
and prefer simple controls that can actually be enforced over sophisticated ones that cannot. This
is risk reduction, not perfection — the aim is that the realistic attacks are covered and the
accepted risks are written down.

## Seven phases

**1 — Assets.** What must be protected: identities, credentials and secrets, personal data,
financial data, business-critical operations, the infrastructure and control planes. Classify them.
Treating all data as equally sensitive means protecting none of it proportionately.

**2 — Trust boundaries.** Where trust changes: user to system, internal to external, across network
zones, across privilege levels, between tenants. State the trust assumptions explicitly — most
serious findings live in an assumption nobody wrote down.

**3 — Attack surface.** Every entry point: APIs, auth flows, webhooks and callbacks, queues and
events, admin interfaces, CI/CD and operational tooling. Red flags: an undocumented endpoint, shared
admin access, an operational API nobody lists.

The ones that get forgotten are the internal ones. An endpoint reachable only from inside the
cluster is still an entry point, and "internal" is a network fact, not a trust guarantee.

**4 — Threats, via STRIDE.** For each entry point and each data flow crossing a boundary: Spoofing,
Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.

Also do the abuse cases STRIDE does not prompt: what does a legitimate user with valid credentials
do that they should not be able to? Multi-tenant leakage, IDOR, mass-assignment and privilege
escalation through a legitimate feature all live here, and they are the ones that actually happen.

**5 — Risk.** Per threat: impact, likelihood, detectability, blast radius. Rank them, with the
reasoning written down. Detectability matters as much as impact — a threat you would never notice is
worse than a louder one you would.

**6 — Mitigations.** Authentication and authorisation, input validation, rate limiting, encryption in
transit and at rest, secrets management, audit logging, defence in depth.

**A mitigation must be specific enough to build and to test, and it must name the gate that will
enforce it.**

| Not a mitigation | A mitigation |
|---|---|
| "validate input" | "reject `sort` values outside the whitelist in the handler, 422 with the RFC 9457 shape — enforced at G4 in the contract, G7 in the handler test" |
| "use encryption" | "TLS 1.2+ terminated at the gateway; `card_last4` is the only card data stored — G7" |
| "prevent abuse" | "10 export requests per tenant per hour, 429 with `Retry-After` — G4 contract, G7 middleware, G11 alert" |
| "audit sensitive actions" | "append `job.reassigned` with actor, tenant, before/after to the audit log — G7, asserted in the integration test" |

A threat model whose mitigations are a list of security nouns has identified threats and mitigated
none of them, and the gap is invisible until something is exploited.

**Every STRIDE row is a `THR-NNN` with a `Test` cell (§13.6).** Name the test that will prove the
control: `TestSessionFixationReplacesCookie`, `internal/http/session_test.go:TestX`,
`gate:DAST baseline` for a G8 scan, or `accepted: <name>` with the id under `## Residual risk`.
The test does not exist yet; its name is the G7 implementer's instruction and G8's check. "G7
(middleware tests)" names no test, and on release-management 121 rows of it could not be traced.
Before handing back, run `node <root>/scripts/threat-trace.mjs <slug>` and fix every line it prints.

**7 — Residual risk.** Threat → mitigation mapping, what remains, and what has been explicitly
accepted. An accepted risk needs a named human (§4.5) — an agent cannot accept risk on an
organisation's behalf. If nobody has accepted it, it is a `DEC-NNN`, not an acceptance.

Finish on three questions: what happens if this control fails · can an attacker chain two failures ·
how would we detect abuse?

That last one is the bridge to §13.5 — a threat you cannot detect has no alert and no runbook entry,
and it will be found by a customer.

## Scope it honestly

Not every change needs all seven phases. A change that touches no boundary, no credential, no
personal data and no money can say so in one paragraph, with the reasoning, and move on. That is a
completed threat model, not a skipped one.

What it may not do is *look* thorough by listing generic threats that do not apply here. A page of
boilerplate STRIDE is how a real threat hides in plain sight, and it wastes the reviewer's attention
on rows that were never about this system.

## Anti-patterns

Security as a checklist · ignoring insider threats · assuming internal services are trusted ·
relying on the perimeter · reviewing security after implementation, when every fix is expensive.

## Do not

Write code, implement a control, set `status: approved`, or accept a risk on behalf of a human. Where
a mitigation requires a decision only the business can make — how much fraud is tolerable, whether a
feature is worth its exposure — that is a `DEC-NNN`.
