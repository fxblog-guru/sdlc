---
doc: ui-patterns
version: 1
---

# UI patterns — the shapes every screen starts from

> Copied into `<root>/docs/ui-patterns.md` by `/sdlc-design-system`. Long-lived, like the tokens.
> Every screen in a `ui-spec.md` names **one shell and one pattern** from this file (§13.3), then
> writes only what differs. Most bad UI is not bad colour. It is bad layout: the primary action in a
> different corner on every page, filters that sometimes sit above the table and sometimes in a
> drawer, a detail page whose tabs are chosen by whoever built it. A pattern fixes those decisions
> once, so a screen only has to decide what is genuinely its own.
>
> Sizes below are token names from `docs/design-tokens.md`, never values. `space.4` means whatever
> the chosen preset says `space.4` is.

## How a ui-spec uses this file

1. In `## Screens`, the `Pattern` column names one id from below, such as `list` or `detail`.
2. The screen inherits that pattern's **anatomy**, its **default states** and its **responsive
   rules**. The spec's `## States` table still gets all nine cells filled in. The pattern gives each
   cell a starting point, so the author edits a default instead of starting from a blank cell.
3. A deviation is allowed and is written as `Deviation from <pattern>: <what> — <why>` in the
   screen's notes. A deviation with no reason is a finding at G5, because it is the same
   improvisation this file exists to prevent.
4. No pattern fits? That is a signal, not a licence. Record a `DEC-NNN`: either the screen is really
   two screens, or this file needs a new pattern. Adding one is a change to this file, reviewed like
   any other.

---

## Shells

The shell is the frame around every screen: navigation, the page header and where content sits.
The preset proposes one. A product uses **one shell** everywhere except auth and first-run.

### `shell.sidebar`

```
┌────────────┬──────────────────────────────────────────────┐
│ Logo       │  Page header: title · actions (right)        │
│            ├──────────────────────────────────────────────┤
│ Nav        │                                              │
│  · Item    │  Content (max control.content-max, centred   │
│  · Item    │  or left-aligned per preset)                 │
│  · Item    │                                              │
│            │                                              │
│ ─────────  │                                              │
│ Account    │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- Sidebar width is `control.sidebar-width`. The active item uses `color.primary` plus
  `aria-current="page"`.
- Below `bp.lg` the sidebar collapses to an icon rail. Below `bp.md` it becomes a drawer opened from
  a menu button in the header. The drawer traps focus and `Esc` closes it.
- Landmarks: `<nav aria-label="Main">`, `<header>`, `<main id="main">`. A skip link to `#main` is
  the first focusable element.

### `shell.topbar-sidebar`

Same as `shell.sidebar`, plus a full-width top bar holding global search, environment or tenant
switcher, notifications and account. Use it when there are more than about eight sections, or a
tenant/site switch changes the whole app. The sidebar holds sections and the top bar holds
everything that is global.

### `shell.topnav`

```
┌────────────────────────────────────────────────────────────┐
│ Logo   Nav · Nav · Nav                    Search  Account  │
├────────────────────────────────────────────────────────────┤
│              Content (control.content-max, centred)        │
└────────────────────────────────────────────────────────────┘
```

- Five top-level sections or fewer. Below `bp.md`, nav collapses into a menu button that opens a
  full-height sheet.

### `shell.bottom-tabs`

```
┌──────────────────────────┐
│ ‹ Back   Title    Action │  ← app bar: one action max
├──────────────────────────┤
│                          │
│  Content (single column) │
│                          │
│                  ( + )   │  ← FAB only if the screen has ONE primary create action
├──────────────────────────┤
│  ⌂     ☰     ◷     ☺     │  ← 3–5 tabs, icon + label, control.height-lg
└──────────────────────────┘
```

- Tabs always show a label, never an icon on its own. The active tab has `aria-current="page"`.
- Above `bp.lg` the tabs become a left rail. The content column stays at `control.content-max`.
- Destructive or rare actions go in an overflow menu in the app bar, never in the tab bar.

---

## Patterns

Each pattern gives: **when to use it**, **anatomy** (regions top to bottom), **default states**
(the starting point for each of the seven cells in the spec), **responsive** behaviour, **kit parts**
and the **mistakes it exists to prevent**.

