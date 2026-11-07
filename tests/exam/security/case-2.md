# architecture.md + threat-model.md (excerpt) — orders

## Authentication

The API mints its own tokens: a JWT (HS256) with `{uid, role}`, signed with a key from the secret manager, valid 10 minutes, returned by `POST /login` after a bcrypt password check.

## Object access

`GET /orders/{id}` and `PATCH /orders/{id}` load the order with `WHERE id = $1 AND owner_id = <caller>`; anything else is 404. Admins use a separate audited endpoint.

## Credentials

Access tokens live 10 minutes. Refresh tokens rotate on every use and are revoked on sign-out and password change. The database password and the client secret are in the cloud secret manager, read at start-up.

## Dependencies

New: `github.com/coreos/go-oidc/v3` v3.11.0, pinned in go.mod and go.sum, fetched through proxy.golang.org. `govulncheck` and the licence check (Apache-2.0) run in CI.
