---
name: dev-writing-react-code
description: Use in /sdlc-implement (G7) for .tsx work: tokens only, every state, honest pagination, hook traps, WCAG 2.2 AA, eslint/tsc/vitest.
---

# Writing React — G7

Adapted from `react-coding-standard` in `gitlab.com/agentic-fx/skills` @ `8556e8f`
(`docs/skill-sources.md`). Its type-safety and structure rules are kept. Its project layout and its
Tailwind/`cn()` convention are **not** binding here: layout comes from `DEV-PROFILE §Stacks` and
styling from `docs/design-tokens.md` (§13.3), which is this bundle's single source of colour,
spacing, type scale, radius, elevation and motion.

> `DEV-CONTRACTS.md` §13.3 (UI standards), §13.1 (the API contract you are consuming), §9 (why the
> test ids matter to someone else). `ui/<slug>/ui-spec.md` from G5 is the decided design; you are
> building it, not revising it.
> The repository's tree and layering come from its blueprint, `dev-resolving-code-placement/blueprints/` (§13.9).

The bugs this gate catches in React are rarely rendering bugs. They are the second response that
arrives first, the effect whose dependency array lies, and the screen that has no idea what to draw
while it waits.

## Tokens, not values

No hard-coded hex, no magic px. Colour, spacing, radius, type scale, elevation and motion come from
`docs/design-tokens.md` through whatever the repo exposes them as — CSS variables, a theme object,
Tailwind's config. A `#3B82F6` in a component is a `MAJOR` at review, not because it looks wrong
today, but because the next theme change will find eleven of them and miss the twelfth.

The tokens reach the app through the generated `tokens.css` (its path is in `design-tokens.md`
§Wiring), imported once at the root. Tailwind, where used, maps its theme to those variables rather
than to values, so `bg-primary` is `var(--color-primary)` and not `#4f46e5`. The one place a px value
is legitimately written is the breakpoint config, because media queries cannot read variables.

Three traps that pass every unit test and break every screen:

- **Replacing a Tailwind scale drops the utilities that depend on it.** A `theme.spacing` that
  replaces the default (rather than `extend`ing it) also removes `left-1/2`, `top-1/2` and
  `-translate-x-1/2`, because `inset` and `translate` read the spacing scale. The class compiles to
  nothing, and every centred dialog pins to the left edge. Either extend, or add the fractions you
  use (`'1/2': '50%'`, `full: '100%'`) to `inset` and `translate`. A dialog's width is
  `control.dialog-max`, never the page's content width.
- **A scrim is its own token** (`--color-scrim`), never `bg-text` at an opacity. In a dark theme the
  text colour is light, and that overlay brightens the page instead of dimming it.
- **A colour the approved visual design draws is a token, not a `color-mix()` in code.** This covers tint
  fills behind badges and pills, and a selected-row wash. If `design-tokens.md` has no role for
  one, do not mix one from `--color-success` in a component or a Tailwind plugin. Raise it as a
  finding, and add it to the preset's `extra_roles`, with its pairs in `extra_contrast_pairs`. A
  mixed colour is one `check` never measures.

UI-kit components before anything bespoke, and the kit is the one `design-tokens.md` §Kit names. A
hand-rolled dropdown is a keyboard trap and a focus bug that the kit already fixed. The kit is
copied into the project before the first screen task, and its ESLint fragment bans raw
interactive elements outside `components/ui` and formatters outside `lib/format`. The fragment,
the checks G7 runs and the interaction rules the reviewer looks for are in
[kit-and-lint.md](kit-and-lint.md).

## Build the pattern the spec names

Each screen in `ui-spec.md` names a shell and a pattern from `docs/ui-patterns.md`. Build that
pattern's anatomy exactly: the primary action where the pattern puts it, filters where the pattern
puts them, the collapse at `bp.md` the pattern describes. Only the deviations the spec wrote down
may differ. Build the shell once, as a layout component, and have every screen render inside it.
A second copy of the page header is how two pages come to disagree about where the title goes.

When the pattern and your instinct differ, the pattern wins. When the pattern and the spec differ,
the spec wins, because the spec recorded why. When the spec is silent on something the pattern
decides, follow the pattern and do not invent.

## Render it and look

Tests assert text and behaviour; they cannot see a dialog stuck to the left edge or a page that
followed the OS into dark mode. For each screen you touched, build the app, run it, and shoot it
beside the ui-spec's `visual_reference` (§13.3). Match the `kind: visual` reference on look and the
`kind: wireframe` reference on content and layout only; never copy a wireframe's greys, sizes or
radii, which are placeholders. Precedence: a recorded deviation, the wireframe on content, the
visual on look, then the tokens, then the patterns.

