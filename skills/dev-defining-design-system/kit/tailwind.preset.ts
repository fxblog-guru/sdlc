import type { Config } from 'tailwindcss';

// The kit's Tailwind preset: every theme key names a variable of the generated tokens.css
// (design-system.mjs render, schema 2), so a class can only name a token. Use it with
// `presets: [kitPreset]` in tailwind.config.ts, or `@config` from a Tailwind 4 stylesheet.
//
// Colours, spacing and type REPLACE Tailwind's defaults: `bg-blue-500` and `p-7` emit nothing.
// `design-system.mjs classes` fails on any class that emits no rule, so a default-scale class in a
// screen is caught at G7 instead of shipping as a silent no-op. Replacing `spacing` also replaces
// the scales derived from it (inset, translate, width, height, min/max sizes), so the fractions and
// the control sizes the kit uses are added back below.

const v = (name: string) => `var(--${name})`;
const steps = (prefix: string, keys: string[]) => Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]));
const fractions = { '1/2': '50%', full: '100%' };
const controls = {
  'control-sm': v('control-height-sm'),
  'control-md': v('control-height-md'),
  'control-lg': v('control-height-lg'),
  row: v('density-row-height'),
  'icon-sm': v('icon-sm'),
  'icon-md': v('icon-md'),
  'icon-lg': v('icon-lg'),
  // one line of body text, for a skeleton line
  line: `calc(${v('type-body-size')} * ${v('type-body-line')})`,
};

const preset: Partial<Config> = {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: v('color-bg'),
      surface: { DEFAULT: v('color-surface'), 2: v('color-surface-2') },
      border: { DEFAULT: v('color-border'), strong: v('color-border-strong') },
      text: { DEFAULT: v('color-text'), muted: v('color-text-muted') },
      primary: { DEFAULT: v('color-primary'), hover: v('color-primary-hover'), fg: v('color-primary-fg') },
      success: v('color-success'),
      warning: v('color-warning'),
      danger: { DEFAULT: v('color-danger'), fg: v('color-danger-fg') },
      info: v('color-info'),
      focus: v('color-focus'),
      scrim: v('color-scrim'),
      // the preset's extra_roles: status fills behind a badge or a notice
      tint: steps('color-tint', ['success', 'warning', 'danger', 'info']),
    },
    spacing: { px: '1px', ...steps('space', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) },
    borderRadius: steps('radius', ['none', 'sm', 'md', 'lg', 'xl', 'full']),
    fontFamily: { sans: v('font-sans'), mono: v('font-mono') },
    fontSize: Object.fromEntries(
      ['display', 'h1', 'h2', 'h3', 'body', 'small', 'mono', 'tabular'].map((r) => [
        r,
        [v(`type-${r}-size`), { lineHeight: v(`type-${r}-line`), letterSpacing: v(`type-${r}-tracking`), fontWeight: v(`type-${r}-weight`) }],
      ]),
    ),
    fontWeight: steps('weight', ['regular', 'medium', 'semibold', 'bold']),
    boxShadow: { none: 'none', ...steps('shadow', ['0', '1', '2', '3']) },
    transitionDuration: steps('motion', ['fast', 'base', 'slow']),
    transitionTimingFunction: { DEFAULT: v('motion-easing') },
    extend: {
      inset: fractions,
      translate: fractions,
      // `size-*` (width and height at once) reads `spacing`, not width/height: give it the icons too
      size: controls,
      height: controls,
      width: { ...controls, ...fractions },
      minHeight: { ...controls, target: v('control-target-min') },
      minWidth: { ...controls, target: v('control-target-min'), menu: `calc(${v('space-10')} * 3)` },
      maxWidth: { content: v('control-content-max'), dialog: 'var(--control-dialog-max, 32rem)', measure: '65ch' },
      maxHeight: { menu: 'var(--radix-dropdown-menu-content-available-height)' },
      padding: { 'cell-x': v('density-cell-pad-x'), 'cell-y': v('density-cell-pad-y') },
    },
  },
};

export default preset;