### `list` — index of records with filters

Use for any screen whose job is "find one or more records, then act on them": jobs, customers,
invoices, users.

```
┌──────────────────────────────────────────────────────────┐
│ H1 Title (count)                       [Secondary] [+ New]│
├──────────────────────────────────────────────────────────┤
│ [Search……………]  [Filter ▾] [Filter ▾]  [Clear]   View ▾   │  ← filter bar; state in the URL
├──────────────────────────────────────────────────────────┤
│ ☐ │ Name ▲      │ Status   │ Owner   │ Updated   │  ⋯     │  ← header: surface-2, sortable cols
│ ☐ │ …           │ ● Active │ …       │ 2h ago    │  ⋯     │  ← row: control.row-height
│ ☐ │ …           │ ○ Draft  │ …       │ 1d ago    │  ⋯     │
├──────────────────────────────────────────────────────────┤
│ 3 selected: [Assign] [Export] [Delete]   ‹ Prev  Next ›   │  ← bulk bar replaces pager when selecting
└──────────────────────────────────────────────────────────┘
```

- **Primary action** (`+ New`) sits top-right, and only there. Only one control on the screen uses
  `color.primary` fill.
- **Filters and sort live in the URL**, so a filtered view can be shared and survives a refresh.
- **Pagination** follows the API contract (§13.1): a pager for offset, "Load more" or infinite
  scroll for cursor. The count in the H1 is shown only if the API returns a total.
- **Row click** opens `detail`. The `⋯` menu holds row actions, and destructive actions sit at the
  bottom after a separator.

| State | Default |
|---|---|
| Loading | Header and filter bar render immediately. The table body shows 8 skeleton rows at `control.row-height`. The pager is hidden. |
| Empty (none yet) | Centred in the table area: an icon, one sentence on what this list holds, and the `+ New` action repeated as a primary button. Filter bar hidden. |
| Empty (filtered) | "No <things> match these filters". The `[Clear filters]` button keeps the filter bar visible, and search terms stay in the box. |
| Error | Inline banner above the table: `color.danger` icon, what failed, `[Retry]`. The last good page stays visible, dimmed, if one exists. |
| Partial / stale | Rows render and the failing column shows `—` with a tooltip. For stale data, a banner reads "Updated 4 min ago · Refresh". Bulk actions are disabled while stale. |
| No permission | Whole list: the page is replaced by a no-access panel naming who to ask. Per row: the actions the user may not take are hidden from `⋯`, never shown disabled without a reason. |
| Offline | Banner "You're offline — showing the last loaded page". Create and bulk actions are disabled with a tooltip saying why. |
| Populated | As drawn. |

**Responsive:** below `bp.md` the table becomes a card list: title, status badge, one meta line and
a chevron. The row's `⋯` actions move into the card, because a hidden column must never be the only
route to an action. Filters collapse behind a `[Filters (2)]` button that opens a sheet.

**Kit:** DataTable, Input (search), Select or Combobox (filters), Checkbox, DropdownMenu, Badge,
Pagination, Skeleton, Alert, EmptyState.

**Prevents:** a filter bar in a different place on every list, client-side sort of a partial page,
selection with no visible bulk bar, and a phone layout with no row actions.

### `detail` — one record, read first

Use to show one record and the actions that apply to it, with related collections in tabs.

```
┌──────────────────────────────────────────────────────────┐
│ ‹ Orders / ORD-2048                                       │  ← breadcrumb back to the list
│ H1 Record title   ● Status        [Secondary] [Primary] ⋯ │
│ meta · meta · meta                                        │
├──────────────────────────────────────────────────────────┤
│ Overview │ Activity │ Files │ Related (3)                 │  ← tabs; the tab is in the URL
├───────────────────────────────────┬──────────────────────┤
│ Main column: sections as cards     │ Side panel:          │
│  ┌ Section title ─────── Edit ┐    │  key facts,          │
│  │ Label   Value              │    │  people, dates       │
│  │ Label   Value              │    │                      │
│  └────────────────────────────┘    │                      │
└───────────────────────────────────┴──────────────────────┘
```

- **Status** is a Badge next to the title, and its colour comes from the semantic tokens. The
  primary action follows the record's lifecycle ("Start", "Complete", "Send") and is not always
  "Edit".
