/**
 * Step 5 of docs/learning-roadmap.md (DEV-CONTRACTS §21): an author marks a fact it cannot cite, the
 * linter keeps the count visible, and the reviewer is told how to grade one a decision rests on. The
 * planted case: a design that rests on an uncited claim carries the marker and is flagged; the same
 * design with the claim cited is quiet.
 *
 *   node --test tests/unverified.test.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const { lintTree, loadTemplates } = await import(pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'lint-dev.mjs')).href);
const TEMPLATES = loadTemplates(join(ROOT, 'workspace', 'dev', '_templates'));
const VALID = join(here, 'fixtures', 'valid');
const readLF = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// The valid fixture's problem.md, with one sentence changed: the planted uncited claim.
const PROBLEM = 'intake/demo/problem.md';
function tree(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-unverified-'));
  const target = join(root, PROBLEM);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, mutate(readLF(join(VALID, PROBLEM))));
  return root;
}
const firstSection = (s, add) => s.replace(/^(## [^\n]+\n)/m, `$1\n${add}\n`);
const w096 = (root) => lintTree(root, TEMPLATES).filter((f) => f.rule === 'W096');

test('planted: an uncited claim carries the marker and lint counts it', () => {
  const root = tree((s) => firstSection(s, 'UNVERIFIED: most dispatchers work from a phone.\n\nUNVERIFIED: the nightly import runs under 5 minutes.'));
  const found = w096(root);
  assert.equal(found.length, 1, 'once per file');
  assert.equal(found[0].level, 'warn', 'advisory: the reviewer judges whether a decision rests on it');
  assert.match(found[0].message, /^2 UNVERIFIED claim\(s\)/);
});

test('cited: the same design with the claim cited is quiet', () => {
  assert.equal(w096(tree((s) => firstSection(s, 'Most dispatchers work from a phone (knowledge/codebase-map.md §Clients, 71 % of sessions).'))).length, 0);
});

test('a marker quoted in a code span is not a claim, and the word alone is not a marker', () => {
  assert.equal(w096(tree((s) => firstSection(s, 'The rule is to write `UNVERIFIED: <claim>` when unsure. Nothing here is unverified.'))).length, 0);
});

test('gate logs are exempt: a reviewer quoting the marker is not making a claim', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-unverified-'));
  const log = 'reviews/demo/G0-intake-20260916-091203-3f2a.md';
  mkdirSync(dirname(join(root, log)), { recursive: true });
  writeFileSync(join(root, log), readLF(join(VALID, log)).replace('## Findings', 'UNVERIFIED: quoted from the artifact\n\n## Findings'));
  assert.equal(w096(root).length, 0);
});

test('the author is told to mark, the reviewer how to grade, and the rule is registered', () => {
  const brief = readFileSync(join(ROOT, 'skills', 'dev-stage-protocol', 'agent-brief.md'), 'utf8');
  assert.match(brief, /is written `UNVERIFIED: <claim>`, never stated as known/);
  const reviewer = readFileSync(join(ROOT, 'agents', 'dev-gate-reviewer.md'), 'utf8');
  assert.match(reviewer, /`UNVERIFIED:` claim a decision rests on is `MAJOR` until cited or a DEC \(§21\)/);
  const contract = readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8');
  assert.match(contract, /^## 21\. Unverified claims/m);
  assert.match(contract, /An agent never deletes an `UNVERIFIED` marker to pass a review/);
});
