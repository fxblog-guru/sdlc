---
template_for: ui-spec
gate: G5
authored_by: dev-specifying-ui
reviewed_by: dev-reviewing-ui
---

<!--
Most UI defects are not visual — they are missing states. The happy path gets designed, and then
loading, empty, error, partial, permission-denied and offline get improvised by whoever implements
the screen, differently each time. That is why the states table below is mandatory and why a screen
with a blank row in it does not pass G5.

The other habitual gap is pagination. If the API returns a cursor page and the screen says
"show all items", someone will write a loop that fetches every page on mount, and it will be fine
until a customer has 40,000 rows. State the loading strategy per list, here, before it is code.
-->

---
slug: <slug>
stage: ui
artifact: ui-spec
status: draft
authored_by: dev-specifying-ui
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
# visual_reference: [{ path: <root>/ui/<slug>/wireframe.html, sha256: <from build-state.mjs --hash>, kind: wireframe }, { path: <root>/ui/<slug>/visual/index.html, sha256: <…>, kind: visual }]   # wireframe = content, visual = look (§13.3)
---

## Screens

<One row per screen or major view: its route, the REQs it serves, who may see it, and the shell and pattern from docs/ui-patterns.md it starts from.>

| Screen | Route | REQs | Roles | Entry points | Pattern |
|---|---|---|---|---|---|

### Roles matrix

<One row per screen and per action on it; one column per role in the requirements. A cell is enabled, disabled, hidden, read-only or —. Operation is the operationId the action calls (— for a client-only action). This reflects the contract's per-operation authorisation and never replaces it: the server refuses what this hides, and a hidden control whose data is still fetched is a BLOCKER (§13.13).>

| Screen | Action | Operation | <role> | <role> |
|---|---|---|---|---|

## User flows

<The path through the screens for each journey in the PRD, including what happens on cancel, back, refresh, and deep link — as a mermaid screen-flow diagram where there are more than three screens (dev-drawing-diagrams catalogue §9).>

## States

<Every screen × every state, starting from the pattern's defaults. A blank cell is a design gap, not a detail for the implementer to invent; a state that cannot occur is `N/A — <reason>`. Empty is "nothing exists yet", No results is "a filter matched nothing". Error names its timeout. Long text / missing data says what truncates (with the full value recoverable) and what a null field shows. 401 and session expiry are the matrix below; success after an action is a UB row.>

| Screen | Loading | Empty | No results | Error | Partial / stale | No permission | Offline | Long text / missing data | Populated |
|---|---|---|---|---|---|---|---|---|---|

### Error-UX matrix

<One row per `ProblemType` in the API contract and per status 401, 403, 404, 409, 412, 422, 429, 5xx, offline, unknown (dev-specifying-ui/error-ux-matrix.md). Surface: inline field, form summary, notice, toast, page, or sign-in redirect. Retry: yes, no, or after Retry-After.>

| Problem | Surface | Component | Copy key | Retry |
|---|---|---|---|---|

## Components

<Which existing components from the UI kit each screen uses. Anything bespoke needs a justification and an owner — a one-off component is a maintenance cost forever.>

| Screen | Component | From kit | Variant | Notes |
|---|---|---|---|---|

### Traceability

<Design-to-dev handoff, one row per screen at least: the component, the operationId it reads or calls (the screen's API data requirement), and the AC-NNN and UB-NNN ids it satisfies. G6 plans from this table and G7 traces tests to the ids (§13.13).>

| Screen | Component | Operation | Ids |
|---|---|---|---|

## Design tokens

<The tokens used, referenced from docs/design-tokens.md. Hard-coded hex or px values are a finding; tokens are what make a theme change a config edit rather than a sweep. A colour the screen needs that no role names (a tint fill, a selected-row wash) is an `extra_roles` token with its `extra_contrast_pairs`, raised against the design system, never a color-mix in code.>

## Lists and tables

<Per list: the endpoint, the pagination style it must match, the page size, the load-more or pager pattern, sortable columns mapped to the API's `sort` values, filters, and the behaviour per breakpoint.>

| List | Endpoint | Pagination | Page size | Sortable columns | Filters | Small-screen behaviour |
|---|---|---|---|---|---|---|

## Forms

<The `form` pattern in docs/ui-patterns.md fixes the conventions every form holds; write only each form's fields and its deviations. Per field: label, required or optional (the pattern's marking), help text (a placeholder is never the label), default, format and constraint. Per form: submit, cancel, reset and save-draft semantics, duplicate-submit prevention, sections or steps for a long form and whether it autosaves a draft, optimistic or pessimistic, and what a server rejection does to the input.>

| Form | Field | Required | Default | Rule and when it fires | Help text |
|---|---|---|---|---|---|

## Interaction and feedback

<Confirmations, destructive-action guards, undo, toasts versus inline messages, and the timing of each. Say what happens when an action takes longer than a second. Then one UB-NNN row per observable interaction a test can name: Esc and close with typed input, focus return to the opener, Back and refresh, what lives in the URL, double submit, permission denial. Tests name these ids (trace.mjs) and the G7 exploratory pass walks them per role.>

| Id | Screen | Roles | Trigger | Expected |
|---|---|---|---|---|
| UB-001 | <screen> | <roles> | <what the user does> | <what is observable afterwards> |

## Accessibility

<WCAG 2.2 AA specifics for these screens: heading structure, labels and descriptions, focus order and visible focus, keyboard path for every action, contrast, live regions for async results, motion reduction, and target sizes. Then the 2.2 additions (§13.13): focus not obscured by a sticky bar, a single-pointer alternative to every drag, targets at least 24 px, help in the same place, no re-entry of data already given, sign-in without a cognitive test. Alt text per informative image; decorative images are alt="".>

## Responsive behaviour

<One row per breakpoint in docs/design-tokens.json, as `bp.<name>`, from 360px up: what is hidden, stacked or collapsed, how each table adapts (cards or priority columns), when a dialog becomes a full-screen sheet, and how images and media scale. Say where orientation matters. Confirm nothing becomes unreachable. Supported browsers are DEV-PROFILE §Quality gates `Browsers`.>

| Breakpoint | Shell | Lists and tables | Dialogs and forms | Media |
|---|---|---|---|---|

## Copy

<The strings, their tone, and their localisation keys. Error copy says what happened and what to do next; a raw server message reaching a user is a finding.>

## Test hooks

<The `data-testid` values (per the declared convention) that the QA bundle will rely on. Adding them now is what stops e2e scripts depending on brittle CSS paths later.>

## Open questions

<Design decisions still unresolved: each is a DEC-NNN in <root>/decisions/<slug>.md (§15.2), listed here by id with whether it blocks G6. Never an answer chosen in prose.>
