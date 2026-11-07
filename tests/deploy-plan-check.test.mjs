/**
 * deploy-plan-check.mjs — a change that touches the database or an API ships with a stated
 * `## Rollout and rollback`; a basic change needs none (DEV-CONTRACTS §7, §13.4).
 *
 * Each CLI test builds a scratch repository: `main` with an app and an sdlc slug, then a branch that
 * changes something, with the ship notes taken from tests/fixtures/deploy-plan/. The check runs on
 * the branch against `main`, as the CI job runs it.
 *
 *   node --test tests/deploy-plan-check.test.mjs
 *   node tests/mutate.mjs deployplan      (each rule broken in turn must fail this file)
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { API_CHANGE, DATA_CHANGE, DB_CHANGE, IMPACT, POST_BACKUP_WRITES, classify, dataChange, judgePlan, keyLines, section } from '../workspace/dev/scripts/deploy-plan-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'deploy-plan-check.mjs');
const FIX = join(here, 'fixtures', 'deploy-plan');
const fixture = (name) => readFileSync(join(FIX, `${name}.md`), 'utf8');

const EXPAND = 'ALTER TABLE notes ADD COLUMN title_short text;\n';
const BACKFILL = 'UPDATE notes SET title_short = left(title, 40) WHERE id BETWEEN $1 AND $2;\n';
const ADDITIVE = 'ALTER TABLE notes ADD COLUMN tags text[];\nCREATE INDEX CONCURRENTLY notes_tags ON notes USING gin (tags);\n';
const OPENAPI = (extra = '') => `openapi: 3.1.0\ninfo: { title: notes, version: 1.0.0 }\npaths:\n  /notes:\n    get:\n      operationId: listNotes${extra}\n`;

/** A repo on `main`, then a `feat/x` branch carrying `change`; `notes` is the PR file's text or null. */
function scratch(change, { notes = null, slices = null, releasePlan = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-plan-'));
  const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false', ...a], { encoding: 'utf8' });
  const put = (files) => {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
  };
  git('init', '-q', '-b', 'main');
  put({ 'src/app.go': 'package main\n', 'api/openapi.yaml': OPENAPI(), '.sdlc/intake/notes/problem.md': '---\nslug: notes\n---\n' });
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('checkout', '-q', '-b', 'feat/x');
  const extra = {};
  if (notes !== null) extra['.sdlc/release/notes/pull-request.md'] = notes;
  if (slices !== null) extra['.sdlc/plan/notes/slices.md'] = slices;
  if (releasePlan !== null) extra['.sdlc/deployment/notes/release-plan.md'] = releasePlan;
  // The slug is touched by the branch even when it carries no notes, as a real slug's gate logs are.
  put({ '.sdlc/reviews/notes/G7-implementation-x.md': '---\ngate: G7\n---\n', ...change, ...extra });
  git('add', '.');
  git('commit', '-q', '-m', 'change');
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, '--repo', dir, '--base', 'main', '--json', ...args], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  const out = r.stdout ? JSON.parse(r.stdout) : { findings: [] };
  return { status: r.status, codes: [...new Set(out.findings.filter((f) => f.level === 'error').map((f) => f.code))].sort(), warns: out.findings.filter((f) => f.level === 'warn').map((f) => f.code), messages: out.findings.map((f) => f.message), stderr: r.stderr };
}

const MIG = 'db/migrations/202611030900_split_note_title.up.sql';

// ── The four cases the rule exists for ──────────────────────────────────────────────────────────

