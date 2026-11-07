---
name: dev-planning-implementation
description: Use in /sdlc-plan (G6) to write tasks.md: TASK-NNN units with REQ, files, test and estimate range, ordered by risk and dependency.
---

# Implementation plan — G6

Adapted from `implementation-plan` in `gitlab.com/agentic-fx/skills` @ `8556e8f`, with the
estimate-as-a-model discipline of `estimating-effort`, and **re-scoped**
(`docs/skill-sources.md`).

Upstream, one `implementation_plan.md` carried the root cause, the impact analysis, the design, the
phasing and the verification, and ended by asking the user for approval. Here the first three have
their own gates and their own reviewers — root cause is G0, impact is G2, design is G2 to G5 — and
approval is a gate log written by someone who never saw your reasoning. What is left for this skill
is the part upstream did best: turning a decided design into units of work that can be executed
without re-deciding anything.

## What you are producing

`<root>/plan/<slug>/tasks.md`, copied from `<root>/_templates/tasks.md` and filled in. The headings are a
contract (§3): same wording, same order, no new top-level section, `N/A — <reason>` where a section
does not apply.

**Do not write code.** Production code is written at G7, only for an approved task, only where
placement says it goes (§12). A plan containing an implementation has pre-empted the review that
implementation was going to get.

## `TASK-NNN` is a permanent id, and it is the join key

The ids you assign are how the rest of the ladder refers to this work: G7's commits and
`change-summary.md` cite them, G8 reports against them, `state.json` tracks progress by them (§1,
§10). Sequential per slug, never reused, never renumbered.

Renumbering on a second round is the specific mistake to avoid. It looks like tidying and it
silently re-points every reference already written — including the ones in a gate log, which is
immutable and will now describe a different task than it judged (§5).

## Every task traces, and so does every requirement

Every task names at least one `REQ-NNN`. Every `REQ-NNN` in `requirements.md` is realised by at
least one task (§6). These are two different claims and both are checked, in both directions, with
counts — by the reviewer, and by you first:

```bash
grep -oE 'REQ-[0-9]{3,}' <root>/requirements/<slug>/requirements.md | sort -u > /tmp/req.txt
grep -oE 'REQ-[0-9]{3,}' <root>/plan/<slug>/tasks.md              | sort -u > /tmp/task.txt
comm -23 /tmp/req.txt /tmp/task.txt   # requirements no task will build
comm -13 /tmp/req.txt /tmp/task.txt   # REQs the plan cites that do not exist
```

A REQ with no task will not be built, and nobody will notice until G8 asks what proves it. A task
with no REQ is scope that arrived without a decision — if it is genuinely necessary infrastructure
(a migration step, a flag removal, a dashboard panel), trace it to the artifact that required it:
the `MIG-*`, the `API-*`, the `SLO-NNN`, the screen.

## A task is one sitting

If it cannot be finished in one sitting, it is two tasks. Not a style preference — three
consequences follow from a task that spans days:

- it cannot be reviewed as a unit, so its diff arrives too large to read and gets approved on trust;
- it cannot be reverted as a unit, so a bad decision inside it takes good work out with it;
- it reports "60% done" for a week, which carries the same information as no report at all.

The practical test is the review: **could one person read this diff in one go and say yes or no?**
If that needs a second sitting, split — along a seam that leaves both halves coherent. "The
repository method, with its test" then "the handler that calls it" is a good split. "The first half
of the handler" is not a task; it is an interruption.

**A change too wide for one sitting** (a rename, a new type, a replaced helper across many call
sites) splits by expand → migrate → contract, the same shape as a schema change: one task adds the
new form beside the old; migrate tasks move the call sites in batches sized by blast radius (one
module or owner per batch), each `depends_on` the expand; one contract task deletes the old form and
`depends_on` every batch. Each batch leaves the build green on its own. If they cannot, they share an
integration branch and the plan says so.

## Files, from conventions rather than from taste

Every task names the files it will create or change. "Somewhere in the service" is where scope creep
lives, and a task that cannot name its targets has not been thought about — it has been titled.

In a brownfield repo the placement answer comes from `<root>/knowledge/conventions.md`, and placement
by taste is a `MAJOR` at review (§16.4). `dev-resolving-code-placement` owns this question (§4);
where it is not installed, read `conventions.md` yourself and cite the `file:line` example each
placement follows. Citing the example is what makes the placement checkable rather than asserted.
In greenfield the first G6 writes the two conventions cards itself: [greenfield-cards.md](greenfield-cards.md).

In greenfield, the first tasks scaffold the blueprint's tree, with a README for each top-level folder: `scaffold-tasks.md` (§13.9).

## Dependencies form a DAG

`Depends on` holds task ids and nothing else. The result must have no cycle and no reference to a
task that does not exist. A cycle is not a planning wrinkle: it means no execution order satisfies
the plan, and the implementer discovers that by starting.

