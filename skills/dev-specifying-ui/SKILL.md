---
name: dev-specifying-ui
description: Use in /sdlc-ui (G5) to write ui-spec.md: screens from a pattern, roles, nine states, real pagination, traceability, a11y, test hooks.
---

# UI specification — G5

Adapted from `ui-ux-design` in `gitlab.com/agentic-fx/skills` @ `8556e8f`, with the component
decomposition of `react-ui-analyze` and the accessibility and selector contract of
`react-accessibility-testability-reviewer` folded in, and **re-scoped** (`docs/skill-sources.md`).

Upstream this is a visual design phase that ends in mockups and an approval question. Here it ends
in one linted document at one path, judged by a reviewer who never saw your reasoning. Mockups,
where a project makes them, are an input to this spec — not a substitute for it, because a picture
of a screen shows exactly one of its states.

## What you are producing

`<root>/ui/<slug>/ui-spec.md`, copied from `<root>/_templates/ui-spec.md` and filled in. The headings are
a contract (§3): same wording, same order, no new top-level section, and a section that does not
apply reads `N/A — <reason>` rather than sitting empty.

**Do not write component code.** A spec that contains JSX has skipped G6's task planning and G7's
review, and the code in it will be pasted without either.

## Where the boundary sits

> More than one locale in `DEV-PROFILE`, or likely: read `i18n.md`. A page reachable without signing in: read `seo.md`.
> A new screen, navigation entry, form or dialog: read `ux-principles.md` (structure, keyboard and screen reader flows; G5 rows 33–34).


| Belongs here (G5) | Belongs to another gate |
|---|---|
| what the screen shows, in every state | how it is implemented in React — G7 |
| which endpoint a list reads, and how it renders that endpoint's paging | the endpoint's contract — G4 (§13.1) |
| the fields a form has and when it validates them | the entity and its constraints — G3 |
| what a permission-denied screen looks like per role | who holds the permission — G1 |
| the accessible name, role and keyboard path per component | the ARIA attributes in the markup — G7 |
| which tokens a screen uses | what the tokens are — `docs/design-tokens.md`, long-lived |

When your spec needs something the contract does not provide — a field, a filter value, a status
code the error copy depends on — **write the constraint down and hand it back**. It is a finding for
G4, not a change you make, and editing the contract turns that gate `STALE` (§4.4).

## Start from the design system, not from a blank page

Two files decide the look before you write a line: `docs/design-tokens.md` (what things look like)
and `docs/ui-patterns.md` (where things go). A named human chose them with `/sdlc-design-system`.
If they do not exist, `/sdlc-ui` stops before it reaches you. If you were reached anyway, stop and
say so, because a spec written without them invents a design system one screen at a time.

For each screen:

1. **Name the shell and the pattern** in the `Pattern` column of `## Screens`, for example
   `shell.sidebar · list`. One pattern per screen. A screen that needs two is usually two screens.
2. **Inherit, then deviate in writing.** The pattern already fixes the anatomy (where the title,
   the primary action, the filters and the pager go), the responsive collapse, and a default for
   each state. Copy those defaults into the `## States` row as your starting point and
   edit them to this screen's truth. Anything that differs from the pattern's anatomy is written as
   `Deviation from <pattern>: <what> — <why>` in the screen's notes.
3. **No pattern fits?** Record a `DEC-NNN` proposing either a split or a new pattern, with your
   recommended default, and mark the screen `N/A — blocked by DEC-NNN`. A layout invented inline
   is the improvisation the pattern file exists to prevent, and it is the first thing the reviewer
   looks for.

**When the requester approved a visual** (a wireframe or mockup), commit it under
`<root>/ui/<slug>/` and record it in front matter as `visual_reference: { path, sha256 }`, the hash from
`node <root>/scripts/build-state.mjs --hash <path>`, and its `kind`: `wireframe` for a sketch (binds
content and layout only; its greys and sizes are placeholders) or `visual` for the approved
high-fidelity design (binds look). Each outranks `docs/ui-patterns.md` on what it binds (§13.3),
so where the picture and the pattern differ, follow the picture, and where you deliberately
differ from the picture, write `Deviation from visual_reference: <what> — <why>`. If the design
system was rendered without reading it, say so in `## Design tokens` and send it back to
`/sdlc-design-system`, because G7 will otherwise build the tokens and not the picture. Unrecorded,
an approved picture binds nobody, and the app drifts from it with every gate green.

Why this matters more than it seems: the defects people call "ugly UI" are mostly inconsistency,
not colour. The primary button top-right on one page and bottom-left on the next. Filters above one
table and in a drawer on another. Each of those choices was reasonable at the time, and together
they make the product look unfinished. Patterns make those choices once, for everyone.

## The nine states are the product of this gate

§13.13: **loading · empty · no results · error · partial/stale · permission-denied · offline · long
text / missing data · populated**, for every screen. The template's `## States` table has exactly
those columns, and a blank cell is a design gap, not a detail for the implementer to invent; lint
`E140`/`E141` count them. 401 and session expiry are decided once, in the Error-UX matrix; success
after an action is a `UB-NNN` row.

