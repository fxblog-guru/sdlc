#!/usr/bin/env node
/**
 * ui-rubric.mjs — measure a rendered page against the design rules a screenshot only shows.
 *
 * ui-snap puts a screen beside the approved visual for a human. This script measures what a human
 * misses on the twentieth screen: a table that scrolls the whole page sideways at 1024, a column
 * whose text is cut off, two primary buttons fighting in one header, type sizes that are not on the
 * scale, boxes nested four deep, a warning badge the same colour as the danger badge. Those shipped
 * in release-management with every gate green. Each is a number a check can fail on.
 *
 *   node dev/scripts/ui-rubric.mjs --url list=http://localhost:5173/releases --url login=… \
 *     --widths 1024,360 --tokens dev/docs [--out dev/implementation/<slug>/ui-rubric.json]
 *
 *   --url <name>=<url>   a page (repeatable); file paths are turned into file:// URLs
 *   --widths <list>      px, or breakpoint names read from --tokens (default 1024,768,360)
 *   --tokens <dir>       design-tokens.json: the type scale and space scale to judge against
 *   --height <px>        viewport height (default 900) · --wait <ms> render budget (default 3000)
 *   --browser <path>     Edge or Chrome, as ui-snap finds it
 *   --out <file>         also write every finding as JSON
 *   --axe <file>         axe.min.js to inject (default: resolve axe-core from the current directory)
 *   --pseudo             a pseudo-locale run: every text node is accented and lengthened by 40% before
 *                        measuring, so truncation and overflow from a longer language show now
 *                        (DEV-CONTRACTS §13.13). Results are named `<name>~pseudo`.
 *
 * Hard fails (exit 1): horizontal page overflow · a clipped table column or cell · more than one
 * primary button in a view · a pointer target under 24 × 24 px with another target within reach
 * (WCAG 2.5.8) · a control covered by a sticky or fixed element when focused (WCAG 2.4.11).
 * Advisory, from DEV-CONTRACTS §13.13: more than 200 rendered rows in one list · an image with no
 * width/height, more than twice its rendered size, or below the fold without loading=lazy · an
 * animation still running under prefers-reduced-motion (every page is measured with it set). Advisory: font sizes off the type scale · spacing off the 4px grid ·
 * bordered boxes nested more than two deep · link cells that wrap · status colours closer than
 * ΔE00 20 · a heading less than 1.25× body · numeric cells not right-aligned · a status that is not
 * hue + icon + text · a truncated cell that shows fewer than ~8 characters · an empty state (`[data-empty]`) without icon, sentence and action · a sign-in
 * page with no product mark · header actions that do not collapse at a phone width. Advisories are
 * listed for the reviewer, never fail. The checklist they serve is dev-reviewing-ui/design-checklist.md.
 *
 * Accessibility: axe-core (WCAG 2.x A/AA rules) runs on every page view when the project has it —
 * `axe-core/axe.min.js` resolved from the current directory's node_modules, or `--axe <file>`.
 * A violation of impact serious or critical is a hard fail (`axe-serious`); moderate and minor are
 * advisory (`axe-moderate`). With no axe-core the run prints `axe: NOT RUN` and the reason, and
 * the other rules still decide the exit code. The bundle does not vendor it (580 KB; MPL-2.0).
 *
 * What the page must declare: a primary button is `[data-variant="primary"]`, `.btn-primary`,
 * `.btn.primary` or `button[type=submit]` outside a dialog, and a view is the page or one open
 * `[role=dialog]`. Status elements are `[data-status]`. A team using other names passes
 * `--primary <selector>` and `--status <selector>`.
 *
 * Exit 0 no hard fail · 1 a hard fail · 2 usage error or no browser.
 */

import { writeFileSync } from 'node:fs';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { findBrowser, launchBrowser } from './ui-snap.mjs';
import { deltaE } from './lib/color.mjs';

