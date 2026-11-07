# The reference kit

The primitives every screen is built from: shadcn new-york conventions on React, TypeScript,
Tailwind, class-variance-authority and Radix, wired to the schema-2 `tokens.css` that
`design-system.mjs render` writes. They are copied into the project, not installed. The project
owns them from then on.

## What is here

| Path | What | Replaces (release-management, 2026-10-13) |
|---|---|---|
| `components/ui/button.tsx` | `Button`: primary, secondary, danger, danger-outline, ghost, link, icon × sm, md, touch; `mutates` + `pending` disable it while pending or offline | 130 raw buttons, 36 class sets, 6 BTN/INPUT constants, 27 mutating buttons that skipped the offline guard |
| `components/ui/badge.tsx` | `Badge`, `StatusBadge` (status → tone + icon + word; the word is `text` on the tint, so it passes 4.5:1) | 10 badge implementations |
| `components/ui/field.tsx` | `Field` (label, hint, error; id, `aria-describedby`, `aria-invalid`), `ErrorSummary` | uneven aria wiring, 0 error summaries |
| `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx` | the controls, reading `Field`'s wiring | |
| `components/ui/dropdown-menu.tsx` | Radix menu: APG keyboard, type-ahead, outside click | 7 hand-rolled menus |
| `components/ui/dialog.tsx` | `Dialog` with the discard guard (`dirty`), `ConfirmDialog` (alertdialog, the verb on the button) | 18 input dialogs without a guard |
| `components/ui/tabs.tsx`, `card.tsx`, `heading.tsx`, `notice.tsx`, `link.tsx` | `Tabs`, `Card`, `Heading` (page h1 / section h2 / card h3), `Notice` (status, or alert only when `announce`), `Link` (underlined in text), `NavItem` (current = weight + bar, not colour) | h1 at 20 and 15 px; role=alert on static text |
| `components/ui/data-table.tsx` | TanStack: density row height, column priority, truncation with title, right-aligned tabular numbers, server sort via `toApiSort` | 22 hand-written tables, rows 26–61 px |
| `components/ui/skeleton.tsx`, `empty-state.tsx`, `pager.tsx`, `toast.tsx` | `Skeleton`, `EmptyState` (first-use, no-results, no-permission, not-found, not-member, error), cursor `Pager`, `Toaster` + `toast()` | 13 private Skeletons |
| `lib/format.ts` | date, time, date-time, relative, number, percent, size, `plural()`; locale from `<html lang>` | 6 private date formatters, 17 inline number formats |
| `lib/problem-to-ui.ts` | the ui-spec's Error-UX matrix as code | 68 mutation fallback strings |
| `copy/en.ts` | the catalogue, `{area}.{screen}.{element}`, `t()` | 91 `*_COPY` objects |
| `tailwind.preset.ts` | every theme key a token; default scales removed | ~98 dead classes |
| `eslint.kit.js` | bans raw interactive elements outside `components/ui` and formatters outside `lib/format` | |

## Copying it in (the G6 skeleton task)

1. Dependencies, exact versions: `class-variance-authority`, `clsx`, `tailwind-merge`,
   `lucide-react`, `@radix-ui/react-slot`, `@radix-ui/react-dialog`,
   `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@tanstack/react-table`. Dev:
   `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`,
   `vitest`, `jsdom`.
2. Copy `components/ui/`, `lib/` and `copy/` under `src/`. Fix the import paths if the project's
   alias differs.
3. `tailwind.config.ts`: `presets: [kitPreset]`, and remove the project's own `theme` scales.
4. `eslint.config.js`: spread `eslint.kit.js` last. Move any existing `no-restricted-syntax`
   selectors into its `RESTRICT_EXTRA`, because ESLint replaces the rule's option list rather
   than merging it.
5. Fill `STATUS_TONE` in `badge.tsx` and `BY_TYPE` in `lib/problem-to-ui.ts` from the ui-spec.
   Add the screens' keys to `copy/en.ts`.
6. Run, and keep green: `vitest run` (the kit's own tests come with it, one file per
   primitive), `tsc --noEmit`, `eslint .`, `design-system.mjs classes`, `design-system.mjs
   kit-check`, `ui-inventory.mjs`, `copy-lint.mjs`.

Verified 2026-10-14 in a scratch project (React 19.1, Tailwind 3.4.17, Radix Dialog 1.1.15 /
DropdownMenu 2.1.16 / Tabs 1.1.13, TanStack Table 8.21.3): `tsc` clean, 33 tests pass, and
`classes` finds 0 dead classes.

## Rules the kit encodes

- One component per role. A variant is a prop, never a second component or a class string at the
  call site.
- Every interactive primitive defines hover, focus, pressed (`active:`), selected (`aria-pressed`,
  `data-[state]`, `aria-current`), disabled and loading (`aria-busy`) once; a screen never restyles
  them (`interaction-states.test.tsx`, and `tests/kit-states.test.mjs` in the bundle; §13.13).
- Sizes come from tokens only: `h-control-*`, `h-row`, `size-icon-*`, `max-w-dialog`. A class the
  preset does not define emits nothing, and `classes` fails it.
- The status word, the current nav item and an inline link are each marked by more than colour.
- `role="alert"` appears in two places only: `ErrorSummary` and `Notice announce`, both after a
  user action.
