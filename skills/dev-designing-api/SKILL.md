---
name: dev-designing-api
description: Use in /sdlc-api (G4) to write the OpenAPI/proto contract and contract-diff.md per §13.1, classifying every change as breaking or not.
---

# API design — G4

Adapted from `api-design` in `gitlab.com/agentic-fx/skills` @ `8556e8f`, and **bound to this
bundle** (`docs/skill-sources.md`). Upstream's seven design phases survive nearly intact, because
the sequence is right: requirements to endpoints, boundary and ownership, resources, request and
response, errors and versioning, security. So does its central instruction — design from the
consumer's side and assume the API will be used incorrectly.

Three things are replaced. Upstream ends with a free-form dated document and a three-way
"approved / approved with conditions / not approved" verdict the designer awards itself; here the
artifact is the contract file at the §2 path and the verdict comes from `dev-reviewing-api` on a
fresh context, with only the four words §10 allows. Upstream's conventions are recommendations;
here §13.1 is a registry a gate fails you on. And upstream's phase 8, "strict endpoint matching
during implementation", is not advice in this bundle — it is §6, enforced at G7.

> `DEV-CONTRACTS.md` §13.1 (**read it in full — this skill implements it**), §6 (the breaking-change
> rule), §13.6 (authn, authz, IDOR), §15.2 (unknowns). `DEV-PROFILE §API surface` for style,
> versioning and auth. `<root>/knowledge/api-as-is.md` for what is live.

## What you produce

`<root>/api/<slug>/openapi.yaml` — or `<service>.proto` where `DEV-PROFILE §API surface` says gRPC —
and `<root>/api/<slug>/contract-diff.md`, copied from `<root>/_templates/api-contract.yaml` and
`contract-diff.md` with every section filled (§3), and `<root>/api/<slug>/problems.yaml`, the problem
catalogue, from `<root>/_templates/problems.yaml` (§13.11).

The contract is the artifact. Everything else in the pipeline reads it: G6 plans tasks per
`API-<METHOD>-<path>`, G7 implements against it, the contract tests assert it, the QA bundle
automates from it (§9). A behaviour that exists only in prose will not be generated, not be mocked
and not be tested.

**Validate before you hand back.** For OpenAPI, `npx @redocly/cli lint <path>` or
`npx @stoplight/spectral-cli lint <path>`; at minimum, parse it (`node -e "require('yaml')"`,
`python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))"`). For proto, `protoc --lint_out`
or a `buf lint`. Record the command and its exit status. A contract that does not load is not a
contract, and it is a strange thing for a reviewer to discover for you.

## Start from the contracts that are live

`<root>/knowledge/api-as-is.md` holds the contracts **actually in production** (§16.1) — which is not
the same as the spec file in the repository, and never has been. The gap between them is precisely
where breaking changes hide: an endpoint that was patched under incident pressure, a field a client
depends on that the spec never documented, a status code the gateway rewrites.

Read it before you write anything. `contract-diff.md` is diffed against it (§16.1), so a design
written without it produces a diff against the wrong baseline, which is worse than no diff at all
because it will be believed.

## Requirements to endpoints, and the mapping is written down

Every `REQ-NNN` that a caller can observe reaches an endpoint, and you must be able to show which.
Grep the requirements table and map it row by row. The two failures this catches are opposite and
both common: a requirement with no endpoint, and an endpoint with no requirement — the latter is
usually internal functionality that has quietly become public surface, which is a permanent
commitment made by accident.

Then split commands from queries. An endpoint that both mutates and returns a filtered collection is
two endpoints with one name, and it will grow a `mode` parameter within a quarter.

## The contract is not the schema with HTTP in front of it

G3 designs storage; you design the promise. They are allowed to differ and usually should.

Exposing column names couples every client to your table: a rename becomes a breaking change, a
denormalisation leaks, and an internal field that should never have left the database is now in
somebody's mobile app for two years. Name resources and fields for what the consumer means, and map
them in the implementation.

Similarly, a resource is not a table. `GET /jobs/{id}/assignments` can be a join, a view, or three
tables. That is your freedom to keep, and it disappears the moment the contract mirrors the schema.

## §13.1, made concrete

