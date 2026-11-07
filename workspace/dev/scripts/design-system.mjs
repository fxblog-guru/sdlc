#!/usr/bin/env node
/**
 * design-system.mjs — the project's design system as a file a script can check.
 *
 * `docs/design-tokens.md` is the UI source of truth (DEV-CONTRACTS §13.3). Before this script it was
 * a file every stage assumed existed and none produced, so a greenfield project reached G7 with no
 * tokens and every screen invented its own. This script does the three mechanical parts of fixing
 * that — the parts where an agent's judgement adds nothing and its arithmetic can be wrong:
 *
 *   list    --presets <dir>                         the preset catalogue, one line each
 *   render  --preset <file.json> --out <dir>        write design-tokens.{json,md} + tokens.css
 *           --chosen-by "<name>" [--patterns <md>]  (and ui-patterns.md, copied verbatim)
 *           [--css <path>] [--scope '[data-skin="x"]']  a skin: the same tokens under :root<scope>
 *   check   [--tokens <dir>] [--css <path>]          contrast of every required pair, built-in and the
 *                                                   preset's extra_contrast_pairs, in every shipped
 *                                                   theme, and design-tokens.md and tokens.css (host_theme
 *                                                   mappings included) still rendered from the json
 *   scan    <path>... [--allow <file>]              hard-coded hex / rgb / hsl / px in UI source
 *   migrate --from <json> [--out <file>]            a schema 1 preset or design-tokens.json to schema 2
 *   starter --from <index.html> --out <dir>          the G5 visual-design starter screens on this design system
 *   derive  --from <visual.html> --base <preset.json> tokens from a HIGH-fidelity visual; refuses a source
 *           --id <id> --out <file>                    that calls itself a wireframe, low-fi or placeholder
 *   preview [<id>...] --presets <dir> --out <dir>   a starter page per preset from its tokens alone, shot at
 *           [--browser <path>] [--html-only]          1280 and 360 (small indexed PNGs), held to ui-rubric's
 *                                                   hard rules, plus index.html and manifest.json
 *   kit-check --project <dir> [--spec <ui-spec>]   every kit component the spec names has a file in components/ui;
 *                                                   cva / Radix / TanStack listed as dependencies are used
 *   classes --project <dir> [--css <entry>]          compiles the project's Tailwind over the classes its sources use;
 *                                                   fails a class that emits no rule, or an arbitrary value without tokens-ok
 *   import-shadcn --css <file> --base <preset.json>  a shadcn/ui or tweakcn theme (the :root and .dark
 *           --id <id> --name "<name>" --out <file>   CSS variables) mapped onto the preset schema, with
 *                                                   every role it had to fill or derive listed
 *
 * WHICH preset is a product decision and belongs to a named human (§13.3) — `render` refuses to run
 * without `--chosen-by`. Everything after that choice is arithmetic, and lives here.
 *
 * Exit 0 clean · 1 findings · 2 usage error.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deltaE } from './lib/color.mjs';
import { galleryHtml, sha256 as sha, shotName, starterHtml, SHOT_WIDTHS } from './lib/starter.mjs';
import { findRoot } from './lib/root.mjs';

// ---------------------------------------------------------------------------------------------
// The contract a preset must satisfy
// ---------------------------------------------------------------------------------------------

/** Every theme declares exactly these colour roles. A missing role is a screen that will improvise. */
export const COLOR_ROLES = [
  'bg', 'surface', 'surface-2', 'border', 'border-strong',
  'text', 'text-muted', 'primary', 'primary-hover', 'primary-fg',
  'success', 'warning', 'danger', 'danger-fg', 'info', 'focus',
];

/**
 * The pairs WCAG 2.2 AA is measured between, with the ratio each needs. Text is 4.5:1 (1.4.3);
 * non-text UI — input borders, focus rings, status icons — is 3:1 (1.4.11). `primary` on `bg` is
 * held to 4.5 because it is also the link colour, and links are text.
 */
export const CONTRAST_PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['primary-fg', 'primary', 4.5],
  ['primary-fg', 'primary-hover', 4.5],
  ['primary', 'bg', 4.5],
  ['danger', 'bg', 4.5],
  ['danger-fg', 'danger', 4.5],
  ['success', 'bg', 3],
  ['warning', 'bg', 3],
  ['info', 'bg', 3],
  ['border-strong', 'bg', 3],
  ['focus', 'bg', 3],
];

/** What each `extra_contrast_pairs` kind is held to: text 4.5:1 (1.4.3), non-text 3:1 (1.4.11). */
export const PAIR_KINDS = { text: 4.5, 'non-text': 3 };

const ROLE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * A preset's optional `extra_roles` -> `{ role: { light, dark?, use? } }`. A role the approved visual
 * draws (a tint fill, a badge background) is a token like the built-in ones, not a color-mix in code.
 * A bare hex string is shorthand for `{ light: <hex> }`, which only a light-only preset can use.
 */
export function extraRoles(p) {
  const raw = p.extra_roles ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([r, v]) => [r, typeof v === 'string' ? { light: v } : v ?? {}]));
}

/** Every colour role a preset renders: the 16 built-in ones, then its extra roles in declared order. */
export const colorRoles = (p) => [...COLOR_ROLES, ...Object.keys(extraRoles(p))];

/** One theme's palette, built-in and extra roles together. */
export function themeColors(p, theme) {
  const extras = Object.fromEntries(Object.entries(extraRoles(p)).map(([r, v]) => [r, v?.[theme]]));
  return { ...(p.color?.[theme] ?? {}), ...extras };
}

/** The built-in pairs, then the preset's `extra_contrast_pairs`, as `[fg, bg, need, extra]`. */
export function contrastPairs(p) {
  const extra = Array.isArray(p.extra_contrast_pairs) ? p.extra_contrast_pairs : [];
  return [
    ...CONTRAST_PAIRS.map(([fg, bg, need]) => [fg, bg, need, false]),
    ...extra.map((x) => [x?.fg, x?.bg, PAIR_KINDS[x?.kind], true]),
  ];
}

/** A CSS custom property name: `--` then at least one name character. */
const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/;
/** A selector `theme_selectors` may hold: no braces, semicolons or commas (one selector per entry). */
const PLAIN_SELECTOR = /^[^{};,]+$/;

/**
 * The hosts a surface can take its colours from (`host_theme.kind`). Each names the prefix its
 * variables carry and, per shipped theme, the selectors the host sets when that theme is active.
 * Another host (JetBrains, Obsidian…) is one more entry here; nothing else in the script names a host.
 */
export const HOST_KINDS = {
  vscode: {
    label: 'VS Code webview',
    prefix: '--vscode-',
    // VS Code puts exactly one of these classes on the webview's <body>, and its --vscode-* variables
    // on <html>. High contrast takes the dark fallback, high-contrast-light the light one. The
    // `:not()` keeps a body that carries both high-contrast classes on the light palette whatever
    // order the rules land in.
    themes: {
      light: ['body.vscode-light', 'body.vscode-high-contrast-light'],
      dark: ['body.vscode-dark', 'body.vscode-high-contrast:not(.vscode-high-contrast-light)'],
    },
  },
};

/** The selectors per theme a `host_theme` block renders: its `theme_selectors`, else the kind's own. */
export function hostSelectors(p) {
  const h = p.host_theme;
  const kind = HOST_KINDS[h?.kind];
  if (!kind) return {};
  return Object.fromEntries(Object.entries(kind.themes).map(([t, sel]) => [t, h.theme_selectors?.[t] ?? sel]));
}

function validateHostTheme(p, themes) {
  const h = p.host_theme;
  const out = [];
  if (!h || typeof h !== 'object' || Array.isArray(h)) return ['host_theme must be { "kind", "roles": { <role>: "--<host variable>" } }'];
  const kind = HOST_KINDS[h.kind];
  if (!kind) out.push(`host_theme.kind = \`${h.kind}\` must be one of ${Object.keys(HOST_KINDS).join(', ')}`);
  for (const k of Object.keys(h)) if (!['kind', 'roles', 'theme_selectors'].includes(k)) out.push(`host_theme.${k} is not a host_theme key (kind, roles, theme_selectors)`);
  if (!h.roles || typeof h.roles !== 'object' || Array.isArray(h.roles) || !Object.keys(h.roles).length) {
    out.push('host_theme.roles must map at least one colour role to a host variable');
  } else {
    const known = new Set(colorRoles(p));
    for (const [role, v] of Object.entries(h.roles)) {
      const at = `host_theme.roles.${role}`;
      if (!known.has(role)) { out.push(`${at}: \`${role}\` is not a colour role (built-in or extra_roles)`); continue; }
      if (typeof v !== 'string' || !CUSTOM_PROPERTY.test(v)) out.push(`${at} = \`${v}\` is not a CSS custom property name (\`--name\`)`);
      else if (kind && !v.startsWith(kind.prefix)) out.push(`${at} = \`${v}\` is not a ${kind.label} variable (\`${kind.prefix}*\`)`);
      // The hex stays required: it is the fallback outside the host, what contrast is measured on,
      // and what the preview shots render with.
      for (const theme of themes) {
        if (!parseHex(themeColors(p, theme)[role])) out.push(`${at}: color.${theme}.${role} must still be a hex — it is the fallback outside the host and the value contrast is measured on`);
      }
    }
  }
  const ts = h.theme_selectors;
  if (ts !== undefined) {
    if (!ts || typeof ts !== 'object' || Array.isArray(ts)) out.push('host_theme.theme_selectors must be { "light": [<selector>…], "dark": [<selector>…] }');
    else {
      for (const [t, list] of Object.entries(ts)) {
        if (!themes.includes(t)) out.push(`host_theme.theme_selectors.${t}: not a shipped theme (${themes.join(', ')})`);
        else if (!Array.isArray(list) || !list.length || list.some((s) => typeof s !== 'string' || !PLAIN_SELECTOR.test(s.trim()))) {
          out.push(`host_theme.theme_selectors.${t} must be a non-empty array of selectors, one per entry, without braces, commas or semicolons`);
        }
      }
    }
  }
  return out;
}

const REQUIRED_KEYS = ['id','name', 'summary', 'best_for', 'avoid_for', 'shell', 'density', 'kit', 'font', 'color', 'type', 'space', 'radius', 'elevation', 'motion', 'breakpoints', 'control'];

// ---------------------------------------------------------------------------------------------
// Colour arithmetic (WCAG 2.x relative luminance)
// ---------------------------------------------------------------------------------------------

export function parseHex(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return NaN;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------------------------
// Parsing the colour formats themes arrive in (shadcn v4 is oklch, v3 is bare "H S% L%")
// ---------------------------------------------------------------------------------------------

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const num = (t, scale = 1) => (String(t).endsWith('%') ? (parseFloat(t) / 100) * scale : parseFloat(t));

function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055));
}

