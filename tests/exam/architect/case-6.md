# architecture.md (excerpt) — orders

## Quality attributes

| Attribute | Scenario | Traded for |
|---|---|---|
| latency | GET /orders answers in p95 < 300 ms at 200 rps with one of three nodes down | eventual consistency of the search index (up to 30 s behind) |
| extensibility | next: order notes, partial refunds; both are new tables and endpoints, the core flow is unchanged | — |

## Components

The orders API, plus a new notifications service that sends the order emails. It is split out for separation of concerns. Both are owned by the orders team and released together.

## Writes

Placing an order inserts the order, its lines and an outbox row in one database transaction. The worker relays outbox rows to the `OrderPlaced` topic and marks them sent.

## Migration

N/A — no running system is replaced; orders are a new capability.

## Tenancy

Single-tenant: one customer per deployment (ADR-004).
