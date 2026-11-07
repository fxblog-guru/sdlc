---
doc: design-tokens
preset: editorial
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Editorial

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

Reading-first. Serif headings over a humanist sans, ink-blue accent, wide measure, 2px corners, almost no shadow. For content, docs and marketing surfaces.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** marketing and landing pages; documentation, knowledge bases, help centres; report and long-form reading views
- **Not for:** app screens with dense controls — pair with clean-saas for the app instead
- **App shell:** `topnav` (see `docs/ui-patterns.md` §Shells) · **Density:** `spacious`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui (Radix) + @tailwindcss/typography | prose styles bound to the text.* and color.* tokens |
| nextjs | shadcn/ui (Radix) + @tailwindcss/typography + MDX | static by default; pages are server components |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#fdfcfa` | `#121110` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#1b1a18` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f4f1ec` | `#262421` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#e6e1d8` | `#2e2b27` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#8a8378` | `#857e74` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#1a1a1a` | `#ece8e1` | `--color-text` | body and headings |
| `color.text-muted` | `#5a554d` | `#aaa396` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#1f4e79` | `#8fb8de` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#163a5a` | `#b3d0ea` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#0d1f30` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#2e7d32` | `#81c784` | `--color-success` | success icons and accents |
| `color.warning` | `#a15c07` | `#f0b35a` | `--color-warning` | warning icons and accents |
| `color.danger` | `#b3261e` | `#f28b82` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#2b0a07` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#1f4e79` | `#8fb8de` | `--color-info` | informational icons and accents |
| `color.focus` | `#1f4e79` | `#b3d0ea` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#e6efe6` | `#2d392b` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f4ebe1` | `#413624` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#f6e5e4` | `#422e2b` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#e4eaef` | `#30363c` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 16.97:1 ✓ | 15.45:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 17.40:1 ✓ | 14.24:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 15.45:1 ✓ | 12.67:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 7.21:1 ✓ | 7.53:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 7.39:1 ✓ | 6.95:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 8.66:1 ✓ | 8.03:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 11.75:1 ✓ | 10.45:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 8.45:1 ✓ | 9.05:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 6.37:1 ✓ | 7.90:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 6.54:1 ✓ | 7.65:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 5.00:1 ✓ | 9.37:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 5.06:1 ✓ | 10.15:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 8.45:1 ✓ | 9.05:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.66:1 ✓ | 4.70:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 8.45:1 ✓ | 11.79:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 14.80:1 ✓ | 9.93:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 4.36:1 ✓ | 6.03:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 14.77:1 ✓ | 9.67:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.40:1 ✓ | 6.36:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 14.29:1 ✓ | 10.38:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 5.37:1 ✓ | 5.30:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 14.35:1 ✓ | 10.01:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 7.14:1 ✓ | 5.86:1 ✓ |

## Typography

- **Sans:** `"Source Sans 3", ui-sans-serif, system-ui, sans-serif` → `--font-sans`
- **Display:** `"Source Serif 4", Georgia, "Times New Roman", serif` → `--font-display` (headings only)
- **Mono:** `"Source Code Pro", ui-monospace, Menlo, monospace` → `--font-mono`
- **Body size:** `text.md`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 13px | 1.5 | `--text-xs` · `--leading-xs` | captions, footnotes |
| `text.sm` | 15px | 1.6 | `--text-sm` · `--leading-sm` | secondary text, nav |
| `text.md` | 18px | 1.7 | `--text-md` · `--leading-md` | body copy — 60–75 characters per line |
| `text.lg` | 21px | 1.5 | `--text-lg` · `--leading-lg` | lead paragraph |
| `text.xl` | 26px | 1.3 | `--text-xl` · `--leading-xl` | h2 (display font) |
| `text.2xl` | 34px | 1.2 | `--text-2xl` · `--leading-2xl` | h1 (display font) |
| `text.3xl` | 48px | 1.1 | `--text-3xl` · `--leading-3xl` | hero headline (display font) |