export const HARD = ['overflow', 'clipped-column', 'primary-count', 'axe-serious', 'target-size', 'focus-obscured'];
export const ADVISORY = ['crushed-column', 'type-off-scale', 'space-off-grid', 'nesting', 'wrapping-link', 'status-delta-e', 'heading-ratio', 'numeric-alignment', 'status-encoding', 'empty-state', 'auth-branding', 'header-actions', 'axe-moderate', 'long-list', 'image-assets', 'motion-reduce'];
export const LIMITS = { nesting: 2, statusDeltaE: 20, headingRatio: 1.25, grid: 4, target: 24, listRows: 200, imageScale: 2, pseudoGrowth: 0.4 };
export const DEFAULT_WIDTHS = [1024, 768, 360];

const DEFAULT_PRIMARY = '[data-variant="primary"], .btn-primary, .btn.primary, button.primary, button[type="submit"]';
const DEFAULT_STATUS = '[data-status]';

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv, ctx = {}) {
  const o = { urls: [], widths: null, tokensDir: null, height: 900, wait: 3000, browser: null, out: null, primary: DEFAULT_PRIMARY, status: DEFAULT_STATUS, axePath: undefined, pseudo: false };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--pseudo') { o.pseudo = true; i -= 1; continue; }
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    if (flag === '--url') {
      const k = value.indexOf('=');
      if (k <= 0) throw new Error(`\`${value}\` is not name=url`);
      const url = value.slice(k + 1);
      const [path, hash] = url.split('#');
      o.urls.push({ name: value.slice(0, k), url: /^[a-z]+:\/\//i.test(url) ? url : `${pathToFileURL(resolve(path)).href}${hash !== undefined ? `#${hash}` : ''}` });
    } else if (flag === '--widths') o.widths = value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (flag === '--tokens') o.tokensDir = value;
    else if (flag === '--height') o.height = Number(value);
    else if (flag === '--wait') o.wait = Number(value);
    else if (flag === '--browser') o.browser = value;
    else if (flag === '--out') o.out = value;
    else if (flag === '--primary') o.primary = value;
    else if (flag === '--status') o.status = value;
    else if (flag === '--axe') o.axePath = value;
    else throw new Error(`unknown option ${flag}`);
  }
  if (!o.urls.length) throw new Error('give at least one --url name=url');
  const tokens = ctx.tokens ?? (o.tokensDir && existsSync(join(o.tokensDir, 'design-tokens.json')) ? JSON.parse(readFileSync(join(o.tokensDir, 'design-tokens.json'), 'utf8')) : null);
  o.tokens = tokens;
  o.widths = (o.widths ?? DEFAULT_WIDTHS.map(String)).map((w) => {
    if (/^\d+$/.test(w)) return Number(w);
    const px = tokens?.breakpoints?.[w.replace(/^bp\./, '')];
    if (typeof px !== 'number') throw new Error(`width \`${w}\` is not a number or a breakpoint in --tokens`);
    return px;
  });
  return o;
}

/**
 * axe-core's browser build, from `--axe` or the project's node_modules (resolved from `from`, which
 * walks up parent directories as Node does). `{ source, path }`, or `{ source: null, reason }`.
 */
export function findAxe({ path, from = process.cwd() } = {}) {
  let file = path;
  if (!file) {
    try { file = createRequire(join(resolve(from), 'noop.js')).resolve('axe-core/axe.min.js'); } catch {
      return { source: null, reason: `axe-core is not installed in ${resolve(from)} or a parent (npm i -D axe-core), or pass --axe <axe.min.js>` };
    }
  }
  if (!existsSync(file)) return { source: null, reason: `${file} does not exist` };
  return { source: readFileSync(file, 'utf8'), path: file };
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const AXE_RUN = `axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} }, resultTypes: ['violations'] })
  .then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => [].concat(n.target).join(' ')) })))`;

/** The type sizes a page may use: every schema 1 scale step and every schema 2 role. */
export function typeScale(tokens) {
  if (!tokens?.type) return null;
  const sizes = new Set();
  for (const v of Object.values(tokens.type.scale ?? {})) if (Array.isArray(v)) sizes.add(v[0]);
  for (const v of Object.values(tokens.type.roles ?? {})) if (typeof v?.size === 'number') sizes.add(v.size);
  return sizes.size ? [...sizes].sort((a, b) => a - b) : null;
}

// ---------------------------------------------------------------------------------------------
// The measurement — runs inside the page
// ---------------------------------------------------------------------------------------------

/**
 * Collects raw facts about the rendered page. Kept free of judgement so `judge` can be tested on
 * plain objects; serialised with toString() and evaluated in the page, so it may use only the DOM.
 */
export function measurePage(cfg) {
  /* global document, window, getComputedStyle */
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const doc = document.documentElement;
  const out = { viewport: window.innerWidth, scrollWidth: Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0), clipped: [], crushed: [], primaries: [], fonts: {}, spacing: {}, nesting: [], wrappingLinks: [], statuses: [], headings: {}, bodySize: null };

  // Clipped cells: content wider than the cell, and the overflow hidden (cut off, or ellipsed with
  // no title to recover the text). A cell that scrolls inside a scroll container is not clipped.
  for (const cell of document.querySelectorAll('th, td, [role="columnheader"], [role="cell"], [role="gridcell"]')) {
    if (!visible(cell)) continue;
    const s = getComputedStyle(cell);
    const kids = [cell, ...cell.querySelectorAll('*')];
    const cut = kids.find((k) => k.scrollWidth > k.clientWidth + 1 && ['hidden', 'clip'].includes(getComputedStyle(k).overflowX));
    const ellipsed = kids.find((k) => getComputedStyle(k).textOverflow === 'ellipsis' && k.scrollWidth > k.clientWidth + 1);
    const recoverable = ellipsed && (ellipsed.title || ellipsed.closest('[title]'));
    // Cut off by a container: an ancestor that hides overflow (not one that scrolls, which the user
    // can still reach) ends before the cell does. A page wider than the viewport is `overflow`.
    let hidden = false;
    const r = cell.getBoundingClientRect();
    for (let p = cell.parentElement; p && p !== document.body && !hidden; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (['hidden', 'clip'].includes(ox) && r.right > p.getBoundingClientRect().right + 1) hidden = true;
      if (['auto', 'scroll'].includes(ox)) break;
    }
    void s;
    if ((cut && !ellipsed) || (ellipsed && !recoverable) || hidden) out.clipped.push(label(cell));
    // Recoverable but crushed: an ellipsis that leaves a handful of characters ("Che…") is a column
    // the layout starved, not one that was truncated by design.
    else if (ellipsed && ellipsed.clientWidth < 8 * parseFloat(getComputedStyle(ellipsed).fontSize) * 0.55) out.crushed.push(label(cell));
  }

  // Primary buttons per view: the page outside dialogs, and each open dialog.
  const views = [{ name: 'page', root: document.body, dialog: false }];
  for (const d of document.querySelectorAll('[role="dialog"], dialog[open]')) if (visible(d)) views.push({ name: `dialog ${label(d)}`, root: d, dialog: true });
  for (const v of views) {
    const btns = [...v.root.querySelectorAll(cfg.primary)].filter((b) => visible(b) && (v.dialog || !b.closest('[role="dialog"], dialog')));
    out.primaries.push({ view: v.name, count: btns.length, labels: btns.map(label) });
  }

  // Font sizes and paddings/gaps in use, by element count.
  const walker = document.createTreeWalker(document.body, 1);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      const fs = Math.round(parseFloat(s.fontSize) * 10) / 10;
      out.fonts[fs] = (out.fonts[fs] || []).concat(out.fonts[fs]?.length >= 3 ? [] : [label(el)]);
    }
    // Above MAX_SPACING a value is layout, not spacing: an auto margin that pushes a footer down
    // computes to the free space, and a centred column's margin to half the leftover width.
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap', 'marginTop', 'marginBottom']) {
      const v = parseFloat(s[prop]);
      if (v > 1 && v <= 128 && Number.isFinite(v)) {
        const key = Math.round(v * 10) / 10;
        out.spacing[key] = (out.spacing[key] || []).concat(out.spacing[key]?.length >= 3 ? [] : [`${label(el)} ${prop}`]);
      }
    }
  }

  // Boxes inside boxes: an element with a visible border on three or four sides (or a card class),
  // counted through its bordered ancestors.
  const boxed = (el) => {
    const s = getComputedStyle(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((x) => parseFloat(s[`border${x}Width`]) > 0 && s[`border${x}Style`] !== 'none').length;
    return sides >= 3 && !['TABLE', 'TR', 'TD', 'TH', 'THEAD', 'TBODY', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'IMG', 'HR'].includes(el.tagName);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || !boxed(el)) continue;
    let depth = 1;
    for (let p = el.parentElement; p; p = p.parentElement) if (boxed(p)) depth += 1;
    if (depth > cfg.nesting) out.nesting.push({ depth, el: label(el) });
  }

  // A link in a table cell that wraps onto a second line.
  for (const a of document.querySelectorAll('td a, [role="cell"] a, [role="gridcell"] a')) {
    if (!visible(a)) continue;
    const lh = parseFloat(getComputedStyle(a).lineHeight) || parseFloat(getComputedStyle(a).fontSize) * 1.3;
    if (a.getClientRects().length > 1 || a.getBoundingClientRect().height > lh * 1.6) out.wrappingLinks.push(label(a));
  }

  // Status elements: their colour (text, else background, else border), by status name.
  for (const el of document.querySelectorAll(cfg.status)) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    const transparent = /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(bg);
    out.statuses.push({ status: el.getAttribute('data-status') || el.className || 'status', color: s.color, bg: transparent ? null : bg, border: s.borderLeftColor, el: label(el) });
  }

  // Numbers in table cells: a cell whose text is a number, left-aligned, is read by eye down the
  // column instead of compared at a glance.
  out.numericLeft = [];
  for (const td of document.querySelectorAll('td, [role="cell"], [role="gridcell"]')) {
    if (!visible(td) || td.querySelector('a, button, input, [role="img"]')) continue;
    const t = (td.textContent || '').trim();
    if (!/^[-+]?[$€£¥]?\d[\d,.\s]*%?$/.test(t)) continue;
    const align = getComputedStyle(td).textAlign;
    if (!['right', 'end'].includes(align)) out.numericLeft.push(label(td));
  }

  // Status encoding: each status element carries an icon and a word, never colour alone.
  out.statusBare = [];
  for (const el of document.querySelectorAll(cfg.status)) {
    if (!visible(el)) continue;
    const hasIcon = !!el.querySelector('svg, img, [data-icon], [class*="icon"]') || !!el.closest('[data-icon]');
    const hasText = (el.textContent || '').trim().length > 0 || !!el.getAttribute('aria-label');
    if (!hasIcon || !hasText) out.statusBare.push(`${label(el)} — ${!hasIcon ? 'no icon' : 'no text'}`);
  }

  // Empty states, marked `[data-empty]`: an icon or illustration, a sentence, and an action.
  out.emptyBare = [];
  for (const el of document.querySelectorAll('[data-empty]')) {
    if (!visible(el)) continue;
    const missing = [];
    if (!el.querySelector('svg, img, [data-icon]')) missing.push('icon');
    if (!/\p{L}{3,}.*\p{L}{3,}/u.test((el.textContent || '').trim())) missing.push('sentence');
    if (!el.querySelector('a[href], button')) missing.push('action');
    if (missing.length) out.emptyBare.push(`${label(el)} — no ${missing.join(', no ')}`);
  }

  // Sign-in: a page with a password field shows the product's mark.
  const pw = document.querySelector('input[type="password"]');
  out.authUnbranded = !!pw && visible(pw) && !document.querySelector('[data-brand], img[alt]:not([alt=""]), svg[aria-label], svg title, header img, .logo, [class*="brand"] svg, [class*="brand"] img');

  // Header actions at a phone width: more than two visible buttons in the top bar, or a top bar
  // that wrapped onto a second row, means its actions did not collapse into a menu.
  out.headerCrowded = null;
  const bar = document.querySelector('header, [role="banner"]');
  if (bar && visible(bar) && window.innerWidth <= 480) {
    const btns = [...bar.querySelectorAll('button, a.btn, [role="button"]')].filter(visible);
    const tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top / 8)));
    if (btns.length > 2 || tops.size > 1) out.headerCrowded = `${btns.length} visible action(s) on ${tops.size} row(s): ${btns.slice(0, 4).map(label).join(', ')}`;
  }

  // Heading sizes against the body size: the size most text uses.
  for (const h of document.querySelectorAll('h1, h2, h3')) {
    if (!visible(h)) continue;
    const tag = h.tagName.toLowerCase();
    out.headings[tag] = Math.max(out.headings[tag] || 0, parseFloat(getComputedStyle(h).fontSize));
  }
  const p = [...document.querySelectorAll('p, td, li, label, dd, span')].filter(visible);
  const counts = {};
  for (const el of p) { const fs = parseFloat(getComputedStyle(el).fontSize); counts[fs] = (counts[fs] || 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  out.bodySize = top ? Number(top[0]) : null;

  // Target size (WCAG 2.5.8): a pointer target under 24 px in either dimension passes only when a
  // 24 px square on its centre touches no other target. A link inside a sentence is exempt.
  const dialogOpen = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')].find(visible);
  const targets = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]')]
    .filter((el) => visible(el) && !el.closest('[inert], [aria-hidden="true"]') && !el.disabled && (!dialogOpen || dialogOpen.contains(el)));
  const rects = targets.map((el) => el.getBoundingClientRect());
  // A target inside a fixed or sticky bar sits on another layer: content scrolling under it is not
  // its neighbour (that overlap is focus-obscured's to judge).
  const layer = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) if (['fixed', 'sticky'].includes(getComputedStyle(p).position)) return p; return null; };
  const layers = targets.map(layer);
  const inSentence = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && [...(el.parentElement?.childNodes ?? [])].some((n) => n !== el && n.nodeType === 3 && n.textContent.trim().length > 2);
  out.smallTargets = [];
  targets.forEach((el, k) => {
    const r = rects[k];
    if ((r.width >= cfg.target && r.height >= cfg.target) || inSentence(el)) return;
    // a native checkbox or radio inside its label takes the label's box as its target
    const lab = (el.type === 'checkbox' || el.type === 'radio') && el.closest('label');
    if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= cfg.target && lr.height >= cfg.target) return; }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const h = cfg.target / 2;
    const crowded = rects.some((o, j) => j !== k && layers[j] === layers[k] && !targets[j].contains(el) && !el.contains(targets[j]) && o.left < cx + h && o.right > cx - h && o.top < cy + h && o.bottom > cy - h);
    if (crowded) out.smallTargets.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  });

  // Long lists: rows rendered at once in one table or list.
  out.longLists = [];
  for (const list of document.querySelectorAll('tbody, [role="rowgroup"], ul, ol, [role="list"], [role="listbox"]')) {
    const n = list.querySelectorAll(':scope > tr, :scope > [role="row"], :scope > li, :scope > [role="listitem"], :scope > [role="option"]').length;
    if (n > cfg.listRows) out.longLists.push(`${label(list).slice(0, 40)} ${n} rows`);
  }

  // Images: intrinsic size declared (no layout shift), not far larger than shown, lazy below the fold.
  out.images = [];
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    const r = img.getBoundingClientRect();
    const why = [];
    if (!img.getAttribute('width') || !img.getAttribute('height')) why.push('no width/height');
    if (img.naturalWidth && r.width && img.naturalWidth > r.width * cfg.imageScale * (window.devicePixelRatio || 1)) why.push(`${img.naturalWidth}px shown at ${Math.round(r.width)}px`);
    if (r.top > window.innerHeight && img.loading !== 'lazy') why.push('below the fold, not lazy');
    if (why.length) out.images.push(`${label(img)} — ${why.join(', ')}`);
  }

  // Reduced motion: the page is measured with prefers-reduced-motion set; nothing should still move.
  out.moving = [];
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    const dur = Math.max(...st.animationDuration.split(',').map((d) => parseFloat(d) || 0));
    if (st.animationName && st.animationName !== 'none' && dur > 0.01 && st.animationPlayState !== 'paused') out.moving.push(`${label(el)} animation ${st.animationName} ${st.animationDuration}`);
    if (out.moving.length >= 5) break;
  }

  // Focus not obscured (WCAG 2.4.11): focus each control (the browser scrolls it into view) and see
  // whether a sticky or fixed element covers its centre. Scroll and focus are restored after.
  out.obscured = [];
  const sx = window.scrollX;
  const sy = window.scrollY;
  const was = document.activeElement;
  for (const el of targets.filter((t) => t.tabIndex >= 0).slice(0, cfg.focusLimit)) {
    el.focus();
    if (document.activeElement !== el) continue;
    // AA (2.4.11) fails a control that is entirely hidden: its centre and four inset corners all
    // land on one sticky or fixed element that does not contain it. Partly hidden is AAA (2.4.12).
    const r = el.getBoundingClientRect();
    // Outside the viewport after focus (a closed drawer translated off-screen) is not "obscured by
    // author content"; it is not on screen at all, and is not this criterion's to judge.
    if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue;
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
      .map(([x, y]) => [Math.min(Math.max(x, 0), window.innerWidth - 1), Math.min(Math.max(y, 0), window.innerHeight - 1)]);
    const coverAt = ([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit || el.contains(hit) || hit.contains(el)) return null;
      let c = hit;
      while (c && c !== document.body && !['fixed', 'sticky'].includes(getComputedStyle(c).position)) c = c.parentElement;
      return c && c !== document.body && !c.contains(el) ? c : null;
    };
    const covers = pts.map(coverAt);
    if (covers[0] && covers.every((c) => c === covers[0])) out.obscured.push(`${label(el)} under ${label(covers[0]).slice(0, 40)}`);
  }
  if (was && was !== document.body && was.focus) was.focus();
  else document.activeElement?.blur?.();
  window.scrollTo(sx, sy);
  return out;
}

