#!/usr/bin/env node
/**
 * brand.mjs — a product's brand as code: one brand.json draws every asset the product's screens
 * reference, so a brand chosen later is a re-run, not a redraw (DEV-CONTRACTS §13.3, brand slots).
 *
 * On one product the header logo was drawn as the theme's glyph and nobody asked about a brand;
 * when the owner chose one, six approved screens and the built code were redrawn. Here every brand
 * use is a file at a fixed path (a slot). A placeholder kit and a real kit have the same file
 * names, so swapping one for the other touches no screen.
 *
 *   validate    --brand <brand.json>                   schema + WCAG AA contrast of the brand colours
 *   concepts    --brand <brand.json> [--out <dir>]     3–4 directions on one sheet, for the owner to pick
 *   build       --brand <brand.json> [--out <dir>]     every slot asset, README.md, preview.png
 *               [--adjust] [--svg-only] [--browser <msedge>]
 *   placeholder --name "<product>" --out <dir>         a neutral kit with the real kit's file names
 *               [--svg-only]
 *   check       --out <dir>                            every slot file present, PNGs the right size, not blank
 *
 * --out defaults to the folder brand.json is in (the product's `brand/`). --adjust moves a colour
 * that fails its contrast pair along its own lightness, hue and saturation kept, and rewrites
 * brand.json with the change listed; the bar is never lowered. PNG and ICO are rendered in headless
 * Edge over the DevTools pipe ui-snap uses; Chrome is never used. --svg-only skips them.
 *
 * Exit 0 clean · 1 findings · 2 usage error.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contrast, parseHex } from './design-system.mjs';
import { loadFont } from './lib/font.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FONTS = {
  display: { file: join(HERE, 'lib', 'fonts', 'nunito-700.woff'), license: 'OFL-1.1' },
  text: { file: join(HERE, 'lib', 'fonts', 'nunito-400.woff'), license: 'OFL-1.1' },
};

// ---------------------------------------------------------------------------------------------
// The contract: brand.json, the slots, the contrast bar
// ---------------------------------------------------------------------------------------------

export const COLOR_KEYS = ['primary', 'accent', 'ink', 'muted', 'paper', 'bg'];
export const STYLES = ['tile', 'ring', 'stack', 'spark'];
const KEYS = new Set(['name', 'tagline', 'colors', 'dark', 'fonts', 'mark', 'placeholder', 'adjusted']);
/** Licences that allow a font to be outlined into a logo and shipped: the OFL family and its peers. */
const FREE_FONT = /\b(OFL|SIL|Apache|UFL|Ubuntu Font|MIT|CC0|public domain)\b/i;

/**
 * Every asset a screen may reference, by slot. The paths are the contract: a placeholder kit and
 * the real one write the same files, so a later brand is a swap of files and tokens, never of
 * screens. `size` is checked on PNGs.
 */
export const SLOTS = [
  { slot: 'mark', file: 'logo/mark.svg', use: 'the symbol at 64 px and up: sign-in, about, splash' },
  { slot: 'mark', file: 'logo/mark-small.svg', use: 'the symbol at 48 px and below: a simplified drawing, not a scaled one' },
  { slot: 'wordmark', file: 'logo/wordmark.svg', use: 'header and footer on a light page' },
  { slot: 'wordmark', file: 'logo/wordmark-dark.svg', use: 'header and footer on a dark page' },
  { slot: 'lockup', file: 'logo/lockup.svg', use: 'mark + name + tagline: sign-in panel, landing hero (light)' },
  { slot: 'lockup', file: 'logo/lockup-dark.svg', use: 'the same on a dark page' },
  { slot: 'favicon', file: 'icons/favicon.svg', use: '<link rel="icon" type="image/svg+xml">' },
  { slot: 'favicon', file: 'icons/favicon.ico', use: '<link rel="icon" sizes="any"> (16, 32, 48)', raster: true },
  { slot: 'favicon', file: 'icons/apple-touch-icon.png', size: [180, 180], use: '<link rel="apple-touch-icon">', raster: true },
  { slot: 'favicon', file: 'icons/icon-192.png', size: [192, 192], use: 'web manifest', raster: true },
  { slot: 'favicon', file: 'icons/icon-512.png', size: [512, 512], use: 'web manifest', raster: true },
  { slot: 'favicon', file: 'icons/icon-maskable-512.png', size: [512, 512], use: 'web manifest, purpose maskable (mark inside the 80 % safe zone)', raster: true },
  { slot: 'favicon', file: 'icons/site.webmanifest', use: '<link rel="manifest">' },
  { slot: 'share', file: 'social/share-card.svg', use: 'source of the share image' },
  { slot: 'share', file: 'social/share-card.png', size: [1200, 630], use: 'og:image and twitter:image', raster: true },
  { slot: 'illustration', file: 'illustrations/404.svg', use: 'the not-found page (light)' },
  { slot: 'illustration', file: 'illustrations/404-dark.svg', use: 'the not-found page (dark)' },
  { slot: 'illustration', file: 'illustrations/empty.svg', use: 'an empty state: nothing exists yet (light)' },
  { slot: 'illustration', file: 'illustrations/empty-dark.svg', use: 'the same (dark)' },
  { slot: 'illustration', file: 'illustrations/no-results.svg', use: 'an empty state: a filter matched nothing (light)' },
  { slot: 'illustration', file: 'illustrations/no-results-dark.svg', use: 'the same (dark)' },
  { slot: 'email', file: 'email/logo-email.png', size: [240, 60], use: 'email header (clients do not render SVG)', raster: true },
  { slot: 'email', file: 'email/logo-email@2x.png', size: [480, 120], use: 'the same for sharp screens', raster: true },
  { slot: 'tokens', file: 'brand.css', use: '--brand-* colour tokens, light and dark; mapped into the design system' },
];