| Weight token | Value |
|---|---|
| `weight.regular` | 400 |
| `weight.medium` | 500 |
| `weight.semibold` | 600 |
| `weight.bold` | 700 |

## Type roles

Scale ratio 1.25 (each heading step at least 1.2× the one below, checked). Use the role, not a size:
a page title is `h1`, never "the 24px one".

| Role | Size | Line height | Weight | Tracking | CSS variables |
|---|---|---|---|---|---|
| `type.display` | 48px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 38px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 30px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 24px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 18px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 15px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 15px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 18px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

## Neutral ramp

Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.

| Step | Value | CSS variable |
|---|---|---|
| `neutral.50` | `#fafaf9` | `--neutral-50` |
| `neutral.100` | `#f5f5f4` | `--neutral-100` |
| `neutral.200` | `#e7e5e4` | `--neutral-200` |
| `neutral.300` | `#d6d3d1` | `--neutral-300` |
| `neutral.400` | `#a8a29e` | `--neutral-400` |
| `neutral.500` | `#78716c` | `--neutral-500` |
| `neutral.600` | `#57534e` | `--neutral-600` |
| `neutral.700` | `#44403c` | `--neutral-700` |
| `neutral.800` | `#292524` | `--neutral-800` |
| `neutral.900` | `#1c1917` | `--neutral-900` |
| `neutral.950` | `#0c0a09` | `--neutral-950` |

## Status colours

Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 20 apart (checked):

| Pair | Light ΔE00 | Dark ΔE00 |
|---|---|---|
| `success` · `warning` | 40.4 | 33.1 |
| `success` · `danger` | 61.2 | 53.2 |
| `success` · `info` | 44.5 | 36.9 |
| `warning` · `danger` | 21.2 | 27.1 |
| `warning` · `info` | 44.2 | 40.7 |
| `danger` · `info` | 42.7 | 38.6 |

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

Set: **lucide**, stroke 1.5. Sizes: `icon.sm` 16px (`--icon-sm`) · `icon.md` 18px (`--icon-md`) · `icon.lg` 24px (`--icon-lg`).

## Density modes

`spacious` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `spacious` | 52px | 44px | 20px | 16px |
| `comfortable` | 44px | 40px | 16px | 12px |

Kit base: **radix-themes** — control heights and radius at or above the kit's own (checked).

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
| `space.5` | 24px | `--space-5` |
| `space.6` | 32px | `--space-6` |
| `space.7` | 48px | `--space-7` |
| `space.8` | 64px | `--space-8` |
| `space.9` | 96px | `--space-9` |
| `space.10` | 128px | `--space-10` |

## Radius

| Token | Value | CSS variable |
|---|---|---|
| `radius.none` | 0px | `--radius-none` |
| `radius.sm` | 2px | `--radius-sm` |
| `radius.md` | 2px | `--radius-md` |
| `radius.lg` | 4px | `--radius-lg` |
| `radius.xl` | 8px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `none` | `none` | `--shadow-1` |
| `shadow.2` | `0 1px 3px rgb(26 26 26 / 0.08)` | `0 1px 3px rgb(0 0 0 / 0.5)` | `--shadow-2` |
| `shadow.3` | `0 8px 24px rgb(26 26 26 / 0.10)` | `0 8px 24px rgb(0 0 0 / 0.6)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `120ms` | `--motion-fast` |
| `motion.base` | `200ms` | `--motion-base` |
| `motion.slow` | `400ms` | `--motion-slow` |
| `motion.easing` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | `--motion-easing` |

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
| `control.height-sm` | 36px | `--control-height-sm` |
| `control.height-md` | 44px | `--control-height-md` |
| `control.height-lg` | 52px | `--control-height-lg` |
| `control.row-height` | 52px | `--control-row-height` |
| `control.target-min` | 24px | `--control-target-min` |
| `control.sidebar-width` | 260px | `--control-sidebar-width` |
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
