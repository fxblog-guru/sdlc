---
doc: design-tokens
preset: clean-saas
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Clean SaaS

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

Neutral, quiet, content-first. Zinc greys, one indigo accent, generous whitespace, 8px corners. The look of Linear / Vercel-style tools.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** B2B SaaS and internal tools with moderate data density; products that need to look modern without a brand team; the default when nobody has a strong opinion
- **Not for:** screens that show 50+ rows at once — pick dense-enterprise; consumer apps that need warmth — pick friendly-consumer
- **App shell:** `sidebar` (see `docs/ui-patterns.md` §Shells) · **Density:** `comfortable`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui (Radix primitives + Tailwind) | copy-in components; theme via the CSS variables in tokens.css |
| nextjs | shadcn/ui (Radix primitives + Tailwind) | server components by default; Radix parts are client islands |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#ffffff` | `#09090b` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#18181b` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f4f4f5` | `#27272a` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#e4e4e7` | `#27272a` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#8e8e96` | `#71717a` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#18181b` | `#fafafa` | `--color-text` | body and headings |
| `color.text-muted` | `#5f5f68` | `#a1a1aa` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#4f46e5` | `#818cf8` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#4338ca` | `#a5b4fc` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#1e1b4b` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#15803d` | `#4ade80` | `--color-success` | success icons and accents |
| `color.warning` | `#a16207` | `#fbbf24` | `--color-warning` | warning icons and accents |
| `color.danger` | `#dc2626` | `#f87171` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#450a0a` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#2563eb` | `#60a5fa` | `--color-info` | informational icons and accents |
| `color.focus` | `#6366f1` | `#a5b4fc` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#e3f0e8` | `#213c2d` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f4ece1` | `#41361d` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#fbe5e5` | `#40282a` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#e5ecfd` | `#253143` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 17.72:1 ✓ | 19.06:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 17.72:1 ✓ | 16.97:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 16.12:1 ✓ | 14.27:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 6.32:1 ✓ | 7.76:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 6.32:1 ✓ | 6.91:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 6.29:1 ✓ | 5.36:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 7.90:1 ✓ | 8.02:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 6.29:1 ✓ | 6.67:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 4.83:1 ✓ | 7.19:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 4.83:1 ✓ | 5.84:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 5.02:1 ✓ | 11.42:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 4.92:1 ✓ | 11.92:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 5.17:1 ✓ | 7.83:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.25:1 ✓ | 4.12:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 4.47:1 ✓ | 9.98:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 15.10:1 ✓ | 11.50:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 4.27:1 ✓ | 6.89:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 15.13:1 ✓ | 11.37:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.20:1 ✓ | 7.11:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 14.71:1 ✓ | 12.94:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 4.01:1 ✓ | 4.88:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 14.97:1 ✓ | 12.58:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 4.37:1 ✓ | 5.17:1 ✓ |

## Typography

- **Sans:** `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` → `--font-sans`
- **Mono:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` → `--font-mono`
- **Body size:** `text.sm`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 12px | 1.5 | `--text-xs` · `--leading-xs` | badges, meta |
| `text.sm` | 14px | 1.5 | `--text-sm` · `--leading-sm` | body, table cells, inputs |
| `text.md` | 16px | 1.5 | `--text-md` · `--leading-md` | lead text, card titles |
| `text.lg` | 18px | 1.4 | `--text-lg` · `--leading-lg` | section headings (h3) |
| `text.xl` | 20px | 1.35 | `--text-xl` · `--leading-xl` | panel headings (h2) |
| `text.2xl` | 24px | 1.3 | `--text-2xl` · `--leading-2xl` | page title (h1) |
| `text.3xl` | 30px | 1.2 | `--text-3xl` · `--leading-3xl` | dashboard hero numbers |

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
| `type.display` | 36px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 28px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 22px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 18px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 14px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 12px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 13px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 14px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

## Neutral ramp

Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.

| Step | Value | CSS variable |
|---|---|---|
| `neutral.50` | `#fafafa` | `--neutral-50` |
| `neutral.100` | `#f4f4f5` | `--neutral-100` |
| `neutral.200` | `#e4e4e7` | `--neutral-200` |
| `neutral.300` | `#d4d4d8` | `--neutral-300` |
| `neutral.400` | `#a1a1aa` | `--neutral-400` |
| `neutral.500` | `#71717a` | `--neutral-500` |
| `neutral.600` | `#52525b` | `--neutral-600` |
| `neutral.700` | `#3f3f46` | `--neutral-700` |
| `neutral.800` | `#27272a` | `--neutral-800` |
| `neutral.900` | `#18181b` | `--neutral-900` |
| `neutral.950` | `#09090b` | `--neutral-950` |

## Status colours

Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 20 apart (checked):

| Pair | Light ΔE00 | Dark ΔE00 |
|---|---|---|
| `success` · `warning` | 40.2 | 37.9 |
| `success` · `danger` | 67.2 | 71.5 |
| `success` · `info` | 51.6 | 50.0 |
| `warning` · `danger` | 25.3 | 41.1 |
| `warning` · `info` | 54.2 | 55.5 |
| `danger` · `info` | 45.8 | 43.8 |

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

Set: **lucide**, stroke 1.75. Sizes: `icon.sm` 14px (`--icon-sm`) · `icon.md` 16px (`--icon-md`) · `icon.lg` 20px (`--icon-lg`).

## Density modes

`comfortable` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `comfortable` | 44px | 36px | 16px | 12px |
| `compact` | 36px | 32px | 12px | 8px |

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
| `radius.sm` | 4px | `--radius-sm` |
| `radius.md` | 6px | `--radius-md` |
| `radius.lg` | 8px | `--radius-lg` |
| `radius.xl` | 12px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `0 1px 2px rgb(0 0 0 / 0.05)` | `0 1px 2px rgb(0 0 0 / 0.4)` | `--shadow-1` |
| `shadow.2` | `0 4px 12px rgb(0 0 0 / 0.08)` | `0 4px 12px rgb(0 0 0 / 0.5)` | `--shadow-2` |
| `shadow.3` | `0 12px 32px rgb(0 0 0 / 0.12)` | `0 12px 32px rgb(0 0 0 / 0.6)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `120ms` | `--motion-fast` |
| `motion.base` | `180ms` | `--motion-base` |
| `motion.slow` | `280ms` | `--motion-slow` |
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
| `control.height-sm` | 32px | `--control-height-sm` |
| `control.height-md` | 36px | `--control-height-md` |
| `control.height-lg` | 44px | `--control-height-lg` |
| `control.row-height` | 44px | `--control-row-height` |
| `control.target-min` | 24px | `--control-target-min` |
| `control.sidebar-width` | 240px | `--control-sidebar-width` |
| `control.content-max` | 1200px | `--control-content-max` |

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