```bash
node <root>/scripts/ui-snap.mjs --app <screen>=<url> … --reference <the kind: visual path> \
  --widths 360,lg --tokens <root>/docs --out <root>/implementation/<slug>/ui-snap
node <root>/scripts/ui-rubric.mjs --url <screen>=<url> … --widths 1024,360 --tokens <root>/docs
```

Open `compare.html` and look at every pair, including one with a dialog open. Fix what differs,
and every rubric hard fail, or record it under `## Deviations from the plan` with a reason. List the
image paths in the change summary's `## Tests`. "Verified against a fake server only" is not
verification of a screen: a mocked API is fine for data, but the shot must come from the real build
in a real browser. With no `visual_reference`, shoot it anyway and compare against
`docs/ui-patterns.md`.

## Every state the screen can be in

§13.3 requires each screen to specify **loading, empty, error, partial, permission-denied, offline
and populated**, and `ui-spec.md` has already decided what each looks like. Build all of them.

Model them as one value, not as three booleans:

```tsx
type Result<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'empty' }
  | { status: 'ready'; data: T };
```

Three booleans allow `isLoading && isError`, which nobody designed and which renders as a spinner
on top of an error message. A discriminated union makes the impossible state unrepresentable and
makes the `switch` exhaustive, so a new state is a compile error rather than a blank panel.

Loading is a skeleton in the layout the content will occupy, not a full-page spinner — a spinner
that replaces the page throws away the user's scroll position and their context every time.

## Pagination is honest or it is a BLOCKER

The API is cursor-paginated with a default `limit` of 20 and a maximum of 100 (§13.1). The UI
renders that: a page at a time, with the `next_cursor` the response gave. A component that loops
`while (has_more)` to assemble "everything" so the table can sort client-side is a `BLOCKER` under
§13.3 — it works on the developer's 40 rows and takes the browser down on the customer's 40,000.

Sorting and filtering go to the server, mapped to the contract's whitelisted `sort` and filter
parameters. If the UI needs a sort the contract does not offer, that is a G4 conversation, not a
client-side workaround.

## Hooks, in the order these actually bite

**The out-of-order response.** Two fetches in flight, the first resolves last, and the UI shows
stale data with no error anywhere. Every effect that fetches either aborts on cleanup or ignores a
response it no longer wants:

```tsx
useEffect(() => {
  const ac = new AbortController();
  load(query, { signal: ac.signal }).then(setData).catch(ignoreAbort);
  return () => ac.abort();
}, [query]);
```

Better: use the server-state library the repo already has (React Query per `DEV-PROFILE`), which
handles this, plus caching and retry, and removes the effect entirely.

**The lying dependency array.** Omitting a dependency to stop a loop freezes a closure over the
first render's values, and the bug appears as "it works the first time". Fix the cause — memoise the
callback, move the value out, or use a ref deliberately — and let `eslint-plugin-react-hooks` be
right. Disabling the rule with a comment is a finding unless the comment explains the invariant.

**Derived state stored in state.** `useState` + `useEffect` to keep a filtered list in sync renders
twice and is wrong for one frame every time. Compute it in render, `useMemo` if it is expensive.

**Initialising state from props** captures the first value forever. If it must reset, key the
component; if it must follow, do not copy it.

**`key={index}`** on a list that can reorder, insert or delete makes React reuse the wrong DOM node
— the classic symptom is a checked checkbox moving to a different row. Use a stable id.

**StrictMode double-invokes effects in development on purpose.** A double request or a duplicated
subscription there is not a React bug; it is your missing cleanup, shown early.

## TypeScript

`import type` for types so the bundler can erase them. No `any` — `unknown` then narrow. Props
interfaces exported as `ComponentNameProps`. The API response type is the contract's shape, ideally
generated from `openapi.yaml` rather than retyped by hand, because a hand-copy is a second source
of truth that drifts silently the first time G4 changes a field.

## Accessibility is part of "done" (§13.3, WCAG 2.2 AA)

A `<div onClick>` is not a button: it has no keyboard path, no role and no focus ring. Use the
element; if you cannot, supply the role, `tabIndex` and key handlers and say why in a comment.

Every input has a programmatic label. Focus order follows the visual order, focus is visible, and
focus moves into a dialog and returns where it came from on close. Contrast is 4.5:1. Anything that
updates asynchronously — a toast, a validation summary, a result count — lives in a live region, or
a screen-reader user is told nothing happened. Responsive from 360px.

These are checkable, so check them: tab through the flow you built before you hand it over.

## Tests

`vitest` + Testing Library. Query by role and accessible name (`getByRole('button', { name: /save/i })`)
— it asserts the accessible tree exists, so one query covers a behaviour and an a11y requirement.
Use `userEvent`, not `fireEvent`: `userEvent.type` produces the focus, key and input events a real
user does, and a component that only works under `fireEvent` is one that will not work for a person.

