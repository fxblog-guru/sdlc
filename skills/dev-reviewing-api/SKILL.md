---
name: dev-reviewing-api
description: G4 gate review. Use for its verdict: judges the contract and contract-diff.md against the published checklist and writes the gate log.
---

# Reviewing G4 — api

You are judging a **promise that cannot be withdrawn**.

Once a contract ships, somebody generates a client from it, somebody else writes a retry loop around
it, and a mobile build that will still be in the wild in eighteen months is compiled against it.
Everything else in this pipeline can be changed later at the cost of some work. This can only be
changed at the cost of somebody else's work, which is why the breaking-change rule (§6) is the one
rule in this bundle that reaches outside the repository.

> `DEV-CONTRACTS.md` §5 (log format), §13.1 (**the standards this gate enforces, in full**), §6 (the
> breaking-change rule), §13.6 (authn, authz, IDOR), §15.2 (the decision ledger). You write
> `<root>/reviews/<slug>/G4-api-<run-id>.md` and nothing else.

## What you receive

Paths: `api/<slug>/openapi.yaml` or `<service>.proto`, `api/<slug>/contract-diff.md`, the upstream
`requirements/<slug>/requirements.md`, `design/<slug>/architecture.md`, `data/<slug>/data-model.md`
where G3 has run, `<root>/knowledge/api-as-is.md` and `known-debt.md`, `<root>/decisions/<slug>.md`,
`DEV-PROFILE.md`, the gate-log template, the source root, and the prior log on attempt 2.

Read `api-as-is.md` and the requirements **before** the contract. A contract read first will look
coherent — it was written to. The questions that matter are whether it covers what was asked for and
whether it breaks what is already deployed, and neither can be answered from the contract alone.

## Applicability

> G4 applies to any change that alters an externally observable interface: a new endpoint or RPC, a
> new or removed field, a changed type, a changed status code, a new error condition, a change to
> authentication or authorisation, or a change to pagination, filtering or sorting on an existing
> endpoint. A change that alters only internal behaviour, with every request and response byte
> identical, does not require G4.

For class `initiative`, G4 runs. For class `change`, it runs whenever the interface moves — that
judgement is yours, and `NOT_APPLICABLE` requires the rule above quoted verbatim plus which part of
it this change fails to meet (§5.4). For class `fix`, G4 is skipped at intake by class. For a
`fast` slug, G4 runs only when a slice escalates it, and judges the contract and
`contract-diff.md` for that slice's endpoints.

The trap: "we are only changing the response, not the request" is still G4, and so is adding a
field, and so is returning 404 where you used to return 403. A `fix` that changes an observable
response is not a `fix` (§15.1) — say the class is wrong.

## The published checklist

One row per line, same order, same wording, with the `Area` and `M` columns copied, each with a
`Result` of `PASS`, `FAIL`, `NOT_RUN`, `UNKNOWN` or `N/A — <reason>`, and evidence. `Area` is the
§13.12 area the row scores in, and `M` marks a mandatory row.

