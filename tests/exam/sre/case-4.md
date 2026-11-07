# release-plan.md (excerpt) — orders

## Backup

Postgres: automated daily snapshots are enabled. RPO 5 minutes, RTO 1 hour.

## Artifact

CI builds the image once; the digest `sha256:4f1c…` is promoted dev → staging → prod unchanged.

## Rollout

Canary: 5 % of traffic for 30 minutes; automatic abort if SLO-002 error rate exceeds 1 % or p95 exceeds 400 ms; then 25 %, then 100 %.

## Capacity

Expected peak 300 rps (three times the usual 100 rps); headroom 2×; first to saturate: database connections (pool of 80). Payment API calls: 3 s timeout, 2 retries with exponential backoff, circuit breaker after 5 failures.
