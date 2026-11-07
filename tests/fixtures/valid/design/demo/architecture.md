---
slug: demo
stage: design
artifact: architecture
status: in-review
authored_by: dev-detailing-design
reviewed_by: dev-reviewing-design
tracker: none
created: 2026-09-17
updated: 2026-09-17
requirements: [REQ-001, REQ-002, REQ-101]
---

## Context

The platform already owns cases as files. This adds a queryable store alongside, without a new service.

## Drivers

REQ-002 (finding is the real problem) and REQ-101 (it has to stay fast as the table grows).

## Overview

One table, one repository, two handlers behind the existing gateway. No new deployable.

## Components

| Component | Responsibility | Owns data | Must not | Owner |
|---|---|---|---|---|
| testcase repository | reads and writes test_cases | test_cases | reach out over HTTP | platform |
| testcase handlers | transport, validation, error mapping | none | contain business rules | platform |

## Flows

Create: validate → insert → 201 with Location and ETag. List: parse cursor → keyset query → 200 with a page envelope.

## Data

ENT_TEST_CASE, owned here. Detail at G3.

## Interfaces

API-POST-test-cases and API-GET-test-cases. Detail at G4.

## Deploy target

Host: unchanged — the existing service, see docs/codebase-map.md
Shape: unchanged — the existing modular monolith
Environments: local · staging · production, as DEV-PROFILE §Environments
Pipeline: the existing CI pipeline: build → registry → staging on merge → production on approval
Who deploys: the release owner

## Quality attributes

| Attribute | Target (REQ) | Mechanism | Verified at |
|---|---|---|---|
| latency | p95 < 300ms (REQ-101) | keyset pagination over an indexed sort key | G8 |

## Failure modes

| What fails | Detection | Behaviour | Blast radius | Recovery |
|---|---|---|---|---|
| Postgres unreachable | health check + error rate | 503, no retry storm — one retry with jitter | the two endpoints only | automatic once the DB returns |

## Security

Existing bearer auth at the gateway; object-level check on read by tenant.

## Observability

RED metrics on both handlers, a span per DB query, and the trace id in the error envelope.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Search service | scales further | a new deployable to run | REQ volume does not justify it |

## Decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-004 | Cursor pagination for case lists | approved |

## Risks and open questions

DEC-001 — if step-text search is required, the index choice and possibly the table shape change.
