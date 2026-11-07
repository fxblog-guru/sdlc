# Using agentic-fx-dev

Written for: an engineer who has just had this bundle installed in a repository and wants to ship
something with it.

This is the practical guide. [`DEV-CONTRACTS.md`](../DEV-CONTRACTS.md) is the authority — where this
guide and the contract disagree, the contract is right and this file has a bug.

To see the whole ladder before reading about it, open
[`docs/showcase/pipeline.html`](showcase/pipeline.html) in a browser. One sample change goes through
all thirteen gates, including a G2 round that comes back `CHANGES_REQUESTED`.

---

## The one paragraph that explains the whole thing

Every stage of work is written by one agent and judged by a different one that **never sees the
author's reasoning** — only the file paths. The judgement is written to `<root>/reviews/` as a log with
a verdict and evidence for every check. The next command reads that log, and refuses to start
without a `PASS`.

Everything else — the templates, the hashes, the decision ledger, the linter — exists to keep that
one property true when nobody is watching.

---

## Day one

```bash
node <root>/scripts/doctor.mjs      # does this machine have what the pipeline needs?
/sdlc-status                     # what is in flight (empty on a new install)
```

`doctor` warns rather than fails for anything optional. A `[FAIL]` is a real blocker; a `[WARN]`
tells you which gate will be unhappy later and why.

**If the repository already has code, run `/sdlc-onboard` before anything else.** It builds six
knowledge cards under `<root>/knowledge/` — the module map, the conventions actually used here, the
live schema, the live API, where tests go, and what not to touch — and reviews them at gate `GK`.

This is not a formality and it is the step people skip. A brownfield design written without those
cards is correct in general and wrong here: it duplicates what exists, puts files where this repo
does not put them, and proposes a schema change the migration history already rejected. G2 and G6
have brownfield obligations that fail without the cards (§16.4), so skipping onboarding does not
save the time — it just moves the cost to a gate.

**If the product has a UI, run `/sdlc-design-system` before the first `/sdlc-ui`.** With no
argument it lists seven presets and recommends one for your users. You choose, and your name is
recorded as the chooser. `/sdlc-design-system dense-enterprise` (or `--from-shadcn theme.css` for a
shadcn/tweakcn theme, `--from-figma <url>`, or `--from-code` for an existing theme) then writes the tokens, `tokens.css` and the page patterns.
G5 stops without them, because a spec with no decided look lets every screen invent its own.
`/sdlc-design-system --check` re-verifies contrast and that nobody hand-edited the rendered file.

---

## Shipping something

```bash
/sdlc-intake add-job-export --class initiative
/sdlc-requirements add-job-export
/sdlc-design add-job-export
/sdlc-data add-job-export        # only if it touches the schema
/sdlc-api add-job-export         # only if it touches a contract
/sdlc-ui add-job-export          # only if it has a user interface
/sdlc-plan add-job-export
/sdlc-implement add-job-export
/sdlc-verify add-job-export
/sdlc-release add-job-export
/sdlc-deploy add-job-export
/sdlc-monitor add-job-export
```

You do not have to remember that list. `/sdlc-status <slug>` ends by printing the next command, and
it is right more reliably than memory is — it knows which gates your change class skipped and which
one is currently stale.

### Pick the class honestly, because it decides how much this costs

| Class | Use it for | Runs |
|---|---|---|
| `initiative` | a new capability | all twelve gates |
| `change` | a new field, a changed rule, a new endpoint on an existing resource | G1 (short) · G6 · G7 · G8 · G9, plus whichever of G2–G5 and G10–G11 it actually touches |
| `fix` | a defect with no contract, schema or UI change | G7 · G8 · G9 |
| `refactor` | a structural change nothing outside the code can observe, through `/sdlc-refactor` | G7 · G8 · G9, with G7's no-test-changed checks |
| `spike` | a question only an experiment answers: will it work, how fast, how much | G0 · G2 — the answer is an ADR; the spike branch is never merged |
| `fast` | a product the requester wants usable now, through `/sdlc-fast` | G0 · G1 · the look (G5), then one G7 per usable slice on a deploying skeleton · G8 · G9 · G10; G2–G4 only for a slice that touches sign-in, secrets, money, personal data, a destructive migration or a published API |

Over-classifying is the more common mistake and it is the expensive one: twelve gates on a nullable
column teaches everybody to route around the pipeline, and a pipeline that is routed around is
decoration.

