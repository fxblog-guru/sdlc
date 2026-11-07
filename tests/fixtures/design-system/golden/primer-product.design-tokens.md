---
doc: design-tokens
preset: primer-product
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Primer Product

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

GitHub's Primer palette and scale: cool greys, accent blue, system fonts, 6px corners, 14px body. Familiar to anyone who uses developer tools.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** developer tools, internal platforms, code-adjacent products; teams that want a proven, widely-recognised system with no brand work; products used alongside GitHub, where the resemblance helps rather than confuses
- **Not for:** customer-facing products that must not look like GitHub; consumer audiences — pick friendly-consumer
- **App shell:** `topbar-sidebar` (see `docs/ui-patterns.md` §Shells) · **Density:** `comfortable`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.
- **Derived from:** GitHub Primer — @primer/primitives functional themes light.css / dark.css (unpkg, fetched 2026-09-30) — licence MIT (https://github.com/primer/primitives)
  - adapted: primary is Primer's accent blue (bgColor-accent-emphasis / fgColor-accent), not its green primary button — one colour serves buttons and links here
  - adapted: primary-hover light #0550ae (Primer blue-6); dark primary-fg is the canvas colour so it passes on #4493f8
  - adapted: border-strong uses a darker grey than Primer's control border (#d1d9e0, 1.4:1) so input edges meet WCAG 1.4.11

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui (Radix + Tailwind), themed with these tokens | Primer React (@primer/react, MIT) is the native kit if you want GitHub's components as well as its colours |
| nextjs | shadcn/ui (Radix + Tailwind), themed with these tokens | Primer React needs client components; shadcn keeps server components simple |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#ffffff` | `#0d1117` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#151b23` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f6f8fa` | `#212830` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#d1d9e0` | `#3d444d` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#818b98` | `#768390` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#1f2328` | `#f0f6fc` | `--color-text` | body and headings |
| `color.text-muted` | `#59636e` | `#9198a1` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#0969da` | `#4493f8` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#0550ae` | `#6cb6ff` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#0d1117` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#1a7f37` | `#3fb950` | `--color-success` | success icons and accents |
| `color.warning` | `#9a6700` | `#d29922` | `--color-warning` | warning icons and accents |
| `color.danger` | `#d1242f` | `#f85149` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#0d1117` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#0969da` | `#4493f8` | `--color-info` | informational icons and accents |
| `color.focus` | `#0969da` | `#1f6feb` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#e4f0e7` | `#1d372b` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f3ede0` | `#373223` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#f9e5e6` | `#3e252a` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#e1edfb` | `#1d3149` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 15.80:1 ✓ | 17.39:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 15.80:1 ✓ | 15.91:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 14.84:1 ✓ | 13.67:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 6.11:1 ✓ | 6.50:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 6.11:1 ✓ | 5.94:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 5.19:1 ✓ | 6.11:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 7.59:1 ✓ | 8.81:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 5.19:1 ✓ | 6.11:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 5.24:1 ✓ | 5.65:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 5.24:1 ✓ | 5.65:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 5.08:1 ✓ | 7.45:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 4.87:1 ✓ | 7.50:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 5.19:1 ✓ | 6.11:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.45:1 ✓ | 4.88:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 5.19:1 ✓ | 4.08:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 13.48:1 ✓ | 11.81:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 4.33:1 ✓ | 5.06:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 13.54:1 ✓ | 11.74:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.17:1 ✓ | 5.06:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 13.07:1 ✓ | 12.84:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 4.34:1 ✓ | 4.17:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 13.32:1 ✓ | 12.15:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 4.38:1 ✓ | 4.27:1 ✓ |

## Typography

- **Sans:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif` → `--font-sans`
- **Mono:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` → `--font-mono`
- **Body size:** `text.sm`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 12px | 1.5 | `--text-xs` · `--leading-xs` | labels, counters |
| `text.sm` | 14px | 1.5 | `--text-sm` · `--leading-sm` | body, table cells, inputs |
| `text.md` | 16px | 1.5 | `--text-md` · `--leading-md` | lead text |
| `text.lg` | 20px | 1.4 | `--text-lg` · `--leading-lg` | section headings (h3) |
| `text.xl` | 24px | 1.3 | `--text-xl` · `--leading-xl` | page headings (h2) |
| `text.2xl` | 32px | 1.25 | `--text-2xl` · `--leading-2xl` | page title (h1) |
| `text.3xl` | 40px | 1.2 | `--text-3xl` · `--leading-3xl` | display |

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
| `type.h2` | 24px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 20px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 14px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 12px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 13px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 14px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

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
| `success` · `warning` | 35.8 | 36.5 |
| `success` · `danger` | 67.6 | 71.7 |
| `success` · `info` | 51.5 | 54.8 |
| `warning` · `danger` | 31.2 | 34.6 |
| `warning` · `info` | 54.1 | 54.8 |
| `danger` · `info` | 44.9 | 46.8 |

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

Set: **octicons (or lucide)**, stroke 1.5. Sizes: `icon.sm` 12px (`--icon-sm`) · `icon.md` 16px (`--icon-md`) · `icon.lg` 24px (`--icon-lg`).

## Density modes

`comfortable` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `comfortable` | 40px | 32px | 16px | 8px |
| `compact` | 32px | 28px | 8px | 4px |

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
| `radius.sm` | 3px | `--radius-sm` |
| `radius.md` | 6px | `--radius-md` |
| `radius.lg` | 6px | `--radius-lg` |
| `radius.xl` | 12px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `0 1px 1px rgb(31 35 40 / 0.04)` | `0 0 transparent` | `--shadow-1` |
| `shadow.2` | `0 3px 6px rgb(140 149 159 / 0.15)` | `0 3px 6px rgb(1 4 9 / 0.8)` | `--shadow-2` |
| `shadow.3` | `0 8px 24px rgb(140 149 159 / 0.20)` | `0 8px 24px rgb(1 4 9 / 0.8)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `80ms` | `--motion-fast` |
| `motion.base` | `160ms` | `--motion-base` |
| `motion.slow` | `240ms` | `--motion-slow` |
| `motion.easing` | `cubic-bezier(0.33, 1, 0.68, 1)` | `--motion-easing` |

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
| `control.height-sm` | 28px | `--control-height-sm` |
| `control.height-md` | 32px | `--control-height-md` |
| `control.height-lg` | 40px | `--control-height-lg` |
| `control.row-height` | 40px | `--control-row-height` |
| `control.target-min` | 24px | `--control-target-min` |
| `control.sidebar-width` | 256px | `--control-sidebar-width` |
| `control.content-max` | 1280px | `--control-content-max` |

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