- **Editing:** small edits are inline per section ("Edit" link, then save or cancel inside the
  card). Large edits open the `form` pattern on its own route.
- **Destructive actions** go in `⋯`, at the bottom, and open a confirm that names the record.

| State | Default |
|---|---|
| Loading | Title-block skeleton, tabs rendered, section-card skeletons. The side panel loads on its own. |
| Empty | A section with no data shows one line saying so plus the action that fills it, for example "No files yet · Upload". |
| Error | Record failed to load: full panel with the reason and `[Retry]` / `[Back to list]`. A tab failed to load: only that tab shows the error. |
| Partial / stale | A section that failed shows an inline error in its own card. The rest renders. |
| No permission | The record is visible but some actions are not allowed: those actions are hidden. The record itself is forbidden: a no-access panel. A 404 and a 403 read differently to the user. |
| Offline | Read-only banner. Inline edit links are disabled. |
| Populated | As drawn. |

**Responsive:** below `bp.lg` the side panel moves under the title block. Below `bp.md` the tabs
become a horizontally scrollable tab list, never a select, and the header actions collapse into one
primary action plus `⋯`.

**Kit:** Breadcrumb, Badge, Tabs, Card, DescriptionList, DropdownMenu, AlertDialog, Skeleton.

### `form` — create or edit on its own route

Use to create a record, or to edit one when the change is too big for inline editing.

```
┌──────────────────────────────────────────────┐
│ ‹ Back   H1 New job                           │
├──────────────────────────────────────────────┤
│ Section title                                 │
│ helper sentence                               │
│  Label *                                      │
│  [……………………………]                              │
│  helper / inline error under the field        │
│  Label                                        │
│  [……………………………]                              │
│ ───────────────────────────────────────────── │
│ Section title                                 │
│  …                                            │
├──────────────────────────────────────────────┤
│                        [Cancel]  [Save job]   │  ← sticky footer on long forms
└──────────────────────────────────────────────┘
```

- **One column**, labels above fields, width capped at about 640px (the nearest `control.content-max`
  step). Two fields share a row only when they are one idea (start date and end date).
- **Validation fires on blur, then on change** once a field has shown an error. On submit, focus
  moves to the first invalid field and a summary at the top links to each error.
- **Server rejection (422):** the field errors map onto their fields and **the user's input
  survives**.
- **Submit:** the button shows a pending state and is disabled while pending. On success, go to the
  record's `detail` page and show a toast.
- **Leaving with unsaved changes** asks for confirmation.
- **Required and optional:** mark the smaller set. Most fields required: mark the optional ones
  "(optional)". Most optional: mark the required ones "(required)", in words, never an asterisk alone.
- **Labels, help and placeholders:** every field has a visible label above it; help text sits under
  the label and stays visible; a placeholder is an example value at most, never the label or the
  only instruction (it vanishes on the first keystroke).