The style choices — verb classes, statuses, operationId verbs, parameter names, write declarations
and the problem catalogue — are in [api-style.md](api-style.md); apply it before the rows below.
Schema completeness, downstream errors, security, the performance declarations (traffic,
timeouts, retry, cache, query shape), examples and testability are in
[contract-rules.md](contract-rules.md); `api-contract-check.mjs` checks what a machine can see.

The registry is the rule (§13); this is what applying it looks like. Each row below is also a
checklist row in `contract-diff.md`'s `## Standards conformance` table, which you fill with
evidence.

**Collections.** Every list endpoint is paginated. Every one. `limit` with `default: 20` and
`maximum: 100` in the schema, not in a description. Cursor by default: `?limit=&cursor=`, an opaque
cursor the client must not parse, and `{ data, page: { next_cursor, has_more, limit } }` back.
Offset only where the UI genuinely needs jump-to-page, over a stable ordered key, with a written
justification — and never both styles on one endpoint.

**Sorting.** `?sort=field,-other`, the sortable fields as an `enum` in the schema, and **every sort
resolved with a unique tiebreaker**, usually the primary key. Without the tiebreaker, keyset
pagination repeats and drops rows whenever two sort values tie — invisible in tests, discovered by a
customer whose export is missing four records.

**Filtering.** Declared per endpoint, typed, whitelisted. A free-form filter or query string that
reaches SQL is a `BLOCKER` at review and an injection finding at G8.

**Totals.** Opt-in, `?include=total`. An unconditional `COUNT(*)` is the query that makes a list
endpoint fall over at a million rows, and it is being paid on every page of every request.

**Errors.** RFC 9457 `application/problem+json`, one shape for the whole service: `type`, `title`,
`status`, `detail`, `instance`, `trace_id`, plus `errors[]` for field-level validation. One shape
means a client writes one error handler; several shapes mean every client writes a switch statement
and gets one branch wrong. `5xx` never carries a stack trace.

**Status codes.** 200/201/202/204 · 400 · 401 · 403 · 404 · 409 · 412 · 422 · 429. Use 401 for "I do
not know who you are" and 403 for "I do, and no" — conflating them is how a client retries forever
with the same expired token. 404 rather than 403 where existence itself is confidential; say which
you chose and why.

**Idempotency.** Every non-GET that creates or charges accepts `Idempotency-Key`, and a replay
returns the original result rather than a second record. State the retention window for the key.
This is not an edge case: the client retried because the network timed out **after** the write
succeeded, and that is the normal shape of a bad day.

**Concurrency.** Updates carry `ETag` + `If-Match`, or a `version` field, with `412` on mismatch.
Last-write-wins is a real choice for genuinely non-contended data, and it needs an ADR, because what
it loses it loses silently.

**Naming.** Plural kebab paths, `snake_case` JSON, ISO-8601 UTC ending in `Z`, money as integer
minor units plus a currency code, ids opaque. Money as a float is the single most expensive naming
mistake on this list.

**Versioning.** `/v1` in the path. Additive only within a version. Breaking means a new version, a
deprecation window with a date, and `deprecated: true` with `Deprecation` (RFC 9745) and `Sunset`
(RFC 8594) headers on the old operation.

**Rate limits and long operations.** Documented per endpoint class, `429` with `Retry-After` and
`RateLimit-*`. Anything that can exceed two seconds returns `202 Accepted` with a status resource —
never a hanging request, because the client's timeout is shorter than yours and it will retry the
work you are still doing.

**Bulk.** A bulk endpoint declares per-item results and its partial-failure semantics. "All or
nothing" and "best effort" are different products; pick one in writing.

**Performance budget.** Every operation carries `x-perf` (§13.7):

```yaml
x-perf: { p95_ms: 300, max_queries: 4, max_payload_kb: 64 }
```