| # | Area | M | Check |
|---|---|---|---|
| 1 | 11 | M | The contract file parses and validates; the validator command and its exit status are in the evidence cell |
| 2 | 1 | M | Every `REQ-NNN` a caller can observe maps to an operation, and every operation maps to a `REQ-NNN` |
| 3 | 6 |  | `knowledge/api-as-is.md` was read and cited, and `contract-diff.md`'s baseline names the live contract, its version and its commit or deployed revision (§16.1) |
| 4 | 7 | M | Every collection endpoint is paginated, with `limit` default 20 and maximum 100 expressed in the schema rather than in prose (§13.1) |
| 5 | 7 |  | Pagination is cursor-based, or offset with a written justification over a stable ordered key — and never both styles on one endpoint |
| 6 | 7 |  | Every sortable field is whitelisted in the schema, and every sort resolves with a unique tiebreaker |
| 7 | 5 |  | Filters are declared per endpoint, typed and whitelisted; no free-form filter or query string reaches the backend |
| 8 | 7 |  | Total counts are opt-in rather than computed on every page |
| 9 | 4 |  | Every error response is RFC 9457 `application/problem+json`, one shape service-wide, with `trace_id` and `errors[]` for field-level validation; every problem response has an example, and the examples show every `ProblemType` |
| 10 | 4 |  | Status codes follow §13.1; 401 and 403 are distinguished by meaning; no `5xx` body carries a stack trace or an internal message |
| 11 | 9 |  | Every non-GET that creates or charges accepts `Idempotency-Key`, and the replay semantics and key retention window are stated; a repeat while the first is in flight is 409 `idempotency-key-in-flight`, the same key with another body 422 |
| 12 | 9 |  | Every update states its concurrency control — `ETag` + `If-Match` or a `version` field, with `412` on mismatch — or an ADR argues last-write-wins |
| 13 | 2 |  | Naming holds: plural kebab paths, `snake_case` JSON, ISO-8601 UTC ending in `Z`, money as integer minor units with a currency, ids opaque; any other decimal is a string with a stated scale; a local time carries an IANA zone |
| 14 | 5 | M | Every operation names its authentication scheme and the scope, role or permission it requires (§13.6) |
| 15 | 5 | M | Every client-supplied id carries a stated object-level authorisation check, not merely an authentication requirement |
| 16 | 5 |  | No response schema or error `detail` exposes an internal identifier, an internal message, another tenant's data, or the existence of a record the caller may not see |
| 17 | 8 |  | Rate limits are documented per endpoint class, and `429` returns `Retry-After` and `RateLimit-*`; each class in `info.x-traffic-classes` names its `rate_limit` and quota |
| 18 | 8 |  | Any operation that can exceed two seconds returns `202 Accepted` with a status resource rather than holding the request open, with a polling interval in `Retry-After` |
| 19 | 4 |  | Bulk endpoints declare per-item results and their partial-failure semantics, and cap their items with `maxItems` |
| 20 | 6 | M | Every change in `contract-diff.md` is classified breaking or not **against `api-as-is.md`**, and the classification is correct |
| 21 | 6 | M | Every breaking change has an ADR, a version or deprecation window with a date and a `Sunset` header, and a `MAJOR` acknowledgement in this log (§6); the old operation is `deprecated: true` and answers `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) — no `E132` |
| 22 | 6 |  | `## Consumers` names who calls these endpoints and the evidence each was checked with — a metric, a log query, a registry, a search with a count |
| 23 | 1 | M | Unknowns are recorded as `DEC-NNN` and left unresolved: no part of the contract is written to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 24 | 13 |  | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 25 | 8 | M | Every operation carries a complete `x-perf` budget (`lint-dev.mjs`: no `W050`/`W051`), each `p95_ms` traces to a quality attribute, NFR or answered `DEC-NNN`, and each `max_queries` is derivable from `data-model.md`'s access pattern without depending on page size (§13.7) |
| 26 | 4 |  | `problems.yaml` exists and `problems-check.mjs <slug>` reports no catalogue or contract error: every type in the `ProblemType` enum, one status, a sentence-case title, a `client_ux`, a name in the §13.11 grammar, and no single-field rule as its own type (§13.11) |
| 27 | 2 |  | `api-style-check.mjs <slug>` (or Spectral with `<root>/ci/spectral.yaml`) exits 0: every non-GET declares `x-idempotency` and `x-concurrency`, every operation is in its verb class, one action style; each remaining warning is fixed or argued in `contract-diff.md` (§13.11) |
| 28 | 3 | M | `api-contract-check.mjs <slug>` reports no `E120`/`E121`/`E122`: every property typed, every request-body object `additionalProperties: false`, null as `type: [x, 'null']`; each `W120`/`W121` (an unbounded string, number or array, a missing `required`) is fixed or argued |
| 29 | 3 |  | Every optional member states its default or what absence means; PATCH is JSON Merge Patch (`null` clears, absent keeps); `info.x-enum-policy` is stated and matches what `## Consumers` says the clients tolerate |
| 30 | 5 | M | No response schema carries a secret: `api-contract-check.mjs` reports no `E123`, and each `x-sensitive-response` reason is one a human would accept |
| 31 | 5 | M | Every operation has security or an `x-public` reason (no `E124`); each names its required role (BFLA); a client-supplied URL is `format: uri` with an allowlist and private ranges refused (SSRF) |
| 32 | 5 | M | `contract-diff.md` `### Security mapping` has one row per OWASP API Security Top 10 (2023) risk, API1–API10, each with its control and evidence or `N/A — <reason>` (§13.12) |
| 33 | 5 |  | `x-max-body-kb` and a 413 on every operation with a body (no `E131`); `info.x-cors` and `info.x-security-headers` are stated |
| 34 | 4 |  | Every `x-downstream` operation maps a failure to 502 `upstream-failed`, 503 `service-unavailable` and 504 `upstream-timeout` with `Retry-After` (no `W128`), and every multi-step write states what is left done when it stops part-way |
| 35 | 6 | M | `### Compatibility check` holds the output of `oasdiff breaking` or `contract-compat.mjs <baseline> <new> --declared contract-diff.md`, and every break it reports is a row marked breaking |
| 36 | 7 |  | Each list documents its filter operators and its default order, and the edge cases: an empty page, a cursor past the end, an invalid cursor as 400 `malformed-request`, and no duplicate or skipped row when a row is inserted while paging |
| 37 | 8 | M | Every operation names an `x-traffic` class whose `rps`, `peak_factor`, `concurrency` and `rate_limit` trace to a quality attribute, NFR or answered DEC (no `E133`); `### Load scenarios` carries `api-contract-check.mjs --load-plan` |
| 38 | 8 |  | Every operation has `x-timeout-ms` at or above its `p95_ms` (no `E127`); one above 2 s answers 202 (no `W122`); the client retry and backoff guidance is stated once |
| 39 | 8 |  | Every GET declares `x-cache` (no `E129`) with `Cache-Control`; an ETag GET takes `If-None-Match` and answers 304 (no `W123`); `Vary` where a body depends on a header; `info.x-compression` is stated |
| 40 | 8 |  | Every get and list has `x-query` with a shape that bounds `max_queries` independent of `limit` and indexes that `data-model.md` names (no `W126`); `limit` maximum × item size fits `max_payload_kb` |
| 41 | 9 | M | Every operation declares `x-retry` (no `E128`/`E134`); `with-key` has `Idempotency-Key`, a 409 and a stated retention window; a partial write retried completes what is left and repeats nothing |
| 42 | 10 |  | Every operation accepts `X-Request-Id` and `traceparent` (no `W132`); every non-GET declares `x-audit` (no `E130`) and each `true` names its event in the observability catalogue; no `x-sensitive` field is logged |
| 43 | 11 | M | Every operation has a `summary` (no `E125`) and every example validates against its schema (no `E126`); each `W124`/`W125` (a 2xx or a problem type with no example) is fixed or argued |
| 44 | 12 |  | `### Test plan` names the G7 server contract test, the generated client and its CI drift check, the mock (`prism mock`), and the test data and stubs per operation; positive, negative and boundary cases are derivable from the schema bounds and statuses |
| 45 | 12 |  | Every operation carries `x-requirements` (no `W131`), so requirement → operation → AC → test is joinable through `trace.mjs` |
| 46 | 13 | M | `api-score.mjs <slug> --log <this log>` reports no error, its scorecard is under `## Verdict`, and the verdict is the one the score status maps to (§13.12); every exception names its human approver |
| 47 | 12 | M | Every fixture and pilot data file is listed in `info.x-fixtures` with the schema it claims, and `fixture-check.mjs <slug>` reports no error: data written before a G4 rename fails here, not at G8 |

