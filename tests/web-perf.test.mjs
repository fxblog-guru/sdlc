/**
 * web-perf.mjs — every frontend budget must be able to fail (DEV-CONTRACTS §13.7).
 *
 * The judgement is pure and tested on numbers. The live half serves two built apps from
 * tests/fixtures/{valid,broken}/web-perf/ and loads them in a real headless browser: the light app
 * must come in under every budget, and the heavy page must break all four — JS transferred, LCP,
 * TBT and the long-task count. Skipped where no Edge or Chrome is found.
 *
 *   node --test tests/web-perf.test.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { AUDITS, DEFAULT_BUDGET, audit, clsOf, judge, parseArgs, parseBudget, runWebPerf, serveDist, toMetrics } from '../workspace/dev/scripts/web-perf.mjs';
import { findBrowser } from '../workspace/dev/scripts/ui-snap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LIGHT = join(here, 'fixtures', 'valid', 'web-perf');
const HEAVY = join(here, 'fixtures', 'broken', 'web-perf');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'web-perf.mjs');
/** Sized to the fixtures: the light app is ~1 KB of JS and paints at once; the heavy one is ~28 KB, paints at ~2.8 s and blocks six times. */
const BUDGET = 'js_kb=20,lcp_ms=2000,tbt_ms=150,long_tasks=3,cls=0.1';
let liveBrowser = null;
try { liveBrowser = findBrowser(); } catch { liveBrowser = null; }

test('parseBudget: known keys only, numbers only', () => {
  assert.deepEqual(parseBudget('js_kb=170, lcp_ms=2500'), { js_kb: 170, lcp_ms: 2500 });
  assert.throws(() => parseBudget('fps=60'), /unknown key/);
  assert.throws(() => parseBudget('js_kb=lots'), /expected key=number/);
});

test('parseArgs: --route needs a built --dist, defaults hold, nothing to measure is an error', () => {
  assert.throws(() => parseArgs(['--route', 'a=/']), /--route needs --dist/);
  assert.throws(() => parseArgs(['--dist', here, '--route', 'a=/']), /has no index.html/);
  assert.throws(() => parseArgs([]), /nothing to measure/);
  const o = parseArgs(['--dist', LIGHT, '--route', 'home=/', '--cpu', '4']);
  assert.deepEqual(o.routes, [{ name: 'home', target: '/' }]);
  assert.deepEqual(o.budget, DEFAULT_BUDGET);
  assert.equal(o.cpu, 4);
});

test('toMetrics: TBT is the sum of each long task past 50 ms', () => {
  const m = toMetrics({ lcp: 812.4, fcp: 300, longTasks: [{ duration: 120 }, { duration: 60 }, { duration: 51 }] }, 30 * 1024);
  assert.deepEqual([m.js_kb, m.lcp_ms, m.tbt_ms, m.long_tasks], [30, 812, 81, 3]);
});

test('judge: each budget breaches on its own, a missing LCP is a breach, an unbudgeted key is not judged', () => {
  const budget = parseBudget(BUDGET);
  const clean = { js_kb: 1, lcp_ms: 100, tbt_ms: 0, long_tasks: 0, cls: 0 };
  assert.deepEqual(judge(clean, budget), []);
  assert.deepEqual(judge({ ...clean, js_kb: 21 }, budget), ['js_kb 21KB > 20KB']);
  assert.deepEqual(judge({ ...clean, lcp_ms: 2001 }, budget), ['lcp_ms 2001ms > 2000ms']);
  assert.deepEqual(judge({ ...clean, tbt_ms: 151 }, budget), ['tbt_ms 151ms > 150ms']);
  assert.deepEqual(judge({ ...clean, long_tasks: 4 }, budget), ['long_tasks 4 > 3']);
  assert.match(judge({ ...clean, lcp_ms: null }, budget)[0], /lcp_ms not measured/);
  assert.deepEqual(judge({ ...clean, js_kb: 999 }, { lcp_ms: 2000 }), []);
  assert.deepEqual(judge({ ...clean, cls: 0.25 }, budget), ['cls 0.25 > 0.1']);
  assert.deepEqual(parseBudget('cls=.05'), { cls: 0.05 });
});

test('clsOf: the largest session window (gap < 1 s, window < 5 s), not the sum of every shift', () => {
  assert.equal(clsOf([]), 0);
  assert.equal(clsOf([{ start: 100, value: 0.05 }, { start: 600, value: 0.05 }]), 0.1, 'one window');
  assert.equal(clsOf([{ start: 100, value: 0.05 }, { start: 2000, value: 0.04 }]), 0.05, 'two windows: the larger');
  assert.equal(clsOf([0, 900, 1800, 2700, 3600, 4500, 5400].map((start) => ({ start, value: 0.02 }))), 0.12, 'a window closes at 5 s');
});

test('serveDist: serves files, falls back to index.html for a route, refuses to leave the folder', async () => {
  const host = await serveDist(LIGHT);
  try {
    const route = await fetch(`${host.origin}/releases/7`);
    assert.equal(route.status, 200);
    assert.match(await route.text(), /web-perf valid fixture/);
    const js = await fetch(`${host.origin}/assets/app.js`);
    assert.equal(js.headers.get('content-type'), 'text/javascript');
    assert.equal((await fetch(`${host.origin}/assets/missing.js`)).status, 404);
    assert.notEqual((await fetch(`${host.origin}/..%2f..%2fpackage.json`)).status, 200);
  } finally {
    await host.close();
  }
});

