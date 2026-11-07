/**
 * E060 / W060: a G8 row NOT RUN "because CI runs it" must be proven by a CI job before G9 passes
 * (DEV-CONTRACTS §5.6).
 *
 * On release-management `-race` (no cgo), the 60 s fuzz and the DB roles (no psql) were all NOT RUN
 * with "CI's job runs it", and nothing downstream asked for that job.
 *
 *   node --test tests/ci-deferral.test.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ciProofs, deferredRows, lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const RUN = '20261013-071718-50c4';

const VERIFY = `---
slug: demo
artifact: verify
---

## Quality gates

| Gate | Command | Result | Threshold | Actual | Raw output |
|---|---|---|---|---|---|
| Build | go build ./... | PASS | exit 0 | 0 | logs/build.txt |
| Unit tests (Go) -race | go test -race | NOT RUN | 0 races | no cgo C compiler here; CI's go:unit job runs it | logs/go-unit.txt |
| Fuzz | check.sh go-fuzz | NOT RUN | no crash | CI's go:fuzz job runs it | logs/go-fuzz.txt |
| Visual | ui-snap | NOT RUN — awaiting approval | requester approves | 192 shots | ui-snap/compare.html |
`;

const log = (gate, stage, verdict, inputs = '') => `---
slug: demo
gate: ${gate}
stage: ${stage}
run_id: ${RUN}
attempt: 1
verdict: ${verdict}
reviewer: dev-reviewing-${stage}
inputs:${inputs}
outputs:
findings: { blocker: 0, major: 0, minor: 0, info: 0 }
unlocks: none
skip_reason: null
override: null
revalidated_from: null
---
`;

function project({ pr = null, g9 = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-ci-'));
  const run = join(root, 'verification', 'demo', 'runs', RUN);
  mkdirSync(join(run, 'logs'), { recursive: true });
  writeFileSync(join(run, 'verify.md'), VERIFY);
  writeFileSync(join(run, 'logs', 'ci-go-fuzz.txt'), 'ok\n');
  mkdirSync(join(root, 'reviews', 'demo'), { recursive: true });
  writeFileSync(join(root, 'reviews', 'demo', `G8-verification-${RUN}.md`), log('G8', 'verification', 'PASS', `\n  - path: dev/verification/demo/runs/${RUN}/verify.md\n    sha256: 0`));
  if (pr != null) {
    mkdirSync(join(root, 'release', 'demo'), { recursive: true });
    writeFileSync(join(root, 'release', 'demo', 'pull-request.md'), `---\nslug: demo\n---\n\n## Gate logs\n\n${pr}\n`);
  }
  if (g9) writeFileSync(join(root, 'reviews', 'demo', `G9-release-${RUN}.md`), log('G9', 'release', g9));
  return root;
}

const rules = (root) => lintTree(root, TEMPLATES).filter((f) => /06\d$/.test(f.rule)).map((f) => `${f.level}:${f.rule}`);

test('deferredRows picks the rows CI is said to run, not an approval wait', () => {
  assert.deepEqual(deferredRows(VERIFY.split('---\n').at(-1)), ['Unit tests (Go) -race', 'Fuzz']);
});

test('ciProofs accepts a job URL or a log path that exists, and nothing that did not pass', () => {
  const root = project();
  const text = [
    'CI proof: Unit tests (Go) -race — https://gitlab.example/p/-/jobs/42 — passed',
    `CI proof: Fuzz — dev/verification/demo/runs/${RUN}/logs/ci-go-fuzz.txt — passed`,
    'CI proof: Build — https://gitlab.example/p/-/jobs/43 — failed',
    'CI proof: Lint — logs/none.txt — passed',
  ].join('\n');
  assert.deepEqual([...ciProofs(text, root)].sort(), ['fuzz', 'unit tests (go) -race']);
});

test('at G8, each deferred row is a W060 warning, and the approval wait is not', () => {
  assert.deepEqual(rules(project()), ['warn:W060', 'warn:W060']);
});

test('a G9 PASS without proof is E060; with proof for every row it is silent', () => {
  assert.deepEqual(rules(project({ pr: 'CI proof: Fuzz — https://ci.example/j/1 — passed', g9: 'PASS' })), ['warn:W060', 'error:E060']);
  const proven = 'CI proof: Unit tests (Go) -race — https://ci.example/j/1 — passed\nCI proof: Fuzz — https://ci.example/j/2 — passed';
  assert.deepEqual(rules(project({ pr: proven, g9: 'PASS' })), []);
});

test('a G9 that did not pass is not E060 — only the warning stands', () => {
  assert.deepEqual(rules(project({ pr: '', g9: 'CHANGES_REQUESTED' })), ['warn:W060', 'warn:W060']);
});
