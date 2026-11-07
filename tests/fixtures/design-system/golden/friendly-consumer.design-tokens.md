---
doc: design-tokens
preset: friendly-consumer
source: golden
chosen_by: Golden Fixture
chosen_on: 2026-10-17
source_sha256: 0000000000000000000000000000000000000000000000000000000000000000
---

# Design tokens — Friendly Consumer

> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit
> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.
> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS
> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.

## Choice

Warm and approachable. Stone neutrals, violet accent, 16px body, 12px corners, soft shadows, bigger targets. For people who did not choose to learn your product.

- **Chosen by:** Golden Fixture, 2026-10-17 — a product decision, recorded as one.
- **Best for:** consumer and SMB self-serve products; onboarding-heavy flows, booking, customer portals; audiences with mixed digital confidence
- **Not for:** dense tabular work — pick dense-enterprise; regulated or finance products that must feel sober — pick clean-saas
- **App shell:** `topnav` (see `docs/ui-patterns.md` §Shells) · **Density:** `spacious`
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
| `color.bg` | `#fafaf9` | `#141210` | `--color-bg` | page background |
| `color.surface` | `#ffffff` | `#1f1c1a` | `--color-surface` | cards, panels, table body, inputs |
| `color.surface-2` | `#f5f5f4` | `#2a2624` | `--color-surface-2` | table header, hover row, sidebar, subtle fills |
| `color.border` | `#e7e5e4` | `#2f2a27` | `--color-border` | dividers and card edges (decorative — no contrast requirement) |
| `color.border-strong` | `#8f8a86` | `#78716c` | `--color-border-strong` | input and control borders (3:1, WCAG 1.4.11) |
| `color.text` | `#1c1917` | `#f5f5f4` | `--color-text` | body and headings |
| `color.text-muted` | `#5c5652` | `#aaa29d` | `--color-text-muted` | secondary text, captions, placeholders that carry meaning |
| `color.primary` | `#7c3aed` | `#a78bfa` | `--color-primary` | primary buttons, links, selected state |
| `color.primary-hover` | `#6d28d9` | `#c4b5fd` | `--color-primary-hover` | hover / pressed primary |
| `color.primary-fg` | `#ffffff` | `#1e1236` | `--color-primary-fg` | text and icons on primary |
| `color.success` | `#16a34a` | `#4ade80` | `--color-success` | success icons and accents |
| `color.warning` | `#d97706` | `#fbbf24` | `--color-warning` | warning icons and accents |
| `color.danger` | `#dc2626` | `#f87171` | `--color-danger` | destructive actions, error text |
| `color.danger-fg` | `#ffffff` | `#2a0808` | `--color-danger-fg` | text on a danger fill |
| `color.info` | `#0284c7` | `#38bdf8` | `--color-info` | informational icons and accents |
| `color.focus` | `#8b5cf6` | `#c4b5fd` | `--color-focus` | focus ring — visible on every focusable element |
| `color.tint-success` | `#f8fcfa` | `#273f2c` | `--color-tint-success` | success badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-warning` | `#fefbf8` | `#47391c` | `--color-tint-warning` | warning badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-danger` | `#fef8f8` | `#462b2a` | `--color-tint-danger` | danger badge, notice and row fill · project role (`extra_roles`) |
| `color.tint-info` | `#f7fbfd` | `#243942` | `--color-tint-info` | info badge, notice and row fill · project role (`extra_roles`) |

### Contrast — measured, not asserted

Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can
recompute it with `node dev/scripts/design-system.mjs check`.

Rows marked *extra* are the preset's `extra_contrast_pairs`, held to the same ratios.

| Foreground | Background | Needs | Light | Dark |
|---|---|---|---|---|
| `color.text` | `color.bg` | 4.5:1 | 16.74:1 ✓ | 17.13:1 ✓ |
| `color.text` | `color.surface` | 4.5:1 | 17.49:1 ✓ | 15.53:1 ✓ |
| `color.text` | `color.surface-2` | 4.5:1 | 16.03:1 ✓ | 13.74:1 ✓ |
| `color.text-muted` | `color.bg` | 4.5:1 | 6.91:1 ✓ | 7.44:1 ✓ |
| `color.text-muted` | `color.surface` | 4.5:1 | 7.22:1 ✓ | 6.75:1 ✓ |
| `color.primary-fg` | `color.primary` | 4.5:1 | 5.70:1 ✓ | 6.46:1 ✓ |
| `color.primary-fg` | `color.primary-hover` | 4.5:1 | 7.10:1 ✓ | 9.52:1 ✓ |
| `color.primary` | `color.bg` | 4.5:1 | 5.46:1 ✓ | 6.87:1 ✓ |
| `color.danger` | `color.bg` | 4.5:1 | 4.62:1 ✓ | 6.76:1 ✓ |
| `color.danger-fg` | `color.danger` | 4.5:1 | 4.83:1 ✓ | 6.68:1 ✓ |
| `color.success` | `color.bg` | 3:1 | 3.16:1 ✓ | 10.72:1 ✓ |
| `color.warning` | `color.bg` | 3:1 | 3.05:1 ✓ | 11.19:1 ✓ |
| `color.info` | `color.bg` | 3:1 | 3.92:1 ✓ | 8.72:1 ✓ |
| `color.border-strong` | `color.bg` | 3:1 | 3.27:1 ✓ | 3.90:1 ✓ |
| `color.focus` | `color.bg` | 3:1 | 4.05:1 ✓ | 10.12:1 ✓ |
| `color.text` | `color.tint-success` *extra* | 4.5:1 | 16.90:1 ✓ | 10.50:1 ✓ |
| `color.success` | `color.tint-success` *extra* | 3:1 | 3.19:1 ✓ | 6.57:1 ✓ |
| `color.text` | `color.tint-warning` *extra* | 4.5:1 | 16.96:1 ✓ | 10.29:1 ✓ |
| `color.warning` | `color.tint-warning` *extra* | 3:1 | 3.09:1 ✓ | 6.73:1 ✓ |
| `color.text` | `color.tint-danger` *extra* | 4.5:1 | 16.65:1 ✓ | 11.74:1 ✓ |
| `color.danger` | `color.tint-danger` *extra* | 3:1 | 4.60:1 ✓ | 4.63:1 ✓ |
| `color.text` | `color.tint-info` *extra* | 4.5:1 | 16.80:1 ✓ | 11.07:1 ✓ |
| `color.info` | `color.tint-info` *extra* | 3:1 | 3.93:1 ✓ | 5.64:1 ✓ |

