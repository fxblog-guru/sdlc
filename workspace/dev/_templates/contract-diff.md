---
template_for: contract-diff
gate: G4
authored_by: dev-designing-api
reviewed_by: dev-reviewing-api
---

<!--
This document exists because breaking changes are almost never introduced on purpose — they are
discovered, usually by someone else's client, after release. Comparing the proposed contract with
the live one, field by field, is the cheapest place to catch one.

The asymmetry worth remembering: adding an optional field is safe; removing one, renaming one,
tightening a type, narrowing an enum, or changing a status code is not. "No client uses it" is a
claim that needs evidence, not an assumption.
-->

---
slug: <slug>
stage: api
artifact: contract-diff
status: draft
authored_by: dev-designing-api
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Baseline

<The live contract this is compared against: path, version, and commit or deployed revision. A diff with no stated baseline proves nothing.>

## Added

<New endpoints, fields, and enum values. Additive changes are safe; list them so reviewers can confirm they really are additive.>

| Change | Where | Optional | Notes |
|---|---|---|---|

## Changed

<Anything altered. Breaking answers "does an existing client keep working, unchanged?" — if no, it is breaking, regardless of how unlikely the case seems.>

| Change | Where | Breaking | Impact on existing clients |
|---|---|---|---|

## Removed

<Removals and renames. Every row needs a deprecation window with a date, or an ADR explaining why immediate removal is acceptable.>

| Change | Where | Deprecated since | Removal date | Consumers notified |
|---|---|---|---|---|

## Consumers

<Who calls these endpoints — internal services, mobile app versions still in the wild, third parties — and how each was checked. Name the evidence: a log query, a gateway metric, a client registry.>

## Migration path for clients

<What a client must do, by when, and what happens to clients that do nothing.>

## Versioning decision

<Additive within the current version, a new version, or a deprecation window — and the ADR id when this is breaking.>

## Standards conformance

<Confirm against DEV-CONTRACTS.md §13.1, with evidence per row. These are the checks whose absence is discovered late and expensively.>

| Rule | Conforms | Evidence |
|---|---|---|
| Every collection endpoint is paginated | <yes/no> | <endpoint list> |
| Pagination style is cursor, or offset with a written justification | <yes/no> | <…> |
| Every sort has a whitelist and a unique tiebreaker | <yes/no> | <…> |
| Filters are typed and whitelisted | <yes/no> | <…> |
| Errors use RFC 9457 problem+json, one shape | <yes/no> | <…> |
| Status codes follow the table | <yes/no> | <…> |
| Non-GET creators accept Idempotency-Key | <yes/no> | <…> |
| Updates use ETag / If-Match or a version field | <yes/no> | <…> |
| Naming, timestamps, money, and id conventions hold | <yes/no> | <…> |
| Rate limits documented; 429 returns Retry-After | <yes/no> | <…> |
| Operations over 2s return 202 with a status resource | <yes/no> | <…> |
| problems.yaml matches the ProblemType enum, one status per type (`problems-check.mjs`) | <yes/no> | <the command and its counts> |
| Every non-GET declares x-idempotency and x-concurrency; one API style (`api-style-check.mjs`) | <yes/no> | <the command, and each warning argued> |
| Schemas typed and bounded, request bodies closed, null explicit, no secret in a response, security, summaries, valid examples, the x- declarations (`api-contract-check.mjs`) | <yes/no> | <the command and its counts, each warning argued> |
| PATCH is JSON Merge Patch; `info.x-enum-policy` matches what the consumers tolerate | <yes/no> | <…> |
| Every dependency failure maps to 502/503/504 with Retry-After; partial failures stated | <yes/no> | <…> |
| Deprecated operations answer Deprecation (RFC 9745) and Sunset (RFC 8594) | <yes/no> | <…> |

### Security mapping

<OWASP API Security Top 10 (2023), one row per risk (DEV-CONTRACTS §13.12). The control is what the contract declares; the evidence is where it says so, or a checker count.>

| Risk | Control in this contract | Evidence |
|---|---|---|
| API1 Broken object level authorization | <the object check per client-supplied id> | <…> |
| API2 Broken authentication | <schemes; lockout on auth paths> | <…> |
| API3 Broken object property level authorization | <closed bodies, readOnly server fields, no secret in a response> | <…> |
| API4 Unrestricted resource consumption | <x-max-body-kb, bounds, pagination, rate limits, timeouts> | <…> |
| API5 Broken function level authorization | <the role per operation> | <…> |
| API6 Unrestricted access to sensitive business flows | <the flows with their own rate class> | <…> |
| API7 Server side request forgery | <URL inputs: format, allowlist, private ranges refused — or N/A — no URL input> | <…> |
| API8 Security misconfiguration | <x-cors, x-security-headers, 5xx bodies> | <…> |
| API9 Improper inventory management | <every operation in the contract, versioning, deprecation headers> | <…> |
| API10 Unsafe consumption of APIs | <each x-downstream: timeout, validated response, 502/503/504> | <…> |

### Compatibility check

<The machine diff against the baseline: `oasdiff breaking <baseline> <new>`, or `contract-compat.mjs <baseline> <new> --declared contract-diff.md` where oasdiff is not installed. Paste the command, its exit status and its findings; every break it reports is a row above marked breaking.>

### Load scenarios

<`api-contract-check.mjs <slug> --load-plan` — one scenario per traffic class, at rps × peak_factor. G8 runs them; the QA handoff carries them.>

### Test plan

<The G7 server contract test and its pending list; the generated client and the CI step that fails on drift; the mock (`prism mock`); the test data, stubs and environment per operation (§13.10).>
