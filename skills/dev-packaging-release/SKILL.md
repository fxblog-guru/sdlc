---
name: dev-packaging-release
description: Use in /sdlc-release (G9) to write pull-request.md and qa-handoff.md, carrying every REQ-NNN and acceptance criterion across intact.
---

# Packaging a release — G9

Two documents, two readers, and the second one is a different team.

`pull-request.md` is for a human who will approve merging this. `qa-handoff.md` is for the
`agentic-fx-qa` bundle, which has **none of this context** and, by contract, cannot come and get it:
this bundle never writes under `qa/`, and that bundle never reads `<root>/**` except through this one
file (§9). Whatever you leave out is not available on request. It is absent.

> `DEV-CONTRACTS.md` §2 (paths), §9 (the boundary and the packet's required contents), §6 (the
> breaking-change rule), §15.2 (open decisions at G9), §14 (writing the key back to the tracker).
> `DEV-PROFILE` `Product type` other than web: read its pack, `desktop.md`, `vscode-extension.md`, `cli.md`, `ai-app.md` or `mobile.md` (signing, update channel, rollout, rollback, what operate watches; G9 rows 22–26).
> A change a user, operator or integrator will use: read `user-docs.md` (docs in the same change, runnable examples, upgrade steps; G9 row 21).
> `DEV-PROFILE.md` §Delivery (branch, commit and PR conventions), §Quality gates (what G8 had to be
> green on), §Testing ownership (which tier owns what).

Adapted from `git-branch-enforce` and `git-commit-submitted` in `gitlab.com/agentic-fx/skills`
@ `8556e8f`, with their approval loops removed — approval here is the G9 gate, not a question to the
user (`docs/skill-sources.md`).

## Before you package, check the release is real

Read `verification/<slug>/runs/<run-id>/verify.md` and the G8 gate log. **A red quality gate is not
something you write around.** `DEV-PROFILE §Quality gates` says `/sdlc-release` refuses to open a PR
while any is red; if one is red and was waived, the waiver is in the G8 log with a name against it,
and the PR body says which gate and why. A PR that quietly omits a failing gate is the single most
expensive thing you can write here, because every reader downstream assumes green.

Then read `requirements.md`, `acceptance-criteria.md` and `implementation/<slug>/change-summary.md`
in full. You are about to assert a mapping between them; you cannot assert it from a summary.

### A gate deferred to CI is proven here, or the release waits

Every `verify.md` row `NOT RUN` because CI runs it (`-race` with no C compiler, the fuzz job, DB
roles with no psql, a DAST scan with no Docker) is a promise G8 made on this release's behalf. Find
the CI pipeline for the shipped commit, open the job, and add one line per row to `## Gate logs`:

```
CI proof: Unit tests (Go) -race — https://gitlab.example/group/repo/-/jobs/123 — passed
```

The gate name is the `verify.md` row's, verbatim. A saved log under `<root>/verification/<slug>/runs/`
works in place of a URL when the CI host is not reachable from the review. A job that failed,
skipped the gate (`-race SKIPPED`) or ran a different commit is not proof: the row goes back to G8.
`node <root>/scripts/lint-dev.mjs` lists what is still unproven (W060); a G9 `PASS` with any left is
`error` E060 (§5.6). Never write a proof line for a job you have not opened.

## Branch and commits

Follow `DEV-PROFILE §Delivery` — it names this project's branch pattern and commit convention, and
it wins over any habit you have.

| Rule | What it costs to skip |
|---|---|
| Work is on a feature branch, never `main`, `develop` or `release/*` | a direct commit to a protected branch bypasses review entirely, and no gate can catch it afterwards |
| The branch name carries the tracker key and the slug | six months later the only thing linking this diff to a decision is the name |
| Commits are logical units, squashed of `wip`, `fixup`, `try again` | a reviewer reading a fifteen-commit history of false starts reviews the last commit and skims the rest |
| Each message states **problem, solution, impact** | the `git log` is the only documentation that is never out of date; a subject line alone throws away the reason |

Impact is the part people drop: behaviour changes, risks, backward compatibility. "No impact" with
no justification is not an impact statement.

**Do not force-push over a history someone has already reviewed**, and do not rewrite a branch after
the PR is open unless the reviewer asked for it. `--force-with-lease` protects you from clobbering
someone else's work; it does not protect the review from losing the version it commented on.

## The PR body is the version submitted

Write `release/<slug>/pull-request.md` from the template, then submit **that text**. Not a summary
of it, not a tidied version, not "roughly this plus whatever the tracker template added".

This matters mechanically: the gate log hashes the file's body (§5.2). If the PR on the server says
something else, the gate certified a document nobody merged on, and `--reaffirm` later diffs against
a version that was never real. Strip the front matter when pasting — it stays in the repository
copy, per the template's own note.

Fill `## Risk and rollout` honestly, `## Rollout and rollback` from the diff (below), and `## Reviewer notes` more honestly still. "Where I am least
sure" is the highest-value paragraph in a PR and the one authors reliably leave blank, because it
feels like an admission. It is not: it is the difference between a reviewer looking where the bug is
and a reviewer looking where the diff is largest.

Link the G7 and G8 gate logs. They are what make this PR auditable in a year — they show the design
was reviewed, the checks ran, and what each reviewer objected to.

## The handoff packet, written for a stranger

`qa-handoff.md` is the payload (§9). It must carry, by contract: the slug, the tracker key, the REQ
table, the acceptance criteria, the API contract path, the data model path, the shipped commit SHA,
and the automation-tier criteria list.

Three rules make it usable rather than merely complete:

