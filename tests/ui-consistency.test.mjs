/**
 * ui-consistency.mjs — one computed value per role across screens (DEV-CONTRACTS §13.3).
 *
 * The judging is tested on plain histograms. The live tests load the fixture pages in headless
 * Edge or Chrome: two screens that agree must pass, and two that disagree on button height, h1
 * size, row height, a status colour and a toolbar gap must fail on exactly those roles. They are
 * skipped where no browser is found.
 *
 *   node --test tests/ui-consistency.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { histogram, judgeHistogram, parseArgs, runConsistency } from '../workspace/dev/scripts/ui-consistency.mjs';
import { findBrowser } from '../workspace/dev/scripts/ui-snap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'consistency');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'ui-consistency.mjs');
let browser = null;
try { browser = findBrowser(); } catch { browser = null; }

test('judgeHistogram: one value passes, two fail, a declared second value passes', () => {
  const h = histogram([
    { page: 'a', role: 'h1.size', value: '28px', where: 'h1' },
    { page: 'b', role: 'h1.size', value: '28px', where: 'h1' },
    { page: 'c', role: 'h1.size', value: '20px', where: 'h1' },
    { page: 'a', role: 'button.primary.md', value: '36px', where: 'button' },
  ]);
  const fails = judgeHistogram(h);
  assert.equal(fails.length, 1);
  assert.deepEqual(fails[0].undeclared, ['20px']);
  assert.deepEqual(fails[0].values, { '28px': 2, '20px': 1 });
  assert.match(fails[0].examples[0], /^c: /);
  assert.deepEqual(judgeHistogram(h, { 'h1.size': ['20px'] }), []);
});

test('parseArgs: name=url pairs, bare files become file URLs', () => {
  const o = parseArgs(['--url', 'list=http://localhost:5173/releases', '--url', 'x.html', '--width', '1024']);
  assert.deepEqual(o.urls[0], { name: 'list', url: 'http://localhost:5173/releases' });
  assert.match(o.urls[1].url, /^file:\/\/.*x\.html$/);
  assert.equal(o.width, 1024);
  assert.throws(() => parseArgs(['--nope']));
});

const urls = (dir) => ['releases', 'backlog'].map((n) => ({ name: n, url: new URL(`file:///${join(FIX, dir, `${n}.html`).replace(/\\/g, '/')}`).href }));

test('live: two screens that agree pass', { skip: !browser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const r = await runConsistency({ urls: urls('valid'), wait: 1500 });
  assert.deepEqual(r.fails, []);
  assert.ok(r.histogram['button.primary.md'] && r.histogram['h1.size'] && r.histogram['table.row'] && r.histogram['status.done.bg'] && r.histogram['gap.toolbar'], Object.keys(r.histogram).join(', '));
});

test('live: two screens that disagree fail on exactly the roles that differ', { skip: !browser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const r = await runConsistency({ urls: urls('broken'), wait: 1500 });
  assert.deepEqual(r.fails.map((f) => f.role).sort(), ['button.secondary.md', 'gap.toolbar', 'h1.size', 'status.done.bg', 'table.row']);
  const declared = spawnSync(process.execPath, [SCRIPT, ...urls('broken').flatMap((u) => ['--url', `${u.name}=${u.url}`]), '--declare', join(FIX, 'declare-h1.json'), '--wait', '1500', '--json'], { encoding: 'utf8', timeout: 90_000 });
  assert.equal(declared.status, 1, declared.stderr);
  assert.ok(!JSON.parse(declared.stdout).fails.some((f) => f.role === 'h1.size'), 'a declared deviation is not a failure');
});
