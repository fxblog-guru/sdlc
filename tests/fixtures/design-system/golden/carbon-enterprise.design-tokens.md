---
doc: design-tokens
preset: carbon-enterprise
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Carbon Enterprise

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

IBM Carbon's White and Gray 100 themes: flat, square corners, IBM Plex, a strict 8px grid and blue 60 as the one accent. Enterprise software that has to be trusted.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** enterprise and regulated products: finance, insurance, government, healthcare admin; data-heavy desktop work where structure matters more than warmth; teams that want a complete, documented system to follow to the letter
- **Not for:** consumer products — it reads as corporate; products that must not resemble IBM software
- **App shell:** `topbar-sidebar` (see `docs/ui-patterns.md` §Shells) · **Density:** `comfortable`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.
- **Derived from:** IBM Carbon — @carbon/themes 11.82.0, themes white and g100 (npm, read 2026-09-30) — licence Apache-2.0 (https://github.com/carbon-design-system/carbon)
  - adapted: dark primary is link-primary #78a9ff with a dark foreground: Carbon keeps blue 60 buttons in g100, but one colour serves buttons and links here and #0f62fe is 3.6:1 on #161616
  - adapted: warning uses yellow 60 #8e6a00 / yellow 30 #f1c21b: Carbon's support-warning #f1c21b is 1.6:1 on white and relies on a dark icon outline
  - adapted: primary-hover #0050e6 is Carbon's button-primary-hover; danger-fg is text-on-color
  - adapted: type roles: heading-04 28px became h2 24px so every heading step keeps the 1.2 scale ratio this schema enforces

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui (Radix + Tailwind), themed with these tokens | @carbon/react (Apache-2.0) is the native kit if you want Carbon's components too — then these tokens are already inside it |
| nextjs | shadcn/ui (Radix + Tailwind), themed with these tokens | @carbon/react works in client components; its UI Shell maps to shell.topbar-sidebar |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#ffffff` | `#161616` | `--color-bg` | page background |
| `color.surface` | `#f4f4f4` | `#262626` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#e0e0e0` | `#393939` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#c6c6c6` | `#525252` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#8d8d8d` | `#8d8d8d` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#161616` | `#f4f4f4` | `--color-text` | body and headings |
| `color.text-muted` | `#525252` | `#c6c6c6` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#0f62fe` | `#78a9ff` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#0050e6` | `#a6c8ff` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#161616` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#24a148` | `#42be65` | `--color-success` | success icons and accents |
| `color.warning` | `#8e6a00` | `#f1c21b` | `--color-warning` | warning icons and accents |
| `color.danger` | `#da1e28` | `#fa4d56` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#161616` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#0043ce` | `#4589ff` | `--color-info` | informational icons and accents |
| `color.focus` | `#0f62fe` | `#ffffff` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#f2f9f4` | `#2b4131` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f8f6f0` | `#4b4224` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#fdf2f2` | `#4c2d2f` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#f0f4fc` | `#2c384d` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 18.10:1 ✓ | 16.45:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 16.45:1 ✓ | 13.76:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 13.71:1 ✓ | 10.50:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 7.81:1 ✓ | 10.59:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 7.10:1 ✓ | 8.86:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 5.00:1 ✓ | 7.68:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 6.38:1 ✓ | 10.62:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 5.00:1 ✓ | 7.68:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 5.00:1 ✓ | 5.40:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 5.00:1 ✓ | 5.40:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 3.35:1 ✓ | 7.57:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 4.99:1 ✓ | 10.75:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 7.79:1 ✓ | 5.41:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.32:1 ✓ | 5.45:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 5.00:1 ✓ | 18.10:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 16.92:1 ✓ | 10.03:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 3.13:1 ✓ | 4.62:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 16.74:1 ✓ | 9.08:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.61:1 ✓ | 5.93:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 16.51:1 ✓ | 11.08:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 4.56:1 ✓ | 3.63:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 16.42:1 ✓ | 10.73:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 7.07:1 ✓ | 3.53:1 ✓ |

## Typography

- **Sans:** `"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif` → `--font-sans`
- **Mono:** `"IBM Plex Mono", Menlo, "DejaVu Sans Mono", Courier, monospace` → `--font-mono`
- **Body size:** `text.sm`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 12px | 1.34 | `--text-xs` · `--leading-xs` | label-01, helper text |
| `text.sm` | 14px | 1.43 | `--text-sm` · `--leading-sm` | body-01, table cells, inputs |
| `text.md` | 16px | 1.5 | `--text-md` · `--leading-md` | body-02 |
| `text.lg` | 20px | 1.4 | `--text-lg` · `--leading-lg` | heading-03 |
| `text.xl` | 28px | 1.29 | `--text-xl` · `--leading-xl` | heading-04 |
| `text.2xl` | 32px | 1.25 | `--text-2xl` · `--leading-2xl` | heading-05, page title |
| `text.3xl` | 42px | 1.19 | `--text-3xl` · `--leading-3xl` | heading-06, display |

| Weight token | Value |
|---|---|
| `weight.regular` | 400 |
| `weight.medium` | 500 |
| `weight.semibold` | 600 |
| `weight.bold` | 600 |

## Type roles

Scale ratio 1.2 (each heading step at least 1.2× the one below, checked). Use the role, not a size:
a page title is `h1`, never "the 24px one".

| Role | Size | Line height | Weight | Tracking | CSS variables |
|---|---|---|---|---|---|
| `type.display` | 42px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 32px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 24px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 20px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 14px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 12px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 14px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 14px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

## Neutral ramp

Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.

| Step | Value | CSS variable |
|---|---|---|
| `neutral.50` | `#f4f4f4` | `--neutral-50` |
| `neutral.100` | `#e0e0e0` | `--neutral-100` |
| `neutral.200` | `#c6c6c6` | `--neutral-200` |
| `neutral.300` | `#a8a8a8` | `--neutral-300` |
| `neutral.400` | `#8d8d8d` | `--neutral-400` |
| `neutral.500` | `#6f6f6f` | `--neutral-500` |
| `neutral.600` | `#525252` | `--neutral-600` |
| `neutral.700` | `#393939` | `--neutral-700` |
| `neutral.800` | `#262626` | `--neutral-800` |
| `neutral.900` | `#161616` | `--neutral-900` |
| `neutral.950` | `#0b0b0b` | `--neutral-950` |

## Status colours

Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 20 apart (checked):

| Pair | Light ΔE00 | Dark ΔE00 |
|---|---|---|
| `success` · `warning` | 34.3 | 34.5 |
| `success` · `danger` | 72.7 | 73.9 |
| `success` · `info` | 59.5 | 53.6 |
| `warning` · `danger` | 35.3 | 48.2 |
| `warning` · `info` | 61.0 | 64.3 |
| `danger` · `info` | 45.4 | 44.5 |

## Data visualisation

Series colours in fixed order; a ninth series folds into "Other". Never reuse a status colour for a series.

| Series | Light | Dark | CSS variable |
|---|---|---|---|
| 1 | `#2a78d6` | `#3987e5` | `--dataviz-1` |
| 2 | `#eb6834` | `#d95926` | `--dataviz-2` |
| 3 | `#1baf7a` | `#199e70` | `--dataviz-3` |
| 4 | `#eda100` | `#c98500` | `--dataviz-4` |
| 5 | `#e87ba4` | `#d55181` | `--dataviz-5` |
| 6 | `#008300` | `#008300` | `--dataviz-6` |
| 7 | `#6250d6` | `#9085e9` | `--dataviz-7` |
| 8 | `#e34948` | `#e66767` | `--dataviz-8` |

## Icons

Set: **@carbon/icons (or lucide)**, stroke 1.5. Sizes: `icon.sm` 16px (`--icon-sm`) · `icon.md` 20px (`--icon-md`) · `icon.lg` 24px (`--icon-lg`).

## Density modes

`comfortable` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `comfortable` | 48px | 40px | 16px | 12px |
| `compact` | 32px | 32px | 16px | 6px |

Kit base: **radix-themes** — control heights and radius at or above the kit's own (checked).

## Spacing

One scale for padding, gap and margin. A value between two steps is a design question, not a
reason to write a raw px.

| Token | Value | CSS variable |
|---|---|---|
| `space.0` | 0px | `--space-0` |
| `space.1` | 2px | `--space-1` |
| `space.2` | 4px | `--space-2` |
| `space.3` | 8px | `--space-3` |
| `space.4` | 12px | `--space-4` |
| `space.5` | 16px | `--space-5` |
| `space.6` | 24px | `--space-6` |
| `space.7` | 32px | `--space-7` |
| `space.8` | 40px | `--space-8` |
| `space.9` | 48px | `--space-9` |
| `space.10` | 64px | `--space-10` |

## Radius

| Token | Value | CSS variable |
|---|---|---|
| `radius.none` | 0px | `--radius-none` |
| `radius.sm` | 0px | `--radius-sm` |
| `radius.md` | 0px | `--radius-md` |
| `radius.lg` | 0px | `--radius-lg` |
| `radius.xl` | 0px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `none` | `none` | `--shadow-1` |
| `shadow.2` | `0 2px 6px rgb(0 0 0 / 0.3)` | `0 2px 6px rgb(0 0 0 / 0.8)` | `--shadow-2` |
| `shadow.3` | `0 2px 6px rgb(0 0 0 / 0.3)` | `0 2px 6px rgb(0 0 0 / 0.8)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `110ms` | `--motion-fast` |
| `motion.base` | `150ms` | `--motion-base` |
| `motion.slow` | `240ms` | `--motion-slow` |
| `motion.easing` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | `--motion-easing` |

## Breakpoints

Media queries cannot read CSS variables, so these are the one place a px value is written in
code — in the breakpoint config, and nowhere else.

| Token | Min width |
|---|---|
| `bp.sm` | 320px |
| `bp.md` | 672px |
| `bp.lg` | 1056px |
| `bp.xl` | 1312px |
| `bp.2xl` | 1584px |

## Controls and density

| Token | Value | CSS variable |
|---|---|---|
| `control.height-sm` | 32px | `--control-height-sm` |
| `control.height-md` | 40px | `--control-height-md` |
| `control.height-lg` | 48px | `--control-height-lg` |
| `control.row-height` | 48px | `--control-row-height` |
| `control.target-min` | 24px | `--control-target-min` |
| `control.sidebar-width` | 256px | `--control-sidebar-width` |
| `control.content-max` | 1584px | `--control-content-max` |

## Wiring

`tokens.css` was written to `tokens.css`. Import it once at the app root. With Tailwind,
map the theme to the variables instead of to values, so the classes stay token-bound:

```js
// tailwind.config — theme.extend
colors: { bg: "var(--color-bg)", surface: "var(--color-surface)", text: "var(--color-text)",
          muted: "var(--color-text-muted)", primary: { DEFAULT: "var(--color-primary)", fg: "var(--color-primary-fg)" },
          border: "var(--color-border)", danger: "var(--color-danger)" /* …every role, extra_roles too */ },
spacing: { 0: "var(--space-0)", 1: "var(--space-1)", 2: "var(--space-2)" /* …every step */ },
borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
```

`node dev/scripts/design-system.mjs scan <src>` lists every hard-coded colour and px in UI source —
G7 runs it, and a hit is a finding unless the line carries `tokens-ok: <reason>`.
