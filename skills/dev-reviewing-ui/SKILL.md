---
name: dev-reviewing-ui
description: G5 gate review. Use when a G5 verdict or a NOT_APPLICABLE determination is needed: judges ui-spec.md against the checklist and writes the gate log.
---

# Reviewing G5 — ui

You are judging whether this screen has been designed, or whether only its happy path has.

Most UI defects are not visual. They are a state nobody wrote down: the list that spins forever
because the error case was never drawn, the button that is hidden from a role whose endpoint is
still called, the table that silently drops rows because its sort has no tiebreaker. Each of those
ships through a review that asked "does this look right?" — because in the mockup, it does.

> `DEV-CONTRACTS.md` §5 (log format), §13.3 (the UI standards a spec may not contradict), §13.1
> (the pagination rules the lists must honour), §9 (why the test hooks are a handoff). You write
> `<root>/reviews/<slug>/G5-ui-<run-id>.md` and nothing else.

## What you receive

Paths: `ui/<slug>/ui-spec.md`, the upstream `requirements/<slug>/requirements.md` and
`acceptance-criteria.md`, `design/<slug>/architecture.md`, `api/<slug>/openapi.yaml` where G4 ran,
`docs/design-tokens.md`, `docs/ui-patterns.md`, `<root>/knowledge/conventions.md` in a brownfield repo,
`<root>/decisions/<slug>.md`, `DEV-PROFILE.md`, the gate-log template, the source root, and the prior
log on attempt 2.

Read the requirements and the API contract **before** the spec. Half the checks below are a
comparison between two documents, and you cannot make a comparison from one of them.

## Applicability

> G5 applies to any change that alters what a user sees or does: a new screen, a new element on an
> existing screen, a changed field, a changed error message, a changed permission that a screen
> reflects, or a changed list that a screen renders. A change with no user-facing surface — an
> internal job, a library, a service-to-service endpoint with no client screen — does not require
> G5.

For class `initiative`, G5 runs whenever the product has a UI at all. For class `change`, it runs
when the change reaches a screen, and that judgement is yours. For class `fix`, G5 is `SKIPPED` by
class at intake (§15.1).

**`NOT_APPLICABLE` is a real verdict here, and it is not a shrug.** More changes genuinely have no
UI than at any other gate, and forcing an empty spec through the ladder produces a document of
`N/A` rows that the linter accepts and nobody reads — which teaches everyone that ui-spec files are
noise. So: where the rule above is not met, write the verdict `SKIPPED` with
`skip_reason.type: NOT_APPLICABLE`, **quote the rule verbatim**, and say which part of it this
change fails to meet, citing the requirement or the design section that shows there is no surface
(§5.4).

The trap runs the other way too. A backend change that adds a field to a response, changes a status
code a screen renders, or narrows who may call an endpoint **has** changed what a user sees, even
when the diff contains no frontend file. Skipping G5 because the diff looks backend is how a screen
acquires a state nobody designed. And if you are reaching for `NOT_APPLICABLE` because the spec you
were given is thin, that is `CHANGES_REQUESTED`.

## The published checklist

One row per line, same order, same wording, each with `PASS` / `FAIL` / `N/A` and evidence.

