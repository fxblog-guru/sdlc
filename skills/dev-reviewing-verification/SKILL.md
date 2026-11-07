---
name: dev-reviewing-verification
description: G8 gate review. Use for its verdict: re-runs at least one gate, compares with the logs and coverage, and writes the gate log.
---

# Reviewing G8 — verification

You are judging whether this run is **evidence or a claim**.

Evidence names a commit, records the command, keeps what the command printed, and can be
reproduced by somebody who was not there. A claim is a table of green cells. The two look identical
in a summary, and the only reliable way to tell them apart is to run one of the gates yourself and
see whether you get what the log says.

> `DEV-CONTRACTS.md` §5 (log format), §7 (the migration round-trip), §9 (why functional QA is not
> judged here), §13.6, §13.7. `DEV-PROFILE §Quality gates` holds the gate list and the thresholds.
> You write `<root>/reviews/<slug>/G8-verification-<run-id>.md` and nothing else.

## What you receive

Paths: `<root>/verification/<slug>/runs/<run-id>/verify.md`, `coverage.md`, the whole `logs/`
directory, the upstream `implementation/<slug>/change-summary.md` and `plan/<slug>/tasks.md`,
`requirements/<slug>/acceptance-criteria.md`, `data/<slug>/migration-plan.md` where there is one,
`DEV-PROFILE.md`, the gate-log template, the prior log on attempt 2 — and **the source root at the
verified commit**, because a review that cannot run anything is a second reading, not a gate.

## Applicability

> G8 applies to every change class but `spike` — `initiative`, `change`, `fix`, `refactor` and `fast`. A one-line fix still has to
> build, still has to pass its tests, and is exactly the kind of change that ships without either.

`NOT_APPLICABLE` is available only where the slug ships no production code at all, and only after
you have confirmed that. "The change is small" is not an applicability rule; it is a small run.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | The run names a commit SHA, a branch and a clean working tree, so the evidence belongs to a state that can be recreated |
| 2 | Every gate in `DEV-PROFILE §Quality gates` has a row — none is silently absent |
| 3 | Every row names the exact command run and its exit code, and points at a `logs/<gate>.txt` that exists and is not empty |
| 4 | At least one gate was re-run by this review, and its result matches the log it is compared against |
| 5 | No row reports `PASS` for a command that executed nothing: test counts are recorded and non-zero wherever a suite exists |
| 6 | Every `NOT RUN` carries a reason, and no gate the change depends on is `NOT RUN` without one |
| 7 | Coverage is reported per changed module, and the changed-module set matches the diff against the merge base |
| 8 | Every changed module meets the profile's line and branch thresholds, or the shortfall is recorded as a failure rather than averaged away |
| 9 | Any new code with no test at all is named — a new module at 0% is not a rounding matter |
| 10 | Every failing test is recorded with its assertion as the tool printed it, and classified as product defect, test defect, or environment |
| 11 | No test was retried to green: a test that failed and then passed is reported by name as flaky, with both runs kept |
| 12 | No test was skipped, quarantined or deleted to reach a green board; skipped tests are listed by name |
| 13 | The migration round-trip `up → down → up` ran on production-like data with durations and lock behaviour (§7), or is `N/A` with a reason |
| 14 | Secret and dependency scans ran, and every finding is triaged: fixed, accepted with a named owner and a date, or false positive with evidence; `security-scan.mjs check` exits 0 on the committed ledger, and any scanner `NOT RUN` is named (§13.6, §13.15) |
| 15 | Every performance claim is measured against a stated budget at a realistic data volume, not on seed data (§13.7) |
| 16 | The acceptance criteria this run proves, and the automation-tier remainder, are listed for the G9 handoff (§9) |
| 17 | No log, table or note contains a secret, credential or personal data (§12.5) |
| 18 | Front matter complete per §3.1 on both artifacts, no `<placeholder>` remains, no section empty, headings byte-exact |
| 19 | Every threshold, exclusion and waiver in this run traces to `DEV-PROFILE §Quality gates` or to a `DEC-NNN` a human answered — none was chosen by the stage that had to meet it (§15.2) |
| 20 | Where the ui-spec has a `visual_reference`, one `ui-snap` run covers every screen it lists, its `compare.html` path is in the evidence, and the requester's approval of it is recorded (§13.3) |
| 21 | `threat-trace.mjs --source` ran and every untraced threat is a `FAIL`; the ZAP baseline ran against the preview with each alert triaged, or is `NOT RUN` for a named missing capability; `data-guard.mjs --dump` of the preview DB is clean (§13.6) |
| 22 | Every `NOT RUN` whose reason is that CI runs it names the capability this machine lacks (`doctor.mjs --capabilities`) and the CI job — and `lint-dev` W060 lists exactly those rows, for G9 to prove (§5.6) |
| 23 | The performance rows hold the §13.7 split: the perf smoke and `web-perf.mjs` ran with the profile's budgets and headroom, and the volume run measured every operation with an `x-perf` budget at the stated row count — each within budget, or recorded as a failure, never re-budgeted in this run. A public page also ran with `--audit seo,a11y` and scores 100 on both, or each failed check is a finding |
| 24 | Every changed module has a mutation score at or above the `DEV-PROFILE §Quality gates` threshold from `mutation-score.mjs`, or is recorded `FAIL` / `NOT RUN` with its reason; `timeout-check.mjs` reports no unexplained timeout raise or retry (§13.10) |
| 25 | Where the change has screens, the UI QA rows are recorded (§13.13): `ui-snap --golden` over the critical screens within threshold or `NOT RUN` with the reason, the browsers of `DEV-PROFILE §Quality gates` `Browsers` each measured or `NOT RUN` with the reason, the critical journeys and the screen-reader pass handed to QA, UI defects filed as findings; and `ui-score.mjs <slug> --gate G8` gives a result that allows this verdict, under `### UI score` (`lint-dev` E145) |
| 26 | Where the change ships a model-backed feature: an eval result over at least 30 cases, reported with its interval, for the pinned model and prompt (`dev-brainstorming-architecture/ai-features.md`) |
| 27 | Where `DEV-PROFILE §Environments` declares `staging`, the run is against `staging` at the SHA under review; a local-only run says why. The shipped SHA is the run's SHA: code that changed after the run is `BLOCKED` until it runs again (§18.7) |

