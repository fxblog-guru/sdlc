---
template_for: verify
gate: G8
authored_by: dev-running-verification
reviewed_by: dev-reviewing-verification
---

<!--
This document is evidence, not a summary. Every row records the command that ran, its exit code,
and the path to the raw output — so a reader can retrace any claim without rerunning anything.

The rule that matters: a gate that did not run is `NOT RUN`, never `PASS`. Tools break, runners are
missing, a suite is skipped by a stale filter — all normal, all fine to report honestly. What is
not recoverable is a green board that nobody can reproduce.
-->

---
slug: <slug>
stage: verification
artifact: verify
status: draft
authored_by: dev-running-verification
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Run

<run-id, commit SHA, branch, environment, and the tool versions used. Without the commit SHA this evidence belongs to no particular code.>

## Quality gates

<One row per gate in DEV-PROFILE §Quality gates. Result is PASS, FAIL, or NOT RUN with a reason.>

| Gate | Command | Result | Threshold | Actual | Raw output |
|---|---|---|---|---|---|
| Build | <command> | <PASS/FAIL/NOT RUN> | exit 0 | <exit code> | logs/build.txt |

## Coverage (changed modules only)

<Per module the change touched. Raising an untouched legacy module's number is not part of this task; letting a changed module fall below the threshold is.>

| Module | Lines % | Branches % | Threshold | Result |
|---|---|---|---|---|

## Tests

<Counts and, more importantly, the names of anything skipped or quarantined. A skipped test is a test that is not protecting anything, and it should be visible here rather than buried in tool output.>

| Suite | Passed | Failed | Skipped | Duration | Notes |
|---|---|---|---|---|---|

## Failures

<One block per failure: the test, the assertion, the likely cause, and whether it is a product defect or a test problem. Never "flaky, re-ran and it passed" without naming what made it flaky.>

## Migration round-trip

<The `up → down → up` result on a production-like dataset, with durations and the lock behaviour observed. N/A with a reason when the change has no migration.>

## Security and dependency scans

<Secret scan and vulnerability scan via `security-scan.mjs run` with the ledger's `check` line and every scanner NOT RUN named, threat trace (`threat-trace.mjs --source`), DAST baseline (ZAP against the preview) and real-data guard (`data-guard.mjs --dump`), each finding triaged: fix now, accept with an owner and a date, or false positive with evidence. A gate NOT RUN because CI runs it names the CI job (DEV-CONTRACTS §5.6).>

## Performance checks

<Any latency or throughput measurement taken, against which budget, on what data volume. A pagination change verified only against seed data has not been verified.>

## Acceptance criteria covered here

<Which AC ids this run's unit and integration tests actually prove, and which remain automation-tier for the QA bundle. This list feeds the handoff at G9.>

## Verdict input

<What the reviewer should focus on: anything that passed narrowly, anything not run, and anything that looks green but is not trustworthy.>
