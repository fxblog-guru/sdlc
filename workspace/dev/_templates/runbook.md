---
template_for: runbook
gate: G11
authored_by: dev-designing-observability
reviewed_by: dev-reviewing-monitoring
---

<!--
Write this for a competent engineer who did not build the feature, is being paged at 03:00, and has
never seen this code. That reader needs commands to run, not concepts to understand.

Every alert defined in observability.md gets a section here, matched by name. The chain per symptom
is always the same: how to confirm it is real, how to tell the likely causes apart, what to do
first to stop the bleeding, and who to wake if that does not work.
-->

---
slug: <slug>
stage: monitoring
artifact: runbook
status: draft
authored_by: dev-designing-observability
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Service overview

<What this feature does, its dependencies, and what breaks for users when it is down. Three sentences.>

## Dashboards and queries

<The links to open first, and the copy-pasteable log and metric queries that answer "what is happening right now".>

## Alert responses

<One section per alert in observability.md, same names. Mitigation before diagnosis: stop the harm first, understand it second.>

### <alert name>

- **Means:** <what is actually wrong when this fires>
- **Impact:** <who is affected and how badly>
- **Confirm:** <the query or check that proves it is real and not a monitoring artefact>
- **Likely causes:** <ranked, each with the check that distinguishes it>
- **Mitigate:** <the first action — flag off, scale, rollback, drain — with the exact command>
- **Escalate:** <who, when, and via which channel>

## Common operations

<Routine actions an operator may need: toggling the flag, replaying a queue, rerunning a job, clearing a cache, forcing a resync. Command, effect, and what it is safe to run twice.>

| Operation | Command | Effect | Safe to repeat |
|---|---|---|---|

## Rollback

<How to reverse the feature in production: flag, deploy, and migration — with the point after which rollback is forward-only.>

## Known failure modes

<What has actually gone wrong, or is most likely to, with the symptom that identifies each and its fix.>

| Symptom | Cause | Fix | Permanent remedy |
|---|---|---|---|

## Data recovery

<What to do if data is wrong or lost: backups, point-in-time recovery, the reconciliation job, and the consistency checks to run afterwards.>

## Contacts

<Owning team, on-call rotation, escalation path, and the upstream or vendor contacts with their support hours.>
