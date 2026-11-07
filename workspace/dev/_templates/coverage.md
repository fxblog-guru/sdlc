---
template_for: coverage
gate: G8
authored_by: dev-running-verification
reviewed_by: dev-reviewing-verification
---

<!--
This document answers one question: is the code THIS CHANGE ADDED protected by tests?

That is why every table below is scoped to the modules the change touched. A repo-wide percentage
answers a different and much less useful question — a large, well-covered legacy codebase will
carry a brand-new module with no tests at all and still report 87%, and the new module is the
entire subject of the review.

The percentage is the cheapest part of this document. The sections that earn it are the uncovered
lines that matter and the new code with no test: a module at 84% whose untested lines are the error
path, the permission branch and the rollback has met its threshold and covered nothing that will
page anybody at 3am.

Raising an untouched module's number is never part of this task. Letting a changed module fall
below the threshold without recording it as a failure is.
-->

---
slug: <slug>
stage: verification
artifact: coverage
status: draft
authored_by: dev-running-verification
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Run

<run-id, commit SHA, branch, and the coverage command per stack with its tool version. Same commit as verify.md — coverage measured against a different revision than the test run is not evidence about either.>

## Changed modules

<How the changed set was derived (the merge base and the diff command), then one row per module. A module here that is absent from the table below is the gap this document exists to expose.>

| Module | Changed files | Derived from |
|---|---|---|

## Coverage per changed module

<Line and branch percentages against the DEV-PROFILE §Quality gates thresholds. Result is PASS or FAIL per module — never an average across modules, which is how one untested module disappears.>

| Module | Lines % | Branches % | Threshold | Result | Report |
|---|---|---|---|---|---|

<Then the mutation score per changed module, as `mutation-score.mjs` prints it (DEV-CONTRACTS §13.10). A module with no mutant is NOT RUN, never PASS; a surviving mutant in a changed module names a test that cannot fail.>

| Module | Tool | Killed | Survived | Score % | Threshold | Result |
|---|---|---|---|---|---|---|

## New code with no test

<Modules, files or functions added by this change with no test exercising them at all. "None" when there are none — but say it, because a blank section reads as "not checked".>

## Uncovered lines that matter

<The uncovered lines that carry risk, with file:line and the behaviour left unprotected: error paths, permission branches, retries, rollbacks, concurrency guards. This is the section a reviewer acts on.>

| Location | Uncovered behaviour | Why it matters |
|---|---|---|

## Below threshold

<Every module that failed, with the shortfall and what happens next: a task back to G7, or an acceptance with a named human, a reason and a date. An unexplained shortfall is a gate failure, not a note.>

## Excluded from measurement

<Generated code, vendored code, migrations, anything the coverage config ignores — with the reason and where the exclusion is configured. An exclusion nobody can find is indistinguishable from untested code.>

## Raw output

<Paths to the coverage tool's own output under logs/, plus the command that regenerates it. The percentages above must be re-derivable from these files without rerunning the suite.>
