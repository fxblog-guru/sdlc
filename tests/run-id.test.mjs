/**
 * run-id.mjs — the one place a run-id is made (DEV-CONTRACTS §1).
 *
 * Agents used to invent run-ids by hand, and in the field they wrote upper-case hex, five
 * characters, or a local time with no seconds. Every one of those then failed E006 on the gate log,
 * after the review had already been paid for.
 *
 *   node --test tests/run-id.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'run-id.mjs');
const SHAPE = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

test('run-id.mjs prints one run-id in the contract shape, and nothing else', () => {
  const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.match(out, /^\d{8}-\d{6}-[0-9a-f]{4}\n$/);
});

test('run-id is UTC time plus 4 lowercase hex characters', async () => {
  const { runId } = await import(pathToFileURL(SCRIPT).href);
  const id = runId(new Date('2026-09-18T14:35:22.900Z'), () => 0xa81f);
  assert.equal(id, '20260918-143522-a81f');
  assert.equal(runId(new Date('2026-01-02T03:04:05Z'), () => 0x0f), '20260102-030405-000f', 'hex is zero-padded');
  for (let i = 0; i < 50; i += 1) assert.match(runId(), SHAPE);
});

test('the run-id E006 message says 4 lowercase hex and names the generator', async () => {
  const { lintFile, loadTemplates } = await import(pathToFileURL(join(here, '..', 'workspace', 'dev', 'scripts', 'lint-dev.mjs')).href);
  const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const templates = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
  const root = mkdtempSync(join(tmpdir(), 'sdlc-runid-'));
  const name = 'G0-intake-20260916-091203-3F2A.md';
  const src = readFileSync(join(here, 'fixtures', 'valid', 'reviews', 'demo', 'G0-intake-20260916-091203-3f2a.md'), 'utf8');
  mkdirSync(join(root, 'reviews', 'demo'), { recursive: true });
  writeFileSync(join(root, 'reviews', 'demo', name), src.replace('run_id: 20260916-091203-3f2a', 'run_id: 20260916-091203-3F2A'));

  const e006 = lintFile(join(root, 'reviews', 'demo', name), { root, templates }).filter((f) => f.rule === 'E006');
  assert.equal(e006.length, 1, JSON.stringify(e006));
  assert.match(e006[0].message, /4 lowercase hex/);
  assert.match(e006[0].message, /run-id\.mjs/);
});

// --next-cr (§1.1): a CR id comes from the highest across every log of the slug, so a second run
// never restarts at CR-001. release-management had 57 CR ids defined twice with different text.
test('--next-cr <slug> is one past the highest CR in every log of the slug, padded to three digits', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'sdlc-cr-'));
  mkdirSync(join(root, 'reviews', 'demo'), { recursive: true });
  mkdirSync(join(root, 'reviews', 'other'), { recursive: true });
  writeFileSync(join(root, 'reviews', 'demo', 'G1-requirements-20260101-000000-aaaa.md'), '| CR-007 | MINOR |\n');
  writeFileSync(join(root, 'reviews', 'demo', 'G2-design-20260102-000000-bbbb.md'), 'resolves CR-041 and `CR-999` in code\n| CR-012 |\n');
  writeFileSync(join(root, 'reviews', 'other', 'G2-design-20260102-000000-cccc.md'), '| CR-500 |\n');
  const { nextCr } = await import(pathToFileURL(SCRIPT).href);
  assert.deepEqual(nextCr(root, 'demo'), ['CR-042'], 'code spans are quoted, other slugs do not count');
  assert.deepEqual(nextCr(root, 'nobody'), ['CR-001']);
  const out = execFileSync(process.execPath, [SCRIPT, '--next-cr', 'demo', '--root', root], { encoding: 'utf8' });
  assert.equal(out, 'CR-043\n', 'CR-042 is claimed, so the CLI hands out the next one');
});

// Two reviewers started together both read CR-041 as the highest and both wrote CR-042. A claim
// file per id is the lock; without it the second call below returns the first call's id.
test('an id handed out is claimed, so a second caller before any log is written gets a different one', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'sdlc-claim-'));
  const { nextCr, nextDec } = await import(pathToFileURL(SCRIPT).href);
  assert.deepEqual(nextCr(root, 'demo'), ['CR-001']);
  assert.deepEqual(nextCr(root, 'demo', { count: 3 }), ['CR-002', 'CR-003', 'CR-004']);
  assert.deepEqual(nextDec(root, 'demo'), ['DEC-001'], 'DEC and CR number separately');
  assert.deepEqual(nextDec(root, 'demo'), ['DEC-002']);
});

test('parallel processes never get the same id', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawn } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'sdlc-race-'));
  const one = () => new Promise((ok, fail) => {
    const p = spawn(process.execPath, [SCRIPT, '--next-dec', 'demo', '--count', '2', '--root', root]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => (code === 0 ? ok(out.trim().split('\n')) : fail(new Error(`exit ${code}`))));
  });
  const ids = (await Promise.all(Array.from({ length: 8 }, one))).flat();
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, 16, ids.join(' '));
});

test('a claim older than the TTL is freed; an id already in the ledger is never reissued', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'sdlc-ttl-'));
  mkdirSync(join(root, 'decisions'), { recursive: true });
  writeFileSync(join(root, 'decisions', 'demo.md'), '| DEC-004 | q |\n| `DEC-900` quoted |\n');
  const { nextDec, CLAIM_TTL_MS } = await import(pathToFileURL(SCRIPT).href);
  assert.deepEqual(nextDec(root, 'demo'), ['DEC-005']);
  assert.deepEqual(nextDec(root, 'demo', { now: Date.now() + CLAIM_TTL_MS + 1000 }), ['DEC-005'], 'the stale claim on DEC-005 lapsed');
});

test('--next-dec without a slug and a bad --count are usage errors', () => {
  for (const args of [['--next-dec'], ['--next-cr', 'demo', '--count', '0']]) {
    let code = 0;
    try { execFileSync(process.execPath, [SCRIPT, ...args], { stdio: 'pipe' }); } catch (e) { code = e.status; }
    assert.equal(code, 2, args.join(' '));
  }
});
