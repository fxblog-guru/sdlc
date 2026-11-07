---
template_for: architecture
gate: G2
authored_by: dev-detailing-design
reviewed_by: dev-reviewing-design
---

<!--
This document exists so that the expensive decisions are made deliberately, in the open, before
code makes them by accident. Two sections carry most of that weight: "Alternatives considered"
(a design with no rejected option was not designed, it was assumed) and "Failure modes" (every
component that can be slow or absent, and what the system does then).

Observability is designed here, not bolted on at G11. If you cannot say how you would know this
feature is broken in production, the design is not finished.
-->

---
slug: <slug>
stage: design
artifact: architecture
status: draft
authored_by: dev-detailing-design
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Context

<The system as it is today, and where this change lands in it. Link to docs/codebase-map.md.>

## Drivers

<The requirements and constraints that actually shape this design — the REQs that would change the answer if they changed.>

## Overview

<The proposed design in one paragraph plus a C4 context diagram as a mermaid block (dev-drawing-diagrams catalogue §1): components, responsibilities, and the boundaries between them.>

## Components

<One row per component: what it owns, what it must never do, and who owns it. Unclear ownership is the root of most architectural rot.>

| Component | Responsibility | Owns data | Must not | Owner |
|---|---|---|---|---|

## Flows

<The main sequences, step by step, including the error paths — one mermaid sequence per core use case with its alt/else failure branch (catalogue §3). Show where a transaction begins and ends, and where retries can duplicate work.>

## Data

<Which entities are created or changed, who owns each, consistency expectations, and the lifecycle. Detail belongs in G3; this section states the shape and the ownership.>

## Interfaces

<The contracts crossing each boundary: endpoints, events, queues, jobs. Detail belongs in G4; this section states what exists and who calls whom.>

## Deploy target

<Where this runs and how it gets there, decided now because it shapes the design (§18.7). Host and Shape each cite the DEC-NNN the owner answered, or say `unchanged` with a link. Then the runtime constraints the host imposes: jobs, storage, pooler, edge limits. On a cloud, the service table from `topology.mjs table <slug>`, a link to `diagrams/<slug>/cloud/<slug>-<provider>.svg`, the zones with the RTO/RPO that chose them, and the monthly cost order of magnitude (§13.14).>

Host: <provider and runtime: VM, managed containers, serverless — DEC-NNN>
Shape: <client and server as separate deployables · modular monolith · serverless — DEC-NNN>
Environments: <local · staging (host type, database, subdomain) · production>
Pipeline: <CI provider: build → registry → staging on merge → production on approval>
Who deploys: <the person or role per environment>

## Quality attributes

<For each priority attribute, the target and the mechanism that achieves it. An attribute with no mechanism is a hope. Include one `extensibility` row: name the next two likely features and show the design takes them without changing its core (§23).>

| Attribute | Target (REQ) | Mechanism | Verified at |
|---|---|---|---|
| <latency/availability/scalability/consistency/cost/maintainability> | <number> | <cache, index, queue, replica, budget> | <G8 / G11> |

## Failure modes

<For each dependency and component: what happens when it is slow, absent, or wrong. Timeout, retry with jitter, circuit breaker, fallback, degraded mode, or fail closed. "It shouldn't happen" is not an answer.>

| What fails | Detection | Behaviour | Blast radius | Recovery |
|---|---|---|---|---|

## Security

<Trust boundaries, authentication and authorisation at each, secret handling, and the data classification. Detail in threat-model.md; this section states the posture.>

## Observability

<What signals would show this working and show it broken: the log events, the metrics, the spans, and the candidate SLOs. These become SLO-NNN at G11, and they are cheaper to add now than to retrofit.>

## Alternatives considered

<Each real option, its trade-offs, and why it lost. A design with no rejected alternative was not designed.>

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|

## Decisions

<The decisions this design commits to, each with its ADR id. Anything reversible-but-expensive belongs here.>

| ADR | Decision | Status |
|---|---|---|

## Risks and open questions

<What is still unknown, what it would cost to be wrong, and when it must be resolved.>