Understand why before you fill it in. The happy path is what everyone pictures when they picture the
screen, so it always gets designed. The others are improvised, under time pressure, by whoever
holds the ticket — differently every time. That is how a product ends up saying "No results found"
on one list, showing an eternal spinner on the next, and rendering a raw stack trace on the third.
Nobody decided any of that. Six blank cells decided it.

Each cell answers four questions, and a cell that answers fewer is a blank cell with words in it:

| Question | Not this | This |
|---|---|---|
| what triggers this state? | "on error" | "the list request returns 5xx, or times out at 10s" |
| what does the user see? | "an error" | "inline banner above the table; the last page stays, greyed" |
| what can they still do? | — | "retry, change filters, navigate away; export is disabled" |
| how do they leave it? | — | "retry succeeds → populated; after three failures suggest reload, keep the banner" |

Five of them have a habitual failure mode worth naming:

- **Loading** is a skeleton or an in-place indicator, never a full-page spinner that replaces
  content the user was already reading (§13.3). Where a screen has several independent data sources,
  say what loads independently — otherwise the slowest one sets the perceived speed of all of them.
- **Empty and No results** are two columns because they are two states: *nothing exists yet*
  (offer the action that creates the first one) and *your filters matched nothing* (offer a way to
  clear them). One design for both is how a new user is told "No results match your search" on
  their first visit.
- **Long text / missing data** says what truncates (with the full value recoverable), what wraps,
  and what a null field shows. The pseudo-locale run (`ui-rubric --pseudo`, +40%) tests it at G7.
- **Partial / stale** is the state people skip because they have to be told it exists. Some data
  arrived and some did not, or what is shown was fetched four minutes ago. Say which, say how the
  user can tell, and say whether the actions offered on stale data are still safe to take.
- **Permission-denied** is designed per role named in the requirements: what is hidden entirely,
  what is visible but disabled with an explanation, and what is never fetched at all. Those are
  three different decisions, and hiding a button while still calling the endpoint is a security
  finding rather than a UI one.

## The roles matrix: one row per screen and action

Under `## Screens`, `### Roles matrix` (§13.13) has a row per screen and per action on it, the
`operationId` the action calls, and one column per role from the requirements: `enabled`,
`disabled`, `hidden`, `read-only` or `—`. Read each operation's authorisation in the contract
(`x-authz` or `security`) and make the row agree with it; where they cannot agree, it is a finding
for G4, not a cell you bend. The matrix reflects the server's decision and never replaces it: the
UI hides what the server would refuse anyway. A role cell that hides an action whose data is still
fetched is a `BLOCKER`. Lint `E142`/`E143` check coverage and that every operation exists.

`N/A` in a cell needs a reason that survives scrutiny. "This list cannot be empty" is almost never
true — a filter, a new tenant, or a permission boundary empties it.

**The Error-UX matrix** under `## States` decides every error once: one row per `ProblemType` in
the contract and per status 401, 403, 404, 409, 412, 422, 429, 5xx, offline, unknown, saying where
it shows, in which kit component, with which copy key, and whether the user can retry. The rules,
the three looks that must differ (no permission, not found, not a member) and the standard
sentences are in [error-ux-matrix.md](error-ux-matrix.md). The linter fails a missing row (E080).

## Lists: render the pagination that exists, not the one you wish for

§13.1 fixed this at G1 and G4. Per list: the endpoint, the pagination style, the page size, the
ordering **and its tiebreaker**, the load-more or pager pattern, and the table's behaviour per
breakpoint.

Two failures are worth designing out explicitly:

1. **"Show all items"** against a paginated endpoint. What gets built is a fetch loop on mount. It
   is fine until one customer has 40,000 rows, and then it is fine for nobody. This is a `BLOCKER`
   at review.
2. **Client-side sorting or filtering of a partial page.** Sorting the twenty rows you happen to
   hold and labelling the column "Sort by date" is a lie the user cannot detect. Every sortable
   column and every filter maps to a value the contract whitelists, and the sort goes to the server.

Where a sort has no unique tiebreaker, rows repeat and vanish between pages. Fixing that is the
contract's job; noticing it is yours — name the tiebreaker each list relies on.

## Forms: validation, errors, and who wins

The `form` pattern in `docs/ui-patterns.md` holds the conventions every form follows (required
marking, labels never placeholders, help text, defaults, submit / cancel / reset / save-draft,
one submit at a time, long forms in sections with a step indicator and a draft). Write each
form's fields in the `## Forms` table and only its deviations in prose.