Under-classifying is caught rather than punished. If a `fix` turns out to need a migration, the
stage that discovers it stops and re-classifies — that is the system working, not a failure.

### A big task list: let `/sdlc-implement` resume, or run it in slices

The implementer commits after every task and records it in `<root>/implementation/<slug>/progress.md`
(`TASK-NNN | done | <commit>`); `tasks.md` keeps only the plan, so building it never stales G6. If
it runs out of turns it hands back what is done and what is not, and the next run resumes from
`git log` and that file. `/sdlc-implement <slug> TASK-007` builds one task.

For a hundred-task initiative, plan slices and lanes at G6 and use the optional slice mode: one
implementer per lane in its own worktree and database, merged back `--no-ff`, a G7 per slice and
a final G7 over the branch. `status.mjs <slug> --ready` lists the next wave. The procedure is in
`skills/dev-stage-protocol/slice-mode.md`.

---

## When a gate comes back `CHANGES_REQUESTED`

Nothing to do. Re-run the same command; it re-spawns the author with the gate log, resolves each
finding **by id**, and re-reviews as attempt 2.

There is no attempt 3. Two rounds that have not converged mean the disagreement is not about the
document, and it goes to a human — you. Read both logs, decide, and record the decision.

### Reading a gate log

Read `## Verdict` last, not first. The parts that carry the information are:

- `## Checklist` — every row has an **evidence cell**, and the evidence is usually a command that
  was run. If a row says `PASS` with a vague cell, that is a weak row and worth distrusting.
- `## Findings` — each has a severity that is a claim about consequence, not about annoyance.
  `BLOCKER` and `MAJOR` stop the gate; `MINOR` and `INFO` are recorded and carried forward, which
  means a later gate will still see them.
- `## Finding resolution` (attempt 2 only) — one row per prior finding, `RESOLVED`, `ACCEPTED` or
  `REOPENED`, each verified individually. "All findings addressed" is not an allowed answer.

---

## When something needs a human

Agents open `DEC-NNN` rows in `<root>/decisions/<slug>.md` for anything only a person can answer — what
customers will pay for, what risk is acceptable, which of two products this should look like.

```bash
/sdlc-ask add-job-export          # lists the open ones and records your answers
```

**An agent may never answer one of these, including by choosing the default it recommended.** That
is the rule the ledger rests on: a default an agent picks for itself is still its answer to a
question it was told it could not answer, and minuting it does not change that. So the stage carries
on with everything that does not depend on the answer, and marks what does `N/A — blocked by
DEC-NNN`.

The practical consequence is worth knowing: **an open decision does not stop the ladder.** It leaves
visible holes in specific places, which is the point — you can see exactly what your answer is
holding up.

---

## When a gate goes `STALE`

Something a gate's verdict rested on has changed. `/sdlc-status` names the file and the two hashes.

```bash
/sdlc-gate add-job-export G1                # full re-review
/sdlc-gate add-job-export G1 --reaffirm     # "does the old verdict still hold?"
```

`--reaffirm` is the cheap path and it is not available for everything. It works when an **input**
changed — an upstream artifact, a knowledge card, the decision ledger. It refuses when the gate's
**own output** changed, because that is not a re-check, it is a new review with the checklist
skipped.

**Commit `<root>/` when a gate passes.** `--reaffirm` works by diffing the version a verdict was
reached against with the version on disk, and it gets the first of those from git. A reviewed
version that was never committed cannot be recovered, and the reviewer will correctly refuse to
reaffirm a change it cannot bound. Skip this and the cheap path silently stops existing, in exactly
the projects with the longest ladders.

---

## The two commands outside the ladder

```bash
/sdlc-debug "exports are empty for accounts created after Tuesday"
/sdlc-refactor cli_afx/installer.py
```

`/sdlc-debug` is gate-free on purpose. An incident cannot wait for G0, and a pipeline with no fast
path does not get one added — it gets abandoned at 2am, and then at 2pm. It reproduces, finds the
cause, and stops; the fix re-enters through the ladder at whatever class it turns out to deserve.

`/sdlc-refactor` skips G0–G6 because there is no new behaviour to specify, and is judged at G7 with
one extra condition: **if a test had to change, it was not a refactor.**

---

## Looking for vulnerabilities

```bash
/sdlc-security                 # the whole repo: scanners, then an attacker's read of the risk paths
/sdlc-security pipeline        # CI, Dockerfiles, IaC: pins, secrets, gates that cannot fail
/sdlc-security ai              # prompts, retrieval, tools: injection, leakage, excessive agency
/sdlc-security orders-cap      # one slug, against its threat model
/sdlc-security --scan-only     # just the scanners and the ledger, no agent: fast, for a fix loop
```

