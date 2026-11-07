/**
 * Batch reaffirm (DEV-CONTRACTS §4.4, `/sdlc-gate <slug> --reaffirm-all`): one reviewer pass over a
 * cascade, one log per gate. The planner must keep out every gate a reaffirm may not accept.
 *
 *   node --test tests/reaffirm-cascade.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEPENDS_ON } from '../workspace/dev/scripts/build-state.mjs';
import { planCascade } from '../workspace/dev/scripts/lib/reaffirm.mjs';
import { parseDoc } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(here, '..', 'workspace', 'dev', 'scripts');
const SCRIPT = join(SCRIPTS, 'reaffirm-check.mjs');

const stale = (gate, because) => ({ gate, state: 'STALE', log: `dev/reviews/demo/${gate}.md`, stale_because: because });
const input = (path, was = 'aaa', now = 'bbb') => ({ path, was, now, role: 'input' });
const output = (path) => ({ path, was: 'a', now: 'b', role: 'output' });
const upstream = (gate) => ({ path: `(upstream ${gate})`, was: '-', now: '-', role: 'upstream' });

test('planCascade: input-stale gates are batched, upstream ones follow, output edits and lost history are excluded', () => {
  const stages = [
    { gate: 'G0', state: 'PASS' },
    stale('G1', [input('dev/decisions/demo.md#DEC-002')]),
    stale('G2', [input('dev/requirements/demo/requirements.md'), input('dev/decisions/demo.md#DEC-002')]),
    stale('G3', [upstream('G2')]),
    stale('G4', [output('dev/api/demo/openapi.yaml')]),
    stale('G5', [input('dev/design/demo/architecture.md', 'gone')]),
    { gate: 'G6', state: 'CHANGES_REQUESTED' },
  ];
  const plan = planCascade(stages, (path, was) => (was === 'gone' ? null : `c0ffee-${path.length}`));
  assert.deepEqual(plan.reaffirm.map((g) => [g.gate, g.inputs.map((i) => i.path)]), [
    ['G1', ['dev/decisions/demo.md#DEC-002']],
    ['G2', ['dev/requirements/demo/requirements.md', 'dev/decisions/demo.md#DEC-002']],
  ]);
  assert.equal(plan.reaffirm[0].log, 'dev/reviews/demo/G1.md', 'each gate reaffirms its own prior log');
  assert.deepEqual(plan.follows, [{ gate: 'G3', origin: 'G2' }]);
  assert.deepEqual(plan.excluded.map((g) => g.gate), ['G4', 'G5']);
  assert.match(plan.excluded[0].reason, /own output/);
  assert.match(plan.excluded[1].reason, /not in git history/);
});

test('planCascade: a gate downstream of an excluded one waits; an own-output edit is excluded even with an upstream cause', () => {
  const stages = [
    stale('G1', [output('dev/requirements/demo/requirements.md')]),
    stale('G2', [input('dev/requirements/demo/requirements.md')]),
    stale('G6', [input('dev/requirements/demo/requirements.md'), upstream('G1')]),
    stale('G7', [output('code'), upstream('G1')]),
  ];
  const plan = planCascade(stages, () => 'c0ffee', DEPENDS_ON);
  assert.deepEqual(plan.reaffirm, []);
  assert.deepEqual(plan.excluded.map((g) => g.gate), ['G1', 'G2', 'G7']);
  assert.match(plan.excluded[1].reason, /waits for G1/);
  assert.deepEqual(plan.follows, [{ gate: 'G6', origin: 'G1' }]);
});

/** The valid corpus in git, with G2's input hash repaired so the ladder is PASS before the edit. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cascade-'));
  const root = join(dir, 'dev');
  cpSync(join(here, 'fixtures', 'valid'), root, { recursive: true });
  const g2 = join(root, 'reviews', 'demo', 'G2-design-20260917-101422-7c15.md');
  const req = parseDoc(readFileSync(join(root, 'requirements', 'demo', 'requirements.md'), 'utf8')).bodyHash;
  writeFileSync(g2, readFileSync(g2, 'utf8').replace(/0000ade1\S+/, req));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'reviewed');
  return { dir, root, git };
}

const cascade = (dir, ...args) => spawnSync(process.execPath, [SCRIPT, '--cascade', 'demo', ...args], { cwd: dir, encoding: 'utf8' });

test('--cascade batches the gates an upstream-only change staled, with one diff per changed input', () => {
  const { dir, root, git } = repo();
  // G1 and G6 cite DEC-002 by row; neither produced the ledger, so an answer is upstream to both.
  const rows = execFileSync(process.execPath, [join(SCRIPTS, 'build-state.mjs'), '--hash', 'dev/decisions/demo.md#DEC-002'], { cwd: dir, encoding: 'utf8' }).slice(0, 64);
  for (const log of ['G1-requirements-20260916-141855-b09e-a2.md', 'G6-plan-20260918-104512-0e91.md']) {
    const p = join(root, 'reviews', 'demo', log);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace('inputs:\n', `inputs:\n  - path: dev/decisions/demo.md#DEC-002\n    sha256: ${rows}\n`));
  }
  git('commit', '-q', '-am', 'cite the ledger');
  const ledger = join(root, 'decisions', 'demo.md');
  writeFileSync(ledger, readFileSync(ledger, 'utf8').replace('| none | answered | 20 |', '| none | answered | 25 |'));

  const r = cascade(dir, '--out', 'dev/reviews/demo/.reaffirm', '--json');
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(plan.reaffirm.map((g) => g.gate), ['G1', 'G6']);
  assert.deepEqual(plan.follows.map((g) => g.gate), ['G2', 'G5']);
  assert.deepEqual(plan.excluded, []);
  assert.equal(plan.reaffirm[0].inputs[0].commit, git('log', '-1', '--format=%H', '--', 'dev/decisions/demo.md'), 'the commit that holds the reviewed ledger');
  assert.equal(plan.reaffirm[0].inputs[0].diff, plan.reaffirm[1].inputs[0].diff, 'one diff file per changed input');
  assert.match(readFileSync(join(dir, plan.reaffirm[0].inputs[0].diff), 'utf8'), /^\+\| DEC-002 .*\| 25 \|$/m);
});

test('--cascade holds every gate downstream of an own-output edit, and exits 1', () => {
  const { dir, root } = repo();
  const problem = join(root, 'intake', 'demo', 'problem.md');
  writeFileSync(problem, readFileSync(problem, 'utf8').replace('47 near-duplicate', '48 near-duplicate'));
  const r = cascade(dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /excluded {2}G0 {2}its own output changed/);
  assert.match(r.stdout, /excluded {2}G1 {2}waits for G0/);
  assert.doesNotMatch(r.stdout, /reaffirm {2}G/);
});

test('--cascade finds a project-root input such as .claude/DEV-PROFILE.md in history', () => {
  // On release-management the cascade said the recorded DEV-PROFILE was "not in git history": it
  // joined `.claude/DEV-PROFILE.md` under dev/, where no such file exists.
  const { dir, root, git } = repo();
  const profile = join(dir, '.claude', 'DEV-PROFILE.md');
  cpSync(join(here, '..', 'DEV-PROFILE.md'), profile);
  const hash = execFileSync(process.execPath, [join(SCRIPTS, 'build-state.mjs'), '--hash', '.claude/DEV-PROFILE.md'], { cwd: dir, encoding: 'utf8' }).slice(0, 64);
  const log = join(root, 'reviews', 'demo', 'G1-requirements-20260916-141855-b09e-a2.md');
  writeFileSync(log, readFileSync(log, 'utf8').replace(/\r\n/g, '\n').replace('inputs:\n', `inputs:\n  - path: .claude/DEV-PROFILE.md\n    sha256: ${hash}\n`));
  git('add', '-A');
  git('commit', '-q', '-m', 'cite the profile');
  writeFileSync(profile, `${readFileSync(profile, 'utf8')}\n- **Extra:** \`setting\`\n`);

  const r = cascade(dir, '--out', 'dev/reviews/demo/.reaffirm', '--json');
  const plan = JSON.parse(r.stdout);
  const g1 = plan.reaffirm.find((g) => g.gate === 'G1');
  assert.ok(g1, `G1 not batched: ${JSON.stringify(plan.excluded)}`);
  assert.equal(g1.inputs[0].path, '.claude/DEV-PROFILE.md');
  assert.ok(g1.inputs[0].commit, 'the reviewed profile was found in history');
});
