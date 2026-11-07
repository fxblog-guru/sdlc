// Writes the role exams (roadmap Step 9) from one table: per role, a clean baseline and one variant
// per checklist row the role owns, each breaking that row and nothing else. Case files are numbered
// in a fixed shuffled order so a file name never gives the flaw away; the answer key is key.json,
// which the reviewer taking the exam is never given.
//   node tests/exam/build.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const ROLES = {
  architect: {
    title: 'architecture.md (excerpt) — orders',
    reviewer: 'skills/dev-reviewing-design/SKILL.md',
    principles: 'skills/dev-brainstorming-architecture/architecture-principles.md',
    base: {
      'Quality attributes': '| Attribute | Scenario | Traded for |\n|---|---|---|\n| latency | GET /orders answers in p95 < 300 ms at 200 rps with one of three nodes down | eventual consistency of the search index (up to 30 s behind) |\n| extensibility | next: order notes, partial refunds; both are new tables and endpoints, the core flow is unchanged | — |',
      Components: 'One deployable, the orders API, plus the existing background worker. No new service: one team owns orders and deploys it as one unit.',
      'Writes': 'Placing an order inserts the order, its lines and an outbox row in one database transaction. The worker relays outbox rows to the `OrderPlaced` topic and marks them sent.',
      Migration: 'N/A — no running system is replaced; orders are a new capability.',
      Tenancy: 'Single-tenant: one customer per deployment (ADR-004).',
    },
    flaws: {
      25: { 'Quality attributes': '| Attribute | Scenario | Traded for |\n|---|---|---|\n| latency | The API must be fast | — |\n| scalability | Scales with demand | — |\n| extensibility | next: order notes, partial refunds; both are new tables and endpoints, the core flow is unchanged | — |' },
      26: { Components: 'The orders API, plus a new notifications service that sends the order emails. It is split out for separation of concerns. Both are owned by the orders team and released together.' },
      27: { 'Writes': 'Placing an order saves the order and its lines to Postgres, then the handler publishes `OrderPlaced` to the topic.' },
      28: { Migration: 'Orders replace the legacy order module of the ERP. Cutover: on 2026-12-01 all traffic moves to the new API and the ERP module is switched off.' },
      29: { Tenancy: 'Multi-tenant, shared schema with a `tenant_id` column (ADR-007). The gateway verifies the tenant claim in the token. Queries: `SELECT * FROM orders WHERE id = $1`; `SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`.' },
    },
  },
  security: {
    title: 'architecture.md + threat-model.md (excerpt) — orders',
    reviewer: 'skills/dev-reviewing-design/SKILL.md',
    principles: 'skills/dev-modeling-threats/security-principles.md',
    base: {
      Authentication: 'Sign-in through the company identity provider with OIDC authorization code and PKCE. The API verifies access tokens (RS256) against the provider\'s published keys.',
      'Object access': '`GET /orders/{id}` and `PATCH /orders/{id}` load the order with `WHERE id = $1 AND owner_id = <caller>`; anything else is 404. Admins use a separate audited endpoint.',
      Credentials: 'Access tokens live 10 minutes. Refresh tokens rotate on every use and are revoked on sign-out and password change. The database password and the client secret are in the cloud secret manager, read at start-up.',
      Dependencies: 'New: `github.com/coreos/go-oidc/v3` v3.11.0, pinned in go.mod and go.sum, fetched through proxy.golang.org. `govulncheck` and the licence check (Apache-2.0) run in CI.',
    },
    flaws: {
      30: { Authentication: 'The API mints its own tokens: a JWT (HS256) with `{uid, role}`, signed with a key from the secret manager, valid 10 minutes, returned by `POST /login` after a bcrypt password check.' },
      31: { 'Object access': '`GET /orders/{id}` and `PATCH /orders/{id}` require the `customer` role. The order is loaded with `WHERE id = $1`.' },
      32: { Credentials: 'Access tokens live 10 minutes. Refresh tokens rotate on every use and are revoked on sign-out and password change. The database password is in the secret manager; the identity provider client secret is in `config/app.yaml`, which is committed.' },
      33: { Dependencies: 'New: `github.com/coreos/go-oidc/v3`, added with `go get github.com/coreos/go-oidc/v3@latest`; go.sum is in .gitignore so CI resolves the newest version.' },
    },
  },
  data: {
    title: 'data-model.md (excerpt) — orders',
    reviewer: 'skills/dev-reviewing-data/SKILL.md',
    principles: 'skills/dev-modeling-data/data-principles.md',
    base: {
      Sources: 'The customer\'s address is owned by the customers service (`customers.address`). An order keeps `address_at_order`, a snapshot copied at checkout and never edited.',
      'Owners and consumers': 'Owner of every table here: the orders team. Analytics reads the view `analytics.orders_v1`; change policy: additive within v1, a breaking change ships as v2 with 90 days of overlap.',
      History: 'Each status change appends a row to `order_status_history` (from, to, actor, at). Approvals are rows in `order_approvals`, never overwritten.',
      Loads: 'Nightly product import: rejects rows with no SKU, duplicate SKUs or a price ≤ 0, and stops if the file is older than 26 hours; rejected rows go to `import_rejects` with the reason. `fct_order_lines` has one row per order line.',
      'Keys and time': 'Surrogate keys (UUIDv7). Timestamps are `timestamptz` in UTC; `created_at` is event time, `loaded_at` is load time.',
    },
    flaws: {
      28: { Sources: 'The customer\'s address is in `customers.address` and in `orders.shipping_address`. The support tool edits whichever one the agent opens, and the checkout reads `orders.shipping_address` when present.' },
      29: { 'Owners and consumers': 'Owner of every table here: the orders team. The analytics team reads `orders` and `order_lines` directly with a read-only database user.' },
      30: { History: 'Order status is a column on `orders`, updated in place. An approval sets `approved_by` and `approved_at` on the order, overwriting any earlier approval.' },
      31: { Loads: 'Nightly product import: `COPY products FROM` the supplier\'s CSV. `fct_order_lines` has one row per order line.' },
      32: { 'Keys and time': 'Customers are keyed by email. Timestamps are `timestamp` (no zone) in the server\'s local time.' },
    },
  },
  sre: {
    title: 'release-plan.md (excerpt) — orders',
    reviewer: 'skills/dev-reviewing-deployment/SKILL.md',
    principles: 'skills/dev-planning-deployment/sre-principles.md',
    base: {
      Backup: 'Postgres: point-in-time recovery with WAL archiving. RPO 5 minutes, RTO 1 hour. Restore drill on 2026-10-20 restored production to a new instance in 38 minutes (`deployment/orders/runs/20261020-101500-ab12/deploy-run.md`).',
      Artifact: 'CI builds the image once; the digest `sha256:4f1c…` is promoted dev → staging → prod unchanged.',
      Rollout: 'Canary: 5 % of traffic for 30 minutes; automatic abort if SLO-002 error rate exceeds 1 % or p95 exceeds 400 ms; then 25 %, then 100 %.',
      Capacity: 'Expected peak 300 rps (three times the usual 100 rps); headroom 2×; first to saturate: database connections (pool of 80). Payment API calls: 3 s timeout, 2 retries with exponential backoff, circuit breaker after 5 failures.',
    },
    flaws: {
      24: { Backup: 'Postgres: automated daily snapshots are enabled. RPO 5 minutes, RTO 1 hour.' },
      25: { Artifact: 'Each environment\'s deploy job checks out the release tag and runs `docker build`, then pushes and deploys that image.' },
      26: { Rollout: 'Deploy to all nodes at once, then watch the dashboard for 15 minutes.' },
      27: { Capacity: 'It will scale horizontally. Payment API calls retry until they succeed.' },
    },
  },
  pm: {
    title: 'problem.md (excerpt) — release approvals, change class initiative',
    reviewer: 'skills/dev-reviewing-intake/SKILL.md',
    principles: 'skills/dev-framing-problem/product-principles.md',
    base: {
      'Success looks like': 'Outcome (north star): weekly active teams that ship a release through the tool. Inputs: releases created per team, time from submit to approval. Guardrail: support tickets per release must not rise.\nKill: fewer than 5 of the 20 pilot teams approve a release in the tool within 6 weeks.',
      Evidence: '14 support tickets about approvals by email (SUP-201 to SUP-214) and interviews with three release managers (`intake/approvals/research.md`).',
      'Smallest test': 'A feature flag for 3 pilot teams for two weeks; then 25 % of teams; then everyone.',
    },
    flaws: {
      15: { 'Success looks like': 'Launch the approvals page and reach 10,000 page views in the first month.\nKill: fewer than 5 of the 20 pilot teams approve a release in the tool within 6 weeks.' },
      16: { Evidence: 'Competitor Y has release approvals, so our users want them too.' },
      17: { 'Smallest test': 'Build the complete approvals feature and release it to all customers on 2026-12-01.' },
    },
  },
  ba: {
    title: 'requirements.md + glossary.md (excerpt) — release approvals',
    reviewer: 'skills/dev-reviewing-requirements/SKILL.md',
    principles: 'skills/dev-decomposing-requirements/domain-modelling.md',
    base: {
      Glossary: '| Term | Meaning | Not |\n|---|---|---|\n| Release | A set of changes shipped together | deploy, version |\n| Train | The schedule a release rides on | sprint |',
      Process: 'Approval: `draft → submitted` (author) · `submitted → approved | rejected` (approver) · `submitted → expired` after 72 hours (timer) · `rejected → draft` (author) · `submitted → draft` when the author withdraws. Forbidden: `approved → draft`. AC-010 rejection, AC-011 expiry, AC-012 withdrawal.',
    },
    flaws: {
      19: { Glossary: '| Term | Meaning | Not |\n|---|---|---|\n| Release | A set of changes shipped together | deploy, version |\n| Account | The account | user |\n\nREQ-003: an account signs in with SSO. REQ-009: the account is invoiced monthly for its seats.' },
      20: { Process: 'Approval: the author submits the release, the approver approves it, then it ships.' },
    },
  },
  ux: {
    title: 'ui-spec.md (excerpt) — releases list',
    reviewer: 'skills/dev-reviewing-ui/SKILL.md',
    principles: 'skills/dev-specifying-ui/ux-principles.md',
    base: {
      Navigation: 'Top navigation: Releases, Trains, Settings (glossary terms). Task "approve a release": Releases → the row\'s Approve button, two steps from home. Row actions Edit and Delete are always-visible labelled buttons.',
      Accessibility: 'Tab order follows reading order. A dialog moves focus to its first field and returns it to the trigger on close. A failed save moves focus to the error summary. "Saved" and "Upload failed" are announced in a polite live region. Icon buttons have accessible names (Close, Search).',
    },
    flaws: {
      33: { Navigation: 'Top navigation: Entities, rel_train records, Settings. Row actions Edit and Delete appear when the pointer hovers over the row.' },
      34: { Accessibility: 'Dialogs open over the page. A toast shows "Saved" for three seconds. The close and search buttons are ✕ and 🔍 icons.' },
    },
  },
  research: {
    title: 'research.md (excerpt) — release approvals',
    reviewer: 'skills/dev-reviewing-intake/SKILL.md',
    principles: 'skills/dev-framing-problem/user-research.md',
    base: {
      Findings: 'Interviews with five release managers (Ana, Bo, Chen, Dee, Eli), 30 minutes each, asking about the last release they approved. Four forward a PDF by email and track replies in a spreadsheet. Quote (Bo): "I chase three people every Friday." Against the plan: Eli\'s team approves in a chat thread and saw no need for a tool.',
    },
    flaws: {
      19: { Findings: 'We asked release managers whether they would use an approvals page, and they said they would love it. Users clearly need approvals in the tool.' },
    },
  },
  prioritisation: {
    title: 'tasks.md (excerpt) — release approvals',
    reviewer: 'skills/dev-reviewing-plan/SKILL.md',
    principles: 'skills/dev-planning-implementation/prioritisation.md',
    base: {
      Order: 'TASK-001 the walking skeleton: submit → approve through every layer, behind a flag. TASK-002 the Jira sync, the riskiest part (an unknown API), second. TASK-003–006 widen. Won\'t, this release: bulk approval, email digests. Order proposed by the planner; ranked by Luan on 2026-10-22.',
    },
    flaws: {
      25: { Order: 'TASK-001 the settings page, TASK-002 the email templates, TASK-003 the approvals list, TASK-004 the Jira sync, TASK-005 bulk approval, TASK-006 email digests. All are P1.' },
    },
  },
  docs: {
    title: 'release-packet.md (excerpt) — export notes',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/user-docs.md',
    base: {
      'Release notes': 'Exports now include each release\'s notes. The `--format` flag of `afx export` replaces `--type`; to upgrade, change `--type csv` to `--format csv` (the old flag stops working in 2.0). Help: `afx export --help` and `docs/how-to/export.md`; its examples run in CI (`tests/docs.test.mjs`).',
    },
    flaws: {
      21: { 'Release notes': 'Refactored the export service (a1b2c3d, d4e5f6a). Renamed --type to --format.' },
    },
  },
  incident: {
    title: 'post-release.md (excerpt) — payments',
    reviewer: 'skills/dev-reviewing-monitoring/SKILL.md',
    principles: 'skills/dev-designing-observability/incident-response.md',
    base: {
      'Incident readiness': 'Severity: SEV1 payments failing for any user, SEV2 degraded over 5 %, SEV3 one customer. On call: the payments rotation, commander Dee for the launch week. Every alert in observability.md links its runbook; the first step of each is "switch off the `new-checkout` flag", then diagnose.',
    },
    flaws: {
      25: { 'Incident readiness': 'If something goes wrong, the team investigates the logs and fixes it. Alerts go to the #payments channel.' },
    },
  },
  cost: {
    title: 'post-release.md (excerpt) — search',
    reviewer: 'skills/dev-reviewing-monitoring/SKILL.md',
    principles: 'skills/dev-designing-observability/cost-after-release.md',
    base: {
      'Value and cost': 'Tagged `feature=search`. Budget alert at $300/month, set on 2026-10-01 before launch. Month one: $240 against an estimate of $220; $0.004 per search; the embedding model is capped at 50,000 calls a day.',
    },
    flaws: {
      26: { 'Value and cost': 'The cloud bill for October was $240. The embedding model is called on every search.' },
    },
  },
  cicd: {
    title: '.gitlab-ci.yml review notes (excerpt) — orders',
    reviewer: 'skills/dev-reviewing-deployment/SKILL.md',
    principles: 'skills/dev-designing-cloud/ci-cd.md',
    base: {
      Pipeline: 'Images pinned by digest (`node:22.11@sha256:…`). Cloud access through GitLab OIDC to a role scoped to the deploy. `deploy:prod` runs only on the protected `main` branch, in the protected `production` environment, with one approver. No job has `allow_failure`.',
    },
    flaws: {
      29: { Pipeline: '`image: node:latest`. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are CI variables. `deploy:prod` runs on any branch. `test:e2e` has `allow_failure: true`.' },
    },
  },
  desktop: {
    title: 'release-packet.md (excerpt) — meeting-capture 0.9 (desktop)',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/desktop.md',
    base: {
      Release: 'Windows installer signed with the company certificate; macOS build signed and notarised. Channel `beta` first, then `stable` at 10 % → 50 % → 100 % over a week. Last good build 0.8.3 kept ready to re-publish as 0.9.1. The e2e suite ran against the packaged build on Windows and macOS. BrowserWindow: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.',
    },
    flaws: {
      22: { Release: 'The Windows installer is unsigned for now (users click "Run anyway"). The update goes to every user at once. Tested with `npm start`. BrowserWindow: `nodeIntegration: true` so the renderer can read files directly.' },
    },
  },
  extension: {
    title: 'release-packet.md (excerpt) — afx-router 1.1 (extension)',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/vscode-extension.md',
    base: {
      Release: 'Activation: `onCommand:afxRouter.start` and `onView:afxRouter.accounts`. The proxy server, the refresh timer and the helper process are pushed to `context.subscriptions`. The helper is spawned with `env: { PATH, HOME }` only. Contributions are unchanged from 1.0.0 (diffed); version 1.1.0.',
    },
    flaws: {
      23: { Release: 'Activation: `*`. The proxy server starts in `activate` and is closed when the user stops it. The helper is spawned with `env: process.env`. The command `afxRouter.start` is renamed `afxRouter.run`; version 1.1.0.' },
    },
  },
  clipack: {
    title: 'release-packet.md (excerpt) — afx 2.4 (cli)',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/cli.md',
    base: {
      Release: 'Contract diff against 2.3.0: one new flag `--bundle`, no exit code or `--json` field changed, so 2.4.0. `--json` writes only JSON to stdout; progress goes to stderr. CI installs the built wheel on Windows and Linux and runs the golden tests. `afx remove` asks for confirmation, or takes `--yes`.',
    },
    flaws: {
      24: { Release: '`afx update` now exits 0 when nothing was updated (it exited 1); released as 2.3.1. `--json` prints "Checking…" before the JSON. Tested from the source checkout. `afx remove` deletes without asking.' },
    },
  },
  aipack: {
    title: 'release-packet.md (excerpt) — rag-reference-guide 0.4 (ai)',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/ai-app.md',
    base: {
      Release: 'Model `claude-sonnet-5-5` pinned in config. Prompt `answer.v4` replaces v3: eval 34/40 → 37/40 on `evals/cases` (results in `evals/results/0.4.json`). Caps: 4,000 output tokens per call, 20,000 calls a day. Logs keep the prompt version and token counts, not the prompt text.',
    },
    flaws: {
      25: { Release: 'Model `latest`. The answer prompt was reworded to sound friendlier; it looked better in the demo. No per-call or daily cap. Full prompts and answers are logged for debugging.' },
    },
  },
  mobilepack: {
    title: 'release-packet.md (excerpt) — field-app 2.0 (mobile)',
    reviewer: 'skills/dev-reviewing-release/SKILL.md',
    principles: 'skills/dev-packaging-release/mobile.md',
    base: {
      Release: 'Store rollout 5 % → 20 % → 100 % over ten days. Minimum supported app version 1.6; the API still returns `site_name`, which 1.6 reads. Location is asked when the user first taps "Check in", with the reason. Every screen shows its last data offline, with a banner.',
    },
    flaws: {
      26: { Release: 'Released to 100 % in both stores. The API renames `site_name` to `site`, which 2.0 reads. All permissions are requested on first launch. Screens show a spinner, then "Network error".' },
    },
  },
};

