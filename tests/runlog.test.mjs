/**
 * runlog.mjs: every checker run leaves one JSON line in <root>/logs/runs.jsonl. A gate that failed
 * used to leave only terminal scrollback; the line must say which script, which slug, the exit,
 * the codes, and carry the gate's run id — and never a secret, and never a root it had to invent.
 *
 *   node --test tests/runlog.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { logRun, MAX_BYTES, safeArgs } from '../workspace/dev/scripts/lib/runlog.mjs';
import { project } from './backend-fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'workspace', 'dev', 'scripts');
const lines = (root) => readFileSync(join(root, 'logs', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('one line per record, with the §13.5 fields and the caller run id', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-runlog-'));
  try {
    logRun(root, { script: 'obs-check', exit: 1, errors: 2, warnings: 0, codes: { E114: 2 } }, { env: { SDLC_RUN_ID: 'gate-g7-1' }, argv: ['demo', '--root', 'dev', '--token', 's3cret', '--api-key=k'] });
    const [l] = lines(root);
    assert.equal(l.event, 'check.run_completed');
    assert.equal(l.level, 'error');
    assert.equal(l.service, 'sdlc');
    assert.equal(l.run_id, 'gate-g7-1');
    assert.equal(l.slug, 'demo');
    assert.deepEqual(l.codes, { E114: 2 });
    assert.ok(l.timestamp && typeof l.duration_ms === 'number');
    assert.doesNotMatch(JSON.stringify(l), /s3cret|=k"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('no root on disk, or SDLC_RUN_LOG=off: nothing is written and nothing throws', () => {
  const missing = join(tmpdir(), `sdlc-none-${process.pid}`);
  assert.equal(logRun(missing, { exit: 0 }), null);
  assert.equal(existsSync(missing), false, 'the log must not create the root');
  const root = mkdtempSync(join(tmpdir(), 'sdlc-runlog-'));
  try {
    assert.equal(logRun(root, { exit: 0 }, { env: { SDLC_RUN_LOG: 'off' } }), null);
    assert.equal(existsSync(join(root, 'logs')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the log rolls over past MAX_BYTES instead of growing without bound', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-runlog-'));
  try {
    mkdirSync(join(root, 'logs'));
    writeFileSync(join(root, 'logs', 'runs.jsonl'), 'x'.repeat(MAX_BYTES + 1));
    logRun(root, { exit: 0 }, { env: {}, argv: [] });
    assert.ok(statSync(join(root, 'logs', 'runs.1.jsonl')).size > MAX_BYTES);
    assert.equal(lines(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('safeArgs redacts the value of a secret flag in both forms', () => {
  assert.deepEqual(safeArgs(['a', '--password', 'p', '--secret=s', '--root', 'dev']), ['a', '--password', '[REDACTED]', '--secret=[REDACTED]', '--root', 'dev']);
});

test('a real checker run lands in the root it was given', () => {
  const dir = project();
  const env = { ...process.env, SDLC_RUN_ID: 'gate-test', SDLC_RUN_LOG: '' };
  const r = spawnSync(process.execPath, [join(SCRIPTS, 'obs-check.mjs'), 'demo', '--root', 'dev', '--source', '.', '--app', 'demo'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [l] = lines(join(dir, 'dev'));
  assert.equal(l.script, 'obs-check');
  assert.equal(l.run_id, 'gate-test');
  assert.equal(l.exit, 0);
  assert.equal(l.slug, 'demo');
});