Per form: the fields, the validation rules and **when they fire** (on blur, on submit, on change
after the first failure — pick one and hold to it, because mixed timing reads to a user as
flakiness), where the inline error sits relative to its field, the submit/disabled/pending states,
and what happens when the server rejects something the client accepted. Every form is
`noValidate` (the kit's `Field` shows the error, not the browser), validates on blur, and on
submit shows an error summary that links to each failed field. Every input dialog uses the kit's
discard guard.

That last one is not an edge case. The server owns the truth; field-level errors arrive in the
§13.1 error shape, and the spec says which field each maps to and what happens to the user's input
while they fix it. The answer is always "it survives" — a form that clears itself on a 422 is the
fastest way to lose somebody's afternoon.

## Optimistic or pessimistic, said out loud

For every mutation, say which. Left unstated, the implementer picks optimistic — it feels faster —
and does not design the rollback, so a failed delete leaves a row that is gone from the screen and
present in the database until someone refreshes.

Optimistic is right when failure is rare, reversible, and the reversal is visible. When you choose
it, specify the reversal: what reappears, what is said, and where the user's input went.

## Accessibility, per component, testable

§13.3 binds WCAG 2.2 AA. A paragraph promising it changes nothing. Per component, state:

- the semantic element — or the `role`, where no semantic element exists, and prefer the element;
- the accessible name and where it comes from: visible label, `aria-label`, or a labelled-by id;
- its position in the focus order, and what takes focus when the component appears or closes;
- the **complete keyboard path** for every action it offers, dismissal included;
- which live region announces async results, and whether it is polite or assertive;
- contrast, as the token pair it is measured between, and the target size.

The test for sufficiency: **could someone write a failing test from this sentence?** "The modal is
accessible" — no. "Opening the dialog moves focus to its heading, `Esc` closes it and returns focus
to the trigger, and focus is trapped between the first and last controls" — yes, three tests.

Composite widgets are where this earns its cost: modals (focus trap and restore), menus and
comboboxes (`aria-expanded`, arrow keys, type-ahead), tabs, and anything where a `div` is being
asked to behave like a control. A `div` with a click handler is invisible to keyboards and to the QA
bundle alike.

## Traceability: the handoff G6 plans from

Under `## Components`, `### Traceability` (§13.13) has a row per screen at least: the component, the
`operationId` it reads or calls (the screen's API data requirement), and the `AC-NNN` and `UB-NNN`
it satisfies. Name operations by `operationId` exactly as the contract writes them. An operation
the screen needs and the contract lacks is a constraint you hand back to G4. Lint `E143`/`E144`.

## Tokens, kit, and test hooks

Every colour, space, radius, type size and motion value cites a token from `docs/design-tokens.md`
by its token name (`color.text-muted`, `space.4`, `radius.md`), never by its value.
A hard-coded hex or px in a spec becomes a hard-coded hex or px in a component, and then a theme
change is a sweep through the codebase instead of a config edit.

Components come from the kit named in `design-tokens.md` §Kit first. A bespoke component needs a justification and an owner — a
one-off is a maintenance cost forever, and the reviewer will ask which kit component you rejected.

Declare the `data-testid` values, per the convention, for every element an acceptance criterion has
to reach. These are the handles `agentic-fx-qa` binds its e2e scripts to (§9). Declared here they
are stable; discovered later they are CSS paths that break the first time somebody reorders a
container. Prefer a role-and-name selector where one exists, and add the testid where it does not.

## Responsive, at named breakpoints

From 360px up (§13.3), one table row per token breakpoint (`bp.sm` … , lint `W141`): shell, lists
and tables (cards or priority columns), dialogs and forms (a dialog becomes a full-screen sheet
below `bp.md`), media. Say where orientation matters. Then confirm that nothing hidden is the
**only** route to an action. A table that drops its
last column on a phone has dropped whatever that column held; if that was the row's only menu, the
feature does not exist on a phone.

## Accessibility beyond 2.1

Add the WCAG 2.2 criteria §13.13 lists per component where they apply: a sticky bar that could cover
a focused control, a drag with no single-pointer alternative, a target under 24 px, help that moves,
data the user must re-enter, a sign-in that blocks paste. Alt text per informative image.

## Record what you cannot know

Product judgements — what the empty state should invite the user to do, whether a destructive action
needs a confirm or an undo, which role sees the cost column — are `DEC-NNN` in
`<root>/decisions/<slug>.md` with a recommended default (§15.2), not choices you make on the business's
behalf.

**You may never write `status: assumed`.** Only a named human may say "proceed on that default".
Recording a decision and then designing the screen to your own recommended default is the quiet
version of guessing: the ledger row stays `open` while the screen has already chosen, and at G9
nobody can say who decided. Design every screen that does not depend on the answer, and mark the
ones that do `N/A — blocked by DEC-NNN`.

## Front matter

Fill §3.1 in full. `status: draft`, `reviewed_by: pending` — the gate log records the verdict, and
an author marking its own work approved is a contract violation the linter rejects.

Write `authored_by: dev-specifying-ui`: the name of the skill that actually ran. The template's
own header currently names a different authoring skill for this artifact. Front matter exists so
that a reader can find who did the work, and a name pointing at no installed skill cannot be traced;
reconciling the template header is its owner's call, not yours (§3).

## Do not

Write component code. Change the API contract or the schema. Estimate or sequence the work — that is
G6. Declare your own gate `SKIPPED`; only a reviewer may, against its own published applicability
rule (§5.4). Invent a design token. Invent a layout no pattern describes without a `DEC-NNN`.
Specify a screen no requirement asked for. Add, drop or move an element the G1 wireframe fixed —
its content is frozen at G1 (§4.2); a content change is a `DEC-NNN` that re-opens G1.
