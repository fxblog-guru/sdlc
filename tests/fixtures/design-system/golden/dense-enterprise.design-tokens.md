---
doc: design-tokens
preset: dense-enterprise
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Dense Enterprise

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

Information-dense operations UI. Slate greys, strong blue, 13px body, 32px rows, 4px corners, top bar plus sidebar. Built for people who work in tables all day.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** back-office, scheduling, dispatch, finance, admin consoles; power users on desktop who compare many rows at once; products replacing a spreadsheet
- **Not for:** first-time or occasional users; touch-first or phone-first use — pick field-mobile
- **App shell:** `topbar-sidebar` (see `docs/ui-patterns.md` §Shells) · **Density:** `compact`
- **Themes:** light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)
- **Scrim** (overlay behind a dialog): `--color-scrim` — light `rgba(9, 9, 11, 0.45)`, dark `rgba(0, 0, 0, 0.6)`. Never the text colour at an opacity.

## Kit

Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec
names the kit component it rejected and why.

| Stack | Kit | Notes |
|---|---|---|
| react | shadcn/ui + TanStack Table | data grid from TanStack Table (virtualised); alternative: Ant Design / MUI X Data Grid where a full grid kit is wanted |
| nextjs | shadcn/ui + TanStack Table | grid is a client island; filters live in the URL so a view is shareable |

## Colour

| Token | Light | Dark | CSS variable | Use for |
|---|---|---|---|---|
| `color.bg` | `#f8fafc` | `#0b1220` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#111a2e` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f1f5f9` | `#1a2540` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#e2e8f0` | `#1e2a44` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#8391a7` | `#64748b` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#0f172a` | `#e2e8f0` | `--color-text` | body and headings |
| `color.text-muted` | `#526077` | `#94a3b8` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#1d4ed8` | `#60a5fa` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#1e40af` | `#93c5fd` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#0b1220` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#15803d` | `#4ade80` | `--color-success` | success icons and accents |
| `color.warning` | `#a16207` | `#fbbf24` | `--color-warning` | warning icons and accents |
| `color.danger` | `#b91c1c` | `#f87171` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#1f0707` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#0369a1` | `#38bdf8` | `--color-info` | informational icons and accents |
| `color.focus` | `#2563eb` | `#93c5fd` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#e3f0e8` | `#1b3d3d` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#f4ece1` | `#3b382c` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#f7e4e4` | `#3b2a3a` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#e1edf4` | `#183752` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 17.06:1 ✓ | 15.19:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 17.85:1 ✓ | 14.07:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 16.30:1 ✓ | 12.32:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 6.09:1 ✓ | 7.30:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 6.37:1 ✓ | 6.76:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 6.70:1 ✓ | 7.36:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 8.72:1 ✓ | 10.38:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 6.41:1 ✓ | 7.36:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 6.18:1 ✓ | 6.77:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 6.47:1 ✓ | 6.95:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 4.79:1 ✓ | 10.74:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 4.71:1 ✓ | 11.22:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 5.67:1 ✓ | 8.74:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.05:1 ✓ | 3.93:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 4.94:1 ✓ | 10.38:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 15.21:1 ✓ | 9.56:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 4.27:1 ✓ | 6.76:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 15.24:1 ✓ | 9.53:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 4.20:1 ✓ | 7.04:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 14.60:1 ✓ | 10.79:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 5.29:1 ✓ | 4.81:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 14.98:1 ✓ | 9.98:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 4.98:1 ✓ | 5.74:1 ✓ |

## Typography

- **Sans:** `"IBM Plex Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif` → `--font-sans`
- **Mono:** `"IBM Plex Mono", ui-monospace, Menlo, monospace` → `--font-mono`
- **Body size:** `text.sm`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 11px | 1.45 | `--text-xs` · `--leading-xs` | column headers, badges |
| `text.sm` | 13px | 1.45 | `--text-sm` · `--leading-sm` | body, table cells, inputs |
| `text.md` | 14px | 1.45 | `--text-md` · `--leading-md` | emphasised body, card titles |
| `text.lg` | 16px | 1.35 | `--text-lg` · `--leading-lg` | section headings (h3) |
| `text.xl` | 18px | 1.3 | `--text-xl` · `--leading-xl` | panel headings (h2) |
| `text.2xl` | 22px | 1.25 | `--text-2xl` · `--leading-2xl` | page title (h1) |
| `text.3xl` | 28px | 1.2 | `--text-3xl` · `--leading-3xl` | KPI numbers |

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
| `type.display` | 30px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 24px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 20px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 16px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 13px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 11px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 12px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 13px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

