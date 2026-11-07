/**
 * The UI score (DEV-CONTRACTS §13.13): the result rule, the machine rows ui-score.mjs fills from the
 * checkers' JSON, and lint E145 recomputing the table a gate log carries.
 *
 *   node --test tests/ui-score.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CRITERIA, judge, toMarkdown, readStatus } from '../workspace/dev/scripts/lib/ui-score.mjs';
import { machineRows, readSpec, scoreRows } from '../workspace/dev/scripts/ui-score.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'ui-score.mjs');
const FIX = join(here, 'fixtures', 'ui-spec');
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const allPass = () => CRITERIA.map((c) => ({ ...c, status: 'PASS', evidence: 'x' }));

test('criteria: weights sum to 100, ids unique, the five mandatory criteria of §13.13', () => {
  assert.equal(CRITERIA.reduce((a, c) => a + c.weight, 0), 100);
  assert.equal(new Set(CRITERIA.map((c) => c.id)).size, CRITERIA.length);
  assert.deepEqual(CRITERIA.filter((c) => c.mandatory).map((c) => c.id), ['U02', 'U03', 'U05', 'U11', 'U18']);
  for (const c of CRITERIA) for (const k of ['section', 'criterion', 'weight']) assert.ok(k in c);
});

test('judge: PASS at ≥ 90 with every mandatory PASS; a mandatory FAIL is BLOCKED whatever the score', () => {
  assert.deepEqual(judge(allPass()).result, 'PASS');
  assert.equal(judge(allPass()).score, 100);
  const m = allPass().map((r) => (r.id === 'U11' ? { ...r, status: 'FAIL' } : r));
  assert.equal(judge(m).result, 'BLOCKED');
  assert.ok(judge(m).score >= 89);
});

test('judge: 75–89 is REVIEW, below 75 BLOCKED, a mandatory NOT_RUN REVIEW, a DEC-waiting UNKNOWN NEEDS_CLARIFICATION, N/A not counted', () => {
  const fail = (ids) => allPass().map((r) => (ids.includes(r.id) ? { ...r, status: 'FAIL' } : r));
  assert.equal(judge(fail(['U13', 'U14'])).result, 'PASS', '90 is a pass');
  assert.equal(judge(fail(['U13', 'U14', 'U17'])).result, 'REVIEW'); // 88
  assert.equal(judge(fail(['U10', 'U13'])).result, 'REVIEW'); // 87
  assert.equal(judge(fail(['U01', 'U04', 'U06', 'U07', 'U08', 'U09'])).score, 71);
  assert.equal(judge(fail(['U01', 'U04', 'U06', 'U07', 'U08', 'U09'])).result, 'BLOCKED', 'below 75');
  const nr = allPass().map((r) => (r.id === 'U05' ? { ...r, status: 'NOT_RUN' } : r));
  assert.equal(judge(nr).result, 'REVIEW');
  const dec = allPass().map((r) => (r.id === 'U09' ? { ...r, status: 'UNKNOWN', evidence: 'waits on DEC-012' } : r));
  assert.equal(judge(dec).result, 'NEEDS_CLARIFICATION');
  const na = allPass().map((r) => (r.id === 'U16' ? { ...r, status: 'N/A', reason: 'no golden set' } : r));
  assert.equal(judge(na).score, 100);
});

test('readStatus: the five statuses; N/A carries its reason', () => {
  assert.deepEqual(readStatus('PASS'), { status: 'PASS', reason: '' });
  assert.deepEqual(readStatus('NOT RUN'), { status: 'NOT_RUN', reason: '' });
  assert.deepEqual(readStatus('N/A — not judged at G5'), { status: 'N/A', reason: 'not judged at G5' });
  assert.equal(readStatus('maybe'), null);
});

function devRoot() {
  const r = mkdtempSync(join(tmpdir(), 'sdlc-uiscore-'));
  mkdirSync(join(r, 'ui', 'demo'), { recursive: true });
  mkdirSync(join(r, 'api', 'demo'), { recursive: true });
  mkdirSync(join(r, 'docs'), { recursive: true });
  writeFileSync(join(r, 'ui', 'demo', 'ui-spec.md'), read(join(FIX, 'ui-spec.md')));
  writeFileSync(join(r, 'api', 'demo', 'openapi.yaml'), read(join(FIX, 'openapi.yaml')));
  writeFileSync(join(r, 'docs', 'design-tokens.json'), read(join(FIX, 'design-tokens.json')));
  return r;
}

const RUBRIC_OK = { results: [1024, 768, 360].map((width) => ({ name: 'list', width, axe: 'run', findings: [] })) };

test('machine rows: the spec rows PASS on the valid fixture and FAIL when a table breaks; no input is NOT_RUN', () => {
  const r = devRoot();
  try {
    const rows = scoreRows({ gate: 'G5', spec: readSpec(r, 'demo'), inputs: { rubric: RUBRIC_OK } });
    const by = Object.fromEntries(rows.map((x) => [x.id, x.status]));
    assert.equal(by.U02, 'PASS');
    assert.equal(by.U03, 'PASS');
    assert.equal(by.U10, 'PASS');
    assert.equal(by.U11, 'PASS');
    assert.equal(by.U05, 'N/A', 'the kit is not judged at G5');
    assert.equal(by.U01, 'UNKNOWN', 'a reviewer row');
    const spec = read(join(FIX, 'ui-spec.md')).replace('### Roles matrix', '### Who sees what');
    writeFileSync(join(r, 'ui', 'demo', 'ui-spec.md'), spec);
    assert.equal(scoreRows({ gate: 'G5', spec: readSpec(r, 'demo'), inputs: {} }).find((x) => x.id === 'U02').status, 'FAIL');
    assert.equal(scoreRows({ gate: 'G5', spec: readSpec(r, 'demo'), inputs: {} }).find((x) => x.id === 'U11').status, 'NOT_RUN');
  } finally {
    rmSync(r, { recursive: true, force: true });
  }
});

test('machine rows: each checker JSON fails its row', () => {
  const rub = { results: [{ name: 'list', width: 1024, axe: 'run', findings: [{ rule: 'overflow', level: 'fail' }, { rule: 'target-size', level: 'fail' }] }, { name: 'list', width: 768, axe: 'run', findings: [] }, { name: 'list', width: 360, axe: 'run', findings: [] }] };
  const m = machineRows({ spec: null, inputs: {
    rubric: rub,
    kit: { findings: [{ kind: 'missing-kit' }] }, classes: { dead: [], arbitrary: [] }, inventory: { findings: [] },
    consistency: { pages: 3, fails: [{ role: 'h1' }] },
    trace: { counts: { traced: 1, required: 2 }, gaps: [{}] }, patterns: { results: [] },
    copy: { findings: [{ rule: 'literal' }] }, pseudo: { results: [] },
    perf: { results: [{ ok: false }] },
    privacy: { findings: [{ level: 'error' }] },
    golden: { shots: [{ name: 'list', width: 1024, golden: { ok: false, changed: 4.2 } }] },
  } });
  for (const id of ['U05', 'U06', 'U08', 'U10', 'U11', 'U12', 'U13', 'U14', 'U16']) assert.equal(m[id].status, 'FAIL', id);
  const noAxe = machineRows({ spec: null, inputs: { rubric: { results: [{ name: 'a', width: 1024, axe: 'not-run', axeReason: 'no axe-core', findings: [] }] } } });
  assert.equal(noAxe.U11.status, 'NOT_RUN');
  assert.equal(noAxe.U10.status, 'NOT_RUN', 'the rubric did not run at 768 and 360');
});

test('CLI: markdown with the result line, --json rows in the shared shape, exit 1 on a FAIL', () => {
  const r = devRoot();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const rubric = join(r, 'rubric.json');
    writeFileSync(rubric, JSON.stringify(RUBRIC_OK));
    const md = spawnSync(process.execPath, [SCRIPT, 'demo', '--gate', 'G5', '--root', r, '--rubric', rubric], { encoding: 'utf8', env });
    assert.equal(md.status, 0, md.stdout + md.stderr);
    assert.match(md.stdout, /\| Section \| Criterion \| Status \| Weight \| Evidence \|/);
    assert.match(md.stdout, /\*\*UI score:\*\* [\d.]+ · REVIEW/);
    const j = spawnSync(process.execPath, [SCRIPT, 'demo', '--gate', 'G5', '--root', r, '--json'], { encoding: 'utf8', env });
    const out = JSON.parse(j.stdout);
    for (const row of out.rows) for (const k of ['section', 'criterion', 'status', 'weight', 'evidence']) assert.ok(k in row, k);
    writeFileSync(join(r, 'ui', 'demo', 'ui-spec.md'), read(join(FIX, 'ui-spec.md')).replace('### Traceability', '### Mapping'));
    assert.equal(spawnSync(process.execPath, [SCRIPT, 'demo', '--gate', 'G5', '--root', r], { encoding: 'utf8', env }).status, 1);
    assert.equal(spawnSync(process.execPath, [SCRIPT, 'demo', '--root', r], { encoding: 'utf8', env }).status, 2);
  } finally {
    rmSync(r, { recursive: true, force: true });
  }
});

// E145 — a gate log's UI score must agree with its own rows and with its verdict.
const LOG = (verdict, table) => `---
slug: demo
gate: G5
stage: ui
run_id: 20261014-100000-ab12
attempt: 1
verdict: ${verdict}
reviewer: dev-reviewing-ui
inputs:
  - path: dev/requirements/demo/requirements.md
    sha256: ${'a'.repeat(64)}
outputs:
  - path: dev/ui/demo/ui-spec.md
    sha256: ${'b'.repeat(64)}
findings: { blocker: 0, major: 0, minor: 0, info: 0 }
unlocks: G6
skip_reason: null
override: null
revalidated_from: null
---

## Scope

The ui-spec.

## Checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 26 | The UI score is computed and its result allows this verdict | PASS | ui-score.mjs output |

## Findings

None.

## Finding resolution

N/A — first review.

## Carried forward

None.

## Verdict

Judged.

${table}
`;

function lintLog(text) {
  const r = mkdtempSync(join(tmpdir(), 'sdlc-uiscore-log-'));
  mkdirSync(join(r, 'reviews', 'demo'), { recursive: true });
  writeFileSync(join(r, 'reviews', 'demo', 'G5-ui-20261014-100000-ab12.md'), text);
  const out = lintTree(r, TEMPLATES).filter((f) => f.rule === 'E145');
  rmSync(r, { recursive: true, force: true });
  return out;
}

test('E145: a consistent table passes; a missing table, a wrong result, a PASS verdict on REVIEW, a bare N/A fail', () => {
  const rows = allPass();
  const good = `### UI score\n\n${toMarkdown(rows, judge(rows))}`;
  assert.deepEqual(lintLog(LOG('PASS', good)), []);
  assert.equal(lintLog(LOG('PASS', '')).length, 1, 'no table');
  assert.equal(lintLog(LOG('PASS', good.replace('· PASS', '· REVIEW'))).length, 1, 'the stated result disagrees');
  const review = allPass().map((r) => (r.id === 'U13' || r.id === 'U14' || r.id === 'U10' ? { ...r, status: 'FAIL' } : r));
  const reviewTable = `### UI score\n\n${toMarkdown(review, judge(review))}`;
  assert.deepEqual(lintLog(LOG('CHANGES_REQUESTED', reviewTable)), []);
  assert.equal(lintLog(LOG('PASS', reviewTable)).length, 1, 'only a PASS score carries a PASS verdict');
  assert.ok(lintLog(LOG('PASS', good.replace(/\| PASS \| 3 \|/, '| N/A | 3 |'))).length >= 1, 'N/A needs its reason');
  const noRow = LOG('PASS', '').replace(/\| 26 \|[^\n]*\n/, '| 26 | Something else | PASS | x |\n');
  assert.deepEqual(lintLog(noRow), [], 'a log without the UI score row is not judged');
});
