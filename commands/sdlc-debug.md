---
description: Investigate an incident: reproduce, find the cause, stop. Deliberately outside the gate ladder.
disable-model-invocation: true
argument-hint: <symptom>
---

Investigate: `$1`.

**This command is gate-free on purpose.** Everything else in this bundle exists to slow a change
down enough to be sure of it. An incident inverts that: the cost of waiting is the thing you are
trying to stop. A pipeline with no fast path does not get a fast path added later — it gets
abandoned at 2am, and then it is abandoned at 2pm too.

So this produces **no artifact, no gate log, and no change to `state.json`**. It ends with an
understanding and a recommendation, and the fix goes back through the ladder at whatever class it
turns out to deserve.

## Build a red loop before you theorise

The first question is not "what could cause this" but **"can I make it happen?"** A cause you
cannot reproduce is a hypothesis, and under time pressure it is usually the first plausible one.

1. **The symptom, as observed.** Who saw what, when, where, with what inputs: the actual error,
   id and timestamp, not "the export is broken".
2. **The expectation and its source**: a `REQ-NNN`, an acceptance criterion, a contract, a
   runbook. An expectation with no source is how an investigation ends by changing it.
3. **One command that goes red on this symptom, already run.** Show the command and its output.
   In order of preference: a failing test at the nearest seam, a request against a dev server, the
   CLI on a fixture diffed against expected output, a replay of a captured payload, `git bisect run`
   between a good and a bad state, old and new version on the same input diffed. Make it fast and
   deterministic: pin the clock, seed randomness; for a flaky symptom, loop it until it fails
   often enough to work against and record the rate. Until this exists, say "no reproduction yet"
   and list what you need, rather than imply you have one.
4. **Shrink it.** Remove inputs, callers and steps one at a time, rerunning after each, until
   every remaining part is needed for the red.

## Then rank hypotheses, and bisect rather than browse

Write 3 to 5 candidate causes before testing any, each as a prediction: "if X, then changing Y
turns the loop green." One hypothesis anchors you on the first idea. Test them one at a time,
one change per probe. Tag any log you add with one prefix (`[DEBUG-a4f2]`) so a single grep
removes them all.

| Ask | How |
|---|---|
| When did it start? | `git log` the touched paths, `git bisect run` with the loop |
| Is it the code or the data? | run the same input against a known-good record |
| Is it this environment? | compare config and versions, not intuition |
| Which layer? | instrument the boundary — §13.5's spans exist for this |
| Is it new, or newly noticed? | query the logs before the deploy people are blaming |

The last row is the one that saves the most time and gets asked the least.

## What you may and may not do

You may read anything, run anything read-only, query logs and metrics, and write a **throwaway**
reproduction test in the scratch area. Remove every tagged log before you report.

You may **not** ship the fix. Not a one-liner, not "while I am here". The point of finding a cause
is that it changes what the right fix is, and a fix applied inside the investigation is a fix that
was chosen before the cause was known. It also arrives with no requirement, no review, and nothing
that will stop it regressing — which is how the same incident happens twice.

You may not edit any `<root>/` artifact, write a gate log, or mark anything resolved.

## What you produce

A short account, in the conversation, not in a file:

- **The symptom**, as observed.
- **The reproduction**: the red command and its output, shrunk.
- **The hypotheses**, each confirmed or ruled out, with the probe that decided it.
- **The cause**, with the `file:line` that proves it — or an honest "not found, here is what has
  been ruled out". A ruled-out list is a real result and the next person will need it.
- **The blast radius**: what else uses this, found by grep, not by memory.
- **The seam for the regression test**: where a test can run the real failing pattern. If none
  can (the bug needs two callers, the only seam has one), say so: that is a design finding for
  the fix's plan, not a test to skip.
- **The recommendation**: the change class it deserves, and the command that starts it.

Then say which:

| What you found | Where it goes |
|---|---|
| a defect with no contract, schema or UI change | `/sdlc-intake <slug> --class fix` |
| a defect whose fix changes a rule, a field or an endpoint | `/sdlc-intake <slug> --class change` — a `fix` that ships a migration is not a `fix` (§15.1) |
| the behaviour is correct and the expectation was wrong | a `DEC-NNN` through `/sdlc-ask`, or a finding against the requirement |
| a gate would have caught it, had it asked | **also** `/sdlc-improve <gate> "<the missing check>"` — this is §17, and it is the only part of an incident that compounds |

That last row is the one to actually do. An incident that produces only a fix has cost you the whole
outage and bought one line of code.

## Refuse

- To guess at a cause to close the investigation. "Probably a race condition" with no evidence is
  worse than "unknown", because it stops people looking.
- To answer an open `DEC-NNN` in order to proceed (§15.2). Investigate everything that does not
  depend on it and say what does.
- To touch production state — no restarts, no cache clears, no data edits. Those are `/sdlc-deploy`'s
  runbook, executed by whoever owns that decision, not a side effect of looking.
