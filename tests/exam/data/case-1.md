# data-model.md (excerpt) — orders

## Sources

The customer's address is in `customers.address` and in `orders.shipping_address`. The support tool edits whichever one the agent opens, and the checkout reads `orders.shipping_address` when present.

## Owners and consumers

Owner of every table here: the orders team. Analytics reads the view `analytics.orders_v1`; change policy: additive within v1, a breaking change ships as v2 with 90 days of overlap.

## History

Each status change appends a row to `order_status_history` (from, to, actor, at). Approvals are rows in `order_approvals`, never overwritten.

## Loads

Nightly product import: rejects rows with no SKU, duplicate SKUs or a price ≤ 0, and stops if the file is older than 26 hours; rejected rows go to `import_rejects` with the reason. `fct_order_lines` has one row per order line.

## Keys and time

Surrogate keys (UUIDv7). Timestamps are `timestamptz` in UTC; `created_at` is event time, `loaded_at` is load time.
