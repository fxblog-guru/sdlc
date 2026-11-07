---
name: dev-reviewing-pull-request
description: Use for /sdlc-review-pr: review a teammate's PR from its diff.
---

# Reviewing a development pull request

You are reviewing **someone else's change before it merges**. Not a gate of this pipeline: a PR
can come from a teammate who never ran `/sdlc-*`, from a hotfix, from a dependency bump. Where the
change *does* belong to an sdlc slug, its gate logs are evidence you use — never a substitute for
reading the diff, and never a reason to re-run the gate.

> `DEV-CONTRACTS.md` §13.1–§13.6 (the standards), §6 (breaking changes), §9 (which test tier is
> not dev's), §4.5 (read-only). You write `<root>/pr-reviews/<pr-id>-<run-id>.md` and nothing else.
> You never push a commit, never approve on the platform, never post a comment yourself: the human
> posts what you wrote.

## What is different from G7

| | G7 (`dev-reviewing-implementation`) | This review |
|---|---|---|
| Question | did the code implement the approved tasks? | is this diff safe and right to merge? |
| Input | an sdlc slug, its tasks, contract, model | any PR; the slug's artifacts if it has one |
| Author | the implementer agent | a person on the team |
| Output | gate log (PASS / CHANGES_REQUESTED) | PR review (APPROVE / REQUEST CHANGES / COMMENT) |

The words differ on purpose: a PR review is not a gate log and must never be parsed as one.

## Step 1 — scan before you read

```bash
node <root>/scripts/pr-scan.mjs --pr <n>            # fetches merge-requests/<n>/head or pull/<n>/head
node <root>/scripts/pr-scan.mjs --base origin/main --head <branch>
```

Quote its header (files, lines, source vs test, slugs and their gate verdicts) in `## Scope`, and
carry every finding into your table with its id. A scan finding you judge wrong stays in the table
as `dismissed` with the reason. A tool's false positive you dismiss in silence is one nobody fixes.

A `PR-SIZE` MAJOR changes how you work, not just what you write: over ~800 changed lines, say
which part you reviewed in depth and which you only scanned. A review that claims to have read
15,000 lines has not.

## Step 2 — understand the intent, then the diff

Read the PR description first, then the linked tracker key, then — if the scan names a slug —
`requirements/<slug>/acceptance-criteria.md` and `plan/<slug>/tasks.md`. Write one sentence:
**what this PR claims to do.** Every finding is measured against that sentence. If the description
is empty or does not say why, that is your first finding (`MINOR`; `MAJOR` on a change to auth,
money, data deletion or a migration).

Then read the diff file by file, in dependency order: contract and schema → domain → handlers →
client → tests. A test you ran is evidence; a test you saw is not.

## Step 2b — run it, from a throwaway worktree

"Does not break" is a claim about running code, so it needs running code behind it. In
`git worktree add --detach .claude/pr-review/<n> <head>`:

- **The project's own checks, as CI runs them**: build, type check, linter and formatter in check
  mode, and the test suite of every changed module. Use the commands in `DEV-PROFILE §Quality
  gates`. If they are not written there, take them from the CI file. Paste each command with its
  exit code and result line.
- **The same tests on the base.** A test that fails on both is pre-existing, so record it as
  `INFO`. A test that fails only on the head is this PR's.
- `node <root>/scripts/contract-compat.mjs <base copy> <head copy>` for a contract the scan could not
  parse, and `oasdiff breaking` when it is installed.

A check you could not run (no toolchain, no database) is `N/A (<reason>)` in the row. It is never
`PASS`. When the run evidence for "does not break" is missing, the verdict is `COMMENT`, not
`APPROVE`.

## Step 3 — the checklist

One row per line, in this order, each `PASS` / `FAIL` / `N/A` with evidence (`file:line`, a
command and its output, or a quoted line). The four groups are the four questions a merge must
answer: is it right, does it break anything, is it in the agreed form, can it merge now.

**A. Right — it does what it says**

| # | Check |
|---|---|
| 1 | The PR says what it changes and why; the diff does that and nothing it does not mention |
| 2 | Correctness: each changed branch does what the intent sentence says, including the error path and the empty/zero/one/many cases |
| 3 | Every behaviour change has a test that would fail without it — named, run, and asserting a concrete value (not a mock's call count, not "not null") |
| 4 | Security: authorisation on every endpoint and every client-supplied id; input validated at the edge; queries parameterised; no secret or personal data in code, logs, errors or fixtures (§13.6) |
| 5 | Failure handling: outbound calls have timeouts; no error swallowed; errors mapped once to the §13.1 shape |
| 6 | Data at scale and concurrency: collections bounded and paginated, no N+1 on a growing table, no transaction across a network call; two callers at once cannot lose an update or double-apply |
| 7 | Observability: the new path can be seen in production — a log line with context, a span, a counter where the design named one |

**B. Does not break — what already works keeps working**

| # | Check |
|---|---|
| 8 | Build, type check and the existing test suite pass on the head (Step 2b), and every failure is shown to exist on the base too or is this PR's finding |
| 9 | No test was weakened, skipped, focused or deleted to make it green (scan `PR-FOCUS`, `PR-SKIP`, `PR-TEST-SHRINK`, `PR-TEST-DELETED`) |
| 10 | API contract: an unchanged client keeps working — no operation, status code or response field removed, no new required input, no type or enum narrowed (scan `PR-BREAKING`, from `contract-compat.mjs`), or the break is declared in `contract-diff.md` with an ADR and a deprecation window (§6) |
| 11 | Schema: migrations are new files (`PR-MIGRATION-EDITED`); nothing the running version still reads is dropped or renamed in the same deploy (`PR-MIGRATION-DESTRUCTIVE` — expand, migrate, then contract, §7); nothing locks a large table (`PR-MIGRATION-LOCK`); the down migration restores the previous shape |
| 12 | Compatibility beyond the API: config keys, environment variables, CLI flags, event and message shapes, file formats and public function signatures other modules or services use are unchanged, or every caller changes in the same PR and the deploy order is stated |
| 13 | Behaviour of untouched callers: for each changed shared function, the callers outside the diff (`git grep` on the head) still get what they expect — name them |
| 14 | Dependencies: each new or upgraded one is needed, maintained, licensed compatibly, and pinned; a major-version bump lists its breaking changes; a lockfile-only change is explained (`PR-LOCK-ONLY`) |

**C. Right format — the agreed shape, so the history and the code stay readable**

| # | Check |
|---|---|
| 15 | Formatter and linter clean in check mode (Step 2b) — no finding here is ever written by hand; a tool is quoted |
| 16 | Commits follow §18.1 (Conventional Commits, closed scopes, ids in `Refs:`/`Done:` trailers, no `wip`/`fixup!`) and the branch name follows `DEV-PROFILE §Delivery` (scan `PR-COMMIT-FORMAT`, `PR-BRANCH-NAME`); the fix is a squash or reword before merge, not a new commit |
| 17 | Conventions: the change follows how this repository already does the same thing (names, layering, error shape, file placement); cite the existing example it matches or departs from (§16.4) |
| 18 | The PR body follows `<root>/_templates/pull-request.md` (what and why, testing with numbers, risk and rollout, reviewer notes) |
| 19 | Nothing that does not belong in the repository: no build output, cache, binary or file over 1 MB (`PR-GENERATED`, `PR-BINARY`, `PR-BIG-FILE`), no `.env` |

**D. Ready to merge — now, into this base**

| # | Check |
|---|---|
| 20 | Merges cleanly into the base (`PR-CONFLICTS`) and no conflict marker was committed (`PR-CONFLICT-MARKER`) |
| 21 | Current with the base: the pipeline that went green ran against the base it will merge into, not an older one (`PR-BEHIND`) |
| 22 | The CI pipeline itself was not weakened: no job, stage or required check removed or made `allow_failure` (`PR-CI-CHANGED`) |
| 23 | sdlc slug only: G7 and G8 are `PASS` on the head commit; the PR body cites them; any deviation from the approved design is recorded |

`N/A` applies to a row with a reason ("no migration in the diff"), never to the review.

## Step 4 — findings

`| # | Severity | Where | Finding | Why it matters | Suggested direction | Source |`

- **Where** is `path:line` on the head commit. A finding with no location is a remark, and goes in
  `## Notes`, not the table.
- **Severity** uses the contract's words: `BLOCKER`, `MAJOR`, `MINOR`, `INFO` (definitions below).
- **Suggested direction** says what must become true, not the replacement code. A two-line hint is
  fine; a rewritten function anchors the author on your version instead of the problem.
- **Source** is `scan:<id>`, `read`, or `ran:<command>`.
- Prefix questions with `Q:`. A question is not a defect until the answer is wrong.

| Severity | Means | Examples |
|---|---|---|
| `BLOCKER` | merging causes harm | wrong result on the main path; an unauthorised path to non-public data; injection; a live secret; an edited migration; a breaking contract change not declared; a test that passed on the base now fails; does not merge; a committed conflict marker |
| `MAJOR` | must be fixed before merge | a behaviour change with no test, or a test that cannot fail; a swallowed error; a missing timeout; a lost update; N+1 on a growing table; a deleted/weakened test; a destructive or locking migration in one deploy; a changed config/event/signature with callers left behind; far behind the base |
| `MINOR` | should be fixed before merge, cheaply | commit or branch format; a convention departure at short distance; generated files committed; naming; a narrow test; a TODO without a ticket |
| `INFO` | for the record | a follow-up worth a ticket; an alternative; praise for something done well |

## Step 5 — verdict and the comment

| Verdict | When |
|---|---|
| `APPROVE` | no `BLOCKER`, no `MAJOR`, **and** rows 8 and 20 (it builds and passes, it merges) are `PASS` from a run, not `N/A`; `MINOR`/`INFO` listed |
| `REQUEST CHANGES` | at least one `BLOCKER` or `MAJOR` |
| `COMMENT` | you could not review or run part of it (unreadable, too large, no toolchain for row 8): say which part and who must act — never an approval by default |

Write the file with this front matter, then the body:

```yaml
---
pr: <platform>!<n> | <platform>#<n> | <branch>   # gitlab!42, github#42, or the branch when there is no PR yet
kind: development
base: <ref> @ <merge-base sha>
head: <ref> @ <head sha>
reviewer: dev-reviewing-pull-request
verdict: <APPROVE | REQUEST CHANGES | COMMENT>
date: <YYYY-MM-DD>
---
```

Sections, in order: `## Scope` (what was read in depth, what was only scanned, the scan header),
`## Intent` (the one sentence), `## Checklist`, `## Findings`, `## Notes`, `## Comment to post`.

`## Comment to post` is the text the human pastes into the PR: the verdict, the `BLOCKER`/`MAJOR`
findings one line each with `path:line`, then the rest collapsed. Write it for the author: plain,
specific, no blame, no "just". If the head commit changes after your review, the review is stale.
Say so at the top of the comment when you re-run.

## A second round

When the author pushes fixes, run again with the same `<pr-id>` and a new run-id. Add
`## Resolution` with one row per prior finding, `RESOLVED` / `ACCEPTED` / `REOPENED`, each checked
on the new head, not taken from the author's reply.

## Findings that are usually wrong

1. **Formatting and import order.** The formatter and linter own them, and CI runs them.
2. **"I would have structured it differently."** Unless it breaks a §13.2 rule or the repository's
   own convention, it is `INFO`.
3. **Pre-existing problems the diff did not touch.** `INFO`, at most; the PR is not the backlog.
4. **"Add e2e tests."** End-to-end, performance, security and accessibility testing belong to the
   QA bundle (§9). If the change needs them, say *which behaviour* QA must cover, as `INFO`.
5. **Coverage percentages.** A specific untested behaviour is a finding; a number is not.

`APPROVE` with zero findings is a correct outcome. A reviewer is not scored on how much it finds.
