/**
 * L1 for status.mjs — the board is the only thing most people will ever read, and both bugs it has
 * had so far were in what it chose NOT to print. A silent omission is invisible to every other test
 * in this suite, so it gets its own.
 *
 *   node --test tests/status.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(here, '..', 'workspace', 'dev', 'scripts');

/** A throwaway project laid out the way an install is: a dev root with scripts beside the artifacts. */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-status-'));
  const dev = join(root, 'dev');
  cpSync(join(here, 'fixtures', 'valid'), dev, { recursive: true });
  cpSync(SCRIPTS, join(dev, 'scripts'), { recursive: true });
  return { root, dev };
}

function board(root, args = []) {
  execFileSync(process.execPath, [join(root, 'dev', 'scripts', 'build-state.mjs'), '--quiet'], { cwd: root });
  return execFileSync(process.execPath, [join(root, 'dev', 'scripts', 'status.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('GK always gets a line, including on a board that has initiatives', () => {
  const { root } = project();
  const out = board(root);
  assert.match(out, /GK\s+knowledge\s+PASS/);
  assert.match(out, /1 card\(s\)/);
});

test('an empty pipeline with no cards is sent to /sdlc-onboard, not /sdlc-intake', () => {
  const { root, dev } = project();
  // Strip the pipeline back to a fresh install of a codebase that has never been onboarded.
  for (const d of ['intake', 'requirements', 'design', 'plan', 'reviews', 'knowledge', 'decisions']) {
    rmSync(join(dev, d), { recursive: true, force: true });
  }
  const out = board(root);
  // Sending someone to intake here is answered two commands later by intake's own preflight
  // refusing for want of knowledge cards — a correct refusal arriving after a wasted round.
  assert.match(out, /Start with \/sdlc-onboard/);
  assert.match(out, /GK\s+knowledge\s+NOT_STARTED/);
});

test('a knowledge card edited after its review is reported on the board, not only in state.json', () => {
  const { root, dev } = project();
  // Remove the initiatives so only GK remains — the exact shape in which the omission was invisible.
  for (const d of ['intake', 'requirements', 'design', 'plan', 'decisions']) {
    rmSync(join(dev, d), { recursive: true, force: true });
  }
  rmSync(join(dev, 'reviews', 'demo'), { recursive: true, force: true });

  const card = join(dev, 'knowledge', 'codebase-map.md');
  writeFileSync(card, `${readFileSync(card, 'utf8')}\nEdited after the review.\n`, 'utf8');

  const out = board(root);
  assert.match(out, /GK\s+knowledge\s+STALE/);
  assert.match(out, /codebase-map\.md changed since the review/, 'the board must name the file');
  assert.match(out, /--refresh/, 'and the command that resolves it');
});

// -----------------------------------------------------------------------------------------------
// --ready: which tasks can start now, and in what waves the rest become startable.
// -----------------------------------------------------------------------------------------------

function ready(root, slug = 'demo') {
  execFileSync(process.execPath, [join(root, 'dev', 'scripts', 'build-state.mjs'), '--quiet'], { cwd: root });
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(root, 'dev', 'scripts', 'status.mjs'), slug, '--ready'], { cwd: root, encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) };
  }
}

function editTasks(dev, mutate) {
  const p = join(dev, 'plan', 'demo', 'tasks.md');
  const before = readFileSync(p, 'utf8');
  const after = mutate(before);
  assert.notEqual(after, before, 'the mutation must change tasks.md');
  writeFileSync(p, after);
}

test('--ready lists the tasks whose dependencies are done, then the later waves', () => {
  const { root } = project();
  const { code, out } = ready(root);
  assert.equal(code, 0, out);
  // TASK-001 and TASK-002 are done; TASK-003 depends on TASK-002, TASK-004 on TASK-003.
  assert.match(out, /^wave 1 \(ready now\)\n  TASK-003 /m);
  assert.match(out, /^wave 2\n  TASK-004 /m);
  assert.doesNotMatch(out, /TASK-001 |TASK-002 /, 'done tasks are not listed');
});

test('--ready puts independent tasks in the same wave', () => {
  const { root, dev } = project();
  editTasks(dev, (s) => s.replace('| internal/testcase/telemetry.go | TASK-003 |', '| internal/testcase/telemetry.go | TASK-002 |'));
  const { out } = ready(root);
  assert.match(out, /^wave 1 \(ready now\)\n  TASK-003 [^\n]*\n  TASK-004 /m);
  assert.doesNotMatch(out, /wave 2/);
});

test('--ready reports a cycle and the tasks it strands, and exits non-zero', () => {
  const { root, dev } = project();
  editTasks(dev, (s) => s.replace('| internal/testcase/handler_list.go | TASK-002 |', '| internal/testcase/handler_list.go | TASK-004 |'));
  const { code, out } = ready(root);
  assert.equal(code, 1);
  assert.match(out, /cycle: TASK-003 → TASK-004 → TASK-003/);
  assert.match(out, /never ready[^\n]*\n  TASK-003 [^\n]*\n  TASK-004 /);
  assert.doesNotMatch(out, /wave 1/);
});

test('--ready reports a dependency on an unknown id', () => {
  const { root, dev } = project();
  editTasks(dev, (s) => s.replace('| internal/testcase/telemetry.go | TASK-003 |', '| internal/testcase/telemetry.go | TASK-003, TASK-042 |'));
  const { code, out } = ready(root);
  assert.equal(code, 1);
  assert.match(out, /unknown: TASK-004 depends on TASK-042/);
  assert.match(out, /^wave 1 \(ready now\)\n  TASK-003 /m);
  assert.match(out, /never ready[^\n]*\n  TASK-004 /);
});

test('--brief is what the SessionStart hook prints, and still carries GK', () => {
  const { root } = project();
  const out = board(root, ['--brief']);
  assert.match(out, /GK\s+knowledge/);
  assert.doesNotMatch(out, /legend/, 'brief drops the legend');
});
