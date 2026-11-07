#!/usr/bin/env node
/**
 * ui-consistency.mjs — one value per role, across every screen (DEV-CONTRACTS §13.3).
 *
 * ui-rubric judges one page at a time, so it passed release-management's screens one by one while
 * buttons were 24, 26 and 32 px tall on one screen, h1 was 20 px on one page and 15 px on the 404,
 * h3 came in three sizes, and table rows ran from 26 to 61 px. Those faults appear only when the
 * screens are set side by side. This script loads every route in headless Edge or Chrome, using the
 * browser plumbing of ui-snap.mjs, and builds a histogram of computed values per role:
 *
 *   button height per variant and size · h1 / h2 / h3 font size · table row height · status pill
 *   background per status word · gap per kit slot (`[data-slot]` with a flex or grid gap)
 *
 *   node dev/scripts/ui-consistency.mjs --url list=http://localhost:5173/releases --url …
 *        [--width 1280] [--declare <file.json>] [--wait 3000] [--browser <path>] [--json]
 *
 * A role with more than one value fails unless the deviation is declared. `--declare` reads a JSON
 * object { "<role>": ["<value>", …] } listing the extra values the ui-spec allows, with the reason in
 * the spec. Values are rounded to whole px, and colours are compared as hex.
 *
 * Roles come from the kit's data attributes (`data-slot`, `data-variant`, `data-size`,
 * `data-status`). Without the kit, a <button> is the role `button` and its class list is not
 * trusted, so a hand-built product shows its spread under one role and fails.
 *
 * Exit 0 consistent · 1 a role has more than one undeclared value · 2 usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findBrowser, launchBrowser } from './ui-snap.mjs';

/**
 * Runs in the page (serialised with toString), so it may use only the DOM. Returns
 * `[{ role, value, where }]`, one entry per element measured.
 */
