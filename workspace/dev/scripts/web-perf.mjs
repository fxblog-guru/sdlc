#!/usr/bin/env node
/**
 * web-perf.mjs — frontend performance budgets, per route, on a built app (DEV-CONTRACTS §13.7).
 *
 * release-management's frontend had no budgets, so nothing measured it: a list that remounted on
 * every page load and a component that re-measured on every render surfaced only as unit tests that
 * got slow. This loads each route of the production build in headless Edge or Chrome, cold, and
 * measures five numbers a budget can fail on:
 *
 *   js_kb       JavaScript transferred for the route (bytes on the wire, every script response)
 *   lcp_ms      Largest Contentful Paint
 *   tbt_ms      Total Blocking Time — Σ (long task − 50 ms); the lab proxy for INP, since a page whose
 *               main thread is blocked cannot answer an input
 *   long_tasks  main-thread tasks over 50 ms
 *   cls         Cumulative Layout Shift: the largest session window of layout shifts not caused by
 *               input (DEV-CONTRACTS §13.13). INP needs real input and is a field metric; TBT is
 *               its lab proxy here
 *
 *   node dev/scripts/web-perf.mjs --dist web/dist --route list=/releases --route view=/releases/1 \
 *     --budget js_kb=170,lcp_ms=2500,tbt_ms=200,long_tasks=5,cls=0.1 [--cpu 4] [--out <file.json>]
 *   node dev/scripts/web-perf.mjs --url list=http://localhost:4173/releases …
 *
 *   --dist <dir>          serve this built app on a free local port; unknown paths fall back to
 *                         index.html, as an SPA host does. --route paths are relative to it
 *   --route <name>=<path> a route of --dist (repeatable)
 *   --url <name>=<url>    or measure a running server (repeatable)
 *   --budget <k=v,…>      the DEV-PROFILE §Quality gates numbers; any key left out is not judged.
 *                         Default: js_kb=170,lcp_ms=2500,tbt_ms=200,long_tasks=5,cls=0.1
 *   --cpu <rate>          CPU slowdown (Emulation.setCPUThrottlingRate); 4 approximates a mid phone
 *   --width/--height      viewport (default 1280 × 900)
 *   --settle <ms>         how long to keep observing after the network is idle (default 1500)
 *   --wait <ms>           the most a route may take to load (default 15000)
 *   --browser <path>      Edge or Chrome, found as ui-snap finds it
 *   --out <file>          also write the measurements as JSON
 *   --audit <seo,a11y>    also read the rendered DOM of each route and fail what a crawler or a
 *                         screen reader would trip on (AUDITS below). Each route gets a score per
 *                         audit (checks passed ÷ checks run); every failed check is a breach
 *
 * The page is loaded with the cache disabled, so every route is measured as a first visit: the
 * case a budget is for. Numbers on a loaded workstation drift; budgets are ceilings with room, and
 * a route that is close to its ceiling here is one to look at, not to retry.
 *
 * Exit 0 every route within budget · 1 a breach · 2 usage error or no browser.
 */

import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { findBrowser, launchBrowser } from './ui-snap.mjs';

/**
 * DOM checks on the rendered page, after the network is idle, so a client-rendered title counts.
 * They are the deterministic part of what Lighthouse's SEO and accessibility audits check; colour
 * contrast and focus order need a human or a full engine, and stay with G5's review.
 */
export const AUDITS = {
  seo: {
    title: [(d) => d.title.length > 0 && d.title.length <= 70, 'a <title> of 1–70 characters'],
    description: [(d) => d.description.length >= 50 && d.description.length <= 160, 'a meta description of 50–160 characters'],
    canonical: [(d) => d.canonical, 'a <link rel="canonical">'],
    lang: [(d) => d.lang, 'a lang attribute on <html>'],
    h1: [(d) => d.h1 === 1, 'exactly one <h1>'],
    indexable: [(d) => !d.noindex, 'no robots noindex on a page meant to be found'],
  },
  a11y: {
    lang: [(d) => d.lang, 'a lang attribute on <html>'],
    'img-alt': [(d) => d.imgNoAlt === 0, 'every <img> has an alt (empty for decoration)'],
    'control-label': [(d) => d.unlabelled === 0, 'every form control has a label'],
    'button-name': [(d) => d.nameless === 0, 'every button and link has an accessible name'],
    'unique-id': [(d) => d.dupIds === 0, 'no duplicate id (labels and aria refs point at one element)'],
    'heading-order': [(d) => d.headingSkips === 0, 'headings never skip a level'],
  },
};

