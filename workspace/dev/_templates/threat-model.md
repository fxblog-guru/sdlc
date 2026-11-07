---
template_for: threat-model
gate: G2
authored_by: dev-modeling-threats
reviewed_by: dev-reviewing-design
---

<!--
Threat modelling at G2 is cheap; the same findings after launch are an incident. The method is
boring on purpose: enumerate the trust boundaries, walk STRIDE at each one, and write down the
mitigation and where it is enforced.

The single most productive question in this document is "what does the server do if the client
lies?" — because every id, every filter, and every price that arrives from a client is a claim,
not a fact.
-->

---
slug: <slug>
stage: design
artifact: threat-model
status: draft
authored_by: dev-modeling-threats
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Assets

<What an attacker would want: data, money, availability, reputation, access. Rank them — not everything deserves the same defence.>

## Trust boundaries

<Every place data crosses from less-trusted to more-trusted: browser → API, service → service, job → DB, third party → us — drawn as a mermaid DFD with one subgraph per boundary (dev-drawing-diagrams catalogue §7). Each one is a row in the STRIDE table below.>

## Actors

<Who might attack: unauthenticated internet, an authenticated user of another tenant, a lower-privileged insider, a compromised dependency. Note their capability.>

## STRIDE analysis

<Per boundary, per category. Not every cell applies; say N/A with a reason rather than leaving it blank, so a reader knows it was considered. Every row has a THR-NNN id and names in Test the test that will prove its control: a test name, `path:TestName`, `gate:<DEV-PROFILE gate>` for a G8 scan, or `accepted: <name>` with the id under Residual risk. `node <root>/scripts/threat-trace.mjs <slug>` checks the shape at G2 and, with `--source`, that each test exists at G8 (DEV-CONTRACTS §13.6).>

| Id | Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at | Test |
|---|---|---|---|---|---|---|---|---|
| <THR-001> | <boundary> | <Spoofing/Tampering/Repudiation/Information disclosure/Denial of service/Elevation of privilege> | <concrete scenario> | <low/med/high> | <low/med/high> | <control> | <file, layer, or config> | <TestName · path_test.go:TestName · gate:Secret scan · accepted: name> |

## Authorisation matrix

<Role × action × object scope. Object-level checks matter most: "can this user act on THIS record" is the check that IDOR bugs skip.>

| Role | Action | Object scope | Enforced where |
|---|---|---|---|

## Input and output handling

<Where untrusted input enters, how it is validated and typed, and how output is encoded per context. Name the parameterisation used for every query.>

## Secrets and keys

<What secrets exist, where they live, how they rotate, and what happens on compromise. Anything checked into the repo is a BLOCKER, not a finding.>

## Abuse and rate limiting

<Enumeration, scraping, brute force, expensive queries, and unbounded uploads — and the limit that stops each.>

## Logging and audit

<Which privileged actions are audited, what the record contains, and what must never be logged.>

## Residual risk

<What is knowingly accepted, by whom, and until when. An accepted risk with no owner and no date is an unaccepted risk.>