/**
 * The pseudo-locale (DEV-CONTRACTS §13.13): accents every Latin letter and lengthens each text node
 * by `growth` (0.4: what a German or Finnish translation brings). Evaluated in the page.
 */
export function pseudoLocalise(growth) {
  /* global document, NodeFilter */
  const map = { a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', y: 'ý', c: 'ç', n: 'ñ', A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ' };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    const t = n.textContent.trim();
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE'].includes(p.tagName)) continue;
    if (t.length < 2 || /^[\d\s.,:%$€£+-]+$/.test(t)) continue;
    nodes.push(n);
  }
  const filler = 'ŵéļļ ţéẋţ ļöñĝéŕ ŵöŕðš ';
  for (const n of nodes) {
    const t = n.textContent;
    const pad = Math.max(1, Math.ceil(t.trim().length * growth));
    const extra = filler.repeat(Math.ceil(pad / filler.length) + 1).slice(0, pad).trimEnd();
    n.textContent = `${t.replace(/[a-zA-Z]/g, (ch) => map[ch] ?? ch).replace(/\s+$/, '')} ${extra}${/\s$/.test(t) ? ' ' : ''}`;
  }
  return nodes.length;
}

// ---------------------------------------------------------------------------------------------
// Judgement — pure, on the measured facts
// ---------------------------------------------------------------------------------------------