| # | Check |
|---|---|
| 1 | Every screen traces to at least one `REQ-NNN`, and every `REQ-NNN` with a user-visible outcome appears on at least one screen — counted mechanically in both directions |
| 2 | Every screen specifies all seven states — loading, empty, error, partial/stale, permission-denied, offline, populated — with no blank cell and no cell that only restates the state's name (§13.3) |
| 3 | Each state says what triggers it, what the user sees, what actions remain, and how the user leaves it |
| 4 | Loading is a skeleton or an in-place indicator rather than a full-page spinner, and a screen with several data sources says what loads independently (§13.3) |
| 5 | Empty distinguishes "nothing exists yet" from "your filter matched nothing", and each offers the action that resolves it |
| 6 | Error states separate retryable from terminal, and error copy says what happened and what to do next — no raw server message, no bare trace id as the explanation |
| 7 | Permission-denied is designed per role named in the requirements: what is hidden, what is visible but disabled, and what is never fetched |
| 8 | Every list names its endpoint, matches the pagination style in the G4 contract, and states its page size, ordering, tiebreaker and load-more or pager pattern (§13.1) |
| 9 | No screen fetches "all" of a paginated resource, and no client-side sort or filter is applied to a partial page as though it were the whole set |
| 10 | Every sortable column and every filter maps to a value the contract whitelists (§13.1) |
| 11 | Every form states its validation rules and when they fire, its inline error placement, its submit/disabled/pending states, and what happens to the user's input on a server-side rejection |
| 12 | Every mutation is declared optimistic or pessimistic, and every optimistic one specifies what the user sees when it fails |
| 13 | Accessibility is stated per component and is testable: semantic element or role, accessible name and its source, focus order and focus movement, the complete keyboard path, live regions for async results (§13.3) |
| 14 | Contrast is stated against named tokens and target sizes are given — "WCAG 2.2 AA" asserted without per-component behaviour is not a specification |
| 15 | Responsive behaviour is given per named breakpoint from 360px up, and nothing hidden at the smallest one is the only route to an action |
| 16 | Components come from the UI kit; every bespoke component carries a justification and an owner |
| 17 | Every colour, spacing, radius, type size and motion value cites a token from `docs/design-tokens.md` — no hard-coded hex, no raw px (§13.3) |
| 18 | `data-testid` values are declared per the convention for every element an acceptance criterion must reach (§9) |
| 19 | Unknowns are recorded as `DEC-NNN` and **left unresolved**: no screen is designed to one reading of an open decision, and no `assumed` row carries a name that is not a human's (§15.2) |
| 20 | Front matter complete per §3.1, no `<placeholder>` remains, no section empty, headings byte-exact |
| 21 | The design system exists and passes `design-system.mjs check`; every screen names a shell and a pattern from `docs/ui-patterns.md`; every departure from that pattern's anatomy is written as a deviation with a reason (§13.3) |
| 22 | The visual-design step ran: `visual-design.md` covers every archetype the spec uses (shell, list/table, detail/dashboard, form/dialog, empty state, sign-in) at 1440, 1024 and 360, on the kit `design-tokens.md` names, and the ui-spec records `visual/index.html` as `visual_reference` with `kind: visual` (§13.3) |
| 23 | The visual design passes the design checklist (`design-checklist.md` D1–D9): `ui-rubric.mjs` over `visual/index.html` at 1024 and 360 has no hard fail, and every advisory is fixed or answered in `## Rubric` |
| 24 | `## States` carries the Error-UX matrix: a row per `ProblemType` in the contract and per 401, 403, 404, 409, 412, 422, 429, 5xx, offline, unknown, each with surface, kit component, copy key and retry; no permission, not found and not a member look different (`lint-dev.mjs` E080/E081 clean; `dev-specifying-ui/error-ux-matrix.md`) (§13.3) |
| 25 | `## Components` names only components the kit (`dev-defining-design-system/kit/`) has or a bespoke one with an owner; `## Forms` and `## Interaction and feedback` say every input dialog has the discard guard, every form is `noValidate` with blur validation and an error summary, every mutating action uses the kit's mutating button, every menu is the Radix `DropdownMenu`, and `role="alert"` is used only after a user action; `## Copy` follows `copy-style.md` (§13.3) |
| 26 | The roles matrix has a row per screen and action, a cell per role from the requirements, and every `Operation` agrees with that operation's authorisation in the contract; nothing hidden is still fetched (`lint-dev` E142/E143 clean) (§13.13) |
| 27 | The traceability table maps every screen to its components, the `operationId`s it reads or calls and the AC / UB ids it satisfies; `## Responsive behaviour` has a row per token breakpoint; `## Accessibility` covers the WCAG 2.2 additions; open questions are `DEC-NNN` (`lint-dev` E144, W141) (§13.13) |
| 28 | The UI score is computed and its result allows this verdict: `ui-score.mjs <slug> --gate G5` rows under `### UI score`, every reviewer row decided, and before G6 the Design, Engineering and Accessibility approvals named by humans (`lint-dev` E145, E146) (§13.13) |
| 29 | Consistency holds across screens (`design-checklist.md` D14): title rows, button roles and labels, tables and pagers, badges, empty / error / denied states, date and number formats, and the glossary's words; each notice is shown in one place only |
| 30 | Mocks are scoped per project and screenshots are taken in the approved skin, with the skin passed explicitly (headless Edge defaults to dark) and the prototype banner hidden (`design-checklist.md` D15) |
| 31 | `## Approval` records a usability pass: one task, walked by a named person on the preview, with the time and where they hesitated (§23) |
| 32 | With more than one locale in the profile, no user-visible string is a literal and plurals use plural rules; a public page has a title, description, canonical URL and server-rendered content (`i18n.md`, `seo.md`) |
| 33 | The navigation and labels come from the glossary and users' words, every task named in the PRD has a stated shortest path, and nothing a user needs is reachable only by hover (`ux-principles.md`) |
| 34 | Keyboard and screen reader flows are specified: tab order, a dialog takes and returns focus, errors move focus, status changes are announced in a live region, icon buttons have names (`ux-principles.md`) |
| 35 | The brand question has a recorded answer: `visual-design.md` `## Basis` carries `Brand: (a)`, `(b)` or `(c)` with the kit path, or a `DEC-NNN` listing every screen and slot file a later brand changes; and every brand use (mark, wordmark, favicon, share image, 404 and empty-state art, email logo, brand colour) is a slot under `brand/` or a `--brand-*` token, never drawn inline (`design-checklist.md` D16) (§13.3) |
| 36 | The secondary-area question has an answer: `## Basis` has an `Areas:` line saying, per admin or back-office area, `themed` or `plain`, or `Areas: none`; an unanswered one is a `DEC-NNN` (§13.3) |