## Neutral ramp

Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.

| Step | Value | CSS variable |
|---|---|---|
| `neutral.50` | `#f8fafc` | `--neutral-50` |
| `neutral.100` | `#f1f5f9` | `--neutral-100` |
| `neutral.200` | `#e2e8f0` | `--neutral-200` |
| `neutral.300` | `#cbd5e1` | `--neutral-300` |
| `neutral.400` | `#94a3b8` | `--neutral-400` |
| `neutral.500` | `#64748b` | `--neutral-500` |
| `neutral.600` | `#475569` | `--neutral-600` |
| `neutral.700` | `#334155` | `--neutral-700` |
| `neutral.800` | `#1e293b` | `--neutral-800` |
| `neutral.900` | `#0f172a` | `--neutral-900` |
| `neutral.950` | `#020617` | `--neutral-950` |

## Status colours

Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 20 apart (checked):

| Pair | Light ΔE00 | Dark ΔE00 |
|---|---|---|
| `success` · `warning` | 40.2 | 37.9 |
| `success` · `danger` | 65.0 | 71.5 |
| `success` · `info` | 43.3 | 45.2 |
| `warning` · `danger` | 24.8 | 41.1 |
| `warning` · `info` | 46.0 | 56.3 |
| `danger` · `info` | 47.6 | 55.3 |

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

Set: **lucide**, stroke 1.75. Sizes: `icon.sm` 14px (`--icon-sm`) · `icon.md` 16px (`--icon-md`) · `icon.lg` 18px (`--icon-lg`).

## Density modes

`compact` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `compact` | 32px | 32px | 12px | 6px |
| `comfortable` | 40px | 36px | 16px | 10px |

Kit base: **shadcn-new-york** — control heights and radius at or above the kit's own (checked).

## Spacing

One scale for padding, gap and margin. A value between two steps is a design question, not a
reason to write a raw px.

| Token | Value | CSS variable |
|---|---|---|
| `space.0` | 0px | `--space-0` |
| `space.1` | 2px | `--space-1` |
| `space.2` | 4px | `--space-2` |
| `space.3` | 6px | `--space-3` |
| `space.4` | 8px | `--space-4` |
| `space.5` | 12px | `--space-5` |
| `space.6` | 16px | `--space-6` |
| `space.7` | 20px | `--space-7` |
| `space.8` | 24px | `--space-8` |
| `space.9` | 32px | `--space-9` |
| `space.10` | 48px | `--space-10` |

## Radius

| Token | Value | CSS variable |
|---|---|---|
| `radius.none` | 0px | `--radius-none` |
| `radius.sm` | 2px | `--radius-sm` |
| `radius.md` | 4px | `--radius-md` |
| `radius.lg` | 6px | `--radius-lg` |
| `radius.xl` | 8px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `0 1px 1px rgb(15 23 42 / 0.06)` | `0 1px 1px rgb(0 0 0 / 0.5)` | `--shadow-1` |
| `shadow.2` | `0 2px 8px rgb(15 23 42 / 0.10)` | `0 2px 8px rgb(0 0 0 / 0.55)` | `--shadow-2` |
| `shadow.3` | `0 8px 24px rgb(15 23 42 / 0.14)` | `0 8px 24px rgb(0 0 0 / 0.6)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `80ms` | `--motion-fast` |
| `motion.base` | `140ms` | `--motion-base` |
| `motion.slow` | `220ms` | `--motion-slow` |
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
| `control.height-sm` | 28px | `--control-height-sm` |
| `control.height-md` | 32px | `--control-height-md` |
| `control.height-lg` | 36px | `--control-height-lg` |
| `control.row-height` | 32px | `--control-row-height` |
| `control.target-min` | 24px | `--control-target-min` |
| `control.sidebar-width` | 220px | `--control-sidebar-width` |
| `control.content-max` | 1600px | `--control-content-max` |

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
