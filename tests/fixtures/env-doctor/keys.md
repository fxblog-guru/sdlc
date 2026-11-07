# Keys

| Key | Purpose | Source | Environments | Holder | Rotation | Format |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | the app's Postgres | Neon branch per environment | staging, production | owner | on leak | postgres-url |
| `PUBLIC_HOST` | the site's own host | DNS | all | owner | never | host |
| `TOTP_KEY` | seals second factors | generated: `openssl rand -base64 32` | staging, production | owner | yearly | base64-32 |
| `SMTP_PORT` | mail relay port | mail provider | production | owner | never | port |
| `RELEASE_TAG` | image tag | CI | all | CI | per deploy | /^v\d+\.\d+\.\d+$/ |
