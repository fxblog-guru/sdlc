# architecture.md (excerpt) — orders

## Quality attributes

| Attribute | Scenario | Traded for |
|---|---|---|
| latency | GET /orders answers in p95 < 300 ms at 200 rps with one of three nodes down | eventual consistency of the search index (up to 30 s behind) |
| extensibility | next: order notes, partial refunds; both are new tables and endpoints, the core flow is unchanged | — |

## Components

One deployable, the orders API, plus the existing background worker. No new service: one team owns orders and deploys it as one unit.

## Writes

Placing an order saves the order and its lines to Postgres, then the handler publishes `OrderPlaced` to the topic.

## Migration

N/A — no running system is replaced; orders are a new capability.

## Tenancy

Single-tenant: one customer per deployment (ADR-004).
