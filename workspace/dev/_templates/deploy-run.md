---
template_for: deploy-run
gate: G10
authored_by: dev-planning-deployment
reviewed_by: dev-reviewing-deployment
---

<!--
The release plan says what should happen; this record says what did. They are different documents
because they diverge, and the divergence is the useful part — it is where the next plan gets better.

Record timestamps as they happen rather than reconstructing them afterwards. An honest "step 4 took
22 minutes, not the 5 we estimated" is worth more than a tidy narrative written the next morning.
-->

---
slug: <slug>
stage: deployment
artifact: deploy-run
status: draft
authored_by: dev-planning-deployment
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Run

<run-id, environment, commit SHA, image digest, who ran it, start and end time.>

## Preconditions checked

<Each precondition from the release plan, with how it was confirmed at deploy time — not when the plan was written.>

## Steps executed

<One row per step as it happened, including the ones that deviated from the plan.>

| # | Step | Started | Finished | Result | Notes |
|---|---|---|---|---|---|

## Migrations run

<Each MIG with its actual duration, lock behaviour observed, and row counts before and after.>

| MIG | Started | Duration | Rows affected | Result |
|---|---|---|---|---|

## Smoke checks

<What ran, what it asserted, and the result. A skipped smoke check is recorded as skipped, with the reason.>

## Rollout progression

<For a canary or phased rollout: each stage, the traffic share, the soak time, the metrics observed, and the promote or abort decision with who made it.>

## Deviations from the plan

<Everything that did not go as written, and what was done instead. This section is why the record exists.>

## Incidents

<Anything that went wrong, the detection time, the action taken, and the customer impact. "None" is a valid and welcome answer.>

## Final state

<What is live where, the flag state per environment, and what remains to be promoted.>

## Follow-ups

<Actions this run generated, each with an owner and a date — including fixes to the release plan itself.>

| Action | Owner | Due |
|---|---|---|