/** Collects the facts AUDITS judges, in the page. Returns a JSON string. */
const DOM_FACTS = `(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || e.textContent || e.querySelector('img[alt]')?.alt || '').trim();
  const ids = q('[id]').map((e) => e.id);
  const levels = q('h1,h2,h3,h4,h5,h6').map((h) => Number(h.tagName[1]));
  const controls = q('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea');
  return JSON.stringify({
    title: document.title.trim(),
    description: (document.querySelector('meta[name=description]')?.content ?? '').trim(),
    canonical: !!document.querySelector('link[rel=canonical][href]'),
    lang: !!document.documentElement.getAttribute('lang'),
    h1: q('h1').length,
    noindex: /noindex/i.test(document.querySelector('meta[name=robots]')?.content ?? ''),
    imgNoAlt: q('img:not([alt])').length,
    unlabelled: controls.filter((c) => !(c.labels?.length || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.title)).length,
    nameless: q('button,a[href],[role=button]').filter((e) => !name(e)).length,
    dupIds: ids.length - new Set(ids).size,
    headingSkips: levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length,
  });
})()`;

/** facts → { <audit>: { score, failed: [check: what it needs] } }. Pure, for the tests. */
export function audit(facts, which) {
  const out = {};
  for (const a of which) {
    const checks = Object.entries(AUDITS[a]);
    const failed = checks.filter(([, [ok]]) => !ok(facts)).map(([id, [, need]]) => `${a} ${id}: needs ${need}`);
    out[a] = { score: Math.round(((checks.length - failed.length) / checks.length) * 100), failed };
  }
  return out;
}

export const DEFAULT_BUDGET = { js_kb: 170, lcp_ms: 2500, tbt_ms: 200, long_tasks: 5, cls: 0.1 };
export const BUDGET_KEYS = Object.keys(DEFAULT_BUDGET);

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

export function parseBudget(text) {
  const out = {};
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z_]+)=(\d*\.?\d+)$/.exec(part);
    if (!m) throw new Error(`--budget ${part}: expected key=number`);
    if (!BUDGET_KEYS.includes(m[1])) throw new Error(`--budget ${m[1]}: unknown key — one of ${BUDGET_KEYS.join(', ')}`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

export function parseArgs(argv) {
  const o = { dist: null, routes: [], urls: [], budget: { ...DEFAULT_BUDGET }, audit: [], cpu: 1, width: 1280, height: 900, settle: 1500, wait: 15_000, browser: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    const pair = () => {
      const m = /^([^=]+)=(.+)$/.exec(value);
      if (!m) throw new Error(`${flag} ${value}: expected <name>=<${flag === '--url' ? 'url' : 'path'}>`);
      return { name: m[1], target: m[2] };
    };
    if (flag === '--dist') o.dist = value;
    else if (flag === '--route') o.routes.push(pair());
    else if (flag === '--url') o.urls.push(pair());
    else if (flag === '--budget') o.budget = parseBudget(value);
    else if (flag === '--cpu') o.cpu = num(flag, value);
    else if (flag === '--width') o.width = Math.round(num(flag, value));
    else if (flag === '--height') o.height = Math.round(num(flag, value));
    else if (flag === '--settle') o.settle = num(flag, value, true);
    else if (flag === '--wait') o.wait = num(flag, value);
    else if (flag === '--browser') o.browser = value;
    else if (flag === '--out') o.out = value;
    else if (flag === '--audit') {
      o.audit = value.split(',').map((x) => x.trim()).filter(Boolean);
      const bad = o.audit.filter((x) => !AUDITS[x]);
      if (bad.length) throw new Error(`--audit ${bad.join(',')}: unknown — one of ${Object.keys(AUDITS).join(', ')}`);
    }
    else throw new Error(`unknown flag ${flag}`);
  }
  if (o.routes.length && !o.dist) throw new Error('--route needs --dist; use --url for a running server');
  if (o.dist && !existsSync(join(o.dist, 'index.html'))) throw new Error(`--dist ${o.dist} has no index.html — build the app first`);
  if (!o.routes.length && !o.urls.length) throw new Error('nothing to measure — pass --dist with --route, or --url');
  return o;
}

function num(flag, v, zeroOk = false) {
  const n = Number(v);
  if (!(n > 0 || (zeroOk && n === 0))) throw new Error(`${flag} ${v}: expected a positive number`);
  return n;
}

// ---------------------------------------------------------------------------------------------
// A static host for a built app
// ---------------------------------------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json' };

/** Serve `dir` on 127.0.0.1, SPA-style: a path with no file behind it gets index.html. */
export function serveDist(dir) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    let file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const asIndex = join(file, 'index.html');
      file = existsSync(asIndex) ? asIndex : extname(rel) ? null : join(root, 'index.html');
    }
    if (!file || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => {
    server.listen(0, '127.0.0.1', () => r({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((c) => { server.close(c); }) }));
  });
}

