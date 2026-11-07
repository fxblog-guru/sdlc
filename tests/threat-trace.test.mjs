/**
 * threat-trace.mjs: every THR-NNN in threat-model.md names a control and a test, and at G8 the test
 * exists in the source (DEV-CONTRACTS §13.6).
 *
 * The release-management threat model mapped each mitigation to "G7 (… tests)" in prose, with no test
 * id. Nothing could check that the session-fixation test existed, so nothing did.
 *
 *   node --test tests/threat-trace.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { doneThreats, parseRefs, profileGates, trace } from '../workspace/dev/scripts/threat-trace.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'threat-trace.mjs');

const model = (rows, residual = 'THR-004 accepted by Luan until 2026-12-31.') => `---
slug: demo
artifact: threat-model
---

## STRIDE analysis

| Id | Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at | Test |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

## Residual risk

${residual}
`;

const GOOD = [
  '| THR-001 | B1 | Spoofing | session fixation | low | high | new id at sign-in | internal/http | `TestSessionFixation` |',
  '| THR-002 | B1 | Tampering | IDOR on release id | med | high | project-scoped query | internal/release | internal/release/repo_test.go:TestOtherProject |',
  '| THR-003 | B2 | Information disclosure | secret in repo | low | high | gitleaks in CI | CI | gate:Secret scan |',
  '| THR-004 | B3 | Denial of service | huge export | low | med | none beyond rate limit | edge | accepted: Luan |',
];

function source() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-thr-'));
  mkdirSync(join(root, 'internal', 'http'), { recursive: true });
  mkdirSync(join(root, 'internal', 'release'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'internal', 'http', 'session_test.go'), 'package http\nfunc TestSessionFixation(t *testing.T) {}\n');
  writeFileSync(join(root, 'internal', 'release', 'repo_test.go'), 'package release\nfunc TestOtherProject(t *testing.T) {}\n');
  // A name that only exists in a dependency must not count as the project's test.
  writeFileSync(join(root, 'node_modules', 'x', 'index.js'), 'function TestGhost() {}\n');
  return root;
}

const GATES = ['build', 'secret scan', 'vulnerable deps'];

test('parseRefs reads names, file:name, files, gates and acceptances', () => {
  assert.deepEqual(parseRefs('`TestA`').map((r) => r.kind), ['name']);
  assert.deepEqual(parseRefs('a/b_test.go:TestA, gate:DAST baseline').map((r) => r.kind), ['file', 'gate']);
  assert.equal(parseRefs('web/src/x.test.tsx')[0].kind, 'file');
  assert.equal(parseRefs('accepted: Luan')[0].who, 'Luan');
  assert.deepEqual(parseRefs('N/A'), []);
});

test('a fully traced model passes, by name at G2 and in the source at G8', () => {
  assert.deepEqual(trace(model(GOOD), { gates: GATES }).problems, []);
  assert.deepEqual(trace(model(GOOD), { source: source(), gates: GATES }).problems, []);
});

test('a threat with no test, no id, or no control is reported', () => {
  const rows = [
    '| THR-001 | B1 | Spoofing | x | low | high | control | here |  |',
    '|  | B1 | Tampering | y | low | high | control | here | TestY |',
    '| THR-003 | B1 | Repudiation | z | low | high | TBD | here | TestZ |',
  ];
  const reasons = trace(model(rows)).problems.map((p) => `${p.id}: ${p.reason}`);
  assert.deepEqual(reasons, ['THR-001: no test named', 'row 2: no THR-NNN id', 'THR-003: no control named in Mitigation']);
});

test('at G8 a test that is not in the source, or only in node_modules, is reported', () => {
  const rows = [
    ...GOOD.slice(0, 1),
    '| THR-002 | B1 | Tampering | x | low | high | control | here | TestGhost |',
    '| THR-005 | B1 | Tampering | x | low | high | control | here | internal/release/repo_test.go:TestMissing |',
    '| THR-006 | B1 | Tampering | x | low | high | control | here | internal/none_test.go |',
  ];
  const reasons = trace(model(rows), { source: source() }).problems.map((p) => p.reason);
  assert.equal(reasons.length, 3, JSON.stringify(reasons));
  assert.match(reasons[0], /TestGhost.*not found/);
  assert.match(reasons[1], /TestMissing.*not found/);
  assert.match(reasons[2], /does not exist/);
});

test('an unknown gate, an acceptance with no residual entry, a missing Test column', () => {
  const r1 = trace(model(['| THR-001 | B | S | x | l | h | c | e | gate:Pentest |']), { gates: GATES }).problems;
  assert.match(r1[0].reason, /not in DEV-PROFILE/);
  const r2 = trace(model(['| THR-009 | B | S | x | l | h | c | e | accepted: Luan |'], 'nothing'), {}).problems;
  assert.match(r2[0].reason, /Residual risk/);
  const old = model([]).replace('| Id | Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at | Test |\n|---|---|---|---|---|---|---|---|---|\n',
    '| Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at |\n|---|---|---|---|---|---|---|\n| B1 | Spoofing | x | low | high | control | G7 (tests) |\n');
  const r3 = trace(old).problems.map((p) => p.reason);
  assert.match(r3[0], /no `Test` column/);
});

test('profileGates reads the gate names from DEV-PROFILE §Quality gates', () => {
  const gates = profileGates('## Quality gates\n\n| Gate | Command | Threshold |\n|---|---|---|\n| Secret scan | `gitleaks` | 0 |\n| DAST baseline | zap | 0 high |\n');
  assert.deepEqual(gates, ['secret scan', 'dast baseline']);
});

test('the CLI exits 1 on an untraced threat and 0 when all are traced', () => {
  const dev = mkdtempSync(join(tmpdir(), 'sdlc-thr-dev-'));
  mkdirSync(join(dev, 'design', 'demo'), { recursive: true });
  const path = join(dev, 'design', 'demo', 'threat-model.md');
  writeFileSync(path, model(GOOD));
  const src = source();
  const ok = spawnSync(process.execPath, [SCRIPT, 'demo', '--root', dev, '--source', src], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /4\/4 threat\(s\) traced/);
  writeFileSync(path, model([...GOOD, '| THR-007 | B | S | x | l | h | c | e |  |']));
  const bad = spawnSync(process.execPath, [SCRIPT, 'demo', '--root', dev, '--source', src, '--json'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).problems[0].id, 'THR-007');
});

// §17 fixtures (kept outside fixtures/valid, which lint-dev reads as a dev root): the check must
// catch the broken model and leave the valid one alone.
const FIX = join(here, 'fixtures');
const read = (p) => readFileSync(p, 'utf8');

test('fixture: the valid threat model traces in full, against its source', () => {
  const r = trace(read(join(FIX, 'threat-trace', 'valid', 'threat-model.md')), {
    source: join(FIX, 'threat-trace', 'valid', 'src'), gates: ['dast baseline'],
  });
  assert.deepEqual(r.problems, []);
  assert.equal(r.threats, 4);
});

test('fixture: the release-management shape — mitigations naming "G7 (… tests)" — is caught', () => {
  const r = trace(read(join(FIX, 'threat-trace', 'broken', 'threat-model.md')));
  assert.match(r.problems[0].reason, /no `Test` column/);
  assert.deepEqual(r.problems.slice(1).map((p) => p.reason), ['no THR-NNN id', 'no THR-NNN id']);
});

// --done: the G7 merge check judges only the threats a finished task promised.
const TASKS = `## Tasks

| Id | Title | Files | Depends on | Status |
|---|---|---|---|---|
| TASK-001 | sign-in (THR-001) | a | none | todo |
| \`TASK-002\` | export guard, THR-005 and THR-006 | b | none | todo |
| TASK-003 | later, THR-007 | c | none | todo |
`;
const PROGRESS = (rows) => `| Task | Status | Commit | Note |\n|---|---|---|---|\n${rows.join('\n')}\n`;

test('doneThreats: the THR ids in the rows of done tasks only, by their latest progress row', () => {
  const ids = doneThreats(TASKS, PROGRESS(['| TASK-001 | done | a1 | |', '| TASK-002 | done | b1 | |', '| TASK-002 | reopened | b2 | |', '| TASK-003 | in progress | c1 | |']));
  assert.deepEqual([...ids], ['THR-001']);
  assert.deepEqual([...doneThreats(TASKS, PROGRESS(['| TASK-002 | done | b1 | |']))].sort(), ['THR-005', 'THR-006']);
});

test('--done fails on a done task whose threat has no test, and skips threats not due yet', () => {
  const dev = mkdtempSync(join(tmpdir(), 'sdlc-thr-done-'));
  for (const d of ['design/demo', 'plan/demo', 'implementation/demo']) mkdirSync(join(dev, d), { recursive: true });
  writeFileSync(join(dev, 'design', 'demo', 'threat-model.md'), model([
    ...GOOD,
    '| THR-005 | B | T | x | l | h | c | e | internal/none_test.go |',
    '| THR-007 | B | T | x | l | h | c | e | TestNotWrittenYet |',
  ]));
  writeFileSync(join(dev, 'plan', 'demo', 'tasks.md'), TASKS);
  const src = source();
  const run = (rows) => {
    writeFileSync(join(dev, 'implementation', 'demo', 'progress.md'), PROGRESS(rows));
    return spawnSync(process.execPath, [SCRIPT, 'demo', '--root', dev, '--source', src, '--done'], { encoding: 'utf8' });
  };
  const early = run(['| TASK-001 | done | a1 | |']);
  assert.equal(early.status, 0, early.stdout);
  assert.match(early.stdout, /1\/1 threat\(s\) promised by done tasks \(5 not due yet\)/);
  const due = run(['| TASK-001 | done | a1 | |', '| TASK-002 | done | b1 | |']);
  assert.equal(due.status, 1);
  assert.match(due.stdout, /THR-005 +test file `internal\/none_test.go` does not exist/);
  assert.doesNotMatch(due.stdout, /THR-007/);
  const usage = spawnSync(process.execPath, [SCRIPT, 'demo', '--root', dev, '--done'], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /--done needs --source/);
});
