/**
 * Delivery hygiene (DEV-CONTRACTS §8, §18): the derived index and generated evidence stay out of
 * git, a fresh clone still gets a board, and the git hooks the profile promises exist.
 *
 * release-management committed state.json (79 conflicting edits), DASHBOARD.md (74), 31 MB of
 * ui-snap pages and logs, and 56 reaffirm diffs; its DEV-PROFILE named a git-branch-enforce hook
 * that did not exist.
 *
 *   node --test tests/hygiene.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const WS = join(ROOT, 'workspace', 'dev');

function ignored(paths) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-gi-'));
  execFileSync('git', ['init', '-q', dir]);
  mkdirSync(join(dir, 'dev'));
  cpSync(join(WS, '.gitignore'), join(dir, 'dev', '.gitignore'));
  const run = spawnSync('git', ['-C', dir, 'check-ignore', '--no-index', '--stdin'], { input: paths.join('\n'), encoding: 'utf8' });
  return run.stdout.split('\n').filter(Boolean);
}

test('dev/.gitignore keeps the derived index and generated evidence out, and the artifacts in', () => {
  const out = [
    'dev/state.json', 'dev/DASHBOARD.md',
    'dev/implementation/demo/ui-snap/compare.html', 'dev/implementation/demo/ui-snap/s01-1440.png',
    'dev/verification/demo/runs/20261013-032525-b54b/ui-snap/compare.html',
    'dev/verification/demo/runs/20261013-032525-b54b/logs/web-unit.txt.gz',
    'dev/reviews/demo/.reaffirm-G0-20261001-083030-4a26.diff', 'dev/reviews/demo/.brief-20261001-083030-4a26/x.diff',
  ];
  const keep = [
    'dev/reviews/demo/G7-implementation-20261013-045948-e0bc.md',
    'dev/verification/demo/runs/20261013-032525-b54b/verify.md',
    'dev/verification/demo/runs/20261013-032525-b54b/logs/web-unit.txt',
    'dev/ui/demo/visual/shots/s01-1440.png', 'dev/ui/demo/visual/index.html',
    'dev/plan/demo/tasks.md', 'dev/implementation/demo/progress.md',
  ];
  assert.deepEqual(ignored(out).sort(), [...out].sort(), 'every generated file is ignored');
  assert.deepEqual(ignored(keep), [], 'no artifact, gate log, approved visual or raw log is ignored');
});

test('the SessionStart hook builds a missing state.json before it prints the board', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-ss-'));
  cpSync(join(WS, 'scripts'), join(dir, 'dev', 'scripts'), { recursive: true });
  cpSync(join(here, 'fixtures', 'valid'), join(dir, 'dev'), { recursive: true });
  assert.ok(!existsSync(join(dir, 'dev', 'state.json')));
  const run = spawnSync(process.execPath, [join(ROOT, 'hooks', 'session-start.mjs')], { cwd: dir, encoding: 'utf8', input: '{}' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(join(dir, 'dev', 'state.json')), 'state.json was built');
  assert.match(run.stdout, /\[agentic-fx-dev\]/);
});

test('the git hooks DEV-PROFILE names exist: commit-msg runs commit-lint, pre-commit the branch rule', () => {
  const profile = readFileSync(join(ROOT, 'DEV-PROFILE.md'), 'utf8');
  for (const hook of ['commit-msg', 'pre-commit']) {
    const p = join(WS, 'ci', 'git-hooks', hook);
    assert.ok(existsSync(p), `${hook} is missing`);
    assert.match(readFileSync(p, 'utf8'), /commit-lint\.mjs/);
  }
  assert.match(profile, /core\.hooksPath <root>\/ci\/git-hooks/, 'the profile says how to enable them (§2: <root> is .sdlc or dev)');
  assert.doesNotMatch(profile, /enforced by `git-branch-enforce`/, 'no claim of a hook the bundle does not ship under that name');
});

test('the CI templates build the index rather than diff a committed copy, and lint commits', () => {
  for (const f of ['gitlab-ci.yml', 'github-workflow.yml']) {
    const text = readFileSync(join(WS, 'ci', f), 'utf8');
    assert.doesNotMatch(text, /git diff --exit-code --quiet dev\/state\.json/, `${f} still expects a committed state.json`);
    assert.match(text, /commit-lint\.mjs --range/, `${f} does not lint the commits`);
    assert.match(text, /skeleton-check\.mjs/, `${f} does not check the skeleton`);
  }
});