/**
 * The pairs the brand colours are held to. Text is 4.5:1 (WCAG 1.4.3); a mark or an illustration
 * shape against the page is 3:1 (1.4.11). `paper` is the letter and the light shapes on the mark's
 * tile, and the background of the email logo; `bg` is the page. `themes` limits a pair to the
 * theme it is used in, and `adjust` names the token that moves when it fails (never the page).
 */
export const BRAND_PAIRS = [
  { fg: 'ink', bg: 'bg', need: 4.5, adjust: 'fg', why: 'name and body text on the page' },
  { fg: 'muted', bg: 'bg', need: 4.5, adjust: 'fg', why: 'the tagline on the page' },
  { fg: 'ink', bg: 'paper', need: 4.5, adjust: 'fg', why: 'the name in the email logo, on paper', themes: ['light'] },
  { fg: 'paper', bg: 'primary', need: 4.5, adjust: 'bg', why: 'the letter on the mark, a primary button label' },
  { fg: 'primary', bg: 'bg', need: 3, adjust: 'fg', why: 'the mark against the page' },
  { fg: 'accent', bg: 'bg', need: 3, adjust: 'fg', why: 'accent shapes in the illustrations' },
];

/** The pairs that apply to a theme. */
export const pairsFor = (theme) => BRAND_PAIRS.filter((p) => !p.themes || p.themes.includes(theme));

