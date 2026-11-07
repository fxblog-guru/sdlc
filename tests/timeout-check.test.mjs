/**
 * timeout-check.mjs — a raised timeout or an added retry in a test needs a recorded cause (DEV-CONTRACTS §13.10).
 *
 * broken.diff raises a vitest timeout, sets a per-test one, adds a retry whose "cause" is just
 * "flaky", a Go -timeout, a Playwright retry and a pytest flaky marker — six findings. valid.diff
 * does the same kinds of thing with a cause each time, lowers values, and touches production code
 * that has its own timeouts and retries — none.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { findings, parseDiff, toMs } from '../workspace/dev/scripts/timeout-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'timeout-check');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'timeout-check.mjs');
const read = (f) => readFileSync(join(FIX, f), 'utf8');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

test('toMs reads ms, s, m and underscores', () => {
  assert.equal(toMs('30_000'), 30000);
  assert.equal(toMs('30s'), 30000);
  assert.equal(toMs('10m'), 600000);
  assert.equal(toMs('abc'), null);
});

test('parseDiff keeps new-file line numbers', () => {
  const [f] = parseDiff(read('broken.diff'));
  assert.equal(f.path, 'web/vitest.config.ts');
  assert.equal(f.hunks[0].find((l) => l.kind === '+').line, 5);
});

test('broken: every raise and retry without a cause is a finding, "flaky" is not a cause', () => {
  const f = findings(read('broken.diff'));
  assert.deepEqual(f.map((x) => `${x.file}:${x.kind}`), [
    'web/vitest.config.ts:timeout',
    'web/src/features/Dialog.test.tsx:timeout',
    'web/src/features/Dialog.test.tsx:retry',
    'internal/job/service_test.go:timeout',
    'e2e/playwright.config.ts:retry',
    'tests/test_api.py:retry',
  ]);
  assert.match(f[0].message, /5000 → 30000/);
});

test('valid: a cause on the line or above, a lowered value, a removed retry, production code — no finding', () => {
  assert.deepEqual(findings(read('valid.diff')), []);
});

test('cli: --diff exits 1 on broken and 0 on valid; --base reads git', () => {
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8', env });
  assert.equal(run('--diff', join(FIX, 'broken.diff')).status, 1);
  assert.equal(run('--diff', join(FIX, 'valid.diff')).status, 0);
  assert.equal(run().status, 2);
  const repo = mkdtempSync(join(tmpdir(), 'timeout-'));
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(repo, 'web'));
  writeFileSync(join(repo, 'web', 'a.test.ts'), "it('x', () => {}, { timeout: 1000 });\n");
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(repo, 'web', 'a.test.ts'), "it('x', () => {}, { timeout: 9000 });\n");
  git('commit', '-qam', 'raise');
  const r = run('--base', base, '--repo', repo);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /web\/a\.test\.ts:1 raises a test timeout \(timeout 1000 → 9000\)/);
});
