/**
 * The bounded self-edit reaffirm (DEV-CONTRACTS §4.4): a gate's own artifact may change by a small,
 * mechanical-checkable diff and be reaffirmed instead of re-run. Every rule of the bound has a case
 * that must fail, because a bound that never refuses is a bypass.
 *
 *   node --test tests/reaffirm.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { boundedDiff } from '../workspace/dev/scripts/lib/reaffirm.mjs';
import { hashArtifact } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'reaffirm-check.mjs');
const TASKS = readFileSync(join(here, 'fixtures', 'valid', 'plan', 'demo', 'tasks.md'), 'utf8').replace(/\r\n/g, '\n');

const ADR = [
  '---', 'slug: demo', 'artifact: adr', '---', '', '## Status', '', 'accepted', '', '## Context', '', 'Lists grow.', '',
  '## Decision', '', 'Cursor pagination on every list endpoint.', '', '## Amendments', '', '- 2026-09-20 — clarified "list" — Lan', '',
].join('\n');

test('a small prose edit outside any id row is within the bound', () => {
  const r = boundedDiff(TASKS, TASKS.replace('roughly three days', 'about three days'));
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.equal(r.changedLines, 2);
  assert.match(r.diff, /^- .*roughly three days/m);
  assert.match(r.diff, /^\+ .*about three days/m);
});

test('more than 40 changed lines is outside the bound', () => {
  const extra = Array.from({ length: 41 }, (_, i) => `Note ${i}.`).join('\n');
  const r = boundedDiff(TASKS, TASKS.replace('## Sequence\n', `## Sequence\n${extra}\n`));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /41 changed lines/);
  const forty = boundedDiff(TASKS, TASKS.replace('## Sequence\n', `## Sequence\n${extra.split('\n').slice(1).join('\n')}\n`));
  assert.equal(forty.ok, true, '40 is inside the bound');
});

test('a heading change is outside the bound', () => {
  const r = boundedDiff(TASKS, TASKS.replace('## Risks and unknowns', '## Risks'));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /heading/);
});

test('an id appearing or disappearing is outside the bound', () => {
  const r = boundedDiff(TASKS, TASKS.replace('TASK-004 adds the RED metrics', 'TASK-005 adds the RED metrics'));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /\+TASK-005/);
});

test('editing a row that defines an id is outside the bound, though the id set is unchanged', () => {
  const r = boundedDiff(TASKS, TASKS.replace('| GET list with cursor pagination |', '| GET list with offset pagination |'));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /TASK-003/);
});

test('an ADR amendment appended to ## Amendments is within the bound', () => {
  const r = boundedDiff(ADR, `${ADR}- 2026-10-01 — cites DEC-004, the measured row count — Lan\n`);
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.equal(r.amendmentOnly, true);
});

test('an amendment is append-only, and never touches the Decision', () => {
  const rewritten = boundedDiff(ADR, ADR.replace('clarified "list"', 'clarified "list endpoint"'));
  assert.equal(rewritten.ok, false);
  assert.match(rewritten.reasons.join(), /append-only/);
  const decided = boundedDiff(ADR, ADR.replace('Cursor pagination', 'Offset pagination'));
  assert.equal(decided.amendmentOnly, false);
});

// Recall: `reaffirm-check code --against <sha>` at G7 printed only the usage line, and `--root dev`
// placed before the artifact made `dev` the artifact.
test('reaffirm-check.mjs says what is wrong with its arguments, and never takes a flag value for the artifact', async () => {
  const { selfEditArgs } = await import(new URL('../workspace/dev/scripts/reaffirm-check.mjs', import.meta.url).href);
  const tasks = join(here, 'fixtures', 'valid', 'plan', 'demo', 'tasks.md');
  assert.equal(selfEditArgs(['--root', 'dev', tasks, '--against', 'abc123']).artifact, tasks);
  assert.equal(selfEditArgs(['--root', 'dev', tasks, '--against', 'abc123']).problem, null);
  assert.match(selfEditArgs(['code', '--against', 'abc123']).problem, /no self-edit bound[\s\S]*--since/);
  assert.match(selfEditArgs([tasks]).problem, /--against needs/);
  assert.match(selfEditArgs(['nope.md', '--against', 'abc123']).problem, /no such file: nope\.md/);
  assert.match(selfEditArgs([tasks, tasks, '--against', 'x']).problem, /one artifact at a time/);
  const r = spawnSync(process.execPath, [SCRIPT, 'code', '--against', 'abc123'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /re-runs G7/);
});

test('reaffirm-check.mjs compares against a prior file and exits 1 outside the bound', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-'));
  writeFileSync(join(dir, 'old.md'), TASKS);
  writeFileSync(join(dir, 'tasks.md'), TASKS.replace('roughly three days', 'about three days'));
  const out = execFileSync(process.execPath, [SCRIPT, join(dir, 'tasks.md'), '--against', join(dir, 'old.md')], { encoding: 'utf8' });
  assert.match(out, /within the bound/);
  assert.match(out, /```diff/);

  writeFileSync(join(dir, 'tasks.md'), TASKS.replace('## Risks and unknowns', '## Risks'));
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, join(dir, 'tasks.md'), '--against', join(dir, 'old.md')], { stdio: 'pipe' }), (err) => err.status === 1);
});

test('reaffirm-check.mjs finds the reviewed version in git history by its recorded hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-git-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(join(dir, 'tasks.md'), TASKS);
  git('add', 'tasks.md');
  git('commit', '-q', '-m', 'reviewed');
  const reviewed = hashArtifact(join(dir, 'tasks.md'));
  writeFileSync(join(dir, 'tasks.md'), TASKS.replace('roughly three days', 'about three days'));
  git('commit', '-q', '-am', 'edited');

  const out = execFileSync(process.execPath, [SCRIPT, 'tasks.md', '--against', reviewed], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /within the bound/);
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, 'tasks.md', '--against', 'f'.repeat(64)], { cwd: dir, stdio: 'pipe' }), (err) => err.status === 2);
});

test('reaffirm-check.mjs finds the reviewed version across a root move (dev/ → .sdlc/)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-mv-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  mkdirSync(join(dir, 'dev', 'plan'), { recursive: true });
  writeFileSync(join(dir, 'dev', 'plan', 'tasks.md'), TASKS);
  git('add', '-A');
  git('commit', '-q', '-m', 'reviewed under dev/');
  const reviewed = hashArtifact(join(dir, 'dev', 'plan', 'tasks.md'));
  // Edited before the move, so the reviewed version exists only under the old path.
  writeFileSync(join(dir, 'dev', 'plan', 'tasks.md'), TASKS.replace('roughly three days', 'about three days'));
  git('commit', '-q', '-am', 'edited');
  git('mv', 'dev', '.sdlc');
  git('commit', '-q', '-m', 'migrate-root --to .sdlc');

  const out = execFileSync(process.execPath, [SCRIPT, '.sdlc/plan/tasks.md', '--against', reviewed], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /within the bound/);
});

test('reaffirm-check.mjs finds a reviewed version larger than 1 MB (the default exec buffer)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-big-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  const big = `${TASKS}\n${'Filler line for a large change summary.\n'.repeat(40000)}`;
  assert.ok(Buffer.byteLength(big) > 1024 * 1024);
  writeFileSync(join(dir, 'tasks.md'), big);
  git('add', 'tasks.md');
  git('commit', '-q', '-m', 'reviewed');
  const reviewed = hashArtifact(join(dir, 'tasks.md'));
  writeFileSync(join(dir, 'tasks.md'), big.replace('roughly three days', 'about three days'));

  const r = spawnSync(process.execPath, [SCRIPT, 'tasks.md', '--against', reviewed], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /within the bound/);
});

test('reaffirm-check.mjs reports a git failure instead of "no committed version"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-nogit-'));
  writeFileSync(join(dir, 'tasks.md'), TASKS);
  const r = spawnSync(process.execPath, [SCRIPT, 'tasks.md', '--against', 'f'.repeat(64)], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read the history of tasks\.md/);
  assert.doesNotMatch(r.stderr, /no committed version/);
});
