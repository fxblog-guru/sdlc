# Contract rules — schema, errors, security, performance, docs (§13.1, §13.7, §13.12)

Each of these rules is a declaration the contract makes, so G7, G8 and the QA bundle can read it
instead of rediscovering it. `api-contract-check.mjs <slug>` checks everything a machine can see,
and the reviewer judges the rest. The template `<root>/_templates/api-contract.yaml` already applies
every rule, so start from it.

## Schema

- **Every property is typed and bounded.** A string has `maxLength`, an `enum`, a `pattern` or a
  bounded `format` (`date-time`, `uuid`, `date`). A number has `minimum` and `maximum`, and an array
  has `maxItems`. Take the bounds from `data/<slug>/limits.yaml`, never invent them (§13.11).
- **`required` on every object**: write `required: []` when every member is optional.
- **Null is a type**: `type: [string, 'null']`. Never use `nullable:`, which is OAS 3.0 and is
  silently ignored by a 3.1 validator.
- **Defaults are stated**: an optional member has a `default`, or its `description` says what
  absence means.
- **PATCH is JSON Merge Patch** (RFC 7396), `application/merge-patch+json`: `null` clears a member
  and an absent member is kept. Say so in the update schema's description.
- **Enums.** Set `info.x-enum-policy` once. With `extensible`, clients must ignore unknown values
  (render them as "other"), and adding a value is non-breaking. With `closed`, adding a value is
  breaking. Choose from `## Consumers`; a client that switches exhaustively forces `closed`.
- **Money and decimals.** Money is integer minor units plus an ISO 4217 `currency`. Any other
  decimal is a string with its scale in the description (`"12.50"`, scale 2), because a float
  loses cents.
- **Time.** An instant is `format: date-time` in UTC ending in `Z`. A local date or wall-clock time
  is `format: date` or `time`, paired with an IANA zone field (`time_zone: Europe/Berlin`).
- **Closed request bodies.** Every request-body object is `additionalProperties: false`. Server-owned
  fields (`id`, `created_at`, owner, role) are `readOnly`, so a client cannot set its own role
  (mass assignment, OWASP API3).
- **Secrets never leave.** A password, token, key or credential is `writeOnly: true`, or marked
  `x-sensitive: true`. A response schema never carries one. An operation that must return a secret
  once (a new API key) says why in `x-sensitive-response: <reason>`, and the reviewer judges it.

## Errors

- One problem type per refusal, in `problems.yaml` ([api-style.md](api-style.md)).
- **Downstream failures.** An operation that calls another service lists it in `x-downstream` and
  maps its failures:

  | The dependency… | Status | Type | Header |
  |---|---|---|---|
  | answered with an error, or something unusable | 502 | `upstream-failed` | `Retry-After` |
  | is down, or this service is shedding load | 503 | `service-unavailable` | `Retry-After` |
  | did not answer within its timeout | 504 | `upstream-timeout` | `Retry-After` |

- **Partial failure.** A bulk or multi-step write says what is left done when it stops part-way:
  "all or nothing" (one transaction), or per-item results, as in §13.1 Bulk. A retry with the same
  `Idempotency-Key` completes what is left and never repeats what was done.

## Security

- `security` on every operation. An open one says why in `x-public: <reason>`.
- `x-authz` per operation, or the description: the role it requires (BFLA, API5) and the object
  check on every client-supplied id (BOLA, API1).
- A URL a client supplies is `format: uri`. The description names the allowlist and states that
  private and link-local ranges are refused (SSRF, API7).
- `x-max-body-kb` and a `413` on every operation with a body. The value is the largest legitimate
  body, plus headroom.
- `info.x-cors` (the allowed origins, or "same origin only") and `info.x-security-headers` (HSTS,
  `nosniff`, `frame-ancestors`, `Referrer-Policy`).
- `contract-diff.md` `### Security mapping` has one row per OWASP API Top 10 (2023) risk (§13.12).

## Performance — declared per operation, at G4

Start with the traffic table. `info.x-traffic-classes` names each endpoint class:

```yaml
info:
  x-traffic-classes:
    read:  { rps: 50, peak_factor: 3, concurrency: 40, rate_limit: 300/min per account }
    write: { rps: 5,  peak_factor: 4, concurrency: 10, rate_limit: 60/min per account }
```

`rps` is the expected steady rate, and `peak_factor` the multiple seen at peak. `concurrency` is
the number of requests in flight at peak, and `rate_limit` the 429 threshold, which is also the
quota. Each number comes from a quality attribute, an NFR or an answered DEC. If no source exists,
raise a DEC-NNN (§15.2), and never use a number that merely sounds plausible.

