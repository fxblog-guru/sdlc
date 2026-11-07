/**
 * propagate-dec.mjs (DEV-CONTRACTS §3.2): when a DEC is answered, which artifacts cite it and lack
 * the answer's key token? On release-management DEC answers were restated in seven artifacts and
 * 50 of 465 review findings were a stale copy; the owning artifact missing the answer is the bug,
 * every other artifact should cite the id and not repeat the value.
 *
 *   node --test tests/propagate-dec.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'propagate-dec.mjs');
const { keyToken, propagate } = await import(pathToFileURL(SCRIPT).href);

const LEDGER = `---
slug: demo
artifact: decisions
---

## Decisions

| Id | Question | Why it is needed | Options | Recommended default | Blocks | Status | Answer |
|---|---|---|---|---|---|---|---|
| DEC-001 | Page size? | bounds the list | 20 · 50 | 20 | G4 | answered | \`limit=50\` default, max 200 — Ada Lovelace (requester), 2026-10-01, via /sdlc-ask |
| DEC-002 | Lockout? | brute force | 5/15 min · 10/30 min | 5/15 min | G2 | answered | 10 attempts in 30 minutes — Ada Lovelace (requester), 2026-10-01, via /sdlc-ask |
| DEC-003 | Region? | latency | eu · us | eu | TASK-004 | open | — |
| DEC-004 | Mood? | none | a · b | a | G1 | answered | yes — Ada Lovelace, 2026-10-01 |
`;

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-dec-'));
  for (const [rel, text] of Object.entries({ 'decisions/demo.md': LEDGER, ...files })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('the key token is the first code span, else the first number with its unit; attribution is ignored', () => {
  assert.equal(keyToken('`limit=50` default, max 200 — Ada (requester), 2026-10-01'), 'limit=50');
  assert.equal(keyToken('10 attempts in 30 minutes — Ada (requester), 2026-10-01, via /sdlc-ask'), '10 attempts');
  assert.equal(keyToken('Key: eu-west-1. Ireland — Ada, 2026-10-01'), 'eu-west-1');
  assert.equal(keyToken('yes — Ada Lovelace, 2026-10-01'), null);
  assert.equal(keyToken('—'), null);
});

test('an owning artifact that cites the DEC without its answer is missing; a citer that restates is reported apart', () => {
  const root = tree({
    'api/demo/openapi.yaml': 'paths: {} # DEC-001 page size, limit=50\n',
    'design/demo/architecture.md': '## Security\n\nLockout per DEC-002: 5 attempts in 15 minutes.\n',
    'plan/demo/tasks.md': '| TASK-001 | list endpoint per DEC-001 | done |\n',
    'ui/demo/ui-spec.md': 'The list shows 50 rows (DEC-001, limit=50).\n',
    'reviews/demo/G2-design-x.md': 'DEC-002 cited in a log is not an artifact\n',
  });
  const report = propagate(root, 'demo');
  const by = Object.fromEntries(report.map((r) => [r.id, r]));
  assert.deepEqual(by['DEC-002'].missing, ['design/demo/architecture.md'], 'the G2 owner states the old default');
  assert.deepEqual(by['DEC-001'].missing, []);
  assert.deepEqual(by['DEC-001'].cites, ['plan/demo/tasks.md']);
  assert.deepEqual(by['DEC-001'].restates, ['ui/demo/ui-spec.md']);
  assert.ok(!by['DEC-003'], 'an open decision is not propagated');
  assert.equal(by['DEC-004'].key, null, 'an answer with no key token is listed, not judged');
});

test('--check exits 1 only when an owning artifact lacks the answer', () => {
  const bad = tree({ 'design/demo/architecture.md': 'Lockout per DEC-002: 5 attempts in 15 minutes.\n' });
  const good = tree({ 'design/demo/architecture.md': 'Lockout per DEC-002: 10 attempts in 30 minutes.\n' });
  const run = (root) => {
    try {
      execFileSync(process.execPath, [SCRIPT, 'demo', '--root', root, '--check'], { encoding: 'utf8' });
      return 0;
    } catch (err) {
      return err.status;
    }
  };
  assert.equal(run(bad), 1);
  assert.equal(run(good), 0);
});