test('a change with no DB or API file passes with no notes at all', () => {
  const r = run(scratch({ 'src/app.go': 'package main\n\nfunc main() {}\n', 'README.md': '# notes\n' }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.codes, []);
});

test('E180 a DB change with no ship notes fails', () => {
  const r = run(scratch({ [MIG]: EXPAND }));
  assert.equal(r.status, 1);
  assert.deepEqual(r.codes, ['E180']);
});

test('a DB change with the full plan passes', () => {
  const r = run(scratch({ [MIG]: EXPAND + BACKFILL, 'scripts/backfill/note-title.mjs': '// batches\n' }, { notes: fixture('full') }));
  assert.equal(r.status, 0, JSON.stringify(r));
  assert.deepEqual(r.codes, []);
});

test('E180 an API change with no ship notes fails', () => {
  const r = run(scratch({ 'api/openapi.yaml': OPENAPI('\n      deprecated: true') }));
  assert.equal(r.status, 1);
  assert.deepEqual(r.codes, ['E180']);
});

// ── Notes that exist and say too little ─────────────────────────────────────────────────────────

test('E180 notes with no section, or a TBD one, fail a DB change', () => {
  assert.deepEqual(run(scratch({ [MIG]: EXPAND }, { notes: fixture('missing') })).codes, ['E180']);
  assert.deepEqual(run(scratch({ [MIG]: EXPAND }, { notes: fixture('tbd') })).codes, ['E180']);
});

test('E181 notes that say none while the API changed fail', () => {
  const r = run(scratch({ 'api/openapi.yaml': OPENAPI('\n      summary: list') }, { notes: fixture('none') }));
  assert.deepEqual(r.codes, ['E181']);
  assert.match(r.messages.join('\n'), /say `deploy_impact: none` and the diff changes the API/, 'the message names the contradiction');
});

test('`deploy_impact: none` is enough for a basic change that has notes', () => {
  const r = run(scratch({ 'src/app.go': 'package main\n// x\n' }, { notes: fixture('none') }));
  assert.equal(r.status, 0);
});

test('an additive-only migration passes with the light plan', () => {
  const r = run(scratch({ [MIG]: ADDITIVE }, { notes: fixture('additive') }));
  assert.equal(r.status, 0, JSON.stringify(r));
});

test('E183 the light plan does not cover a migration that rewrites rows', () => {
  const r = run(scratch({ [MIG]: ADDITIVE + BACKFILL }, { notes: fixture('additive') }));
  assert.ok(r.codes.includes('E183'), JSON.stringify(r));
  assert.ok(r.codes.includes('E182'), 'the full DB lines are owed too');
});

// ── The Data part ───────────────────────────────────────────────────────────────────────────────

test('E183 a data-changing migration with no `### Data` part fails', () => {
  const r = run(scratch({ [MIG]: EXPAND + BACKFILL }, { notes: fixture('no-data-part') }));
  assert.deepEqual(r.codes, ['E183']);
});

test('E184 a `### Data` part that leaves backup, before or after empty fails', () => {
  const dir = scratch({ [MIG]: EXPAND + BACKFILL }, { notes: fixture('data-part-empty') });
  const r = spawnSync(process.execPath, [SCRIPT, '--repo', dir, '--base', 'main', '--json'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  const f = JSON.parse(r.stdout).findings.filter((x) => x.code === 'E184').map((x) => x.message);
  assert.equal(r.status, 1);
  assert.equal(f.length, 3, f.join('\n'));
  assert.ok(f.some((m) => /backup: `- Data restore tried:` is empty/.test(m)));
  assert.ok(f.some((m) => /before: `- Data baseline:` is missing/.test(m)));
  assert.ok(f.some((m) => /after: `- Data verify:` is empty/.test(m)));
});

test('a data or backfill script alone counts as a data change', () => {
  const r = run(scratch({ 'scripts/backfill/note-title.mjs': '// batches\n' }, { notes: fixture('no-data-part') }));
  assert.deepEqual(r.codes, ['E183']);
});

// ── Where the notes come from ───────────────────────────────────────────────────────────────────

test('on the fast track before G9, slices.md carries the plan', () => {
  assert.equal(run(scratch({ [MIG]: EXPAND + BACKFILL }, { slices: fixture('full') })).status, 0);
  assert.deepEqual(run(scratch({ [MIG]: EXPAND }, { slices: fixture('none') })).codes, ['E181']);
});

test('E180 a release plan whose Migration ordering is empty while the DB changed', () => {
  const plan = '---\nslug: notes\n---\n\n## Migration ordering\n\nTBD\n\n## Rollback\n\nx\n';
  assert.deepEqual(run(scratch({ [MIG]: EXPAND + BACKFILL }, { notes: fixture('full'), releasePlan: plan })).codes, ['E180']);
});

test('W180 a route file changed with no contract change warns and passes', () => {
  const r = run(scratch({ 'internal/handlers/notes.go': 'package handlers\n' }));
  assert.equal(r.status, 0);
  assert.deepEqual(r.warns, ['W180']);
});

test('--files reads a given list from the working tree, no git range', () => {
  const dir = scratch({ [MIG]: EXPAND });
  const r = spawnSync(process.execPath, [SCRIPT, 'notes', '--repo', dir, '--files', MIG], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /E180/);
});

// ── The rules, one at a time ────────────────────────────────────────────────────────────────────

const plan = (name) => section(fixture(name).split('\n---\n').slice(1).join('\n---\n'), 'Rollout and rollback');
const DB = { db: [MIG], api: [], data: [] };
const DATA = { db: [MIG], api: [], data: [{ path: MIG, why: 'UPDATE notes SET' }] };
const codes = (text, changed) => judgePlan(text, changed).map((p) => p.code).sort();

test('every required line is required: removing one is E182', () => {
  const full = plan('full');
  for (const label of ['Order', 'Verify', 'Rollback code', 'Decides', 'Rehearsed on staging', 'DB N-1 compatible', 'DB expand/contract', 'DB lock risk', 'DB backfill', 'DB snapshot', 'Rollback DB', 'API versioning', 'API clients', 'API order', 'Rollback API']) {
    const cut = full.replace(new RegExp(`^- ${label.replace('/', '\\/')}:.*\\n`, 'm'), '');
    assert.notEqual(cut, full, `${label} is in the fixture`);
    assert.deepEqual(codes(cut, { ...DATA, api: ['api/openapi.yaml'] }), ['E182'], label);
  }
});

test('E182 a value outside the vocabulary, a snapshot with no command, a DB rollback with no way back', () => {
  const full = plan('full');
  const API = { ...DATA, api: ['api/openapi.yaml'] };
  assert.deepEqual(codes(full.replace('db_change: expand', 'db_change: rename'), API), ['E182']);
  assert.deepEqual(codes(full.replace('db_change: expand', 'db_change: contract'), API), ['E182'], 'a contract names its release');
  assert.deepEqual(codes(full.replace('db_change: expand', 'db_change: expand, contract — 1.13.0'), API), [], 'expand now, contract from 1.13.0');
  assert.deepEqual(codes(full.replace('data_change: backfill', 'data_change: shuffle'), API), ['E182']);
  assert.deepEqual(codes(full.replace('api_change: additive', 'api_change: breaking'), API), ['E182'], 'a breaking change is never unversioned');
  assert.deepEqual(codes(full.replace('rollback: redeploy-previous, down-migration, snapshot-restore', 'rollback: redeploy-previous'), API), ['E182']);
  assert.deepEqual(codes(full.replace('deploy_impact: db, api', 'deploy_impact: db, web'), API), ['E182', 'E181'].sort());
  assert.deepEqual(codes(full.replace(/^- DB snapshot: .*$/m, '- DB snapshot: we take one'), API), ['E182']);
  assert.deepEqual(codes(full.replace(/^- Rollback DB: .*$/m, '- Rollback DB: revert the commit'), API), ['E182']);
});

test('every key the impact needs is required: removing one fails', () => {
  const full = plan('full');
  const API = { ...DATA, api: ['api/openapi.yaml'] };
  for (const [key, code] of [['db_change', 'E182'], ['data_change', 'E182'], ['rollback', 'E182'], ['api_change', 'E182'], ['backup', 'E184'], ['post_backup_writes', 'E184']]) {
    const cut = full.replace(new RegExp(`^${key}:.*\\n`, 'm'), '');
    assert.notEqual(cut, full, `${key} is in the fixture`);
    assert.deepEqual(codes(cut, API), [code], key);
  }
});

test('E184 post_backup_writes outside the vocabulary, or a write-freeze that says not how', () => {
  const full = plan('full');
  assert.deepEqual(codes(full.replace('post_backup_writes: delta-export', 'post_backup_writes: hope'), DATA), ['E184']);
  assert.deepEqual(codes(full.replace('post_backup_writes: delta-export', 'post_backup_writes: write-freeze'), DATA), ['E184']);
  assert.deepEqual(codes(full.replace('post_backup_writes: delta-export', 'post_backup_writes: write-freeze — the app goes read-only behind the maintenance flag'), DATA), []);
});

test('E181 data_change none while a migration rewrites rows; deploy_impact that leaves the DB out', () => {
  assert.deepEqual(codes(plan('full').replace('data_change: backfill', 'data_change: none'), DATA), ['E181']);
  assert.deepEqual(codes(plan('full').replace('deploy_impact: db, api', 'deploy_impact: api'), DB), ['E181']);
});

test('the shared vocabulary keeps its names and values: the QA bundle reads them', () => {
  assert.deepEqual(IMPACT, ['none', 'db', 'api']);
  assert.deepEqual(DB_CHANGE, ['additive', 'expand', 'contract']);
  assert.deepEqual(DATA_CHANGE, ['none', 'backfill', 'transform', 'split-merge', 'type-change', 'delete', 'import']);
  assert.deepEqual(API_CHANGE, ['additive', 'versioned', 'deprecated']);
  assert.deepEqual(POST_BACKUP_WRITES, ['delta-export', 'replay', 'write-freeze']);
  const tpl = section(readFileSync(join(here, '..', 'workspace', 'dev', '_templates', 'pull-request.md'), 'utf8'), 'Rollout and rollback');
  assert.deepEqual([...keyLines(tpl).keys()], ['deploy_impact', 'other_impact', 'db_change', 'data_change', 'rollback', 'backup', 'post_backup_writes', 'api_change'], 'the template carries every key as a plain line');
  assert.deepEqual([...keyLines(plan('full')).keys()].slice(0, 2), ['deploy_impact', 'db_change']);
});

test('a release plan copies the keys only, and is judged on them', () => {
  const head = '---\nslug: notes\n---\n\n## Rollout and rollback\n\n';
  const tail = '\n## Migration ordering\n\nsnapshot, then migrate before code\n';
  const keys = plan('full').split('\n').filter((l) => /^[a-z_]+:/.test(l)).join('\n');
  assert.deepEqual(run(scratch({ [MIG]: EXPAND + BACKFILL }, { notes: fixture('full'), releasePlan: `${head}${keys}\n${tail}` })).codes, []);
  assert.deepEqual(run(scratch({ [MIG]: EXPAND + BACKFILL }, { notes: fixture('full'), releasePlan: `${head}deploy_impact: none\n${tail}` })).codes, ['E181']);
});

test('a placeholder left from the template is empty', () => {
  assert.deepEqual(codes(plan('full').replace(/^- Decides: .*$/m, '- Decides: <the named person who calls the rollback>'), DATA), ['E182']);
});

test('the templates as shipped are not a plan: their placeholders fail', () => {
  const tpl = readFileSync(join(here, '..', 'workspace', 'dev', '_templates', 'pull-request.md'), 'utf8');
  assert.deepEqual(codes(section(tpl, 'Rollout and rollback'), DATA), ['E180']);
  const sl = readFileSync(join(here, '..', 'workspace', 'dev', '_templates', 'slices.md'), 'utf8');
  assert.deepEqual(codes(section(sl, 'Rollout and rollback'), DATA), ['E181'], 'slices.md starts at none, which a DB change contradicts');
});

test('every Data line is required: removing one is E184', () => {
  const full = plan('full');
  for (const label of ['Data restore tried', 'Data baseline', 'Data dry run', 'Data order', 'Data uptime', 'Data verify', 'Data cleanup', 'Data restore point', 'Data loss on restore']) {
    const cut = full.replace(new RegExp(`^- ${label}:.*\\n?`, 'm'), '');
    assert.deepEqual(codes(cut, DATA), ['E184'], label);
  }
});

// ── What counts as a DB, API or data change ────────────────────────────────────────────────────

test('classify: migrations, ORM schemas and contracts count; tests, seeds and pipeline docs do not', () => {
  assert.equal(classify('prisma/migrations/20261103_x/migration.sql'), 'db');
  assert.equal(classify('prisma/schema.prisma'), 'db');
  assert.equal(classify('ent/schema/note.go'), 'db');
  assert.equal(classify('alembic/versions/abc_add.py'), 'db');
  assert.equal(classify('db/structure.sql'), 'db');
  assert.equal(classify('api/openapi.yaml'), 'api');
  assert.equal(classify('proto/notes.proto'), 'api');
  assert.equal(classify('events/note-created.json'), 'api');
  assert.equal(classify('.sdlc/api/notes/openapi.yaml'), 'api');
  assert.equal(classify('app/api/notes/route.ts'), 'route');
  assert.equal(classify('.sdlc/data/notes/migration-plan.md'), null);
  assert.equal(classify('db/seeds/notes.sql'), null);
  assert.equal(classify('tests/fixtures/dump.sql'), null);
  assert.equal(classify('src/app.go'), null);
});

test('dataChange: statements that move rows are found; additive DDL and down files are not', () => {
  for (const sql of ['UPDATE notes SET a = 1', 'DELETE FROM notes WHERE x', 'INSERT INTO b (id) SELECT id FROM a', 'ALTER TABLE notes ALTER COLUMN n TYPE bigint', 'ALTER TABLE notes DROP COLUMN title', 'DROP TABLE old_notes', 'ALTER TABLE notes RENAME COLUMN a TO b', 'ALTER TABLE n RENAME TO m']) {
    assert.ok(dataChange('db/migrations/1.up.sql', sql), sql);
  }
  for (const sql of [ADDITIVE, 'CREATE TABLE tags (id bigint primary key);', 'ALTER TABLE notes DROP CONSTRAINT notes_kind_check, ADD CONSTRAINT notes_kind_check CHECK (kind IN (\'a\', \'b\', \'c\'));', "INSERT INTO kinds (id) VALUES ('c');", '-- UPDATE notes SET a = 1 (a comment)']) {
    assert.equal(dataChange('db/migrations/1.up.sql', sql), null, sql);
  }
  assert.equal(dataChange('db/migrations/1.down.sql', 'DROP COLUMN x'), null);
  assert.ok(dataChange('app/migrations/0002_fill.py', 'migrations.RunPython(fill)'), 'adapter call');
  assert.ok(dataChange('scripts/backfill/run.mjs', ''), 'a backfill folder');
});
