---
description: Review a teammate's development PR/MR (GitLab or GitHub): scan + read the diff → APPROVE / REQUEST CHANGES.
argument-hint: <pr-number | branch> [--base <ref>]
disable-model-invocation: true
---

Review pull request `$1`.

This is the review a teammate asks for before merging — **not a gate**. It runs on any PR in the
repository: one built through `/sdlc-implement`, a hotfix, a dependency bump, a change from someone
who never used this bundle. It writes one file and changes nothing else: no commit, no gate log, no
`state.json`, no comment posted on the platform. The person who asked posts the review.

A PR that changes `qa/` (test cases and scripts) is a testing PR and is reviewed with
`/qa-review-pr` from the QA bundle: the risks are different (a test that passes for the wrong
reason, not code that does the wrong thing). A PR that changes both gets both reviews; the scan
says so (`PR-MIXED`).

## Preflight

1. **Resolve the PR to two refs.** A number fetches the platform's own read-only ref from `origin`
   — `merge-requests/<n>/head` on GitLab, `pull/<n>/head` on GitHub — so neither `glab` nor `gh`
   is needed. A branch name is used as is. The base is `--base`, else `origin`'s default branch.
2. **Never check the PR out over the user's work.** Read it with `git show <ref>:<path>` and
   `git diff`; to run its tests, use a throwaway worktree (`git worktree add --detach
   .claude/pr-review/<n> <ref>`), and remove it when done.
3. Run `node <root>/scripts/pr-scan.mjs --pr $1` (or `--base … --head …`). Its output is the
   review's first input. If git fails (exit 2), stop and show the error: a review of a diff you
   could not read is not a review.
4. Run id: `node <root>/scripts/run-id.mjs`. The pr-id is `gitlab-<n>`, `github-<n>`, or the branch
   name with `/` replaced by `-`.

## Execution

Spawn **`dev-gate-reviewer`** with the paths only — the scan output saved to a scratch file, the two refs,
the worktree path, the PR description if the user pasted it — and tell it to invoke
`dev-reviewing-pull-request` (not a gate skill). It writes
`<root>/pr-reviews/<pr-id>-<run-id>.md`. The reviewer gets no summary from you of what the change is
"supposed" to do beyond the PR's own description: an independent read is the point.

An agent fixing the findings follows `.claude/skills/dev-stage-protocol/receiving-review.md`, and its
per-finding map goes in the PR thread. A second round (the author pushed fixes): run again with the same `$1`. The reviewer finds the
previous review in `<root>/pr-reviews/` and resolves each prior finding on the new head.

## Done

Report back, in this order:

```
✓ Wrote <root>/pr-reviews/<pr-id>-<run-id>.md
Verdict: APPROVE | REQUEST CHANGES | COMMENT   (head <sha>)
Findings: <b> BLOCKER · <M> MAJOR · <m> MINOR · <i> INFO — worst: <one line, path:line>
Scan: <n> mechanical findings (<d> dismissed with a reason)
Post: copy "## Comment to post" into the PR — this command never posts it
```

Then remove the throwaway worktree. If the verdict is `REQUEST CHANGES`, say which findings the
author must fix before a re-review, not all of them.
