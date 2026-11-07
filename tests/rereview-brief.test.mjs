/**
 * The re-review brief (DEV-CONTRACTS §4.3): attempt 2, or a re-entry after STALE, reads the diff since
 * the prior log judged its outputs, plus that log's open findings — not every path again.
 *
 *   node --test tests/rereview-brief.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hashArtifact } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'reaffirm-check.mjs');
const LOG = 'dev/reviews/demo/G1-requirements-20260916-141855-b09e.md';
const REQ = 'dev/requirements/demo/requirements.md';

/** The valid corpus in git, with attempt 1 of G1 recording the hash of the committed requirements. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-brief-'));
  cpSync(join(here, 'fixtures', 'valid'), join(dir, 'dev'), { recursive: true });
  const log = join(dir, LOG);
  writeFileSync(log, readFileSync(log, 'utf8').replace(/(path: dev\/requirements\/demo\/requirements\.md\r?\n\s+sha256: )0{64}/, `$1${hashArtifact(join(dir, REQ))}`));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'attempt 1');
  return { dir, git };
}

const brief = (dir, log = LOG) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--since', log, '--out', 'dev/reviews/demo/.brief', '--json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('--since gives the diff of each changed output since the log judged it, and the open findings', () => {
  const { dir, git } = repo();
  const head = git('rev-parse', 'HEAD');
  const req = join(dir, REQ);
  writeFileSync(req, readFileSync(req, 'utf8').replace('paginated and sorted', 'paginated (50 a page) and sorted by title'));
  const b = brief(dir);
  assert.deepEqual(b.open_findings.map((f) => f.id), ['CR-002', 'CR-003']);
  assert.equal(b.open_findings[0].where, 'requirements.md:REQ-002');
  assert.deepEqual(b.diffs.map((d) => [d.path, d.commit]), [[REQ, head]]);
  const diff = readFileSync(join(dir, b.diffs[0].diff), 'utf8');
  assert.match(diff, /^-.*paginated and sorted/m);
  assert.match(diff, /^\+.*paginated \(50 a page\) and sorted by title/m);
  assert.deepEqual(b.readInFull, []);
});

test('--since closes findings the log itself resolved, and reports an unchanged output as unchanged', () => {
  const { dir } = repo();
  // A log that restates a carried finding in its own Findings table and resolves it there.
  const a2 = join(dir, 'dev/reviews/demo/G1-requirements-20260916-141855-b09e-a2.md');
  writeFileSync(a2, readFileSync(a2, 'utf8').replace(/(\n\| CR-004 \|)/, '\n| CR-003 | MAJOR | requirements.md:REQ-101 | carried | attempt 1 | — | requirements |$1'));
  const b = brief(dir, 'dev/reviews/demo/G1-requirements-20260916-141855-b09e-a2.md');
  assert.deepEqual(b.open_findings.map((f) => f.id), ['CR-004'], 'attempt 2 resolved CR-002 and CR-003; its own INFO stays open');
  const a1 = brief(dir);
  assert.deepEqual(a1.unchanged, [REQ]);
  assert.deepEqual(a1.diffs, []);
});

test('--since sends an output whose judged version is not in history to be read in full', () => {
  const { dir, git } = repo();
  const req = join(dir, REQ);
  writeFileSync(req, `${readFileSync(req, 'utf8')}\nAn edit.\n`);
  git('commit', '-q', '-am', 'edit');
  const log = join(dir, LOG);
  writeFileSync(log, readFileSync(log, 'utf8').replace(/(path: dev\/requirements\/demo\/requirements\.md\r?\n\s+sha256: )\S+/, `$1${'e'.repeat(64)}`));
  const b = brief(dir);
  assert.deepEqual(b.diffs, []);
  assert.deepEqual(b.readInFull.map((r) => r.path), [REQ]);
  assert.match(b.readInFull[0].reason, /not in git history/);
});

test('--since on a G7 log with reviewed_commit diffs the code, never the generated change-summary', () => {
  // Found on release-management: the brief for the final G7 log wrote a 1 MB diff of the regenerated
  // change-summary.md beside a 291-byte code diff. The summary is derived from the code (§4.4).
  const { dir, git } = repo();
  const sum = join(dir, 'dev/implementation/demo/change-summary.md');
  writeFileSync(sum, '---\nslug: demo\n---\n## Tasks completed\n\nv1\n');
  writeFileSync(join(dir, 'main.go'), 'package main\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'code + summary');
  const reviewed = git('rev-parse', '--short', 'HEAD');
  const g7 = 'dev/reviews/demo/G7-implementation-20260920-090000-0b0b.md';
  writeFileSync(join(dir, g7), [
    '---', 'slug: demo', 'gate: G7', 'stage: implementation', 'run_id: 20260920-090000-0b0b', 'attempt: 1',
    'verdict: CHANGES_REQUESTED', 'reviewer: dev-reviewing-implementation', 'inputs: []', 'outputs:',
    '  - path: dev/implementation/demo/change-summary.md', `    sha256: ${hashArtifact(sum)}`,
    'findings: { blocker: 0, major: 1, minor: 0, info: 0 }', 'unlocks: G8', 'skip_reason: null', 'override: null',
    'revalidated_from: null', `reviewed_commit: ${reviewed}`, '---', '', '## Scope', '', 'All code.', '',
  ].join('\n'));
  git('add', '-A');
  git('commit', '-q', '-m', 'G7 attempt 1');
  writeFileSync(sum, '---\nslug: demo\n---\n## Tasks completed\n\nv2, regenerated\n');
  writeFileSync(join(dir, 'main.go'), 'package main\n\nfunc main() {}\n');
  const b = brief(dir, g7);
  assert.deepEqual(b.diffs.map((d) => d.path), ['code']);
  assert.match(readFileSync(join(dir, b.diffs[0].diff), 'utf8'), /^\+func main\(\) \{\}/m);
  assert.deepEqual(b.derived, ['dev/implementation/demo/change-summary.md']);
  assert.deepEqual(b.readInFull, []);
});
