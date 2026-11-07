---
name: dev-running-verification
description: Use in /sdlc-verify (G8) to run every quality gate against a named commit, keep raw logs verbatim, and measure coverage per changed module.
---

# Running verification — G8

This gate exists to kill two sentences.

"It works on my machine" dies by naming the commit, the branch, the tool versions and the
environment, so that the claim belongs to a state somebody else can recreate.

"All the tests pass" dies by keeping what the tools actually printed. Every summary is a chance to
drop the four skipped tests, the deprecation that is about to become an error, or the suite that
exited zero because it matched no files. The raw log is the artifact; `verify.md` is the index into
it.

> `DEV-CONTRACTS.md` §2 (where the run lands), §7 (the migration round-trip), §9 (the dev / QA
> boundary), §13.5–§13.7. `DEV-PROFILE §Quality gates` is the list you run and the thresholds you
> measure against. You do not invent a gate, and you do not relax one.

## Before anything runs: pin the run

Record, in `## Run`:

```
git rev-parse HEAD            # the commit this evidence belongs to
git rev-parse --abbrev-ref HEAD
git status --porcelain        # must be empty
```

plus the tool versions (`go version`, `python -V`, `node -v`, the linter versions) and the
environment the integration tier ran against.

Then `node <root>/scripts/doctor.mjs --capabilities --json`. Every gate in its `deferred_to_ci` list
is a row you record `NOT RUN` with that reason and the CI job that runs it (`no cgo C compiler on
this machine; CI's go:unit job runs it`). Write the row before you start, so it cannot be forgotten
when the run ends; G9 needs the CI job's pass for each one (§5.6). Run under
`skills/dev-stage-protocol/environment.md`: your own ports and containers, kill by PID only.

**A dirty working tree makes the run unreproducible**, because the code that was verified exists
only on this machine and will never exist again. That is `BLOCKED` — say which files are dirty and
stop. Half of every "but it passed for me" is either an uncommitted file or a tool version.

## Run each gate, keep everything it printed

For each row of `DEV-PROFILE §Quality gates`, in that order:

```bash
mkdir -p <root>/verification/<slug>/runs/<run-id>/logs
set -o pipefail
<command> 2>&1 | tee <root>/verification/<slug>/runs/<run-id>/logs/<gate>.txt
echo "exit=$?"
```

Capture stdout and stderr **together** — half the useful output of most toolchains is on stderr,
and a log that has only one stream is a log that is missing the reason.

Then one row in `verify.md`: gate, the exact command, `PASS` / `FAIL` / `NOT RUN`, the threshold
from the profile, the actual value, and the log path. Nothing in that row is a paraphrase of the
output; it is a pointer to the output.

The reviewer is instructed to **re-run at least one gate itself and compare it with your log**. Write
every row as if the one being re-run is that one.

## NOT RUN is an honest answer. PASS is not, when nothing ran.

A missing runner, an absent Docker daemon, a suite behind a tag this environment does not have, a
tool the project has not configured yet — all normal, all reportable. `NOT RUN` with the reason,
and the reason belongs in the log too.

Watch for the gate that *looks* green and ran nothing: a test command that matched zero files, a
lint invocation with the wrong path, a coverage tool that reported on an empty set. Exit code 0 and
"0 tests" is `NOT RUN`, not `PASS`. Record the count of tests actually executed in every suite row
so this is visible rather than inferable.

## Coverage is measured on the modules the change touched

A repo-wide percentage is the number that hides a brand-new module with no tests behind a large,
well-covered legacy codebase — and the new module is the entire subject of this review. So:

```bash
BASE=<coverage base ref>    # DEV-PROFILE "Coverage base ref"; default $(git merge-base origin/<default-branch> HEAD)
git diff --name-only "$BASE"..HEAD
```

The base is DEV-PROFILE's **Coverage base ref**: the merge base by default, the slice base for a
per-slice G7 (§5.5). Drop generated code first — paths matching DEV-PROFILE's **Coverage
exclusions** globs (generated clients, mocks, protobuf output) are neither counted nor reported,
since nobody writes tests for them. Map the remaining files to modules (a Go package, a Python package or module, a React feature directory),
and report **per module**:

| Stack | Measure | Reduce to changed modules by |
|---|---|---|
| Go | `go test ./... -race -covermode=atomic -coverprofile=cover.out` then `go tool cover -func=cover.out` | keeping the packages that own a changed file |
| Python | `pytest --cov=<pkg> --cov-report=term-missing --cov-report=xml` | reading `coverage.xml` per changed file |
| React | `vitest run --coverage --coverage.reporter=json-summary` | reading `coverage-summary.json` per changed file |

