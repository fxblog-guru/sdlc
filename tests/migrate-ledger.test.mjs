/**
 * migrate-ledger-inputs.mjs (DEV-CONTRACTS §5.2): a whole-ledger input becomes the rows its log relied
 * on, hashed as they stood in the reviewed version — so the migration never turns a stale gate fresh.
 *
 *   node --test tests/migrate-ledger.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildState } from '../workspace/dev/scripts/build-state.mjs';
import { hashArtifact, hashRef } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'migrate-ledger-inputs.mjs');
const LOG = 'reviews/demo/G2-design-20260917-101422-7c15.md';

/** The valid corpus in a git repo, with G2 listing the whole ledger and citing DEC-002 in its body. */
function repo({ commit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-migrate-'));
  const root = join(dir, 'dev');
  cpSync(join(here, 'fixtures', 'valid'), root, { recursive: true });
  const log = join(root, LOG);
  const ledger = hashArtifact(join(root, 'decisions', 'demo.md'));
  writeFileSync(log, readFileSync(log, 'utf8').replace(/\r\n/g, '\n')
    .replace('inputs:\n', `inputs:\n  - path: dev/decisions/demo.md\n    sha256: ${ledger}\n`)
    .replace('## Scope\n', '## Scope\n\nThe page size is DEC-002.\n'));
  if (commit) {
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'reviewed');
  }
  return root;
}

const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
const g2 = (root) => buildState(root).initiatives[0].stages.find((s) => s.gate === 'G2');
const addRow = (root) => {
  const p = join(root, 'decisions', 'demo.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('| DEC-002 |', '| DEC-003 | New? | why | a · b | a | none | open | — |\n| DEC-002 |'));
};

test('dry run by default: reports the rewrite and changes nothing', () => {
  const root = repo();
  const before = readFileSync(join(root, LOG), 'utf8');
  const r = run(root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /would migrate .*G2-design[\s\S]*dev\/decisions\/demo\.md -> dev\/decisions\/demo\.md#DEC-002/);
  assert.equal(readFileSync(join(root, LOG), 'utf8'), before);
});

test('--write rewrites only that input, to the rows hashed as reviewed', () => {
  const root = repo();
  const before = readFileSync(join(root, LOG), 'utf8');
  addRow(root); // after the review: the rows are hashed from the reviewed version, not from disk
  assert.equal(run(root, '--write').status, 0);
  const after = readFileSync(join(root, LOG), 'utf8');
  const want = hashRef(`${join(root, 'decisions', 'demo.md')}#DEC-002`);
  assert.match(after, new RegExp(`- path: dev/decisions/demo\.md#DEC-002\n    sha256: ${want}\n`));
  const strip = (s) => s.replace(/- path: dev\/decisions\/demo\.md[^\n]*\n    sha256: \S+\n/, '');
  assert.equal(strip(after), strip(before), 'nothing else in the log changed');
  assert.equal(run(root).stdout.includes('would migrate'), false, 'a second run finds nothing to do');
});

test('a gate stale against its own rows stays stale after migration', () => {
  const root = repo();
  const p = join(root, 'decisions', 'demo.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('| none | answered | 20 |', '| none | answered | 50 |'));
  assert.equal(run(root, '--write').status, 0);
  const s = g2(root);
  assert.equal(s.state, 'STALE');
  assert.equal(s.stale_because.find((x) => /decisions/.test(x.path)).path, 'dev/decisions/demo.md#DEC-002');
});

test('a log whose reviewed ledger is not in history is left alone and reported', () => {
  const root = repo();
  const log = join(root, LOG);
  writeFileSync(log, readFileSync(log, 'utf8').replace(/(path: dev\/decisions\/demo\.md\n    sha256: )\S+/, `$1${'e'.repeat(64)}`));
  const before = readFileSync(log, 'utf8');
  const r = run(root, '--write');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /left alone[\s\S]*no committed ledger/);
  assert.equal(readFileSync(log, 'utf8'), before);
});

test('outside git it refuses, rather than claiming there is nothing to migrate', () => {
  const r = run(repo({ commit: false }));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a git repository/);
});
