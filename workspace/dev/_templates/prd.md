---
template_for: prd
gate: G1
authored_by: dev-writing-prd
reviewed_by: dev-reviewing-requirements
---

<!--
The PRD is the product-side contract: what we are building, for whom, and how we will know it
worked. It states behaviour and outcomes, not implementation — the architecture stage owns "how",
and a PRD that prescribes a technology has taken a decision away from the people who should own it.
-->

---
slug: <slug>
stage: requirements
artifact: prd
status: draft
authored_by: dev-writing-prd
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Summary

<Two or three sentences a new engineer could read and know what is being built and why.>

## Problem recap

<Link to <root>/intake/<slug>/problem.md and restate the problem in one paragraph. If this has drifted from G0, say so — that is a finding, not something to smooth over.>

## Goals

<The outcomes this delivers, each measurable. Three is usually right; more than five means this is an epic that should be sliced.>

## Non-goals

<What this explicitly will not do, and why — the cheapest scope control there is.>

## Users and personas

<Who uses this, what they are trying to accomplish, and what they already know. Link to persona docs where they exist.>

## User journeys

<The end-to-end paths through the product, happy and unhappy. Each journey names its entry point, steps, and outcome.>

## Functional scope

<What the product does, grouped by capability. Each line becomes one or more REQ-NNN in requirements.md — this section is the source, that table is the index.>

## Non-functional expectations

<Latency, throughput, availability, data volume, retention, concurrency, supported clients, localisation, compliance. Each becomes an NFR REQ and, where user-visible, an SLO at G11. "Fast" is not a number.>

## Permissions and roles

<Who may do what. Every capability above is mapped to a role; anything unmapped is a gap, because authorisation discovered at implementation time is how IDOR bugs ship.>

## Data and privacy

<What personal or sensitive data is involved, why it is needed, how long it is kept, and who may see it.>

## Dependencies

<Other teams, services, vendors, or approvals this needs, with the lead time for each.>

## Rollout and migration

<How existing users and existing data reach the new behaviour: flag, phased, big bang, backfill. Day-one state for users who were mid-flow.>

## Success metrics

<The metric, its current baseline, the target, and when it will be measured. A metric with no baseline cannot show improvement.>

## Risks

<What could make this fail or hurt, how likely, how bad, and the mitigation.>

## Open questions

<Each unknown, its owner, and whether it blocks G2.>
