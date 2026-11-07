/**
 * The shared activity format, read side. vscode-stlc, vscode-eval and vscode-qa-standup carry the
 * same cases against their copy of activity.ts.
 */

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityEvent, isEvent, openNeeds, parseActivity } from '../activity';

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ v: 1, at: '2026-10-22T09:00:00Z', source: 'sdlc', kind: 'gate', slug: 'demo', outcome: 'pass', title: 'G1 PASS', link: null, needs: null, ...over });

test('parseActivity keeps valid lines newest first and skips torn or foreign ones', () => {
  const text = [
    JSON.stringify(ev({ at: '2026-10-22T08:00:00Z', title: 'older' })),
    '{"v":1,"at":"2026-10-22T09',
    JSON.stringify({ ...ev({}), v: 2 }),
    JSON.stringify(ev({ at: '2026-10-22T10:00:00Z', title: 'newer' })),
    '',
  ].join('\n');
  assert.deepEqual(parseActivity(text).map((e) => e.title), ['newer', 'older']);
});

test('isEvent refuses each broken field', () => {
  assert.ok(isEvent(ev({})));
  for (const bad of [{ at: '2026-10-22 09:00' }, { source: 'jira' }, { kind: 'commit' }, { outcome: 'ok' }, { title: '' }, { needs: 'coffee' }]) {
    assert.equal(isEvent({ ...ev({}), ...bad }), false, JSON.stringify(bad));
  }
});

test('openNeeds: a need stays until a later pass for the same slug and link clears it', () => {
  const events = [
    ev({ at: '2026-10-22T11:00:00Z', kind: 'decision', title: 'DEC-004 answered', outcome: 'pass', slug: 'demo', link: 'x' }),
    ev({ at: '2026-10-22T10:00:00Z', kind: 'decision', title: 'DEC-004 assumed', outcome: 'info', needs: 'confirm-dec', link: 'x' }),
    ev({ at: '2026-10-22T09:30:00Z', kind: 'gate', title: 'G5 ui PASS', needs: 'approve-ui', link: 'g5.md' }),
    ev({ at: '2026-10-22T09:00:00Z', kind: 'gate', title: 'G5 ui PASS (older)', needs: 'approve-ui', link: 'g5.md' }),
    ev({ at: '2026-10-22T08:00:00Z', kind: 'stop', title: 'stopped at merge', outcome: 'stopped', needs: 'merge', slug: 'other' }),
  ];
  const open = openNeeds(events);
  assert.deepEqual(open.map((n) => `${n.slug} ${n.need}`), ['demo approve-ui', 'other merge'], 'DEC-004 is cleared, G5 listed once');
});

// The views the board adds read these three; each is asserted on the sample index.
test('needsYou lists open and assumed decisions once each, plus what the activity log asks for', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { needsYou, decisionList } = await import('../viewmodel');
  const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../tests/fixtures/state.sample.json'), 'utf8'));
  const i = state.initiatives[0];
  i.decisions = [
    { id: 'DEC-001', question: 'a?', status: 'answered', blocks: [], blocking: false },
    { id: 'DEC-002', question: 'b?', status: 'assumed', blocks: ['G4'], blocking: false },
    { id: 'DEC-003', question: 'c?', status: 'open', blocks: ['G2'], blocking: true },
  ];
  const needs = needsYou(i, [
    ev({ slug: i.slug, needs: 'approve-ui', title: 'G5 ui PASS', link: 'g5.md' }),
    ev({ slug: i.slug, needs: 'confirm-dec', title: 'DEC-002 assumed' }),
    ev({ slug: 'someone-else', needs: 'merge', title: 'not ours' }),
  ]);
  assert.deepEqual(needs.map((n) => n.need), ['answer-dec', 'confirm-dec', 'approve-ui']);
  assert.equal(needs[0].command, `/sdlc-ask ${i.slug}`);
  assert.deepEqual(decisionList(i.decisions).map((d) => d.id), ['DEC-003', 'DEC-002', 'DEC-001'], 'open, then assumed, then answered');
});

test('a long id list in Needs you is a range, not a wall of ids', async () => {
  const { idSpan } = await import('../viewmodel');
  assert.equal(idSpan(['DEC-001', 'DEC-002']), 'DEC-001, DEC-002');
  assert.equal(idSpan(['DEC-009', 'DEC-010', 'DEC-011', 'DEC-033']), 'DEC-009 … DEC-033');
});
