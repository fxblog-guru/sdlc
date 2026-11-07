---
doc: design-tokens
preset: field-mobile
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Field Mobile

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

Phone-first and outdoor-legible. Near-black on white, deep teal accent, 17px body, 48px targets, bottom tab bar, system fonts for offline speed.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** technicians, drivers, warehouse and on-site staff; one-handed use, gloves, bright sunlight, poor signal; PWAs and React Native-parity web views
- **Not for:** desktop analytics or bulk editing; marketing sites
- **App shell:** `bottom-tabs` (see `docs/ui-patterns.md` §Shells) · **Density:** `touch`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui (Radix) with the touch control sizes from this file | Vaul for bottom sheets; never a hover-only affordance |
| nextjs | shadcn/ui (Radix) with the touch control sizes from this file | offline shell via a service worker; the offline state is designed, not assumed away |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#ffffff` | `#000000` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#121416` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f1f3f5` | `#1e2124` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#dee2e6` | `#2b2f33` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#6c757d` | `#868e96` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#0b0d0f` | `#f8f9fa` | `--color-text` | body and headings |
| `color.text-muted` | `#495057` | `#b4bcc4` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#0f766e` | `#2dd4bf` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#115e59` | `#5eead4` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#022c28` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#15803d` | `#4ade80` | `--color-success` | success icons and accents |
| `color.warning` | `#a16207` | `#fbbf24` | `--color-warning` | warning icons and accents |
| `color.danger` | `#c62828` | `#ff6b6b` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#2a0000` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#1565c0` | `#64b5f6` | `--color-info` | informational icons and accents |
| `color.focus` | `#0b0d0f` | `#f8f9fa` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#e3f0e8` | `#1c3829` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f4ece1` | `#3c3319` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#f8e5e5` | `#3d2425` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#e3edf7` | `#21313e` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 19.47:1 ✓ | 19.92:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 19.47:1 ✓ | 17.52:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 17.50:1 ✓ | 15.35:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 8.18:1 ✓ | 10.93:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 8.18:1 ✓ | 9.61:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 5.47:1 ✓ | 8.10:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 7.58:1 ✓ | 10.19:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 5.47:1 ✓ | 11.28:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 5.62:1 ✓ | 7.57:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 5.62:1 ✓ | 6.89:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 5.02:1 ✓ | 12.05:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 4.92:1 ✓ | 12.58:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 5.75:1 ✓ | 9.48:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 4.69:1 ✓ | 6.32:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 19.47:1 ✓ | 19.92:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 16.59:1 ✓ | 12.10:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 4.27:1 ✓ | 7.32:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 16.62:1 ✓ | 11.86:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.20:1 ✓ | 7.49:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 16.07:1 ✓ | 13.48:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 4.64:1 ✓ | 5.12:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 16.43:1 ✓ | 12.66:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 4.85:1 ✓ | 6.03:1 ✓ |

## Typography

- **Sans:** `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` → `--font-sans`
- **Mono:** `ui-monospace, Menlo, Consolas, monospace` → `--font-mono`
- **Body size:** `text.md`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 13px | 1.4 | `--text-xs` · `--leading-xs` | meta only — never an action label |
| `text.sm` | 15px | 1.45 | `--text-sm` · `--leading-sm` | secondary text |
| `text.md` | 17px | 1.5 | `--text-md` · `--leading-md` | body, inputs, list rows |
| `text.lg` | 19px | 1.4 | `--text-lg` · `--leading-lg` | card titles |
| `text.xl` | 22px | 1.3 | `--text-xl` · `--leading-xl` | screen title (h1) |
| `text.2xl` | 26px | 1.25 | `--text-2xl` · `--leading-2xl` | status headline |
| `text.3xl` | 32px | 1.2 | `--text-3xl` · `--leading-3xl` | big numbers, timers |

| Weight token | Value |
|---|---|
| `weight.regular` | 400 |
| `weight.medium` | 500 |
| `weight.semibold` | 600 |
| `weight.bold` | 700 |

## Type roles

Scale ratio 1.2 (each heading step at least 1.2× the one below, checked). Use the role, not a size:
a page title is `h1`, never "the 24px one".

| Role | Size | Line height | Weight | Tracking | CSS variables |
|---|---|---|---|---|---|
| `type.display` | 40px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 32px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 26px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 21px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 17px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 15px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 15px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 17px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

