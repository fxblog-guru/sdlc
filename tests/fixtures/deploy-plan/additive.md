---
slug: notes
stage: release
artifact: pull-request
---

## Risk and rollout

The tag column could slow the list query; the p95 panel shows it.

## Rollout and rollback

deploy_impact: db
db_change: additive
data_change: none
rollback: redeploy-previous, down-migration

- DB migrations: 202611030900_add_note_tags
- Order: migrate before code, in the deploy job; the old build ignores the new nullable column
- Verify: the migrate job lists the applied version; `task smoke:notes` after deploy
- Rollback code: re-run `deploy_production` on the previous SHA; the column stays, unused
- Decides: Luan Nguyen
- Rehearsed on staging: 2026-11-02, migrate and deploy, green
