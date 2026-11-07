/**
 * L1 + L2 for the state builder (docs/test-plan.md).
 *
 * The valid corpus is small on purpose, but it is chosen to exercise the three rules that are easy
 * to get subtly wrong and impossible to notice by eye: the latest attempt wins, findings close by
 * id rather than in bulk, and staleness propagates forwards from a changed input.
 *
 *   node --test tests/
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildState } from '../workspace/dev/scripts/build-state.mjs';
import { hashArtifact, hashRef, parseDoc, readTable, sha256 } from '../workspace/dev/scripts/lib/doc.mjs';
import { SAMPLE_PATH, renderSample } from './regen-sample.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, 'fixtures', 'valid');

function scratchCorpus() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-corpus-'));
  const root = join(dir, 'dev');
  cpSync(CORPUS, root, { recursive: true });
  return root;
}

function stageOf(state, gate) {
  return state.initiatives[0].stages.find((s) => s.gate === gate);
}

test('L1-27 the latest attempt wins, and earlier ones stay on disk', () => {
  const state = buildState(CORPUS);
  const g1 = stageOf(state, 'G1');
  assert.equal(g1.state, 'PASS');
  assert.equal(g1.attempt, 2);
  assert.match(g1.log, /20260916-141855-b09e-a2/, 'attempt 2 wins, though its filename sorts first');
});

test('attempt 2 wins even though its filename sorts before attempt 1', () => {
  // Found in the live shakedown. A second round writes a new log, and §1 gives the whole stage
  // execution one run-id, so attempt 2 can only differ by a suffix — and `-` (0x2D) sorts before
  // `.` (0x2E). The old filename comparison therefore handed the gate to attempt 1, meaning the
  // CHANGES_REQUESTED outranked the PASS that resolved it and the ladder would never move.
  const a1 = 'G1-requirements-20260916-141855-b09e.md';
  const a2 = 'G1-requirements-20260916-141855-b09e-a2.md';
  assert.ok(a2 < a1, 'the trap: the newer log really does sort first');

  const g1 = stageOf(buildState(CORPUS), 'G1');
  assert.equal(g1.attempt, 2);
  assert.equal(g1.state, 'PASS', 'ordering by attempt, not by filename');
});

test('findings close by id — a resolved CR does not stay open', () => {
  const state = buildState(CORPUS);
  const g1 = stageOf(state, 'G1');
  // CR-002 and CR-003 were RESOLVED in attempt 2; CR-004 was raised there and is still open.
  assert.deepEqual(g1.open_findings, ['CR-004']);
});

test('L1-23 a changed input makes the gate STALE and names the file', () => {
  const state = buildState(CORPUS);
  const g2 = stageOf(state, 'G2');
  assert.equal(g2.state, 'STALE');
  assert.equal(g2.stale_because[0].path, 'dev/requirements/demo/requirements.md');
  assert.equal(g2.stale_because[0].role, 'input');
});

test('L1-23 staleness propagates forwards, including over a SKIPPED gate', () => {
  const state = buildState(CORPUS);
  assert.equal(stageOf(state, 'G5').state, 'STALE');
  assert.equal(stageOf(state, 'G6').state, 'STALE');
  assert.match(stageOf(state, 'G6').stale_because[0].path, /upstream G2/);
});

test('current_gate is the first gate that does not open the next one', () => {
  const state = buildState(CORPUS);
  assert.equal(state.initiatives[0].current_gate, 'G2');
});

test('L1-25 a SKIPPED verdict carries its typed reason', () => {
  const root = scratchCorpus();
  // Repair G2's deliberately-wrong input hash so nothing downstream is stale, and G5 can be seen
  // in its own right rather than through the propagation rule.
  const g2Path = join(root, 'reviews', 'demo', 'G2-design-20260917-101422-7c15.md');
  const reqHash = parseDoc(readFileSync(join(root, 'requirements', 'demo', 'requirements.md'), 'utf8')).bodyHash;
  writeFileSync(g2Path, readFileSync(g2Path, 'utf8').replace(/0000ade1\S+/, reqHash));

  const state = buildState(root);
  assert.equal(stageOf(state, 'G2').state, 'PASS');
  const g5 = stageOf(state, 'G5');
  assert.equal(g5.state, 'SKIPPED');
  assert.equal(g5.skip_reason.type, 'NOT_APPLICABLE');
  assert.match(g5.skip_reason.explanation, /no user-facing surface/i);
  assert.equal(state.initiatives[0].current_gate, 'G3', 'SKIPPED opens the next gate, like PASS');
});

test('L1-20/21 hashing covers the body only — front matter churn does not invalidate a review', () => {
  const root = scratchCorpus();
  const path = join(root, 'intake', 'demo', 'problem.md');
  const original = readFileSync(path, 'utf8');

  writeFileSync(path, original.replace('updated: 2026-09-16', 'updated: 2026-12-31'));
  assert.equal(stageOf(buildState(root), 'G0').state, 'PASS', 'a front-matter touch must not go stale');

  writeFileSync(path, original.replace('47 near-duplicate', '48 near-duplicate'));
  assert.equal(stageOf(buildState(root), 'G0').state, 'STALE', 'a body edit must go stale');
});

test('L1-22 CRLF and trailing whitespace hash identically', () => {
  const text = '## A\n\nline one\nline two\n';
  assert.equal(sha256(text), sha256(text.replace(/\n/g, '\r\n')));
  assert.equal(sha256(text), sha256(text.replace(/line one/, 'line one   ')));
});

test('L1-28 a gate log referencing a missing artifact does not silently pass', () => {
  const root = scratchCorpus();
  writeFileSync(join(root, 'intake', 'demo', 'problem.md'), '');
  const g0 = stageOf(buildState(root), 'G0');
  assert.equal(g0.state, 'STALE');
  assert.equal(g0.stale_because[0].role, 'output');
});

test('L1-29 derivation is idempotent apart from the timestamp', () => {
  const a = buildState(CORPUS, new Date('2026-01-01T00:00:00Z'));
  const b = buildState(CORPUS, new Date('2026-06-01T00:00:00Z'));
  assert.equal(a.source_hash, b.source_hash);
  assert.deepEqual({ ...a, generated_at: null }, { ...b, generated_at: null });
});

test('tasks, requirements and decisions are read from their tables', () => {
  const state = buildState(CORPUS);
  const i = state.initiatives[0];
  assert.equal(i.change_class, 'change', 'declared at intake, per §15.1');
  assert.deepEqual(i.tasks.map((t) => t.status), ['done', 'done', 'in-progress', 'todo']);
  assert.deepEqual(i.requirements.find((r) => r.id === 'REQ-002').tasks, ['TASK-003']);
  assert.equal(i.decisions.find((d) => d.id === 'DEC-001').status, 'open');
  assert.equal(i.decisions.find((d) => d.id === 'DEC-002').answer, '20');
});

test('execution status comes from progress.md, the last row for a task winning', () => {
  const tasks = buildState(CORPUS).initiatives[0].tasks;
  // tasks.md says todo for all four; progress.md moved three of them.
  assert.deepEqual(tasks.map((t) => [t.id, t.status, t.commit ?? null]), [
    ['TASK-001', 'done', '3f9c2a1'],
    ['TASK-002', 'done', '7b41e0d'],
    ['TASK-003', 'in-progress', null],
    ['TASK-004', 'todo', null],
  ]);
});

test('without progress.md, task status falls back to the tasks.md Status column', () => {
  const root = scratchCorpus();
  rmSync(join(root, 'implementation', 'demo', 'progress.md'));
  const tasks = buildState(root).initiatives[0].tasks;
  assert.deepEqual(tasks.map((t) => t.status), ['todo', 'todo', 'todo', 'todo']);
});

test('recording a task done in progress.md never stales G6; editing tasks.md does', () => {
  const root = scratchCorpus();
  // Repair G2's deliberately wrong input hash so G6 is PASS on its own merits.
  const g2Path = join(root, 'reviews', 'demo', 'G2-design-20260917-101422-7c15.md');
  const reqHash = parseDoc(readFileSync(join(root, 'requirements', 'demo', 'requirements.md'), 'utf8')).bodyHash;
  writeFileSync(g2Path, readFileSync(g2Path, 'utf8').replace(/0000ade1\S+/, reqHash));
  assert.equal(stageOf(buildState(root), 'G6').state, 'PASS');

  const progress = join(root, 'implementation', 'demo', 'progress.md');
  writeFileSync(progress, `${readFileSync(progress, 'utf8')}| TASK-003 | done | 9e0f114 | — |\n`);
  const after = buildState(root);
  assert.equal(stageOf(after, 'G6').state, 'PASS', 'progress.md is not a gate input or output');
  assert.equal(after.initiatives[0].tasks[2].status, 'done');

  const tasks = join(root, 'plan', 'demo', 'tasks.md');
  writeFileSync(tasks, readFileSync(tasks, 'utf8').replace('| handler_list_test.go | M | todo |', '| handler_list_test.go | M | done |'));
  assert.equal(stageOf(buildState(root), 'G6').state, 'STALE', 'the reviewed plan is hashed');
});

// -----------------------------------------------------------------------------------------------
// Slice mode (§5.5): slice logs never decide G7, and lane fragments are not its output.
// -----------------------------------------------------------------------------------------------

/** The corpus with G2's deliberately wrong input hash repaired, so G6 is PASS on its own merits. */
function healthyCorpus() {
  const root = scratchCorpus();
  const g2Path = join(root, 'reviews', 'demo', 'G2-design-20260917-101422-7c15.md');
  const reqHash = parseDoc(readFileSync(join(root, 'requirements', 'demo', 'requirements.md'), 'utf8')).bodyHash;
  writeFileSync(g2Path, readFileSync(g2Path, 'utf8').replace(/0000ade1\S+/, reqHash));
  return root;
}

