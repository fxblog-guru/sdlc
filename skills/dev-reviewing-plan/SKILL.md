---
name: dev-reviewing-plan
description: G6 gate review. Use for its verdict: judges tasks.md (REQ↔TASK both ways, DAG, estimates) against the checklist and writes the gate log.
---

# Reviewing G6 — plan

You are judging whether this plan can be **executed without re-opening an earlier gate**.

That is the whole question. Eleven gates of decisions sit upstream; if a task cannot be started
without deciding where the code goes, what proves it, or which requirement it serves, then the
decision will be made at G7 by whoever is typing, alone, with no review. The plan will still look
fine. The unreviewed decision is what you are here to find.

> `DEV-CONTRACTS.md` §1 (`TASK-NNN` is permanent and is the join key to G7 and G8), §6
> (traceability), §10 (the four task states), §9 (why the automation-tier list is a handoff), §7
> (migration ordering). You write `<root>/reviews/<slug>/G6-plan-<run-id>.md` and nothing else.

## What you receive

Paths: `plan/<slug>/tasks.md`, the upstream `requirements/<slug>/requirements.md` and
`acceptance-criteria.md`, `design/<slug>/architecture.md` and `impact.md`,
`data/<slug>/data-model.md` and `migration-plan.md` where G3 ran, `api/<slug>/openapi.yaml` where
G4 ran, `ui/<slug>/ui-spec.md` where G5 ran, `<root>/knowledge/conventions.md`,
`<root>/decisions/<slug>.md`, `<root>/state.json`, `DEV-PROFILE.md`, the gate-log template, the source
root, and the prior log on attempt 2.

Read `state.json` early, for one specific reason: G3, G4 and G5 are siblings and any of them may be
legitimately `SKIPPED` (§4.2). A gate that was skipped produces no artifact, and its absence is not
evidence that the work it would have specified is unnecessary. Know which is which before you judge
coverage.

## Applicability

> G6 applies to every change that produces code. A plan is how work is divided, ordered and traced,
> and every class produces work.

G6 runs for `initiative` and `change` alike. For class `fix`, G6 is `SKIPPED` by class at intake
(§15.1) — a defect with no contract, schema or UI change goes straight to G7, and the ladder's cost
for it is deliberately two gates rather than seven.

`NOT_APPLICABLE` is therefore almost never right here. If you are reaching for it, the likely truth
is one of two things, and both are findings rather than skips: the change was misclassified at
intake (§15.1), or the plan you were given is too thin to judge, which is `CHANGES_REQUESTED`.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Every task has a well-formed `TASK-NNN`, sequential per slug, and no id from an earlier round has been reused or renumbered (§1) |
| 2 | Every task names at least one `REQ-NNN`, and every `REQ-NNN` is realised by at least one task — counted mechanically in both directions, with both counts in the evidence (§6) |
| 3 | Every task names the files it creates or changes; no task's target is a directory or a description |
| 4 | Placement follows `knowledge/conventions.md`, with the convention or example it follows cited, rather than being chosen by taste (§16.4) |
| 5 | Every task is finishable and reviewable in one sitting; a task bundling two independent changes is two tasks |
| 6 | Every task names its test and what that test proves — "existing tests pass" is untested work |
| 7 | `Depends on` holds task ids only, references no task that does not exist, and contains no cycle |
| 8 | The sequence is ordered by risk and dependency, the riskiest task is named and comes first, and what may run in parallel is stated |
| 9 | Every estimate is a range with a stated condition for the high end; a single number is not an estimate |
| 10 | Every task's status is one of `todo`, `in-progress`, `blocked`, `done` (§10), and every `blocked` task names what blocks it |
| 11 | Every acceptance criterion is mapped to a tier, and the automation-tier list matches `acceptance-criteria.md` — that list is the QA bundle's input at G9 (§9) |
| 12 | Every schema change from G3 has a task carrying its `MIG-*` id, ordered against the deploy, with expand and contract as separate tasks (§7) |
| 13 | Every `API-*` in the G4 contract is implemented by a task or explicitly deferred with a reason (§6) |
| 14 | Every screen and state from G5 is covered by a task, or G5 is `SKIPPED` for this change |
| 15 | The observability work G2 designed — log events, metrics, spans, dashboard panels — exists as tasks in this plan, not as follow-up (§13.5) |
| 16 | Anything shipping behind a flag has a task creating it with a default, an owner and a removal date (§13.4) |
| 17 | The definition of done includes the quality gates from `DEV-PROFILE §Quality gates`, and any task that differs says so on its row |
| 18 | Unknowns are recorded as `DEC-NNN` and **left unresolved**: no task is planned to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 19 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 20 | Every file a task names sits where the blueprint puts it (`layout-check.mjs` rules: allowed roots, test tiers, no grab-bag); in greenfield the first tasks scaffold the tree with a README per top-level folder; no task moves existing code unless that move is the task (§13.9) |
| 21 | The plan carries one task per §18.2 skeleton file the repository lacks (`skeleton-check.mjs --source .` lists them), each from `<root>/_templates/skeleton/`, and the observability tasks write `ops/alerts`, `ops/dashboards`, `ops/runbooks` and `ops/config/<env>` files (§18.2, §18.3) |
| 22 | No `DEC-NNN` asks a value `DEV-PROFILE §Defaults` answers; a task that applies a default cites it (§3.2, §15.2) |
| 23 | When `visual-design.md` records a placeholder brand (`Brand: (c)`), the plan has one brand-swap task that cites that `DEC-NNN`, lists every slot file and screen it names, and is `blocked` on the DEC; with a brand kit (`(a)`, `(b)`), a task wires the `brand/` slots into the app (§13.3) |
| 24 | An `initiative`'s first slice has the two §13.4 tasks: the pipeline that builds the image and deploys it to `staging` on the real host (a walking skeleton, `/readyz` checked), and every `ops/config/keys.md` key in the secret store with `env-doctor.mjs` green for `staging` and `production`; a plan that leaves either to G10, or plans a hand-copied `.env`, fails the row (`secrets-and-environments.md`) |
| 25 | The order of work has reasons: the riskiest task is early, a walking skeleton comes before depth, a "won't" list is written, and any ranking names the human who ranked it (`prioritisation.md`) |

