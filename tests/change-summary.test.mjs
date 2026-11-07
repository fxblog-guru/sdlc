/**
 * change-summary.mjs builds the G7 summary from git, tasks.md, progress.md and the lane notes
 * (DEV-CONTRACTS §4.4, §5.5). Nobody writes it by hand, so the generator is the thing to test.
 *
 *   node --test tests/change-summary.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { codeChangedSince, generate, SECTIONS } from '../workspace/dev/scripts/change-summary.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { parseDoc } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'change-summary.mjs');
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV }).trim();
}

/** A repo with main at a base commit, and a feature branch with two task commits and one stray. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-cs-'));
  const dev = join(root, 'dev');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'core.autocrlf', 'false');
  mkdirSync(join(dev, 'plan', 'demo'), { recursive: true });
  cpSync(join(here, 'fixtures', 'valid', 'plan', 'demo', 'tasks.md'), join(dev, 'plan', 'demo', 'tasks.md'));
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  const base = git(root, 'rev-parse', '--short=7', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'feature');

  const commit = (file, msg) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `${msg}\n`);
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', msg);
    return git(root, 'rev-parse', '--short=7', 'HEAD');
  };
  const c1 = commit('migrations/1.up.sql', 'feat(db): create test_cases (TASK-001)\n\nbody mentions internal/x.go');
  const c2 = commit('internal/testcase/repo.go', 'feat(repo): insert and fetch (TASK-002)');
  const stray = commit('internal/util/strings.go', 'refactor: tidy a helper');

  mkdirSync(join(dev, 'implementation', 'demo', 'lanes'), { recursive: true });
  writeFileSync(join(dev, 'implementation', 'demo', 'progress.md'), [
    '# Progress', '', '| Task | Status | Commit | Note |', '|---|---|---|---|',
    `| TASK-001 | done | ${c1} | — |`, `| TASK-002 | done | ${c2} | — |`, '| TASK-003 | in-progress | — | started |', '',
  ].join('\n'));
  const lane = (name, built, weak) => writeFileSync(join(dev, 'implementation', 'demo', 'lanes', `${name}.md`), [
    '---', 'slug: demo', 'stage: implementation', 'artifact: change-summary', 'status: draft', 'authored_by: dev-implementer',
    'reviewed_by: pending', 'tracker: none', 'created: 2026-09-20', 'updated: 2026-09-20', 'requirements: [REQ-001]', '---', '',
    ...SECTIONS.flatMap((h) => [`## ${h}`, '', h === 'What was built' ? built : h === 'Known weaknesses' ? weak : 'None.', '']),
  ].join('\n'));
  lane('lane-b', '`internal/testcase/repo.go` `Repo.Insert` writes one row.', 'None.');
  lane('lane-a', 'The `test_cases` table, `migrations/1.up.sql`.\n\n### A heading inside a lane\n\nDetail.', 'No down-migration test yet.');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'docs(implementation): progress and lanes');
  return { root, dev, base, c1, c2, stray };
}

test('tasks, status, commits and files come from tasks.md, progress.md and git log', () => {
  const { dev, base, c1, c2, stray } = repo();
  const { text } = generate({ devRoot: dev, slug: 'demo', base: 'main' });
  const row = (id) => text.split('\n').find((l) => l.startsWith(`| ${id} |`));
  assert.match(row('TASK-001'), new RegExp(`\\| REQ-001 \\| done \\| \`${c1}\` \\| \`migrations/1.up.sql\` \\|$`));
  assert.match(row('TASK-002'), new RegExp(`\\| done \\| \`${c2}\` \\| \`internal/testcase/repo.go\` \\|$`));
  assert.match(row('TASK-003'), /\| in-progress \| — \| — \|$/);
  assert.match(row('TASK-004'), /\| todo \| — \| — \|$/);
  assert.ok(!/internal\/x\.go/.test(row('TASK-001')), 'a path in a commit body is not a changed file');
  assert.ok(!/dev\//.test(text.split('## What was built')[0].split('---\n').pop()), 'dev/ files are not code');
  assert.match(text, new RegExp(`git log ${base}\\.\\.`));
  assert.match(text, new RegExp(`## Deviations from the plan\\n\\nCommits that name no task[^\\n]*\\n\\n- \`${stray}\` refactor: tidy a helper`));
  assert.match(text, /## Not done\n\n[\s\S]*- TASK-003 \(in-progress\)[\s\S]*- TASK-004 \(todo\)/);
});

// Recall's branch carried two slugs whose plans both had a TASK-002; the summary of one listed the
// other's commits under its own task.
test("another slug's commit with the same TASK number is never credited to this slug", () => {
  const { root, dev, c2 } = repo();
  mkdirSync(join(dev, 'plan', 'other'), { recursive: true });
  cpSync(join(dev, 'plan', 'demo', 'tasks.md'), join(dev, 'plan', 'other', 'tasks.md'));
  writeFileSync(join(root, 'other.go'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'feat(other): its own work\n\nSlug: other\nDone: TASK-002');
  const theirs = git(root, 'rev-parse', '--short=7', 'HEAD');
  const { text } = generate({ devRoot: dev, slug: 'demo', base: 'main' });
  const row = text.split('\n').find((l) => l.startsWith('| TASK-002 |'));
  assert.ok(row.includes(c2) && !row.includes(theirs) && !row.includes('other.go'), row);
  assert.ok(!text.split('## Deviations from the plan')[1].split('\n## ')[0].includes(theirs), 'nor is it a deviation of this slug');
  const mine = generate({ devRoot: dev, slug: 'other', base: 'main' }).text.split('\n').find((l) => l.startsWith('| TASK-002 |'));
  assert.ok(mine.includes(theirs) && !mine.includes(c2), `an untrailed commit is nobody's once two slugs are planned: ${mine}`);
});

test('lane notes are folded in lane order, empty sections stay out, and their headings never become sections', () => {
  const { dev } = repo();
  const { text } = generate({ devRoot: dev, slug: 'demo', base: 'main' });
  const built = text.split('## What was built\n')[1].split('\n## ')[0];
  assert.ok(built.indexOf('### lane-a') < built.indexOf('### lane-b'));
  assert.match(built, /\n#### A heading inside a lane\n/, 'a lane subheading is demoted one level');
  assert.match(text, /## Known weaknesses\n\n### lane-a\n\nNo down-migration test yet\.\n\n## Not done/);
  assert.match(text, /## Migrations\n\nNone\.\n/);
});

test('the generated file is a valid change-summary for the linter', () => {
  const { dev } = repo();
  const { text } = generate({ devRoot: dev, slug: 'demo', base: 'main' });
  writeFileSync(join(dev, 'implementation', 'demo', 'change-summary.md'), text);
  const errors = lintTree(dev, TEMPLATES).filter((f) => f.level === 'error' && f.file.includes('change-summary.md'));
  assert.deepEqual(errors, []);
  assert.equal(parseDoc(text).frontMatter.generated_by, 'change-summary.mjs');
});

test('a task title or commit subject with `<x>` in a code span never lints as a placeholder (E005)', () => {
  // Found on release-management: TASK-007's cell said `scripts/old-commit.sh <id>`; stripping the
  // backticks put a bare `<id>` into "Not done" and the generated file failed the linter.
  const { root, dev } = repo();
  const tasks = join(dev, 'plan', 'demo', 'tasks.md');
  writeFileSync(tasks, readFileSync(tasks, 'utf8').replace('| TASK-004 | RED metrics on the list path |',
    '| TASK-004 | **RED metrics on the list path.** `scripts/old-commit.sh <id>` resolves an old id |'));
  writeFileSync(join(root, 'tool.sh'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore: tool.sh <name> prints a name');
  const { text } = generate({ devRoot: dev, slug: 'demo', base: 'main' });
  assert.match(text, /- TASK-004 \(todo\) — RED metrics on the list path\.\n/, 'the bold lead is the title');
  writeFileSync(join(dev, 'implementation', 'demo', 'change-summary.md'), text);
  const errors = lintTree(dev, TEMPLATES).filter((f) => f.level === 'error' && f.file.includes('change-summary.md'));
  assert.deepEqual(errors, []);
});

test('--check passes on a fresh file and fails once the inputs move', () => {
  const { root, dev } = repo();
  const run = (...args) => {
    try {
      execFileSync(process.execPath, [SCRIPT, 'demo', '--root', dev, '--base', 'main', ...args], { cwd: root, encoding: 'utf8' });
      return 0;
    } catch (err) {
      return err.status;
    }
  };
  assert.equal(run('--check'), 1, 'nothing written yet');
  assert.equal(run(), 0);
  assert.match(readFileSync(join(dev, 'implementation', 'demo', 'change-summary.md'), 'utf8'), /^---\nslug: demo\n/);
  assert.equal(run('--check'), 0);
  writeFileSync(join(root, 'internal', 'testcase', 'repo.go'), 'changed\n');
  git(root, 'commit', '-qam', 'fix(repo): bound the query (TASK-002)');
  assert.equal(run('--check'), 1);
});

test('--code-changed-since: dev/ edits are not code, a source edit is, an unknown sha is reported', () => {
  const { root, dev } = repo();
  const head = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(dev, 'implementation', 'demo', 'progress.md'), 'edited\n');
  git(root, 'commit', '-qam', 'docs: progress');
  assert.equal(codeChangedSince(dev, head), 0);
  mkdirSync(join(root, '.claude', 'skills', 'dev-x'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'dev-x', 'SKILL.md'), 'bundle\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'chore(sdlc): update the bundle');
  assert.equal(codeChangedSince(dev, head), 0, 'the installed bundle under .claude/ is not code');
  assert.ok(!/\.claude\//.test(generate({ devRoot: dev, slug: 'demo', base: 'main' }).text), 'nor a changed file in the summary');
  writeFileSync(join(root, 'README.md'), 'edited\n');
  git(root, 'commit', '-qam', 'docs: readme');
  assert.equal(codeChangedSince(dev, head), 1);
  assert.equal(codeChangedSince(dev, 'deadbeefdeadbeef'), 2);
});