## Check 2 is the gate. Run it, do not read it.

Reading a states table and asking "does this look complete?" will pass it. The table is wide, the
cells are short, and a row with two thin cells and five good ones reads as a full row.

Count instead. The states table is `screens × 9`, and the linter counts it, with the roles and
traceability tables of checks 26 and 27:

```bash
node <root>/scripts/lint-dev.mjs --file <root>/ui/<slug>/ui-spec.md --json | grep -cE '"(E14[0-4]|W14[01])"'
```

Put the count and the number of screens in the evidence cell. `0` is the only passing result, and
it is retraceable by anyone who doubts your verdict — which a sentence saying "all states are
covered" is not.

Then read the non-blank cells for the second failure mode, which the count cannot see: a cell that
restates its column. "Error: show an error." "Offline: offline state." Those are blank cells with
words in them, and check 3 is what fails them. Quote one verbatim in your evidence; the author sees
the gap immediately, which no paraphrase of yours would achieve.

## Check 21: the look was decided once, and this spec follows it

Run it, do not read it:

```bash
node <root>/scripts/design-system.mjs check            # tokens exist, contrast passes, md = json, patterns present
awk '/^## Screens/,/^## User flows/' <root>/ui/<slug>/ui-spec.md | grep -E '^\|' | tail -n +3 \
  | awk -F'|' '{ gsub(/^[ \t]+|[ \t]+$/,"",$7); if ($7=="") miss++; n++ } END { print "screens:", n, "no pattern:", miss+0 }'
grep -oE '\b(list|detail|form|wizard|dashboard|settings|master-detail|board|auth|first-run)\b' \
  <root>/ui/<slug>/ui-spec.md | sort | uniq -c
```

`check` failing is `BLOCKED`, not `CHANGES_REQUESTED`. The spec cannot be judged against a design
system that does not exist, and the fix is `/sdlc-design-system`, not an edit to the spec.

