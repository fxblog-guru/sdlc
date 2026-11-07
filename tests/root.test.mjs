/**
 * The SDLC root (DEV-CONTRACTS §2): one resolver, both path prefixes, and the migration between them.
 *
 * New projects keep the process root in `.sdlc/`; projects installed earlier keep `dev/`. Every test
 * here runs the real scripts against a copy of the valid corpus, so a script that still assumes
 * `dev/` fails here rather than in a project.
 *
 *   node --test tests/root.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildState } from '../workspace/dev/scripts/build-state.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { parseDoc } from '../workspace/dev/scripts/lib/doc.mjs';
import { findQaRoot, findRoot, locateRef, normalizeRef, profileRoot, qaProfileRoot, repoPath, stripRoot, underQaRoot } from '../workspace/dev/scripts/lib/root.mjs';
import { plan, rewriteFrontMatter, setProfileRoot } from '../workspace/dev/scripts/migrate-root.mjs';
import { sdlcRoot } from '../hooks/sdlc-root.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WS = join(here, '..', 'workspace', 'dev');
const CORPUS = join(here, 'fixtures', 'valid');
const TEMPLATES = loadTemplates(join(WS, '_templates'));

const PROFILE = (line) => `# DEV-PROFILE.md\n\n## Project\n\n- **Name:** \`demo\`\n${line}\n- **Source root:** \`.\` (default)\n`;

/** A throwaway project with the corpus under `name`, the bundle's scripts and templates beside it. */
function project(name, { scripts = true, profile = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-root-'));
  const root = join(dir, name);
  cpSync(CORPUS, root, { recursive: true });
  if (scripts) {
    cpSync(join(WS, 'scripts'), join(root, 'scripts'), { recursive: true });
    cpSync(join(WS, '_templates'), join(root, '_templates'), { recursive: true });
  }
  if (profile) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), PROFILE(profile));
  }
  return { dir, root };
}

const node = (dir, script, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
const states = (s) => s.initiatives.flatMap((i) => i.stages.map((g) => `${i.slug} ${g.gate} ${g.state}`));
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

// ---- the resolver -------------------------------------------------------------------------------

test('findRoot: --root, then the profile, then the folder that exists (.sdlc first), then .sdlc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-find-'));
  assert.deepEqual(findRoot({ cwd: dir }), { root: resolve(dir, '.sdlc'), name: '.sdlc', source: 'default' }, 'nothing there: .sdlc');
  mkdirSync(join(dir, 'dev'));
  assert.equal(findRoot({ cwd: dir }).name, 'dev', 'an existing dev/ is found');
  mkdirSync(join(dir, '.sdlc'));
  assert.equal(findRoot({ cwd: dir }).name, '.sdlc', 'both exist: .sdlc wins');
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), PROFILE('- **SDLC root:** `dev` — set by hand'));
  assert.deepEqual(findRoot({ cwd: dir }), { root: resolve(dir, 'dev'), name: 'dev', source: 'profile' }, 'the profile beats the folders');
  assert.equal(findRoot({ cwd: dir, explicit: 'x/y' }).root, resolve(dir, 'x/y'), '--root beats the profile');
});

test('profileRoot: an untouched (default) is no choice; Dev root is still read; placeholders are ignored', () => {
  assert.equal(profileRoot(PROFILE('- **SDLC root:** `.sdlc` (default) — the process root')), null);
  assert.equal(profileRoot(PROFILE('- **Dev root:** `dev/` (default) — every artifact')), null, 'the 1.5 template line names no choice');
  assert.equal(profileRoot(PROFILE('- **Dev root:** `dev/` — every artifact')), 'dev');
  assert.equal(profileRoot(PROFILE('- **SDLC root:** `./.sdlc/` — chosen')), '.sdlc');
  assert.equal(profileRoot(PROFILE('- **SDLC root:** `<folder>`')), null);
  assert.equal(profileRoot('no profile'), null);
});

