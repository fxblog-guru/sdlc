# Slice mode — parallel, incremental G7

Optional. The default `/sdlc-implement` is one `dev-implementer` working the whole task list on the
feature branch, and that stays the default. Use slice mode when the task list is too large for one
implementer's turn budget, or when independent parts can be built at once. It is the pattern that
held up on a 122-task initiative; each rule below is there because skipping it cost a rework round.

## 1. G6 plans the lanes

`tasks.md` `## Sequence` groups tasks into **slices** (waves that each end in something runnable, the first one
end to end) and, inside a slice, **lanes** with disjoint file ownership where possible. A file two
lanes must both edit belongs to one of them; the other lane depends on it. Lanes that cannot be made
disjoint run one after the other, not in parallel.

Pick each wave with `node <root>/scripts/status.mjs $1 --ready`: the tasks whose dependencies are done
in `progress.md`. A wave is the ready tasks, split by lane.

## 2. One implementer per lane, each in its own worktree

For each lane in the wave — **at most 6 at once**, and only lanes `tasks.md` names (§5.5):

- Create a git worktree on a lane branch made from the **current feature branch**
  (`<feature-branch>-lane-<x>`).
- Give the lane its **own database container and port** (and any other stateful service). Two
  lanes sharing a database fail each other's integration tests, and the failure names the wrong lane.
  The lane follows `environment.md` beside this file: kill by PID only, touch no container it did
  not start, commit after each step.
- Run `node <root>/scripts/lane-brief.mjs check $1 --lane <x> --tasks <ids>`; a path another lane
  owns goes back to G6 before anyone spawns. Then spawn `dev-implementer` in that worktree with the
  lane brief (the same command without `check`) in place of `tasks.md`, the port, and the usual inputs. It works only those tasks, commits per task, and appends to `progress.md`.
- It writes its **lane note** at `<root>/implementation/$1/lanes/lane-<x>.md` — the same front
  matter and headings as `_templates/change-summary.md`, its own tasks only. Nobody edits
  `change-summary.md`; it is generated.

## 3. Lanes rebase before they hand back

Before handback, each lane **rebases** onto the latest feature branch (`git rebase <feature-branch>`)
and re-runs the quality gates there. A lane green against a stale base proves nothing about the
merge; merging the feature branch back into the lane (68 such back-merges on release-management)
buries each lane's commits under merge noise and is `commit-lint` E096. The orchestrator then merges
each lane, one at a time, re-running the gates after each, **only through**
`node <root>/scripts/lane-brief.mjs merge $1 --lane <x> --worktree <path> --compose <project>`: it
merges `--no-ff` as `merge(lane-<x>): <Done ids>`, then removes the lane's database, worktree and
branch in the same step. Never a bare `git merge`: the cleanup after it was skipped under load
(83 worktrees left on release-management; on anime-blog the owner had to ask). A conflict stops it;
resolve, commit, rerun with `--no-merge`. A lane reused later gets a fresh worktree.
The gates after each merge include **security and speed, not only tests**:
`threat-trace.mjs $1 --source . --done` (every threat a done task promised has its test),
`security-scan.mjs run` then `check` (the production dependency audit with it), and `perf-smoke.mjs`
once its task is done. A red one is a task for the owning lane's next wave. Waiting for G8 left 45 of
69 threats untested and a high-severity dependency open on anime-blog while 71 tasks merged.
`progress.md` rows come from `commit-lint.mjs --progress $1` after each merge (§18.1).

## 4. Consolidate

After a wave, run `node <root>/scripts/change-summary.mjs $1 --base <merge base>`. It folds every lane
note in, deviations and known weaknesses intact, and rebuilds the task table from git. No agent
writes the fold, and regenerating it stales nothing (§4.4). Keep the lane notes.
Then `learn.mjs harvest`: friction two lanes wrote in the same words is a lesson to distil with
`/sdlc-learn` before the next wave, so the next spawn's recall carries it.

## 4a. Explore the slice before its review

When the slice's screens run, invoke `dev-exploring-behaviour`: it drives the slice's `UB-NNN`
rows per role in Edge and writes `exploration/slice-<n>.md`. Its failures, and
`pattern-check.mjs` violations, go to the owning lanes as tasks in the next wave; re-run it on the
fixed slice, then review. It is a smoke check, not QA (§9).

## 5. Review per slice, then the whole branch

**Findings go back to the owning lane.** A slice or final review finding names a file; the lane
that owns that file gets it as a task in its next wave, in a fresh worktree of the same lane name.
No lane is opened per finding or per review round — 78 lanes for one initiative was the cost of
doing that. `drift` and `bookkeeping` findings (§5.3) go to `dev-bookkeeper`, not to a lane.

G7 may run **per slice**: its own run-id, its review log scoped to that slice's diff (slice base →
slice head, both SHAs in `## Scope`), and coverage measured against the slice base
(`DEV-PROFILE §Quality gates`, coverage base ref). A slice review catches drift while it is cheap.
It does not replace the **final G7 over the whole branch** against the PR merge base, which is the
log G8 and G9 depend on.

## 6. Upstream doc debt

A slice review that finds upstream wording or a data-model mismatch records it as a `CR` owned by
the owning gate (G1–G6). These are not fixed one by one mid-build. They are fixed in **one batched
doc pass per owning gate** at a planned stop — for example after the first end-to-end slice —
followed by one review round of that gate, and the downstream gates re-affirmed or re-run.