A screen with no pattern is `MAJOR`. Then compare each screen against the anatomy of the pattern it
names: primary action position, filter placement, pager, where the side panel goes, how it collapses
below `bp.md`. A difference that is not written as `Deviation from <pattern>: … — <why>` is `MAJOR`
too. It is not wrong because it is different. It is wrong because nobody decided it, and the next
screen will differ in some other way. A deviation that *is* written, with a reason tied to a REQ or
to the users, passes, even if you would have done it differently (see "Findings that are usually
wrong", 1).

A layout the spec invented because no pattern fitted, without a `DEC-NNN` proposing a new pattern,
is `MAJOR` under the same logic as check 19: the decision was made where nobody could see it.

**Approved pictures bind by kind (§13.3).** The spec records each as `visual_reference` with a
`kind` (lint E028 checks the hash, W033 a missing kind). A `wireframe` binds content and layout:
which regions, fields, columns and actions, in which order. Its greys, sizes and radii are
placeholders and bind nothing; a token or spec line that copies them as the look is `MAJOR`, owner
`/sdlc-design-system`. A `visual` (the approved `visual-design.md` shots) binds look and outranks
`design-tokens.md` and the patterns on it. An approved wireframe in the inputs or the ledger that
the spec does not record is `MAJOR`. Precedence: a recorded deviation, then the wireframe on
content, then the visual on look, then the tokens, then the patterns.

**The visual-design step.** Before G6 can start, `visual-design.md` exists, its shots
cover every archetype the spec uses at 1440, 1024 and 360, `ui-rubric.mjs` reports no hard fail on
`visual/index.html`, and the ui-spec records it as `kind: visual`. Approval by the requester is
recorded later in `approved_by` / `approved_on`; you check that the step was done, not that it
was liked.

## Checks 8, 9 and 10: open the contract

This is a two-document check and it is the one most often done by assumption. Open
`api/<slug>/openapi.yaml`, find each endpoint the spec names, and compare — style, parameter names,
default and maximum page size, the `sort` whitelist, the filter parameters.

Then search the spec for the language of unbounded fetching:

```bash
grep -niE 'all (items|rows|records|results)|full list|fetch(es|ing)? everything|no pagination|load all' \
  <root>/ui/<slug>/ui-spec.md
```

A hit is not automatically a finding — "all filters clear at once" is fine — but every hit is read
before you pass the row. A screen that renders the whole of a paginated collection is a `BLOCKER`:
what gets built is a loop over every page on mount, it survives every review because it is correct
at seed-data size, and it is found by the customer with the largest table.

A sortable column mapping to nothing in the whitelist is a `MAJOR`. It means one of two documents is
wrong, and the implementer will discover which at G7, by which time both have been approved.

## Check 1: count it in both directions

Grep the requirements table for every `REQ-NNN`, grep the spec for every `REQ-NNN`, and compare the
sets. Put both counts in the evidence cell — "requirements 14, referenced in ui-spec 11, missing
REQ-004, REQ-009, REQ-012".

Both directions matter and they fail differently. A REQ with no screen is a requirement that will
not reach a user. A screen with no REQ is scope that arrived without a decision, and it will be
built, tested and maintained anyway.

Not every REQ owns a screen — an NFR about log retention does not. That is what makes this row a
judgement after the count rather than the count itself: list the REQs with no screen, then say for
each whether it has a user-visible outcome. The count is evidence; the reading is the review.

## Check 13: make one component prove it

You cannot write a test from a promise. Take the most complex interactive component in the spec —
the modal, the combobox, the data table — and try to write three accessibility tests from what is
written. If you cannot, the row is `FAIL` and your evidence is the sentence you tried to use.

Where the source root is available and the component already exists, grep for it and check whether
the spec is describing what is there or something else. A spec that contradicts a live component
without saying it is changing it is a `MAJOR`: two designs, one component, and the implementer picks.

## Severity for this gate

- `BLOCKER` — no design system: `design-system.mjs check` fails (check 21, verdict `BLOCKED`); a roles-matrix row that hides an action whose data is still fetched (check 26); a screen that renders an entire paginated collection (check 9); a spec that
  contradicts the API contract in a way that cannot be built as written (check 8); an interactive
  element with no keyboard path at all (check 13); a permission-denied design that hides a control
  while still fetching the data behind it (check 7).
- `MAJOR` — no visual design, a rubric hard fail on it, or only a wireframe as `visual_reference` (checks 22–23); no recorded brand answer, a brand use drawn inline, or no answer on the admin look (checks 35–36); a blank state cell (check 2); a state cell that only restates its name (check 3); a
  sortable column with no whitelist entry (check 10); an optimistic mutation with no rollback
  (check 12); accessibility asserted but not stated per component (checks 13–14); a screen designed
  to one reading of an open `DEC-NNN` (check 19); a `REQ-NNN` with a user-visible outcome and no
  screen (check 1); a screen with no pattern, or an undeclared deviation from its pattern, or an
  invented layout with no `DEC-NNN` (check 21).
- `MINOR` — a hard-coded value where a token exists; a missing `data-testid`; a breakpoint named but
  not described; copy that is accurate but unhelpful.
- `INFO` — a component worth adding to the kit, a flow worth simplifying, an interaction worth
  usability-testing before it ships.

## Check 19: the quiet version of guessing

The version that gets through does not look like invention. The spec records `DEC-001` — "should a
delete confirm, or undo?" — recommends undo, and then **designs the undo**. The ledger row stays
`open`, the board shows an outstanding question, and the screen has already answered it.

The remedy is not "mark it assumed". `assumed` requires a named human (§15.2), and an agent setting
it has answered the question in the format designed to look like it did not. The remedy is
`N/A — blocked by DEC-001` on the dependent screen or state, with everything that does not depend on
the answer specified in full.

Severity is `MAJOR`: the design is not wrong, it is *unauthorised*, and the cost arrives at G9 when
somebody asks who decided.

## Check 28: the UI score sits on the verdict, never instead of it

```bash
node <root>/scripts/ui-score.mjs <slug> --gate G5 --rubric <ui-rubric --out json>
```

Paste its table under `## Verdict` as `### UI score`. It fills the rows a checker decides; decide
each `UNKNOWN` reviewer row as `PASS`, `FAIL`, `NOT_RUN`, `UNKNOWN` (citing the `DEC-NNN` it waits
on) or `N/A — <reason>`, then recompute the result line. `PASS` needs a score of 90 or more and
every mandatory row `PASS`; `REVIEW` and `BLOCKED` are `CHANGES_REQUESTED`; `NEEDS_CLARIFICATION`
keeps the DEC open for `/sdlc-ask` (§13.13). Never pass on the shots alone: they are evidence for
the look rows, and the states, roles and accessibility rows need their own. E145 fails a table
whose result or verdict disagrees with its rows.

## Findings that are usually wrong

1. **"This should look different."** Taste is not a finding. Unless it violates the kit (check 16),
   the tokens (check 17), the pattern the screen declared (check 21), an accessibility rule (checks 13–14), or a requirement, your preference
   about layout, wording or colour is at most `INFO` — and probably not that.
2. **"This screen is missing."** You are reviewing the spec against the requirements, not against
   your own sense of the product. If the gap traces to a `REQ-NNN`, it is a real `MAJOR` and you
   cite the REQ. If it does not, it is `INFO`.
3. **Accepting `N/A` on an empty state because "this list cannot be empty".** It can: a filter, a
   new tenant, a permission boundary, a failed sync. Ask which of those the author has ruled out.
   Nearly every "cannot be empty" is a "has not been empty yet".
4. **Writing the replacement copy or the missing state.** Say what is wrong and what must be true.
   Writing the sentence is authoring, which you may not do (§4.5), and it anchors the author on your
   wording rather than on their intent.
5. **Marking the gate `SKIPPED` because the change is mostly backend.** Applicability is about
   whether a user sees a difference, not about which directory the diff lands in.

`PASS` with zero findings is the correct outcome for a spec whose states table is genuinely full.

## Checks 22 and 23: the look was designed, not inherited from a sketch

Run the rubric, do not eyeball it:

```bash
node <root>/scripts/ui-rubric.mjs --url visual=<root>/ui/<slug>/visual/index.html --widths 1024,360 --tokens <root>/docs
```

Put its summary line in the evidence. A hard fail is `MAJOR` with owner `/sdlc-ui` (the
visual-design step). A missing `visual-design.md`, or a spec whose only `visual_reference` is a
wireframe, is `MAJOR`: G6 would plan against a look nobody designed. Advisories are decided against
the picture, row by row, with `design-checklist.md`.

Why these rows exist: the release-management run, 2026-10-13 analysis of its G8 `ui-snap` shots
(UI causes). A low-fi wireframe became the binding look, and the product shipped grey, flat and
cramped with every gate green.

## Checks 35 and 36: the brand and the admin look were asked, not assumed

Read `## Basis` for the `Brand:` and `Areas:` lines. A missing line is `MAJOR`, owner `/sdlc-ui`;
an answer the requester has not given yet must be a `DEC-NNN`, and for `(c)` that DEC lists every
screen and slot file the later brand changes. Then look for a brand use drawn inline:

```bash
grep -nE '<svg[^>]*(logo|brand)|data-brand[^>]*><svg' <root>/ui/<slug>/visual/index.html
grep -nE 'brand/(logo|icons|social|illustrations|email)/|--brand-' <root>/ui/<slug>/visual/index.html | head
```

A logo, favicon, share image or illustration that is not a file under `brand/`, or a brand colour
that is a hex rather than a token, is `MAJOR`: a later brand would redraw that screen
(`design-checklist.md` D16). Why: on one product the header logo was the theme's glyph, nobody
asked about a brand, and choosing one later redrew six approved screens and the built code.