test('the hooks resolve the root the same way the scripts do', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-hookroot-'));
  const saved = process.env.SDLC_DEV_ROOT;
  delete process.env.SDLC_DEV_ROOT;
  try {
    const both = () => [sdlcRoot(dir), findRoot({ cwd: dir }).root];
    let [a, b] = both(); assert.equal(a, b);
    mkdirSync(join(dir, 'dev')); [a, b] = both(); assert.equal(a, b); assert.equal(a, resolve(dir, 'dev'));
    mkdirSync(join(dir, '.sdlc')); [a, b] = both(); assert.equal(a, b); assert.equal(a, resolve(dir, '.sdlc'));
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), PROFILE('- **SDLC root:** `dev` — chosen'));
    [a, b] = both(); assert.equal(a, b); assert.equal(a, resolve(dir, 'dev'));
  } finally {
    if (saved !== undefined) process.env.SDLC_DEV_ROOT = saved;
  }
});

test('either prefix names the root; new paths carry the root\'s own prefix', () => {
  const root = join(tmpdir(), 'p', '.sdlc');
  assert.equal(stripRoot('dev/reviews/demo/x.md'), 'reviews/demo/x.md');
  assert.equal(stripRoot('.sdlc/reviews/demo/x.md'), 'reviews/demo/x.md');
  assert.equal(stripRoot('.claude/DEV-PROFILE.md'), '.claude/DEV-PROFILE.md', 'a project-root path is not under the root');
  assert.equal(stripRoot('devops/x.md'), 'devops/x.md');
  assert.equal(locateRef(root, 'dev/intake/demo/problem.md'), join(root, 'intake', 'demo', 'problem.md'));
  assert.equal(locateRef(root, '.sdlc/intake/demo/problem.md'), join(root, 'intake', 'demo', 'problem.md'));
  const outside = join(tmpdir(), 'evidence', 'README.md');
  assert.equal(locateRef(root, outside), outside, 'an absolute path outside the repository is read where it is');
  assert.equal(repoPath(root, 'reviews/demo/x.md'), '.sdlc/reviews/demo/x.md');
  assert.equal(repoPath(join(tmpdir(), 'p', 'dev'), 'reviews/demo/x.md'), 'dev/reviews/demo/x.md');
  assert.equal(normalizeRef(root, 'dev/decisions/demo.md#DEC-001'), '.sdlc/decisions/demo.md#DEC-001');
});

// ---- gate logs under either root ---------------------------------------------------------------

test('dual prefix: the dev/-prefixed corpus copied to .sdlc/ derives the same gate states, and lints clean', () => {
  const { root: legacy } = project('dev', { scripts: false });
  const { root: moved } = project('.sdlc', { scripts: false });
  const before = buildState(legacy);
  const after = buildState(moved);
  assert.deepEqual(states(after), states(before), 'the logs still record dev/ paths, and every one of them resolves under .sdlc/');
  assert.ok(states(after).some((s) => s.endsWith(' PASS')), 'not a vacuous match: some gates pass');
  const g1 = after.initiatives[0].stages.find((s) => s.gate === 'G1');
  assert.equal(g1.state, 'PASS');
  assert.equal(g1.log, `.sdlc/reviews/demo/${g1.log.split('/').pop()}`, 'state.json names the log where it is now');
  assert.ok(g1.inputs.every((r) => r.path.startsWith('.sdlc/') && r.current), 'and its inputs, all current');
  assert.equal(after.knowledge.cards[0].path, '.sdlc/knowledge/codebase-map.md');
  assert.deepEqual(lintTree(moved, TEMPLATES).filter((f) => f.level === 'error'), []);
});

test('dual prefix: a log that records .sdlc/ paths is read under a dev/ root too', () => {
  const { root } = project('dev', { scripts: false });
  const before = states(buildState(root));
  for (const f of walk(join(root, 'reviews'))) {
    const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(f, rewriteFrontMatter(text, 'dev', '.sdlc').text);
  }
  assert.ok(readFileSync(join(root, 'reviews', 'demo', 'G0-intake-20260916-091203-3f2a.md'), 'utf8').includes('path: .sdlc/intake/'), 'the logs now say .sdlc/');
  assert.deepEqual(states(buildState(root)), before);
  assert.deepEqual(lintTree(root, TEMPLATES).filter((f) => f.level === 'error'), []);
});

// ---- end to end ---------------------------------------------------------------------------------

