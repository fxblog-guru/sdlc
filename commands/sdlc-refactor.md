---
description: Behaviour-preserving change reviewed at G7 standards, with no G0–G6 ladder.
disable-model-invocation: true
argument-hint: <target> [--slug <slug>] [--reason "<why now>"]
---

Refactor `$1`.

A refactor has no requirement, no acceptance criterion and no design decision, because **nothing a
user or a caller can observe is allowed to change.** Running it through G0–G6 would produce six
documents all saying "as before", which is how a ladder teaches people to route around it.

What it does have is the one condition that matters: proof that behaviour did not move. That
condition is stricter than a normal G7, not looser.

## Preflight

0. The slug is class `refactor` (§15.1). With no slug yet, run `/sdlc-intake <slug> --class refactor`
   first: it sizes the work and writes the G0–G6 skips by class, so this command never writes one.
1. `node <root>/scripts/build-state.mjs --quiet`. If `$1` is inside a slug with an open gate, stop and
   say so — refactoring code that a live initiative is mid-way through editing produces a merge
   nobody can review.
2. **Establish the safety net before touching anything.** Run the existing tests over the target and
   record the result. If coverage on the target is thin, that is not a reason to proceed carefully;
   it is the first task. Write characterisation tests against current behaviour — including the
   behaviour you think is wrong — and get them green *before* the refactor starts.
3. Record the merge base commit. Every claim below is measured against it.
4. Read `<root>/knowledge/known-debt.md`. If the target is listed there with a reason not to touch it,
   that reason is a decision someone already made; surface it and stop.

## The rule that defines this command

**If a test had to change, it was not a refactor.**

Not "the test was badly written". Not "the new structure made that assertion awkward". A test
changing is the signal that observable behaviour moved, and the correct response is to stop and
re-enter through `/sdlc-intake $1 --class change`, where the behaviour change gets a requirement and
a review.

The three exceptions, and they are narrow — each must be named explicitly in the summary:

- a test that referenced a **renamed private symbol** and asserts nothing about behaviour
- a test whose **import path** moved with the file
- a test that was **asserting on implementation**, not behaviour, and is being deleted rather than
  rewritten — which is itself worth stating, because it means that behaviour is now untested

## Do the work

Invoke the language skill for the stack — `dev-writing-go-code`, `dev-writing-python-code`,
`dev-writing-react-code`, `dev-writing-nextjs-code` — and `dev-resolving-code-placement` for
anything that moves.

Two constraints that make the change reviewable:

- **One kind of change per commit.** A commit that both moves a file and edits its logic cannot be
  reviewed, because the diff shows every line as changed and the one real edit hides inside the
  move. Move in one commit, edit in the next.
- **No opportunistic fixes.** A bug found mid-refactor is a finding, not a fix — it goes to
  `/sdlc-debug` or straight to `/sdlc-intake --class fix`. Fixing it here buries a behaviour change
  inside a change that claims to have none, which is the one thing this command must never ship.

## Review

Spawn **`dev-gate-reviewer`** with paths only, and the prior test result. It invokes
`dev-reviewing-implementation`, applies its published checklist, and adds the three questions this
command exists for:

| # | Check | Evidence a reviewer accepts |
|---|---|---|
| R1 | No test file changed, or every change is one of the three named exceptions | `git diff --stat <base>..HEAD -- <test paths>` |
| R2 | The full suite passes, and the same tests pass as before — not merely the same count | both runs, compared by name |
| R3 | No public surface moved: no exported symbol renamed or removed, no endpoint, no schema, no config key | `git diff` on the public surface, plus a grep for call sites outside the target |

It writes `<root>/reviews/<slug>/G7-implementation-<run-id>.md` (`…-<run-id>-a2.md` on attempt 2, §5)
as normal. A refactor is judged at G7; G0–G6 were `SKIPPED` by class at intake (§15.1), never by this
command. G8 and G9 run as for a `fix`: `/sdlc-verify <slug>`, then `/sdlc-release <slug>`.

## After

Say the next command as the thing that happens next, with one clause on what it produces — never as "do you want me to…?" (§4.1a). Offer a choice only where a human decision genuinely exists, and then as options with a recommended default, the way `/sdlc-ask` does.

`node <root>/scripts/build-state.mjs --quiet`, then `node <root>/scripts/status.mjs $1` verbatim.

On a `PASS`, commit `<root>/` — `git add <root> && git commit -m "G7 <slug> PASS (<run-id>)"`. As
everywhere else, `--reaffirm` diffs the reviewed version against disk (§4.4), and a version that was
never committed cannot be recovered.

## Refuse

- To refactor without a safety net. "The change is obviously safe" is the sentence that precedes
  every refactor-shaped incident. If the tests are not there, writing them **is** the task.
- To change behaviour, however small and however clearly better. That is `--class change`, and the
  slug is re-classified, not stretched (§15.1).
- To refactor and upgrade a dependency in the same pass. Two changes, two reviews — when something
  breaks afterwards, you want to know which one.
- To touch a migration or a schema. There is no such thing as a behaviour-preserving schema change
  from a caller's point of view; that is G3.
- To answer an open `DEC-NNN` (§15.2).