## Check 4: re-run a gate. This is the check the gate is for.

Pick one — the unit test suite, the linter, the build, whichever the change most depends on — check
out or confirm the recorded commit, run the command exactly as `verify.md` records it, and compare:

| Compare | Because |
|---|---|
| exit code | a `PASS` row over a non-zero exit is the whole failure mode |
| test counts (passed / failed / skipped) | a suite that matched no files exits 0 and proves nothing |
| the skipped list | tests silently skipped are the cheapest way to a green board |
| the failure text, if any | a summarised failure often loses which assertion, and therefore which defect |

Put the command and both numbers in your evidence cell. If your re-run disagrees with the log, that
is the finding, and its severity is `BLOCKER` — not because the gate failed, but because the
evidence does not describe the run.

Pick a different gate on attempt 2 than the one you re-ran on attempt 1. Re-running the same green
gate twice tells you nothing you did not already know.

## A run you cannot reproduce is BLOCKED, not CHANGES_REQUESTED

`CHANGES_REQUESTED` says: I read the evidence, and here is what must change. It presumes there was
something to judge.

When the commit is not recorded, the tree was dirty, the logs are missing or empty, or the commands
in `verify.md` cannot be run as written — there is no evidence, and no list of findings would fix
it, because the remedy is not "amend the document", it is "run the verification again, properly".
That is `BLOCKED`, and naming who must act (G8 re-runs) is part of the verdict (§5).

Getting this wrong has a cost in both directions. `CHANGES_REQUESTED` on an unreproducible run
invites the author to improve the prose around evidence that does not exist. `BLOCKED` on a run
that is simply failing is a stall — if you could read the logs and they are red, that is a normal
`CHANGES_REQUESTED` (or a `PASS` for a run that honestly reports a failure someone else must fix,
if the profile's gate policy allows it; it usually does not).

## Checks 7 and 8: check the scope before you check the number

Derive the changed-module set yourself:

```
git diff --name-only $(git merge-base origin/<default-branch> HEAD)..HEAD
```

Then compare it with `coverage.md`'s table. A module in the diff that is not in the table is the
finding — and it is the specific finding this gate exists for, because a repo-wide percentage looks
excellent while the one new, entirely untested module sits inside it.

Then read the uncovered lines, not only the percentage. A module at 84% whose untested lines are
the error path, the permission branch and the rollback has met the threshold and covered nothing
that matters. That is a `MAJOR` with a precise location, which is far more useful than a number.

## Checks 21 and 22: security rows, and the promises CI must keep

Re-run `threat-trace.mjs <slug> --source .` yourself; a result that differs from the log is the
check-4 `BLOCKER`. An untraced `high`-impact threat recorded as `PASS` is `MAJOR`; a ZAP alert at
medium or above with no triage is `MAJOR`; a data-guard hit, or no dump scanned while a preview
was shown, is `MAJOR` — the preview is where a session typed a real company's Jira host on
release-management.

For check 22, run `node <root>/scripts/doctor.mjs --capabilities` on the verifier's evidence (its
recorded output, not your machine) and compare: a gate deferred for a capability the machine had
is `MAJOR` — it could have run. A deferral with no CI job named is `MINOR` here and becomes E060 at
G9. Never record "CI runs it" as `PASS`.

