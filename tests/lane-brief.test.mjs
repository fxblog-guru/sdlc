/**
 * lane-brief.mjs: one lane's tasks, ownership and open notes for a G7 implementer, and the
 * ownership check that runs before it is spawned (DEV-CONTRACTS §5.5).
 *
 * tests/fixtures/lane-brief/ holds one plan three ways: valid (lanes disjoint), conflict (the
 * content lane's home page names the web lane's card, as anime-blog TASK-033 did) and bad-columns
 * (the Files and Depends on columns renamed).
 *
 *   node --test tests/lane-brief.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkOwnership, expandBraces, noteExcerpt, ownerOf, ownsCell, pickTasks, readPlan, splitFiles } from '../workspace/dev/scripts/lane-brief.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'lane-brief');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'lane-brief.mjs');
const plan = (name) => readPlan(readFileSync(join(FIX, name, 'plan', 'demo', 'tasks.md'), 'utf8'));
const run = (name, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', join(FIX, name)], { encoding: 'utf8' });

test('Files cells: split on · and ; but not on the comma inside braces, which expand', () => {
  assert.deepEqual(splitFiles('`a.ts` · b/{x,y}.ts; none'), ['a.ts', 'b/{x,y}.ts']);
  assert.deepEqual(expandBraces('m/{a,b}/{c,d}.sql'), ['m/a/c.sql', 'm/a/d.sql', 'm/b/c.sql', 'm/b/d.sql']);
});

test('an Owns cell hands away what follows "other than"', () => {
  assert.deepEqual(ownsCell('`Taskfile.yml`, `scripts/**` other than `scripts/eslint/**`'), { globs: ['Taskfile.yml', 'scripts/**'], not: ['scripts/eslint/**'] });
});

test('readPlan reads the lane table, the slice table and the prose exceptions', () => {
  const p = plan('valid');
  assert.equal(p.tasks.size, 7);
  assert.deepEqual([...p.lanes.keys()], ['platform', 'ops', 'web', 'content']);
  assert.equal(p.laneOf.get('TASK-004'), 'content');
  assert.equal(p.sliceOf.get('TASK-007'), '3');
  assert.equal(p.files.get('src/proxy.ts'), 'platform');
  assert.equal(p.files.get('tests/integration/platform/not-found.integration.test.ts'), 'content');
});

test('ownership: the most specific rule wins, and a carve-out is not a contest', () => {
  const p = plan('valid');
  assert.equal(ownerOf('scripts/eslint/no-soft-link.mjs', p).lane, 'platform');
  assert.equal(ownerOf('scripts/db-guard.mjs', p).lane, 'ops');
  assert.equal(ownerOf('src/components/ui/post-card.tsx', p).lane, 'web');
  assert.equal(ownerOf('src/app/(site)/page.tsx', p).lane, null);
  // Overlap with no carve-out: the longer literal prefix decides, an equal one is contested.
  const overlap = { files: new Map(), lanes: new Map([['ops', { globs: ['scripts/**'] }], ['platform', { globs: ['scripts/eslint/**'] }], ['web', { globs: ['scripts/*.json'] }]]) };
  assert.equal(ownerOf('scripts/eslint/rule.mjs', overlap).lane, 'platform');
  assert.equal(ownerOf('scripts/db.mjs', overlap).lane, 'ops');
  assert.deepEqual(ownerOf('scripts/budget.json', overlap).contested, ['ops', 'web']);
});

test('check passes a plan whose lanes are disjoint', () => {
  const p = plan('valid');
  for (const lane of ['platform', 'ops', 'web', 'content']) {
    const ids = [...p.laneOf].filter(([, l]) => l === lane).map(([id]) => id);
    assert.deepEqual(checkOwnership(p, lane, ids).foreign, [], lane);
  }
  const r = run('valid', 'check', 'demo', '--lane', 'content');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('check FAILS when a task names another lane\'s file (the TASK-033 case)', () => {
  const c = checkOwnership(plan('conflict'), 'content', ['TASK-004']);
  assert.deepEqual(c.foreign.map((f) => [f.file, f.owner, f.rule]), [['src/components/ui/post-card.tsx', 'web', 'src/components/**']]);
  const r = run('conflict', 'check', 'demo', '--lane', 'content', '--tasks', 'TASK-004');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FOREIGN {2}TASK-004 {2}src\/components\/ui\/post-card\.tsx {2}→ web/);
  assert.match(r.stdout, /Do not spawn/);
  const j = JSON.parse(run('conflict', 'check', 'demo', '--lane', 'content', '--tasks', 'TASK-004', '--json').stdout);
  assert.equal(j.foreign.length, 1);
});

test('the brief also reports the conflict', () => {
  const r = run('conflict', 'demo', '--lane', 'content', '--tasks', 'TASK-004');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /CONFLICT: TASK-004 `src\/components\/ui\/post-card\.tsx` → web/);
});

test('next tasks: done ones skipped, dependencies honoured, later slices held back', () => {
  const p = plan('valid');
  const done = new Set(['TASK-001', 'TASK-002']);
  assert.deepEqual(pickTasks(p, 'content', done).picked, ['TASK-003', 'TASK-004', 'TASK-005']);
  assert.deepEqual(pickTasks(p, 'content', done, { limit: 1 }).picked, ['TASK-003']);
  const blocked = pickTasks(p, 'content', new Set(['TASK-001']));
  assert.deepEqual(blocked.picked, ['TASK-003']);
  assert.deepEqual(blocked.waiting.map((w) => [w.id, w.on]), [['TASK-004', ['TASK-002']], ['TASK-005', ['TASK-004']]]);
});

test('the brief prints full rows, dependency status from progress.md and the open note sections only', () => {
  const r = run('valid', 'demo', '--lane', 'content');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^lane-brief demo --lane content — 3 task\(s\)/);
  assert.match(r.stdout, /## TASK-003 \(slice 2, lane content\)/);
  assert.match(r.stdout, /- files: src\/server\/posts\/app\/\{list,get\}\.ts/);
  assert.match(r.stdout, /dependency status: TASK-002 done \(web\), TASK-003 todo/);
  assert.match(r.stdout, /Not yours: .*`scripts\/eslint\/\*\*`|Owns: `src\/server\/\{posts,seo\}\/\*\*`/);
  assert.match(r.stdout, /## Known weaknesses[\s\S]*## Not done/);
  assert.doesNotMatch(r.stdout, /TASK-007|long narrative/);
  assert.match(noteExcerpt('a\nb'), /a\nb/);
});

test('a task table with other columns is a clear error, not a crash', () => {
  assert.match(plan('bad-columns').error, /columns .*`paths`, `needs`.*needs `files`, `depends on`/);
  const r = run('bad-columns', 'demo', '--lane', 'content');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lane-brief: tasks\.md `## Tasks` has columns/);
});

test('usage errors exit 2 and name the fix', () => {
  assert.equal(run('valid', 'demo').status, 2);
  const r = run('valid', 'demo', '--lane', 'nope');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lanes: content, ops, platform, web/);
  assert.match(run('valid', 'demo', '--lane', 'content', '--tasks', 'TASK-999').stderr, /not in `## Tasks`: TASK-999/);
});

// merge: one repo with a feature branch and a lane worktree, built fresh per test.
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
function laneRepo() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-lane-'));
  const main = join(root, 'repo');
  const wt = join(root, 'repo-wt-web');
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: GIT_ENV }).trim();
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'feature');
  git(main, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(main, 'a.txt'), 'base\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'base');
  git(main, 'worktree', 'add', '-q', '-b', 'feature-lane-web', wt);
  writeFileSync(join(wt, 'b.txt'), 'lane\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '-q', '-m', 'feat(web): b', '-m', 'Done: TASK-002, TASK-001');
  return { root, main, wt, git };
}
const runMerge = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, 'merge', 'demo', '--lane', 'web', ...args],
  { cwd, encoding: 'utf8', env: GIT_ENV });

test('merge: merges with the Done ids, then the worktree and the branch are gone', () => {
  const { root, main, wt, git } = laneRepo();
  try {
    const r = runMerge(main, '--worktree', wt);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(main, 'log', '-1', '--format=%s'), 'merge(lane-web): TASK-002, TASK-001');
    assert.equal(existsSync(wt), false);
    assert.equal(git(main, 'branch', '--list', 'feature-lane-web'), '');
    assert.doesNotMatch(git(main, 'worktree', 'list'), /repo-wt-web/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge: an ignored build folder left in the worktree goes too, so the path can be reused', () => {
  const { root, main, wt, git } = laneRepo();
  try {
    writeFileSync(join(wt, '.gitignore'), '.next/\n');
    git(wt, 'add', '.gitignore');
    git(wt, 'commit', '-q', '-m', 'chore: ignore build output');
    mkdirSync(join(wt, '.next', 'cache'), { recursive: true });
    writeFileSync(join(wt, '.next', 'cache', 'x'), 'built\n');
    const r = runMerge(main, '--worktree', wt);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(wt), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge: a relative --worktree, as an orchestrator types it, still removes the worktree and branch', () => {
  const { root, main, wt, git } = laneRepo();
  try {
    const r = runMerge(main, '--worktree', '../repo-wt-web');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(wt), false);
    assert.equal(git(main, 'branch', '--list', 'feature-lane-web'), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge: a dirty lane worktree stops it before anything is merged or removed', () => {
  const { root, main, wt, git } = laneRepo();
  try {
    writeFileSync(join(wt, 'b.txt'), 'unsaved\n');
    const r = runMerge(main, '--worktree', wt);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /uncommitted changes; nothing done/);
    assert.equal(git(main, 'log', '-1', '--format=%s'), 'base');
    assert.equal(existsSync(wt), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge --no-merge removes a lane only once it is merged', () => {
  const { root, main, wt, git } = laneRepo();
  try {
    const early = runMerge(main, '--worktree', wt, '--no-merge');
    assert.equal(early.status, 1);
    assert.match(early.stderr, /is not merged into feature; nothing removed/);
    assert.equal(existsSync(wt), true);
    git(main, 'merge', '-q', '--no-ff', 'feature-lane-web', '-m', 'merge(lane-web): by hand');
    assert.equal(runMerge(main, '--worktree', wt, '--no-merge').status, 0);
    assert.equal(existsSync(wt), false);
    assert.equal(git(main, 'branch', '--list', 'feature-lane-web'), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
