---
name: dev-reviewing-release
description: G9 gate review. Use for its verdict: judges pull-request.md and qa-handoff.md against the checklist and writes the gate log.
---

# Reviewing G9 — release

You are the last reader inside this bundle. Everything after you is either a human merging, or
another bundle that cannot ask you a question.

So the question is not "is this a good PR description". It is: **could someone who has none of this
context pick these two documents up and do their job?** For the PR, that job is deciding whether to
merge. For `qa-handoff.md`, it is testing a feature they have never seen, against criteria they did
not write, with no access to `<root>/**` and no channel back (§9).

> `DEV-CONTRACTS.md` §5 (log format), §9 (the boundary and what the packet must carry), §6 (the
> breaking-change rule), §15.2 (`assumed` at G9), §12 (never fake a gate). `DEV-PROFILE.md`
> §Delivery, §Quality gates, §Testing ownership. You write
> `<root>/reviews/<slug>/G9-release-<run-id>.md` and nothing else.

## What you receive

Paths: `release/<slug>/pull-request.md` and `qa-handoff.md`; the upstream
`requirements/<slug>/requirements.md` and `acceptance-criteria.md`;
`implementation/<slug>/change-summary.md`; the G7 and G8 gate logs;
`verification/<slug>/runs/<run-id>/verify.md`; `api/<slug>/contract-diff.md` and the contract where
they exist; `data/<slug>/migration-plan.md` where it exists; `<root>/decisions/<slug>.md`;
`DEV-PROFILE.md`; the gate-log template; the repository itself; and the prior log on attempt 2.

Read `requirements.md` and `acceptance-criteria.md` **before** the handoff. You cannot check that a
criterion arrived intact against a version you only met in the packet.

## Applicability

> G9 applies to every change class that ships code — `initiative`, `change`, `fix`, `refactor` and `fast` (§15.1). There is no
> release without a handoff, because there is no other channel to the QA bundle (§9).

