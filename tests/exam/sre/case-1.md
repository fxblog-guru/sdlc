# release-plan.md (excerpt) — orders

## Backup

Postgres: point-in-time recovery with WAL archiving. RPO 5 minutes, RTO 1 hour. Restore drill on 2026-10-20 restored production to a new instance in 38 minutes (`deployment/orders/runs/20261020-101500-ab12/deploy-run.md`).

## Artifact

Each environment's deploy job checks out the release tag and runs `docker build`, then pushes and deploys that image.

## Rollout

Canary: 5 % of traffic for 30 minutes; automatic abort if SLO-002 error rate exceeds 1 % or p95 exceeds 400 ms; then 25 %, then 100 %.

## Capacity

Expected peak 300 rps (three times the usual 100 rps); headroom 2×; first to saturate: database connections (pool of 80). Payment API calls: 3 s timeout, 2 retries with exponential backoff, circuit breaker after 5 failures.