Prove it before you hand back rather than asserting it:

```bash
node -e '
const rows = require("fs").readFileSync(process.argv[1], "utf8").split("\n")
  .filter(l => /^\|\s*TASK-\d+/.test(l)).map(l => l.split("|").map(s => s.trim()));
const dep = new Map(rows.map(r => [r[1], (r[6] || "").match(/TASK-\d+/g) || []]));
const walk = (n, path) => {
  if (path.includes(n)) throw new Error("cycle: " + [...path, n].join(" -> "));
  for (const d of dep.get(n) || []) {
    if (!dep.has(d)) throw new Error(n + " depends on unknown " + d);
    walk(d, [...path, n]);
  }
};
[...dep.keys()].forEach(n => walk(n, []));
console.log("DAG ok:", dep.size, "tasks");
' <root>/plan/<slug>/tasks.md
```

Then order by **risk and dependency, not by layer**. The task most likely to send the design back to
G2 goes first, while changing course is still cheap. All the migrations, then all the handlers, then
all the screens feels tidy and puts the first end-to-end proof that the design works at the end,
which is the one place it cannot help you.

Say explicitly what can run in parallel. A plan that does not is read as strictly sequential, and
three people wait for one. For a large list, write `## Sequence` as **slices** (the first one end to
end) split into **lanes** with disjoint file ownership; a file two lanes need belongs to one, and the
other depends on it. That is what lets `/sdlc-implement` run lanes in parallel worktrees.

**Six lanes at most, and they are the only lanes** (§5.5). Name each lane by the files it owns
(`api`, `web-shell`, `billing`), not by a wave or a round, because review findings are routed
back to the owning lane, and `/sdlc-implement` opens no lane the plan did not name. More than six
independent streams means the slice is too big: split it into two slices, not twelve lanes.

The `Status` column carries only plan-time status — `todo`, or `blocked` with the `DEC-NNN`.
Execution status lives in `<root>/implementation/<slug>/progress.md`, so building the plan never
edits, and never stales, the plan.

> More tasks than one release takes, or open rows in `ideas.md`: read `prioritisation.md` (risk first, a written cut list, only a human ranks; G6 row 25).

## Estimates are ranges with a named high end

Never a single number. A range, plus **what would put it at the top**:

> `TASK-007` — 2–5h. 5h if `JobRepo` turns out to hold the transaction boundary, because moving it
> touches the two callers in `internal/dispatch`.

That second sentence is the value of the estimate. A single number is a promise nobody can check
until it is missed; a named high-end condition is something the implementer can settle in ten
minutes on day one, and it is what lets the total be revised intelligently instead of merely
exceeded.

Calibrate on this repository, not on instinct. `bench.mjs score` prints `estimates`: how many done
tasks landed inside their range, and the median actual ÷ high end, from the `Actual` column the
implementer records in `progress.md`. Where that is empty, read `tasks.md` beside the commit dates in
`git log`. Say how far off they ran: "past G6 estimates in this repo ran 1.6× over; the range below includes that". With no history,
say the range is uncalibrated. That is honest, and it marks the estimate G11 will check (§21, §23).

Show the total the same way: a range, the assumptions it rests on, and the two or three unknowns
that move it most. State what the estimate excludes — review waiting time, environment setup, the
QA bundle's own work — because an estimate silently excluding them will be read as including them.

## The four task states are fixed

`todo` · `in-progress` · `blocked` · `done` (§10). The linter and `build-state.mjs` match them
byte-exact; `wip`, `pending` or `n/a` break the board rather than merely looking different.

A `blocked` task **names what blocks it** in its row — a `DEC-NNN`, another task, an external
dependency with an owner. "Blocked" with no object is a task nobody can unblock, because nobody
knows who to ask.

## A UI initiative starts by copying the kit

When the slug has a ui-spec and the project has no `components/ui/button.tsx` yet, the first UI
task copies `dev-defining-design-system/kit/` into the project (its README, "Copying it in"),
before any task that builds a screen, and every screen task depends on it. The task's test is the
kit's own vitest suite, `design-system.mjs classes` and `kit-check` (§13.3). A kit that is named and
never built is how one product ships 36 button styles.

## The brand is one task, and a placeholder is planned to be swapped

Read `Brand:` in `ui/<slug>/visual-design.md` `## Basis`. With a kit (`(a)` or `(b)`), one task
copies `<repo>/brand/` into the app's public assets and wires the slots: the `<head>` favicon
links and manifest, `og:image`, the header and sign-in marks, the 404 and empty-state art, the
email logo, and `--brand-*` into the tokens. Screen tasks depend on it. With a placeholder
(`(c)`), the same wiring task runs on the placeholder kit, and a **brand-swap task** cites the
`DEC-NNN`, lists every screen and slot file the DEC names, rebuilds `brand/` from the chosen
`brand.json` and re-renders the tokens, and is `blocked` on the DEC. Because every use is a slot,
the swap changes files and tokens, never a screen. G6 fails a placeholder brand without it.

