---
description: Record one piece of feedback about the bundle itself into the team's Recall store for the maintainer.
disable-model-invocation: true
argument-hint: "<what happened>"
---

Record the user's feedback about **the bundle**, not about their product: `$ARGUMENTS`.

The rollout improves on two signals. Usage numbers say *what* people run (Recall's Usage tab
tracks that automatically); this command carries the *why* — the friction that numbers cannot
show. One entry per annoyance. Thirty seconds, not a form.

## Run

1. Shape the feedback into one fact:
   - **title** — the complaint in one line, concrete: "G5 gate rejects screens with no empty
     state even when N/A is stated", not "UI gate annoying".
   - **body** — what happened, what was expected, and the cost ("re-ran the stage twice",
     "wrote a fake empty state to pass"). Name the command/skill/gate involved. If the user
     gave a suggestion, keep it in their words.
   - **tags** — the bundle (`sdlc`), the command or skill name, and the gate if one is involved
     (e.g. `g5`).

2. If anything essential is missing — which command, what it did wrong — ask **once**, briefly.
   Do not interrogate; a vague entry a maintainer can follow up on beats no entry.

3. Push it, trying in order:
   - the `knowledge_push` MCP tool (kind `feedback`, project from `RECALL_PROJECT` if set), or
   - `recall push --kind feedback --title '…' --body '…' --tag sdlc [--tag <skill>]`.

   If neither is available (no Recall configured), append it to `<root>/feedback.md` with a date
   and tell the user it is parked there until Recall is wired up — do not silently drop it.

4. Confirm in one line what was recorded and where. Done. No follow-up questions, no summary.

## Refuse

- To record product bugs or project decisions here — those belong to `/sdlc-debug`, the decision
  ledger, or the tracker. This channel is for the bundle's own ergonomics.
- To editorialise. The entry records what the user said happened, not whether the gate was right.
