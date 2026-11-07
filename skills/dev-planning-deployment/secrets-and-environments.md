# Secrets, environments and the pipeline

Read at G0 (the questions), G6 (the two first-slice tasks) and G10 (the `## Secrets and config`
section). The rule is `DEV-CONTRACTS.md` §13.4; this file is how to meet it.

## The five questions G0 asks a human

A product whose host, environments and keys are left `assumed` reaches release day with a laptop for
a server and keys pasted by hand. Ask these at intake, as `DEC-NNN` rows that block **G2** — the host
decides the architecture (background jobs, media storage, edge or Node, a database pooler), so it
cannot wait for G10:

1. **Host.** Where production runs, and on what (a VM, a container service, serverless). A
   developer's machine behind a tunnel is an answer only as a dated stopgap a named human signs.
2. **Environments.** `local` + `staging` + `production` at least; `staging` on the same host type as
   production, with its own database (a branch is enough). One domain, a subdomain each, one label
   deep: `staging.<domain>`, `staging-admin.<domain>`.
3. **Who deploys.** `staging` deploys from the main branch on every merge; `production` is a manual
   job in the same pipeline. Name the person who presses it.
4. **The secret store.** Where every key's value lives. The host answer from question 1 picks the
   runtime store, so ask 4 after 1. See the next section.
5. **The mail sender.** When the product sends mail (sign-up, a confirmation, a reset): the address
   it sends from and the provider. The address is on a domain the product owns, never a free mailbox
   such as `gmail.com` or `outlook.com`). See *Mail from a domain the product owns*.

Never: a `.env` kept on a laptop and copied to the server, a key in a chat, a ticket or a wiki page.

## Where the values live: three places, picked by the host

A deployed key's value sits in up to three places, each for one reader. A developer's machine is not
one of them.

| Place | Who reads it | What goes there |
|---|---|---|
| **Runtime store** of the host | the running app | every key the app reads in that environment |
| **CI store** | the pipeline | only what the deploy job needs: the host's deploy credential, and the migration database URL when CI migrates. When the host has no runtime store, every app key goes here too |
| **Recovery copy** in the owner's password manager (Bitwarden, 1Password, a vault) | the owner, by hand | every production key whose loss cannot be undone: encryption keys, signing keys, the database owner's password |

The runtime store for each host. When the deploy job injects values, the app never sees a file.

| Host | Runtime store | How the deploy sets it |
|---|---|---|
| Cloudflare Workers / Pages | Worker secrets per environment (`wrangler secret put --env <env>`), or Secrets Store bindings | a push script or `wrangler secret bulk`; bindings in `wrangler.jsonc` |
| AWS (ECS, Lambda, EC2, EKS) | Secrets Manager, or SSM Parameter Store `SecureString` | the task, function or role reads it by ARN; CI assumes a role through OIDC and holds no access keys |
| Google Cloud (Cloud Run, GKE, Functions) | Secret Manager | `--set-secrets` / a secret volume; CI uses Workload Identity Federation |
| Azure (App Service, Container Apps, AKS) | Key Vault | Key Vault references or a managed identity |
| Kubernetes, any cloud | the cloud's store above, synced by External Secrets Operator, or Sealed Secrets in git | an `ExternalSecret` per environment; never a plain `Secret` in git |
| Vercel, Netlify, Fly.io, Render, Railway | the platform's environment variables or secrets per environment (`fly secrets set`, `vercel env add`) | a push script or the platform CLI from CI |
| A VM or VPS with docker compose | none of its own: the CI store, environment-scoped | the deploy job passes the values into the container (`environment:` from job variables), with no `.env` left on the host |
| SOPS + age, `ops/config/<env>.enc.env` | the encrypted file in git, for an owner who wants keys reviewed like code | `sops -d` in the job; the age private key lives only in the CI store and the recovery copy |

The CI store follows the forge: GitLab CI/CD variables (environment-scoped, masked, protected for
production), GitHub Actions environment secrets (with required reviewers on `production`), Bitbucket
deployment variables. Use OIDC to the cloud wherever the forge and the cloud both support it, so no
long-lived cloud key sits in CI at all.

**Local is for development only.** `local` runs on its own values: generated test keys, a local or
branch database, provider test keys (`sk_test_…`). A production value in a file on a developer's
machine is a finding, even when it got there only to be pushed. The push script reads the owner's
recovery copy or an env file that it deletes when it finishes, prints names only, and has
`--dry-run`.

## The key list

`ops/config/keys.md` (template in `_templates/skeleton/ops/config/keys.md`) has one row per key the app
reads: name, purpose, source (`generated: openssl rand -base64 32`, or the third party), the
environments that need it, who holds it, how it is rotated, and its format. It holds names, never a
value. `ops/config/<env>.env.example` stays in step with it. A key the code reads that is not on the
list is a G7 finding; a row nobody reads is removed.

## The pipeline, as the first slice of G6

Two tasks, both in the first slice, before features:

