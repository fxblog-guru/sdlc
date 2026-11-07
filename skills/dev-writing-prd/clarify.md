# Clarify — the ambiguity scan before G1 review

Read by `dev-requirements-analyst` when `/sdlc-requirements <slug> --clarify` spawns it with this
path.

You do two jobs, in two separate spawns. You never put a question to the human: the command does
that. You never answer a question: only the human does (§15.2).

## Spawn 1 — scan and queue

Inputs: `prd.md`, `requirements.md`, `acceptance-criteria.md`, `glossary.md`, `problem.md`, the
ledger `<root>/decisions/<slug>.md`.

1. Mark each category **Clear**, **Partial** or **Missing** against the artifacts as written:

   | Category | Look at | Partial or Missing when |
   |---|---|---|
   | Functional scope | PRD Goals, Non-goals, Users and personas, Functional scope | a goal has no measurable outcome; no explicit out-of-scope; roles not told apart |
   | Data model | PRD Data and privacy; requirements Data requirements | an entity without identity or uniqueness; a lifecycle with no states; no volume |
   | Non-functional | PRD Non-functional expectations; requirements NFR rows | a quality attribute with no number, unit or measuring point |
   | Edge cases | acceptance-criteria Negative and edge cases | no empty, error, permission, concurrency or limit case for a REQ that needs one |
   | Integration | PRD Dependencies; requirements Interface requirements | an external system with no failure behaviour, format or version |
   | Terminology | `glossary.md` and every artifact | one thing under two names; a term used but not defined |
   | Completion signals | acceptance-criteria Criteria; PRD Success metrics | a criterion an outsider cannot run; a metric with no baseline or target |

   Also hunt the PRD's vague words (`SKILL.md` § Vague words) and any `TODO` or placeholder.
2. Drop a gap when:
   - an existing `DEC-NNN` row already asks it — it goes through `/sdlc-ask`, not here;
   - `DEV-PROFILE §Defaults` already fixes it — apply the default with its citation (§3.2);
   - it is a *how*: a technology, a schema, a task split. That is G2 or later;
   - no answer would change a requirement, a criterion or a test.
3. Score each remaining gap **impact** (1–3: how much G2–G8 rework a wrong guess costs) times
   **uncertainty** (1–3: how far apart the plausible answers are). Order by score; on a tie, the
   category with nothing Clear yet goes first.
4. Write the top **5** as `open` `DEC-NNN` rows (next free ids, §1) in the ledger, from its
   template. Each row: a question a non-expert can answer from the Question cell alone, ending in
   `?`; 2–4 mutually exclusive Options with the Recommended default among them (§15.2); Blocks
   names the earliest gate whose work the answer changes — `G1` only when a REQ cannot be written
   without it (mark that REQ `N/A — blocked by DEC-NNN`). A question with no discrete choices still gets
   Options: the suggestion plus the alternatives the design would treat differently, or ranges plus
   `not measured yet`. The human may answer in five words or fewer instead.
5. List every gap you did not queue in PRD `## Open questions`, one line each with its category.
   Never resolve one in the artifact by assumption.
6. Hand back: the ledger path, the queued ids in asking order, and the coverage table (category,
   status, score). The table is for the command only; it is not written to any artifact.

If every category is Clear, write nothing and hand back `no gaps worth a question`.

## Spawn 2 — fold the answers in

Inputs: the same paths, plus the ids the human answered.

1. For each `answered` row, write the answer into its **owning section** (table above) as a
   testable statement: a number with its unit, a named state, a new negative case with its REQ.
   Cite the `DEC-NNN` beside it. A terminology answer is applied in `glossary.md` and every artifact
   that used the other name.
2. Replace the statement the answer makes obsolete. Leave no text that contradicts it, and do not
   restate the value in a second artifact (§3.2).
3. A changed or new REQ keeps the mapping in both directions: a new `REQ-NNN` gets its criterion,
   and no id is renumbered (§1).
4. Remove the folded ids from PRD `## Open questions`; leave every unanswered one there.
5. Run `node <root>/scripts/propagate-dec.mjs <slug> --check` and fix each `missing` line.
6. Hand back the paths you changed.

## Never

- Answer, or pick the default for, a question the human skipped. A skipped row stays `open`.
- Queue more than 5, or reopen a gap the human already answered.
- Add a `##` heading to any artifact (§3). The answers go inside the existing sections.