Test behaviour through the component's public surface, not its internals. A test that asserts a
hook's call count fails on every refactor and passes on every regression. Mock at the network
boundary (MSW or the repo's equivalent), so the test exercises the real fetch path.

`data-testid` follows the convention `ui-spec.md` declares, and exists for the **QA bundle's** e2e
tier to find elements (§9). It is not how your own unit tests should select things.

**Name the id, and do not buy time (§13.10).** A test that proves an `AC-NNN` or a `UB-NNN` row puts
the id in its title (`it('Esc with typed input shows the discard bar (UB-014)')`);
`trace.mjs <slug> --check` must exit 0 before handback. Every `UB` row about a dialog, focus, Back or
URL state gets a test of exactly that, with `userEvent`. Raising `testTimeout` or a `{ timeout }`,
or adding a retry, needs `// slow-test: <cause>`; otherwise fix the await.

## Toolchain — run these before you hand over

| Tool | Command | Catches |
|---|---|---|
| types | `tsc --noEmit` | the G8 types gate |
| lint | `eslint .` | the hooks rules, `jsx-a11y`, unused imports |
| format | `prettier --check .` | the format gate, exit-code binary |
| tests | `vitest run --coverage` | the number G8 measures per changed module |
| deps | `npm audit --omit=dev` | §13.6's dependency gate |
| tokens | `node <root>/scripts/design-system.mjs scan <changed ui dirs>` | hard-coded hex, rgb/hsl, px and style-object numbers (§13.3) |
| kit | `design-system.mjs classes`, `kit-check`, `ui-inventory.mjs`, `copy-lint.mjs` ([kit-and-lint.md](kit-and-lint.md)) | dead classes, an unbuilt kit, second implementations, literal and inconsistent copy (§13.3) |
| look | `node <root>/scripts/ui-snap.mjs …` and `ui-rubric.mjs …` (§Render it and look) | a screen that does not look like the approved visual design, or overflows, clips a column or has two primary buttons |

## Render budgets (§13.7)

A list that can grow gets a render-count test, because a remount or a measure-every-render shows up
as a count long before it shows up as a slow test:

1. Wrap a row in `<Profiler>` and key the counts by the row's id. After one user action, every row
   already on screen is the **same DOM node** (`isConnected`, identity) and rendered at most once;
   an edited row updates, its siblings do not.
2. A component that reads layout in an effect (`getComputedStyle`, `getBoundingClientRect`) is
   re-rendered with the same content and asserted to read **zero** more times.
3. Before hand-over, run `web-perf.mjs` on the production build for the routes you changed, against
   the budgets in `DEV-PROFILE §Quality gates`.

The helper, the tests and the two release-management bugs they come from: `render-checks.md` beside
this file. A slow test is investigated for a product cause before any timeout changes:
`.claude/skills/dev-stage-protocol/slow-tests.md`.

## What a reviewer will grep for

| Grep | What it usually means |
|---|---|
| `design-system.mjs scan` hits (hex, `rgb(`, `px`, `padding: 12`) | a token that was bypassed (§13.3). A genuine exception carries `tokens-ok: <reason>` on the line |
| a page header, filter bar or pager built inline in a screen | the shell or pattern was re-implemented, and will drift from the other screens |
| `: any` / `as any` | a type boundary that gave up |
| `key={index` | wrong-node reuse on reorder |
| `.map(` returning an array (`=> [`) inside JSX | a list of arrays keyed by index — a remount of every row when one is prepended; use `flatMap` |
| `[children]` as an effect's dependency | an effect, often a layout measure, that runs on every parent render |
| `eslint-disable.*react-hooks` | a dependency array that lies |
| `useEffect` containing a `fetch` with no `AbortController` | the out-of-order response |
| `while (`/`for (` around a paginated fetch | the unbounded client-side fetch — a `BLOCKER` |
| `<div` with `onClick` | no keyboard path |
| `dangerouslySetInnerHTML` | XSS unless the input is provably sanitised |
| `fireEvent` in a test | interaction the real user does not have |
| a replacing `theme.spacing` with no `inset`/`translate` fractions, or `bg-text` on an overlay | the centred dialog that pins left; the scrim that brightens dark mode |
| `color-mix(` on a `--color-*` in a component, style or Tailwind plugin | a colour the visual draws that `check` never measures — an `extra_roles` token |

## Do not

Revise `ui-spec.md` because the component would be simpler — that is a finding to raise, and
editing it turns G5 `STALE` (§4.4). Add a dependency `architecture.md` did not name. Write App
Router server/client boundaries, caching or `loading.tsx` here — that is `dev-writing-nextjs-code`.
Write e2e tests: that tier belongs to `agentic-fx-qa` (§9).