export function collectRoles() {
  /* global document, getComputedStyle */
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const px = (v) => `${Math.round(parseFloat(v))}px`;
  const hex = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return c;
    const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parseFloat(a) === 0) return 'transparent';
    return `#${[r, g, b].map((n) => Math.round(parseFloat(n)).toString(16).padStart(2, '0')).join('')}`;
  };
  const where = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `${el.tagName.toLowerCase()}${t ? ` "${t}"` : ''}`;
  };
  const add = (role, value, el) => out.push({ role, value, where: where(el) });

  for (const el of document.querySelectorAll('button, [role="button"], a[data-slot="button"]')) {
    if (!visible(el) || el.closest('[role="menu"], [role="tablist"], thead')) continue;
    const variant = el.getAttribute('data-variant');
    if (variant === 'link') continue;
    const role = variant ? `button.${variant}.${el.getAttribute('data-size') || 'md'}` : 'button';
    add(role, px(el.getBoundingClientRect().height), el);
  }
  for (const tag of ['h1', 'h2', 'h3']) {
    for (const el of document.querySelectorAll(tag)) {
      if (!visible(el)) continue;
      add(`${tag}.size`, px(getComputedStyle(el).fontSize), el);
      add(`${tag}.weight`, String(getComputedStyle(el).fontWeight), el);
    }
  }
  for (const row of document.querySelectorAll('tbody tr, [role="row"]:not(:has([role="columnheader"]))')) {
    if (!visible(row) || row.closest('[data-density]:not([data-density=""])')?.getAttribute('data-density') === 'ignore') continue;
    const density = row.closest('[data-density]')?.getAttribute('data-density');
    add(density ? `table.row.${density}` : 'table.row', px(row.getBoundingClientRect().height), row);
  }
  for (const el of document.querySelectorAll('[data-status]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    add(`status.${el.getAttribute('data-status')}.bg`, hex(s.backgroundColor), el);
    add(`status.${el.getAttribute('data-status')}.fg`, hex(s.color), el);
  }
  for (const el of document.querySelectorAll('[data-slot]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (!/flex|grid/.test(s.display) || s.gap === 'normal' || parseFloat(s.gap) === 0) continue;
    add(`gap.${el.getAttribute('data-slot')}`, px(s.gap), el);
  }
  return out;
}

/** `{ role: { value: [where…] } }` over every page's samples, each `where` prefixed by the page. */
export function histogram(samples) {
  const h = {};
  for (const { page, role, value, where } of samples) {
    h[role] ??= {};
    (h[role][value] ??= []).push(`${page}: ${where}`);
  }
  return h;
}

/** Roles with more than one value once the declared extras are removed. */
export function judgeHistogram(h, declared = {}) {
  const fails = [];
  for (const [role, values] of Object.entries(h)) {
    const allowed = new Set(declared[role] ?? []);
    const keys = Object.keys(values).sort((a, b) => values[b].length - values[a].length);
    const undeclared = keys.slice(1).filter((v) => !allowed.has(v));
    if (undeclared.length) fails.push({ role, values: Object.fromEntries(keys.map((k) => [k, values[k].length])), undeclared, examples: undeclared.map((v) => values[v][0]) });
  }
  return fails;
}

async function samplePage(cdp, url, width, opts) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  try {
    await s('Emulation.setDeviceMetricsOverride', { width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await s('Page.enable');
    const loaded = new Promise((r) => { const off = cdp.on((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); r(); } }); });
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${nav.errorText} loading ${url}`);
    await Promise.race([loaded, new Promise((r) => { setTimeout(r, opts.wait); })]);
    await s('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }).catch(() => {});
    const r = await s('Runtime.evaluate', { expression: `(${collectRoles.toString()})()`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`measuring ${url}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/** Every page in one browser: `{ histogram, fails }`. */
export async function runConsistency({ urls, width = 1280, height = 900, wait = 3000, browser = null, declared = {} }) {
  const exe = findBrowser({ flag: browser });
  const { cdp, close } = launchBrowser(exe);
  const samples = [];
  try {
    for (const u of urls) for (const x of await samplePage(cdp, u.url, width, { height, wait })) samples.push({ page: u.name, ...x });
  } finally {
    await close();
  }
  const h = histogram(samples);
  return { histogram: h, fails: judgeHistogram(h, declared), pages: urls.length, samples: samples.length };
}

export function parseArgs(argv) {
  const o = { urls: [], width: 1280, height: 900, wait: 3000, browser: null, declare: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') {
      const v = next() ?? '';
      const k = v.indexOf('=');
      const name = k > 0 && !/^[a-z]+:\/\//i.test(v.slice(0, k + 3)) ? v.slice(0, k) : v;
      const url = k > 0 && name !== v ? v.slice(k + 1) : v;
      o.urls.push({ name, url: /^[a-z]+:\/\//i.test(url) ? url : pathToFileURL(resolve(url)).href });
    } else if (a === '--width') o.width = Number(next());
    else if (a === '--height') o.height = Number(next());
    else if (a === '--wait') o.wait = Number(next());
    else if (a === '--browser') o.browser = next();
    else if (a === '--declare') o.declare = next();
    else if (a === '--json') o.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (err) {
    console.error(`ui-consistency: ${err.message}`);
    return 2;
  }
  if (o.urls.length < 1) {
    console.error('usage: ui-consistency.mjs --url <name>=<url> [--url …] [--width 1280] [--declare <json>] [--wait <ms>] [--browser <path>] [--json]');
    return 2;
  }
  if (o.declare && !existsSync(o.declare)) {
    console.error(`ui-consistency: --declare ${o.declare} does not exist`);
    return 2;
  }
  const declared = o.declare ? JSON.parse(readFileSync(o.declare, 'utf8')) : {};
  let r;
  try {
    r = await runConsistency({ ...o, declared });
  } catch (err) {
    console.error(`ui-consistency: ${err.message}`);
    return 2;
  }
  if (o.json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const f of r.fails) {
      console.log(`FAIL ${f.role}: ${Object.entries(f.values).map(([v, n]) => `${v} ×${n}`).join(', ')}`);
      for (const e of f.examples) console.log(`       e.g. ${e}`);
    }
    console.log(`ui-consistency: ${r.pages} page(s) · ${Object.keys(r.histogram).length} role(s) · ${r.samples} element(s) · ${r.fails.length} role(s) with more than one undeclared value`);
  }
  return r.fails.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
