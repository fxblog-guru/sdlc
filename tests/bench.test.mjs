/**
 * Step 6 of docs/learning-roadmap.md: the pipeline is scored on what it wrote, and two versions are
 * compared on numbers with their intervals. A later version that is worse ships only with a reason.
 *
 *   node --test tests/bench.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'bench.mjs');
const bench = await import(pathToFileURL(SCRIPT).href);
process.env.SDLC_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';

const LOG = (slug, gate, run, attempt, verdict, { findings = [], reopened = [] } = {}) => [`reviews/${slug}/${gate}-x-${run}${attempt > 1 ? '-a2' : ''}.md`, `---
slug: ${slug}
gate: ${gate}
run_id: ${run}
attempt: ${attempt}
verdict: ${verdict}
---

## Findings

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
${findings.map(([id, p]) => `| ${id} | MAJOR | defect | x | ${p} | e | c | o |`).join('\n')}

## Finding resolution

| Id | Author's action | Reviewer verdict | Evidence |
|---|---|---|---|
${reopened.map((id) => `| ${id} | fixed | REOPENED | x |`).join('\n')}
`];

function project(entries, extra = {}) {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-bench-')), '.sdlc');
  for (const [rel, text] of [...entries, ...Object.entries(extra)]) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('wilson: the interval is the textbook one, and n = 0 says nothing', () => {
  const [lo, hi] = bench.wilson(8, 10);
  assert.ok(Math.abs(lo - 0.490) < 0.002 && Math.abs(hi - 0.943) < 0.002, `${lo} ${hi}`);
  assert.deepEqual(bench.wilson(0, 0), [0, 1]);
  assert.equal(bench.wilson(10, 10)[1], 1);
});

test('first_pass counts the FIRST review of each initiative and gate; SKIPPED is not a review', () => {
  const root = project([
    LOG('a', 'G1', '20261001-100000-aaaa', 1, 'CHANGES_REQUESTED'),
    LOG('a', 'G1', '20261001-100000-aaaa', 2, 'PASS'),
    LOG('a', 'G2', '20261002-100000-aaaa', 1, 'PASS'),
    LOG('a', 'G3', '20261003-100000-aaaa', 1, 'SKIPPED'),
    LOG('b', 'G1', '20261004-100000-aaaa', 1, 'PASS'),
    LOG('b', 'G1', '20261009-100000-aaaa', 1, 'CHANGES_REQUESTED'),
  ]);
  const s = bench.score(root);
  assert.deepEqual([s.first_pass.passed, s.first_pass.of], [2, 3], 'a·G1 failed first, a·G2 and b·G1 (its earliest run) passed');
  assert.equal(s.rework, 1);
  assert.equal(s.initiatives, 2);
});

test('reopened, repeated (uncovered and covered), unverified and lessons are counted', () => {
  const root = project([
    LOG('a', 'G4', '20261001-100000-aaaa', 1, 'CHANGES_REQUESTED', { findings: [['CR-001', 'List endpoint returns every row with no cursor']] }),
    LOG('a', 'G4', '20261001-100000-aaaa', 2, 'PASS', { reopened: ['CR-001'] }),
    LOG('b', 'G4', '20261002-100000-aaaa', 1, 'CHANGES_REQUESTED', { findings: [['CR-003', 'List endpoint returns every row, no cursor']] }),
  ], {
    'design/a/architecture.md': '---\n---\n\nUNVERIFIED: most users are on mobile.\nThe rule says `UNVERIFIED: <claim>`.\n',
  });
  const s = bench.score(root);
  assert.equal(s.reopened, 1);
  assert.deepEqual(s.repeated, { total: 1, uncovered: 1 });
  assert.equal(s.unverified, 1, 'a code span is not a claim');
  assert.deepEqual(s.lessons, { active: 0, established: 0 });
});

const S = (rate, ci95, uncovered = 0) => ({ label: null, first_pass: { passed: 0, of: 10, rate, ci95 }, rework: 1, reopened: 1, repeated: { total: uncovered, uncovered }, unverified: 0, lessons: { active: 0, established: 0 } });

test('compare: worse only when the intervals separate downward, or uncovered repeats grow', () => {
  assert.deepEqual(bench.compare(S(0.5, [0.3, 0.7]), S(0.45, [0.25, 0.65])).worse, [], 'overlapping intervals are not a change');
  assert.match(bench.compare(S(0.5, [0.3, 0.7]), S(0.45, [0.25, 0.65])).lines.join('\n'), /intervals overlap: not a measurable change/);
  assert.match(bench.compare(S(0.8, [0.7, 0.9]), S(0.2, [0.1, 0.3])).worse[0], /first_pass fell/);
  assert.match(bench.compare(S(0.2, [0.1, 0.3]), S(0.8, [0.7, 0.9])).lines.join('\n'), /improved/);
  assert.match(bench.compare(S(0.5, [0.3, 0.7], 1), S(0.5, [0.3, 0.7], 2)).worse[0], /more repeated findings with no lesson/);
});

test('the CLI: score writes JSON; compare exits 1 when worse, 0 with a reason, 0 when not worse', () => {
  const root = project([LOG('a', 'G1', '20261001-100000-aaaa', 1, 'PASS')]);
  const dir = dirname(root);
  const r = spawnSync(process.execPath, [SCRIPT, 'score', '--root', root, '--label', 'v1', '--out', join(dir, 'a.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).label, 'v1');
  writeFileSync(join(dir, 'good.json'), JSON.stringify(S(0.8, [0.7, 0.9])));
  writeFileSync(join(dir, 'bad.json'), JSON.stringify(S(0.2, [0.1, 0.3])));
  const cmp = (...a) => spawnSync(process.execPath, [SCRIPT, 'compare', ...a], { encoding: 'utf8' });
  const worse = cmp(join(dir, 'good.json'), join(dir, 'bad.json'));
  assert.equal(worse.status, 1);
  assert.match(worse.stdout, /WORSE {2}first_pass fell/);
  assert.match(worse.stdout, /ships only with --reason/);
  const ok = cmp(join(dir, 'good.json'), join(dir, 'bad.json'), '--reason', 'stricter G4 checklist on purpose');
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /accepted: stricter G4 checklist on purpose/);
  assert.equal(cmp(join(dir, 'bad.json'), join(dir, 'good.json')).status, 0);
  assert.equal(cmp(join(dir, 'bad.json')).status, 2);
});

test('estimates: an Actual inside the range counts as within; the ratio is the median actual ÷ high end', () => {
  assert.deepEqual(bench.estimateRange('2–4h; 4h if the container needs work'), [2, 4]);
  assert.deepEqual(bench.estimateRange('90min'), [1.5, 1.5]);
  assert.deepEqual(bench.estimateRange('1-2d'), [8, 16]);
  assert.equal(bench.estimateRange('—'), null);
  const root = mkdtempSync(join(tmpdir(), 'sdlc-bench-est-'));
  mkdirSync(join(root, 'plan', 'orders'), { recursive: true });
  mkdirSync(join(root, 'implementation', 'orders'), { recursive: true });
  writeFileSync(join(root, 'plan', 'orders', 'tasks.md'), '---\nartifact: tasks\n---\n\n## Tasks\n\n| Id | Task | Estimate | Status |\n|---|---|---|---|\n| TASK-001 | a | 2–4h | todo |\n| TASK-002 | b | 2–4h | todo |\n| TASK-003 | c | 1–2h | todo |\n| TASK-004 | d | 1–2h | todo |\n');
  writeFileSync(join(root, 'implementation', 'orders', 'progress.md'), '| Task | Status | Commit | Note | Actual |\n|---|---|---|---|---|\n| TASK-001 | in-progress | — | — | — |\n| TASK-001 | done | a1 | — | 3h |\n| TASK-002 | done | a2 | — | 8h |\n| TASK-003 | done | a3 | — | — |\n| TASK-004 | blocked | — | DEC-001 | 1h |\n');
  const e = bench.score(root).estimates;
  assert.equal(e.of, 2, 'only done tasks with an actual are scored; the last row wins');
  assert.equal(e.within, 1, '3h is inside 2–4h; 8h is not');
  assert.equal(e.ratio, 1.375, 'median of 3/4 and 8/4');
  const none = bench.score(mkdtempSync(join(tmpdir(), 'sdlc-bench-none-'))).estimates;
  assert.deepEqual(none, { of: 0, within: 0, ratio: null }, 'no actuals is no score, never a guess');
  assert.match(bench.compare({ ...bench.score(root), estimates: undefined }, bench.score(root)).lines.join('\n'), /estimates {4}no actuals → 1\/2 within, ×1\.375/);
});

test('export: one record per initiative and gate in the bundle-bench schema; SKIPPED is null, not a pass', () => {
  const root = project([
    LOG('orders', 'G1', '20261001-100000-aaaa', 1, 'PASS'),
    LOG('orders', 'G2', '20261001-110000-aaaa', 1, 'FAIL'),
    LOG('orders', 'G2', '20261001-120000-aaaa', 2, 'PASS'),
    LOG('orders', 'G3', '20261001-130000-aaaa', 1, 'SKIPPED'),
  ]);
  const doc = bench.exportTasks(root, { condition: 'no-lessons' });
  assert.equal(doc.schema, 1);
  assert.equal(doc.condition, 'no-lessons');
  assert.deepEqual(doc.tasks.map((t) => [t.task_id, t.first_pass]), [['orders|G1', true], ['orders|G2', false], ['orders|G3', null]],
    'the first attempt decides first_pass');
  for (const t of doc.tasks) assert.deepEqual([t.repeat_errors, t.tokens, t.duration_s], [0, null, null], 'unrecorded cost is null');
});

// The comparer lives in the ai-eval bundle; when it is checked out beside this repo, the export must load in it.
const COMPARER = join(process.env.AI_EVAL_DIR ?? join(here, '..', '..', 'ai-eval'), 'workspace', 'evals', 'scripts', 'compare_bench.py');
test('export: the ai-eval comparer accepts it', { skip: !existsSync(COMPARER) && 'ai-eval not checked out beside sdlc' }, () => {
  const root = project([LOG('orders', 'G1', '20261001-100000-aaaa', 1, 'PASS')]);
  const out = join(mkdtempSync(join(tmpdir(), 'sdlc-export-')), 'a.json');
  writeFileSync(out, `${JSON.stringify(bench.exportTasks(root, { condition: 'lessons' }))}\n`);
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(py, ['-I', COMPARER, out, out], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 3, `one paired task is NOT-EVALUABLE, not a schema error: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /NOT-EVALUABLE/);
});