## Check 2 is the gate, and it is arithmetic

Do not read the table and form an impression of coverage. Count, both ways, and put both counts in
the evidence cell:

```bash
grep -oE 'REQ-[0-9]{3,}' <root>/requirements/<slug>/requirements.md | sort -u > /tmp/req.txt
grep -oE 'REQ-[0-9]{3,}' <root>/plan/<slug>/tasks.md              | sort -u > /tmp/task.txt
wc -l /tmp/req.txt /tmp/task.txt
comm -23 /tmp/req.txt /tmp/task.txt   # a requirement no task will build
comm -13 /tmp/req.txt /tmp/task.txt   # a REQ the plan cites that does not exist
```

Evidence reads like "requirements 14, cited by tasks 12; REQ-006 and REQ-011 have no task" — a
number anyone can re-derive, which "coverage looks complete" is not.

The two directions fail differently and carry different severities. A `REQ-NNN` with no task is a
`MAJOR`: it will not be built, and the discovery point is G8, where somebody is trying to explain
what proves it. A `REQ-NNN` cited by a task but absent from `requirements.md` is worse in kind — it
is a typo or a requirement that was removed, and the task is now building against something that
does not exist.

`REQ` ids alone do not settle it: check that the task actually addresses its REQ rather than merely
naming it. A citation is cheap. Sample three and read them against the requirement text.

## Check 7: run the DAG, and know what to do when it fails

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

Paste the output into the evidence cell either way. What you do with a failure depends on which
failure it is:

| Result | Verdict | Why |
|---|---|---|
| a cycle | `BLOCKER` — name every task in the cycle | There is no order in which this plan can be executed. The implementer finds this out by starting, having already begun one of the members |
| a dependency on a task that does not exist | `BLOCKER` — name the dangling id | Either a typo or a task that was deleted in a previous round. Both mean a task is waiting on nothing, and it will simply be started early |
| a DAG, but one that contradicts `## Sequence` | `MAJOR` — quote both | Two orders are written down. The implementer will follow whichever they read first, and the risk-first ordering is usually the one lost |
| a DAG with no edges at all, on a plan of fifteen tasks | `MINOR`, and read it carefully | Occasionally true. More often the column was left blank, which is not the same claim as "independent" |

Do not rewrite the dependency column in your finding. Name the cycle, say which edge you believe is
wrong and why, and let G6 re-author (§4.5).

## Check 5: the one-sitting test, applied honestly

