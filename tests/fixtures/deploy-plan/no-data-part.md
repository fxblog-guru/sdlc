---
slug: notes
stage: release
artifact: pull-request
---

## Risk and rollout

The tag column could slow the list query; the p95 panel shows it.

## Rollout and rollback

deploy_impact: db, api
db_change: expand
data_change: backfill
rollback: redeploy-previous, down-migration, snapshot-restore
backup: Neon branch `pre-<sha>` of production, taken by the snapshot_production job, kept 14 days
post_backup_writes: delta-export
api_change: additive

- DB migrations: 202611030900_split_note_title; 202611030910_backfill_note_title
- DB N-1 compatible: yes — the old build never reads `title_short`, and `title` stays until the contract deploy
- DB expand/contract: this deploy adds and fills `title_short`; dropping `title` is a later deploy, after a week with no reads
- DB lock risk: `notes` has 2.1M rows; ADD COLUMN without a default takes a brief ACCESS EXCLUSIVE lock, under 1 s
- DB backfill: `scripts/backfill/note-title.mjs`, 5,000 rows a batch, resumable from the last id
- DB snapshot: the `snapshot_production` job runs `neonctl branches create --name pre-$CI_COMMIT_SHORT_SHA` before migrating
- API versioning: not needed — additive within /v1
- API clients: web (cached bundles ignore the new field), the mobile app 2.3 and later
- API order: server first; the web reads `titleShort` only after the server is out
- Order: snapshot → migrate staging → deploy staging → smoke → snapshot → migrate production → deploy production; migrate before code, because the new code reads the new column
- Verify: `task smoke:notes` after each deploy; the migrate job prints the row counts
- Rollback code: re-run `deploy_production` on the previous pipeline's SHA
- Rollback DB: the down migration drops `title_short`; after the backfill, restore the snapshot branch instead
- Rollback API: the old shape never went away; the field is ignored by old clients
- Decides: Luan Nguyen
- Rehearsed on staging: 2026-11-02, migrate and backfill on a copy of production, 4 min, no errors