const render = (title, sections) => `# ${title}\n\n${Object.entries(sections).map(([h, b]) => `## ${h}\n\n${b}\n`).join('\n')}`;

/**
 * A fixed shuffle so case-N never lines up with row order, rotated so the clean case (index 0) is never
 * case-1: a reviewer who learned "the first one is fine" would pass a case it never read.
 */
const order = (n, seed) => {
  const o = Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7 + seed) % n) - ((b * 7 + seed) % n));
  while (o[0] === 0) o.push(o.shift());
  return o;
};

export function build(dir = HERE) {
  const key = {};
  let seed = 3;
  for (const [role, r] of Object.entries(ROLES)) {
    const variants = [['clean', r.base], ...Object.entries(r.flaws).map(([row, change]) => [Number(row), { ...r.base, ...change }])];
    const roleDir = join(dir, role);
    rmSync(roleDir, { recursive: true, force: true });
    mkdirSync(roleDir, { recursive: true });
    const cases = {};
    order(variants.length, seed++).forEach((vi, i) => {
      const [row, sections] = variants[vi];
      const name = `case-${i + 1}`;
      writeFileSync(join(roleDir, `${name}.md`), render(r.title, sections));
      cases[name] = row === 'clean' ? [] : [row];
    });
    key[role] = { reviewer: r.reviewer, principles: r.principles, rows: Object.keys(r.flaws).map(Number), cases };
  }
  writeFileSync(join(dir, 'key.json'), `${JSON.stringify(key, null, 2)}\n`);
  return key;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const key = build();
  console.log(Object.entries(key).map(([r, k]) => `${r}: ${Object.keys(k.cases).length} cases`).join(' · '));
}