Write `coverage.md` from its template. The per-module table is the number; the section that gives
it meaning is the uncovered lines that matter — the error path, the permission branch, the retry,
the rollback. A module at 82% whose only untested lines are its failure handling has met the
threshold and missed the point, and saying so is worth more than the percentage.

**A changed module below the threshold is a `FAIL` you record**; it is not a repo-wide problem you
fix by testing something else. Raising an untouched legacy module's number is never part of this
task.

## Mutation score on the same modules (§13.10)

Coverage says a line ran; the mutation score says a test would notice if the line were wrong. Run
the `Mutation score` row of `DEV-PROFILE §Quality gates` over the changed files only (Stryker for
web/TS, gremlins `--diff <base>` for Go; Windows notes in the bundle's `docs/mutation-testing.md`),
then reduce:

```bash
node <root>/scripts/mutation-score.mjs --report <stryker mutation.json> --prefix src=web/src \
  --report <gremlins.json> --base "$BASE" --threshold <profile value>
```

Paste its table under the coverage table in `coverage.md` and add a `Mutation score` row to
`verify.md`. A changed module below the threshold is `FAIL`; one no report covers is `NOT RUN`
with the reason. Name the surviving mutants in a changed module's error or permission path in
`## Uncovered lines that matter`: each is a test that cannot fail. Then run
`node <root>/scripts/timeout-check.mjs --base "$BASE"` as the `Slow-test check` row.

## A flaky test is a finding, not a retry

If a test fails and then passes unchanged, **both runs are recorded** and the test is reported by
name as flaky. The run's verdict does not improve because the second attempt was luckier.

Flakiness is usually a real defect in costume — a race, an unawaited write, a shared fixture, a
clock, a test that depends on another test's order. Retrying to green deletes the only evidence you
will ever get of it, and the same race then appears in production, where nobody can re-run
anything. Quarantine is a human decision with a ticket and an owner; it is not something this stage
grants itself.

For each failure, `## Failures` carries: the test name, the assertion as the tool printed it, the
log path, and a classification — **product defect** (the code is wrong), **test defect** (the test
is wrong), or **environment** (the runner, the fixture, the data). Never "flaky, re-ran, passed".

## The rest of the sheet

**Migration round-trip (§7).** `up → down → up` on a production-like dataset, with the durations
and the lock behaviour observed. The output goes in the log like everything else. `N/A — no schema
change in this slug` when there is none; a blank section is a gate failure.

**Security and dependency scans (§13.6).** `node <root>/scripts/security-scan.mjs run --source .
--base <merge-base> | tee logs/security-scan.txt`: gitleaks, semgrep, trivy and checkov, pinned,
folded into `<root>/security/findings.md` (§13.15). Each new row is triaged: fix now, accept with
a named owner and a date (a human, as a `DEC-NNN`), or false positive with the evidence. An
untriaged scan output is not a result. Three more rows, all in `## Security and dependency scans`:

- **Threat trace.** `node <root>/scripts/threat-trace.mjs <slug> --source . | tee logs/threat-trace.txt`.
  Each line it prints is a threat whose named test is not in the code: `FAIL`, owner G7.
- **DAST baseline.** OWASP ZAP's passive scan against the running preview at the pinned commit:

  ```bash
  docker run --rm -t --network host -v "$PWD/dev/verification/<slug>/runs/<run-id>/logs:/zap/wrk:rw"     zaproxy/zap-stable:2.16.1@sha256:7840969c7c9fead565bf9734b12f49f6886db90b1d35b1f74d79710bbd081dab zap-baseline.py -t <preview URL> -J zap.json -r zap.html -I 2>&1 | tee logs/zap-baseline.txt
  ```

  On Docker Desktop use `host.docker.internal` in the URL instead of `--network host`. Triage each
  WARN/FAIL alert like any scan finding: fix (owner G7), accept with a name and a date, or false
  positive with the evidence. With no Docker daemon it is `NOT RUN — docker missing on this
  machine`, and CI's job runs it (§5.6).
- **Real-data guard.** Dump the preview DB (DEV-PROFILE `Preview dump command`), then
  `node <root>/scripts/data-guard.mjs --dump <dump> | tee logs/data-guard.txt`. Any hit is `FAIL`
  and the preview is not shown to anyone until it is cleaned — a real customer's host or address
  in a screenshot is a disclosure, whoever typed it. Delete the dump after the scan; never keep it
  under `<root>/`.

**Performance (§13.7).** Three rows, from `DEV-PROFILE §Quality gates`:

- **Perf smoke** and **Web perf** are the check-time rows: run them as the profile states, on the
  small seed and the production build, and record them like any other gate. They are cheap, and a
  red one here was red on every check before it — say so if the logs show it.
- **Performance (volume)** is G8's own: seed the profile's volume, then measure **every operation
  with an `x-perf` budget** against its `p95_ms` (no headroom; this is the volume the budget is
  for), with the query count and payload where the build reports them. Record the row counts, the
  concurrency, warm-up and n, and the worst p95 per operation in `## Performance checks`.
- **Load scenarios** come from the contract, not from you: `node <root>/scripts/api-contract-check.mjs
  <slug> --load-plan` gives one row per traffic class at `rps × peak_factor` and `concurrency`.
  Run each at that rate, and record the achieved rps, the p95 per operation against `p95_ms`, the
  error and 429 rates, and whether any call outlived its `x-timeout-ms`. Carry the table into
  `qa-handoff.md` `## Environments and data`. A contract with no `x-traffic-classes` is `NOT RUN`
  with that reason, and the G4 row it skipped is named.

Pagination verified against ten seed rows has not been verified, and saying which volume you used is
the difference between a measurement and a mood. A breach is `FAIL` — never a new budget written
here; the budget belongs to G4 (§12.6).

A test that ran slow is not retried and not given a longer timeout here: record it under
`## Failures` with the times, and point the G7 author at
`.claude/skills/dev-stage-protocol/slow-tests.md`.

**Visual check (§13.3).** When the ui-spec has a `visual_reference`, run `ui-snap` once over
**every** screen in its `## Screens`, against the build at the pinned commit:

```bash
node <root>/scripts/ui-snap.mjs --app <screen>=<url> … --reference <visual_reference path> \
  --widths 360,lg --tokens <root>/docs --out <root>/verification/<slug>/runs/<run-id>/ui-snap
```

Record the `compare.html` path and the shot count in `## Quality gates` as a `Visual` row. The
result is `PASS` only once the requester has approved the pictures: their name, the date, and any
screen they did not approve, in `## Verdict input`. Until then it is `NOT RUN — awaiting approval`.
You never approve it yourself. With no `visual_reference`, the row is `N/A` with that reason.

**UI QA (§13.13).** With screens, also record: `ui-snap --golden <<root>/verification/<slug>/golden>`
over the critical screens on the fixed seed (`--write-golden` once the requester approved them;
`NOT RUN — no golden set yet` before that); one `ui-rubric` run per browser in `DEV-PROFILE`
`Browsers` (Chromium here; Firefox and WebKit through Playwright when installed, else `NOT RUN`
with that reason); and `ui-score.mjs <slug> --gate G8` with every checker's `--json`. The
critical journeys and the screen-reader pass go to QA in the handoff as manual-tier rows (§9).

**Acceptance criteria.** List the `AC` ids this run's unit and integration tests actually prove,
and the ones that remain automation-tier. That second list is the QA bundle's input at G9 (§9), and
a silent gap in it is how a regression ships with everyone's approval.

## What is not yours

This is the **developer's** quality bar. Test design, functional certification, e2e, performance
suites, security testing and accessibility belong to `agentic-fx-qa`, and they arrive there through
the G9 handoff packet — not through this gate, not through a helpful extra suite written here. You
never write under `qa/` and never invoke a `/qa-*` command (§9).

Duplicating their tier here is worse than leaving a gap, because two owners of the same check means
neither maintains it.

## Never

Edit production code, a test, or an upstream artifact. A red gate goes back to G7, which means a
new implementation round and a new G7 review — code changed after its review was reviewed by
nobody, and a verifier that "just fixes the import" has written unreviewed code and certified it
itself in the same context.

Delete or skip a failing test. Relax a threshold in `DEV-PROFILE`. Report a threshold as met by
rounding. Write a gate log or set `status: approved`. Let a secret reach a log file — if a tool
prints an environment dump, redact it before it lands and say in `verify.md` that you did (§12.5).

## Hand back

The run-id, the commit SHA, every path written, the per-gate result in one line each, the modules
below threshold, everything `NOT RUN` with its reason, and every flaky test by name. Not a verdict —
that belongs to the reviewer (§4.5).