const rgb = (css) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(css ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/**
 * Findings for one page at one width. `scale` is the token type scale (null skips that check);
 * `space` is the token space scale, whose values are allowed even when they are off the 4px grid.
 */
export function judge(m, { scale = null, space = [], width = m.viewport } = {}) {
  const f = [];
  const add = (rule, message, where = []) => f.push({ rule, level: HARD.includes(rule) ? 'fail' : 'advisory', width, message, where: where.slice(0, 5) });
  if (m.scrollWidth > m.viewport + 1) add('overflow', `the page is ${m.scrollWidth}px wide in a ${m.viewport}px viewport — it scrolls sideways`);
  if (m.crushed?.length) add('crushed-column', `${m.crushed.length} truncated cell(s) show fewer than ~8 characters — give the column a minimum width or hide a lower-priority one`, m.crushed);
  if (m.clipped.length) add('clipped-column', `${m.clipped.length} table cell(s) cut off: text hidden with no way to read it`, m.clipped);
  for (const v of m.primaries) if (v.count > 1) add('primary-count', `${v.count} primary buttons in the ${v.view} — one primary action per view`, v.labels);
  if (scale) {
    const off = Object.keys(m.fonts).map(Number).filter((s) => !scale.some((t) => Math.abs(t - s) < 0.6));
    if (off.length) add('type-off-scale', `font size(s) ${off.map((s) => `${s}px`).join(', ')} are not on the type scale (${scale.join(', ')})`, off.flatMap((s) => m.fonts[s]));
  }
  const allowed = new Set((space ?? []).map(Number));
  const offGrid = Object.keys(m.spacing).map(Number).filter((s) => s % LIMITS.grid > 0.5 && LIMITS.grid - (s % LIMITS.grid) > 0.5 && !allowed.has(s) && s !== 1 && s !== 2);
  if (offGrid.length) add('space-off-grid', `spacing ${offGrid.map((s) => `${s}px`).join(', ')} is off the ${LIMITS.grid}px grid`, offGrid.flatMap((s) => m.spacing[s]));
  if (m.nesting.length) {
    const deepest = Math.max(...m.nesting.map((n) => n.depth));
    add('nesting', `bordered boxes nested ${deepest} deep (at most ${LIMITS.nesting}) — remove a border, use spacing or a heading instead`, m.nesting.sort((a, b) => b.depth - a.depth).map((n) => `${n.depth}: ${n.el}`));
  }
  if (m.wrappingLinks.length) add('wrapping-link', `${m.wrappingLinks.length} link(s) in table cells wrap onto a second line`, m.wrappingLinks);
  const byStatus = new Map();
  for (const s of m.statuses) if (!byStatus.has(s.status)) byStatus.set(s.status, rgb(s.color) ?? rgb(s.bg));
  const names = [...byStatus.keys()];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const [a, b] = [byStatus.get(names[i]), byStatus.get(names[j])];
      if (!a || !b) continue;
      const d = deltaE(a, b);
      if (d < LIMITS.statusDeltaE) add('status-delta-e', `status \`${names[i]}\` and \`${names[j]}\` are ΔE00 ${d.toFixed(1)} apart (need ${LIMITS.statusDeltaE}) — they read as one colour`);
    }
  }
  if (m.numericLeft?.length) add('numeric-alignment', `${m.numericLeft.length} numeric cell(s) not right-aligned`, m.numericLeft);
  if (m.statusBare?.length) add('status-encoding', `${m.statusBare.length} status element(s) are not hue + icon + text`, m.statusBare);
  if (m.emptyBare?.length) add('empty-state', `${m.emptyBare.length} empty state(s) lack an icon, a sentence or an action`, m.emptyBare);
  if (m.authUnbranded) add('auth-branding', 'a sign-in page with no product mark (`[data-brand]`, a logo image or a labelled svg)');
  for (const v of m.axe ?? []) {
    const serious = ['serious', 'critical'].includes(v.impact);
    add(serious ? 'axe-serious' : 'axe-moderate', `axe ${v.id} (${v.impact ?? 'unknown'}): ${v.help}`, v.nodes ?? []);
  }
  if (m.smallTargets?.length) add('target-size', `${m.smallTargets.length} pointer target(s) under ${LIMITS.target} × ${LIMITS.target} px with another target within reach (WCAG 2.5.8)`, m.smallTargets);
  if (m.obscured?.length) add('focus-obscured', `${m.obscured.length} control(s) hidden under a sticky or fixed element when focused (WCAG 2.4.11)`, m.obscured);
  if (m.longLists?.length) add('long-list', `${m.longLists.length} list(s) render more than ${LIMITS.listRows} rows at once — paginate from the server or virtualise (DEV-CONTRACTS §13.13)`, m.longLists);
  if (m.images?.length) add('image-assets', `${m.images.length} image(s) without a declared size, oversized, or eager below the fold`, m.images);
  if (m.moving?.length) add('motion-reduce', `${m.moving.length} animation(s) still run under prefers-reduced-motion: reduce`, m.moving);
  if (m.headerCrowded) add('header-actions', `header actions do not collapse at ${m.viewport}px: ${m.headerCrowded}`);
  const h = Math.max(m.headings.h1 || 0, m.headings.h2 || 0);
  if (h && m.bodySize && h / m.bodySize < LIMITS.headingRatio) add('heading-ratio', `the largest heading is ${h}px, ${(h / m.bodySize).toFixed(2)}× the ${m.bodySize}px body — a page title is at least ${LIMITS.headingRatio}×`);
  return f;
}