function writeLog(root, { gate, stage, runId, verdict, scope, outputs = [], inputs = [], revalidatedFrom = null, body = '' }) {
  const refs = (list) => list.map((p) => `  - path: dev/${p}\n    sha256: ${hashRef(join(root, p))}`).join('\n');
  const text = [
    '---', 'slug: demo', `gate: ${gate}`, ...(scope ? [`scope: ${scope}`] : []), `stage: ${stage}`, `run_id: ${runId}`, 'attempt: 1',
    `verdict: ${verdict}`, `reviewer: dev-reviewing-${stage}`, `inputs:${inputs.length ? `\n${refs(inputs)}` : ''}`,
    `outputs:${outputs.length ? `\n${refs(outputs)}` : ''}`, 'findings: { blocker: 0, major: 0, minor: 0, info: 0 }', 'unlocks: none',
    'skip_reason: null', 'override: null', `revalidated_from: ${revalidatedFrom ?? 'null'}`, '---', '', body || '## Scope\n\nA fixture.', '',
  ].join('\n');
  const file = join(root, 'reviews', 'demo', `${gate}-${stage}-${runId}.md`);
  writeFileSync(file, text);
  return `dev/reviews/demo/${gate}-${stage}-${runId}.md`;
}

function implementationFiles(root) {
  mkdirSync(join(root, 'implementation', 'demo', 'lanes'), { recursive: true });
  writeFileSync(join(root, 'implementation', 'demo', 'change-summary.md'), '---\nslug: demo\n---\n## Tasks completed\n\nTASK-001, TASK-002.\n');
  writeFileSync(join(root, 'implementation', 'demo', 'lanes', 'lane-a.md'), '---\nslug: demo\n---\n## Tasks completed\n\nTASK-001.\n');
}

