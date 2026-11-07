# Incident response (G11)

Read this when the change can hurt users if it fails in production, or when an incident happened in
the window G11 reviews. The G11 checklist row 25 cites this file; the postmortem afterwards is
`postmortem.md`. A junior team improvises during an outage. A principal team has decided in advance
who leads, how bad is bad, and what the first five minutes are.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Severity is defined before the incident | Arguing about how bad it is during an outage wastes the first minutes | — |
| 2 | One incident commander | Several people giving orders is no one giving orders | A one-person project: you are it, say so |
| 3 | Mitigate first, diagnose later | Roll back or switch off the flag; find the cause once users are safe | A mitigation that would destroy evidence the fix needs |
| 4 | Every alert links a runbook | A page at 3 a.m. with no first step is a page that waits | — |
| 5 | Communicate on a clock | Users and stakeholders hear status every N minutes, even when nothing changed | — |
| 6 | Write the timeline as it happens | Memory after the event is wrong; the postmortem needs the record | — |
| 7 | Practise | A game day finds the missing permission before the outage does | — |
| 8 | Blameless | People hide what they did when they are blamed; then nobody learns | — |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Roll back · fix forward | Almost always: the last good build is known | The rollback is impossible (a forward-only migration) |
| Page a human · ticket | Users are hurt now | Degradation with time to spare |
| Status page · direct message | Many users | One customer |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| No severity levels | The runbook has no SEV table or equivalent |
| Alerts with no runbook | An alert in `observability.md` with no linked first step |
| Debugging in production while users wait | The first step is "investigate", not "roll back or switch off" |
| No owner on call | No named person or rotation for the window |

G11 fails a release that commits one of these.
