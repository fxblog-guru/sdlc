---
template_for: qa-handoff
gate: G9
authored_by: dev-packaging-release
reviewed_by: dev-reviewing-release
---

<!--
This is the only channel between this bundle and agentic-fx-qa, and it is written for someone who
was not part of building the feature. Assume they will not read the PRD, the architecture, or the
code — everything they need to start testing is either here or linked from here.

The section that earns this document's existence is "Automation-tier criteria": the behaviours that
this bundle deliberately did not cover with unit or integration tests, because they are only
observable by running the real product. An honest list is what lets QA aim at the real gaps; a
padded or missing one is how a regression reaches a customer with everything green behind it.
-->

---
slug: <slug>
stage: release
artifact: qa-handoff
status: draft
authored_by: dev-packaging-release
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## What changed

<Three or four sentences: the user-visible change, the surfaces it touches, and what was not touched. For a fix: the QA defect id(s) it resolves, DEF-<slug>-NNN, so the re-run can close them.>

## References

<Links: PRD, requirements, acceptance criteria, architecture, data model, API contract, UI spec, the merged commit SHA, and the PR.>

## Requirements

<The REQ table with priority and status, so QA can weight its effort the way the product does.>

| REQ | Title | Priority | Status |
|---|---|---|---|

## Acceptance criteria

<Every AC with the tier that proves it and, where this bundle proved it, the test that did. QA needs to know what is already covered as much as what is not.>

| AC | REQ | Tier | Proved by | Evidence |
|---|---|---|---|---|

## Automation-tier criteria (the QA bundle's starting point)

<The criteria only observable by running the product. For each: the journey, the data it needs, and the surface. QA starts here: `/qa-analyze <slug> <root>/release/<slug>/qa-handoff.md` reuses the REQ ids above verbatim and scopes its analysis to this list.>

## Environments and data

<Where to test it, which accounts and roles, the seed or fixture data, feature-flag state per environment, and anything that must be enabled first. The load scenarios: the `api-contract-check.mjs <slug> --load-plan` table with G8's achieved numbers beside it, and the contract mock (`prism mock <root>/api/<slug>/openapi.yaml`) where QA starts before the build.>

## Interfaces changed

<Endpoints added, changed or removed, with the contract path; and the schema changes with their MIG ids. Anything breaking is called out here explicitly, not left for QA to discover. Then the deploy impact, copied as plain `key: value` lines from `## Rollout and rollback` in pull-request.md (`deploy_impact`, `db_change`, `data_change`, `rollback`, `backup`, `post_backup_writes`, `api_change`): the QA bundle reads them by name to plan its deploy-change cases.>

## Risk areas

<Where this is most likely to be wrong, in the implementer's own judgement: the tricky logic, the concurrency, the migration, the third-party call. Naming these is not an admission — it is the most useful paragraph in the document.>

## Known gaps and deferred work

<What is knowingly incomplete, behind a flag, or scheduled for a later slice — with the ticket for each.>

## Telemetry

<The dashboards, metric names and log events that show this feature working, so QA and support can see behaviour rather than infer it.>