- **Defaults:** prefill only a value most users keep (today, the user's own team); never a default
  that commits the user to something they did not choose (a paid plan, a broadcast).
- **Buttons:** Submit names the result ("Create release"); Cancel leaves without saving; Reset
  appears only where starting over is a real task; Save draft only on a long form. One submit at a
  time: the button is pending from the first click and a create carries an idempotency key.
- **Long forms** (more than about eight fields, or two topics): sections with headings, and past
  three sections a `wizard` with a step indicator; a draft is kept (server-side, or local where the
  spec says) so a refresh or a timeout loses nothing.
- **Errors:** inline under the field, saying how to fix it; on submit a summary at the top that links
  to each field. Validation fires on blur, then on change once a field has shown an error.

| State | Default |
|---|---|
| Loading | Edit mode: field skeletons in the final layout. Create mode: renders immediately. |
| Empty | Not applicable to the form itself. Dependent selects with no options say so and link to where options come from. |
| Error | Submit failed with a server error: a banner above the footer, input kept, `[Try again]`. |
| Partial / stale | Edit conflict (someone else saved first): a banner offering "Reload their version" or "Overwrite". Never a silent overwrite. |
| No permission | A user who may view but not edit gets the `detail` page, never a form with every field disabled. |
| Offline | Submit disabled with a reason. The draft is kept locally if the spec says so. |
| Populated | As drawn. |

**Kit:** Form, Label, Input, Textarea, Select, Combobox, DatePicker, Checkbox, RadioGroup, Switch,
Button, Alert, Toast.

### `wizard` — a multi-step task

Use when the task has an order, later steps depend on earlier answers, and the whole thing needs
about four or more screens of fields. Onboarding, a checkout, an import.

```
┌──────────────────────────────────────────────┐
│ ① Details ─── ② Schedule ─── ③ Review        │  ← stepper; completed steps are links back
├──────────────────────────────────────────────┤
│ H1 Step title                                 │
│ (form pattern body)                           │
├──────────────────────────────────────────────┤
│ [Back]                    [Save draft] [Next] │
└──────────────────────────────────────────────┘
```

- The **last step is always Review**, a read-only summary with "Edit" links back to each step,
  followed by the commit action.
- Progress persists: a draft is saved server-side (or the spec says why not), and a refresh returns
  the user to the same step.
- The step is in the URL. Browser back goes to the previous step, not out of the wizard.

**States:** as `form`, per step, plus one more: **abandoned draft**. Returning to the flow offers
"Continue where you left off" or "Start over".

**Responsive:** below `bp.md` the stepper collapses to "Step 2 of 3 · Schedule" with a progress bar.

### `dashboard` — status at a glance

Use for a landing screen that answers "what needs my attention?" It is not a place for every chart
someone asked for.

```
┌──────────────────────────────────────────────────────────┐
│ H1 Overview                     [Date range ▾] [Export]   │
├──────────────┬──────────────┬──────────────┬─────────────┤
│ KPI          │ KPI          │ KPI          │ KPI         │  ← 3–5 stat tiles: value, delta, period
│ 1,204  ▲4%   │ …            │ …            │ …           │
├──────────────┴──────────────┼──────────────┴─────────────┤
│ Primary chart (trend)       │ Needs attention (list)      │  ← actionable list beats a second chart
├─────────────────────────────┴────────────────────────────┤
│ Secondary: recent activity / table (list pattern, 5 rows) │
└──────────────────────────────────────────────────────────┘
```

- Each tile loads, fails and retries **independently**. One slow query must not blank the page.
- Every number links to the list it summarises, pre-filtered.
- Charts follow the `dataviz` rules: one chart answers one question, and its axis, legend and period
  are stated.

| State | Default |
|---|---|
| Loading | Each tile and panel shows its own skeleton, so there is no page-level spinner. |
| Empty | New account: a first-run checklist replaces the tiles, and the tiles appear once data exists. A tile with no data for the chosen range says so. |
| Error | Per tile: "Couldn't load · Retry" inside the tile. The other tiles are unaffected. |
| Partial / stale | "Data as of <time>" under the H1. A tile whose source lags carries a small stale badge. |
| No permission | Tiles the role may not see are not rendered, and their space collapses. They are never shown locked or blurred. |
| Offline | The last values are shown with an "Offline · as of <time>" banner. |
| Populated | As drawn. |

**Responsive:** tiles go 4 → 2 → 1 across. Charts keep their aspect ratio. The "needs attention"
list moves above the chart below `bp.md`.

### `settings` — grouped preferences

Use for account, organisation and feature configuration.

```
┌──────────────┬───────────────────────────────────────────┐
│ General      │ H2 Section                                 │
│ Members      │ helper sentence                            │
│ Billing      │  Setting label           [control]         │
│ Integrations │  description                               │
│ Danger zone  │ ───────────────────────────────────────── │
│              │  Setting label           [control]         │
└──────────────┴───────────────────────────────────────────┘
```

- A local nav on the left and one section per route. Toggles apply immediately with a toast and an
  undo. Text fields save with an explicit Save button **per section**, never one Save for the whole
  page.
- **Danger zone** comes last, uses a `color.danger` border, and every action in it opens a confirm
  that asks the user to type the name of the thing being destroyed.

**States:** as `form`, per section.

**Responsive:** below `bp.md` the local nav becomes a list screen and each section opens as its own
screen with a back link.

### `master-detail` — triage a stream

Use when the user works through items one after another and needs the list and the open item
together: an inbox, an approval queue, a support ticket queue, a dispatch board's job queue.

```
┌──────────────────────┬───────────────────────────────────┐
│ [Search] [Filter ▾]  │ Item title          [Act] [Act] ⋯ │
│ ▸ Item  · meta   2m  │                                   │
│   Item  · meta   5m  │ detail body                       │
│   Item  · meta   1h  │                                   │
└──────────────────────┴───────────────────────────────────┘
```

- The selected item is in the URL. `↑` and `↓` move through the list and `Enter` opens an item.
  Completing an item advances to the next one.
- Below `bp.lg` it becomes two screens, list and then detail, with back returning to the same scroll
  position.

**States:** the list pane follows `list`, and the detail pane follows `detail`. When nothing is
selected, the detail pane says so and gives the keyboard hint.

### `board` — items across stages or time

Use for kanban columns (status), a schedule or calendar (time × resource), or a map with a list.

```
┌──────────────────────────────────────────────────────────┐
│ H1 Board        [Filter ▾] [Group by ▾]  ‹ Today ›  [+ New]│
├─────────────┬─────────────┬─────────────┬────────────────┤
│ To do (4)   │ In progress │ Blocked (1) │ Done           │
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │                │
│ │ Card    │ │ │ Card    │ │ │ Card    │ │                │
│ └─────────┘ │ └─────────┘ │ └─────────┘ │                │
└─────────────┴─────────────┴─────────────┴────────────────┘
```

- **Drag is never the only way to move a card.** Every card has a "Move to…" action in its menu,
  and keyboard dragging (space to pick up, arrows to move, space to drop) is announced through a
  live region. This is WCAG 2.2 2.5.7, and G5 fails a board without it.
- Moves are optimistic, and the spec states the rollback when the server rejects a move.
- A column with more cards than one page loads more inside the column. It never loads every card.

**Responsive:** below `bp.md` it becomes a single column with a stage switcher at the top, and
moving is done through the menu.

### `auth` — sign in, sign up, reset

```
┌──────────────────────────────┐
│           Logo               │
│      H1 Sign in              │
│  Email   [……………………]        │
│  Password[……………………] 👁     │
│  [        Sign in         ]  │
│  Forgot password?            │
│  ───────── or ─────────      │
│  [ Continue with SSO ]       │
└──────────────────────────────┘
```

- A centred card with no app shell. Password managers must work: correct `autocomplete` values, and
  paste is never blocked (WCAG 2.2 3.3.8).
- Errors never reveal whether the account exists. Rate-limit messages say how long to wait.

### `first-run` — empty product, first visit

Use for the screen a new tenant sees before any data exists. It replaces the `dashboard` or the main
`list` until the first record is created.

- One headline, 3–5 checklist steps with progress, and each step links to the screen that completes
  it. It can be dismissed, and the dismissal is remembered server-side.
- This is the "nothing exists yet" empty state promoted to a screen. Design it deliberately, because
  it is the first impression.

---

## Components every pattern shares

These rules hold across all patterns so that no screen has to re-decide them:

| Concern | Rule |
|---|---|
| Primary action | At most one `color.primary` filled button per view. It sits in the page header at the right, or in the form footer at the right. |
| Button order | Footers put secondary before primary: `[Cancel] [Save]`. Destructive buttons use `color.danger` and are never the default focus. |
| Feedback | A success that happens off-screen, or after navigating away, gets a toast. An error the user must fix gets an inline message next to its cause. A toast never carries an error that needs action. |
| Confirmation | Reversible actions get an undo toast (5–8 s) instead of a confirm. Irreversible ones get a confirm naming the object. Bulk irreversible actions also show the count. |
| Long actions | Over 1 s: pending state on the trigger. Over 10 s: a progress indicator plus "we'll notify you". Never a modal the user cannot leave. |
| Empty text | Say what the thing is and the one action that fills it. Never "No data". |
| Dates | Relative for under 7 days ("2h ago") with the absolute date in a tooltip. Absolute after that. The locale and timezone come from the user. |
| Status | A status is a Badge that pairs a semantic colour **with text**. Colour alone never carries meaning (WCAG 1.4.1). |
| Focus | Every focusable element shows a 2px `color.focus` ring with an offset. `outline: none` without a replacement is a G7 finding. |
| Motion | Only `motion.*` tokens. Nothing moves further than 8 steps of `space`. Everything respects reduced-motion. |