## The three kinds of work that are always planned last

**Tests.** Every task names its test and what that test proves. "Existing tests pass" is untested
work. Then map every acceptance criterion to a tier — unit, integration, or automation — and
remember what the third list is: the packet `agentic-fx-qa` consumes at G9 (§9). It must match
`acceptance-criteria.md`. A criterion in neither your tests nor that list is a requirement nobody
will verify, and the gap is found in production or not at all.

**Migrations and rollout.** Each schema change carries its `MIG-*` id and its order against the
deploy — before, with, or after the code (§7). Expand → migrate → contract means the drop is a
*later* task, often a later release, and writing it as one task with the add is how a column gets
dropped in the release that stopped using it. Every flag gets a creation task, a stated default, an
owner and a removal date (§13.4).

**Observability.** The log events, metrics, spans and dashboard panels G2 designed become tasks here
(§13.5), so they ship with the feature rather than after the first incident. A feature that reaches
G11 with no telemetry is a `BLOCKER` there, and a row in this table is the cheapest place to prevent
it. They are files, not prose: `ops/alerts/<service>.yml` (one rule per `SLO-NNN`), `ops/dashboards/`,
`ops/runbooks/<alert>.md` and `ops/config/<env>.env.example` (§18.3).

## The skeleton tasks

Run `node <root>/scripts/skeleton-check.mjs --source .` and plan one task per `MISSING` or `FAIL` row,
each starting from its file in `<root>/_templates/skeleton/` (§18.2): README, ARCHITECTURE (C4 1–2),
CHANGELOG, the `--version` build, the digest-pinned Dockerfile, Taskfile, renovate.json, the licence
step, `.editorconfig`, the Node pin and `save-exact`. Put them in the first slice: every later task
runs `task check`. The folder tree they sit in comes from `dev-resolving-code-placement`. Push the
branch in the first slice too — G7 cannot pass without a green pipeline URL.

**The pipeline and the keys come first (§13.4).** For an `initiative`, two tasks sit in the first
slice, before any feature: *pipeline: build the image and deploy it to `staging`* — lint, test, an
image pinned by digest, a deploy to the real host with the real database and domain, `/readyz`
checked (a walking skeleton); and *keys in the store, `env-doctor` green* — `ops/config/keys.md` from
its skeleton template, every row set in the secret store `DEV-PROFILE §Environments` names, and
`env-doctor.mjs --env <env> --store <store>` exiting 0 for `staging` and `production`. The deploy job
writes the env file from the store and deletes it after; no task copies a key by hand. A host or
store still open is a `DEC-NNN` these tasks are `blocked` on, not a reason to move them to G10
(`dev-planning-deployment/secrets-and-environments.md`).
Start the pipeline from the skeleton's `.gitlab-ci.yml` (build, publish to the registry at the
commit SHA, `staging` on merge to the default branch, `production` on a manual approval),
`ops/deploy.sh` and `ops/compose.prod.yaml`.

**The backend skeleton row.** The first task that validates input or answers an error carries the
shared pieces, once: the `fielderr` package from `<root>/_templates/code/<stack>/` with its codes
generated (`problems-check.mjs --emit-codes`), the status table and mapper, `db.InTx` /
`db.InReadSnapshot`, `platform/db/lookups.sql`, and `testkit` (§13.11, `greenfield-cards.md`).

## Record what you cannot know

Sequencing against someone else's release, whether a flag may default on, what capacity exists —
those are `DEC-NNN` in `<root>/decisions/<slug>.md` with a recommended default (§15.2), not commitments
you make on the business's behalf.

**You may never write `status: assumed`.** Only a named human may say "proceed on that default", and
an agent that sets it has answered a question it was told it could not answer, in the one format
designed to look like it did not. Plan everything that does not depend on the answer; mark the tasks
that do `N/A — blocked by DEC-NNN` rather than planning them to a guess — a task planned to a guess
is indistinguishable, at G7, from a task planned to an answer.

## Front matter

Fill §3.1 in full. `status: draft`, `reviewed_by: pending`, `authored_by: dev-planning-implementation`.
The gate log records the verdict; an author marking its own work approved is a contract violation
the linter rejects.

## Do not

Write code. Re-decide the architecture, the schema, the contract or the screens — a design you
cannot plan from is a finding for its gate, and editing it turns that gate `STALE` along with
everything downstream (§4.4). Declare your own gate `SKIPPED`; only a reviewer may, against its own
published applicability rule (§5.4). Estimate in a single number. Leave a task without a test.
