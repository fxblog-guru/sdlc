/**
 * --baseline for the §13.11 checkers: a project adopting a checker late records today's findings
 * once and then fails only on what it adds. release-management carried 207 problems-check and 217
 * api-style findings on the day the checkers arrived; without a baseline the gate stays red until
 * all of them are paid, which is how a check gets switched off.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, edit, run } from './backend-fixture.mjs';
import { fingerprint } from '../workspace/dev/scripts/lib/check.mjs';

const ARGS = ['demo', '--root', 'dev'];

test('the fingerprint ignores line numbers and digits in the message', () => {
  const a = fingerprint({ code: 'E108', file: 'x.yaml', line: 10, message: 'op 3 at col 7' });
  const b = fingerprint({ code: 'E108', file: 'x.yaml', line: 99, message: 'op 4 at col 12' });
  assert.equal(a, b);
  assert.notEqual(a, fingerprint({ code: 'E109', file: 'x.yaml', message: 'op 3 at col 7' }));
});

test('known errors are baseline warnings; a new error still fails; a fixed one is cleared', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', '      x-idempotency: required\n      x-concurrency: none:a new record has no prior version\n', '      x-concurrency: maybe\n');
  const file = join(root, 'baseline.json');
  const before = run('api-style-check.mjs', [...ARGS, '--write-baseline', file], root);
  assert.equal(before.status, 1, 'writing a baseline does not hide today\'s errors');
  assert.ok(existsSync(file));
  const recorded = JSON.parse(readFileSync(file, 'utf8')).findings.length;
  assert.ok(recorded >= 2, `recorded ${recorded}`);

  const held = run('api-style-check.mjs', [...ARGS, '--baseline', file], root);
  assert.equal(held.status, 0, held.stdout);
  assert.ok(held.json.findings.every((f) => f.baseline && f.level === 'warn'));
  assert.match(held.json.summary.baseline, new RegExp(`^${recorded} known, 0 cleared`));

  edit(root, 'dev/api/demo/openapi.yaml', "        '412': { $ref: '#/components/responses/Problem' }\n    delete:", '    delete:');
  const added = run('api-style-check.mjs', [...ARGS, '--baseline', file], root);
  assert.equal(added.status, 1, 'an error the baseline does not hold fails');
  assert.ok(added.json.findings.some((f) => f.level === 'error' && !f.baseline));
});

test('a missing baseline file is a usage error, not a silent pass', () => {
  const r = run('api-style-check.mjs', [...ARGS, '--baseline', 'nope.json'], project());
  assert.notEqual(r.status, 0);
});

test('every §13.11-style checker takes --write-baseline with a file, not as a switch', () => {
  // On release-management, api-contract-check listed it as a boolean and crashed writing `true`.
  const root = project();
  for (const [script, args] of [['api-contract-check.mjs', ARGS], ['api-style-check.mjs', ARGS]]) {
    const file = join(root, `${script}.baseline.json`);
    const r = run(script, [...args, '--write-baseline', file], root);
    assert.ok(r.json, `${script}: ${r.stderr}`);
    assert.ok(existsSync(file), `${script} wrote no baseline`);
  }
});
