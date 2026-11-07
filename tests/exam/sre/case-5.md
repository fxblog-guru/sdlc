# release-plan.md (excerpt) — orders

## Backup

Postgres: point-in-time recovery with WAL archiving. RPO 5 minutes, RTO 1 hour. Restore drill on 2026-10-20 restored production to a new instance in 38 minutes (`deployment/orders/runs/20261020-101500-ab12/deploy-run.md`).

## Artifact

CI builds the image once; the digest `sha256:4f1c…` is promoted dev → staging → prod unchanged.

## Rollout

Canary: 5 % of traffic for 30 minutes; automatic abort if SLO-002 error rate exceeds 1 % or p95 exceeds 400 ms; then 25 %, then 100 %.

## Capacity

It will scale horizontally. Payment API calls retry until they succeed.
