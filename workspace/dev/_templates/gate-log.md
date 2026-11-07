---
template_for: gate-log
gate: G<N>
authored_by: <the stage's review skill — never the authoring skill>
reviewed_by: n/a
---

<!--
The gate log is the audit trail of this pipeline. It is written ONLY by a stage's review skill,
copied from this template, and saved to <root>/reviews/<slug>/G<N>-<stage>-<run-id>.md.

Four things make a log trustworthy, and all four are checked by dev:lint:

  - every checklist row carries EVIDENCE — a quote, a file:line, or command output. An empty
    evidence cell is a FAIL, because a check nobody can retrace is not a check.
  - `outputs` lists EVERY artifact this gate produced, each with its own hash. A stage that writes
    three files and hashes one of them is blind to edits in the other two.
  - `inputs` lists the upstream artifacts this decision rests on, also hashed. When an input
    changes, the decision was made against different facts and the gate goes STALE — which is what
    makes the dependency graph deterministic rather than hopeful.
  - a second round writes a NEW log and resolves each prior finding by id. Logs are never edited
    after the fact; the history of what was wrong is as valuable as the final PASS.

Hashes cover the artifact BODY only — everything after the front matter's closing ---, CRLF
normalised to LF, trailing whitespace stripped. Front matter is excluded because `updated:` changes
on every touch and `status:` is written by this review itself; hashing them would make every gate
stale the moment it passed.
-->

---
slug: <slug>
gate: G<N>
stage: <intake|requirements|design|data|api|ui|plan|implementation|verification|release|deployment|monitoring>
run_id: <YYYYMMDD-HHMMSS-xxxx>
attempt: <1|2>
verdict: <PASS | CHANGES_REQUESTED | BLOCKED | SKIPPED>
reviewer: <review skill name>
inputs:
  - path: <upstream artifact this decision depends on>
    sha256: <hex>
outputs:
  - path: <every artifact this gate produced>
    sha256: <hex>
findings: { blocker: 0, major: 0, minor: 0, info: 0 }
unlocks: <G<N+1> | none>
skip_reason: <null | { type: NOT_APPLICABLE|DEFERRED|HUMAN_OVERRIDE, explanation: "…", who: "…", ticket: "…", until: "YYYY-MM-DD" }>
override: <null | "<name> — <reason>">
revalidated_from: <null | prior log path, when this is a --reaffirm>
round_decision: <null | DEC-NNN — the human's answer, on a third or later full review of this gate since its last PASS (§4.3)>
---

## Scope

<What was reviewed, at which revision, and what was explicitly out of scope for this gate. For a --reaffirm, state the input diff that was judged and nothing else.>

## Checklist

<One row per check in the review skill's published checklist — same order, same wording. N/A applies to a ROW ("no migration here, so the round-trip row is N/A"); SKIPPED applies to the whole gate.>

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | <check> | <PASS/FAIL/N/A> | <quote · file:line · command output> |

## Findings

<One row per problem. Location and evidence are what let the author fix it without guessing what you meant. BLOCKER and MAJOR block a PASS. Class (§5.3): defect = it would build or decide the wrong thing; drift = two documents disagree and nothing built changes; bookkeeping = front matter, counts, ids, a citation that moved. Drift and bookkeeping are MINOR or INFO, spend no attempt, and the author fixes them under the self-edit bound. follow-up = on attempt 2, a finding outside the attempt-1 findings and the diff: severity kept, owner and target gate named, carried — it does not hold the round unless it is a BLOCKER on security or data loss (then it is a defect). A file:line that moved is not a finding; prose cites path + symbol. A new finding takes its id from `run-id.mjs --next-cr <slug>`; a row restating an earlier one keeps its id and its Problem opens with `Carried`, `Narrowed` or `Reopened` (E090). Empty table = "None.">

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
| CR-001 | <BLOCKER/MAJOR/MINOR/INFO> | <defect/drift/bookkeeping/follow-up> | <path §section, or path + symbol> | <what is wrong> | <what shows it> | <what must change> | <stage / skill> |

## Finding resolution

<Attempt 2: one row per finding from the previous round, verified individually — a blanket "all addressed" is how an unfixed BLOCKER slips through. Any attempt: a MINOR or INFO carried from an earlier gate may get a DEFERRED row naming `owner:` and `target:` (a gate or a TASK) in the Evidence cell. Never defer a BLOCKER or MAJOR. Attempt 1 with nothing to resolve: "N/A — first review.">

| Id | Author's action | Reviewer verdict | Evidence |
|---|---|---|---|
| CR-001 | <the author's map entry, verbatim: fixed — what changed / accepted / disputed — evidence / decision — DEC-NNN> | <RESOLVED/ACCEPTED/REOPENED> | <file:line of the fix> |
| CR-002 | <not fixed — why not now> | DEFERRED | owner: <who> · target: <G<N> or TASK-NNN> |

## Carried forward

<Open MINOR and INFO findings from earlier gates on this slug, so nothing quietly disappears between stages. A MINOR carried by three gates and never deferred raises W004.>

## Verdict

<One paragraph: what was judged, against what standard, and why this verdict follows. If BLOCKED, name who must act and what unblocks it. If SKIPPED, quote the applicability rule and say why this change does not meet it.>

<!--
G4 only (DEV-CONTRACTS §13.12). The Checklist table has six columns: | # | Area | M | Check | Result | Evidence |.
Result is PASS, FAIL, NOT_RUN, UNKNOWN or "N/A — <reason>". Below the paragraph above, paste the
scorecard that `api-score.mjs <slug> --log <this log> --in <checker.json>…` prints:

| Area | Weight | Rows (PASS / judged) | Score |
|---|---|---|---|
| 1 Requirement and contract | 8 | … | … |
| 2 REST and naming | 6 | … | … |
| 3 Schema | 10 | … | … |
| 4 Errors | 8 | … | … |
| 5 Security | 14 | … | … |
| 6 Versioning | 10 | … | … |
| 7 Pagination, filter, sort | 7 | … | … |
| 8 Performance | 10 | … | … |
| 9 Idempotency and concurrency | 7 | … | … |
| 10 Observability | 5 | … | … |
| 11 Docs and standards | 6 | … | … |
| 12 Testability | 5 | … | … |
| 13 Gate | 4 | … | … |
| **Total** | 100 | | … |

Mandatory rows failing: … · unknown or on an open DEC: …
Score status PASS | REVIEW | BLOCKED | NEEDS_CLARIFICATION → verdict PASS | CHANGES_REQUESTED | CHANGES_REQUESTED | BLOCKED
-->

<G5, G7 and G8 with screens only, otherwise delete this subsection: the UI score (§13.13). `node <root>/scripts/ui-score.mjs <slug> --gate G<N> …` prints the machine rows; the reviewer decides the UNKNOWN ones and recomputes the line below. Status is PASS, FAIL, NOT_RUN, UNKNOWN or N/A — <reason>. A PASS verdict needs a PASS result (E145).>

### UI score

| Section | Criterion | Status | Weight | Evidence |
|---|---|---|---|---|
| <section> | <U01 criterion> | <PASS/FAIL/NOT_RUN/UNKNOWN/N/A — reason> | <weight> | <checker output · file · reviewer reading> |

**UI score:** <score> · <PASS/REVIEW/BLOCKED/NEEDS_CLARIFICATION>