- **Pipeline: build the image, deploy it to `staging`.** Lint and test, build an image pinned by
  digest, push it to a registry, deploy to `staging` on the real host, check `/readyz`. Hello-world
  on the real host, with the real database and the real domain: a walking skeleton. Host-specific
  problems (a pooler that rejects a setting, a clock that breaks TOTP, DNS, TLS) show up here, months
  before release.
- **Keys in the store, `env-doctor` green.** Every row of `keys.md` set in the store for `staging`
  and `production`, and `node dev/scripts/env-doctor.mjs --env <env> --store gitlab --project <id>`
  exits 0 for both.

## The deploy job

```
deploy:<env>:
  environment: <env>              # scopes the CI variables to this environment
  script:
    - write the env file from the CI variables the job received (or `sops -d ops/config/<env>.enc.env`)
    - node dev/scripts/env-doctor.mjs --env <env> --file <env file> --clock-url https://<host>
    - pull the image by digest, start it, wait for /readyz
    - delete the env file
  rules: main branch → staging automatically; production → when: manual
```

The env file exists only for the length of the job. A deploy step that says "copy the key into
`.env`" or "edit the server's env file" is a finding at G10 (`dev-reviewing-deployment`).

## A value changed in a store is a deploy

A key's value edited by hand in the host's runtime store reaches users on the next restart, and the
host's "redeploy" button starts the app without the pipeline, so without `env-doctor.mjs`. One wrong
character (a sender written `Name <a@b.dev>` where the app accepts a bare address) and every request
fails until someone rolls back. So a value change, a rotation included, is planned like a release:

1. **Write the exact shape first.** The key's Format in `keys.md` says what the app accepts:
   `email` (a bare address), `email-sender`, `url`, `/regex/`. A Format of `any` on a key the app
   parses is a gap.
2. **Keep the way back:** keep the previous deployment promotable. Before the change, note the deployment now serving and confirm the host
   can return to it in one step: Vercel *Promote* (or *Instant Rollback*) on the previous
   deployment, Netlify *Publish deploy* on the last good one, Cloud Run traffic back to the previous
   revision, ECS the previous task definition, Fly `fly deploy --image <previous>`, Kubernetes
   `kubectl rollout undo`, compose the previous digest. Some hosts give a new deployment the store's
   current values, so the way back is the previous deployment, not a new build of the old commit.
   The old value goes back into the store too, or the next deploy fails again.
3. **Check, then deploy.** Change the value, then run the pipeline's deploy job, which runs
   `env-doctor.mjs`. Where the host must redeploy by itself, run a pipeline job first that reads the
   store into its own env file (`vercel env pull`, the cloud CLI's secret read), runs
   `env-doctor.mjs --env <env> --file <that file>` and deletes the file. Where the store cannot be
   read back (Fly secrets, Worker secrets), the job checks the new value before it sets it. It
   prints names and problems, never values, and it runs in CI, not on a developer's machine.
4. **Watch it serve.** `/readyz` and one real request after the redeploy; a failure promotes the
   previous deployment, it is not debugged in production.

The runbook step reads: the key, the environment, the Format, the `env-doctor` `READY` line, the
deployment to promote if it fails. A step that says "update the value in the dashboard and
redeploy" fails G10 row 31.

## Mail from a domain the product owns

A provider's `sent` is not delivery. Mail from a `@gmail.com` address relayed through a provider
fails DMARC alignment: the app logs the message as sent, the provider accepts it, and the Gmail
recipient never sees it. Product mail is sent from a domain the product owns (`hello@<domain>`, or a
subdomain such as `mail.<domain>`), decided at G0 with the host.

Before the first mail ships, add the provider's records to DNS:

| Record | What it is | Notes |
|---|---|---|
| DKIM | the provider's signing key: a TXT or CNAME at `<selector>._domainkey.<domain>` | the selector is the provider's; pass it to `env-doctor.mjs --dkim-selector` |
| DMARC | TXT at `_dmarc.<domain>`: `v=DMARC1; p=none; rua=mailto:<reports address>` at least | start at `p=none` with reports; tighten to `quarantine` once the reports are clean |
| SPF or return-path | SPF `include:` on the sending domain, or the provider's branded return-path or bounce subdomain (a CNAME) | whichever the provider uses for alignment; one SPF record per name |
| verification | the provider's TXT that proves the domain is yours | the provider will not send from the domain until it sees it |

Then prove it:

- `env-doctor.mjs --env <env>` with DNS: it fails a sender key on a free-mailbox domain or a domain
  with no `v=DMARC1` record, and warns on a DMARC record with no `rua=` and on no DKIM key under the
  selectors it tries. `--no-dns` skips the lookups, never the free-mailbox check.
- The provider's domain page shows each record verified.
- **Send a real test to a Gmail and an Outlook inbox** and record where it landed (inbox, spam, not
  at all) with the message headers' `dkim=pass` and `dmarc=pass`. "sent" is not "delivered": only
  the inbox says it arrived. This is the evidence for G10 row 32.
