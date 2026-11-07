---
description: Print every open DEC-NNN, record the human's answers, and stale the gates that depended on them.
disable-model-invocation: true
argument-hint: <slug>
---

Put every open decision for `$1` in front of a human, once.

This command is the whole mechanism behind "less human effort". Not fewer interruptions by guessing
more — an agent that guesses what a business will pay for produces confident, well-formatted
nonsense — but **stops that are worth making**, batched. One conversation of five questions beats
five interruptions across a week, and it beats five invented answers by considerably more.

## Run

1. `node <root>/scripts/build-state.mjs --quiet`, then read `<root>/state.json`.
2. Read `<root>/decisions/$1.md`. If it does not exist or has no `open` or `assumed` rows, say so in one
   line and stop. Nothing needs asking.
3. Put every **`open`** decision to the human **as a choice, not a prompt**, ordered by what they
   block — gates first, then tasks, then nothing. Open with one line saying how many there are and
   what they block, so the human knows the size of the conversation before it starts.

   **When the host has an interactive question tool** (Claude Code's `AskUserQuestion`), use it.
   Ask at most four decisions per call, in the order above, and keep calling until the batch is
   done:

   | Field | From the row |
   |---|---|
   | `header` | the id: `DEC-003` |
   | `question` | the Question, ending in `?` |
   | first option | the Recommended default, its label ending in `(Recommended)` |
   | other options | the remaining Options, 2–4 in total, each with a `description` that says what picking it changes. Take that from "Why it is needed", not from the label reworded |

   Never add a "something else" option. The tool always offers a free-text answer, and that is
   where an answer outside the list goes. Say once, before the first call, that every question
   takes the human's own words as well as a pick.

   **Without one**, print the same thing as text, numbered so the human can answer `1`, `2` or in
   their own words:

```
DEC-003  blocks G2, TASK-004
  Question   Maximum CSV size we support on import?
  Why        Decides streaming vs in-memory, and the 413 threshold
  1. 50MB, streamed (Recommended)   — streaming parser, 413 above 50MB
  2. 5MB                            — in-memory is fine, simplest import path
  3. Unbounded, async processing    — adds a job queue and a status screen
  Or answer in your own words.
```

   A row whose Options column has fewer than two real choices, or whose recommended default is not
   one of them, is a malformed row (§15.2). Fix the row first, from what is already written in it,
   and tell the human you did. Do not put a question to them that has no answer to pick.

4. Then list the **`assumed`** decisions separately, under a line that says what they are:
   decisions a **named human** told a stage to proceed on. No agent may set that status (§15.2), so
   every row here has a `who:` — if one does not, say so plainly, because an `assumed` row with no
   name is an agent's own answer wearing a human's status. They are not urgent, and they are not
   free: an `assumed` decision that reaches G9 unanswered is a `MAJOR` finding there.

## Recording an answer

When the human answers, update the row in `<root>/decisions/$1.md`: `status: answered`, the answer in
the `Answer` column, and who answered it.

Then **rebuild the state and say what went stale**. Answering a decision is an input change, so every
gate whose log listed it goes `STALE` and will be re-reviewed (§4.4). That is correct and it is the
point: a gate that was decided against a placeholder has not been decided.

Report it plainly — "G2 is now stale; the design was written assuming 50MB" — and offer the two
routes: `/sdlc-gate $1 G2 --reaffirm` if the real answer matches what was assumed, or re-running the
stage if it does not. Do not soften a cascade into "you may want to review this"; a stale gate is a
fact, and the board will show it whether or not you mention it.

## Answering many at once

Take them in the order printed and confirm each one back before writing. A free-text answer is
recorded in the human's words, not mapped onto the nearest option. If it fits none of the options,
that is the finding, not an error. A misrecorded decision is
worse than an open one — an open decision is visibly unanswered, while a wrong recorded answer is
indistinguishable from a right one and will be built on.

## Asking well

Keep each question to what a human can actually decide. If you find yourself explaining the
architecture to make the question answerable, the question is aimed wrong — split it, or answer the
technical half yourself and ask only the part that is genuinely a business call.

A good `DEC-NNN` has a recommended default. An agent that asks "what should the limit be?" with no
recommendation has transferred work rather than removed it.

That holds for questions about quantities too, which are the ones most often asked bare: "how many
users?", "how many hours a release?". Offer ranges the design would actually treat differently,
plus "not measured yet", e.g. `under 20 · 20–200 · over 200 · not measured yet`. "Not measured yet"
is a real answer: it turns the question into a dated plan to measure, which a reviewer can accept,
where an invented number is something a reviewer must reject.

## Refuse

- **To answer a decision yourself, on any reasoning.** That is the one thing this ledger exists to
  prevent, and it is the one thing an agent cannot do honestly (§15.2). Recommending a default is
  your job; choosing it is not.
- To mark something `answered` on the strength of an inference from an earlier conversation. A
  decision is answered by a human saying so, here.
- To withdraw a decision because it has become inconvenient. `withdrawn` means the question stopped
  being relevant — record why.
