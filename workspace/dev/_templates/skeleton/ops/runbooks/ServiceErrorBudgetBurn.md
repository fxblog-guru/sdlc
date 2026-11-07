# ServiceErrorBudgetBurn

The Google SRE shape: what you see, who it hurts, how to find the cause, how to stop the harm, who
to call. Written for 03:00 — commands, not concepts. One file per alert, named after it.

## Symptom

`ServiceErrorBudgetBurn` paged: more than 1.44% of requests to `app` returned 5xx over the last
hour and the last five minutes (SLO-001).

## Impact

<Who cannot do what, and how many of them. Which SLO budget is burning and how much is left.>

## Diagnose

1. Dashboard `ops/dashboards/service.json`, panel "5xx by route": which route, and since when.
2. `kubectl logs deploy/app --since=30m | jq 'select(.level=="error") | {event, route, trace_id}' | head`
3. Was there a deploy? `kubectl rollout history deploy/app`, and the deployed tag's `git log --oneline -5`.

## Mitigate

- After a deploy: roll back — `kubectl rollout undo deploy/app`, inside the release plan's time budget.
- A dependency is down: confirm its breaker is open and the degraded path is served.

## Escalate

<Owner on call, then the team lead — the channel and the phone number.>
