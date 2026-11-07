/**
 * The Error-UX matrix (DEV-CONTRACTS §13.3, lint E080 / E081 / W080): a ui-spec covers every
 * ProblemType the slug's contract declares, and every required status, with no empty cell.
 *
 *   node --test tests/error-ux.test.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { checkMatrix, problemTypes, REQUIRED_STATUSES } from '../workspace/dev/scripts/lib/error-ux.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const FIX = join(here, 'fixtures', 'error-ux');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const OPENAPI = read(join(FIX, 'openapi.yaml'));

test('problemTypes reads the ProblemType enum, block or inline, and is null without one', () => {
  assert.deepEqual(problemTypes(OPENAPI), ['/problems/validation', '/problems/not-found', '/problems/not-a-project-member', '/problems/precondition-failed']);
  assert.deepEqual(problemTypes('components:\n  schemas:\n    ProblemType:\n      type: string\n      enum: [/problems/a, "/problems/b"]\n'), ['/problems/a', '/problems/b']);
  assert.equal(problemTypes('openapi: 3.1.0\n'), null);
});

/** A dev root with the fixture contract and a ui-spec whose States section carries `matrix`. */
function root(matrix, { api = true } = {}) {
  const r = mkdtempSync(join(tmpdir(), 'sdlc-errux-'));
  const spec = read(join(FIX, 'ui-spec.md')).replace('<!--MATRIX-->', matrix);
  mkdirSync(join(r, 'ui', 'demo'), { recursive: true });
  writeFileSync(join(r, 'ui', 'demo', 'ui-spec.md'), spec);
  if (api) {
    mkdirSync(join(r, 'api', 'demo'), { recursive: true });
    writeFileSync(join(r, 'api', 'demo', 'openapi.yaml'), OPENAPI);
  }
  return r;
}
const rules = (r) => lintTree(r, TEMPLATES).filter((f) => /^[EW]08/.test(f.rule)).map((f) => f.rule);
const FULL = read(join(FIX, 'matrix-full.md'));

test('valid: a full matrix lints clean', () => {
  assert.deepEqual(rules(root(FULL)), []);
});

test('E080: a missing problem type, a missing status, or a missing matrix', () => {
  assert.deepEqual(rules(root(FULL.replace(/^\| not-a-project-member .*\n/m, ''))), ['E080']);
  assert.deepEqual(rules(root(FULL.replace(/^\| 429 .*\n/m, ''))), ['E080']);
  const none = root(FULL.replace('### Error-UX matrix', '### Something else'));
  assert.deepEqual(rules(none), ['E080']);
  assert.deepEqual(rules(root(FULL.replace('| Retry |', '| Notes |'))), ['E080'], 'a missing column');
});

test('E081: an empty cell; W080: a row for a problem the contract does not declare', () => {
  assert.deepEqual(rules(root(FULL.replace(/^(\| 412 \|[^|]*\|[^|]*\|)[^|]*\|/m, '$1  |'))), ['E081']);
  assert.deepEqual(rules(root(`${FULL.trimEnd()}\n| /problems/gone-away | notice | Notice | errors.generic | no |\n`)), ['W080']);
});

test('without a contract the matrix is not required, and a present one is still checked for empty cells', () => {
  assert.deepEqual(rules(root('', { api: false })), []);
  assert.deepEqual(checkMatrix('### Error-UX matrix\n\n| Problem | Surface | Component | Copy key | Retry |\n|---|---|---|---|---|\n| 401 | page | | errors.signin | no |\n', null).map((f) => f.rule), ['E081']);
  assert.equal(REQUIRED_STATUSES.length, 10);
});

test('§11.1: E080 under a G5 judged before the Error-UX row is a warning; under one that has the row, an error', () => {
  // release-management's G5 passed before G5 row 24 existed; its ui-spec has no matrix.
  const levels = (r) => lintTree(r, TEMPLATES).filter((f) => f.rule === 'E080').map((f) => f.level);
  const g5 = (row) => `---\nslug: demo\ngate: G5\nstage: ui\nrun_id: 20260917-160500-9a22\nattempt: 1\nverdict: PASS\nreviewer: dev-reviewing-ui\n---\n\n## Checklist\n\n| # | Check | Result | Evidence |\n|---|---|---|---|\n| 1 | ${row} | PASS | ui-spec.md |\n`;
  const r = root('');
  assert.deepEqual(levels(r), ['error'], 'no G5 log yet: authored under the current rules');
  mkdirSync(join(r, 'reviews', 'demo'), { recursive: true });
  writeFileSync(join(r, 'reviews', 'demo', 'G5-ui-20260917-160500-9a22.md'), g5('Every state is specified'));
  const old = lintTree(r, TEMPLATES).filter((f) => f.rule === 'E080');
  assert.deepEqual(old.map((f) => f.level), ['warn']);
  assert.match(old[0].message, /judged before this rule's checklist row existed.*next G5 review/);
  writeFileSync(join(r, 'reviews', 'demo', 'G5-ui-20260917-160500-9a22.md'), g5('`## States` carries the Error-UX matrix'));
  assert.deepEqual(levels(r), ['error'], 'a G5 that judged with the row: the rule bites');
});