test('end to end: build-state, lint-dev and status find .sdlc/ with no --root', () => {
  const { dir, root } = project('.sdlc');
  const built = node(dir, join(root, 'scripts', 'build-state.mjs'));
  assert.equal(built.status, 0, built.stderr);
  assert.ok(existsSync(join(root, 'state.json')), 'state.json is under .sdlc/');
  assert.ok(!existsSync(join(dir, 'dev')), 'nothing was written to dev/');
  assert.match(readFileSync(join(root, 'DASHBOARD.md'), 'utf8'), /Generated by \.sdlc\/scripts\/build-state\.mjs/);
  const lint = node(dir, join(root, 'scripts', 'lint-dev.mjs'), ['--json']);
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.equal(JSON.parse(lint.stdout).errors, 0);
  const status = node(dir, join(root, 'scripts', 'status.mjs'));
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /^demo\s/m, 'the board lists the initiative');
  assert.match(status.stdout, /G2 stale — \.sdlc\/requirements\/demo\/requirements\.md/, 'and names the file where it is now');
  assert.ok(!/(^|[\s(`])dev\//.test(status.stdout), 'the board says .sdlc/, never dev/');
  const noTasks = node(dir, join(root, 'scripts', 'status.mjs'), ['nosuch-slug-x', '--ready']);
  const ready = node(dir, join(root, 'scripts', 'status.mjs'), ['demo', '--ready']);
  rmSync(join(root, 'state.json'));
  const fresh = node(dir, join(root, 'scripts', 'status.mjs'));
  assert.match(fresh.stdout, /run `node \.sdlc\/scripts\/build-state\.mjs`/, 'the hint names the command under .sdlc/');
  assert.ok(![noTasks.stdout, ready.stdout, fresh.stdout].some((o) => /(^|[\s(`])dev\//.test(o)), 'no message points at dev/');
});

test('end to end: a profile that names dev keeps an existing project on dev/ even when .sdlc/ appears', () => {
  const { dir, root } = project('dev', { profile: '- **SDLC root:** `dev` — kept' });
  mkdirSync(join(dir, '.sdlc'));
  const built = node(dir, join(root, 'scripts', 'build-state.mjs'), ['--quiet']);
  assert.equal(built.status, 0, built.stderr);
  assert.ok(existsSync(join(root, 'state.json')));
  assert.ok(!existsSync(join(dir, '.sdlc', 'state.json')));
});

// ---- the migration ------------------------------------------------------------------------------

function gitProject() {
  const { dir, root } = project('dev', { profile: '- **Dev root:** `dev/` (default) — every artifact this bundle writes lives under this folder.' });
  // An installed dev/ project carries the CI templates as they were before 1.6, set to its root.
  cpSync(join(WS, 'ci'), join(root, 'ci'), { recursive: true });
  for (const f of ['gitlab-ci.yml', 'github-workflow.yml']) {
    const p = join(root, 'ci', f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^(\s*SDLC_ROOT:) \.sdlc$/m, '$1 dev'));
  }
  writeFileSync(join(dir, 'package.json'), '{\n  "scripts": {\n    "dev:state": "node dev/scripts/build-state.mjs",\n    "dev:lint": "node dev/scripts/lint-dev.mjs"\n  }\n}\n');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n/dev/state.json\n');
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', 'dev/ci/git-hooks');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'chore(sdlc): init');
  return { dir, root, git };
}

/** Every .md under a root, keyed by its path inside the root, mapped to its body hash. */
const bodyHashes = (root) => Object.fromEntries(walk(root).filter((f) => f.endsWith('.md')).map((f) => [f.slice(root.length + 1).split('\\').join('/'), parseDoc(readFileSync(f, 'utf8')).bodyHash]));

test('migrate-root: a dry run reports the plan and changes nothing', () => {
  const { dir, root, git } = gitProject();
  const r = node(dir, join(root, 'scripts', 'migrate-root.mjs'), ['--to', '.sdlc']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/);
  assert.match(r.stdout, /git mv dev \.sdlc/);
  assert.match(r.stdout, /package\.json: .*node \.sdlc\/scripts\/build-state\.mjs/);
  assert.match(r.stdout, /core\.hooksPath dev\/ci\/git-hooks → \.sdlc\/ci\/git-hooks/);
  assert.match(r.stdout, /kept\s+\d+ `dev\/` mention\(s\)/, 'body mentions are reported, not rewritten');
  assert.equal(git('status', '--porcelain'), '', 'nothing changed');
  assert.ok(existsSync(root) && !existsSync(join(dir, '.sdlc')));
});