function hslToRgb(H, S, L) {
  const k = (n) => (n + H / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  return [0, 8, 4].map((n) => 255 * (L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
}

/**
 * Any CSS colour a theme file is likely to hold → `{ rgb, alpha }`, or null. Deliberately narrow:
 * hex, rgb(), hsl(), oklch() and shadcn v3's bare `222.2 84% 4.9%`. A `var(...)` or a named colour
 * returns null and is reported, rather than guessed.
 */
export function parseColor(input) {
  const v = String(input).trim().toLowerCase();
  const hex = parseHex(v.length === 9 ? v.slice(0, 7) : v);
  if (hex) return { rgb: hex, alpha: v.length === 9 ? parseInt(v.slice(7), 16) / 255 : 1 };
  const fn = /^(oklch|rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  const bare = /^(-?[\d.]+)(?:deg)?\s+([\d.]+%)\s+([\d.]+%)$/.exec(v);
  if (!fn && !bare) return null;
  const [body, alphaPart] = (fn ? fn[2] : v).split('/').map((x) => x.trim());
  const parts = body.split(/[\s,]+/).filter(Boolean);
  const alpha = alphaPart !== undefined ? num(alphaPart) : parts.length === 4 ? num(parts[3]) : 1;
  const kind = fn ? fn[1] : 'hsl';
  let rgb;
  if (kind === 'oklch') rgb = oklchToRgb(num(parts[0]), num(parts[1], 0.4), parseFloat(parts[2]) || 0);
  else if (kind.startsWith('rgb')) rgb = parts.slice(0, 3).map((t) => num(t, 255));
  else rgb = hslToRgb(parseFloat(parts[0]), num(parts[1]), num(parts[2]));
  // Wide-gamut oklch (Tailwind's red-600 is one) lands outside sRGB; clamp, as a browser does.
  return { rgb: rgb.map((c) => Math.min(255, Math.max(0, c))), alpha };
}

/** A translucent border is only a colour once you know what it sits on. */
function flatten(color, over) {
  if (color.alpha >= 1) return toHex(color.rgb);
  return toHex(color.rgb.map((c, i) => c * color.alpha + over[i] * (1 - color.alpha)));
}

function shift(hex, amount) {
  const rgb = parseHex(hex);
  return toHex(rgb.map((c) => (amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
}

function cssBlocks(css) {
  const block = (sel) => {
    const m = new RegExp(`${sel}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) return {};
    return Object.fromEntries([...m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
  };
  return { light: block(':root'), dark: block('\\.dark') };
}

/**
 * shadcn names → this schema. The first name found wins; roles a shadcn theme does not have
 * (success, warning, info, a hover shade) are filled from the base preset or derived, and every
 * one of those is listed, because a filled role is a decision the theme's author did not make.
 */
const SHADCN_MAP = {
  bg: ['background'], surface: ['card', 'background'], 'surface-2': ['muted', 'secondary'],
  border: ['border'], 'border-strong': ['input', 'border'], text: ['foreground'],
  'text-muted': ['muted-foreground'], primary: ['primary'], 'primary-fg': ['primary-foreground'],
  danger: ['destructive'], 'danger-fg': ['destructive-foreground'], focus: ['ring'],
};

export function importShadcn(css, base, { id, name, source }) {
  const blocks = cssBlocks(css);
  const notes = [];
  const out = structuredClone(base);
  out.id = id;
  out.name = name;
  out.summary = `Imported from ${source}, on the ${base.id} preset's scale, density and shell.`;
  for (const theme of ['light', 'dark']) {
    const vars = blocks[theme];
    if (!Object.keys(vars).length) {
      notes.push(`${theme}: no ${theme === 'light' ? ':root' : '.dark'} block — every ${theme} colour kept from ${base.id}`);
      continue;
    }
    const bgParsed = parseColor(vars.background ?? '');
    const bgRgb = bgParsed ? bgParsed.rgb : parseHex(base.color[theme].bg);
    for (const [role, names] of Object.entries(SHADCN_MAP)) {
      const found = names.find((n) => vars[n] !== undefined);
      const parsed = found ? parseColor(vars[found]) : null;
      if (parsed) {
        out.color[theme][role] = flatten(parsed, bgRgb);
        if (found !== names[0]) notes.push(`${theme}.${role}: no --${names[0]}, used --${found}`);
      } else if (role === 'danger-fg' && !found) {
        // derived below — shadcn v4 has no --destructive-foreground at all
      } else {
        notes.push(`${theme}.${role}: ${found ? `--${found} (${vars[found]}) is not a colour this script can read` : `no --${names.join(' / --')}`} — kept ${base.id}'s ${out.color[theme][role]}`);
      }
    }
    // danger-fg: shadcn v4 dropped --destructive-foreground; pick whichever of white / near-black passes.
    if (!vars['destructive-foreground']) {
      const d = out.color[theme].danger;
      out.color[theme]['danger-fg'] = contrast('#ffffff', d) >= contrast('#111111', d) ? '#ffffff' : '#111111';
      notes.push(`${theme}.danger-fg: derived ${out.color[theme]['danger-fg']} (best contrast on danger)`);
    }
    out.color[theme]['primary-hover'] = shift(out.color[theme].primary, theme === 'light' ? -0.12 : 0.15);
    notes.push(`${theme}.primary-hover: derived from primary (${theme === 'light' ? '12% darker' : '15% lighter'})`);
    for (const role of ['success', 'warning', 'info']) notes.push(`${theme}.${role}: kept ${base.id}'s ${out.color[theme][role]}`);
  }
  const radius = parseFloat(blocks.light.radius ?? blocks.dark.radius ?? '');
  if (!Number.isNaN(radius)) {
    const md = Math.round(String(blocks.light.radius ?? blocks.dark.radius).includes('rem') ? radius * 16 : radius);
    out.radius = { none: 0, sm: Math.max(0, md - 4), md: Math.max(0, md - 2), lg: md, xl: md + 4, full: 9999 };
    notes.push(`radius: from --radius ${md}px (shadcn's lg), sm/md/xl derived the way shadcn derives them`);
  }
  for (const [v, key] of [['font-sans', 'sans'], ['font-mono', 'mono'], ['font-serif', 'display']]) {
    const val = blocks.light[v] ?? blocks.dark[v];
    if (val) out.font[key] = val;
  }
  out.provenance = { source, license: 'as stated by the source — record it before shipping', adapted: notes };
  return { preset: out, notes, problems: validatePreset(out) };
}

// ---------------------------------------------------------------------------------------------
// derive — tokens from a high-fidelity visual, and only from one
// ---------------------------------------------------------------------------------------------

/**
 * Why a source cannot be the look, or null when it can. A wireframe's greys, sizes and radii are
 * placeholders (§13.3); release-management derived its tokens from one whose banner said so, and
 * shipped grey. Read from what the file says about itself: a `<meta name="fidelity">`, and the text
 * and comments (never attribute values, so `placeholder="Search"` on an input is not a marker, and
 * never a lone "Draft", which is a status label in half the products this builds).
 */
const LOW_FI = [
  /\blo(?:w)?[- ]?fi(?:delity)?\b/i,
  /\bwire[- ]?frame\b/i,
  /\b(?:greys?|grays?|colou?rs?|styles?|visuals?|sizes?)\s+(?:are|is)\s+(?:only\s+)?placeholders?\b/i,
  /\bplaceholder\s+(?:greys?|grays?|colou?rs?|styles?|styling|visuals?)\b/i,
  /\bdraft\s+for\s+discussion\b/i,
  /\bnot\s+the\s+(?:final\s+)?(?:look|visual|design)\b/i,
];

export function lowFidelityReason(html) {
  const meta = /<meta\s+[^>]*name=["']fidelity["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']fidelity["']/i.exec(html)?.[1];
  if (meta) return /^(?:high|hi|hi-fi|high-fidelity)$/i.test(meta.trim()) ? null : `<meta name="fidelity" content="${meta}">`;
  const comments = [...html.matchAll(/<!--([\s\S]*?)-->|\/\*([\s\S]*?)\*\//g)].map((m) => m[1] ?? m[2]).join('\n');
  const text = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ' ');
  for (const re of LOW_FI) {
    const hit = re.exec(text) ?? re.exec(comments);
    if (hit) return `it calls itself "${hit[0]}"`;
  }
  return null;
}

/** Our own `--color-<role>` names, then shadcn's: a high-fi visual uses one or the other. */
export function deriveFromVisual(html, base, { id, name, source }) {
  const why = lowFidelityReason(html);
  if (why) return { refused: `${source} is not a high-fidelity visual — ${why}. A wireframe binds content and layout, never look (§13.3); choose a preset, or derive from the approved visual design` };
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const blocks = cssBlocks(css);
  const ours = (vars) => Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith('color-')).map(([k, v]) => [k.slice(6), v]));
  if (Object.keys(ours(blocks.light)).length) {
    const out = structuredClone(base);
    Object.assign(out, { id, name, summary: `Derived from ${source}, on the ${base.id} preset's scale, density and shell.` });
    const notes = [];
    for (const theme of ['light', 'dark']) {
      const vars = ours(blocks[theme]);
      const bg = parseColor(vars.bg ?? '')?.rgb ?? parseHex(base.color[theme].bg);
      for (const role of COLOR_ROLES) {
        const c = vars[role] ? parseColor(vars[role]) : null;
        if (c) out.color[theme][role] = flatten(c, bg);
        else notes.push(`${theme}.${role}: not in the visual — kept ${base.id}'s ${out.color[theme][role]}`);
      }
    }
    out.provenance = { source, license: 'the project\'s own visual design', adapted: notes };
    return { preset: out, notes, problems: validatePreset(out) };
  }
  return importShadcn(css, base, { id, name, source });
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** Returns a list of human-readable problems; empty means the preset is usable. */
export function validatePreset(p) {
  const problems = [];
  for (const k of REQUIRED_KEYS) if (!(k in p)) problems.push(`missing key \`${k}\``);
  if (problems.length) return problems;

  // `themes` (optional, default both) is which themes ship. An approved visual drawn light only is
  // rendered light only (§13.3): a dark theme nobody drew is a theme nobody approved.
  const themes = p.themes ?? ['light', 'dark'];
  if (!Array.isArray(themes) || !themes.includes('light') || themes.some((t) => !['light', 'dark'].includes(t))) {
    problems.push('themes must be ["light"] or ["light", "dark"]');
    return problems;
  }
  // `scrim` (optional) is the overlay behind a dialog: its own colour per theme, never a var() of
  // the text colour, which brightens the page in a dark theme instead of dimming it.
  if (p.scrim !== undefined) {
    for (const theme of themes) {
      if (!parseColor(p.scrim?.[theme] ?? '')) problems.push(`scrim.${theme} = \`${p.scrim?.[theme]}\` is not a literal colour (hex, rgb[a], hsl[a]) — a scrim is its own token, never derived from the text colour`);
    }
  }

  // `extra_roles` (optional): colour roles beyond the 16, each a hex per shipped theme.
  const rawExtra = p.extra_roles;
  if (rawExtra !== undefined && (!rawExtra || typeof rawExtra !== 'object' || Array.isArray(rawExtra))) {
    problems.push('extra_roles must be an object of role → { "light": "<hex>", "dark": "<hex>" }');
  }
  for (const [role, v] of Object.entries(extraRoles(p))) {
    if (!ROLE_NAME.test(role)) problems.push(`extra_roles.${role}: a role name is lowercase kebab-case (it becomes --color-${role})`);
    if (COLOR_ROLES.includes(role) || role === 'scrim') problems.push(`extra_roles.${role}: already a built-in role — set it in color.<theme> or scrim instead`);
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      problems.push(`extra_roles.${role} must be a hex or { "light": "<hex>", "dark": "<hex>" }`);
      continue;
    }
    for (const theme of themes) {
      if (v[theme] === undefined) problems.push(`extra_roles.${role}.${theme} missing — every shipped theme is required${typeof rawExtra[role] === 'string' ? ' (a bare hex is light-only shorthand)' : ''}`);
      else if (!parseHex(v[theme])) problems.push(`extra_roles.${role}.${theme} = \`${v[theme]}\` is not a #rgb / #rrggbb hex`);
    }
  }
  // `extra_contrast_pairs` (optional): [{ fg, bg, kind: "text" | "non-text" }], measured like the built-in pairs.
  if (p.extra_contrast_pairs !== undefined && !Array.isArray(p.extra_contrast_pairs)) {
    problems.push('extra_contrast_pairs must be an array of { "fg", "bg", "kind": "text" | "non-text" }');
  }
  const known = new Set(colorRoles(p));
  (Array.isArray(p.extra_contrast_pairs) ? p.extra_contrast_pairs : []).forEach((x, i) => {
    const at = `extra_contrast_pairs[${i}]`;
    if (!x || typeof x !== 'object') return problems.push(`${at} must be { "fg", "bg", "kind" }`);
    for (const end of ['fg', 'bg']) if (!known.has(x[end])) problems.push(`${at}.${end} = \`${x[end]}\` is not a colour role (built-in or extra_roles)`);
    if (!(x.kind in PAIR_KINDS)) problems.push(`${at}.kind = \`${x.kind}\` must be "text" (4.5:1) or "non-text" (3:1)`);
  });

  for (const theme of themes) {
    if (!p.color[theme]) {
      problems.push(`color.${theme} missing — every shipped theme is required`);
      continue;
    }
    const c = themeColors(p, theme);
    for (const role of COLOR_ROLES) {
      if (!(role in c)) problems.push(`color.${theme}.${role} missing`);
      else if (!parseHex(c[role])) problems.push(`color.${theme}.${role} = \`${c[role]}\` is not a #rgb / #rrggbb hex`);
    }
    for (const [fg, bg, need, extra] of contrastPairs(p)) {
      if (!need || !parseHex(c[fg]) || !parseHex(c[bg])) continue;
      const r = contrast(c[fg], c[bg]);
      if (r < need) problems.push(`${theme}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${need}:1${extra ? ' (extra_contrast_pairs)' : ''}`);
    }
  }

  // `host_theme` (optional): roles an editor-hosted surface reads from the host's own variables.
  if (p.host_theme !== undefined) problems.push(...validateHostTheme(p, themes));

  const bp = p.breakpoints;
  const smallest = Math.min(...Object.values(bp));
  if (smallest > 360) problems.push(`smallest breakpoint is ${smallest}px — §13.3 designs from 360px`);
  if ((p.control['target-min'] ?? 0) < 24) problems.push('control.target-min is below 24px — WCAG 2.2 AA 2.5.8');
  if (!Array.isArray(p.space) || p.space[0] !== 0) problems.push('space must be an array starting at 0');
  if ((p.schema ?? 1) >= 2) problems.push(...validateSchema2(p, themes));
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Schema 2 — the parts of a look that a flat token set left to whoever built the screen
// ---------------------------------------------------------------------------------------------
//
// release-management's tokens were a flat 11–20px scale with one line height, no elevation steps,
// near-identical warning and danger, and the kit's radius and control height stripped to 3px and
// 26px. Every value passed contrast, and the product looked like a spreadsheet. Schema 2 makes the
// missing decisions keys a check can fail on. A schema 1 file still renders and checks, with a
// warning, and `migrate` writes the schema 2 keys for a human to confirm.

export const TYPE_ROLES = ['display', 'h1', 'h2', 'h3', 'body', 'small', 'mono', 'tabular'];
/** The heading ladder, smallest first: each step at least `MIN_SCALE_RATIO` times the one below. */
export const TYPE_LADDER = ['body', 'h3', 'h2', 'h1', 'display'];
export const MIN_SCALE_RATIO = 1.2;
export const ELEVATION_STEPS = ['0', '1', '2', '3'];
export const NEUTRAL_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
export const STATUS_ROLES = ['success', 'warning', 'danger', 'info'];
/** ΔE00 below this and two status colours read as one: release-management's warning/danger were 16. */
export const MIN_STATUS_DELTA_E = 20;
/** Data-viz series must be told apart from each other, and their marks seen on the page. */
export const MIN_DATAVIZ_DELTA_E = 10;
export const MIN_DATAVIZ_CONTRAST = 2;
/**
 * The kit's own control height and radius floors. Shrinking them is how a kit stops looking like
 * itself; a preset that needs to says why in `kit_deviation`.
 */
export const KIT_BASES = {
  'shadcn-new-york': { 'height-sm': 28, 'height-md': 32, radiusMd: 4 },
  'radix-themes': { 'height-sm': 24, 'height-md': 32, radiusMd: 0 },
};

function validateSchema2(p, themes) {
  const out = [];
  const roles = p.type?.roles;
  if (!roles || typeof roles !== 'object') out.push(`type.roles missing — schema 2 names ${TYPE_ROLES.join(', ')}, each { size, line, weight, tracking }`);
  else {
    for (const r of TYPE_ROLES) {
      const v = roles[r];
      if (!v) { out.push(`type.roles.${r} missing`); continue; }
      for (const k of ['size', 'line', 'weight', 'tracking']) if (typeof v[k] !== 'number') out.push(`type.roles.${r}.${k} must be a number`);
    }
    if (!((p.type.ratio ?? 0) >= MIN_SCALE_RATIO)) out.push(`type.ratio is ${p.type.ratio ?? 'missing'} — a scale flatter than ${MIN_SCALE_RATIO} makes headings indistinguishable from body`);
    for (let i = 1; i < TYPE_LADDER.length; i += 1) {
      const lo = roles[TYPE_LADDER[i - 1]]?.size;
      const hi = roles[TYPE_LADDER[i]]?.size;
      if (lo && hi && hi / lo < MIN_SCALE_RATIO - 1e-9) out.push(`type.roles.${TYPE_LADDER[i]} ${hi}px is ${(hi / lo).toFixed(2)}× ${TYPE_LADDER[i - 1]} ${lo}px — each heading step is at least ${MIN_SCALE_RATIO}×`);
    }
    if (roles.small?.size && roles.body?.size && roles.small.size >= roles.body.size) out.push('type.roles.small must be smaller than body');
  }
  for (const theme of themes) {
    const el = p.elevation?.[theme] ?? {};
    for (const s of ELEVATION_STEPS) if (typeof el[s] !== 'string') out.push(`elevation.${theme}.${s} missing — schema 2 has steps 0–3 (0 is "none")`);
  }
  const ramp = p.neutral ?? {};
  const lums = NEUTRAL_STEPS.map((s) => (parseHex(ramp[s]) ? luminance(parseHex(ramp[s])) : null));
  NEUTRAL_STEPS.forEach((s, i) => { if (lums[i] === null) out.push(`neutral.${s} must be a #rrggbb hex`); });
  if (lums.every((l) => l !== null) && lums.some((l, i) => i && l >= lums[i - 1])) out.push('neutral must darken from 50 to 950, every step');
  for (const theme of themes) {
    const c = themeColors(p, theme);
    for (let i = 0; i < STATUS_ROLES.length; i += 1) {
      for (let j = i + 1; j < STATUS_ROLES.length; j += 1) {
        const [a, b] = [STATUS_ROLES[i], STATUS_ROLES[j]];
        const d = deltaE(c[a], c[b]);
        if (d < MIN_STATUS_DELTA_E) out.push(`${theme}: ${a} ${c[a]} and ${b} ${c[b]} are ΔE00 ${d.toFixed(1)} apart, need ${MIN_STATUS_DELTA_E} — two statuses that read as one colour`);
      }
    }
    const dv = p.dataviz?.[theme];
    if (!Array.isArray(dv) || dv.length < 6 || dv.some((x) => !parseHex(x))) out.push(`dataviz.${theme} must be at least 6 hex colours, in series order`);
    else {
      for (let i = 0; i < dv.length; i += 1) {
        if (contrast(dv[i], c.bg) < MIN_DATAVIZ_CONTRAST) out.push(`dataviz.${theme}[${i}] ${dv[i]} is ${contrast(dv[i], c.bg).toFixed(2)}:1 on bg, needs ${MIN_DATAVIZ_CONTRAST}:1`);
        for (let j = i + 1; j < dv.length; j += 1) {
          const d = deltaE(dv[i], dv[j]);
          if (d < MIN_DATAVIZ_DELTA_E) out.push(`dataviz.${theme}[${i}] and [${j}] are ΔE00 ${d.toFixed(1)} apart, need ${MIN_DATAVIZ_DELTA_E}`);
        }
      }
    }
  }
  if (!p.icon || typeof p.icon.set !== 'string' || !p.icon.sizes || !['sm', 'md', 'lg'].every((k) => typeof p.icon.sizes[k] === 'number')) out.push('icon must be { set, stroke, sizes: { sm, md, lg } }');
  const modes = p.density_modes;
  if (!modes || typeof modes !== 'object' || !Object.keys(modes).length) out.push('density_modes missing — at least the preset\'s own density, { row-height, control-height, cell-pad-x, cell-pad-y }');
  else {
    if (!(p.density in modes)) out.push(`density \`${p.density}\` is not one of density_modes (${Object.keys(modes).join(', ')})`);
    for (const [m, v] of Object.entries(modes)) {
      for (const k of ['row-height', 'control-height', 'cell-pad-x', 'cell-pad-y']) if (typeof v?.[k] !== 'number') out.push(`density_modes.${m}.${k} must be a number`);
      if ((v?.['control-height'] ?? 0) < (p.control['target-min'] ?? 24)) out.push(`density_modes.${m}.control-height is below control.target-min`);
    }
  }
  const kit = KIT_BASES[p.kit_base];
  if (!kit) out.push(`kit_base must be one of ${Object.keys(KIT_BASES).join(', ')} — the kit the visual design is built on`);
  else if (!p.kit_deviation) {
    for (const k of ['height-sm', 'height-md']) if ((p.control[k] ?? 0) < kit[k]) out.push(`control.${k} ${p.control[k]}px is below ${p.kit_base}'s ${kit[k]}px — the kit stripped of its proportions; raise it, or say why in kit_deviation`);
    if (p.radius.md !== 0 && p.radius.md < kit.radiusMd) out.push(`radius.md ${p.radius.md}px is below ${p.kit_base}'s ${kit.radiusMd}px — raise it, use 0 for a deliberately square system, or say why in kit_deviation`);
  }
  return out;
}

/** Advisory notes `check` prints but does not fail on. A schema 1 file is the one there is today. */
export function presetWarnings(p) {
  if ((p.schema ?? 1) >= 2) return [];
  return ['schema 1 token file: no type roles, elevation steps, neutral ramp, status ΔE, data-viz palette, icons or density modes — run `design-system.mjs migrate`, confirm what it filled, and re-render'];
}

/**
 * A schema 1 preset or design-tokens.json → schema 2, with every value it had to fill listed. The
 * fill is a starting point for the person who chose the design system, not a decision; what it
 * cannot fill well (a flat scale) it leaves for `validatePreset` to report.
 */
export function migratePreset(p) {
  const out = structuredClone(p);
  const notes = [];
  if ((p.schema ?? 1) >= 2) return { preset: out, notes: ['already schema 2'] };
  out.schema = 2;
  const scale = p.type.scale;
  const by = Object.entries(scale).sort((a, b) => a[1][0] - b[1][0]);
  const bodyKey = p.type.body in scale ? p.type.body : by[Math.floor(by.length / 2)][0];
  const [bodySize, bodyLine] = scale[bodyKey];
  const below = by.filter(([, v]) => v[0] < bodySize);
  // Walk up the heading ladder: each step is the smallest scale size at least 1.2× the one below,
  // or, where the scale has none (a flat scale), an invented 1.25× step that is listed as invented.
  const ladder = [[bodySize, bodyLine]];
  const invented = [];
  for (const name of ['h3', 'h2', 'h1', 'display']) {
    const prev = ladder.at(-1)[0];
    const found = by.find(([, v]) => v[0] / prev >= MIN_SCALE_RATIO - 1e-9 && v[0] > prev);
    if (found) ladder.push(found[1]);
    else {
      const size = Math.round(prev * 1.25);
      ladder.push([size, size >= 28 ? 1.15 : 1.25]);
      invented.push(`${name} ${size}px`);
    }
  }
  const role = ([size, line], weight, tracking = 0) => ({ size, line, weight, tracking });
  out.type = {
    ...p.type,
    ratio: MIN_SCALE_RATIO,
    roles: {
      display: role(ladder[4], 700, -0.02), h1: role(ladder[3], 600, -0.015), h2: role(ladder[2], 600, -0.01), h3: role(ladder[1], 600),
      body: role([bodySize, bodyLine], 400), small: role(below.at(-1)?.[1] ?? [bodySize - 2, bodyLine], 400),
      mono: { ...role([bodySize, bodyLine], 400), font: 'mono' }, tabular: { ...role([bodySize, bodyLine], 400), numeric: 'tabular-nums' },
    },
  };
  notes.push(`type.roles: heading ladder from type.scale around body \`${bodyKey}\`, each step ≥ ${MIN_SCALE_RATIO}×`);
  if (invented.length) notes.push(`type.roles: the scale is too flat for a hierarchy, so these steps were invented — confirm or replace: ${invented.join(', ')}`);
  const elev = (t) => {
    const e = p.elevation?.[t];
    if (!e) return undefined;
    return { 0: 'none', 1: e.sm ?? e['1'] ?? 'none', 2: e.md ?? e['2'] ?? e.sm, 3: e.lg ?? e['3'] ?? e.md };
  };
  out.elevation = Object.fromEntries(Object.keys(p.elevation ?? {}).map((t) => [t, elev(t)]));
  notes.push('elevation: sm/md/lg became steps 1/2/3; 0 is none');
  const light = themeColors(p, 'light');
  const ends = [parseHex(light.bg) ?? [255, 255, 255], parseHex(light.text) ?? [17, 17, 17]];
  const mix = (t) => toHex(ends[0].map((c, i) => c + (ends[1][i] - c) * t));
  out.neutral = Object.fromEntries(NEUTRAL_STEPS.map((s, i) => [s, mix(0.03 + (i / (NEUTRAL_STEPS.length - 1)) * 0.95)]));
  notes.push('neutral: interpolated from color.light.bg to color.light.text — replace with the kit\'s own ramp (zinc, slate, gray…)');
  out.dataviz = structuredClone(DEFAULT_DATAVIZ);
  notes.push('dataviz: the bundle\'s default eight-series palette');
  out.icon = { set: 'lucide', stroke: 1.75, sizes: { sm: 14, md: 16, lg: 20 } };
  notes.push('icon: lucide at 14/16/20 — the shadcn default');
  out.density_modes = { [p.density]: { 'row-height': p.control['row-height'] ?? 40, 'control-height': p.control['height-md'] ?? 36, 'cell-pad-x': 12, 'cell-pad-y': 8 } };
  notes.push(`density_modes: one mode, \`${p.density}\`, from control.row-height and control.height-md`);
  if (!out.kit_base) {
    out.kit_base = /radix themes/i.test(JSON.stringify(p.kit ?? {})) ? 'radix-themes' : 'shadcn-new-york';
    notes.push(`kit_base: ${out.kit_base}, from the kit names`);
  }
  return { preset: out, notes };
}

export const DEFAULT_DATAVIZ = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

const px = (n) => (typeof n === 'number' ? `${n}px` : String(n));

/** A role's value in tokens.css: the hex, or `var(<host variable>, <hex>)` for a host-mapped role. */
function colorValue(p, role, hex) {
  const host = p.host_theme?.roles?.[role];
  return host ? `var(${host}, ${hex})` : hex;
}


/**
 * A scope renders the same tokens under `:root<scope>` instead of `:root`, so one product can ship
 * several themes a person picks (a skin) beside its base design system. The scope is one attribute
 * selector, e.g. `[data-skin="sakura"]`, set on <html>; every block, dark and reduced motion
 * included, carries it, or the base would win on specificity.
 */
export const SCOPE_RE = /^\[[a-z][a-z0-9-]*="[a-z0-9][a-z0-9-]*"\]$/;

export function renderCss(p, { scope = '' } = {}) {
  if (scope && !SCOPE_RE.test(scope)) throw new Error(`scope must be one attribute selector like [data-skin="name"], got ${scope}`);
  const root = `:root${scope}`;
  const colorVars = (theme) => {
    const c = themeColors(p, theme);
    return colorRoles(p).map((r) => `  --color-${r}: ${colorValue(p, r, c[r])};`).join('\n');
  };
  const lines = [];
  lines.push(`/* Generated by dev/scripts/design-system.mjs from preset \`${p.id}\`. Do not edit by hand —`);
  lines.push(' * change dev/docs/design-tokens.json and re-render, so the doc, the json and this file agree. */');
  lines.push(`${root} {`);
  lines.push(colorVars('light'));
  lines.push(`  --font-sans: ${p.font.sans};`);
  lines.push(`  --font-mono: ${p.font.mono};`);
  if (p.font.display) lines.push(`  --font-display: ${p.font.display};`);
  for (const [name, [size, lh]] of Object.entries(p.type.scale)) {
    lines.push(`  --text-${name}: ${px(size)};`);
    lines.push(`  --leading-${name}: ${lh};`);
  }
  for (const [name, w] of Object.entries(p.type.weight)) lines.push(`  --weight-${name}: ${w};`);
  p.space.forEach((v, i) => lines.push(`  --space-${i}: ${px(v)};`));
  for (const [name, v] of Object.entries(p.radius)) lines.push(`  --radius-${name}: ${px(v)};`);
  lines.push(...shadowVars(p, 'light'));
  for (const [name, v] of Object.entries(p.motion)) lines.push(`  --motion-${name}: ${v};`);
  for (const [name, v] of Object.entries(p.control)) lines.push(`  --control-${name}: ${px(v)};`);
  if (p.scrim) lines.push(`  --color-scrim: ${p.scrim.light};`);
  lines.push(...schema2Vars(p));
  lines.push('  color-scheme: light;');
  lines.push('}');
  lines.push(...densityBlocks(p));
  if ((p.themes ?? ['light', 'dark']).includes('dark')) {
    const dvDark = (p.schema ?? 1) >= 2 && p.dataviz?.dark ? p.dataviz.dark.map((c, i) => `  --dataviz-${i + 1}: ${c};`) : [];
    const dark = [colorVars('dark'), ...(p.scrim ? [`  --color-scrim: ${p.scrim.dark};`] : []), ...shadowVars(p, 'dark'), ...dvDark, '  color-scheme: dark;'].join('\n');
    lines.push('@media (prefers-color-scheme: dark) {');
    lines.push(`  ${root}:not([data-theme="light"]) {\n${dark.replace(/^/gm, '  ')}\n  }`);
    lines.push('}');
    lines.push(`${root}[data-theme="dark"] {\n${dark}\n}`);
    if (p.host_theme) {
      // The host's own theme class on <body> beats the OS preference (an editor in dark mode on a
      // light OS), and an explicit data-theme beats both, as it does without a host.
      const dvLight = (p.schema ?? 1) >= 2 && p.dataviz?.light ? p.dataviz.light.map((c, i) => `  --dataviz-${i + 1}: ${c};`) : [];
      const light = [colorVars('light'), ...(p.scrim ? [`  --color-scrim: ${p.scrim.light};`] : []), ...shadowVars(p, 'light'), ...dvLight, '  color-scheme: light;'].join('\n');
      const body = { light, dark };
      for (const [theme, selectors] of Object.entries(hostSelectors(p))) {
        lines.push(`${selectors.map((s) => `${root}:not([data-theme]) ${s.trim()}`).join(',\n')} {\n${body[theme]}\n}`);
      }
    }
  }
  lines.push('@media (prefers-reduced-motion: reduce) {');
  lines.push(`  ${root} { ` + Object.keys(p.motion).filter((k) => k !== 'easing').map((k) => `--motion-${k}: 0ms;`).join(' ') + ' }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/** Elevation as `--shadow-0..3`, plus the schema 1 names `sm`/`md`/`lg` so existing code keeps working. */
function shadowVars(p, theme) {
  const e = p.elevation?.[theme] ?? {};
  const out = Object.entries(e).map(([n, v]) => `  --shadow-${n}: ${v};`);
  if ((p.schema ?? 1) >= 2) for (const [alias, step] of [['sm', '1'], ['md', '2'], ['lg', '3']]) if (e[step]) out.push(`  --shadow-${alias}: var(--shadow-${step});`);
  return out;
}

function schema2Vars(p) {
  if ((p.schema ?? 1) < 2) return [];
  const out = [];
  for (const [role, v] of Object.entries(p.type.roles ?? {})) {
    out.push(`  --type-${role}-size: ${px(v.size)};`, `  --type-${role}-line: ${v.line};`, `  --type-${role}-weight: ${v.weight};`, `  --type-${role}-tracking: ${v.tracking}em;`);
  }
  for (const [s, c] of Object.entries(p.neutral ?? {})) out.push(`  --neutral-${s}: ${c};`);
  (p.dataviz?.light ?? []).forEach((c, i) => out.push(`  --dataviz-${i + 1}: ${c};`));
  for (const [s, v] of Object.entries(p.icon?.sizes ?? {})) out.push(`  --icon-${s}: ${px(v)};`);
  if (p.icon?.stroke) out.push(`  --icon-stroke: ${p.icon.stroke};`);
  const own = p.density_modes?.[p.density];
  if (own) for (const [k, v] of Object.entries(own)) out.push(`  --density-${k}: ${px(v)};`);
  return out;
}

/** Each other density mode as `[data-density="<mode>"]`, so one attribute on a container switches it. */
function densityBlocks(p) {
  if ((p.schema ?? 1) < 2) return [];
  return Object.entries(p.density_modes ?? {}).map(([m, v]) => `[data-density="${m}"] {\n${Object.entries(v).map(([k, x]) => `  --density-${k}: ${px(x)};`).join('\n')}\n}`);
}

function schema2Markdown(p, lightOnly) {
  if ((p.schema ?? 1) < 2) return [];
  const L = [];
  L.push('## Type roles', '');
  L.push(`Scale ratio ${p.type.ratio} (each heading step at least ${MIN_SCALE_RATIO}× the one below, checked). Use the role, not a size:`);
  L.push('a page title is `h1`, never "the 24px one".', '');
  L.push('| Role | Size | Line height | Weight | Tracking | CSS variables |', '|---|---|---|---|---|---|');
  for (const [r, v] of Object.entries(p.type.roles)) {
    L.push(`| \`type.${r}\` | ${px(v.size)} | ${v.line} | ${v.weight} | ${v.tracking}em${v.numeric ? ` · ${v.numeric}` : ''}${v.font ? ` · font ${v.font}` : ''} | \`--type-${r}-{size,line,weight,tracking}\` |`);
  }
  L.push('', '## Neutral ramp', '', 'Greys for surfaces, borders and muted text come from this ramp, 50 (lightest) to 950.', '');
  L.push('| Step | Value | CSS variable |', '|---|---|---|');
  for (const [s, c] of Object.entries(p.neutral)) L.push(`| \`neutral.${s}\` | \`${c}\` | \`--neutral-${s}\` |`);
  L.push('', '## Status colours', '');
  L.push(`Status is hue **and** icon **and** text, never colour alone. Every pair below is at least ΔE00 ${MIN_STATUS_DELTA_E} apart (checked):`, '');
  L.push(`| Pair | Light ΔE00${lightOnly ? '' : ' | Dark ΔE00'} |`, `|---|---${lightOnly ? '' : '|---'}|`);
  const lc = themeColors(p, 'light');
  const dc = lightOnly ? null : themeColors(p, 'dark');
  for (let i = 0; i < STATUS_ROLES.length; i += 1) {
    for (let j = i + 1; j < STATUS_ROLES.length; j += 1) {
      const [a, b] = [STATUS_ROLES[i], STATUS_ROLES[j]];
      L.push(`| \`${a}\` · \`${b}\` | ${deltaE(lc[a], lc[b]).toFixed(1)}${dc ? ` | ${deltaE(dc[a], dc[b]).toFixed(1)}` : ''} |`);
    }
  }
  L.push('', '## Data visualisation', '', 'Series colours in fixed order; a ninth series folds into "Other". Never reuse a status colour for a series.', '');
  L.push(`| Series | Light${lightOnly ? '' : ' | Dark'} | CSS variable |`, `|---|---${lightOnly ? '' : '|---'}|---|`);
  p.dataviz.light.forEach((c, i) => L.push(`| ${i + 1} | \`${c}\`${lightOnly ? '' : ` | \`${p.dataviz.dark?.[i] ?? '—'}\``} | \`--dataviz-${i + 1}\` |`));
  L.push('', '## Icons', '', `Set: **${p.icon.set}**, stroke ${p.icon.stroke ?? 'default'}. Sizes: ${Object.entries(p.icon.sizes).map(([k, v]) => `\`icon.${k}\` ${px(v)} (\`--icon-${k}\`)`).join(' · ')}.`);
  L.push('', '## Density modes', '', `\`${p.density}\` is the default; another mode applies to a container with \`data-density="<mode>"\`.`, '');
  L.push('| Mode | Row height | Control height | Cell padding x | Cell padding y |', '|---|---|---|---|---|');
  for (const [m, v] of Object.entries(p.density_modes)) L.push(`| \`${m}\` | ${px(v['row-height'])} | ${px(v['control-height'])} | ${px(v['cell-pad-x'])} | ${px(v['cell-pad-y'])} |`);
  L.push('', `Kit base: **${p.kit_base}**${p.kit_deviation ? ` — deviation: ${p.kit_deviation}` : ' — control heights and radius at or above the kit\'s own (checked).'}`, '');
  return L;
}

export function renderMarkdown(p, meta) {
  const L = [];
  L.push('---');
  L.push('doc: design-tokens');
  L.push(`preset: ${p.id}`);
  L.push(`source: ${meta.source}`);
  L.push(`chosen_by: ${meta.chosenBy}`);
  L.push(`chosen_on: ${meta.date}`);
  L.push(`source_sha256: ${meta.sha}`);
  L.push('---');
  L.push('');
  L.push(`# Design tokens — ${p.name}`);
  L.push('');
  L.push('> Rendered from `dev/docs/design-tokens.json` by `dev/scripts/design-system.mjs`. **Do not edit');
  L.push('> this file** — edit the json and re-render; `design-system.mjs check` fails when they disagree.');
  L.push('> This is the single source of colour, type, spacing, radius, elevation and motion (DEV-CONTRACTS');
  L.push('> §13.3). A ui-spec cites these names; code reads them as the CSS variables in the last column.');
  L.push('');
  L.push('## Choice');
  L.push('');
  L.push(`${p.summary}`);
  L.push('');
  L.push(`- **Chosen by:** ${meta.chosenBy}, ${meta.date} — a product decision, recorded as one.`);
  L.push(`- **Best for:** ${p.best_for.join('; ')}`);
  L.push(`- **Not for:** ${p.avoid_for.join('; ')}`);
  L.push(`- **App shell:** \`${p.shell}\` (see \`docs/ui-patterns.md\` §Shells) · **Density:** \`${p.density}\``);
  const lightOnly = !(p.themes ?? ['light', 'dark']).includes('dark');
  L.push(`- **Themes:** ${lightOnly ? 'light only — the approved visual draws no dark theme, so tokens.css has none and the OS setting changes nothing' : 'light and dark (dark follows `prefers-color-scheme` unless `data-theme` is set)'}`);
  if (p.host_theme) {
    const sel = Object.entries(hostSelectors(p)).map(([t, list]) => `${t} on ${list.map((x) => `\`${x}\``).join(' / ')}`).join('; ');
    L.push(`- **Host theme:** \`${p.host_theme.kind}\` — ${Object.keys(p.host_theme.roles ?? {}).length} role(s) read the host's variables (Colour table)${sel && !lightOnly ? `; the palette follows the host's class (${sel}), ahead of \`prefers-color-scheme\`, and \`data-theme\` still overrides both` : ''}.`);
  }
  if (p.scrim) L.push(`- **Scrim** (overlay behind a dialog): \`--color-scrim\` — light \`${p.scrim.light}\`${lightOnly ? '' : `, dark \`${p.scrim.dark}\``}. Never the text colour at an opacity.`);
  if (p.provenance) {
    L.push(`- **Derived from:** ${p.provenance.source} — licence ${p.provenance.license}${p.provenance.url ? ` (${p.provenance.url})` : ''}`);
    for (const a of p.provenance.adapted ?? []) L.push(`  - adapted: ${a}`);
  }
  L.push('');
  L.push('## Kit');
  L.push('');
  L.push('Components come from this kit before anything bespoke (§13.3). A bespoke component in a ui-spec');
  L.push('names the kit component it rejected and why.');
  L.push('');
  L.push('| Stack | Kit | Notes |');
  L.push('|---|---|---|');
  for (const [stack, v] of Object.entries(p.kit)) L.push(`| ${stack} | ${v.name} | ${v.notes} |`);
  L.push('');
  L.push('## Colour');
  L.push('');
  const host = p.host_theme ? p.host_theme.roles ?? {} : null;
  if (host) {
    L.push(`Roles with a host variable read the ${HOST_KINDS[p.host_theme.kind]?.label ?? p.host_theme.kind} theme: \`--color-<role>: var(<host variable>, <hex>)\`.`);
    L.push('The hex is the fallback outside the host, the value contrast is measured on below, and what the shots render with.');
    L.push('');
  }
  L.push(`| Token | Light | Dark | CSS variable |${host ? ' Host variable |' : ''} Use for |`);
  L.push(`|---|---|---|---|${host ? '---|' : ''}---|`);
  const light = themeColors(p, 'light');
  const darkC = lightOnly ? {} : themeColors(p, 'dark');
  const extras = extraRoles(p);
  for (const r of colorRoles(p)) {
    const use = ROLE_USE[r] ?? `${extras[r]?.use ? `${extras[r].use} · ` : ''}project role (\`extra_roles\`)`;
    const hostCell = host ? ` ${host[r] ? `\`${host[r]}\`` : '—'} |` : '';
    L.push(`| \`color.${r}\` | \`${light[r]}\` | ${lightOnly ? '—' : `\`${darkC[r]}\``} | \`--color-${r}\` |${hostCell} ${use} |`);
  }
  L.push('');
  L.push('### Contrast — measured, not asserted');
  L.push('');
  L.push('Every pair a screen can put together, in every shipped theme. A ui-spec cites the pair; a reviewer can');
  L.push('recompute it with `node dev/scripts/design-system.mjs check`.');
  L.push('');
  if (contrastPairs(p).some((x) => x[3])) {
    L.push('Rows marked *extra* are the preset\'s `extra_contrast_pairs`, held to the same ratios.');
    L.push('');
  }
  L.push('| Foreground | Background | Needs | Light | Dark |');
  L.push('|---|---|---|---|---|');
  for (const [fg, bg, need, extra] of contrastPairs(p)) {
    const l = contrast(light[fg], light[bg]);
    const d = lightOnly ? null : contrast(darkC[fg], darkC[bg]);
    const dark = d === null ? '—' : `${d.toFixed(2)}:1 ${d >= need ? '✓' : '✗'}`;
    L.push(`| \`color.${fg}\` | \`color.${bg}\`${extra ? ' *extra*' : ''} | ${need}:1 | ${l.toFixed(2)}:1 ${l >= need ? '✓' : '✗'} | ${dark} |`);
  }
  L.push('');
  L.push('## Typography');
  L.push('');
  L.push(`- **Sans:** \`${p.font.sans}\` → \`--font-sans\``);
  if (p.font.display) L.push(`- **Display:** \`${p.font.display}\` → \`--font-display\` (headings only)`);
  L.push(`- **Mono:** \`${p.font.mono}\` → \`--font-mono\``);
  L.push(`- **Body size:** \`text.${p.type.body}\``);
  L.push('');
  L.push('| Token | Size | Line height | CSS variables | Use for |');
  L.push('|---|---|---|---|---|');
  for (const [name, [size, lh, use]] of Object.entries(p.type.scale)) {
    L.push(`| \`text.${name}\` | ${px(size)} | ${lh} | \`--text-${name}\` · \`--leading-${name}\` | ${use ?? ''} |`);
  }
  L.push('');
  L.push('| Weight token | Value |');
  L.push('|---|---|');
  for (const [name, w] of Object.entries(p.type.weight)) L.push(`| \`weight.${name}\` | ${w} |`);
  L.push('');
  L.push(...schema2Markdown(p, lightOnly));
  L.push('## Spacing');
  L.push('');
  L.push('One scale for padding, gap and margin. A value between two steps is a design question, not a');
  L.push('reason to write a raw px.');
  L.push('');
  L.push('| Token | Value | CSS variable |');
  L.push('|---|---|---|');
  p.space.forEach((v, i) => L.push(`| \`space.${i}\` | ${px(v)} | \`--space-${i}\` |`));
  L.push('');
  L.push('## Radius');
  L.push('');
  L.push('| Token | Value | CSS variable |');
  L.push('|---|---|---|');
  for (const [name, v] of Object.entries(p.radius)) L.push(`| \`radius.${name}\` | ${px(v)} | \`--radius-${name}\` |`);
  L.push('');
  L.push('## Elevation');
  L.push('');
  L.push('| Token | Light | Dark | CSS variable |');
  L.push('|---|---|---|---|');
  for (const name of Object.keys(p.elevation.light)) {
    L.push(`| \`shadow.${name}\` | \`${p.elevation.light[name]}\` | ${lightOnly ? '—' : `\`${p.elevation.dark[name]}\``} | \`--shadow-${name}\` |`);
  }
  L.push('');
  L.push('## Motion');
  L.push('');
  L.push('All durations collapse to `0ms` under `prefers-reduced-motion: reduce` (tokens.css does this).');
  L.push('');
  L.push('| Token | Value | CSS variable |');
  L.push('|---|---|---|');
  for (const [name, v] of Object.entries(p.motion)) L.push(`| \`motion.${name}\` | \`${v}\` | \`--motion-${name}\` |`);
  L.push('');
  L.push('## Breakpoints');
  L.push('');
  L.push('Media queries cannot read CSS variables, so these are the one place a px value is written in');
  L.push('code — in the breakpoint config, and nowhere else.');
  L.push('');
  L.push('| Token | Min width |');
  L.push('|---|---|');
  for (const [name, v] of Object.entries(p.breakpoints)) L.push(`| \`bp.${name}\` | ${px(v)} |`);
  L.push('');
  L.push('## Controls and density');
  L.push('');
  L.push('| Token | Value | CSS variable |');
  L.push('|---|---|---|');
  for (const [name, v] of Object.entries(p.control)) L.push(`| \`control.${name}\` | ${px(v)} | \`--control-${name}\` |`);
  L.push('');
  L.push('## Wiring');
  L.push('');
  L.push(`\`tokens.css\` was written to \`${meta.cssPath}\`. Import it once at the app root. With Tailwind,`);
  L.push('map the theme to the variables instead of to values, so the classes stay token-bound:');
  L.push('');
  L.push('```js');
  L.push('// tailwind.config — theme.extend');
  L.push('colors: { bg: "var(--color-bg)", surface: "var(--color-surface)", text: "var(--color-text)",');
  L.push('          muted: "var(--color-text-muted)", primary: { DEFAULT: "var(--color-primary)", fg: "var(--color-primary-fg)" },');
  L.push('          border: "var(--color-border)", danger: "var(--color-danger)" /* …every role, extra_roles too */ },');
  L.push('spacing: { 0: "var(--space-0)", 1: "var(--space-1)", 2: "var(--space-2)" /* …every step */ },');
  L.push('borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },');
  L.push('```');
  L.push('');
  L.push('`node dev/scripts/design-system.mjs scan <src>` lists every hard-coded colour and px in UI source —');
  L.push('G7 runs it, and a hit is a finding unless the line carries `tokens-ok: <reason>`.');
  L.push('');
  return `${L.join('\n')}`;
}

const ROLE_USE = {
  bg: 'page background',
  surface: 'cards, panels, table body, inputs',
  'surface-2': 'table header, hover row, sidebar, subtle fills',
  border: 'dividers and card edges (decorative — no contrast requirement)',
  'border-strong': 'input and control borders (3:1, WCAG 1.4.11)',
  text: 'body and headings',
  'text-muted': 'secondary text, captions, placeholders that carry meaning',
  primary: 'primary buttons, links, selected state',
  'primary-hover': 'hover / pressed primary',
  'primary-fg': 'text and icons on primary',
  success: 'success icons and accents',
  warning: 'warning icons and accents',
  danger: 'destructive actions, error text',
  'danger-fg': 'text on a danger fill',
  info: 'informational icons and accents',
  focus: 'focus ring — visible on every focusable element',
};

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------------------------
// scan — hard-coded values in UI source
// ---------------------------------------------------------------------------------------------

const SCAN_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.sass', '.less', '.vue', '.svelte']);
const SCAN_SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.next', 'out', 'coverage', '.git', 'storybook-static']);
const SCAN_SKIP_FILE = /\.(test|spec|stories)\.[jt]sx?$|\.d\.ts$|tokens\.css$|tailwind\.config\.[cm]?[jt]s$/;

const RULES = [
  // A colour hex is 3, 4, 6 or 8 digits. `Order #123` is not a colour, so an all-digit match only
  // counts where a colour value can start: after `:`, a quote, `(`, `[` or `,`.
  { id: 'hex', re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g, why: 'hard-coded colour — use a color.* token' },
  { id: 'fn', re: /\b(?:rgba?|hsla?)\(\s*\d/g, why: 'hard-coded colour function — use a color.* token' },
  { id: 'px', re: /(?<![\w-])(?!0px|1px)\d+(?:\.\d+)?px\b/g, why: 'raw px — use a space / radius / text / control token' },
  // React reads a bare number in a style object as px: `padding: 12` is `12px` with the unit hidden.
  {
    id: 'num',
    re: /\b(?:padding|margin|gap|rowGap|columnGap|fontSize|borderRadius|top|right|bottom|left|inset|(?:min|max)?(?:Width|Height)|width|height)(?:Top|Right|Bottom|Left|Inline|Block)?\s*:\s*(?!1\b)[1-9]\d*(?![\d.%\w'"`])/g,
    jsxOnly: true,
    why: 'style-object number is raw px — use a space / radius / text / control token',
  },
];

export function scanText(text, file) {
  const hits = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/tokens-ok:\s*\S/.test(line)) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments describe; they do not style
    if (/@media|@container|screens\s*:/.test(line)) return; // breakpoints are the documented px exception
    for (const rule of RULES) {
      if (rule.jsxOnly && !/\.[jt]sx$/.test(file)) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        // `#` followed by hex digits is also an id selector or an anchor; only flag it where a
        // colour can appear — in CSS values, style objects, class strings, or JSX props.
        if (rule.id === 'hex' && /(href|to|id)\s*=\s*["'`{]?\s*#/.test(line)) continue;
        if (rule.id === 'hex' && /^#\d+$/.test(m[0]) && !/[:'"`(\[,]\s*$/.test(line.slice(0, m.index))) continue;
        hits.push({ file, line: i + 1, col: m.index + 1, rule: rule.id, match: m[0], why: rule.why });
      }
    }
  });
  return hits;
}

function walkSource(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (SCAN_SKIP_DIR.has(basename(p))) return out;
    for (const e of readdirSync(p)) walkSource(join(p, e), out);
  } else if (SCAN_EXT.has(extname(p)) && !SCAN_SKIP_FILE.test(basename(p))) {
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function cmdList(argv) {
  const dir = argFor(argv, '--presets');
  if (!dir || !existsSync(dir)) return usage('list needs --presets <dir>');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files) {
    const p = readJson(join(dir, f));
    const problems = validatePreset(p);
    console.log(`${p.id.padEnd(20)} ${p.name.padEnd(22)} shell=${p.shell.padEnd(15)} density=${p.density.padEnd(12)} ${problems.length ? `✗ ${problems.length} problem(s)` : '✓'}`);
    console.log(`${''.padEnd(20)} ${p.summary}`);
  }
  return 0;
}

function cmdRender(argv) {
  const presetPath = argFor(argv, '--preset');
  const out = argFor(argv, '--out');
  const chosenBy = argFor(argv, '--chosen-by');
  if (!presetPath || !out) return usage('render needs --preset <file.json> --out <dir>');
  if (!chosenBy || chosenBy.startsWith('<')) {
    console.error('design-system: --chosen-by "<name>" is required. Choosing the design system is a product');
    console.error('decision (§13.3); the file records who made it, and an agent may not name itself.');
    return 2;
  }
  const p = readJson(presetPath);
  const problems = validatePreset(p);
  if (problems.length) {
    console.error(`design-system: preset ${presetPath} is not usable:`);
    for (const pr of problems) console.error(`  - ${pr}`);
    return 1;
  }
  mkdirSync(out, { recursive: true });
  const cssPath = argFor(argv, '--css') ?? join(out, 'tokens.css');
  const scope = argFor(argv, '--scope') ?? '';
  if (scope && !SCOPE_RE.test(scope)) return usage(`--scope must be one attribute selector like [data-skin="name"], got ${scope}`);
  const date = new Date().toISOString().slice(0, 10);
  const record = { ...p, chosen_by: chosenBy, chosen_on: date, source: toPosix(presetPath), ...(scope ? { scope } : {}) };
  const json = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(out, 'design-tokens.json'), json);
  const md = renderMarkdown(p, { chosenBy, date, sha: sha256(json), source: record.source, cssPath: toPosix(relative(process.cwd(), resolve(cssPath))) });
  writeFileSync(join(out, 'design-tokens.md'), md);
  mkdirSync(dirname(cssPath), { recursive: true });
  writeFileSync(cssPath, renderCss(p, { scope }));
  const patterns = argFor(argv, '--patterns');
  if (patterns) copyFileSync(patterns, join(out, 'ui-patterns.md'));
  console.log(`design-system: ${p.id} chosen by ${chosenBy}`);
  console.log(`  ${toPosix(join(out, 'design-tokens.json'))}`);
  console.log(`  ${toPosix(join(out, 'design-tokens.md'))}`);
  console.log(`  ${toPosix(cssPath)}`);
  if (patterns) console.log(`  ${toPosix(join(out, 'ui-patterns.md'))}`);
  return 0;
}

function cmdCheck(argv) {
  const dir = argFor(argv, '--tokens') ?? join(findRoot().root, 'docs');
  const jsonPath = join(dir, 'design-tokens.json');
  const mdPath = join(dir, 'design-tokens.md');
  if (!existsSync(jsonPath)) {
    console.error(`design-system: ${toPosix(jsonPath)} does not exist — run /sdlc-design-system first.`);
    return 1;
  }
  const raw = readFileSync(jsonPath, 'utf8');
  const p = JSON.parse(raw);
  const problems = validatePreset(p);
  const renderable = problems.length === 0;
  if (!p.chosen_by || String(p.chosen_by).startsWith('<')) problems.push('chosen_by is empty — nobody is recorded as having chosen this design system');
  if (!existsSync(mdPath)) problems.push(`${toPosix(mdPath)} missing — re-render from the json`);
  else {
    const recorded = /^source_sha256:\s*([0-9a-f]{64})$/m.exec(readFileSync(mdPath, 'utf8'))?.[1];
    if (recorded !== sha256(raw)) problems.push('design-tokens.md was not rendered from the current design-tokens.json — one of them was edited by hand; re-render');
  }
  const css = tokensCssPath(argv, dir, mdPath);
  const notes = [];
  if (!css) notes.push('tokens.css not found (pass --css <path>) — not compared with the json');
  else if (renderable) {
    const want = renderCss(p, { scope: p.scope ?? '' });
    const have = readFileSync(css, 'utf8').replace(/\r\n/g, '\n');
    if (have !== want) problems.push(`${toPosix(css)} is not what design-tokens.json renders${firstDiff(have, want)} — it was edited by hand, or the json changed without a re-render${p.host_theme ? ' (host_theme mappings included)' : ''}; re-render`);
  }
  // A skin (rendered with --scope) shares the base design system's patterns; it carries none of its own.
  if (!p.scope && !existsSync(join(dir, 'ui-patterns.md'))) problems.push(`${toPosix(join(dir, 'ui-patterns.md'))} missing — G5 cites a pattern per screen`);
  if (problems.length) {
    for (const pr of problems) console.log(`✗ ${pr}`);
    return 1;
  }
  const nThemes = (p.themes ?? ['light', 'dark']).length;
  const nExtra = contrastPairs(p).length - CONTRAST_PAIRS.length;
  const split = nExtra ? ` (${CONTRAST_PAIRS.length * nThemes} built-in + ${nExtra * nThemes} extra)` : '';
  for (const w of [...presetWarnings(p), ...notes]) console.log(`! ${w}`);
  const host = p.host_theme ? ` · ${Object.keys(p.host_theme.roles).length} role(s) on the ${p.host_theme.kind} host theme` : '';
  console.log(`✓ ${p.id} · ${contrastPairs(p).length * nThemes} contrast pairs pass${split} · md matches json${css ? ' · tokens.css matches json' : ''}${host} · ${p.scope ? `skin ${p.scope}` : 'patterns present'} · chosen by ${p.chosen_by}`);
  return 0;
}

/**
 * Where the tokens.css `check` compares: `--css`, else `<tokens dir>/tokens.css`, else the path the
 * md's Wiring section recorded at render time (relative to the directory render ran in).
 */
function tokensCssPath(argv, dir, mdPath) {
  const given = argFor(argv, '--css');
  if (given) return existsSync(given) ? given : null;
  const beside = join(dir, 'tokens.css');
  if (existsSync(beside)) return beside;
  const recorded = existsSync(mdPath) ? /^`tokens\.css` was written to `([^`]+)`/m.exec(readFileSync(mdPath, 'utf8'))?.[1] : null;
  return recorded && existsSync(recorded) ? recorded : null;
}

/** ` (first difference at line N: "…")`, so a hand edit is found without a diff tool. */
function firstDiff(have, want) {
  const a = have.split('\n');
  const b = want.split('\n');
  const i = a.findIndex((line, n) => line !== b[n]);
  const at = i === -1 ? Math.min(a.length, b.length) : i;
  return ` (first difference at line ${at + 1}: expected \`${(b[at] ?? '<end of file>').trim()}\`)`;
}

function cmdScan(argv) {
  const paths = positional(argv);
  if (!paths.length) return usage('scan needs at least one path');
  const files = paths.flatMap((p) => (existsSync(p) ? walkSource(p, []) : []));
  const hits = files.flatMap((f) => scanText(readFileSync(f, 'utf8'), toPosix(relative(process.cwd(), f))));
  if (argv.includes('--json')) console.log(JSON.stringify(hits, null, 2));
  else {
    for (const h of hits) console.log(`${h.file}:${h.line}:${h.col}  ${h.match.padEnd(10)} ${h.why}`);
    console.log(`design-system scan: ${files.length} file(s), ${hits.length} hard-coded value(s)`);
  }
  return hits.length ? 1 : 0;
}

function cmdImportShadcn(argv) {
  const cssPath = argFor(argv, '--css');
  const basePath = argFor(argv, '--base');
  const id = argFor(argv, '--id');
  const name = argFor(argv, '--name') ?? id;
  const out = argFor(argv, '--out');
  if (!cssPath || !basePath || !id || !out) return usage('import-shadcn needs --css <file> --base <preset.json> --id <id> --out <file>');
  const { preset, notes, problems } = importShadcn(readFileSync(cssPath, 'utf8'), readJson(basePath), {
    id, name, source: argFor(argv, '--source') ?? basename(cssPath),
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(preset, null, 2)}\n`);
  console.log(`design-system: wrote ${toPosix(out)}`);
  console.log('filled, derived or substituted — confirm each with whoever owns the theme:');
  for (const n of notes) console.log(`  · ${n}`);
  if (problems.length) {
    console.log('does not pass yet — render will refuse it until these are fixed in the json:');
    for (const pr of problems) console.log(`  ✗ ${pr}`);
    return 1;
  }
  console.log('✓ passes every contrast pair — ready for render');
  return 0;
}

/**
 * The G5 visual-design starter, made concrete for one design system: the high-fi screens of
 * dev-designing-visuals/starter/index.html, on this project's tokens.css. Media queries cannot read
 * a CSS variable, so the breakpoints are written in here, from the tokens, the one place §13.3
 * allows a px.
 */
export function renderStarter(html, p, { product }) {
  return html
    .replaceAll('__PRODUCT__', product.replace(/[<>&"]/g, ''))
    .replaceAll('__BP_XL__', String((p.breakpoints?.xl ?? 1280) - 1))
    .replaceAll('__BP_LG__', String((p.breakpoints?.lg ?? 1024) - 1))
    .replaceAll('__BP_MD__', String((p.breakpoints?.md ?? 768) - 1));
}

function cmdStarter(argv) {
  const presetPath = argFor(argv, '--preset') ?? join(argFor(argv, '--tokens') ?? join(findRoot().root, 'docs'), 'design-tokens.json');
  const out = argFor(argv, '--out');
  const from = argFor(argv, '--from');
  if (!out || !from) return usage('starter needs --from <dev-designing-visuals/starter/index.html> --out <dir> [--preset <json> | --tokens <dir>] [--product "<name>"]');
  const p = readJson(presetPath);
  const problems = validatePreset(p);
  if (problems.length) {
    for (const pr of problems) console.error(`  ✗ ${pr}`);
    return 1;
  }
  if ((p.schema ?? 1) < 2) {
    console.error('design-system: the starter needs a schema 2 design system (type roles, ramps, density) — run `migrate` first');
    return 1;
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), renderStarter(readFileSync(from, 'utf8'), p, { product: argFor(argv, '--product') ?? 'Product' }));
  writeFileSync(join(out, 'tokens.css'), renderCss(p));
  console.log(`design-system: starter for ${p.id} in ${toPosix(out)} — index.html, tokens.css`);
  return 0;
}

function cmdMigrate(argv) {
  const from = argFor(argv, '--from');
  const out = argFor(argv, '--out') ?? from;
  if (!from) return usage('migrate needs --from <preset or design-tokens.json> [--out <file>]');
  const { preset, notes } = migratePreset(readJson(from));
  writeFileSync(out, `${JSON.stringify(preset, null, 2)}\n`);
  console.log(`design-system: wrote schema 2 to ${toPosix(out)} — filled, for whoever chose the design system to confirm:`);
  for (const n of notes) console.log(`  · ${n}`);
  const problems = validatePreset(preset);
  for (const pr of problems) console.log(`  ✗ ${pr}`);
  if (problems.length) console.log('fix these in the json, then render again with --chosen-by');
  return problems.length ? 1 : 0;
}

function cmdDerive(argv) {
  const from = argFor(argv, '--from');
  const basePath = argFor(argv, '--base');
  const id = argFor(argv, '--id');
  const out = argFor(argv, '--out');
  if (!from || !basePath || !id || !out) return usage('derive needs --from <visual.html> --base <preset.json> --id <id> --out <file>');
  const r = deriveFromVisual(readFileSync(from, 'utf8'), readJson(basePath), { id, name: argFor(argv, '--name') ?? id, source: toPosix(from) });
  if (r.refused) {
    console.error(`design-system: refused — ${r.refused}`);
    return 1;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(r.preset, null, 2)}\n`);
  console.log(`design-system: wrote ${toPosix(out)}`);
  for (const n of r.notes) console.log(`  · ${n}`);
  for (const pr of r.problems) console.log(`  ✗ ${pr}`);
  return r.problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// preview — what each preset looks like, as pictures a person can choose from
// ---------------------------------------------------------------------------------------------

/** The starter page for a preset, exactly as `preview` writes it. */
export const presetStarter = (p) => starterHtml(p, renderCss(p));

/**
 * One full-page picture of `url` at `width`, light theme: the viewport is grown to the page's
 * height so the shot shows every section.
 */
async function shootFull(cdp, url, width) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  try {
    await s('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await s('Page.enable');
    const loaded = new Promise((r) => { const off = cdp.on((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${nav.errorText} loading ${url}`);
    await Promise.race([loaded, new Promise((r) => { setTimeout(r, 5000); })]);
    const frame = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
    await s('Runtime.evaluate', { expression: frame, awaitPromise: true });
    const h = (await s('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true })).result.value;
    await s('Emulation.setDeviceMetricsOverride', { width, height: Math.min(Math.max(h, 400), 4000), deviceScaleFactor: 1, mobile: false });
    await s('Runtime.evaluate', { expression: frame, awaitPromise: true });
    return Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function cmdPreview(argv) {
  const dir = argFor(argv, '--presets');
  const out = argFor(argv, '--out');
  if (!dir || !out || !existsSync(dir)) return usage('preview needs --presets <dir> --out <dir> [<preset-id>...]');
  const ids = positional(argv.filter((a) => a !== '--html-only' && a !== '--verbose'));
  const all = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(dir, f)));
  const unknown = ids.filter((id) => !all.some((p) => p.id === id));
  if (unknown.length) return usage(`no preset ${unknown.join(', ')} in ${dir} (have ${all.map((p) => p.id).join(', ')})`);
  const chosen = ids.length ? all.filter((p) => ids.includes(p.id)) : all;
  for (const p of chosen) {
    const problems = validatePreset(p);
    if (problems.length) {
      console.error(`design-system: preset ${p.id} is not usable:`);
      for (const pr of problems) console.error(`  - ${pr}`);
      return 1;
    }
  }
  mkdirSync(out, { recursive: true });
  for (const p of chosen) writeFileSync(join(out, `${p.id}.html`), presetStarter(p));
  writeFileSync(join(out, 'index.html'), galleryHtml(all));
  if (argv.includes('--html-only')) {
    for (const p of chosen) console.log(`  ${toPosix(join(out, `${p.id}.html`))}`);
    return 0;
  }
  const { findBrowser, launchBrowser } = await import('./ui-snap.mjs');
  const { runRubric, summarise } = await import('./ui-rubric.mjs');
  const { optimisePng } = await import('./lib/png.mjs');
  let browser;
  try {
    browser = findBrowser({ flag: argFor(argv, '--browser') });
  } catch (err) {
    console.error(`design-system: ${err.message}`);
    return 2;
  }
  const manifestPath = join(out, 'manifest.json');
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
  const entries = manifest.presets ?? {};
  const { cdp, close } = launchBrowser(browser);
  try {
    for (const p of chosen) {
      const url = pathToFileURL(resolve(out, `${p.id}.html`)).href;
      const shots = {};
      for (const w of SHOT_WIDTHS) {
        const png = optimisePng(await shootFull(cdp, url, w));
        writeFileSync(join(out, shotName(p.id, w)), png);
        shots[w] = png.length;
      }
      entries[p.id] = { name: p.name, html_sha256: sha(presetStarter(p)), shots, bytes: Object.values(shots).reduce((a, b) => a + b, 0) };
    }
  } finally {
    await close();
  }
  let failed = 0;
  for (const p of chosen) {
    const url = pathToFileURL(resolve(out, `${p.id}.html`)).href;
    const results = await runRubric({ urls: [{ name: p.id, url }], widths: [1280, 1024, 768, 360], tokens: p, height: 900, wait: 3000, browser, primary: '[data-variant="primary"], .btn-primary, .btn.primary, button.primary, button[type="submit"]', status: '[data-status]' });
    const sum = summarise(results);
    const findings = results.flatMap((r) => r.findings.map((f) => ({ ...f, width: r.width })));
    const e = entries[p.id];
    e.rubric = { hard_fails: sum.fails, advisory: [...new Set(findings.filter((f) => f.level === 'advisory').map((f) => f.rule))].sort() };
    console.log(`${sum.fails ? 'FAIL' : 'ok  '} ${p.id.padEnd(20)} ${SHOT_WIDTHS.map((w) => `${w}px ${(e.shots[w] / 1024).toFixed(0)} KB`).join(' · ')} · rubric: ${sum.fails} hard fail(s), advisory ${e.rubric.advisory.join(', ') || 'none'}`);
    for (const f of findings) if (f.level === 'fail' || argv.includes('--verbose')) console.log(`       @${f.width} ${f.rule}: ${f.message}${f.where.length ? `\n         ${f.where.join('\n         ')}` : ''}`);
    if (sum.fails) failed += 1;
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(sorted).reduce((a, e) => a + (e.bytes ?? 0), 0);
  writeFileSync(manifestPath, `${JSON.stringify({ generator: 'design-system.mjs preview', widths: SHOT_WIDTHS, total_bytes: total, presets: sorted }, null, 2)}\n`);
  console.log(`design-system: ${chosen.length} preset(s) previewed · ${(total / 1024).toFixed(0)} KB of shots in all · ${toPosix(join(out, 'index.html'))}`);
  return failed ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// kit-check · classes — the kit is built and used, and every class emits a rule (§13.3)
// ---------------------------------------------------------------------------------------------

async function cmdKitCheck(argv) {
  const { kitCheck } = await import('./lib/kit.mjs');
  const project = argFor(argv, '--project') ?? '.';
  const specPath = argFor(argv, '--spec');
  if (!existsSync(join(project, 'package.json'))) return usage('kit-check needs --project <dir with package.json> [--spec <ui-spec.md>] [--ui <components/ui dir>]');
  const specText = specPath ? readFileSync(specPath, 'utf8') : null;
  const r = kitCheck({ project, specText, ui: argFor(argv, '--ui') });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    for (const f of r.findings) console.log(`✗ ${f.kind.padEnd(16)} ${f.message}${f.line ? ` (ui-spec line ${f.line})` : ''}`);
    const by = (k) => r.findings.filter((f) => f.kind === k).length;
    console.log(`design-system kit-check: ${r.ui} has ${r.uiFiles} file(s) · ${by('missing-kit')} kit component(s) missing · ${by('missing-bespoke')} bespoke missing · ${by('unused-dep')} unused kit dependency(ies)`);
  }
  return r.findings.length ? 1 : 0;
}

async function cmdClasses(argv) {
  const { compileTailwind, definedClasses, extractClasses, judgeClasses } = await import('./lib/classes.mjs');
  const { walkSource } = await import('./lib/source.mjs');
  const project = resolve(argFor(argv, '--project') ?? '.');
  const configPath = argFor(argv, '--config') ?? ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'].map((f) => join(project, f)).find((f) => existsSync(f));
  const compiledPath = argFor(argv, '--compiled');
  if (!configPath && !compiledPath) return usage('classes needs --project <dir> with a tailwind.config.*, or --config <file> [--css <entry.css>] [--src <dir>]');
  const src = resolve(project, argFor(argv, '--src') ?? (existsSync(join(project, 'src')) ? 'src' : '.'));
  const cssPath = argFor(argv, '--css') ? resolve(project, argFor(argv, '--css')) : ['src/index.css', 'src/styles/globals.css', 'app/globals.css', 'src/app/globals.css'].map((f) => join(project, f)).find((f) => existsSync(f));
  const files = walkSource(src, (n) => /\.(tsx|jsx|ts|js)$/.test(n) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(n))
    .filter((f) => !/(^|\/)(test|tests|__tests__|__mocks__|fixtures)\//.test(toPosix(relative(src, f))));
  const sources = new Map();
  const uses = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const rel = toPosix(relative(project, f));
    sources.set(rel, text.split(/\r?\n/));
    for (const u of extractClasses(text)) uses.push({ ...u, file: rel });
  }
  const tokens = [...new Set(uses.map((u) => u.token))];
  let compiled;
  try {
    // --compiled: the CSS the project's own build emitted (Tailwind 4, or a CI artifact) instead of compiling here
    compiled = compiledPath ? { css: readFileSync(compiledPath, 'utf8'), version: 'as built' } : await compileTailwind(project, { configPath, cssPath, tokens });
  } catch (err) {
    console.error(`design-system classes: ${err.message}`);
    return 2;
  }
  const { dead, arbitrary } = judgeClasses(uses, definedClasses(compiled.css), sources);
  const uniq = (list) => [...new Map(list.map((u) => [u.token, u])).values()];
  if (argv.includes('--json')) console.log(JSON.stringify({ files: files.length, tokens: tokens.length, dead, arbitrary }, null, 2));
  else {
    for (const u of dead) console.log(`${u.file}:${u.line}  dead       ${u.token}`);
    for (const u of arbitrary) console.log(`${u.file}:${u.line}  arbitrary  ${u.token}  — a token, or \`tokens-ok: <reason>\` on the line`);
    console.log(`design-system classes: tailwind ${compiled.version} · ${files.length} file(s) · ${tokens.length} distinct class(es) · ${uniq(dead).length} emit no rule (${dead.length} use(s)) · ${uniq(arbitrary).length} arbitrary value(s) without tokens-ok (${arbitrary.length} use(s))`);
  }
  return dead.length || arbitrary.length ? 1 : 0;
}

function usage(msg) {
  console.error(`design-system: ${msg}`);
  console.error('usage: design-system.mjs list --presets <dir>');
  console.error('       design-system.mjs render --preset <file.json> --out <dir> --chosen-by "<name>" [--patterns <md>] [--css <path>] [--scope \'[data-skin="x"]\']');
  console.error('       design-system.mjs check [--tokens <dir>] [--css <tokens.css>]');
  console.error('       design-system.mjs scan <path>... [--json]');
  console.error('       design-system.mjs migrate --from <json> [--out <file>]');
  console.error('       design-system.mjs starter --from <starter/index.html> --out <dir> [--preset <json> | --tokens <dir>] [--product "<name>"]');
  console.error('       design-system.mjs derive --from <visual.html> --base <preset.json> --id <id> [--name "<n>"] --out <file>');
  console.error('       design-system.mjs preview [<preset-id>...] --presets <dir> --out <dir> [--browser <path>] [--html-only]');
  console.error('       design-system.mjs kit-check --project <dir> [--spec <ui-spec.md>] [--ui <components/ui>] [--json]');
  console.error('       design-system.mjs classes --project <dir> [--config <tailwind.config> | --compiled <built.css>] [--css <entry.css>] [--src <dir>] [--json]');
  console.error('       design-system.mjs import-shadcn --css <file> --base <preset.json> --id <id> [--name "<n>"] [--source "<where from>"] --out <file>');
  return 2;
}

const toPosix = (p) => p.split('\\').join('/');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const run = { list: cmdList, render: cmdRender, check: cmdCheck, scan: cmdScan, 'import-shadcn': cmdImportShadcn, derive: cmdDerive, migrate: cmdMigrate, starter: cmdStarter, preview: cmdPreview, 'kit-check': cmdKitCheck, classes: cmdClasses }[cmd];
  process.exitCode = run ? await run(rest) : usage(cmd ? `unknown command \`${cmd}\`` : 'no command');
}
