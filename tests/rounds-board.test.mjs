/**
 * The board shows what a gate has cost (DEV-CONTRACTS §8, §4.3): full reviews since its last PASS
 * against the cap, when its first log was written, and the tokens size.mjs actual recorded — null
 * when nobody recorded them. It reads the same count lint E045 refuses on (lib/rounds.mjs).
 *
 *   node --test tests/rounds-board.test.mjs
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildState, renderDashboard } from '../workspace/dev/scripts/build-state.mjs';
import { roundsOf, ROUND_CAP } from '../workspace/dev/scripts/lib/rounds.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, 'fixtures', 'valid');
process.env.SDLC_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';

const log = (gate, run, verdict, extra = {}) => ({ fm: { gate, run_id: run, attempt: 1, verdict, revalidated_from: null, override: null, ...extra } });

test('rounds count across runs, reset on PASS or override, and skip reaffirms, skips and slices', () => {
  const logs = [
    log('G2', '20261001-100000-aaaa', 'CHANGES_REQUESTED'),
    log('G2', '20261002-100000-aaaa', 'CHANGES_REQUESTED'),
    log('G2', '20261003-100000-aaaa', 'CHANGES_REQUESTED', { revalidated_from: 'x.md' }),
    log('G2', '20261004-100000-aaaa', 'BLOCKED'),
    log('G7', '20261001-100000-aaaa', 'CHANGES_REQUESTED', { scope: 'slice-1' }),
    log('G7', '20261002-100000-aaaa', 'CHANGES_REQUESTED', { override: '"Owner — ship"' }),
    log('G8', '20261001-100000-aaaa', 'CHANGES_REQUESTED'),
    log('G8', '20261002-100000-aaaa', 'PASS'),
  ];
  const { perLog, open } = roundsOf(logs);
  assert.deepEqual(logs.map((l) => perLog.get(l)), [1, 2, 0, 3, 0, 1, 1, 2]);
  assert.equal(open.get('G2'), 3);
  assert.equal(open.get('G7'), 0, 'an override closes the cycle');
  assert.equal(open.get('G8'), 0, 'a PASS closes the cycle');
  assert.equal(ROUND_CAP, 2);
});

test('state.json carries rounds, first_log_at and recorded tokens per gate; the dashboard says when a gate is at the cap', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-rounds-'));
  cpSync(VALID, root, { recursive: true });
  const g6 = readFileSync(join(root, 'reviews/demo/G6-plan-20260918-104512-0e91.md'), 'utf8');
  for (const run of ['20260919-100000-aaa1', '20260919-110000-aaa2']) {
    writeFileSync(join(root, `reviews/demo/G6-plan-${run}.md`), g6.replace('run_id: 20260918-104512-0e91', `run_id: ${run}`).replace(/^verdict: .*$/m, 'verdict: CHANGES_REQUESTED'));
  }
  mkdirSync(join(root, 'estimates'), { recursive: true });
  writeFileSync(join(root, 'estimates', 'demo.json'), JSON.stringify({ actual: { G6: { tokens: 123456 } } }));
  const state = buildState(root, new Date('2026-09-22T10:00:00Z'));
  const stages = state.initiatives.find((i) => i.slug === 'demo').stages;
  const g6s = stages.find((s) => s.gate === 'G6');
  assert.deepEqual(g6s.rounds, { used: 2, cap: 2 });
  assert.equal(g6s.first_log_at, '2026-09-18T10:45:12Z');
  assert.equal(g6s.tokens, 123456);
  const g1 = stages.find((s) => s.gate === 'G1');
  assert.deepEqual(g1.rounds, { used: 0, cap: 2 }, 'G1 passed at attempt 2');
  assert.equal(g1.tokens, null, 'no record, no number');
  const board = renderDashboard(state);
  assert.match(board, /\*\*G6 round 2\/2\*\* · open 3 day\(s\) since its first log · 123456 tokens recorded — at the cap/);
});