test('migrate-root --write: git mv, profile, front matter only, wiring; no hash moves; same gate states', () => {
  const { dir, root, git } = gitProject();
  node(dir, join(root, 'scripts', 'build-state.mjs'), ['--quiet']);
  const before = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
  const hashes = bodyHashes(root);
  const g0body = parseDoc(readFileSync(join(root, 'reviews', 'demo', 'G0-intake-20260916-091203-3f2a.md'), 'utf8')).body;

  const r = node(dir, join(root, 'scripts', 'migrate-root.mjs'), ['--to', '.sdlc', '--write']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const moved = join(dir, '.sdlc');
  assert.ok(!existsSync(root) && existsSync(join(moved, 'reviews')), 'the folder moved');
  assert.ok(existsSync(join(moved, 'state.json')), 'state.json was rebuilt (and the ignored copy moved with it)');
  assert.match(git('status', '--porcelain'), /^R[ M] dev\/reviews\/demo\/G0-intake-20260916-091203-3f2a\.md -> \.sdlc\//m, 'git sees renames, not delete + add');

  assert.deepEqual(bodyHashes(moved), { ...hashes, 'DASHBOARD.md': bodyHashes(moved)['DASHBOARD.md'] }, 'no artifact body changed');
  const g0 = readFileSync(join(moved, 'reviews', 'demo', 'G0-intake-20260916-091203-3f2a.md'), 'utf8');
  assert.match(g0, /^ {2}- path: \.sdlc\/intake\/demo\/problem\.md$/m, 'the front matter path moved');
  assert.equal(parseDoc(g0).body, g0body, 'the body — which still says dev/ — is byte for byte the same');
  assert.match(parseDoc(g0).body, /`dev\/intake\/demo\/problem\.md`/);

  const after = JSON.parse(readFileSync(join(moved, 'state.json'), 'utf8'));
  assert.deepEqual(states(after), states(before), 'every gate is where it was');
  assert.match(before.initiatives[0].stages[0].log, /^dev\//, 'the moved index named dev/ …');
  assert.match(after.initiatives[0].stages[0].log, /^\.sdlc\//, '… so it was rebuilt, not just carried along');
  assert.match(readFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), 'utf8'), /^- \*\*SDLC root:\*\* `\.sdlc`/m);
  assert.doesNotMatch(readFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), 'utf8'), /Dev root/);
  assert.match(readFileSync(join(dir, 'package.json'), 'utf8'), /node \.sdlc\/scripts\/build-state\.mjs/);
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\/\.sdlc\/state\.json$/m);
  assert.equal(git('config', 'core.hooksPath').trim(), '.sdlc/ci/git-hooks');
  assert.match(readFileSync(join(moved, 'ci', 'gitlab-ci.yml'), 'utf8'), /^ {2}SDLC_ROOT: \.sdlc$/m, 'the CI template names the new root');
  assert.match(readFileSync(join(moved, 'ci', 'github-workflow.yml'), 'utf8'), /^ {2}SDLC_ROOT: \.sdlc$/m);
  // The git hooks find commit-lint beside them, whatever the root is called.
  const msg = join(dir, 'msg.txt');
  writeFileSync(msg, 'not a conventional commit\n');
  const hook = spawnSync('sh', [join(moved, 'ci', 'git-hooks', 'commit-msg'), msg], { cwd: dir, encoding: 'utf8' });
  if (!hook.error) {
    assert.equal(hook.status, 1, `commit-msg ran commit-lint from .sdlc/ and rejected the message: ${hook.stdout}${hook.stderr}`);
    assert.doesNotMatch(hook.stderr, /Cannot find module/);
  }

  const lint = node(dir, join(moved, 'scripts', 'lint-dev.mjs'), ['--json']);
  assert.equal(JSON.parse(lint.stdout).errors, 0, lint.stdout);

  const back = node(dir, join(moved, 'scripts', 'migrate-root.mjs'), ['--to', 'dev', '--write']);
  assert.equal(back.status, 0, back.stdout + back.stderr);
  assert.deepEqual(states(JSON.parse(readFileSync(join(dir, 'dev', 'state.json'), 'utf8'))), states(before), 'and back again');
  assert.match(readFileSync(join(dir, 'dev', 'reviews', 'demo', 'G0-intake-20260916-091203-3f2a.md'), 'utf8'), /^ {2}- path: dev\/intake\//m);
});

