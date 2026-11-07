---
template_for: decisions
gate: any
authored_by: any stage that meets an unknown
reviewed_by: n/a — a human answers; no skill approves this file
---

<!--
The decision ledger exists because some answers are not in the repository and never will be: what
customers will pay for, what risk is acceptable, how large an import we support, when this must
ship. A stage that guesses at one of those produces work that is confident, well-formatted and
wrong — and the wrongness surfaces three gates later, when it is expensive.

So a stage that meets one writes a row here and carries on with everything that does not depend on
it. `/sdlc-ask <slug>` prints the open rows together, because one conversation of five questions is
worth more than five interruptions.

The column that decides whether this file is useful is "Blocks". A decision that blocks a gate stops
the ladder; one that blocks a single task does not. Getting that distinction right is what keeps the
ledger from becoming a reason nothing ever moves.
-->

---
slug: <slug>
stage: <the stage that raised the first decision>
artifact: decisions
status: draft
authored_by: <the skill that raised it>
reviewed_by: n/a
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
---

## Decisions

<One row per question only a human can answer. "Options" is 2–4 mutually exclusive choices separated by ` · `; for a quantity, ranges plus `not measured yet`. "Recommended default" is not optional and must be one of the options: a question with no proposed answer makes the reader do the work you were supposed to do. "Blocks" names gates (`G3`) or tasks (`TASK-004`) — a gate there stops the ladder, a task does not.>

| Id | Question | Why it is needed | Options | Recommended default | Blocks | Status | Answer |
|---|---|---|---|---|---|---|---|
| DEC-001 | <the question, answerable in a sentence> | <what changes depending on the answer> | <option · option · option> | <the one you would pick, and it must be safe if wrong> | <G3 · TASK-004 · none> | <open/answered/assumed/withdrawn> | <the answer, once given> |

## Assumptions in force

<Decisions a NAMED HUMAN told a stage to proceed on — no agent may set `assumed` (DEV-CONTRACTS §15.2), so every row names who. What was assumed, why it was safe to proceed, and what it would cost to be wrong. An assumption still open at G9 is a MAJOR finding, because an assumption that ships is a decision nobody made.>

## Withdrawn

<Questions that stopped mattering, and why. Deleting them loses the record that they were once considered — which is exactly what someone will ask about later.>
