---
template_for: slices
gate: G7
authored_by: /sdlc-fast
reviewed_by: dev-reviewing-implementation
---

<!--
The plan of a `fast` slug (DEV-CONTRACTS §15.1), in place of tasks.md. It is short on purpose: the
spec is G1's, the look is G5's, and this file only says in which order the product becomes usable.
A slice is judged by what a user can do with it, never by the layer it builds. Slice 1 is always
the deploying skeleton, so every later slice ships through the pipeline the day it is done.
fast-check.mjs checks it mechanically; each G7 slice log judges the row it built.
-->

---
slug: <slug>
stage: plan
artifact: slices
status: draft
authored_by: /sdlc-fast
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Requested

<The requester's own words asking for the fast track, quoted, with the date (YYYY-MM-DD) and their name. What they asked for is what this file is held to.>

## Skeleton

<Slice 1, before any feature. One line each:>

- Pipeline: <the CI file, e.g. `.gitlab-ci.yml` — builds the image, deploys `staging` on every merge, `production` as a manual job>
- Keys: `ops/config/keys.md` — values only in the store `DEV-PROFILE §Environments` names; `env-doctor.mjs` runs before every deploy
- Staging: <the URL a smoke run hits>

## Slices

<One row per slice, in build order. "A user can then" is an action, not a component. Escalates is `none`, or the gates this slice brings back (G2 threat model for sign-in, permissions, secrets, money or personal data; G3 migration plan for a non-additive migration; G4 contract diff for a breaking API change). Smoke is the command or the clicks that prove the row.>

| # | Slice | A user can then | REQ | Escalates | Smoke |
|---|---|---|---|---|---|
| 1 | Deploying skeleton | open the staging URL and see the app answer `/readyz` | — | none | <command> |

## Rollout and rollback

<How the slices built so far reach production and come back, until G9 moves this section into pull-request.md. Same lines as `_templates/pull-request.md` `## Rollout and rollback`, key lines first, with the same names and values, since the QA bundle reads them: `deploy_impact: none` while no slice touches the database or an API; otherwise the keys, the DB, API, order, verify, rollback, decider and staging lines, and `### Data` once a slice changes rows already there. deploy-plan-check.mjs reads it before each slice merges.>

deploy_impact: none

## Decisions

<Each decision taken on the requester's behalf: `DEC-NNN — <one line>`, recorded `assumed` in decisions/<slug>.md so they can overturn it. `none` when there were none.>