## Neutral ramp

Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.

| Step | Value | CSS variable |
|---|---|---|
| `neutral.50` | `#f9fafb` | `--neutral-50` |
| `neutral.100` | `#f3f4f6` | `--neutral-100` |
| `neutral.200` | `#e5e7eb` | `--neutral-200` |
| `neutral.300` | `#d1d5db` | `--neutral-300` |
| `neutral.400` | `#9ca3af` | `--neutral-400` |
| `neutral.500` | `#6b7280` | `--neutral-500` |
| `neutral.600` | `#4b5563` | `--neutral-600` |
| `neutral.700` | `#374151` | `--neutral-700` |
| `neutral.800` | `#1f2937` | `--neutral-800` |
| `neutral.900` | `#111827` | `--neutral-900` |
| `neutral.950` | `#030712` | `--neutral-950` |

## Status colours

Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 20 apart (checked):

| Pair | Light ΔE00 | Dark ΔE00 |
|---|---|---|
| `success` · `warning` | 40.2 | 37.9 |
| `success` · `danger` | 65.6 | 73.2 |
| `success` · `info` | 48.3 | 46.6 |
| `warning` · `danger` | 25.1 | 41.6 |
| `warning` · `info` | 50.1 | 58.7 |
| `danger` · `info` | 44.8 | 48.6 |

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

Set: **lucide**, stroke 2. Sizes: `icon.sm` 16px (`--icon-sm`) · `icon.md` 20px (`--icon-md`) · `icon.lg` 24px (`--icon-lg`).

## Density modes

`touch` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `touch` | 64px | 48px | 16px | 16px |
| `comfortable` | 52px | 48px | 16px | 12px |

Kit base: **shadcn-new-york** — control heights and radius at or above the kit's own (checked).

## Spacing

One scale for padding, gap and margin. A value between two steps is a design question, not a
reason to write a raw px.

| Token | Value | CSS variable |
|---|---|---|
| `space.0` | 0px | `--space-0` |
| `space.1` | 4px | `--space-1` |
| `space.2` | 8px | `--space-2` |
| `space.3` | 12px | `--space-3` |
| `space.4` | 16px | `--space-4` |
| `space.5` | 20px | `--space-5` |
| `space.6` | 24px | `--space-6` |
| `space.7` | 32px | `--space-7` |
| `space.8` | 40px | `--space-8` |
| `space.9` | 48px | `--space-9` |
| `space.10` | 64px | `--space-10` |

## Radius

| Token | Value | CSS variable |
|---|---|---|
| `radius.none` | 0px | `--radius-none` |
| `radius.sm` | 6px | `--radius-sm` |
| `radius.md` | 8px | `--radius-md` |
| `radius.lg` | 10px | `--radius-lg` |
| `radius.xl` | 16px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `0 1px 2px rgb(0 0 0 / 0.10)` | `0 1px 2px rgb(0 0 0 / 0.6)` | `--shadow-1` |
| `shadow.2` | `0 4px 12px rgb(0 0 0 / 0.14)` | `0 4px 12px rgb(0 0 0 / 0.7)` | `--shadow-2` |
| `shadow.3` | `0 -4px 24px rgb(0 0 0 / 0.18)` | `0 -4px 24px rgb(0 0 0 / 0.8)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `100ms` | `--motion-fast` |
| `motion.base` | `200ms` | `--motion-base` |
| `motion.slow` | `300ms` | `--motion-slow` |
| `motion.easing` | `cubic-bezier(0.2, 0, 0, 1)` | `--motion-easing` |

## Breakpoints

Media queries cannot read CSS variables, so these are the one place a px value is written in
code — in the breakpoint config, and nowhere else.

| Token | Min width |
|---|---|
| `bp.sm` | 360px |
| `bp.md` | 768px |
| `bp.lg` | 1024px |
| `bp.xl` | 1280px |
| `bp.2xl` | 1536px |

## Controls and density

| Token | Value | CSS variable |
|---|---|---|
| `control.height-sm` | 40px | `--control-height-sm` |
| `control.height-md` | 48px | `--control-height-md` |
| `control.height-lg` | 56px | `--control-height-lg` |
| `control.row-height` | 64px | `--control-row-height` |
| `control.target-min` | 48px | `--control-target-min` |
| `control.sidebar-width` | 280px | `--control-sidebar-width` |
| `control.content-max` | 720px | `--control-content-max` |

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