A `fix` still produces a PR body and a packet; they are shorter, not absent. If a `fix` arrives
carrying a schema or contract change, the finding is that the class is wrong and the change should
have had a G3 or G4 review — §15.1 says claims are checked, and this is the last gate that can
check this one.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Front matter complete per §3.1 on both artifacts, headings byte-exact, no `<placeholder>` left, no section empty |
| 2 | The PR body in the repository is the text actually submitted — not a summary, a tidied version, or a later edit |
| 3 | The branch and commit conventions in `DEV-PROFILE §Delivery` are met, and no commit landed directly on a protected branch |
| 4 | Every commit message states problem, solution and impact; no `wip`, `fixup` or `try again` commit survives in the submitted history |
| 5 | The shipped commit SHA exists, is on the submitted branch, and is the revision the two documents describe |
| 6 | Every `REQ-NNN` in `requirements.md` appears in the handoff's REQ table, and every `REQ-NNN` in the handoff exists in `requirements.md` — counted both directions |
| 7 | Every acceptance criterion arrives intact: same id, same given/when/then, same concrete values — no paraphrase, no silent drop |
| 8 | Every acceptance criterion carries a tier, and every criterion claimed as proved here names the test that proves it |
| 9 | The automation-tier list is the exact complement of the proved list, and each entry carries its journey, its data and its surface |
| 10 | The packet carries everything §9 requires: slug, tracker key, REQ table, acceptance criteria, API contract path, data model path, shipped commit SHA |
| 11 | The packet stands alone — a reader with no access to `<root>/**` could start testing from it without asking a question |
| 12 | Every path and link either document cites resolves to a file that exists |
| 13 | G7 and G8 are `PASS` or `SKIPPED`; their logs are linked from the PR body; any quality gate that was red is named in the PR and waived in writing by a human in the G8 log |
| 14 | Every `API-*` change and every `MIG-*` in this release appears in both documents, with breaking changes called out and carrying the `contract-diff.md` entry, ADR and deprecation window §6 requires |
| 15 | The migration's ordering against the deploy is stated, and does not contradict `migration-plan.md` |
| 16 | No `DEC-NNN` this release depends on is still `open`, and no row is `assumed` without a named human (§15.2) |
| 17 | No secret, credential, token or personal datum appears in the PR body, the packet, the commit messages or the diff; `security-scan.mjs check` exits 0 on the shipped commit (§13.15) |
| 18 | `## Risk and rollout` names what could break, how it is detected, and the flag and its default — or states that none is needed, and why |
| 19 | Every G8 gate `NOT RUN` because CI runs it has a `CI proof:` line in `## Gate logs`, from a job on the shipped commit that ran the gate and passed — `lint-dev` reports no W060 for this slug (§5.6) |
| 20 | `README.md` runs as written (clone, run, test in ≤ 10 lines) and `ARCHITECTURE.md` draws C4 levels 1 and 2 for what ships; `CHANGELOG.md` has the release's entries under `[Unreleased]` (§18.2) |
| 21 | Every user-visible change ships with its docs or help text and a release note in the reader's words; a breaking change has upgrade steps; examples are checked to run (`user-docs.md`) |
| 22 | Product type `desktop`: installers are signed (and notarised on macOS), the update channel and staged rollout percentage are named, the last good build is ready to re-publish, the packaged build was tested, and the renderer runs with `contextIsolation`, `sandbox` and no `nodeIntegration` (`desktop.md`) |
| 23 | Product type `extension`: activation is not `*` without a reason, every socket, timer and child process is disposed, children get an explicit `env`, and a changed contribution id is a MAJOR (`vscode-extension.md`) |
| 24 | Product type `cli` or `library`: a changed exit code, flag or `--json` field is a MAJOR, `--json` output carries no log lines, the release installs from the built artifact, and destructive commands ask or need `--yes` (`cli.md`) |
| 25 | Product type `ai`: the model id is pinned, a prompt change ships with its eval result against the last release, model calls are capped per call and per day, and logs keep no personal data in prompts (`ai-app.md`) |
| 26 | Product type `mobile`: the store rollout is staged, the minimum supported app version is stated and the API still serves it, permissions are asked in context, and every screen has an offline state (`mobile.md`) |
| 27 | `## Rollout and rollback` matches the diff and `deploy-plan-check.mjs <slug>` exits 0 on the shipped commit: the key lines use the shared vocabulary (`deploy_impact`, `db_change`, `data_change`, `rollback`, `backup`, `post_backup_writes`, `api_change`) and the handoff copies them; `deploy_impact: none` only when no migration, schema, contract or event file changed; for a DB change `db_change` and `data_change` true to the migrations, N-1 compatibility, expand → migrate → contract for renames and drops, lock risk, backfill, the snapshot command for this host and the DB rollback; for an API change `api_change` additive, versioned or deprecated, the version or deprecation window, the clients on the old shape and the rollout order; the order of steps with why, the check after each, the code rollback, a decider by name and what ran on staging. A migration that changes existing rows carries `### Data`: backup with a restore tried, baseline, dry run, order, uptime, verification after, cleanup, the restore-only point and what a restore loses. A missing, `TBD` or contradicted section fails the row (§7, §13.4) |

## Check 19: open the CI job, do not read the line

`node <root>/scripts/lint-dev.mjs --json` and filter W060 for this slug: any left is a `FAIL`, and a
`PASS` verdict over it is `error` E060. Then open at least one proof's job or log: it names the
shipped commit, the gate's command ran (not `SKIPPED`, not filtered to zero tests), and the job
passed. A proof that does not say what it claims is `BLOCKER` — it is a fabricated green, the one
§12.1 calls unrecoverable. On release-management, `-race`, the 60 s fuzz and the DB roles were all
"CI runs it" and no gate ever asked for the run.

## Checks 6 and 7: run them, do not read them

This is the check the whole gate exists for, and it is the one a reviewer does worst by eye —
twenty criteria all look present when you are scrolling.

```bash
grep -o 'REQ-[0-9]\+' <root>/requirements/<slug>/requirements.md | sort -u > /tmp/req-src
grep -o 'REQ-[0-9]\+' <root>/release/<slug>/qa-handoff.md      | sort -u > /tmp/req-pkt
comm -3 /tmp/req-src /tmp/req-pkt
```

An empty `comm` output is your evidence. A non-empty one names exactly which requirement did not
make the crossing, which is a far better finding than "the REQ table looks incomplete".

Then do the same for criterion ids, and for a sample of three criteria **diff the text**, not the
presence. A criterion that arrives as "the user sees an appropriate error" when the source said
"422 with `type: validation_error` and a field-level `errors[]` entry for `due_date`" has lost the
only part that made it testable. That is a `MAJOR`: the QA bundle will write a test against the
weaker sentence and it will pass while the product is wrong.

