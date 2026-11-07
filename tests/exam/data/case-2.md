# data-model.md (excerpt) — orders

## Sources

The customer's address is owned by the customers service (`customers.address`). An order keeps `address_at_order`, a snapshot copied at checkout and never edited.

## Owners and consumers

Owner of every table here: the orders team. The analytics team reads `orders` and `order_lines` directly with a read-only database user.

## History

Each status change appends a row to `order_status_history` (from, to, actor, at). Approvals are rows in `order_approvals`, never overwritten.

## Loads

Nightly product import: rejects rows with no SKU, duplicate SKUs or a price ≤ 0, and stops if the file is older than 26 hours; rejected rows go to `import_rejects` with the reason. `fct_order_lines` has one row per order line.

## Keys and time

Surrogate keys (UUIDv7). Timestamps are `timestamptz` in UTC; `created_at` is event time, `loaded_at` is load time.