// ---------------------------------------------------------------------------------------------
// Measuring one route
// ---------------------------------------------------------------------------------------------

/**
 * Installed before any page script runs, so a long task in the first parse is seen. LCP is
 * observed buffered; the last entry is the LCP.
 */
const OBSERVER = `(() => {
  const m = { lcp: null, longTasks: [], fcp: null, shifts: [] };
  window.__webPerf = m;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.shifts.push({ start: e.startTime, value: e.value }); }).observe({ type: 'layout-shift', buffered: true }); } catch {}
})();`;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export async function measureRoute(cdp, url, opts) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  const scripts = new Map(); // requestId → url, for responses of type Script
  let jsBytes = 0;
  const jsFiles = [];
  let idle = false;
  let frameId = null;
  const off = cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.responseReceived' && m.params.type === 'Script') scripts.set(m.params.requestId, m.params.response.url);
    if (m.method === 'Network.loadingFinished' && scripts.has(m.params.requestId)) {
      jsBytes += m.params.encodedDataLength;
      jsFiles.push({ url: scripts.get(m.params.requestId), bytes: m.params.encodedDataLength });
    }
    if (m.method === 'Page.lifecycleEvent' && m.params.name === 'networkIdle' && m.params.frameId === frameId) idle = true;
  });
  try {
    await s('Emulation.setDeviceMetricsOverride', { width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    if (opts.cpu > 1) await s('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
    await s('Network.enable');
    await s('Network.setCacheDisabled', { cacheDisabled: true });
    await s('Page.enable');
    await s('Page.setLifecycleEventsEnabled', { enabled: true });
    await s('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER });
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${nav.errorText} loading ${url}`);
    frameId = nav.frameId;
    const deadline = Date.now() + opts.wait;
    while (!idle && Date.now() < deadline) await sleep(50);
    if (!idle) throw new Error(`the network was not idle within ${opts.wait} ms`);
    await sleep(opts.settle);
    const r = await s('Runtime.evaluate', { expression: 'JSON.stringify(window.__webPerf ?? null)', returnByValue: true });
    const m = JSON.parse(r.result.value ?? 'null');
    if (!m) throw new Error('the page observer did not run');
    const metrics = toMetrics(m, jsBytes, jsFiles);
    if (opts.audit?.length) {
      const f = await s('Runtime.evaluate', { expression: DOM_FACTS, returnByValue: true });
      metrics.audit = audit(JSON.parse(f.result.value), opts.audit);
    }
    return metrics;
  } finally {
    off();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/**
 * CLS as web-vitals defines it: shifts grouped into session windows (gap < 1 s, window < 5 s), and
 * the largest window's sum.
 */
export function clsOf(shifts = []) {
  let best = 0;
  let sum = 0;
  let first = null;
  let last = null;
  for (const s of [...shifts].sort((a, b) => a.start - b.start)) {
    if (first !== null && s.start - last < 1000 && s.start - first < 5000) sum += s.value;
    else { sum = s.value; first = s.start; }
    last = s.start;
    best = Math.max(best, sum);
  }
  return Math.round(best * 1000) / 1000;
}

/** The page's raw observations → the budgeted numbers. Pure, for the tests. */
export function toMetrics(raw, jsBytes, jsFiles = []) {
  const tbt = raw.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
  return {
    js_kb: Math.round((jsBytes / 1024) * 10) / 10,
    lcp_ms: raw.lcp === null ? null : Math.round(raw.lcp),
    tbt_ms: Math.round(tbt),
    long_tasks: raw.longTasks.length,
    cls: clsOf(raw.shifts),
    fcp_ms: raw.fcp === null ? null : Math.round(raw.fcp),
    scripts: jsFiles,
  };
}

// ---------------------------------------------------------------------------------------------
// Judging
// ---------------------------------------------------------------------------------------------

const UNIT = { js_kb: 'KB', lcp_ms: 'ms', tbt_ms: 'ms', long_tasks: '', cls: '' };

/** @returns {string[]} one sentence per budget the metrics exceed; a missing LCP is a breach. */
export function judge(metrics, budget) {
  const out = [];
  for (const k of BUDGET_KEYS) {
    if (budget[k] === undefined) continue;
    const v = metrics[k];
    if (v === null || v === undefined) out.push(`${k} not measured — the page painted nothing the browser counts as contentful`);
    else if (v > budget[k]) out.push(`${k} ${v}${UNIT[k]} > ${budget[k]}${UNIT[k]}`);
  }
  return out;
}

export async function runWebPerf(opts) {
  const browser = findBrowser({ flag: opts.browser });
  const host = opts.dist ? await serveDist(opts.dist) : null;
  const targets = [
    ...opts.routes.map((r) => ({ name: r.name, url: `${host.origin}${r.target.startsWith('/') ? '' : '/'}${r.target}` })),
    ...opts.urls.map((u) => ({ name: u.name, url: u.target })),
  ];
  const { cdp, close } = launchBrowser(browser);
  const results = [];
  try {
    for (const t of targets) {
      try {
        const metrics = await measureRoute(cdp, t.url, opts);
        const breaches = [...judge(metrics, opts.budget), ...Object.values(metrics.audit ?? {}).flatMap((x) => x.failed)];
        results.push({ ...t, ok: breaches.length === 0, metrics, breaches });
      } catch (err) {
        results.push({ ...t, ok: false, metrics: null, breaches: [err.message] });
      }
    }
  } finally {
    await close();
    await host?.close();
  }
  return results;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`web-perf: ${err.message}`);
    console.error('usage: web-perf.mjs --dist <built app> --route <name>=<path>… | --url <name>=<url>… [--budget js_kb=170,lcp_ms=2500,tbt_ms=200,long_tasks=5,cls=0.1] [--cpu 4] [--audit seo,a11y] [--out <file.json>]');
    return 2;
  }
  let results;
  try {
    results = await runWebPerf(opts);
  } catch (err) {
    console.error(`web-perf: ${err.message}`);
    return 2;
  }
  for (const r of results) {
    const m = r.metrics;
    const scores = m?.audit ? Object.entries(m.audit).map(([k, v]) => `  ${k.toUpperCase()} ${v.score}`).join('') : '';
    const line = m ? `JS ${m.js_kb} KB  LCP ${m.lcp_ms ?? '—'} ms  TBT ${m.tbt_ms} ms  long tasks ${m.long_tasks}  CLS ${m.cls}${scores}` : '';
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}  ${line}`);
    for (const b of r.breaches) console.log(`       ${b}`);
  }
  const fails = results.filter((r) => !r.ok).length;
  const b = BUDGET_KEYS.filter((k) => opts.budget[k] !== undefined).map((k) => `${k}=${opts.budget[k]}`).join(',');
  console.log(`web-perf: ${results.length} route(s), ${fails} over budget (budget ${b}${opts.cpu > 1 ? `, cpu ×${opts.cpu}` : ''})`);
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify({ generated: new Date().toISOString(), budget: opts.budget, cpu: opts.cpu, results }, null, 2)}\n`);
  return fails ? 1 : 0;
}

if (process.argv[1]?.endsWith('web-perf.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