test('migrate-root refuses a move with nowhere to go, and a target that already exists', () => {
  const { dir, root } = project('dev');
  mkdirSync(join(dir, '.sdlc'));
  assert.match(plan(dir, '.sdlc').problems.join(), /\.sdlc\/ already exists/);
  assert.match(plan(dir, 'dev').problems.join(), /dev\/ already exists/);
  assert.match(plan(dir, 'elsewhere').problems.join(), /--to is \.sdlc or dev/);
  const r = node(dir, join(root, 'scripts', 'migrate-root.mjs'), ['--to', '.sdlc', '--write']);
  assert.equal(r.status, 1);
});

test('rewriteFrontMatter touches path: and revalidated_from: in the front matter only', () => {
  const text = '---\ngate: G1\ninputs:\n  - path: dev/a.md\n    sha256: 1\nrevalidated_from: dev/reviews/x/G1-a.md\nnote: dev/b.md\n---\n\nSee `dev/a.md`.\n';
  const { text: out, changed } = rewriteFrontMatter(text, 'dev', '.sdlc');
  assert.equal(changed, 2);
  assert.match(out, /path: \.sdlc\/a\.md/);
  assert.match(out, /revalidated_from: \.sdlc\/reviews/);
  assert.match(out, /note: dev\/b\.md/, 'a key that is not a path reference is left alone');
  assert.ok(out.endsWith('See `dev/a.md`.\n'), 'the body is untouched');
  assert.equal(rewriteFrontMatter('no front matter dev/a.md', 'dev', '.sdlc').changed, 0);
});

test('setProfileRoot replaces the old entry and its continuation lines, or adds one under ## Project', () => {
  const p = '## Project\n\n- **Name:** `x`\n- **SDLC root:** `.sdlc` (default) — the process root: every\n  artifact this bundle writes.\n- **Source root:** `.`\n';
  const out = setProfileRoot(p, 'dev');
  assert.match(out, /^- \*\*SDLC root:\*\* `dev`/m);
  assert.doesNotMatch(out, /artifact this bundle writes/);
  assert.match(out, /- \*\*Source root:\*\*/);
  assert.equal(profileRoot(out), 'dev');
  const added = setProfileRoot('## Project\n\n- **Name:** `x`\n\n## Stacks\n', '.sdlc');
  assert.equal(profileRoot(added), '.sdlc');
  assert.ok(added.indexOf('SDLC root') < added.indexOf('## Stacks'));
});

test('the QA root (§9): QA_ROOT, then PROJECT-PROFILE, then .stlc/ or qa/, then .stlc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-qaroot-'));
  try {
    const noEnv = {};
    assert.equal(findQaRoot({ cwd: dir, env: noEnv }), '.stlc', 'nothing on disk: the default');
    mkdirSync(join(dir, 'qa'));
    assert.equal(findQaRoot({ cwd: dir, env: noEnv }), 'qa', 'a qa 2.1 project keeps qa/');
    mkdirSync(join(dir, '.stlc'));
    assert.equal(findQaRoot({ cwd: dir, env: noEnv }), '.stlc', 'both: .stlc/ first');
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'PROJECT-PROFILE.md'), '- **QA root:** `test/qa` — where the QA bundle writes\n');
    assert.equal(findQaRoot({ cwd: dir, env: noEnv }), 'test/qa', 'the profile wins over the folders');
    assert.equal(findQaRoot({ cwd: dir, env: { QA_ROOT: 'other/' } }), 'other', 'QA_ROOT wins over the profile');
    assert.equal(qaProfileRoot('- **QA root:** `qa/` (default)'), null, 'the 2.x default line is no choice');
    assert.equal(qaProfileRoot('- **QA root:** `<path>`'), null);
    assert.ok(underQaRoot('.stlc/reports/orders/x.md') && underQaRoot('qa/defects/x.md'));
    assert.ok(underQaRoot('test/qa/x.md', ['test/qa']) && !underQaRoot('src/qa.go'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