export function summarise(results) {
  const fails = results.flatMap((r) => r.findings.filter((x) => x.level === 'fail'));
  const adv = results.flatMap((r) => r.findings.filter((x) => x.level === 'advisory'));
  const axe = results.length && results.every((r) => r.axe === 'run') ? 'axe: run' : `axe: NOT RUN${results.find((r) => r.axeReason)?.axeReason ? ` — ${results.find((r) => r.axeReason).axeReason}` : ''}`;
  return { fails: fails.length, advisories: adv.length, axe, line: `ui-rubric: ${results.length} page view(s) · ${fails.length} hard fail(s) · ${adv.length} advisory · ${axe}` };
}

// ---------------------------------------------------------------------------------------------
// Driving the browser
// ---------------------------------------------------------------------------------------------

async function measure(cdp, url, width, opts) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  try {
    await s('Emulation.setDeviceMetricsOverride', { width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await s('Page.enable');
    const loaded = new Promise((r) => { const off = cdp.on((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${nav.errorText} loading ${url}`);
    await Promise.race([loaded, new Promise((r) => { setTimeout(r, opts.wait); })]);
    await s('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }).catch(() => {});
    if (opts.pseudo) {
      await s('Runtime.evaluate', { expression: `(${pseudoLocalise.toString()})(${LIMITS.pseudoGrowth})`, returnByValue: true });
      await s('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }).catch(() => {});
    }
    const cfg = { primary: opts.primary, status: opts.status, nesting: LIMITS.nesting, target: LIMITS.target, listRows: LIMITS.listRows, imageScale: LIMITS.imageScale, focusLimit: 80 };
    const r = await s('Runtime.evaluate', { expression: `(${measurePage.toString()})(${JSON.stringify(cfg)})`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`measuring ${url}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    const m = r.result.value;
    if (opts.axeSource) {
      const inj = await s('Runtime.evaluate', { expression: `${opts.axeSource}\n;typeof axe`, returnByValue: true });
      const ran = inj.exceptionDetails ? inj : await s('Runtime.evaluate', { expression: AXE_RUN, awaitPromise: true, returnByValue: true });
      if (ran.exceptionDetails) throw new Error(`axe on ${url}: ${ran.exceptionDetails.exception?.description ?? ran.exceptionDetails.text}`);
      m.axe = ran.result.value;
    }
    return m;
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

export async function runRubric(opts) {
  const browser = findBrowser({ flag: opts.browser });
  const { cdp, close } = launchBrowser(browser);
  const scale = typeScale(opts.tokens);
  const space = opts.tokens?.space ?? [];
  const axe = opts.axe ?? findAxe({ path: opts.axePath });
  const results = [];
  try {
    for (const u of opts.urls) {
      for (const width of opts.widths) {
        const m = await measure(cdp, u.url, width, { ...opts, axeSource: axe.source });
        results.push({ name: opts.pseudo ? `${u.name}~pseudo` : u.name, pseudo: Boolean(opts.pseudo), url: u.url, width, axe: axe.source ? 'run' : 'not-run', axeReason: axe.reason, findings: judge(m, { scale, space, width }) });
      }
    }
  } finally {
    await close();
  }
  return results;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`ui-rubric: ${err.message}`);
    console.error('usage: ui-rubric.mjs --url <name>=<url>… [--widths 1024,768,360] [--tokens dev/docs] [--pseudo] [--out <file.json>]');
    return 2;
  }
  let results;
  try {
    results = await runRubric(opts);
  } catch (err) {
    console.error(`ui-rubric: ${err.message}`);
    return 2;
  }
  for (const r of results) {
    for (const f of r.findings) {
      console.log(`${f.level === 'fail' ? 'FAIL' : 'note'} ${r.name} @${r.width}  ${f.rule}: ${f.message}`);
      for (const w of f.where) console.log(`       ${w}`);
    }
  }
  const sum = summarise(results);
  console.log(sum.line);
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify({ generated: new Date().toISOString(), results, summary: sum }, null, 2)}\n`);
  return sum.fails ? 1 : 0;
}

if (process.argv[1]?.endsWith('ui-rubric.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
