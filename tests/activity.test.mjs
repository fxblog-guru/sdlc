/**
 * activity.mjs — the shared event format (docs/activity-format.md) and the events build-state
 * writes between two builds.
 *
 *   node --test tests/activity.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { eventProblems, logActivity, makeEvent, readActivity, stateEvents } from '../workspace/dev/scripts/lib/activity.mjs';
import { buildState } from '../workspace/dev/scripts/build-state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(here, 'fixtures', 'valid');
const BUILDER = join(here, '..', 'workspace', 'dev', 'scripts', 'build-state.mjs');

test('the documented example is a valid event, and each broken field is named', () => {
  const doc = readFileSync(join(here, '..', 'docs', 'activity-format.md'), 'utf8');
  const example = JSON.parse(/```json\n(.+)\n```/.exec(doc)[1]);
  assert.deepEqual(eventProblems(example), []);
  for (const [field, value, re] of [
    ['v', 2, /v must be 1/], ['at', '2026-10-22 09:14', /at must/], ['source', 'jira', /source/], ['kind', 'commit', /kind/],
    ['outcome', 'ok', /outcome/], ['title', 'x'.repeat(121), /title/], ['needs', 'coffee', /needs/], ['link', 'C:/x.md', /link/],
  ]) assert.match(eventProblems({ ...example, [field]: value }).join(' | '), re, field);
});

test('logActivity appends valid events only, never creates the root, and honours ACTIVITY_LOG=off', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-act-'));
  const good = makeEvent({ kind: 'gate', slug: 'demo', outcome: 'pass', title: 'G1 PASS' });
  assert.equal(logActivity(root, [good, { ...good, kind: 'nope' }]), 1);
  assert.equal(logActivity(root, [good], { ACTIVITY_LOG: 'off' }), 0);
  assert.equal(readActivity(join(root, 'logs', 'activity.jsonl')).length, 1);
  assert.equal(logActivity(join(root, 'missing'), [good]), 0);
  assert.ok(!existsSync(join(root, 'missing')));
  rmSync(root, { recursive: true, force: true });
});

test('stateEvents: nothing on a first build; a changed gate and a new assumed DEC on the next', () => {
  const state = buildState(CORPUS);
  assert.deepEqual(stateEvents(null, state), []);
  assert.deepEqual(stateEvents(state, state), [], 'an unchanged build writes nothing');
  const prior = structuredClone(state);
  const g1 = prior.initiatives[0].stages.find((s) => s.gate === 'G1');
  g1.state = 'CHANGES_REQUESTED';
  const next = structuredClone(state);
  next.initiatives[0].decisions.push({ id: 'DEC-099', question: 'Page size?', status: 'assumed', blocks: ['G4'], blocking: false });
  const events = stateEvents(prior, next);
  const gate = events.find((e) => e.kind === 'gate');
  assert.equal(gate.title.startsWith('G1'), true);
  const dec = events.find((e) => e.kind === 'decision');
  assert.equal(dec.needs, 'confirm-dec');
  for (const e of events) assert.deepEqual(eventProblems(e), [], JSON.stringify(e));
});

// Review: a G5 PASS asked to "approve the UI" forever, because nothing ever cleared it.
test('stateEvents: a UI approval and a G10 pass write the pass that clears G5 and G9 from Needs you', () => {
  const state = buildState(CORPUS);
  const i = state.initiatives[0];
  const stage = (s, g) => s.initiatives[0].stages.find((x) => x.gate === g);
  stage(state, 'G5').log = stage(state, 'G5').log ?? 'dev/reviews/demo/G5.md';
  stage(state, 'G9').log = 'dev/reviews/demo/G9.md';
  const prior = structuredClone(state);
  prior.initiatives[0].ui_approved = false;
  stage(prior, 'G10').state = 'NOT_STARTED';
  const next = structuredClone(prior);
  next.initiatives[0].ui_approved = true;
  stage(next, 'G10').state = 'PASS';
  // G10's own PASS is an ordinary gate event too; the clears are the ones that carry G5/G9's link.
  const clears = stateEvents(prior, next).filter((e) => e.outcome === 'pass' && !e.needs && e.link);
  assert.deepEqual(clears.map((e) => e.link), [stage(next, 'G5').log, 'dev/reviews/demo/G9.md']);
  assert.equal(clears[0].slug, i.slug);
  assert.deepEqual(stateEvents(next, next).filter((e) => e.outcome === 'pass' && !e.needs && e.link), [], 'once only');
});

test('build-state writes the events to <root>/logs/activity.jsonl on the second build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-act-bs-'));
  const root = join(dir, 'dev');
  cpSync(CORPUS, root, { recursive: true });
  const run = () => spawnSync(process.execPath, [BUILDER, '--root', root, '--quiet'], { encoding: 'utf8', env: { ...process.env, ACTIVITY_LOG: '' } });
  run();
  const file = join(root, 'logs', 'activity.jsonl');
  assert.equal(readActivity(file).length, 0, 'a first build is not news');
  const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
  state.initiatives[0].stages.find((s) => s.gate === 'G0').state = 'REVIEWING';
  writeFileSync(join(root, 'state.json'), JSON.stringify(state));
  run();
  const events = readActivity(file);
  rmSync(dir, { recursive: true, force: true });
  assert.ok(events.some((e) => e.kind === 'gate' && e.title.startsWith('G0')), JSON.stringify(events));
});