## Typography

- **Sans:** `"Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` → `--font-sans`
- **Mono:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` → `--font-mono`
- **Body size:** `text.md`

| Token | Size | Line height | CSS variables | Use for |
|---|---|---|---|---|
| `text.xs` | 13px | 1.5 | `--text-xs` · `--leading-xs` | meta, captions |
| `text.sm` | 14px | 1.5 | `--text-sm` · `--leading-sm` | secondary text, helper text |
| `text.md` | 16px | 1.6 | `--text-md` · `--leading-md` | body, inputs |
| `text.lg` | 18px | 1.5 | `--text-lg` · `--leading-lg` | lead text, card titles |
| `text.xl` | 22px | 1.35 | `--text-xl` · `--leading-xl` | section headings (h2) |
| `text.2xl` | 28px | 1.25 | `--text-2xl` · `--leading-2xl` | page title (h1) |
| `text.3xl` | 36px | 1.15 | `--text-3xl` · `--leading-3xl` | hero / welcome |

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
| `type.display` | 40px | 1.1 | 700 | -0.02em | `--type-display-{size,line,weight,tracking}` |
| `type.h1` | 32px | 1.2 | 600 | -0.015em | `--type-h1-{size,line,weight,tracking}` |
| `type.h2` | 26px | 1.25 | 600 | -0.01em | `--type-h2-{size,line,weight,tracking}` |
| `type.h3` | 20px | 1.35 | 600 | 0em | `--type-h3-{size,line,weight,tracking}` |
| `type.body` | 16px | 1.5 | 400 | 0em | `--type-body-{size,line,weight,tracking}` |
| `type.small` | 13px | 1.45 | 400 | 0.005em | `--type-small-{size,line,weight,tracking}` |
| `type.mono` | 14px | 1.5 | 400 | 0em · font mono | `--type-mono-{size,line,weight,tracking}` |
| `type.tabular` | 16px | 1.5 | 400 | 0em · tabular-nums | `--type-tabular-{size,line,weight,tracking}` |

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
| `success` · `warning` | 49.9 | 37.9 |
| `success` · `danger` | 72.5 | 71.5 |
| `success` · `info` | 48.4 | 45.2 |
| `warning` · `danger` | 24.8 | 41.1 |
| `warning` · `info` | 50.3 | 56.3 |
| `danger` · `info` | 51.3 | 55.3 |

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

Set: **lucide**, stroke 1.75. Sizes: `icon.sm` 16px (`--icon-sm`) · `icon.md` 18px (`--icon-md`) · `icon.lg` 24px (`--icon-lg`).

## Density modes

`spacious` is the default; another mode applies to a container with `data-density="<mode>"`.

| Mode | Row height | Control height | Cell padding x | Cell padding y |
|---|---|---|---|---|
| `spacious` | 56px | 44px | 20px | 16px |
| `comfortable` | 48px | 44px | 16px | 12px |

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
| `space.5` | 24px | `--space-5` |
| `space.6` | 32px | `--space-6` |
| `space.7` | 40px | `--space-7` |
| `space.8` | 48px | `--space-8` |
| `space.9` | 64px | `--space-9` |
| `space.10` | 80px | `--space-10` |

## Radius

| Token | Value | CSS variable |
|---|---|---|
| `radius.none` | 0px | `--radius-none` |
| `radius.sm` | 6px | `--radius-sm` |
| `radius.md` | 10px | `--radius-md` |
| `radius.lg` | 12px | `--radius-lg` |
| `radius.xl` | 16px | `--radius-xl` |
| `radius.full` | 9999px | `--radius-full` |

## Elevation

| Token | Light | Dark | CSS variable |
|---|---|---|---|
| `shadow.0` | `none` | `none` | `--shadow-0` |
| `shadow.1` | `0 1px 3px rgb(28 25 23 / 0.06)` | `0 1px 3px rgb(0 0 0 / 0.4)` | `--shadow-1` |
| `shadow.2` | `0 6px 16px rgb(28 25 23 / 0.08)` | `0 6px 16px rgb(0 0 0 / 0.5)` | `--shadow-2` |
| `shadow.3` | `0 16px 40px rgb(28 25 23 / 0.12)` | `0 16px 40px rgb(0 0 0 / 0.6)` | `--shadow-3` |

## Motion

All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).

| Token | Value | CSS variable |
|---|---|---|
| `motion.fast` | `150ms` | `--motion-fast` |
| `motion.base` | `220ms` | `--motion-base` |
| `motion.slow` | `350ms` | `--motion-slow` |
| `motion.easing` | `cubic-bezier(0.3, 0, 0, 1)` | `--motion-easing` |

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
| `control.row-height` | 56px | `--control-row-height` |
| `control.target-min` | 44px | `--control-target-min` |
| `control.sidebar-width` | 264px | `--control-sidebar-width` |
| `control.content-max` | 1080px | `--control-content-max` |

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
