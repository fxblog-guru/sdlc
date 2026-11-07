# Security at principal level (G2)

Read this when the design authenticates users or services, decides who may read or change an
object, holds a secret, or adds a dependency. The G2 checklist rows 30–33 cite this file. A junior
threat model lists STRIDE. A principal design closes each threat with a standard mechanism, checked
on the server, for every object.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Never invent authentication | Home-made tokens get signing, expiry and revocation wrong. Use OIDC / OAuth 2.1 with PKCE, or the platform's session | — |
| 2 | Authorise every object, on the server | A role check at the route does not stop user A reading user B's invoice by id (IDOR) | Public data |
| 3 | Deny by default | A new endpoint is closed until a rule opens it | — |
| 4 | Short-lived credentials, revocable | A stolen token that lives a month is a month-long breach. Access tokens in minutes; refresh tokens rotated and revocable | — |
| 5 | Secrets live in a secret store | Code, config files, images and logs are copied everywhere | Local development values that grant nothing |
| 6 | Least privilege for people and services | Each credential can do one job; a leak costs one job | — |
| 7 | Validate input at the boundary, encode output at the sink | Injection happens where data becomes code: SQL, HTML, shell, prompt | — |
| 8 | Dependencies are code you did not review | Pin them, take them from a known registry, scan them, know their licence | — |
| 9 | Log security events, never secrets or personal data | You need to see the attack, not leak during it | — |
| 10 | Compliance follows from controls | Map GDPR or SOC 2 to the controls you have; do not write controls to pass an audit | Projects that name no regime |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Server session · token (JWT) | One web app, one backend: simpler, revocable at once | Several APIs or services must verify without a shared store; keep it short-lived |
| RBAC · ABAC / relationship-based | A few roles cover it | Access depends on ownership, tenant or sharing |
| Managed identity provider · own login | Almost always | Never, unless identity is the product |
| Secret manager · platform environment | Rotation, audit and many services | One small deployment on a platform that encrypts its environment |
| Pin exact versions · ranges | Applications | Libraries published for others |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| A custom token: base64 of the user id, or a JWT signed with a hard-coded key | Token format designed in the document instead of a named standard |
| `GET /invoices/{id}` checks only that the caller is logged in | No ownership or tenant check on an object fetched by id |
| A 30-day access token with no revocation | Lifetime long, no rotation, no revoke path on logout or password change |
| API key in `config.yaml` or the Dockerfile | A secret value, or a place for one, in a file that is committed or built into an image |
| `"lib": "^2"` or `latest` in a new dependency | No lockfile, a range, or an unknown registry |
| Logging the request body | Bodies, headers or tokens in the log design |

G2 fails a design that commits one of these without an accepted risk signed by a named human.