/** The problems in a parsed brand.json; empty means usable. Fonts are checked relative to `base`. */
export function validateBrand(b, base = '.') {
  const out = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['brand.json must be an object'];
  for (const k of Object.keys(b)) if (!KEYS.has(k)) out.push(`unknown key \`${k}\` — allowed: ${[...KEYS].join(', ')}`);
  if (typeof b.name !== 'string' || !b.name.trim()) out.push('name is required: the product name, as it is written');
  else if (b.name.length > 40) out.push('name is longer than 40 characters — a wordmark that long does not fit a header');
  if (typeof b.tagline !== 'string' || !b.tagline.trim()) out.push('tagline is required: one line saying what the product is');
  else if (b.tagline.length > 90) out.push('tagline is longer than 90 characters — it must fit two lines of the share card');
  const c = b.colors ?? {};
  for (const k of COLOR_KEYS) if (!parseHex(c[k] ?? '')) out.push(`colors.${k} = \`${c[k]}\` is not a #rrggbb hex`);
  for (const k of Object.keys(c)) if (!COLOR_KEYS.includes(k)) out.push(`colors.${k} is not a brand colour (${COLOR_KEYS.join(', ')})`);
  if (b.dark !== undefined) {
    if (typeof b.dark !== 'object' || Array.isArray(b.dark)) out.push('dark must be an object of colour overrides');
    else for (const [k, v] of Object.entries(b.dark)) {
      if (!COLOR_KEYS.includes(k)) out.push(`dark.${k} is not a brand colour (${COLOR_KEYS.join(', ')})`);
      else if (!parseHex(v)) out.push(`dark.${k} = \`${v}\` is not a #rrggbb hex`);
    }
  }
  if (b.mark !== undefined) {
    if (b.mark.style !== undefined && !STYLES.includes(b.mark.style)) out.push(`mark.style \`${b.mark.style}\` — one of ${STYLES.join(', ')}`);
    if (b.mark.letter !== undefined && [...String(b.mark.letter)].length !== 1) out.push('mark.letter is one character');
  }
  for (const role of ['display', 'text']) {
    const f = b.fonts?.[role];
    if (f === undefined) continue;
    if (typeof f?.file !== 'string') { out.push(`fonts.${role} is { "file": "<.ttf or .woff>", "license": "OFL-1.1" }`); continue; }
    if (!FREE_FONT.test(String(f.license ?? ''))) out.push(`fonts.${role}.license \`${f.license ?? ''}\` — the letters are outlined into the logo and shipped, so the font must be OFL-like (OFL, Apache, UFL, MIT, CC0)`);
    if (!existsSync(resolve(base, f.file))) out.push(`fonts.${role}.file ${f.file} does not exist (relative to brand.json)`);
  }
  if (b.placeholder !== undefined && typeof b.placeholder !== 'boolean') out.push('placeholder is true or false');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Colour: palettes per theme, contrast, and moving a colour along its own lightness
// ---------------------------------------------------------------------------------------------

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** `a` blended toward `b` by t (0 = a, 1 = b), for tints inside an asset. */
export function mix(a, b, t) {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/**
 * The nearest colour to `hex` with the same hue and saturation that reaches `need` against
 * `against`, moving lightness away from it; null when no lightness reaches it.
 */
export function adjustToPass(hex, against, need) {
  if (contrast(hex, against) >= need) return hex;
  const [h, s, l] = rgbToHsl(parseHex(hex));
  const darker = rgbToHsl(parseHex(against))[2] >= 0.5;
  for (let step = 1; step <= 100; step += 1) {
    const L = darker ? l - step / 100 : l + step / 100;
    if (L < 0 || L > 1) break;
    const c = toHex(hslToRgb([h, s, L]));
    if (contrast(c, against) >= need) return c;
  }
  return null;
}

/**
 * The light and dark palettes. Dark defaults to the light page inverted (ink becomes the page,
 * paper the text) with every other colour moved, within its hue, until it passes on that page;
 * `brand.dark` overrides any of them and is then checked as given.
 */
export function palettes(b) {
  const light = { ...b.colors };
  const given = b.dark ?? {};
  const dark = { bg: given.bg ?? b.colors.ink, ink: given.ink ?? b.colors.paper, paper: given.paper ?? b.colors.paper };
  dark.muted = given.muted ?? adjustToPass(b.colors.muted, dark.bg, 4.5) ?? b.colors.muted;
  dark.primary = given.primary ?? adjustToPass(b.colors.primary, dark.bg, 3) ?? b.colors.primary;
  dark.accent = given.accent ?? adjustToPass(b.colors.accent, dark.bg, 3) ?? b.colors.accent;
  return { light, dark };
}

/** Every failing pair in either theme, each with the colour that would pass. Empty means AA holds. */
export function contrastProblems(b) {
  const out = [];
  for (const [theme, c] of Object.entries(palettes(b))) {
    for (const p of pairsFor(theme)) {
      const ratio = contrast(c[p.fg], c[p.bg]);
      if (ratio >= p.need) continue;
      const token = p.adjust === 'fg' ? p.fg : p.bg;
      const other = p.adjust === 'fg' ? c[p.bg] : c[p.fg];
      out.push({ theme, fg: p.fg, bg: p.bg, ratio, need: p.need, why: p.why, token, from: c[token], to: adjustToPass(c[token], other, p.need) });
    }
  }
  return out;
}

/** brand.json with every failing colour moved to its passing shade, and the changes listed. */
export function applyAdjustments(b) {
  const next = JSON.parse(JSON.stringify(b));
  const changes = [];
  for (let round = 0; round < 4; round += 1) {
    const probs = contrastProblems(next);
    if (!probs.length) break;
    for (const p of probs) {
      if (!p.to) continue;
      const where = p.theme === 'light' ? 'colors' : 'dark';
      next[where] = next[where] ?? {};
      next[where][p.token] = p.to;
      changes.push(`${where}.${p.token} ${p.from} → ${p.to} (${p.fg} on ${p.bg} was ${p.ratio.toFixed(2)}:1, needs ${p.need}:1)`);
    }
  }
  if (changes.length) next.adjusted = [...(b.adjusted ?? []), ...changes];
  return { brand: next, changes };
}

// ---------------------------------------------------------------------------------------------
// Drawing: every asset is SVG from the palette and outlined letters
// ---------------------------------------------------------------------------------------------

/** The fonts a brand uses, loaded once. */
export function brandFonts(b, base = '.') {
  const pick = (role) => (b.fonts?.[role] ? resolve(base, b.fonts[role].file) : DEFAULT_FONTS[role].file);
  return { display: loadFont(pick('display')), text: loadFont(pick('text')) };
}

/** The bounding box of path data made of coordinate pairs (control points included: a safe box). */
function bbox(d) {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** A letter centred on (cx, cy), cap height `cap` px. */
function centredLetter(font, ch, cap, cx, cy, fill) {
  const size = cap * (font.unitsPerEm / font.capHeight);
  const probe = font.outline(ch, size, 0, 0);
  const box = bbox(probe.d);
  const o = font.outline(ch, size, cx - box.x0 - box.w / 2, cy - box.y0 - box.h / 2);
  return `<path fill="${fill}" d="${o.d}"/>`;
}

const spark = (cx, cy, r, fill) => {
  const w = r * 0.3;
  return `<path fill="${fill}" d="M${cx} ${cy - r}Q${cx + w} ${cy - w} ${cx + r} ${cy}Q${cx + w} ${cy + w} ${cx} ${cy + r}Q${cx - w} ${cy + w} ${cx - r} ${cy}Q${cx - w} ${cy - w} ${cx} ${cy - r}Z"/>`;
};

/**
 * The mark's drawing on a 512 square. `small` is the ≤ 48 px drawing: bigger shapes, details
 * dropped, because a thin arc or a dot becomes a smudge at 16 px. `bleed` fills the square edge to
 * edge and keeps the symbol inside the central 80 % (maskable and apple-touch icons).
 */
export function markBody(b, fonts, { style = b.mark?.style ?? 'tile', small = false, bleed = false } = {}) {
  const c = b.colors;
  const letter = b.mark?.letter ?? [...b.name.trim()][0].toUpperCase();
  const k = bleed ? 0.8 : 1; // shapes inside the safe zone when the tile bleeds
  const inner = (s) => (bleed ? `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${s}</g>` : s);
  const tile = (fill) => (bleed ? `<rect width="512" height="512" fill="${fill}"/>` : style === 'ring' ? `<circle cx="256" cy="256" r="256" fill="${fill}"/>` : `<rect width="512" height="512" rx="${small ? 96 : 112}" fill="${fill}"/>`);
  if (style === 'tile') {
    const glyph = centredLetter(fonts.display, letter, small ? 300 : 250, small ? 256 : 244, 256, c.paper);
    const dot = small ? '' : `<circle cx="382" cy="352" r="34" fill="${c.accent}"/>`;
    return tile(c.primary) + inner(glyph + dot);
  }
  if (style === 'ring') {
    const glyph = centredLetter(fonts.display, letter, small ? 290 : 220, 256, 256, c.paper);
    const arc = small ? '' : `<path d="M96 300A164 164 0 0 0 330 402" fill="none" stroke="${c.accent}" stroke-width="34" stroke-linecap="round"/>`;
    return tile(c.primary) + inner(glyph + arc);
  }
  if (style === 'stack') {
    const bars = small
      ? `<rect x="104" y="150" width="304" height="84" rx="42" fill="${c.paper}"/><rect x="104" y="278" width="304" height="84" rx="42" fill="${c.accent}"/>`
      : `<rect x="112" y="128" width="208" height="60" rx="30" fill="${c.accent}"/><rect x="112" y="226" width="288" height="60" rx="30" fill="${c.paper}"/><rect x="112" y="324" width="248" height="60" rx="30" fill="${c.paper}" opacity=".72"/>`;
    return tile(c.primary) + inner(bars);
  }
  const big = spark(256, 256, small ? 190 : 160, c.paper);
  const little = small ? '' : spark(382, 136, 52, c.accent);
  return tile(c.primary) + inner(big + little);
}

const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${title ? ` role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>` : '>'}${body}</svg>\n`;
const esc = (s) => String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]);
const place = (body, x, y, size) => `<g transform="translate(${x} ${y}) scale(${(size / 512).toFixed(5)})">${body}</g>`;

export function markSvg(b, fonts, opts = {}) {
  return svg(512, 512, markBody(b, fonts, opts), b.name);
}

/** Mark + name, and the tagline under it for a lockup, on a light or dark page. */
export function wordmarkSvg(b, fonts, { dark = false, tagline = false } = {}) {
  const pal = palettes(b)[dark ? 'dark' : 'light'];
  const tileSize = 120;
  const gap = 28;
  const name = fonts.display.outline(b.name, 88, tileSize + gap, tagline ? 92 : 104, -1);
  const tag = tagline ? fonts.text.outline(b.tagline, 26, tileSize + gap + 2, 148) : null;
  const w = Math.ceil(tileSize + gap + Math.max(name.width, tag?.width ?? 0) + 8);
  const h = tagline ? 172 : 160;
  const mark = place(markBody(b, fonts), 0, tagline ? 26 : 20, tileSize);
  return svg(w, h, `${mark}<path fill="${pal.ink}" d="${name.d}"/>${tag ? `<path fill="${pal.muted}" d="${tag.d}"/>` : ''}`, tagline ? `${b.name} — ${b.tagline}` : b.name);
}

/** Lines of `text` no wider than `max` px at `size`, at most `lines`; the last one ellipsised. */
function wrap(font, text, size, max, lines = 2) {
  const out = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.outline(next, size).width <= max || !cur) cur = next;
    else { out.push(cur); cur = word; }
  }
  out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${kept[lines - 1]}…`;
    return kept;
  }
  return out;
}

/** The 1200 × 630 share image: mark, name, an accent rule and the tagline. */
export function shareCardSvg(b, fonts) {
  const c = b.colors;
  const x = 470;
  const room = 1200 - x - 90;
  let size = 112;
  while (size > 56 && fonts.display.outline(b.name, size).width > room) size -= 4;
  const name = fonts.display.outline(b.name, size, x, 300, -1);
  const lines = wrap(fonts.text, b.tagline, 36, room);
  const tag = lines.map((l, i) => `<path fill="${c.muted}" d="${fonts.text.outline(l, 36, x + 2, 400 + i * 50).d}"/>`).join('');
  const dots = [];
  for (let gx = 0; gx < 10; gx += 1) for (let gy = 0; gy < 5; gy += 1) dots.push(`<circle cx="${820 + gx * 36}" cy="${60 + gy * 36}" r="3"/>`);
  return svg(1200, 630, `<defs><linearGradient id="share-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${mix(c.bg, c.primary, 0.12)}"/></linearGradient></defs>`
    + '<rect width="1200" height="630" fill="url(#share-bg)"/>'
    + `<g fill="${c.ink}" opacity=".06">${dots.join('')}</g>`
    + `<rect x="${96 + 14}" y="${165 + 22}" width="300" height="300" rx="66" fill="${mix(c.primary, c.ink, 0.5)}" opacity=".18"/>`
    + place(markBody(b, fonts), 96, 165, 300)
    + `<path fill="${c.ink}" d="${name.d}"/>`
    + `<rect x="${x + 2}" y="334" width="112" height="8" rx="4" fill="${c.accent}"/>`
    + tag, `${b.name} — ${b.tagline}`);
}

/**
 * The slot illustrations: simple compositions of the mark, the palette and a few shapes, so the
 * 404 and the empty states look like this product and change with its brand.
 */
export function illustrationSvg(b, fonts, kind, { dark = false } = {}) {
  const pal = palettes(b)[dark ? 'dark' : 'light'];
  const tint = mix(pal.bg, pal.primary, dark ? 0.22 : 0.12);
  const deep = mix(pal.bg, pal.primary, dark ? 0.42 : 0.28);
  const small = markBody(b, fonts, { small: true });
  if (kind === '404') {
    const four = (x) => fonts.display.outline('4', 120, x, 205);
    const a = four(0);
    const gapW = 96;
    const total = a.width * 2 + gapW;
    const x0 = 200 - total / 2;
    return svg(400, 300, `<ellipse cx="200" cy="168" rx="176" ry="112" fill="${tint}"/>`
      + `<path fill="${pal.muted}" d="${four(x0).d}"/><path fill="${pal.muted}" d="${four(x0 + a.width + gapW).d}"/>`
      + place(small, x0 + a.width + 8, 112, 80)
      + `<path d="M58 262C138 228 252 290 342 246" fill="none" stroke="${pal.accent}" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 16"/>`
      + spark(318, 70, 14, pal.accent) + spark(80, 98, 9, pal.accent), 'Page not found');
  }
  if (kind === 'empty') {
    return svg(240, 180, `<ellipse cx="120" cy="104" rx="108" ry="66" fill="${tint}"/>`
      + `<ellipse cx="120" cy="80" rx="22" ry="5" fill="${deep}"/>`
      + place(small, 96, 22, 48)
      + `<path d="M58 104h124l-10 46a8 8 0 0 1-8 6H76a8 8 0 0 1-8-6Z" fill="${deep}"/>`
      + `<path d="M50 96h140a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6Z" fill="${pal.primary}"/>`
      + spark(184, 46, 9, pal.accent) + spark(54, 58, 6, pal.accent), 'Nothing here yet');
  }
  return svg(240, 180, `<ellipse cx="120" cy="96" rx="108" ry="68" fill="${tint}"/>`
    + `<rect x="138" y="112" width="18" height="58" rx="9" transform="rotate(-45 147 141)" fill="${pal.muted}"/>`
    + `<circle cx="110" cy="80" r="46" fill="${pal.bg}" stroke="${pal.muted}" stroke-width="10"/>`
    + `<g opacity=".9">${place(small, 90, 60, 40)}</g>`
    + spark(186, 40, 8, pal.accent) + spark(48, 132, 6, pal.accent), 'No results');
}

/** The colour tokens screens read: `--brand-*`, light and dark, switched like tokens.css. */
export function brandCss(b) {
  const { light, dark } = palettes(b);
  const vars = (p) => COLOR_KEYS.map((k) => `  --brand-${k}: ${p[k]};`).join('\n');
  return `/* Generated by brand.mjs from brand.json. Do not edit — change brand.json and rebuild. */\n:root {\n${vars(light)}\n}\n`
    + `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${vars(dark).replace(/^/gm, '  ')}\n  }\n}\n:root[data-theme="dark"] {\n${vars(dark)}\n}\n`;
}

export function manifest(b) {
  return `${JSON.stringify({
    name: b.name, short_name: b.name, description: b.tagline, theme_color: b.colors.primary, background_color: b.colors.bg, display: 'standalone',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2)}\n`;
}

/** An ICO that holds PNGs (every browser since IE Vista-era reads it). */
export function ico(pngs) {
  const head = Buffer.alloc(6 + pngs.length * 16);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

/** Width and height from a PNG header, or null. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

// ---------------------------------------------------------------------------------------------
// The kit on disk
// ---------------------------------------------------------------------------------------------

/** Every SVG and text file of the kit, by slot path. */
export function vectorFiles(b, fonts) {
  return {
    'logo/mark.svg': markSvg(b, fonts),
    'logo/mark-small.svg': markSvg(b, fonts, { small: true }),
    'logo/wordmark.svg': wordmarkSvg(b, fonts),
    'logo/wordmark-dark.svg': wordmarkSvg(b, fonts, { dark: true }),
    'logo/lockup.svg': wordmarkSvg(b, fonts, { tagline: true }),
    'logo/lockup-dark.svg': wordmarkSvg(b, fonts, { tagline: true, dark: true }),
    'icons/favicon.svg': markSvg(b, fonts, { small: true }),
    'icons/site.webmanifest': manifest(b),
    'social/share-card.svg': shareCardSvg(b, fonts),
    'illustrations/404.svg': illustrationSvg(b, fonts, '404'),
    'illustrations/404-dark.svg': illustrationSvg(b, fonts, '404', { dark: true }),
    'illustrations/empty.svg': illustrationSvg(b, fonts, 'empty'),
    'illustrations/empty-dark.svg': illustrationSvg(b, fonts, 'empty', { dark: true }),
    'illustrations/no-results.svg': illustrationSvg(b, fonts, 'no-results'),
    'illustrations/no-results-dark.svg': illustrationSvg(b, fonts, 'no-results', { dark: true }),
    'brand.css': brandCss(b),
  };
}

/** What the browser renders: [svg, width, height, slot path, opaque background or null]. */
export function rasterJobs(b, fonts) {
  const email = (w, h) => {
    const name = fonts.display.outline(b.name, 30, 0, 0);
    const scale = w / 240;
    const body = place(markBody(b, fonts, { small: true }), 12, 8, 44) + `<path fill="${b.colors.ink}" d="${fonts.display.outline(b.name, 30, 68, 41).d}"/>`;
    const width = Math.min(240, 68 + name.width + 12);
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${b.colors.paper}"/><g transform="translate(${((240 - width) / 2) * scale} 0) scale(${scale})">${body}</g>`);
  };
  const icon = (s, opts = {}) => svg(s, s, place(markBody(b, fonts, opts), 0, 0, s));
  return [
    ...[16, 32, 48].map((s) => [icon(s, { small: true }), s, s, `icons/icon-${s}.png`]),
    [icon(180, { bleed: true }), 180, 180, 'icons/apple-touch-icon.png'],
    [icon(192), 192, 192, 'icons/icon-192.png'],
    [icon(512), 512, 512, 'icons/icon-512.png'],
    [icon(512, { bleed: true }), 512, 512, 'icons/icon-maskable-512.png'],
    [shareCardSvg(b, fonts), 1200, 630, 'social/share-card.png'],
    [email(240, 60), 240, 60, 'email/logo-email.png'],
    [email(480, 120), 480, 120, 'email/logo-email@2x.png'],
  ];
}

/** Headless Edge only: the flag, $UI_SNAP_BROWSER, or Edge's install paths. Never Chrome. */
async function edge(flag) {
  const { findBrowser } = await import('./ui-snap.mjs');
  if (flag && !/edge/i.test(flag)) throw new Error(`--browser ${flag} is not Edge — brand assets are rendered in headless Edge only`);
  return findBrowser({ flag, exists: (p) => /edge/i.test(p) && existsSync(p) });
}

const FRAME = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';

/** Render each [html file, w, h] in one Edge, transparent where the page is; `full` measures height. */
async function shootPages(browser, pages) {
  const { launchBrowser } = await import('./ui-snap.mjs');
  const { cdp, close } = launchBrowser(browser);
  const out = [];
  try {
    for (const { file, w, h, full } of pages) {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const s = (m, p) => cdp.send(m, p, sessionId);
      try {
        await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
        await s('Page.enable');
        const loaded = new Promise((r) => { const off = cdp.on((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
        const nav = await s('Page.navigate', { url: pathToFileURL(file).href });
        if (nav.errorText) throw new Error(`${nav.errorText} loading ${file}`);
        await Promise.race([loaded, new Promise((r) => { setTimeout(r, 5000); })]);
        await s('Runtime.evaluate', { expression: FRAME, awaitPromise: true });
        let height = h;
        if (full) {
          height = (await s('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true })).result.value;
          await s('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: 1, mobile: false });
          await s('Runtime.evaluate', { expression: FRAME, awaitPromise: true });
        }
        const shot = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height, scale: 1 } });
        out.push(Buffer.from(shot.data, 'base64'));
      } finally {
        await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
      }
    }
  } finally {
    await close();
  }
  return out;
}

const page = (body, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${bg}}svg{display:block}</style></head><body>${body}</body></html>`;

/** The sheet a person looks at: every asset at its real size, the small icons also enlarged. */
export function previewHtml(b) {
  const { light, dark } = palettes(b);
  const img = (p, w, extra = '') => `<img src="${p}"${w ? ` width="${w}"` : ''} style="${extra}" alt="">`;
  const swatches = COLOR_KEYS.map((k) => `<figure><span style="background:${light[k]}"></span><span style="background:${dark[k]}"></span><figcaption>${k}<br><code>${light[k]}</code> · <code>${dark[k]}</code></figcaption></figure>`).join('');
  const pairs = Object.entries({ light, dark }).flatMap(([t, c]) => pairsFor(t).map((p) => `<tr><td>${t}</td><td>${p.fg} on ${p.bg}</td><td>${contrast(c[p.fg], c[p.bg]).toFixed(2)}:1</td><td>${p.need}:1</td></tr>`)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.name)} brand</title><style>
body{margin:0;padding:32px;background:#eef0f3;font:14px/1.4 system-ui,sans-serif;color:#1d2330;display:grid;gap:20px;width:1136px}
section{background:#fff;border-radius:12px;padding:24px;display:flex;flex-wrap:wrap;gap:24px;align-items:end}
section.dark{background:${dark.bg};color:${dark.ink}} h2{width:100%;margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#5b6170}
section.dark h2{color:${dark.muted}} figure{margin:0;display:grid;gap:6px;justify-items:start} figcaption{font-size:12px;color:#5b6170}
section.dark figcaption{color:${dark.muted}} .px img{image-rendering:pixelated} figure span{display:inline-block;width:56px;height:28px;border-radius:6px;border:1px solid #0002}
table{border-collapse:collapse;font-size:12px} td{padding:2px 10px 2px 0}
</style></head><body>
<section><h2>${esc(b.name)}${b.placeholder ? ' — placeholder brand' : ''} · logo on light</h2>${img('logo/lockup.svg', 0, 'width:auto;height:86px')}${img('logo/wordmark.svg', 0, 'width:auto;height:56px')}${img('logo/mark.svg', 128)}${img('logo/mark-small.svg', 48)}</section>
<section class="dark"><h2>Logo on dark</h2>${img('logo/lockup-dark.svg', 0, 'width:auto;height:86px')}${img('logo/wordmark-dark.svg', 0, 'width:auto;height:56px')}</section>
<section><h2>Icons at real size, then the small ones at 4×</h2>${['icon-512.png', 'icon-maskable-512.png'].map((f) => `<figure>${img(`icons/${f}`, 160)}<figcaption>${f} (shown at 160)</figcaption></figure>`).join('')}${['apple-touch-icon.png', 'icon-192.png'].map((f) => `<figure>${img(`icons/${f}`, f.includes('180') || f.includes('apple') ? 180 : 192)}<figcaption>${f}</figcaption></figure>`).join('')}${[48, 32, 16].map((s) => `<figure>${img(`icons/icon-${s}.png`, s)}<figcaption>${s}</figcaption></figure>`).join('')}<span class="px">${[48, 32, 16].map((s) => img(`icons/icon-${s}.png`, s * 4)).join(' ')}</span></section>
<section><h2>Share image (1200 × 630, shown at half)</h2>${img('social/share-card.png', 600)}<figure>${img('email/logo-email.png', 240)}${img('email/logo-email@2x.png', 240)}<figcaption>email logo, 1× and 2× (shown at 240)</figcaption></figure></section>
<section><h2>Illustrations, light</h2>${img('illustrations/404.svg', 400)}${img('illustrations/empty.svg', 240)}${img('illustrations/no-results.svg', 240)}</section>
<section class="dark"><h2>Illustrations, dark</h2>${img('illustrations/404-dark.svg', 400)}${img('illustrations/empty-dark.svg', 240)}${img('illustrations/no-results-dark.svg', 240)}</section>
<section><h2>Colours (light · dark) and contrast</h2>${swatches}<table>${pairs}</table></section>
</body></html>`;
}

/** The brand's README: the slot table a screen and a G6 task read, the tokens, the contrast. */
export function readme(b, changes = []) {
  const { light, dark } = palettes(b);
  const L = [`# ${b.name} — brand kit`, '', `${b.tagline}`, ''];
  if (b.placeholder) L.push('> **Placeholder brand.** Every file below exists at its final path, drawn neutral. When the real brand is chosen, replace `brand.json` and rebuild: the screens reference these paths, so none of them changes.', '');
  L.push('Built by `brand.mjs build` from `brand.json`. Do not edit the files by hand: change `brand.json` and rebuild.', '');
  L.push('## Slots', '', 'Screens reference these paths; a brand change is a rebuild into the same paths.', '', '| Slot | File | Goes to |', '|---|---|---|');
  for (const s of SLOTS) L.push(`| ${s.slot} | \`${s.file}\` | ${s.use} |`);
  L.push('', '## Colour tokens', '', '| Token | Light | Dark |', '|---|---|---|');
  for (const k of COLOR_KEYS) L.push(`| \`--brand-${k}\` | \`${light[k]}\` | \`${dark[k]}\` |`);
  L.push('', 'In the design system, `--brand-primary` becomes `primary`, `--brand-paper` `primary-fg`, `--brand-ink` `text` and `--brand-muted` `text-muted` (`dev-defining-design-system`, "Brand slots").', '');
  L.push('## Contrast (WCAG 2.2 AA)', '', '| Theme | Pair | Ratio | Needs |', '|---|---|---|---|');
  for (const [t, c] of Object.entries({ light, dark })) for (const p of pairsFor(t)) L.push(`| ${t} | ${p.fg} on ${p.bg} (${p.why}) | ${contrast(c[p.fg], c[p.bg]).toFixed(2)}:1 | ${p.need}:1 |`);
  const adjusted = [...(b.adjusted ?? []), ...changes];
  if (adjusted.length) L.push('', 'Adjusted within the hue to pass (confirm with the owner):', '', ...adjusted.map((x) => `- ${x}`));
  const font = (role) => (b.fonts?.[role] ? `${b.fonts[role].file} (${b.fonts[role].license})` : 'Nunito, bundled (SIL OFL 1.1)');
  L.push('', '## Fonts', '', `Display: ${font('display')} · text: ${font('text')}. Letters are outlined to paths in every file, so no font is needed to show them.`, '');
  return `${L.join('\n')}`;
}

/** Write the vector files; then, unless svgOnly, render the PNGs, the ICO and the preview in Edge. */
export async function buildKit(b, { base = '.', out, svgOnly = false, browser = null, changes = [] }) {
  const fonts = brandFonts(b, base);
  for (const ch of new Set([...b.name, ...(b.mark?.letter ?? '')])) if (ch.trim() && !fonts.display.has(ch)) throw new Error(`the display font has no glyph for "${ch}" in the name — choose a font that covers it`);
  const write = (rel, data) => { const f = join(out, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); return f; };
  const files = vectorFiles(b, fonts);
  for (const [rel, data] of Object.entries(files)) write(rel, data);
  write('README.md', readme(b, changes));
  write('preview.html', previewHtml(b));
  if (svgOnly) return { written: Object.keys(files), raster: [] };
  const exe = await edge(browser);
  const tmp = mkdtempSync(join(tmpdir(), 'brand-'));
  try {
    const jobs = rasterJobs(b, fonts);
    const pages = jobs.map(([svgText, w, h], i) => { const f = join(tmp, `${i}.html`); writeFileSync(f, page(svgText)); return { file: f, w, h }; });
    const pngs = await shootPages(exe, [...pages, { file: join(out, 'preview.html'), w: 1200, h: 900, full: true }]);
    const preview = pngs.pop();
    jobs.forEach(([, , , rel], i) => write(rel, pngs[i]));
    write('icons/favicon.ico', ico([16, 32, 48].map((s) => ({ size: s, buf: pngs[jobs.findIndex((j) => j[3] === `icons/icon-${s}.png`)] }))));
    // preview.html references the PNGs, so it is shot again now they exist.
    const [sheet] = await shootPages(exe, [{ file: join(out, 'preview.html'), w: 1200, h: 900, full: true }]);
    write('preview.png', sheet ?? preview);
    return { written: Object.keys(files), raster: jobs.map((j) => j[3]).concat('icons/favicon.ico', 'preview.png') };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** What is wrong with a kit on disk: a missing slot, a PNG of the wrong size, a blank picture. */
export async function checkKit(dir) {
  const { blankColours } = await import('./ui-snap.mjs');
  const out = [];
  for (const s of SLOTS) {
    const f = join(dir, s.file);
    if (!existsSync(f) || !readFileSync(f).length) { out.push(`${s.file}: missing (${s.slot} slot)`); continue; }
    if (!s.file.endsWith('.png')) continue;
    const buf = readFileSync(f);
    const size = pngSize(buf);
    if (!size || (s.size && (size[0] !== s.size[0] || size[1] !== s.size[1]))) out.push(`${s.file}: ${size ? size.join('×') : 'not a PNG'}, expected ${s.size.join('×')}`);
    else if (blankColours(buf)) out.push(`${s.file}: blank — nothing rendered`);
  }
  if (!existsSync(join(dir, 'brand.json'))) out.push('brand.json: missing — the kit has no source to rebuild from');
  return out;
}

/** The directions sheet: each style as the mark at 512 (shown at 160) and 32, on light and dark. */
export function conceptsHtml(b, fonts) {
  const { dark } = palettes(b);
  const cell = (style) => {
    const big = svg(512, 512, markBody(b, fonts, { style }));
    const small = svg(512, 512, markBody(b, fonts, { style, small: true }));
    const name = fonts.display.outline(b.name, 40, 0, 0);
    const word = (fill) => svg(Math.ceil(name.width + 4), 52, `<path fill="${fill}" d="${fonts.display.outline(b.name, 40, 2, 40).d}"/>`);
    const tile = (bg, fill) => `<div style="background:${bg};padding:20px;border-radius:12px;display:flex;gap:16px;align-items:center"><div style="width:160px">${big.replace(/width="512" height="512"/, 'width="160" height="160"')}</div><div style="width:32px">${small.replace(/width="512" height="512"/, 'width="32" height="32"')}</div>${word(fill).replace(/<svg /, '<svg style="height:40px;width:auto" ')}</div>`;
    return `<div style="display:grid;gap:10px"><h2 style="margin:0;font:600 15px system-ui">${style}</h2>${tile(b.colors.bg, b.colors.ink)}${tile(dark.bg, dark.ink)}</div>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.name)} — directions</title></head><body style="margin:0;padding:28px;background:#eef0f3;display:grid;grid-template-columns:1fr 1fr;gap:24px;width:1144px;font:14px system-ui">${STYLES.map(cell).join('')}<p style="grid-column:1/-1;margin:0;color:#5b6170">Pick one and set <code>mark.style</code> in brand.json, then run <code>brand.mjs build</code>.</p></body></html>`;
}

/** The neutral brand for answer (c): same files, no colour choice made for anyone. */
export function placeholderBrand(name) {
  return {
    name, tagline: `${name} — brand to be chosen`, placeholder: true,
    colors: { primary: '#4b5563', accent: '#6b7280', ink: '#111827', muted: '#4b5563', paper: '#ffffff', bg: '#f9fafb' },
    mark: { style: 'tile' },
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function arg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function usage(msg) {
  console.error(`brand: ${msg}`);
  console.error('usage: brand.mjs validate|concepts|build --brand <brand.json> [--out <dir>] [--adjust] [--svg-only] [--browser <msedge>]');
  console.error('       brand.mjs placeholder --name "<product>" --out <dir> [--svg-only]   ·   brand.mjs check --out <dir>');
  return 2;
}

function report(problems, label) {
  for (const p of problems) console.log(`✗ ${p}`);
  if (problems.length) console.log(`brand: ${problems.length} problem(s) in ${label}`);
}

function contrastLines(probs) {
  return probs.map((p) => `${p.theme}: ${p.fg} on ${p.bg} is ${p.ratio.toFixed(2)}:1, needs ${p.need}:1 (${p.why}) — ${p.to ? `${p.token} ${p.from} → ${p.to} passes, same hue` : `no shade of ${p.token} passes; choose another colour`}`);
}

export async function main(argv) {
  const [cmd] = argv;
  if (cmd === 'check') {
    const dir = arg(argv, '--out');
    if (!dir) return usage('check needs --out <dir>');
    const probs = await checkKit(dir);
    report(probs, dir);
    if (!probs.length) console.log(`✓ ${SLOTS.length} slot files present, PNGs the right size and not blank`);
    return probs.length ? 1 : 0;
  }
  if (cmd === 'placeholder') {
    const name = arg(argv, '--name');
    const out = arg(argv, '--out');
    if (!name || !out) return usage('placeholder needs --name "<product>" --out <dir>');
    const b = placeholderBrand(name);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'brand.json'), `${JSON.stringify(b, null, 2)}\n`);
    await buildKit(b, { base: out, out, svgOnly: argv.includes('--svg-only'), browser: arg(argv, '--browser') });
    console.log(`brand: placeholder kit for ${name} in ${out.replace(/\\/g, '/')} — record the DEC listing every screen and asset that will change`);
    return 0;
  }
  if (!['validate', 'concepts', 'build'].includes(cmd)) return usage(cmd ? `unknown command ${cmd}` : 'give a command');
  const path = arg(argv, '--brand');
  if (!path || !existsSync(path)) return usage('--brand <brand.json> is required and must exist');
  const base = dirname(resolve(path));
  let b;
  try { b = JSON.parse(readFileSync(path, 'utf8')); } catch (err) { console.log(`✗ ${path}: not JSON (${err.message})`); return 1; }
  const problems = validateBrand(b, base);
  if (problems.length) { report(problems, path); return 1; }
  let changes = [];
  if (cmd !== 'concepts') {
    let probs = contrastProblems(b);
    if (probs.length && cmd === 'build' && argv.includes('--adjust')) {
      ({ brand: b, changes } = applyAdjustments(b));
      writeFileSync(path, `${JSON.stringify(b, null, 2)}\n`);
      for (const c of changes) console.log(`~ ${c}`);
      probs = contrastProblems(b);
    }
    if (probs.length) {
      report(contrastLines(probs), `${path} (contrast)`);
      if (!argv.includes('--adjust')) console.log('brand: fix the colours, or rerun build with --adjust to move each within its hue (the owner confirms the result)');
      return 1;
    }
    if (cmd === 'validate') { console.log(`✓ ${b.name}: brand.json valid, ${pairsFor("light").length + pairsFor("dark").length} contrast pairs pass (light and dark)`); return 0; }
  }
  const out = resolve(arg(argv, '--out') ?? base);
  if (cmd === 'concepts') {
    const fonts = brandFonts(b, base);
    mkdirSync(out, { recursive: true });
    const html = join(out, 'concepts.html');
    writeFileSync(html, conceptsHtml(b, fonts));
    if (!argv.includes('--svg-only')) {
      const [png] = await shootPages(await edge(arg(argv, '--browser')), [{ file: html, w: 1200, h: 900, full: true }]);
      writeFileSync(join(out, 'concepts.png'), png);
    }
    console.log(`brand: ${STYLES.length} directions in ${join(out, argv.includes('--svg-only') ? 'concepts.html' : 'concepts.png').replace(/\\/g, '/')} — the owner picks one (mark.style)`);
    return 0;
  }
  try {
    const r = await buildKit(b, { base, out, svgOnly: argv.includes('--svg-only'), browser: arg(argv, '--browser'), changes });
    console.log(`brand: ${b.name} — ${r.written.length + r.raster.length} files in ${out.replace(/\\/g, '/')}${r.raster.length ? ' · look at preview.png at real size' : ' (vector only)'}`);
  } catch (err) {
    console.log(`✗ ${err.message}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  delete process.env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await main(process.argv.slice(2));
}