Then, on each operation:

| Field | What it says | Who reads it |
|---|---|---|
| `x-traffic: <class>` | which row of the table this operation belongs to | the G8 load plan |
| `x-perf: { p95_ms, max_queries, max_payload_kb }` | the budget (§13.7) | G7 query tests, perf-smoke, G8 |
| `x-timeout-ms` | when the server gives up, at least `p95_ms`. Above 2000 means 202 + an operation resource | the handler's context deadline |
| `x-retry: safe\|with-key\|never` | whether a client may retry, and how. A write is `safe` only with an `x-idempotency: exempt:` reason | the generated client |
| `x-cache: none\|private:<ttl>\|public:<ttl>` (GET) | the `Cache-Control` the 200 sends. An `ETag` GET takes `If-None-Match` and answers 304, with `Vary` where the body depends on a header | the client and any proxy |
| `x-query: { shape, indexes }` (get, list) | the query this answers with, such as "keyset on (created_at desc, id desc) over release", and the indexes it needs by their `data-model.md` names | G3 (each index exists), G7 (`EXPLAIN` test) |
| `x-max-body-kb` (body) | the request size limit, with a 413 | the server's body limit |

The rules that tie these together:

- **Client retry guidance.** Retry only what `x-retry` allows. Back off exponentially with full
  jitter (base 200 ms, cap 10 s, at most 3 tries), and always honour `Retry-After`. Write the
  guidance once in `info.description`.
- **Async.** An operation that can pass 2 s answers `202 Accepted` with `Location` of an operation
  resource (`GET /operations/{operation_id}`). That resource's `Retry-After` is the polling
  interval, and it ends in `succeeded` or `failed` with a problem.
- **Page size against payload.** `limit` maximum × the item's largest size must fit in
  `max_payload_kb`. If it does not, lower the maximum or slim the item.
- **Bulk limits.** A bulk request caps its items with `maxItems`, and the cap times the per-item
  cost fits `p95_ms`.
- **N+1 at design time.** `max_queries` is derived from `x-query.shape`, and a list's count must
  not grow with `limit`. A shape that needs a query per row is redesigned now (a join, an `IN`
  batch), not found at G8.
- **Transfer.** `info.x-compression` (for example, gzip and br above 1 KB) and keep-alive. State
  HTTP/2 in `architecture.md` where a browser makes many parallel calls.
- **Load scenarios.** `api-contract-check.mjs <slug> --load-plan` prints one scenario per class at
  `rps × peak_factor`. Put the table in `contract-diff.md` `### Load scenarios`; G8 runs it and the
  QA handoff carries it.

## Idempotency, concurrency, observability

- `x-retry: with-key` needs `Idempotency-Key` and a `409 idempotency-key-in-flight`, for a repeat
  that arrives while the first request is still running. State the retention window in the
  parameter's description (for example, 24 h). The same key with another body is 422.
- Every operation takes `X-Request-Id` and W3C `traceparent`, and echoes `X-Request-Id`. A problem
  carries `trace_id`.
- Every non-GET declares `x-audit: true|false`. A `true` names its audit event in the
  observability catalogue (§13.11), and an `x-sensitive` field is never logged.

## Docs and examples

- A `summary` on every operation, and a `description` wherever behaviour is not obvious from the
  schema.
- Give an example on every 2xx JSON response and on every problem response. Together, the examples
  show every `ProblemType`. Use realistic values, not `string`. `api-contract-check.mjs` validates
  each example against its schema (E126).
- `x-requirements: [REQ-NNN]` on every operation. `trace.mjs` joins the requirement to the AC and
  the test, and the operation is the middle of that chain.

## Testability — written at G4, used from G7

For each operation, the positive, negative and boundary scenarios must be derivable. That means
every bound in the schema, every status in `responses`, and every problem type with an example. A
scenario that cannot be derived from those goes in the operation's `description`. Name in
`contract-diff.md` `### Test plan`:

- the contract test that G7 ships: the contract's operations against the served routes, with a
  pending list that only shrinks, and responses validated against their schemas (§13.10);
- the generated client, and the CI step that regenerates it and fails on a diff;
- the mock: `npx @stoplight/prism-cli mock <root>/api/<slug>/openapi.yaml`, for the UI and QA before
  G7 lands;
- the test data and environment each operation needs: seeded roles, a downstream stub for each
  `x-downstream`, and the clock where time matters.
