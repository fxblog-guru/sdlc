# Reliability at principal level (G10)

Read this when the change adds or changes a stateful store, expects more load, changes the pipeline,
or ships to users who would notice an outage. The G10 checklist rows 24–27 cite this file. A junior
plan says "deploy, then monitor". A principal plan says how the change is stopped before most users
see it, and proves the data can come back.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | A backup that has never been restored is not a backup | Restores fail on permissions, versions and missing keys, found only when needed | — |
| 2 | RPO and RTO are numbers the business chose, and the mechanism meets them | A daily backup cannot meet a 5-minute RPO | — |
| 3 | Build once, promote the same artifact | A rebuild per environment ships something nobody tested | — |
| 4 | Every change is progressive, with an automatic abort | A canary tied to an SLO stops a bad release at 5 % of users | A change no user can see, or a one-user system |
| 5 | Know the first resource that saturates | Capacity is planned on the bottleneck, not the average | — |
| 6 | Alert on symptoms users feel, not on every cause | A page for high CPU with no user impact teaches people to ignore pages | — |
| 7 | Error budgets decide between features and reliability | When the budget is spent, reliability work comes first | Systems with no SLO yet (set one) |
| 8 | Toil is measured and capped | Manual work that grows with load becomes the job | — |
| 9 | Dependencies fail; design the degradation | Timeouts, retries with backoff, circuit breakers, a reduced mode | — |
| 10 | Rollback is rehearsed | A rollback first run during an incident is a second incident | Forward-only changes, named and accepted |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Rolling · blue-green · canary | Rolling: stateless, cheap | Blue-green: instant switch back. Canary: risky change, real traffic decides |
| Snapshot · point-in-time recovery | An RPO of hours | Minutes; the store supports a log |
| Vertical · horizontal scaling | One bottleneck that a bigger node fixes | Load grows past one node, or one node is a single point of failure |
| Feature flag · branch deploy | Decouple release from deploy, roll back without a deploy | A change that cannot be flagged (a schema) |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| "Backups are enabled" | No restore test, no timing, no RTO met |
| RPO 5 minutes, nightly backup | The stated objective and the mechanism disagree |
| `docker build` in each environment's job | The pipeline rebuilds instead of promoting one digest |
| Deploy to 100 % and watch the dashboard | No canary or percentage, no automatic abort condition |
| "It will scale" | No expected peak, headroom or first bottleneck |
| Retry forever | Retries without a cap, backoff or circuit breaker |

G10 fails a plan that commits one of these without a reason a named human accepted.
