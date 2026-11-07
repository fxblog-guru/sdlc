# Receiving review findings — for every author re-spawned on CHANGES_REQUESTED

Loaded by `dev-stage-protocol` §4 when an author is re-spawned with a gate log, and by
`/sdlc-review-pr` when an agent fixes a teammate review's findings. A finding is a claim about the
artifact or the code, to be checked like any other claim, not an instruction to obey and not a
criticism to placate.

## 1. Read every finding before changing anything

1. Read the whole `## Findings` table (and `## Finding resolution` on a re-entry) before the first
   edit. Findings interact: a fix for one can be the cause of another.
2. Restate each finding to yourself as the concrete change it asks for. If you cannot, it is
   unclear.
3. **Any finding unclear: stop before fixing any of them.** Hand back the ids you understand and,
   for each unclear one, the exact question. A partial understanding produces a partial fix that
   the reviewer then has to untangle.

## 2. Verify each finding against what is actually there

Open the location the finding cites and the evidence it gives. Then check it against the source of
truth for that kind of claim:

| Finding is about | Check it against |
|---|---|
| code behaviour | the code at that `path` + symbol, and a test you run now |
| a contract or schema | `openapi.yaml` / the `.proto` / `data-model.md` as they are on disk |
| a rule | the `DEV-CONTRACTS.md` section it cites (`contracts.mjs <id>`) |
| this repository's style | `knowledge/conventions.md`, not a generic house style |
| "nothing else uses this" | a grep of the source root |

A finding the reviewer could not have seen the context for — a legacy constraint, an answered
`DEC-NNN`, an upstream gate's decision — is checked against that context, not waved through.

## 3. Classify each finding — one of three

| Class | When | Resolution map entry |
|---|---|---|
| **accept** | verified correct | `fixed — <what changed>` (or `accepted — <change>` when the change is the one the finding asked for, word for word) |
| **push back** | verified wrong, or right in general but wrong for this repository | `disputed — <evidence>` |
| **needs-decision** | only a human can close it: a count, a cost, a priority, a date, a scope call | `decision — DEC-NNN` |

Push-back evidence is something the reviewer can re-check without you: a `path` + symbol, a test
name with its output, a contract section, a decision id. "I disagree" or "the current approach is
fine" is not evidence. Record a needs-decision as `DEC-NNN` in `<root>/decisions/<slug>.md` with
options (§15.2); never pick the answer yourself.

A finding owned by an earlier gate (a contract break, a schema change) is neither fixed nor disputed
here: name the gate it re-opens (§12.6).

## 4. Fix accepted findings one at a time

1. Order: `BLOCKER`, then `MAJOR`, then the rest.
2. Per finding: a test that fails because of the problem the finding names, then the fix, then that
   test and its neighbours green. Code gets a test; a document fix gets the linter or checker that
   covers it.
3. One finding per commit where the stage commits (`Refs: CR-NNN`). Never fold an unrequested
   refactor into a fix: the re-review reads the diff, and noise there hides the change.
4. If a fix turns out to need a decision or breaks something else, stop and reclassify it; do not
   ship half of it as `fixed`.

## 5. Fresh evidence, or no claim

No `fixed`, `done`, `passing` or `green` without the command that proves it, run **in this turn**,
after the last edit, with its result cited (the summary line, the exit code, the failure count). An
earlier run, a run before the last edit, a partial run, or "should pass" does not count. If the
command could not run, the entry says so and the finding is not `fixed`.

## 6. How to respond

- One resolution-map entry per `CR-NNN`, in id order. Silence on a finding is a violation (§4.3).
- Technical statements only. No "you're absolutely right", "great catch", thanks or apology: they
  carry no information and read as agreement the evidence has not earned. State what changed or why
  not.
- A push-back that turns out wrong on checking is corrected in one line, then fixed.
- The map goes in your handback. The reviewer verifies each entry against the files, never against
  your wording (§4.5).
