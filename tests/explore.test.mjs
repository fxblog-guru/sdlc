/**
 * explore.mjs — the per-slice exploratory pass (DEV-CONTRACTS §9, §13.3).
 *
 * The fixture app under tests/fixtures/explore/app builds six behaviour rows (good.html) or ships
 * release-management's defects (bad.html): Esc, close and Back drop typed input, focus is not
 * returned, the filter is not in the URL, a double click saves twice, a viewer sees the create
 * button. One plan runs against both, with one browser context per role. Every probe must pass on
 * good and fail on bad, except the keyboard one, which both build.
 *
 * The live half needs Playwright (PLAYWRIGHT_PATH, or a project install above the working
 * directory) and Edge; it is skipped otherwise. The plan checks and the note need neither.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { envValue, explore, loadPlaywright, parseArgs, readPlan, renderNote } from '../workspace/dev/scripts/explore.mjs';
import { loadTemplates, lintTree } from '../workspace/dev/scripts/lint-dev.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'explore');
const PLAN = JSON.parse(readFileSync(join(FIX, 'plan.json'), 'utf8'));

test('readPlan: a good plan reads; literal credentials, unknown kinds and missing fields are refused together', () => {
  assert.equal(readPlan(PLAN).probes.length, 6);
  const bad = structuredClone(PLAN);
  bad.roles.member.signIn.fields = { Password: 'hunter2' };
  bad.probes[0].kind = 'vibes';
  delete bad.probes[1].open;
  bad.probes[2].ub = 'AC-001';
  const err = (() => { try { readPlan(bad); } catch (e) { return e.message; } return ''; })();
  assert.match(err, /never a literal/);
  assert.match(err, /kind `vibes`/);
  assert.match(err, /focus-return needs `open`/);
  assert.match(err, /UB-NNN/);
});

test('envValue: $NAME resolves, an unset one is an error, never an empty string', () => {
  assert.equal(envValue('$X_ONE', { X_ONE: 'a' }), 'a');
  assert.equal(envValue('plain'), 'plain');
  assert.throws(() => envValue('$NOPE_NOT_SET', {}), /NOPE_NOT_SET is not set/);
});

test('parseArgs: plan, slug and slice are required; the note lands under implementation/<slug>/exploration', () => {
  const o = parseArgs(['--plan', 'p.json', '--slug', 'demo', '--slice', '2', '--root', 'dev']);
  assert.match(o.out.replace(/\\/g, '/'), /\/dev\/implementation\/demo\/exploration\/slice-2\.md$/);
  // No --root, and the bundle repository has neither .sdlc/ nor dev/: the default root is .sdlc (§2).
  const d = parseArgs(['--plan', 'p.json', '--slug', 'demo', '--slice', '2']);
  assert.match(d.out.replace(/\\/g, '/'), /\/\.sdlc\/implementation\/demo\/exploration\/slice-2\.md$/);
  assert.throws(() => parseArgs(['--plan', 'p.json', '--slug', 'demo']), /--slice/);
  assert.throws(() => parseArgs(['--plan', 'p.json', '--slug', 'demo', '--slice', 'two']), /number/);
});

const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
function lintNote(text) {
  const root = mkdtempSync(join(tmpdir(), 'explore-lint-'));
  const rel = 'implementation/demo/exploration/slice-1.md';
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  return lintTree(root, TEMPLATES).filter((f) => f.level === 'error');
}

test('renderNote: the note lints clean as artifact exploration, with results and when NOT RUN', () => {
  const results = [{ ub: 'UB-001', role: 'member', kind: 'discard-guard', result: 'FAIL', evidence: 'escape with typed input: the dialog closed', snapshot: 'snaps/UB-001-member-discard-guard.txt' }];
  const note = renderNote({ slug: 'demo', slice: '1', base: 'http://localhost:5173', commit: 'abc1234', roles: ['member'], results, owners: { 'UB-001': 'lane-web' }, today: '2026-10-13' });
  assert.deepEqual(lintNote(note), []);
  assert.match(note, /\| UB-001 \| member \| escape with typed input: the dialog closed \| lane-web \|/);
  assert.match(note, /not functional certification/);
  const notRun = renderNote({ slug: 'demo', slice: '1', base: 'http://x', roles: [], notRun: 'Playwright is not installed', today: '2026-10-13' });
  assert.deepEqual(lintNote(notRun), []);
  assert.match(notRun, /NOT RUN — Playwright is not installed/);
});

// ---------------------------------------------------------------------------------------------
// Live: a real browser over the fixture app.
// ---------------------------------------------------------------------------------------------

function serve(mode) {
  const app = (f) => readFileSync(join(FIX, 'app', f), 'utf8');
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/api/releases') { res.writeHead(201); res.end('{}'); return; }
    if (u.pathname === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(app('app.js')); return; }
    if (u.pathname === '/sign-in') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><main><label>Role <input name="role"></label><button type="button" onclick="document.cookie=\'role=member; path=/\'; location.href=\'/releases\'">Sign in</button></main>');
      return;
    }
    if (u.pathname === '/releases') {
      const head = u.searchParams.get('as') === 'viewer' ? { 'set-cookie': 'role=viewer; Path=/' } : {};
      res.writeHead(200, { 'content-type': 'text/html', ...head });
      res.end(app(`${mode}.html`));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => { server.listen(0, '127.0.0.1', () => r(server)); });
}

const pw = await loadPlaywright();
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge', '/opt/microsoft/msedge/msedge'].some((p) => existsSync(p)) || !!process.env.EXPLORE_CHANNEL;
const skip = (!pw.chromium && 'Playwright not installed — set PLAYWRIGHT_PATH to a playwright package directory') || (!edge && 'no Edge found — set EXPLORE_CHANNEL');

test('live: every probe passes on the app that builds its rows, and the defects fail with what was seen', { skip, timeout: 180_000 }, async () => {
  process.env.EXPLORE_FIXTURE_ROLE = 'member';
  const out = {};
  for (const mode of ['good', 'bad']) {
    const server = await serve(mode);
    try {
      const plan = readPlan({ ...PLAN, base: `http://127.0.0.1:${server.address().port}` });
      out[mode] = await explore(plan, { chromium: pw.chromium, outDir: mkdtempSync(join(tmpdir(), `explore-${mode}-`)) });
    } finally {
      server.close();
    }
  }
  const by = (rs) => Object.fromEntries(rs.map((r) => [r.ub, r.result]));
  assert.deepEqual(by(out.good), { 'UB-001': 'PASS', 'UB-002': 'PASS', 'UB-003': 'PASS', 'UB-004': 'PASS', 'UB-005': 'PASS', 'UB-006': 'PASS' }, JSON.stringify(out.good, null, 1));
  assert.deepEqual(by(out.bad), { 'UB-001': 'FAIL', 'UB-002': 'FAIL', 'UB-003': 'FAIL', 'UB-004': 'FAIL', 'UB-005': 'FAIL', 'UB-006': 'PASS' }, JSON.stringify(out.bad, null, 1));
  const why = Object.fromEntries(out.bad.map((r) => [r.ub, r.evidence]));
  assert.match(why['UB-001'], /escape with typed input: the dialog closed/);
  assert.match(why['UB-002'], /focus went to body .*not back to button "New release"/);
  assert.match(why['UB-003'], /the URL lacks q=hotfix/);
  assert.match(why['UB-004'], /sent 2 matching request/);
  assert.match(why['UB-005'], /button "New release" is shown to this role/);
  assert.ok(out.good.every((r) => r.snapshot.startsWith('snaps/')), 'each probe keeps an accessibility snapshot');
});