You cannot time a task, so do not pretend to. Judge the **diff it implies**: how many files, how
many layers, how many independent behaviours. A task touching a migration, a repository, a handler
and a screen is four reviews wearing one id, and the review it will actually get is one skim.

Signals a task should be split, each of which you can see in the row: an estimate range whose top is
more than a day; an `and` in the title joining two verbs; a file list crossing three layers; a test
column naming three test files.

The opposite error is real and is `MINOR` at most: a plan of forty fifteen-minute tasks has moved
the work into coordination. Say so once, do not itemise it.

## Check 11: this is a handoff, and it is where gaps become invisible

The automation-tier list is what `agentic-fx-qa` receives at G9 (§9) — the criteria this bundle
deliberately did *not* cover with unit or integration tests. A criterion that is in none of the
three tiers is a requirement nobody will verify, and nothing downstream will notice, because each
side assumes the other has it.

So diff the lists rather than reading them:

```bash
grep -oE 'AC-[0-9]+' <root>/requirements/<slug>/acceptance-criteria.md | sort -u > /tmp/ac.txt
grep -oE 'AC-[0-9]+' <root>/plan/<slug>/tasks.md                       | sort -u > /tmp/plan-ac.txt
comm -3 /tmp/ac.txt /tmp/plan-ac.txt
```

Then check the tiers agree. `acceptance-criteria.md` already carries a `Tier` column and an
`## Automation-tier criteria (QA handoff)` section; the plan re-states the mapping with an owner and
what covers it. Where the two disagree about a criterion's tier, one of them is wrong and the
likeliest outcome is that nobody tests it — quote both cells. An unmapped criterion is a `MAJOR`.

## Severity for this gate

- `BLOCKER` — a dependency cycle or a dangling dependency (check 7); a task that cannot be started
  because its files are unnamed and its placement is undecided (checks 3–4); an expand and a
  contract migration bundled into one task (check 12), which drops a column in the release that
  stopped using it.
- `MAJOR` — a `REQ-NNN` with no task or a task citing a REQ that does not exist (check 2); a task
  with no test (check 6); an acceptance criterion in no tier (check 11); an `API-*` neither
  implemented nor deferred (check 13); observability left as follow-up (check 15); a task planned to
  one reading of an open `DEC-NNN` (check 18); a task nobody could review in one sitting (check 5);
  a placeholder brand with no brand-swap task, or a swap task that omits a screen or slot its DEC lists (check 23).
- `MINOR` — a single-number estimate on a small task; a sequence that is defensible but not
  risk-first; a `blocked` row whose blocker is named vaguely; tasks split too finely.
- `INFO` — a task worth reordering, a dependency worth removing, an experiment that would settle a
  risk more cheaply than the plan does.

## Check 18: the quiet version of guessing

It does not look like invention. The plan records `DEC-003` — "can the flag default on?" —
recommends yes, and then plans the rollout as though yes were the answer: no dark-launch task, no
toggle verification, a one-step release. The ledger row stays `open`. The board shows a question
outstanding while the plan has already chosen, and at G10 somebody executes the choice nobody made.

`assumed` is not the remedy; it needs a named human (§15.2). The remedy is
`N/A — blocked by DEC-003` on the dependent tasks, with every independent task planned in full.

Severity is `MAJOR`: the plan is not wrong, it is *unauthorised*.

## Findings that are usually wrong

1. **"This estimate is too low."** You are not estimating. What you may check is whether it is a
   range and whether its high-end condition is stated (check 9). A number you would have written
   differently is not a finding; a number with no derivation is.
2. **"These tasks should be split further."** Only when a task fails the one-sitting test as read
   from its own row. Splitting for symmetry adds coordination and removes nothing.
3. **"A task is missing."** Trace it, or it is `INFO`. A missing task is only a `MAJOR` when it is
   the reason a `REQ-NNN`, an `API-*`, a `MIG-*`, an `SLO-NNN` or a G5 screen has no coverage — and
   then you cite that id, not your intuition.
4. **"The order is wrong."** Unless it violates a dependency or buries the riskiest work, order is
   the author's call. Risk-first is a rule you can enforce; your preferred layering is not.
5. **Rewriting the task table in the finding.** State what is wrong and what must be true. Writing
   the replacement rows is authoring (§4.5), and it anchors the author on your division of the work
   rather than on the design's.

`PASS` with zero findings is the correct outcome for a plan whose coverage counts balance and whose
dependency graph runs clean.
