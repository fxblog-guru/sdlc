/**
 * learn.mjs process signals and the local promote (DEV-CONTRACTS §19.3, §19.4). The findings harvest
 * reads are the product's defects; what made an initiative slow and expensive — a gate re-run many
 * times, a release held on overrides, a reaffirm cascade, a later gate run while an earlier one was
 * red — never becomes a finding, so harvest reads it from the gate logs' own shape. One initiative is
 * enough for these.
 *
 *   node --test tests/learn-process.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'dev', 'scripts', 'learn.mjs');
const learn = await import(pathToFileURL(SCRIPT).href);
process.env.SDLC_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';

const log = ({ gate, run, verdict = 'PASS', override = 'null', from = 'null' }) => `---
slug: shop
gate: ${gate}
stage: x
run_id: ${run}
attempt: 1
verdict: ${verdict}
override: ${override}
revalidated_from: ${from}
reviewer: dev-gate-reviewer
---

## Findings

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
`;

function tree(logs) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-learn-proc-'));
  mkdirSync(join(root, 'reviews', 'shop'), { recursive: true });
  logs.forEach((l, i) => writeFileSync(join(root, 'reviews', 'shop', `${l.gate}-x-${l.run}.md`), log(l)));
  return root;
}
const of = (root, kind) => learn.harvest(root, { lessons: [] }).filter((s) => s.signal === kind);

test('a clean ladder raises no process signal', () => {
  const root = tree([{ gate: 'G1', run: '20261001-100000-aaaa' }, { gate: 'G2', run: '20261002-100000-aaaa' }, { gate: 'G6', run: '20261003-100000-aaaa' }]);
  assert.deepEqual(learn.harvest(root, { lessons: [] }).filter((s) => ['costly gate', 'override', 'reaffirm cascade', 'out of order'].includes(s.signal)), []);
});

test('costly gate: one gate logged four times on a slug; three is not yet', () => {
  const runs = (n) => Array.from({ length: n }, (_, i) => ({ gate: 'G1', run: `2026100${i + 1}-100000-aaaa`, verdict: i < n - 1 ? 'CHANGES_REQUESTED' : 'PASS' }));
  const four = of(tree(runs(4)), 'costly gate');
  assert.equal(four.length, 1, JSON.stringify(four));
  assert.match(four[0].subject, /shop: G1 was logged 4 times/);
  assert.equal(four[0].evidence.length, 4);
  assert.deepEqual(of(tree(runs(3)), 'costly gate'), []);
});

test('override: a gate held on a human override is a signal, with the gates named', () => {
  const root = tree([
    { gate: 'G7', run: '20261001-100000-aaaa', verdict: 'CHANGES_REQUESTED', override: '"Owner — ship as reviewed"' },
    { gate: 'G8', run: '20261002-100000-aaaa', verdict: 'BLOCKED', override: '"Owner — fix after launch"' },
  ]);
  const found = of(root, 'override');
  assert.equal(found.length, 1);
  assert.match(found[0].subject, /G7, G8 held on a human override/);
  assert.deepEqual(of(root, 'out of order'), [], 'an overridden gate is cleared');
});

test('reaffirm cascade: three reaffirm logs on a slug; two is not', () => {
  const r = (n) => Array.from({ length: n }, (_, i) => ({ gate: `G${i + 1}`, run: `2026100${i + 1}-100000-aaaa`, from: `G${i + 1}-x-old.md` }));
  assert.equal(of(tree(r(3)), 'reaffirm cascade').length, 1);
  assert.deepEqual(of(tree(r(2)), 'reaffirm cascade'), []);
});

test('out of order: a later gate run while an earlier gate is still red', () => {
  const root = tree([
    { gate: 'G8', run: '20261001-100000-aaaa', verdict: 'CHANGES_REQUESTED' },
    { gate: 'G9', run: '20261002-100000-aaaa', verdict: 'BLOCKED' },
  ]);
  const found = of(root, 'out of order');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].subject, /G9 ran while G8 was CHANGES_REQUESTED/);
  const fixed = tree([
    { gate: 'G8', run: '20261001-100000-aaaa', verdict: 'CHANGES_REQUESTED' },
    { gate: 'G8', run: '20261001-120000-aaaa', verdict: 'PASS' },
    { gate: 'G9', run: '20261002-100000-aaaa', verdict: 'PASS' },
  ]);
  assert.deepEqual(of(fixed, 'out of order'), [], 'G8 passed before G9 ran');
  const earlier = tree([
    { gate: 'G9', run: '20261001-100000-aaaa', verdict: 'PASS' },
    { gate: 'G8', run: '20261002-100000-aaaa', verdict: 'CHANGES_REQUESTED' },
  ]);
  assert.deepEqual(of(earlier, 'out of order'), [], 'a red G8 run after G9 is not G9 running early');
});

test('promote --local: process lessons wait for a named human; a product lesson is never offered', () => {
  const l = (id, applies, body = '- **Do:** decide the host at G0.') => ({ fm: { id, title: `${id} title`, status: 'active', applies_to: applies }, body });
  const xs = learn.localCandidates([l('LRN-HOST-EARLY', ['g0', 'process']), l('LRN-CURSOR', ['g4', 'api']), l('LRN-PATHY', ['process'], '- **Do:** fix src/server/posts/write-repo.ts first.')]);
  assert.deepEqual(xs.map((x) => x.id), ['LRN-HOST-EARLY', 'LRN-PATHY']);
  assert.deepEqual(xs.find((x) => x.id === 'LRN-PATHY').refused, ['path']);

  const root = mkdtempSync(join(tmpdir(), 'sdlc-learn-local-'));
  mkdirSync(join(root, 'learnings'), { recursive: true });
  writeFileSync(join(root, 'learnings', 'LRN-HOST-EARLY.md'), '---\nid: LRN-HOST-EARLY\ntitle: Decide where it runs before design\nstatus: active\nconfidence: established\napplies_to: [g0, g2, process]\nevidence: ["human: Owner — deploy was decided on release day"]\nprobe: Where will this run, and who deploys it?\ncreated: 2026-10-31\nupdated: 2026-10-31\n---\n\n- **Do:** decide the host at G0.\n');
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, 'promote', '--local', ...a, '--root', root], { encoding: 'utf8', env: { ...process.env, SDLC_RUN_LOG: 'off' } });
  const waiting = run();
  assert.equal(waiting.status, 0, waiting.stderr);
  assert.match(waiting.stdout, /WAITING\s+LRN-HOST-EARLY/);
  const approved = run('--approved-by', 'Owner');
  assert.match(approved.stdout, /CANDIDATE\s+LRN-HOST-EARLY/);
  assert.match(approved.stdout, /approved by Owner/);
});
