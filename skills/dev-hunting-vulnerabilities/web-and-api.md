# Web and API — the classes that actually get exploited

Ordered by how often they turn up in real reviews, not by OWASP's numbering. Each row: what it is,
where to look, and what proves it. OWASP Top 10 (2021) and API Security Top 10 (2023) ids in
brackets, so a report can be mapped to them.

## Access control: the default bug

| Class | Look for | Proof |
|---|---|---|
| **IDOR / BOLA** [A01, API1] | every handler that takes an id from path, query or body. Is the query scoped by the caller's tenant or owner, or only by the id? | user A's token reads user B's record: a test with two users |
| **Function-level authz** [A01, API5] | admin and internal routes. Is the role checked in the handler or middleware, or only hidden in the UI? | a non-admin token calls the admin route and gets a 2xx |
| **Mass assignment** [API3] | `bind`/`decode` of the request straight into the model: `role`, `tenant_id`, `is_admin`, `owner_id`, `price` reachable from the body | a PATCH with `"role":"admin"` changes the role |
| **Tenant leakage** | list endpoints, search, exports, background jobs, caches keyed without tenant | a list or cache hit returns another tenant's row |
| **Privilege from the client** | role, plan or tenant read from a header, a cookie the client can edit, or an unverified JWT claim | an edited claim is accepted |

## Authentication and session [A07, API2]

- JWT: algorithm pinned server-side (`none` and `HS`/`RS` confusion rejected), `exp` and `aud`
  checked, key from config and not from the token's `jku`/`kid` URL.
- Password: a slow hash (argon2id, bcrypt, scrypt), never a fast hash or reversible encryption.
  Compare in constant time. Lockout or rate limit on sign-in, reset and OTP.
- Reset and invite tokens: from a CSPRNG, single use, expiring, bound to the account, and not
  logged.
- Session: rotated at sign-in and privilege change, revoked at sign-out and deactivation,
  `HttpOnly; Secure; SameSite`.
- OAuth: `state` checked, `redirect_uri` exact-match, PKCE for public clients.

## Injection [A03]

| Kind | Sink | Safe form |
|---|---|---|
| SQL | string-built query, `ORDER BY`/`LIMIT`/column name from input | placeholders; identifiers from a whitelist |
| Command | shell with interpolated input | argv array, no shell; never `shell=True` with input |
| Template / SSTI | user input as the template, not the data | render a fixed template with data |
| NoSQL | a JSON body passed as the query (`{"$ne": null}`) | typed fields, operators rejected |
| LDAP, XPath, header | CRLF in a header value, a filter built by concatenation | library escaping, CR/LF rejected |
| XSS | `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `|safe`, markdown rendered without a sanitiser | framework escaping; a sanitiser with an allow-list |

## Server-side request forgery [A10, API7]

Any feature that fetches a URL the user supplies: webhooks, image import, link preview, PDF
render, OIDC discovery. Check for an allow-list of hosts, resolution then a check against
private/link-local/metadata ranges (`169.254.169.254`, `fd00::/8`, `127.0.0.0/8`) **on the
resolved IP**, no redirects followed to a new host, and no `file://`, `gopher://` or `dict://`.

## Data exposure [A02, API3]

- Response DTOs: does the handler serialise the whole model (password hash, tokens, internal
  flags, other users' e-mails)?
- Errors: a stack trace, SQL or file path in a 500 body.
- Logs: tokens, passwords, full card numbers, personal data (§12.5).
- Crypto: TLS for every external hop; no ECB; IVs and nonces never reused; secrets at rest
  encrypted with a key that is not in the same database.

## Resource consumption [API4]

Unbounded `limit`, uncapped body size, uncapped upload, regex on input (ReDoS), zip or XML bombs,
GraphQL depth and aliasing, a single request that fans out N queries. Check §13.1's `x-max-body-kb`
and pagination caps in the handler, not just in the contract.

## Business logic [API6]

The class no scanner finds. Can a step be skipped (pay → confirm with no pay)? Can it be replayed
(redeem a coupon twice, race two withdrawals)? Can a quantity be negative? Does an idempotency key
bind to the actor? Read the state machine and try each transition out of order.

## Security misconfiguration [A05, API8]

CORS `*` with credentials, or an origin reflected without a check. Missing `Content-Security-Policy`,
`X-Content-Type-Options`, `Strict-Transport-Security` and `frame-ancestors`. Debug mode or verbose
errors on in a non-dev profile. Default credentials. Directory listing. An admin console bound to
`0.0.0.0`.

## Vulnerable and outdated components [A06]

The ledger's trivy rows. For each `high`/`critical`, check whether the vulnerable function is
reachable: a CVE in a code path never called is still fixed by bumping, but it is not an
emergency. `govulncheck` reports reachability for Go. Say so in Evidence.

## Integrity [A08]

Deserialising untrusted data into native objects (`pickle`, Java serialisation, `yaml.load`
without a safe loader, `unserialize`). Auto-update or plugin loading without a signature. Webhooks
accepted without verifying the HMAC, or verified without a constant-time compare and a timestamp
window.

## Logging and monitoring [A09]

Can you tell, from the logs, that the attack above happened? A failed authz check that logs nothing
is invisible. Each `critical`/`high` finding's fix direction names the event that would detect the
next attempt (§13.5).
