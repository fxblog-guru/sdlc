# Keys

Every key the app reads, in every environment (DEV-CONTRACTS §13.4). Names only: a value lives in
the secret store `DEV-PROFILE §Environments` names, scoped per environment, never in git and never
in a `.env` copied by hand. The deploy job writes the env file from the store and deletes it after;
`node dev/scripts/env-doctor.mjs --env <env>` checks this list against it before every deploy.

Environments: `all`, or a comma list of `DEV-PROFILE §Environments` names. Source: `generated: <the
command>` or the third party it comes from. Format: the exact shape the app accepts, as a kind and
an optional note in brackets, e.g. `email-sender (bare address, no display name)`. Kinds: `any` ·
`url` · `postgres-url` · `host` · `port` · `int` · `email` (bare address, no display name) ·
`email-sender` (an `email` that product mail is sent from: env-doctor fails a free-mailbox domain
or one with no DMARC record) · `base64-32` · `/regex/` (no `|` inside: it splits the cell). A key
the app parses is never `any`. Changing a value in the store is a deploy: env-doctor checks it
before the redeploy that picks it up (DEV-CONTRACTS §13.4).

| Key | Purpose | Source | Environments | Holder | Rotation | Format |
|---|---|---|---|---|---|---|
| `APP_ENV` | which environment this process is | CI, per job | all | CI | never | /^[a-z]+$/ |
| `DATABASE_URL` | the app's database | <provider, one database or branch per environment> | staging, production | <role> | <on leak · yearly> | postgres-url |