## Score it, then pick the verdict (§13.12)

Run the checkers first and keep their output:

```
node <root>/scripts/api-style-check.mjs <slug> --json      > /tmp/style.json
node <root>/scripts/api-contract-check.mjs <slug> --json   > /tmp/contract.json
node <root>/scripts/problems-check.mjs <slug> --json       > /tmp/problems.json
node <root>/scripts/contract-compat.mjs <baseline> <root>/api/<slug>/openapi.yaml --declared <root>/api/<slug>/contract-diff.md --json > /tmp/compat.json
```

Write the checklist. Then run `node <root>/scripts/api-score.mjs <slug> --log <your draft log> --in
/tmp/style.json --in /tmp/contract.json --in /tmp/problems.json --in /tmp/compat.json` (add
`--exit <script>=<code>` for a checker that wrote no output), and paste
its scorecard under `## Verdict`. It decides the machine rows from the checker codes those rows
cite, and takes your `Result` for the human rows. A `PASS` with no evidence, or one a checker
contradicts, scores 0 and is `E138`.

- `NOT_RUN` means you did not execute the check, for example because the tool was missing. Say so,
  and never write `PASS` for it. `UNKNOWN` means the artifacts cannot answer the question. On a
  mandatory row, `UNKNOWN` is a `DEC-NNN` and the verdict is `BLOCKED`.
- A machine row with no checker output is `NOT_RUN`, whatever you wrote. The one exception is a row
  a recorded human decision has ruled out. A project with no HTTP server has no `openapi.yaml`, so
  `api-contract-check.mjs` exits 2 and rows 28, 30 and 37 have nothing to check. Write those rows
  `N/A — <reason> (DEC-NNN)`, citing a DEC that is `answered` in `<root>/decisions/<slug>.md`, and
  pass the checker's exit code to the scorer: `--exit api-contract-check=2`. The rows are then
  `N/A` and leave the denominator. With no DEC cited, or a DEC that is open or missing from the
  ledger, or no `--exit …=2`, they stay `NOT_RUN` and `W137` says why. A checker that exited 1
  failed, and its rows are `FAIL` (`E138`) whatever the ledger says.