## Check 11: what to do when you find a retry

A test that failed and then passed is flaky, and flaky is a defect report, not an outcome. If the
run re-ran a test and recorded only the pass, the finding is `MAJOR` and the required change is to
record both runs and name the test — **not** to re-run it again.

You may not re-run it to green yourself either. If you happen to re-run a suite for check 4 and see
a different result than the log, that is evidence of flakiness and it goes in the log as a finding,
with both outputs.

## Severity for this gate

- `BLOCKER` — a `PASS` the logs do not support; your re-run contradicting the log; a secret in a log
  file; a migration whose `down` does not restore the schema; a green board produced by deleting or
  skipping tests.
- `MAJOR` — a changed module below threshold with no recorded failure; a gate absent from the sheet;
  a `NOT RUN` on something the change depends on, with no reason; a flaky test retried to green; an
  untriaged high or critical vulnerability; a performance claim measured on seed data; check 20 with
  a screen missing from the `ui-snap` run, or no approval recorded. Open `compare.html` yourself:
  an approval of pictures that visibly differ, with no deviation declared, is the finding too.
  Check 21 with an operation over its `x-perf` budget recorded as `PASS`, or a budget relaxed in
  this run; a timeout raised to pass with no slow-test investigation recorded.
- `MINOR` — a missing tool version, a log that is noisier than it needs to be, a coverage table that
  is right but hard to read, an `N/A` whose reason is thin.
- `INFO` — a suite worth splitting, a slow gate worth caching, a threshold worth revisiting.

## Findings that are usually wrong

1. **"Repo-wide coverage is below the threshold."** Wrong scope, deliberately. The profile measures
   changed modules, because raising a legacy repo's global number is never part of a feature task.
2. **"There are no end-to-end / performance / security tests."** Those tiers belong to
   `agentic-fx-qa` and are consumed through the G9 handoff (§9). What *is* in scope here is check 16
   — whether the automation-tier list that QA depends on was written honestly.
3. **"Just re-run the flaky test."** Never. See check 11. This is the finding most likely to be
   written by a reviewer trying to be helpful, and it destroys the only evidence of a real race.
4. **Objecting to an honest `NOT RUN`.** A missing runner reported with its reason is the system
   working. A `NOT RUN` with no reason, or on the suite that covers the change, is the finding.
5. **Reviewing the code.** Whether the implementation is correct was G7's judgement, made against a
   published checklist by a reviewer with the code in front of it. Re-litigating it here without new
   evidence produces two verdicts on one question. If the *run* revealed something G7 missed — a
   test that cannot fail, a module with no tests at all — that is a legitimate finding, and its
   owner is G7.
6. **Demanding a performance number the change never claimed.** §13.7 asks for a measurement against
   a *stated* budget. If no budget was ever stated, the missing budget is the finding, and it
   belongs upstream.

`PASS` with zero findings is the correct outcome for a run that executed every gate, kept its
output, and measured the right modules.

## Check 19: the threshold nobody set

This gate has a failure mode the earlier ones do not, because it is the only one that can make
itself pass. A coverage number, a severity floor for the scanner, a path added to an exclude list —
each is a small, reasonable-looking judgement, and each one moves the bar that this very run is
being measured against.

So the question is not "is 70% enough?" It is **"who said 70%, and where is it written?"**

| What you find | Verdict |
|---|---|
| the number is in `DEV-PROFILE §Quality gates` | `PASS` — cite the line |
| the number is in an answered `DEC-NNN` with a named human | `PASS` — cite the row |
| the number appears only in `verify.md`, or in a config file this change added | `MAJOR`. The bar was set by the stage clearing it |
| a path was excluded from coverage or from the scanner during this run | `MAJOR` unless the exclusion predates the change and is cited |
| a failing gate is recorded as waived | `BLOCKER` unless `override:` names a human (§4.5) |

Marking a `DEC-NNN` `assumed` is not the remedy — `assumed` requires a named human, and a stage that
sets it has answered its own question in the one format designed to look as though it had not. The
remedy is `N/A — blocked by DEC-NNN` on the gate that cannot be judged, with every other gate run
and reported in full.