test('a slice log never decides G7; the final log does', () => {
  const root = healthyCorpus();
  implementationFiles(root);
  writeLog(root, { gate: 'G7', stage: 'implementation', runId: '20260921-090000-5a1c', verdict: 'CHANGES_REQUESTED', scope: 'slice-1', outputs: ['implementation/demo/lanes/lane-a.md'] });
  assert.equal(stageOf(buildState(root), 'G7').state, 'AUTHORING', 'slice reviews alone are not a G7 verdict');

  const final = writeLog(root, { gate: 'G7', stage: 'implementation', runId: '20260920-090000-0b0b', verdict: 'PASS', outputs: ['implementation/demo/change-summary.md'] });
  const g7 = stageOf(buildState(root), 'G7');
  assert.equal(g7.state, 'PASS', 'the final log is in force although the slice log is newer');
  assert.equal(g7.log, final);
  assert.deepEqual(g7.slices.map((s) => [s.scope, s.state]), [['slice-1', 'CHANGES_REQUESTED']]);
  assert.equal(stageOf(buildState(root), 'G6').slices, undefined, 'only a gate with slice logs carries the field');
});

test('a lane fragment listed by a G7 log is not its output', () => {
  const root = healthyCorpus();
  implementationFiles(root);
  mkdirSync(join(root, 'implementation', 'demo', 'notes'), { recursive: true });
  writeFileSync(join(root, 'implementation', 'demo', 'notes', 'risk.md'), '---\nslug: demo\n---\n## Risk\n\nlow\n');
  writeLog(root, { gate: 'G7', stage: 'implementation', runId: '20260920-090000-0b0b', verdict: 'PASS', outputs: ['implementation/demo/change-summary.md', 'implementation/demo/lanes/lane-a.md', 'implementation/demo/notes/risk.md'] });
  assert.deepEqual(stageOf(buildState(root), 'G7').outputs.map((o) => o.path), ['dev/implementation/demo/notes/risk.md']);

  writeFileSync(join(root, 'implementation', 'demo', 'lanes', 'lane-a.md'), '---\nslug: demo\n---\n## Tasks completed\n\nTASK-001, consolidated.\n');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS', 'a fragment is the per-lane record, not what G7 judged');

  // The change summary is generated from the code (§5.5); regenerating it never stales G7.
  writeFileSync(join(root, 'implementation', 'demo', 'change-summary.md'), '---\nslug: demo\n---\n## Tasks completed\n\nTASK-001 only.\n');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS', 'a regenerated change summary is not an edit to what G7 judged');

  writeFileSync(join(root, 'implementation', 'demo', 'notes', 'risk.md'), '---\nslug: demo\n---\n## Risk\n\nhigh\n');
  assert.equal(stageOf(buildState(root), 'G7').state, 'STALE', 'any other output still counts');
});

