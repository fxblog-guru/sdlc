/**
 * autonomy.mjs — an unattended run takes recommended defaults as the mode allows, and stops at
 * every hard stop whatever the mode. Each stop is proved by running the CLI and seeing exit 3.
 *
 *   node --test tests/autonomy.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { HARD, mode } from '../workspace/dev/scripts/autonomy.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { readActivity } from '../workspace/dev/scripts/lib/activity.mjs';
import { splitCells } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'autonomy.mjs');
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const RUN = '20261022-120000-abcd';

function project(autonomy) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-auto-'));
  cpSync(join(here, 'fixtures', 'valid'), join(dir, 'dev'), { recursive: true });
  const env = { ...process.env, SDLC_AUTONOMY: autonomy, SDLC_BUDGET_TOKENS: '', SDLC_BUDGET_MINUTES: '', ACTIVITY_LOG: '' };
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--run', RUN, '--root', join(dir, 'dev')], { cwd: dir, encoding: 'utf8', env });
  return { dir, root: join(dir, 'dev'), run, env };
}

test('the mode comes from SDLC_AUTONOMY, else the profile, else off; an unknown value is off', () => {
  assert.equal(mode('', {}), 'off');
  assert.equal(mode('- **Autonomy:** `assisted`', {}), 'assisted');
  assert.equal(mode('- **Autonomy:** `assisted`', { SDLC_AUTONOMY: 'full' }), 'full');
  assert.equal(mode('', { SDLC_AUTONOMY: 'yolo' }), 'off');
});

test('every hard stop exits 3 in full mode, sign-offs exit 4, and an ordinary step is allowed', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  for (const [action, cls] of Object.entries(HARD)) {
    const r = p.run('check', action, '--slug', 'demo');
    assert.equal(r.status, cls === 'sign-off' ? 4 : 3, `${action}: ${r.stdout}${r.stderr}`);
  }
  assert.equal(p.run('check', 'write-artifact').status, 0);
  const stops = readActivity(join(p.root, 'logs', 'activity.jsonl')).filter((e) => e.kind === 'stop');
  assert.equal(stops.length, Object.keys(HARD).length, 'each stop is an activity event the addons show');
  assert.ok(stops.every((e) => e.needs), 'and each needs a human');
  rmSync(p.dir, { recursive: true, force: true });
});

test('merge-main stops while a sign-off is provisional, which is what lets a full run continue past G5', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  assert.equal(p.run('check', 'ui-approval').status, 4);
  const r = p.run('check', 'merge-main');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /provisional/);
  rmSync(p.dir, { recursive: true, force: true });
});

test('a budget over its cap stops the next action, whatever it is', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  const capped = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--run', RUN, '--root', p.root], { cwd: p.dir, encoding: 'utf8', env: { ...p.env, SDLC_BUDGET_TOKENS: '1000' } });
  assert.equal(capped('budget', '--tokens', '400').status, 0);
  assert.equal(capped('check', 'write-artifact').status, 0);
  assert.equal(capped('budget', '--tokens', '700').status, 3);
  const r = capped('check', 'write-artifact');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /budget exceeded/);
  rmSync(p.dir, { recursive: true, force: true });
});

test('assume: full takes the default with who, reason and alternatives, and the ledger still lints clean', () => {
  const p = project('full');
  assert.equal(p.run('assume', 'demo', 'DEC-001', '--reason', 'v1 scope').status, 2, 'a run nobody started cannot assume');
  assert.equal(p.run('start', '--by', 'agent').status, 2, 'an agent is not a human');
  p.run('start', '--by', 'Luan Nguyen');
  const r = p.run('assume', 'demo', 'DEC-001', '--reason', 'v1 scope');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const row = readFileSync(join(p.root, 'decisions', 'demo.md'), 'utf8').split('\n').find((l) => l.startsWith('| DEC-001 |'));
  assert.match(row, /\| assumed \| title only for v1 — who: autonomous-run 20261022-120000-abcd \(started by Luan Nguyen\); reason: v1 scope; alternatives: title \+ steps \(tsvector\) \|$/);
  const e017 = lintTree(p.root, TEMPLATES).filter((f) => f.rule === 'E017');
  assert.deepEqual(e017, []);
  assert.equal(p.run('assume', 'demo', 'DEC-001', '--reason', 'again').status, 2, 'only an open row');
  rmSync(p.dir, { recursive: true, force: true });
});

test('assume: off never assumes, assisted asks for a DEC that blocks a gate', () => {
  const off = project('off');
  off.run('start', '--by', 'Luan Nguyen');
  assert.equal(off.run('assume', 'demo', 'DEC-001', '--reason', 'x').status, 3);
  rmSync(off.dir, { recursive: true, force: true });
  const p = project('assisted');
  p.run('start', '--by', 'Luan Nguyen');
  const ledger = join(p.root, 'decisions', 'demo.md');
  writeFileSync(ledger, readFileSync(ledger, 'utf8').replace('| title only for v1 | TASK-003 | open |', '| title only for v1 | G3, TASK-003 | open |'));
  assert.equal(p.run('assume', 'demo', 'DEC-001', '--reason', 'x').status, 3);
  writeFileSync(ledger, readFileSync(ledger, 'utf8').replace('| G3, TASK-003 | open |', '| TASK-003 | open |'));
  assert.equal(p.run('assume', 'demo', 'DEC-001', '--reason', 'x').status, 0, 'a task-only DEC is taken in assisted mode');
  rmSync(p.dir, { recursive: true, force: true });
});

test('report lists the gates, the decisions this run took and its stops', () => {
  const p = project('full');
  spawnSync(process.execPath, [join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs'), '--root', p.root, '--quiet'], { encoding: 'utf8' });
  p.run('start', '--by', 'Luan Nguyen');
  p.run('assume', 'demo', 'DEC-001', '--reason', 'v1 scope');
  p.run('check', 'deploy-prod');
  assert.equal(p.run('report').status, 0);
  const text = readFileSync(join(p.root, 'runs', RUN, 'report.md'), 'utf8');
  assert.match(text, /Started by Luan Nguyen, mode `full`/);
  assert.match(text, /\| demo \| G1 \| /);
  assert.match(text, /\| demo \| DEC-001 \| title only for v1/);
  assert.match(text, /\| deploy-prod \| outward \| stopped \|/);
  rmSync(p.dir, { recursive: true, force: true });
});

// The CI job is the one place a run acts outward. It may push its own branch and open a Draft MR;
// a merge, a deploy or a push to the default branch there would bypass every stop above.
test('the GitLab autonomy job opens a Draft MR from its own branch and never merges, deploys or pushes the default branch', () => {
  const ci = readFileSync(join(here, '..', 'workspace', 'dev', 'ci', 'gitlab-autonomy.yml'), 'utf8');
  assert.match(ci, /autonomy\.mjs start --run "\$RUN" --by "\$SDLC_STARTED_BY"/);
  assert.match(ci, /autonomy\.mjs report --run "\$RUN"/);
  assert.match(ci, /HEAD:autonomy\/\$SDLC_SLUG-\$RUN/);
  assert.match(ci, /title: `Draft: /);
  for (const banned of [/merge_requests\/[^\s]*\/merge/, /git push[^\n]*\b(main|master|\$CI_DEFAULT_BRANCH)\b/, /\bmerge_when_pipeline_succeeds\b/, /\bauto_merge\b/, /kubectl|helm upgrade|terraform apply/]) {
    assert.doesNotMatch(ci, banned, String(banned));
  }
  const protocol = readFileSync(join(here, '..', 'skills', 'dev-stage-protocol', 'SKILL.md'), 'utf8');
  assert.match(protocol, /autonomy\.md/);
  const steps = readFileSync(join(here, '..', 'skills', 'dev-stage-protocol', 'autonomy.md'), 'utf8');
  for (const a of ['push-main', 'merge-main', 'deploy-prod', 'delete-data', 'spend', 'suppress-scanner', 'widen-access', 'ui-approval', 'release-signoff']) assert.match(steps, new RegExp(a), `autonomy.md does not check ${a}`);
});

// Review: a bold id was found by readTable and missed by the raw line regex (crash); an escaped
// pipe in an earlier cell shifted every column, so "assumed" landed in Blocks.
test('assume finds a bold id and keeps columns when a cell holds an escaped pipe', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  const ledger = join(p.root, 'decisions', 'demo.md');
  const text = readFileSync(ledger, 'utf8')
    .replace('| DEC-001 | Is title search enough, or do testers need to search step text? |', '| **DEC-001** | Use `a \\| b` syntax, or search step text? |');
  writeFileSync(ledger, text);
  const r = p.run('assume', 'demo', 'DEC-001', '--reason', 'v1');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const row = readFileSync(ledger, 'utf8').split('\n').find((l) => l.includes('DEC-001'));
  const cells = splitCells(row);
  assert.equal(cells.length, 8, row);
  assert.equal(cells[6], 'assumed');
  assert.match(cells[7], /^title only for v1 — who: autonomous-run/);
  assert.ok(row.includes('a \\| b'), `the escaped pipe survives: ${row}`);
  assert.deepEqual(lintTree(p.root, TEMPLATES).filter((f) => ['E017', 'E032'].includes(f.rule)), []);
  rmSync(p.dir, { recursive: true, force: true });
});

test('resolve writes the pass that clears the run from Needs you; a torn stops line is skipped', () => {
  const p = project('full');
  p.run('start', '--by', 'Luan Nguyen');
  p.run('check', 'ui-approval', '--slug', 'demo');
  const stops = join(p.root, 'runs', RUN, 'stops.jsonl');
  writeFileSync(stops, readFileSync(stops, 'utf8') + '{"at":"20');
  assert.match(p.run('check', 'merge-main', '--slug', 'demo').stdout, /provisional/);
  assert.equal(p.run('resolve', '--by', 'agent').status, 2, 'only a human resolves');
  assert.equal(p.run('resolve', '--by', 'Luan Nguyen').status, 0);
  const events = readActivity(join(p.root, 'logs', 'activity.jsonl'));
  const need = events.find((e) => e.needs === 'sign-off');
  const clear = events.at(-1);
  assert.equal(clear.outcome, 'pass');
  assert.equal(clear.needs, null);
  assert.equal(`${clear.slug}|${clear.link}`, `${need.slug}|${need.link}`);
  rmSync(p.dir, { recursive: true, force: true });
});
