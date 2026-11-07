/**
 * commit-lint.mjs (DEV-CONTRACTS §18.1). release-management's history was 71% Conventional
 * Commits, with 187 upper-case subjects, 370 over 72 characters, 60 scopes mixing layer, stage and
 * domain, merges in six styles (about 68 of them back-merges of the feature branch into a lane),
 * and ids buried in prose. Each row below is one of those shapes.
 *
 *   node --test tests/commit-lint.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'commit-lint.mjs');
const { lintMessage, lintBranch, branchPattern, progressRows } = await import(pathToFileURL(SCRIPT).href);

const OPTS = { scopes: ['release', 'http', 'web', 'sdlc'] };
const rules = (msg, opts = OPTS) => lintMessage(msg, opts).filter((f) => f.level === 'error').map((f) => f.rule);

test('a well-formed commit with trailers is clean, and so is a gate commit', () => {
  assert.deepEqual(rules('feat(release): add the train picker\n\nPicks releases by key.\n\nRefs: TASK-014, DEC-033\nDone: TASK-014\nCo-Authored-By: A <a@b.c>'), []);
  assert.deepEqual(rules('docs(sdlc): G7 release-management PASS (20261013-045948-e0bc)'), []);
  // The §18.1 gate template itself runs past 72 for a long slug with CHANGES_REQUESTED; it is not E094.
  assert.deepEqual(rules('docs(sdlc): G7 release-management CHANGES_REQUESTED (20261013-045948-e0bc)'), []);
  assert.deepEqual(rules('docs(sdlc): G7 release-management CHANGES_REQUESTED, see the log for every finding'), ['E094'], 'only the exact template is exempt');
  assert.deepEqual(rules('fix(web)!: drop the legacy cookie\n\nBREAKING CHANGE: sessions restart'), []);
  assert.deepEqual(rules('merge(lane-qc2): TASK-201, TASK-202'), [], 'the merge template');
});

const BROKEN = [
  ['not conventional', 'Add the train picker', 'E092'],
  ['unknown type', 'feature(release): add the train picker', 'E092'],
  ['scope outside the closed list', 'feat(G7): add the train picker', 'E093'],
  ['no scope', 'feat: add the train picker', 'E093'],
  ['subject over 72 characters', `feat(release): ${'a'.repeat(60)} and then some more`, 'E094'],
  ['subject starts upper-case', 'feat(release): Add the train picker', 'E094'],
  ['subject ends with a full stop', 'feat(release): add the train picker.', 'E094'],
  ['an id in the subject with no Refs trailer', 'fix(web): return focus to the opener (G7 CR-463)', 'E095'],
  ['an id in the body with no trailer', 'fix(web): return focus to the opener\n\nCloses TASK-201 from the plan.', 'E095'],
  ['a back-merge of the feature branch into a lane', "Merge branch 'feature/release-management' into lane-qc1", 'E096'],
  ['a merge outside the template', 'Merge lane QC2: menu-opened dialog focus', 'E096'],
  ['a fixup left in history', 'fixup! feat(release): add the train picker', 'E097'],
];

for (const [name, msg, rule] of BROKEN) {
  test(`broken — ${name}`, () => {
    assert.deepEqual(rules(msg), [rule], JSON.stringify(lintMessage(msg, OPTS)));
  });
}

test('with no scope list configured, scopes are not judged but a scope is still required', () => {
  assert.deepEqual(rules('feat(anything): add it', { scopes: [] }), []);
  assert.deepEqual(rules('feat: add it', { scopes: [] }), ['E093']);
});

test('branch rule: no commit on a protected branch; a new branch matches the convention, lanes allowed', () => {
  const opts = { protectedBranches: ['main'], branchConvention: ['feature/<slug>'] };
  assert.deepEqual(lintBranch('main', opts).map((f) => f.rule), ['E098']);
  assert.deepEqual(lintBranch('feature/release-management', opts), []);
  assert.deepEqual(lintBranch('feature/release-management-lane-qc1', opts), []);
  assert.deepEqual(lintBranch('luan/try-stuff', opts).map((f) => f.rule), ['E098']);
  assert.ok(branchPattern(['feature/<tracker-key>-<slug>', 'feature/<slug>']).test('feature/PROJ-12-login'));
});

test('--progress rows: one per Done trailer not yet recorded, only for planned tasks', () => {
  const commits = [
    { sha: '1111111aaaa', body: 'feat(release): x\n\nDone: TASK-001' },
    { sha: '2222222bbbb', body: 'feat(release): y\n\nDone: TASK-002, TASK-099' },
    { sha: '3333333cccc', body: 'feat(release): z\n\nRefs: TASK-003' },
  ];
  const rows = progressRows(commits, new Set(['TASK-001', 'TASK-002', 'TASK-003']), [{ task: 'TASK-001', status: 'done', commit: '1111111' }]);
  assert.deepEqual(rows, ['| TASK-002 | done | 2222222 | from commit trailer |']);
});

// TASK numbers restart per slug. On Recall, `Done: TASK-003` on another slug's commit marked this
// slug's TASK-003 done in progress.md.
test('--progress rows: only the slug\'s own commits count once two slugs are planned', () => {
  const commits = [
    { sha: '1111111aaaa', body: 'feat(a): x\n\nSlug: demo\nDone: TASK-001' },
    { sha: '2222222bbbb', body: 'feat(b): y\n\nSlug: other\nDone: TASK-002' },
    { sha: '3333333cccc', body: 'feat(b): z\n\nDone: TASK-003' },
  ];
  const planned = new Set(['TASK-001', 'TASK-002', 'TASK-003']);
  assert.deepEqual(progressRows(commits, planned, [], { slug: 'demo', slugs: ['demo', 'other'] }), ['| TASK-001 | done | 1111111 | from commit trailer |']);
  assert.equal(progressRows(commits, planned, [], { slug: 'demo', slugs: ['demo'] }).length, 2, 'with one plan, an untrailed commit is that plan\'s');
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cl-'));
  const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'feature/demo');
  mkdirSync(join(dir, 'dev', 'plan', 'demo'), { recursive: true });
  writeFileSync(join(dir, 'dev', 'plan', 'demo', 'tasks.md'), '## Tasks\n\n| Id | Task | Status |\n|---|---|---|\n| TASK-001 | a | todo |\n| TASK-002 | b | todo |\n');
  writeFileSync(join(dir, 'DEV-PROFILE.md'), '## Delivery\n\n- **Commit scopes:** `core` · `sdlc`\n- **Protected branches:** `main`\n- **Branch convention:** `feature/<slug>`\n');
  git('add', '.');
  git('commit', '-q', '-m', 'chore(core): start\n\nDone: TASK-001');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'Add A file');
  return { dir, git };
}

test('--range over git history reports each failing commit and a compliance rate', () => {
  const { dir } = repo();
  let out;
  try {
    execFileSync(process.execPath, [SCRIPT, '--range', 'HEAD~1..HEAD', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.fail('a non-conventional commit in the range must exit 1');
  } catch (err) {
    out = JSON.parse(err.stdout);
  }
  assert.equal(out.commits, 1);
  assert.equal(out.compliant, 0);
  assert.deepEqual(out.byRule, { E092: 1 });
});

test('--range W094: a commit over 500 changed lines warns, lock files excluded, counted per commit', () => {
  const { dir, git } = repo();
  const lines = (n) => Array.from({ length: n }, (_, i) => `l${i}`).join('\n') + '\n';
  writeFileSync(join(dir, 'big.txt'), lines(501));
  git('add', '.');
  git('commit', '-q', '-m', 'feat(core): a large change');
  writeFileSync(join(dir, 'package-lock.json'), lines(900));
  writeFileSync(join(dir, 'small.txt'), lines(300));
  git('add', '.');
  git('commit', '-q', '-m', 'feat(core): a lock file and a small change');
  writeFileSync(join(dir, 'small2.txt'), lines(300));
  git('add', '.');
  git('commit', '-q', '-m', 'feat(core): another small change');
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--range', 'HEAD~3..HEAD', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.equal(out.commits, 3);
  assert.equal(out.large, 1, 'only the 501-line commit; the lock file is excluded and 300 + 300 is two commits');
  assert.deepEqual(out.byRule, { W094: 1 });
  const small = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--range', 'HEAD~2..HEAD', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.equal(small.large, 0, 'two 300-line commits are not one 600-line commit');
});

test('--message reads a commit-msg file, as the git hook passes it', () => {
  const { dir } = repo();
  const file = join(dir, 'MSG');
  writeFileSync(file, 'feat(core): add a thing\n\n# a git comment line is ignored\n');
  execFileSync(process.execPath, [SCRIPT, '--message', file], { cwd: dir, encoding: 'utf8' });
  writeFileSync(file, 'feat(nope): add a thing\n');
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, '--message', file], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }));
});

test('--progress <slug> appends the rows to progress.md', () => {
  const { dir } = repo();
  execFileSync(process.execPath, [SCRIPT, '--progress', 'demo'], { cwd: dir, encoding: 'utf8' });
  const text = readFileSync(join(dir, 'dev', 'implementation', 'demo', 'progress.md'), 'utf8');
  assert.match(text, /\| TASK-001 \| done \| [0-9a-f]{7} \| from commit trailer \|/);
  execFileSync(process.execPath, [SCRIPT, '--progress', 'demo'], { cwd: dir, encoding: 'utf8' });
  assert.equal(readFileSync(join(dir, 'dev', 'implementation', 'demo', 'progress.md'), 'utf8').match(/TASK-001/g).length, 1, 'idempotent');
});