/** A git repo around the corpus, with one source file outside dev/. Returns the git runner. */
function codeRepo(root) {
  const repo = dirname(root);
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe', encoding: 'utf8' }).trim();
  writeFileSync(join(repo, 'main.go'), 'package main\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'reviewed');
  return git;
}

const g7WithCommit = (root, sha) => {
  const path = writeLog(root, { gate: 'G7', stage: 'implementation', runId: '20260920-090000-0b0b', verdict: 'PASS', outputs: ['implementation/demo/lanes/lane-a.md'] });
  const abs = join(dirname(root), path);
  writeFileSync(abs, readFileSync(abs, 'utf8').replace('revalidated_from: null\n', `revalidated_from: null\nreviewed_commit: ${sha}\n`));
};

test('a G7 PASS with reviewed_commit goes STALE when code outside dev/ changes after that commit', () => {
  const root = healthyCorpus();
  implementationFiles(root);
  const git = codeRepo(root);
  const reviewed = git('rev-parse', 'HEAD');
  g7WithCommit(root, reviewed);
  git('add', '-A');
  git('commit', '-q', '-m', 'G7 PASS');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS');

  // Workspace churn under dev/ is not code.
  writeFileSync(join(root, 'implementation', 'demo', 'change-summary.md'), '---\nslug: demo\n---\n## Tasks completed\n\nregenerated\n');
  git('commit', '-q', '-am', 'regenerate summary');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS', 'a commit that touches only dev/ is not a code change');

  writeFileSync(join(dirname(root), 'main.go'), 'package main\n\nfunc main() {}\n');
  git('commit', '-q', '-am', 'code after review');
  const g7 = stageOf(buildState(root), 'G7');
  assert.equal(g7.state, 'STALE');
  assert.deepEqual(g7.stale_because, [{ path: 'code', was: reviewed, now: git('rev-parse', 'HEAD'), role: 'output' }]);
  assert.equal(stageOf(buildState(root), 'G8').state, 'NOT_STARTED');
});

test('a bundle update under .claude/ is not a code change: G7 with reviewed_commit stays PASS', () => {
  // Found on release-management: installing the improved bundle (.claude/agents, DEV-CONTRACTS.md,
  // the install manifest) would have staled the final G7 and put the bundle into the re-review diff.
  const root = healthyCorpus();
  implementationFiles(root);
  const git = codeRepo(root);
  g7WithCommit(root, git('rev-parse', 'HEAD'));
  git('add', '-A');
  git('commit', '-q', '-m', 'G7 PASS');
  mkdirSync(join(dirname(root), '.claude', 'agents'), { recursive: true });
  writeFileSync(join(dirname(root), '.claude', 'agents', 'dev-new.md'), 'new agent\n');
  writeFileSync(join(dirname(root), '.claude', '.agentic-fx.json'), '{}\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore(sdlc): update the bundle');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS');
});

test('reviewed_commit that git does not know, or no git at all, leaves G7 as it is', () => {
  const root = healthyCorpus();
  implementationFiles(root);
  g7WithCommit(root, 'deadbeef'.repeat(5));
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS', 'no git: the check cannot run');

  const git = codeRepo(root);
  writeFileSync(join(dirname(root), 'main.go'), 'package main\n\n// later\n');
  git('commit', '-q', '-am', 'code');
  assert.equal(stageOf(buildState(root), 'G7').state, 'PASS', 'an unknown commit: the check cannot run');
});

test('staleness follows the dependency graph: a stale G3 does not stale its siblings G4 and G5', () => {
  // §4.2 makes G3, G4 and G5 siblings under G2. Propagating in ladder order marked G4 and G5 STALE
  // whenever G3 was, although neither read anything G3 produced.
  const root = healthyCorpus();
  for (const [dir, file] of [['data', 'data-model.md'], ['api', 'contract-diff.md']]) {
    mkdirSync(join(root, dir, 'demo'), { recursive: true });
    writeFileSync(join(root, dir, 'demo', file), `---\nslug: demo\n---\n## Body\n\n${file}\n`);
  }
  writeLog(root, { gate: 'G3', stage: 'data', runId: '20260917-120000-3333', verdict: 'PASS', inputs: ['design/demo/architecture.md'], outputs: ['data/demo/data-model.md'] });
  writeLog(root, { gate: 'G4', stage: 'api', runId: '20260917-130000-4444', verdict: 'PASS', inputs: ['design/demo/architecture.md'], outputs: ['api/demo/contract-diff.md'] });
  assert.deepEqual(['G3', 'G4', 'G5', 'G6'].map((g) => stageOf(buildState(root), g).state), ['PASS', 'PASS', 'SKIPPED', 'PASS']);

  writeFileSync(join(root, 'data', 'demo', 'data-model.md'), '---\nslug: demo\n---\n## Body\n\nedited after review\n');
  const state = buildState(root);
  assert.deepEqual(['G3', 'G4', 'G5', 'G6', 'G7'].map((g) => stageOf(state, g).state), ['STALE', 'PASS', 'SKIPPED', 'STALE', 'AUTHORING']);
  assert.match(stageOf(state, 'G6').stale_because[0].path, /upstream G3/);
});

test('a stale G2 still reaches G6 when G3 and G4 have not started', () => {
  // The graph is walked over ancestors, not just direct parents, so an unstarted sibling is no gap.
  const state = buildState(CORPUS);
  assert.equal(stageOf(state, 'G3').state, 'NOT_STARTED');
  assert.equal(stageOf(state, 'G6').state, 'STALE');
  assert.match(stageOf(state, 'G6').stale_because[0].path, /upstream G2/);
});

// -----------------------------------------------------------------------------------------------
// Decision-ledger inputs scoped to the rows a gate relied on (§5.2).
// -----------------------------------------------------------------------------------------------

function ledgerCorpus() {
  const root = healthyCorpus();
  mkdirSync(join(root, 'data', 'demo'), { recursive: true });
  writeFileSync(join(root, 'data', 'demo', 'data-model.md'), '---\nslug: demo\n---\n## Body\n\nmodel\n');
  // G3 cites only DEC-002; G4 lists the whole ledger, as every log written before this rule does.
  writeLog(root, { gate: 'G3', stage: 'data', runId: '20260917-120000-3333', verdict: 'PASS', inputs: ['design/demo/architecture.md', 'decisions/demo.md#DEC-002'], outputs: ['data/demo/data-model.md'] });
  writeLog(root, { gate: 'G4', stage: 'api', runId: '20260917-130000-4444', verdict: 'PASS', inputs: ['design/demo/architecture.md', 'decisions/demo.md'], outputs: ['data/demo/data-model.md'] });
  return root;
}

const editLedger = (root, mutate) => {
  const p = join(root, 'decisions', 'demo.md');
  const before = readFileSync(p, 'utf8');
  assert.notEqual(mutate(before), before, 'the ledger edit must change the file');
  writeFileSync(p, mutate(before));
};

test('a new DEC row stales only gates that list the whole ledger', () => {
  const root = ledgerCorpus();
  assert.deepEqual(['G3', 'G4'].map((g) => stageOf(buildState(root), g).state), ['PASS', 'PASS']);
  editLedger(root, (s) => s.replace('| DEC-002 |', '| DEC-003 | A new question? | why | a · b | a | none | open | — |\n| DEC-002 |'));
  const state = buildState(root);
  assert.equal(stageOf(state, 'G3').state, 'PASS', 'G3 cites only DEC-002');
  assert.equal(stageOf(state, 'G4').state, 'STALE', 'a whole-file input keeps whole-file semantics');
});

test('answering a DEC stales only the gates that cite it', () => {
  const root = ledgerCorpus();
  editLedger(root, (s) => s.replace('| TASK-003 | open | — |', '| TASK-003 | answered | title only — Lan |'));
  assert.equal(stageOf(buildState(root), 'G3').state, 'PASS', 'DEC-001 changed; G3 relied on DEC-002 only');

  editLedger(root, (s) => s.replace('| none | answered | 20 |', '| none | answered | 50 |'));
  const g3 = stageOf(buildState(root), 'G3');
  assert.equal(g3.state, 'STALE');
  assert.equal(g3.stale_because[0].path, 'dev/decisions/demo.md#DEC-002');
});

test('realigning the ledger table does not stale a row-scoped input; deleting the row does', () => {
  const root = ledgerCorpus();
  editLedger(root, (s) => s.replace('| DEC-002 | Default page size', '|   DEC-002   |   Default page size'));
  assert.equal(stageOf(buildState(root), 'G3').state, 'PASS');
  editLedger(root, (s) => s.replace(/\| +DEC-002 [^\n]*\n/, ''));
  const g3 = stageOf(buildState(root), 'G3');
  assert.equal(g3.state, 'STALE');
  assert.equal(g3.stale_because[0].now, 'missing');
});

test('--hash prints a row-scoped ledger hash', () => {
  const root = ledgerCorpus();
  const out = execFileSync(process.execPath, [join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs'), '--hash', 'dev/decisions/demo.md#DEC-002'], { cwd: dirname(root), encoding: 'utf8' });
  assert.equal(out, `${hashRef(join(root, 'decisions', 'demo.md#DEC-002'))}  dev/decisions/demo.md#DEC-002\n`);
  assert.notEqual(out.slice(0, 64), hashArtifact(join(root, 'decisions', 'demo.md')));
});

test('a reaffirm log records whether it reaffirmed an own-output edit or an upstream change', () => {
  const root = scratchCorpus();
  const problem = join(root, 'intake', 'demo', 'problem.md');
  writeFileSync(problem, readFileSync(problem, 'utf8').replace('47 near-duplicate', '48 near-duplicate'));
  assert.equal(stageOf(buildState(root), 'G0').state, 'STALE');

  writeLog(root, {
    gate: 'G0', stage: 'intake', runId: '20260919-080000-9c9c', verdict: 'PASS', outputs: ['intake/demo/problem.md'],
    revalidatedFrom: 'dev/reviews/demo/G0-intake-20260916-091203-3f2a.md', body: '## Scope\n\n```diff\n- 47\n+ 48\n```',
  });
  const g0 = stageOf(buildState(root), 'G0');
  assert.equal(g0.state, 'PASS');
  assert.equal(g0.revalidated_scope, 'own-output');
});

test('Depends on is parsed into state.json as depends_on', () => {
  const tasks = buildState(CORPUS).initiatives[0].tasks;
  assert.deepEqual(
    tasks.map((t) => [t.id, t.depends_on]),
    [['TASK-001', []], ['TASK-002', ['TASK-001']], ['TASK-003', ['TASK-002']], ['TASK-004', ['TASK-003']]],
  );
});

test('an open decision that blocks only a task does not block the initiative', () => {
  const state = buildState(CORPUS);
  // DEC-001 blocks TASK-003, not a gate. A question worth asking is not a reason to stop.
  assert.equal(state.initiatives[0].blocked, false);
});

test('the table reader ignores separator rows and empty cells', () => {
  const rows = readTable('## Tasks\n\n| Id | Task |\n|---|---|\n| TASK-001 | Do it |\n|  |  |\n', 'Tasks');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'TASK-001');
});

test('a markdown artifact is hashed over its body, a yaml contract over the whole file', () => {
  // The distinction is DEV-CONTRACTS §5.2, and the trap is an OpenAPI document that legitimately
  // opens with `---`. Deciding by extension rather than by content is what stops the first stanza
  // of a contract being silently excluded from the hash a gate recorded a PASS over.
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-hash-'));
  const body = ['openapi: 3.1.0', 'info:', '  title: Jobs', ''].join('\n');

  const md = join(dir, 'a.md');
  writeFileSync(md, ['---', 'slug: demo', '---', body].join('\n'), 'utf8');
  assert.equal(hashArtifact(md), sha256(body), 'markdown: front matter is excluded');

  // Two YAML documents in one file, which is ordinary and is the case that bites: read as markdown
  // this parses as front matter `openapi…title: Jobs` plus a body of `components: {}`, so the hash
  // would cover only the tail and a gate could record a PASS over a contract whose first document
  // it never saw. A one-document file cannot catch that — both paths agree on it.
  const yaml = join(dir, 'openapi.yaml');
  const whole = ['---', 'openapi: 3.1.0', 'info:', '  title: Jobs', '---', 'components: {}', ''].join('\n');
  writeFileSync(yaml, whole, 'utf8');
  assert.equal(whole.split('\n---').length, 2, 'the fixture must really hold two documents');
  assert.equal(hashArtifact(yaml), sha256(whole), 'yaml: nothing is excluded');
  assert.notEqual(hashArtifact(yaml), parseDoc(whole).bodyHash, 'yaml must not be read as front matter');
});

test('GK is a gate: its state comes from its log, not from the cards being present', () => {
  const state = buildState(CORPUS);
  const k = state.knowledge;
  assert.equal(k.gate, 'GK');
  assert.equal(k.stage, 'knowledge');
  assert.equal(k.state, 'PASS', 'the GK log says PASS');
  assert.match(k.log, /_repo\/GK-knowledge-20260915-093012-1a4e/);
  // A MINOR finding is recorded and carried, and does not block the verdict (§5.3).
  assert.deepEqual(k.open_findings, ['CR-101']);
  assert.equal(k.cards.length, 1);
});

test('the reserved _repo folder is not an initiative', () => {
  const state = buildState(CORPUS);
  // Without the underscore rule the knowledge track shows up on the board as an initiative with
  // twelve gates that will never run — visible, wrong, and permanent.
  assert.deepEqual(state.initiatives.map((i) => i.slug), ['demo']);
});

test('editing a knowledge card after its review makes GK STALE', () => {
  const root = scratchCorpus();
  const card = join(root, 'knowledge', 'codebase-map.md');
  writeFileSync(card, `${readFileSync(card, 'utf8')}\nA line added after the review.\n`, 'utf8');

  const k = buildState(root).knowledge;
  assert.equal(k.state, 'STALE', 'the reviewed card is not the card on disk');
  assert.equal(k.stale_because[0].role, 'output');
  assert.match(k.stale_because[0].path, /codebase-map\.md$/);
});

test('cards written but never reviewed are AUTHORING, not PASS', () => {
  const root = scratchCorpus();
  rmSync(join(root, 'reviews', '_repo'), { recursive: true, force: true });

  const k = buildState(root).knowledge;
  // The distinction the old `PRESENT` state could not make: six confidently wrong cards exist too.
  assert.equal(k.state, 'AUTHORING');
  assert.equal(k.log, null);
  assert.equal(k.cards.length, 1, 'the cards are still indexed — they are just unreviewed');
});

test('the extension sample is the state the builder actually emits', () => {
  // The sample was hand-written once and silently fell three fields behind the builder, so the
  // extension was tested against a shape that no longer existed. Regenerating it is cheap; noticing
  // that it drifted is not, which is why this test exists rather than a convention.
  const onDisk = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
  assert.deepEqual(onDisk, renderSample(), 'stale sample — run `node tests/regen-sample.mjs`');
});

// -----------------------------------------------------------------------------------------------
// The index is committed (§8) and CI compares a rebuild against the committed copy. A timestamp
// that moves on every run would make that comparison fail every time, which is the same as not
// having it. These two tests pin both halves: it must not rewrite for nothing, and it must
// rewrite when something real changed.
// -----------------------------------------------------------------------------------------------

test('rebuilding an unchanged corpus does not touch the index', () => {
  const root = scratchCorpus();
  const repo = dirname(root);
  const statePath = join(root, 'state.json');
  const dashPath = join(root, 'DASHBOARD.md');

  const run = () =>
    execFileSync(process.execPath, [join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs'), '--quiet'], {
      cwd: repo,
    });

  run();

  // Two runs in the same second produce the same timestamp anyway, so comparing them would pass
  // whether or not the guard exists. Backdating the committed copy is what makes the assertion
  // real: a rebuild that rewrites for nothing will replace this marker with `now`.
  const MARKER = '2001-01-01T00:00:00Z';
  writeFileSync(statePath, readFileSync(statePath, 'utf8').replace(/"generated_at": "[^"]*"/, `"generated_at": "${MARKER}"`));
  writeFileSync(dashPath, readFileSync(dashPath, 'utf8').replace(/^Generated \S+/m, `Generated ${MARKER}`));

  run();

  assert.match(readFileSync(statePath, 'utf8'), new RegExp(MARKER), 'state.json was rewritten with nothing to say');
  assert.match(readFileSync(dashPath, 'utf8'), new RegExp(MARKER), 'DASHBOARD.md was rewritten with nothing to say');

  rmSync(repo, { recursive: true, force: true });
});

test('a new builder version rewrites the dashboard, though no gate moved', () => {
  // release-management kept "builder 1.2.1" on its dashboard after the 1.5.0 install: the compare
  // blanked the whole Generated line, version included, so the file was never rewritten.
  const root = scratchCorpus();
  const repo = dirname(root);
  const dashPath = join(root, 'DASHBOARD.md');
  const run = () =>
    execFileSync(process.execPath, [join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs'), '--quiet'], { cwd: repo });
  run();
  writeFileSync(dashPath, readFileSync(dashPath, 'utf8').replace(/builder \S+/, 'builder 0.0.1'));
  run();
  assert.doesNotMatch(readFileSync(dashPath, 'utf8'), /builder 0\.0\.1/, 'the old builder version survived a rebuild');
  rmSync(repo, { recursive: true, force: true });
});

test('a gate log that lists progress.md does not go stale when a lane writes a row', () => {
  // progress.md is not gated (§8.1); on release-management every lane's progress row staled G6.
  const root = scratchCorpus();
  const progress = join(root, 'implementation', 'demo', 'progress.md');
  mkdirSync(dirname(progress), { recursive: true });
  writeFileSync(progress, '# Progress\n\n| Task | Status |\n|---|---|\n');
  const g6 = join(root, 'reviews', 'demo', 'G6-plan-20260918-104512-0e91.md');
  writeFileSync(g6, readFileSync(g6, 'utf8').replace(/\r\n/g, '\n').replace('inputs:\n', `inputs:\n  - path: dev/implementation/demo/progress.md\n    sha256: ${sha256('stale on purpose')}\n`));
  const g6Stage = stageOf(buildState(root), 'G6');
  assert.ok(!(g6Stage.inputs ?? []).some((r) => /progress\.md$/.test(r.path)), 'progress.md is not a gate input');
  assert.ok(!(g6Stage.stale_because ?? []).some((r) => /progress\.md$/.test(r.path)), JSON.stringify(g6Stage.stale_because));
  rmSync(dirname(root), { recursive: true, force: true });
});

test('a real change still rewrites the index', () => {
  const root = scratchCorpus();
  const repo = dirname(root);
  const statePath = join(root, 'state.json');

  const run = () =>
    execFileSync(process.execPath, [join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs'), '--quiet'], {
      cwd: repo,
    });

  run();
  const before = readFileSync(statePath, 'utf8');

  // Removing a gate log changes a gate's state, which is content, not metadata.
  rmSync(join(root, 'reviews', 'demo'), { recursive: true, force: true });
  run();

  assert.notEqual(readFileSync(statePath, 'utf8'), before, 'the index ignored a change it must record');

  rmSync(repo, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------------------------
// A whole-ledger input is read as the rows the log relied on (§5.2), found in git history.
// -----------------------------------------------------------------------------------------------

function gitRepo(dir) {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'reviewed');
  return git;
}

/** G4 lists the whole ledger; its body cites `cites`. The reviewed ledger is committed. */
function wholeLedgerRepo(body) {
  const root = ledgerCorpus();
  writeLog(root, { gate: 'G4', stage: 'api', runId: '20260917-130000-4444', verdict: 'PASS', inputs: ['design/demo/architecture.md', 'decisions/demo.md'], outputs: ['data/demo/data-model.md'], body });
  gitRepo(dirname(root));
  return root;
}

const NEW_ROW = (s) => s.replace('| DEC-002 |', '| DEC-003 | A new question? | why | a · b | a | none | open | — |\n| DEC-002 |');

test('a new DEC row does not stale a whole-ledger input whose log cites other rows', () => {
  const root = wholeLedgerRepo('## Scope\n\nThe page size follows DEC-002.');
  editLedger(root, NEW_ROW);
  const g4 = stageOf(buildState(root), 'G4');
  assert.equal(g4.state, 'PASS', JSON.stringify(g4.stale_because));
  assert.deepEqual(g4.inputs.find((i) => i.path === 'dev/decisions/demo.md').rows, ['DEC-002']);

  editLedger(root, (s) => s.replace('| none | answered | 20 |', '| none | answered | 50 |'));
  const after = stageOf(buildState(root), 'G4');
  assert.equal(after.state, 'STALE', 'a relied-on row changed');
  assert.equal(after.stale_because[0].path, 'dev/decisions/demo.md');
});

test('a ledger row whose Blocks names the gate is relied on even when the log does not cite it', () => {
  const root = ledgerCorpus();
  editLedger(root, (s) => s.replace('| TASK-003 | open | — |', '| G4, TASK-003 | open | — |'));
  writeLog(root, { gate: 'G4', stage: 'api', runId: '20260917-130000-4444', verdict: 'PASS', inputs: ['decisions/demo.md'], outputs: ['data/demo/data-model.md'] });
  gitRepo(dirname(root));
  editLedger(root, NEW_ROW);
  assert.equal(stageOf(buildState(root), 'G4').state, 'PASS');
  editLedger(root, (s) => s.replace('| G4, TASK-003 | open | — |', '| G4, TASK-003 | answered | title only — Lan |'));
  assert.equal(stageOf(buildState(root), 'G4').state, 'STALE', 'answering the decision blocking G4 stales it');
});

test('whole-body semantics stay when the log relies on no row, or the reviewed ledger is not in history', () => {
  const root = wholeLedgerRepo('## Scope\n\nNo decision is named here.');
  editLedger(root, NEW_ROW);
  assert.equal(stageOf(buildState(root), 'G4').state, 'STALE', 'no relied-on row: whole-body');

  const loose = ledgerCorpus(); // never committed — no git history to find the reviewed ledger in
  writeLog(loose, { gate: 'G4', stage: 'api', runId: '20260917-130000-4444', verdict: 'PASS', inputs: ['decisions/demo.md'], outputs: ['data/demo/data-model.md'], body: '## Scope\n\nDEC-002.' });
  editLedger(loose, NEW_ROW);
  assert.equal(stageOf(buildState(loose), 'G4').state, 'STALE', 'no reviewed version: whole-body');
});

test('CR-461 --check fails when a fresh derive changes a gate state, not only when the logs moved', () => {
  const root = healthyCorpus();
  const script = join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs');
  const check = () => spawnSync(process.execPath, [script, '--check'], { cwd: dirname(root), encoding: 'utf8' });
  execFileSync(process.execPath, [script, '--quiet'], { cwd: dirname(root) });
  assert.equal(check().status, 0, 'a freshly built index is current');

  // An upstream edit after the index was built: no log changed, so source_hash alone cannot see it.
  const req = join(root, 'requirements', 'demo', 'requirements.md');
  writeFileSync(req, `${readFileSync(req, 'utf8')}\nA late edit.\n`);
  const r = check();
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /demo G2: PASS -> STALE/);
});

// A reviewer that hashed by eye wrote a log that was STALE the moment it landed; found days later,
// nobody could say why. The build that first sees a log now says so.
test('a log that is STALE on its first build is reported, once; with no prior state nothing is', async () => {
  const { bornStale } = await import('../workspace/dev/scripts/build-state.mjs');
  const root = scratchCorpus();
  const builder = join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs');
  const run = () => spawnSync(process.execPath, [builder, '--root', root, '--quiet'], { encoding: 'utf8' });
  const state = buildState(root);
  assert.deepEqual(bornStale(null, state), [], 'a first build has nothing to compare with');
  const g2 = stageOf(state, 'G2').log;
  const prior = structuredClone(state);
  for (const s of prior.initiatives[0].stages) if (s.gate === 'G2') s.log = null;
  const lines = bornStale(prior, state);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.ok(lines[0].includes(`${g2} is STALE as soon as it is written`), lines[0]);
  assert.deepEqual(bornStale(state, state), [], 'a log already seen is not new');
  assert.equal(run().stderr, '', 'first build: no prior state');
  writeFileSync(join(root, 'state.json'), JSON.stringify(prior));
  assert.match(run().stderr, /is STALE as soon as it is written/);
  assert.equal(run().stderr, '', 'reported once');
  rmSync(dirname(root), { recursive: true, force: true });
});