`p95_ms` is the latency at the G8 volume, from `architecture.md`'s quality attributes or the NFR
it serves — never a number you chose because it sounded fast; with neither, it is a `DEC-NNN`.
`max_queries` is the database round trips one request may make: count them from the access pattern
in `data-model.md` (one per table read, plus the page's keyset query), and a list's count must not
depend on its page size. `max_payload_kb` is the largest response at `limit` = maximum. G7's
integration tests assert `max_queries`, every check smokes the GETs against all three
(`perf-smoke.mjs`), and G8 measures them at volume. `lint-dev.mjs` warns on an operation with no
budget (`W050`) or an incomplete one (`W051`). The rest of the performance declarations —
`x-traffic`, `x-timeout-ms`, `x-retry`, `x-cache`, `x-query` — are in [contract-rules.md](contract-rules.md).

If a standard genuinely does not fit this case, write an ADR arguing the exception. A silent
deviation is a finding the reviewer has to discover, and the author is always better placed to make
the argument than the reviewer is to reconstruct it.

## Authn and authz, per operation

Every operation names its security scheme and the scope, role or permission it requires (§13.6). An
endpoint that only the admin UI calls is still on the network, and "only our own frontend uses it"
is a statement about a client, not about access.

Then, for every client-supplied id, state the object-level check: *this caller may act on **this**
record*, not merely *this caller is authenticated*. Broken object-level authorisation is the default
bug in any API, and the contract is where the obligation gets written down in a form G7 can be
reviewed against. Put it in the operation's `description` if the security scheme cannot express it.

Finally, look at your response schemas from the outside and ask what they leak: an internal id, a
cost price, another tenant's name in an error `detail`, a soft-deleted record's existence in a 409.

## contract-diff.md: breaking is a question about clients, not about intent

`## Baseline` names the live contract, its version, and the commit or deployed revision — from
`api-as-is.md`. A diff with no baseline proves nothing.

Then one question per change: **does an existing client, unchanged, keep working?**

| Safe | Breaking |
|---|---|
| adding an optional request field | making an optional field required |
| adding a response field | removing or renaming any field |
| adding an enum value a client may ignore | narrowing an enum, or adding a value a client must handle |
| adding a new endpoint | changing a status code, or a field's type |
| loosening a validation rule | tightening one, including a new `maxLength` |
| adding an optional header | changing the default of an existing parameter |

Note the asymmetry in the enum row: adding a value is safe for a client that ignores unknowns and
breaking for one that switches exhaustively. Which you have is a fact about your consumers, not a
preference — so `## Consumers` names them and names how each was checked: a gateway metric, a log
query over 30 days, a client registry, a grep of the monorepo with the count. "No client uses it" is
a claim that needs evidence (§6).

Then let a machine check you. Run `oasdiff breaking <baseline> <new>` (the Go binary, or `docker run
--rm -v "$PWD:/w" tufin/oasdiff breaking /w/<a> /w/<b>`); without it, run `node <root>/scripts/
contract-compat.mjs <baseline> <new> --declared <root>/api/<slug>/contract-diff.md`. Paste the command
and its output in `### Compatibility check`. Any break it reports that has no row here is a row
you missed.

Every breaking change needs all four or it is not ready: the row here, an ADR, a version or
deprecation window with a date and a `Sunset` header, and the `MAJOR` acknowledgement in the G4 log
(§6). And a removal is never in the same release as the code that stopped writing it — the same
expand → migrate → contract discipline G3 applies to the schema (§7), for the same reason: you can
roll back code, and you cannot roll back a client that has already adapted.

## Unknowns become DEC-NNN

The rate limit for an unauthenticated caller, whether a partner may keep calling `/v1` past the
sunset date, the maximum page size a bulk consumer needs — business answers, not derivable ones
(§15.2). Record `DEC-NNN` in `<root>/decisions/<slug>.md`, design everything that does not depend on
it, and mark what does `N/A — blocked by DEC-NNN`.

**Never set `status: assumed`.** Only a named human may (§15.2). Recording the question and then
writing the contract to your own recommended default is the same guess with better paperwork — and
a contract is the worst place for one, because it is published, generated into clients, and then
true.

## Do not

Implement anything. Design the schema (G3) or mirror it. Edit `api-as-is.md` — it is GK's output,
and editing it hides the divergence the diff exists to surface. Set `status: approved`. Declare your
own gate `SKIPPED`. Change the contract during implementation: a needed change goes back through
`/sdlc-api` (§6, and `DEV-PROFILE §API surface` says the same).