## Check 2: the PR body is a claim you can verify

The repository copy is what this gate hashes (§5.2). The submitted PR is what a human merges on. If
they differ, the gate certified a document that was never reviewed.

Compare them. `gh pr view <n> --json body` or `glab mr view <n>` where the CLI is available and
authenticated; otherwise `git log --format=%B` on the branch plus the PR URL in the artifact, and
say in your evidence cell which you used and what you could not reach. **"Could not verify
read-only" is a `FAIL` for the row, not a guess dressed as a result** — but it is a `MINOR` finding
when the tooling is genuinely absent, and a `MAJOR` when the two texts are available and disagree.

## Check 9: you cannot judge the list by its length

The instinct is to read the automation-tier list and think "that seems about right". There is no
right length, and the number tells you nothing.

What you can check is the **relationship**: every acceptance criterion is either proved here, with a
test named, or in the automation list, with a journey. A criterion in neither column is the finding.
A criterion in both is a different finding — someone is double-counting coverage.

Then apply one sanity test in the other direction: `DEV-PROFILE §Testing ownership` puts e2e,
performance, security, accessibility and mobile in the QA bundle. A feature with real user journeys
whose automation list is empty has not been thoroughly tested here; it has been handed over blind.
Quote the journey you can see in the PRD that nothing covers.

## Check 16: the assumption that ships

§15.2 is explicit that an `assumed` decision reaching G9 unanswered is a `MAJOR` finding, and this
is the gate that has to enforce it, because it is the last one before the code is live.

Open `<root>/decisions/<slug>.md`. For every row that is `open`, ask whether the shipped behaviour
depends on the answer — if it does, the release has chosen for a human who never chose. For every
row that is `assumed`, check `who:` names a person. An `assumed` row with an agent's name, a skill
name, or no name at all is a `MAJOR` regardless of how reasonable the default looks: the whole point
of the field is that a human said "proceed".

## Severity for this gate

- `BLOCKER` — a quality gate red with no written waiver (§12); a secret in the diff, the packet or a
  commit message; a breaking API or schema change with no `contract-diff.md` entry and no ADR (§6);
  a shipped commit SHA that does not exist or is not on the branch; a DB or API change whose `## Rollout and rollback` is missing, `TBD` or says `deploy_impact: none` (check 27); a migration that changes existing rows with no backup or no way back stated.
- `MAJOR` — a `REQ-NNN` or acceptance criterion that did not reach the packet, or arrived weakened
  (checks 6–7); an acceptance criterion proved by nothing and listed for nobody (check 9); an
  `assumed` or load-bearing `open` decision (check 16); a PR body that differs from what was
  submitted; a migration ordering that contradicts `migration-plan.md`.
- `MINOR` — a dead link, a missing test reference on an otherwise covered criterion, a thin risk
  section, commit messages without an impact line.
- `INFO` — a journey worth adding to the automation list, a reviewer-notes paragraph worth
  expanding, an observation about the branch history.

## Findings that are usually wrong

1. **"The handoff duplicates the requirements."** Duplication *is* the deliverable. §9 makes this
   packet the only channel, so the reader cannot follow a reference into `<root>/**`. A handoff that
   links where it should copy is the finding; a handoff that copies is doing its job.
2. **"The automation-tier list is too long."** Length is not a defect and you have no baseline for
   it. Judge the complement relationship (check 9) and nothing else.
3. **"This should have been squashed differently."** Unless the history hides something a reviewer
   needs — a reverted commit, a secret added and removed, mixed unrelated concerns — commit shape is
   taste, and `INFO` at most. Check 4 is about `wip` noise and missing impact statements, not about
   your preferred granularity.
4. **"The PR body should say X."** State what is missing and why a reader needs it. Writing the
   replacement paragraph is authoring, and you may not author (§4.5).
5. **"`authored_by` does not match the template header."** The G9 templates' headers still name the
   skills as they were before this bundle split them. §3.1 asks the artifact to name the skill that
   authored it, and the linter checks only that `authored_by` and `reviewed_by` differ. Record the
   mismatch as `INFO` against the bundle if you like — it is not a gate failure for this slug.

`PASS` with zero findings is the correct outcome for a release that packaged itself honestly.