**Copy, do not paraphrase.** Every `REQ-NNN` and every acceptance criterion arrives with the same
id, the same given/when/then, and the same concrete values as in `requirements/<slug>/`. A tightened
sentence is a silent edit to the thing another team will test against, and neither team will notice
until the criterion passes here and fails there. Verify it mechanically, in both directions: grep
every `REQ-NNN` from `requirements.md` in your packet, and every `REQ-NNN` in your packet back in
`requirements.md`, and compare the counts. This is a check you do badly by reading and perfectly by
running.

**Every link resolves.** Open every path you cite. A handoff whose "see the API contract" points at
a file that moved at G4 is worse than one that says the contract does not exist, because the reader
spends twenty minutes before concluding the same thing.

**Say how to read what is running.** For each deployable the release touches, name the surface
that reports its identity (a version endpoint, a header, a meta tag, a build-info file, the client's
build number, the applied migration) and what it returns for the shipped commit. QA pins every run to
that commit before judging anything; a verdict from an environment still running the old build is a
verdict about the old build. A deployable with no such surface is listed here as a gap, with the task
that adds it.

**The automation-tier list is the complement, not a highlight reel.** For every acceptance criterion
say which tier proves it, and where this bundle proved it, name the test. What is left — the
criteria observable only by running the real product — is the QA bundle's entire input. For each,
give the journey, the data it needs, and the surface.

The temptation is to make this list short, because a short list looks like thorough testing. It is
the opposite: the unit and integration tiers stop at the seams by design (`DEV-PROFILE §Testing
ownership`), so a feature with real user journeys and an empty automation list is not well tested,
it is unhandled. A silent gap here is how a regression ships with everything green behind it (§9).

## Breaking changes and migrations are declared here, not discovered

Every `API-*` change and every `MIG-*` in this release appears in both documents, with breaking
changes called out explicitly. §6 is unambiguous about what counts as breaking — removing or
renaming a field, tightening a type, changing a status code, narrowing an enum — and it requires an
entry in `contract-diff.md`, an ADR and a deprecation window. If you find one here that has none of
those, **stop**: implementation was supposed to halt and G4 re-run (§6). Record it as a finding for
the gate, do not paper over it in the PR body.

State the migration's ordering against the deploy the same way `release-plan.md` will (§7). If the
two documents disagree at G10, one of them took an outage.

## Rollout and rollback, from the diff

Every class ships through this file, so this is where the deploy plan of a `change` or `fast` slug
lives even when G10 never runs. Run
`node <root>/scripts/deploy-plan-check.mjs <slug> --base <target branch>` first: it lists what the
diff changes (migrations, ORM schema files, contracts, event schemas, data or backfill scripts),
then judges `## Rollout and rollback` against it.

The plain `key: value` lines come first, with the template's names and values exactly: the QA
bundle reads them from the PR and the handoff (`deploy_impact`, `db_change`, `data_change`,
`rollback`, `backup`, `post_backup_writes`, `api_change`).

- No DB or API change: `deploy_impact: none`, and nothing else. No ceremony.
- An additive-only migration (nullable `ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX CONCURRENTLY`,
  a wider `CHECK` list): `db_change: additive`, `data_change: none`, `rollback`, the migration ids,
  then the order, verify, code rollback, decider and staging lines.
- Anything else on the database: `db_change` per the shape (a `contract` names the release from
  which the code stopped using the old shape); whether the N-1 build still works against the new schema; renames and drops split
  expand → migrate → contract across deploys; lock time on the largest table; the backfill; the
  snapshot command for this host (a Neon branch, `aws rds create-db-snapshot`, `pg_dump -Fc`,
  `gcloud sql backups create`) or the pipeline job that takes it; and the DB rollback, saying when
  down is unsafe.
- A contract or event change: `api_change` additive, versioned or deprecated (never an unversioned
  break), the version or deprecation window, the clients
  still on the old shape (web, mobile, partners, cached JS bundles), and server-before-client order.
- **Rows already there change** (`UPDATE`, `DELETE`, `INSERT … SELECT`, `ALTER … TYPE`, `DROP`,
  `RENAME`, a backfill or import script): `data_change` names the kind, `backup` says how and where,
  `post_backup_writes` how writes after the copy are kept, and `### Data` follows. Before the deploy,
  the restore tried on staging, the baseline counts and checksums, and a dry run at
  production volume with its measured duration and locks. During, the order (expand → dual-shape
  code → batched resumable migration → switch reads → contract later) and whether the site stays
  up. After, verification against the baseline, and when the old data and the backup go. Rollback:
  the point after which only the restore gets back, and what written since is lost and how it is kept.

The order of steps names why migrate runs before or after the code; every step has the check that
follows it; the decider is a person by name; and the staging rehearsal is what actually ran there.
`deploy-plan-check.mjs` exits 0 before you hand the PR to review.

## Open decisions

Read `<root>/decisions/<slug>.md` before you write either document. **An `assumed` decision that
reaches G9 unanswered is a `MAJOR` finding** (§15.2) — an assumption that ships is a decision nobody
made. If a question is still open and the shipped behaviour depends on the answer, say so in
`## Known gaps and deferred work` with the `DEC-NNN`, and expect the gate to take it seriously.

You may not answer it yourself, and you may not set `status: assumed` — that needs a named human.

## Do not

Write code. Write the gate log. Set `status: approved`. Declare G9 `SKIPPED` — no class skips it
(§15.1). Merge your own PR, deploy, or run a migration. Edit `requirements.md` or
`acceptance-criteria.md` so the mapping comes out even: that is a finding, and editing it turns G1
`STALE` and everything downstream with it (§4.4).
