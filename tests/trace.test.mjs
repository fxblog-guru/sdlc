/**
 * trace.mjs — an AC or behaviour row is traced only when a test file names it (DEV-CONTRACTS §6).
 *
 * Fixtures: tests/fixtures/trace/valid traces every required id across Go, TS and Python tests;
 * tests/fixtures/trace/broken leaves one id cited only in non-test code, one named nowhere, and one
 * near-miss (`AC-0021`) that must not count as `AC-002`.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { trace, parseArgs } from '../workspace/dev/scripts/trace.mjs';
import { isTestFile } from '../workspace/dev/scripts/lib/code.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'trace');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'trace.mjs');
const run = (which) => trace({ devRoot: join(FIX, which, 'dev'), slug: 'demo', srcRoots: [join(FIX, which)] });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const cli = (which, ...args) => spawnSync(process.execPath, [SCRIPT, 'demo', '--root', join(FIX, which, 'dev'), '--src', join(FIX, which), ...args], { encoding: 'utf8', env });

test('isTestFile: Go, TS/JS and Python test naming, and not their sources', () => {
  for (const p of ['a/b_test.go', 'x/Y.test.tsx', 'x/y.spec.ts', 'src/__tests__/Dialog.tsx', 'pkg/test_x.py', 'pkg/x_test.py']) assert.ok(isTestFile(p), p);
  for (const p of ['a/b.go', 'x/Y.tsx', 'pkg/x.py', 'tests_helper.ts']) assert.ok(!isTestFile(p), p);
});

test('valid: every unit/integration AC and every UB row is traced; automation is listed, not required', () => {
  const r = run('valid');
  assert.deepEqual(r.gaps, [], r.gaps.map((g) => g.id).join(', '));
  assert.equal(r.counts.required, 6);
  assert.equal(r.counts.traced, 6);
  assert.equal(r.counts.qa, 1);
  assert.equal(r.rows.find((x) => x.id === 'AC-101').status, 'qa');
  assert.deepEqual(r.rows.find((x) => x.id === 'UB-002').tests, ['tools/test_focus.py']);
  assert.ok(!r.rows.some((x) => x.tests.some((t) => t.startsWith('dev/'))), 'the dev root is never searched');
});

test('broken: an id only in non-test code, an id nowhere, and a near-miss id are all untraced', () => {
  const r = run('broken');
  const gaps = Object.fromEntries(r.gaps.map((g) => [g.id, g.status]));
  assert.deepEqual(gaps, { 'AC-002': 'untraced', 'AC-003': 'code-only', 'UB-002': 'untraced' });
  assert.deepEqual(r.rows.find((x) => x.id === 'AC-003').code, ['internal/testcase/repo.go']);
});

test('cli: --check exits 0 on the valid tree and 1 on the broken one, naming each gap', () => {
  const ok = cli('valid', '--check');
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /6\/6 traced/);
  const bad = cli('broken', '--check');
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /UNTRACED AC-003 .*only in non-test code: internal\/testcase\/repo\.go/);
  assert.match(bad.stdout, /UNTRACED UB-002/);
  assert.equal(cli('broken').status, 0, 'without --check it reports and exits 0');
});

test('parseArgs: a slug is required; --src defaults to the dev root parent', () => {
  assert.throws(() => parseArgs([]), /slug/);
  assert.throws(() => parseArgs(['demo', '--nope']), /unknown/);
  assert.equal(parseArgs(['demo', '--root', 'x/dev']).src.length, 1);
});
