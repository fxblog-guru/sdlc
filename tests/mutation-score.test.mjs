/**
 * mutation-score.mjs — the mutation score per changed module, from Stryker and gremlins (DEV-CONTRACTS §13.10).
 *
 * Fixtures: a Stryker mutation.json (one module at 75%, one at 33%, one untouched), a gremlins
 * report (one package at 75%), and a changed-file list that also names a Go package no report
 * covers — which must be NOT RUN, never a pass.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readReport, score } from '../workspace/dev/scripts/mutation-score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'mutation-score');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'mutation-score.mjs');
const json = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const changed = readFileSync(join(FIX, 'changed.txt'), 'utf8').split('\n').filter(Boolean);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

test('readReport detects each format; timeouts count as killed, no-coverage as survived, compile errors not at all', () => {
  const s = readReport(json('stryker.json'), { prefixes: [['src', 'web/src']] });
  assert.equal(s.tool, 'stryker');
  assert.deepEqual(s.files.find((f) => f.file === 'web/src/features/backlog/BacklogItemDialog.tsx'), { file: 'web/src/features/backlog/BacklogItemDialog.tsx', killed: 3, survived: 1 });
  const g = readReport(json('gremlins.json'));
  assert.equal(g.tool, 'gremlins');
  assert.deepEqual(g.files[0], { file: 'internal/bug/counts.go', killed: 3, survived: 1 });
  assert.throws(() => readReport({ hello: 1 }), /not a Stryker/);
});

test('score: per changed module, tests and docs ignored, untouched modules left out, a module with no mutant NOT RUN', () => {
  const rows = score([readReport(json('stryker.json'), { prefixes: [['src', 'web/src']] }), readReport(json('gremlins.json'))], changed, 60);
  assert.deepEqual(rows.map((r) => [r.module, r.score, r.result]), [
    ['internal/bug', 75, 'PASS'],
    ['internal/release', null, 'NOT RUN'],
    ['web/src/components', 33.3, 'FAIL'],
    ['web/src/features/backlog', 75, 'PASS'],
  ]);
});

test('cli: exit 1 while a module is below threshold or not run, 0 when every changed module passes', () => {
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, '--report', join(FIX, 'stryker.json'), '--report', join(FIX, 'gremlins.json'), '--prefix', 'src=web/src', ...a], { encoding: 'utf8', env });
  const bad = run('--changed', join(FIX, 'changed.txt'));
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /\| web\/src\/components \| stryker \| 1 \| 2 \| 33\.3 \| 60 \| FAIL \|/);
  assert.match(bad.stdout, /internal\/release .*NOT RUN/);
  const dir = mkdtempSync(join(tmpdir(), 'mut-'));
  writeFileSync(join(dir, 'c.txt'), 'internal/bug/counts.go\nweb/src/features/backlog/BacklogItemDialog.tsx\n');
  assert.equal(run('--changed', join(dir, 'c.txt')).status, 0);
  assert.equal(run('--changed', join(dir, 'c.txt'), '--threshold', '80').status, 1, 'a stricter threshold fails 75%');
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env }).status, 2);
});
