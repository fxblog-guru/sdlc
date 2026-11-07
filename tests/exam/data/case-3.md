# data-model.md (excerpt) — orders

## Sources

The customer's address is owned by the customers service (`customers.address`). An order keeps `address_at_order`, a snapshot copied at checkout and never edited.

## Owners and consumers

Owner of every table here: the orders team. Analytics reads the view `analytics.orders_v1`; change policy: additive within v1, a breaking change ships as v2 with 90 days of overlap.

## History

Order status is a column on `orders`, updated in place. An approval sets `approved_by` and `approved_at` on the order, overwriting any earlier approval.

## Loads

Nightly product import: rejects rows with no SKU, duplicate SKUs or a price ≤ 0, and stops if the file is older than 26 hours; rejected rows go to `import_rejects` with the reason. `fct_order_lines` has one row per order line.

## Keys and time

Surrogate keys (UUIDv7). Timestamps are `timestamptz` in UTC; `created_at` is event time, `loaded_at` is load time.