Every finding, from a scanner or from the reviewer, becomes a `SEC-NNN` row in
`<root>/security/findings.md`. You triage each row once, by editing it: `accepted` (with your name
and an end date), `false-positive` (with the reason), or leave it `open` and fix it. The next scan
keeps your decision and marks a row `fixed` when its scanner no longer finds it. G8 and G9 refuse
while a critical or high row is untriaged, so a finding cannot quietly ship.

The command reads code. Attacking the running app (an active ZAP scan, an authz matrix across
roles) is the QA bundle's `/qa-design --type security`. Run both: they find different bugs.

## Reviewing a teammate's pull request

```bash
/sdlc-review-pr 42                   # GitLab MR !42 or GitHub PR #42 — read from origin, no CLI needed
/sdlc-review-pr feature/orders-cap   # a branch, before anyone opens the PR
```

When several people build on one repository, every PR needs a second pair of eyes before it
merges. `/sdlc-review-pr` is that review, and it is not a gate: it works on any PR, including one
that never went through `/sdlc-*`. It runs `<root>/scripts/pr-scan.mjs` first (secrets, edited
migrations, focused or deleted tests, source with no test, contract changes, size, and the slug's
G7/G8 verdicts), then an independent reviewer runs the build and tests from a throwaway worktree, reads the diff against a 23-row checklist in four groups (right · does not break · right format · ready to merge), then
writes `<root>/pr-reviews/<pr-id>-<run-id>.md`, which ends with a comment you paste into the PR.

A PR that changes test cases or scripts under `qa/` is a *testing* PR. Review it with
`/qa-review-pr` from the QA bundle, which looks for different failures: a weakened assertion, a
skip, a script with no case.

In CI, the same scanner is a merge-request job (`sdlc:pr-scan`) that fails only on `BLOCKER`
findings. Everything else is for the human reviewer.

---

## Reading the board

```bash
/sdlc-status            # everything
/sdlc-status <slug>     # one initiative, with the next command
```

`<root>/state.json` and `<root>/DASHBOARD.md` are **derived**. Never edit them — `build-state.mjs`
regenerates both from the gate logs, and a hand-edit is overwritten the next time any command runs.
If the board says something surprising, the bug is in a gate log or in the builder, and that is
exactly where you want to be sent.

There is a VS Code viewer in [`editor/vscode-sdlc`](../editor/vscode-sdlc) that renders the same
index as a board, a tree and a status-bar item. It is read-only by design: it never writes to the
workspace and never runs a `/sdlc-*` command, because an editor plugin that could nudge a gate log
would make every green board a little less believable.

---

## CI

Copy one of [`workspace/dev/ci/`](../workspace/dev/ci) into your pipeline. It runs the linter and
checks that the committed index matches a fresh rebuild — the same two commands you run locally, so
there is nothing in CI that you meet for the first time on a red pipeline.

CI does **not** re-run the gate reviews. A reviewer is a model call; the gate log is the durable
artifact, and CI's job is to check it is present, well-formed and current.

---

## When the pipeline gets something wrong

That is the loop, not the exception.

```bash
/sdlc-improve G3 "every migration states what happens to rows that already exist"
```

It adds one row to that gate's published checklist, **plus two fixtures**: one that the new check
must catch, and one it must leave alone. The second is the one people skip and the one that
matters — a check that fires on everything trains reviewers to wave findings through, which is worse
than not having the check.

Only add a check something real went wrong for. A checklist that grows on good intentions reaches
forty rows and stops being read, and then none of the rows work.

---

## Five things that surprise people

1. **The reviewer genuinely has not read the author's reasoning.** If a finding looks like it missed
   an obvious explanation, the explanation was not in the document — and that is the finding.
2. **`PASS` with zero findings is a correct outcome.** A log padded with `MINOR` rows to look
   diligent is a log nobody will read carefully.
3. **Editing an artifact after its gate passed turns the gate `STALE`**, immediately and
   automatically. That is the hash doing its job, not a glitch.
4. **There is no `approved` status on an artifact.** Whether it passed is in the gate log, which is
   one `ls` away. Two places to record approval means two places that can disagree.
5. **A `SKIPPED` gate is a written act**, with a typed reason, and only a reviewer may declare one.
   A gate with no log is *blocked*, not skipped.
