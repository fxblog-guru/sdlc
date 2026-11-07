# data-model.md (excerpt) — orders

## Sources

The customer's address is owned by the customers service (`customers.address`). An order keeps `address_at_order`, a snapshot copied at checkout and never edited.

## Owners and consumers

Owner of every table here: the orders team. Analytics reads the view `analytics.orders_v1`; change policy: additive within v1, a breaking change ships as v2 with 90 days of overlap.

## History

Each status change appends a row to `order_status_history` (from, to, actor, at). Approvals are rows in `order_approvals`, never overwritten.

## Loads

Nightly product import: `COPY products FROM` the supplier's CSV. `fct_order_lines` has one row per order line.

## Keys and time

Surrogate keys (UUIDv7). Timestamps are `timestamptz` in UTC; `created_at` is event time, `loaded_at` is load time.