test('live: the light app is within every budget; the heavy page breaks all five', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const base = ['--budget', BUDGET, '--settle', '3500'];
  const [light] = await runWebPerf(parseArgs(['--dist', LIGHT, '--route', 'list=/releases', ...base]));
  assert.equal(light.ok, true, JSON.stringify(light, null, 2));
  assert.ok(light.metrics.js_kb > 0, 'the script was counted — a 0 here means the measurement saw nothing');
  assert.ok(light.metrics.lcp_ms !== null, 'the light page has an LCP');

  const [heavy] = await runWebPerf(parseArgs(['--dist', HEAVY, '--route', 'list=/releases', ...base]));
  assert.equal(heavy.ok, false);
  assert.deepEqual(heavy.breaches.map((b) => b.split(' ')[0]), ['js_kb', 'lcp_ms', 'tbt_ms', 'long_tasks', 'cls'], JSON.stringify(heavy, null, 2));
});

test('live: the CLI exits 1 over budget and 0 within it', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = (dist) => new Promise((resolveIt) => {
    // Exit codes only: judged on bytes, which machine load cannot move. Under a full parallel suite
    // the light page once crossed a timing budget here (25 s run, not reproduced in four more); the
    // timing budgets are held by the test above, whose margins are wide.
    const child = spawn(process.execPath, [SCRIPT, '--dist', dist, '--route', 'home=/', '--budget', 'js_kb=20', '--settle', '500'], { env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolveIt({ code, out }));
  });
  const good = await run(LIGHT);
  assert.equal(good.code, 0, good.out);
  assert.match(good.out, /web-perf: 1 route\(s\), 0 over budget/);
  const bad = await run(HEAVY);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /FAIL home/);
});

// ---- --audit seo,a11y: the deterministic half of Lighthouse's SEO and accessibility audits -------

const GOOD = { title: 'Releases', description: 'x'.repeat(80), canonical: true, lang: true, h1: 1, noindex: false, imgNoAlt: 0, unlabelled: 0, nameless: 0, dupIds: 0, headingSkips: 0 };
const BREAK = { title: '', description: 'short', canonical: false, lang: false, h1: 2, noindex: true, imgNoAlt: 1, unlabelled: 1, nameless: 2, dupIds: 1, headingSkips: 1 };

test('audit: a clean page scores 100; each fact broken alone fails exactly its own check', () => {
  assert.deepEqual(audit(GOOD, ['seo', 'a11y']), { seo: { score: 100, failed: [] }, a11y: { score: 100, failed: [] } });
  const facts = { title: ['seo title'], description: ['seo description'], canonical: ['seo canonical'], lang: ['seo lang', 'a11y lang'], h1: ['seo h1'], noindex: ['seo indexable'], imgNoAlt: ['a11y img-alt'], unlabelled: ['a11y control-label'], nameless: ['a11y button-name'], dupIds: ['a11y unique-id'], headingSkips: ['a11y heading-order'] };
  for (const [k, want] of Object.entries(facts)) {
    const r = audit({ ...GOOD, [k]: BREAK[k] }, ['seo', 'a11y']);
    assert.deepEqual([...r.seo.failed, ...r.a11y.failed].map((f) => f.split(':')[0]), want, k);
  }
  assert.equal(audit({ ...GOOD, h1: 0 }, ['seo']).seo.score, 83, 'score is checks passed ÷ checks run');
  assert.equal(Object.keys(AUDITS.seo).length + Object.keys(AUDITS.a11y).length, 12);
});

test('parseArgs: --audit takes seo and a11y, and refuses an audit it does not have', () => {
  assert.deepEqual(parseArgs(['--url', 'a=http://x', '--audit', 'seo,a11y']).audit, ['seo', 'a11y']);
  assert.deepEqual(parseArgs(['--url', 'a=http://x']).audit, []);
  assert.throws(() => parseArgs(['--url', 'a=http://x', '--audit', 'seo,speed']), /--audit speed: unknown/);
});

test('live: the audit reads the rendered page — the clean page scores 100, the broken one fails every check', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const base = ['--route', 'home=/', '--budget', 'js_kb=500', '--audit', 'seo,a11y', '--settle', '200'];
  const [good] = await runWebPerf(parseArgs(['--dist', join(here, 'fixtures', 'valid', 'web-audit'), ...base]));
  assert.deepEqual(good.metrics.audit, { seo: { score: 100, failed: [] }, a11y: { score: 100, failed: [] } }, JSON.stringify(good, null, 2));
  assert.equal(good.ok, true);
  const [bad] = await runWebPerf(parseArgs(['--dist', join(here, 'fixtures', 'broken', 'web-audit'), ...base]));
  assert.equal(bad.ok, false);
  assert.equal(bad.metrics.audit.seo.score, 0, JSON.stringify(bad.metrics.audit));
  assert.equal(bad.metrics.audit.a11y.score, 0, JSON.stringify(bad.metrics.audit));
  assert.equal(bad.breaches.length, 12);
});