- The verdict is the one the score status maps to: `PASS` → `PASS`, `REVIEW` or `BLOCKED` →
  `CHANGES_REQUESTED`, `NEEDS_CLARIFICATION` → `BLOCKED` with each open question as a DEC-NNN.
- A mandatory or security row passed by exception carries `exception: ADR-NNN — approved by
  <human name>`. Without a named human, the row is `FAIL` (`E139`).

## Check 1: run it, do not read it

Validate the file before you form any opinion about it:

```
npx @redocly/cli lint <root>/api/<slug>/openapi.yaml
npx @stoplight/spectral-cli lint <root>/api/<slug>/openapi.yaml
python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <root>/api/<slug>/openapi.yaml
```

The first that is available is enough; for proto, `buf lint` or `protoc`. Put the command and its
exit status in the evidence cell. If no validator is installed, parse the YAML and say so — an
unresolvable `$ref` is worth finding even when a full linter is not available.

A contract that does not load has failed at the only thing it is for, and it takes four seconds to
establish. Reasoning about it first is how a reviewer writes nine paragraphs about an endpoint whose
schema reference is a typo.

## Checks 4, 6 and 9: count, do not sample

These three are the ones a reading reviewer gets wrong, because the endpoints that break them are
the ones that look least interesting — the small lookup list, the internal admin collection, the
error the author added last.

Enumerate mechanically and put the counts in your evidence:

- `grep -c "operationId: list"`, or list every `get` whose 200 response is an array or a `data`
  wrapper. Compare that count with the number that reference `Limit` and `Cursor`. Any difference
  is a `MAJOR`, and it is usually one endpoint that nobody thought would grow.
- Grep for every `sort` parameter and read each `enum`. Then check the ordering statement: is there
  a tiebreaker? A sort on `created_at` with no `id` behind it will repeat and drop rows the first
  time two records share a timestamp, which on a bulk import is immediately.
- Grep for `application/json` on a `4xx` or `5xx` response. Every one of them should be
  `application/problem+json`. A service with two error shapes has clients with one error handler
  and a bug.

"It is a small list, it will never need paging" is a prediction about data volume, and §13.1 removes
the choice for a reason: the unpaginated endpoint is discovered when it starts timing out, by which
time adding pagination to it is itself a breaking change.

## Check 25: a budget is a number someone can be held to

Run `node <root>/scripts/lint-dev.mjs` and put the `W050`/`W051` count in the evidence cell — zero, or
the operations named. Then, per operation, two questions the linter cannot answer:

- **Where does `p95_ms` come from?** Cite the `architecture.md` quality attribute, the NFR, or the
  `DEC-NNN` a human answered. A number with no source is the designer's guess, and G8 will measure
  the code against it as if it were agreed.
- **Is `max_queries` reachable?** Read the access pattern for the operation in `data-model.md` and
  count: one per table the response draws from, plus the page query. A budget below that count
  cannot be met; one that scales with `limit` (`max_queries: 25` on a list of 20) has budgeted the
  N+1 rather than forbidden it.

`MAJOR` for a missing or unsourced budget on a collection or a hot path; `MINOR` elsewhere.

## Check 20: the diff is the gate, and it is checkable

`contract-diff.md` makes a claim per row. Check the claims against `api-as-is.md` yourself — this is
the single highest-value thing you do at G4, because a missed breaking change is not found by this
pipeline at all. It is found by somebody else's client, in production, after release.

Method:

1. Pull the operation and schema names out of `api-as-is.md` and out of the new contract. Anything
   present in the first and absent from the second is a removal — is it in `## Removed`?
2. For each field the diff calls "changed", read both definitions. Required added? Type narrowed?
   Enum shortened? `maxLength` introduced? Each of those is breaking, whatever the row says.
3. For each row marked non-breaking, ask the actual question: *does an existing client, unchanged,
   keep working?* Not "is the change small", not "is it unlikely anyone relies on it".
4. Check the enum asymmetry specifically. Adding a value is safe for a client that ignores unknowns
   and breaking for one that switches exhaustively — and which you have is a fact about consumers,
   so it must be answered from `## Consumers`, not from optimism.

Then test the consumer claims. "No client uses this field" is verifiable: `grep -rn` the source
root and any sibling repositories you were given, and put the count in the evidence cell. A zero you
found yourself is worth far more than a zero you were told.

