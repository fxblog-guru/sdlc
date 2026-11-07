# Build from the kit, and let the lint hold it

Read by `dev-writing-react-code` at G7. The kit is `dev-defining-design-system/kit/`: its README
lists every primitive and how a project copies it in (DEV-CONTRACTS §13.3).

Evidence: release-management (2026-10-13). shadcn and TanStack Table were named, and
`components/ui` held five files. There were 130 raw buttons in 36 class sets, 7 hand-rolled menus,
13 private Skeletons, 6 private date formatters and about 98 classes that emitted no CSS. Every gate
was green, because no check looked for a second implementation.

## Before the first screen task

The G6 plan's first UI task copies the kit into the project (kit README, "Copying it in"). If
`components/ui` has no `button.tsx` when you reach a screen task, stop. That is a finding against
G6, not a reason to hand-build a button.

## The ESLint fragment

`kit/eslint.kit.js` is a flat-config fragment. Spread it last in `eslint.config.js`:

```js
import kit, { RESTRICT_EXTRA } from './eslint.kit.js';
RESTRICT_EXTRA.push(...existingRestrictedSyntaxSelectors); // ESLint replaces the rule's options; it does not merge them
export default tseslint.config(/* the project's config */, ...kit);
```

| Outside | Banned | Use |
|---|---|---|
| `components/ui` | `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` | `Button`, `Input`, `Checkbox`, `Select`, `Textarea`, `DataTable` |
| `components/ui` | `role="menu"`, `menuitem`, `listbox`, `tablist`, `dialog`, `alertdialog` | `DropdownMenu`, `Tabs`, `Dialog` (Radix) |
| everywhere | `const BTN = …`, `INPUT`, `BADGE`, `CHIP` class constants | the component's variant prop |
| `lib/format` | `getUTC*()`, `toLocale*String()`, `new Intl.DateTimeFormat / NumberFormat / RelativeTimeFormat`, `.slice(0, 10 / 16 / 19)`, `.toFixed()` | `formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatNumber`, `formatPercent`, `formatSize` |

A real need for an exception (a third-party widget that renders its own `<table>`) gets an
`eslint-disable-next-line no-restricted-syntax -- <reason>` and a row under the change summary's
`## Deviations from the plan`.

## The checks G7 runs, and the reviewer re-runs

```bash
npx eslint .                                                              # the fragment above
node <root>/scripts/design-system.mjs classes --project <web>                # a class that emits no rule; arbitrary values without tokens-ok
node <root>/scripts/design-system.mjs kit-check --project <web> --spec <root>/ui/<slug>/ui-spec.md
node <root>/scripts/ui-inventory.mjs --project <web> --slug <slug>           # writes <root>/ui/<slug>/components.md
node <root>/scripts/copy-lint.mjs --project <web>                            # catalogue, literals, glossary
node <root>/scripts/ui-consistency.mjs --url <name>=<url> … --declare <the spec's deviations>
```

Each exits non-zero on a finding. A finding is fixed or recorded as a deviation with a reason.

## Interaction rules the review greps for

- Every dialog with an input passes `dirty` to the kit's `Dialog`, so the discard guard asks
  first.
- Every form is `noValidate`, validates on blur, and on a failed submit renders `ErrorSummary`
  above the fields.
- Every action that changes server state is `<Button mutates pending={…}>`, which is disabled while
  pending and while offline.
- Every menu is the kit's `DropdownMenu`.
- `role="alert"` appears only where a user action produced the content: `ErrorSummary`,
  `Notice announce`. Text present on load is `role="status"`, or nothing.
- Errors render through `problemToUi()`. No screen switches on `problem.type`.