A change misclassified as non-breaking is a `BLOCKER`. Not because the change is necessarily wrong,
but because the classification is what decides whether there is a version, a deprecation window and
a notified consumer — and all three are skipped when the row says "safe".

## Checks 14 and 15: authentication is not authorisation

Two different failures, and only the first one is usually written down.

`security:` on every operation answers "who are you". It does not answer "may you act on **this
record**". An API where authorisation stops at authentication lets any authenticated caller read any
id they can guess or enumerate, which is the default bug in this category (§13.6) and the one that
becomes a disclosure notice rather than a bug report.

So: for every path parameter and every client-supplied id in a body, find the stated object-level
check. In the schema, in the operation description, anywhere — but stated. Where the contract says
nothing, the finding is `MAJOR` at minimum and `BLOCKER` where the resource holds personal data,
money or credentials.

The endpoints that fail this are predictably the internal ones. "Only the admin UI calls it" is a
statement about a client, and the endpoint is on the network either way.

## Check 23: the quiet version of guessing

An agent that invents a rate limit is easy to catch. The version that gets through looks careful:
`DEC-003` is filed, a default is recommended, and the contract is then written to that default —
published, generated into clients, and true.

The ledger still shows the question open. Nobody will ask again, because the number is now in a
spec file that everyone treats as decided.

The remedy is not `assumed` — that needs a named human (§15.2), and an agent that sets it has
answered the question in the format designed to look like it did not. It is `N/A — blocked by
DEC-NNN` on the dependent part, with the rest of the contract written in full.

Severity is `MAJOR`: the contract is not wrong, it is **unauthorised**, and the cost lands at G9
when somebody asks who agreed to it.

## Severity for this gate

- `BLOCKER` — an unpaginated collection (check 4); a breaking change classified as safe (check 20);
  a breaking change with no version, window or ADR (check 21); an operation with no authentication
  (check 14); a client-supplied id with no object-level check on personal data, money or credentials
  (check 15); a free-form filter reaching the backend (check 7); a contract that does not parse
  (check 1); a secret in a response (check 30); an operation with no security and no reason
  (check 31); a break the compatibility check reports and the diff does not (check 35).
- `MAJOR` — a missing tiebreaker (check 6); a problem type with two statuses, or missing from the catalogue (check 26); a write without `x-idempotency` or `x-concurrency` (check 27); a second error shape (check 9); a creating endpoint with
  no `Idempotency-Key` (check 11); an update with no concurrency control and no ADR (check 12); a
  requirement with no operation (check 2); an unverified consumer claim (check 22); a contract
  written to an open decision (check 23); a long operation held open (check 18); a collection or hot
  path with no budget, or one whose `max_queries` grows with the page size (check 25); an open
  request body, an untyped property or `nullable:` (check 28); a missing OWASP row (check 32); no
  traffic class, timeout or retry declaration (checks 37, 38, 41); an example that does not
  validate (check 43).
- `MINOR` — a naming inconsistency, a thin description, an example missing, a status code that is
  defensible but unusual.
- `INFO` — an endpoint worth splitting, a field that could be optional, a future version's problem.

## Findings that are usually wrong

1. **"This should be GraphQL / gRPC / a different resource shape."** The style is set by
   `DEV-PROFILE §API surface` and the structure was decided at G2. Re-litigating it here is not a
   finding; if the chosen style genuinely cannot express a requirement, that is a G2 finding and you
   should say so as `INFO` with the requirement named.
2. **"This endpoint is not RESTful."** Purity alone is not a severity: `POST /jobs/{id}/assign` is a
   good operation. **Inconsistency is**: when two operations in this contract answer the same kind
   of question two ways (pin POST 200, star PUT 204), that is a check-27 `MINOR` even if either
   style alone would pass, because a client cannot predict the second from the first.
3. **"Add a field for X."** You are adding permanent surface area. Tie it to a `REQ-NNN` or it is
   `INFO` at most — and if a requirement genuinely has no field, that is a real check-2 `MAJOR`.
4. **"This will be slow."** A contract is not an implementation. Only a finding where the *contract*
   forces the slowness: an unbounded collection, a mandatory total, an operation that cannot be
   completed inside its own latency budget. Say which.
5. **Writing the replacement schema in your finding.** State what is wrong and what must be true.
   Writing the YAML is authoring, and you may not author (§4.5) — you will also anchor the designer
   onto your shape instead of their intent.

`PASS` with zero findings is the correct outcome for a contract whose standards were applied and
whose diff was actually computed.
