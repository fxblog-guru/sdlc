/**
 * learn.mjs brief (DEV-CONTRACTS §19.5): the learning loop runs without anyone remembering it. The
 * session-start hook and the end of every stage print what is new since the last brief, once, and
 * nothing when nothing is new.
 *
 *   node --test tests/learn-brief.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SCRIPTS = join(ROOT, 'workspace', 'dev', 'scripts');
process.env.SDLC_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';

const LOG = (slug, attempt, problem) => `---
slug: ${slug}
gate: G4
stage: api
attempt: ${attempt}
verdict: ${attempt === 1 ? 'CHANGES_REQUESTED' : 'PASS'}
---

## Findings

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
${problem ? `| CR-001 | MAJOR | defect | openapi.yaml | ${problem} | x | y | api |` : ''}
`;
const LESSON = (updated = '2026-10-02', confidence = 'provisional') => `---
id: LRN-CURSOR
title: Every list endpoint is cursor-paginated
status: active
confidence: ${confidence}
applies_to: [g4, api]
evidence: [reviews/orders/G4-api-1.md]
probe: Does this list endpoint need a cursor?
created: 2026-10-02
updated: ${updated}
---

# Every list endpoint is cursor-paginated

- **Do:** a cursor.
`;
const IDEAS = (rows) => `---\nartifact: ideas\n---\n\n# Ideas\n\n## Ideas\n\n| Id | Idea | Evidence | Class | Value | Effort | Confidence | Ranked by | Status |\n|---|---|---|---|---|---|---|---|---|\n${rows.map(([id, idea]) => `| ${id} | ${idea} | monitoring/orders/post-release.md | change | | | | | new |`).join('\n')}\n`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-brief-'));
  const root = join(dir, '.sdlc');
  cpSync(SCRIPTS, join(root, 'scripts'), { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return { dir, root };
}
const add = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const brief = (root, ...args) => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'learn.mjs'), 'brief', '--root', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const REPEAT = {
  'reviews/orders/G4-api-1.md': LOG('orders', 1, 'List endpoint returns every row with no cursor pagination'),
  'reviews/invoices/G4-api-1.md': LOG('invoices', 1, 'List endpoint returns every row, no cursor pagination'),
};

test('an empty project briefs nothing and costs nothing', () => {
  const { root } = project({});
  assert.equal(brief(root), '');
});

test('a repeated finding is announced once, then not again until new evidence joins it', () => {
  const { root } = project(REPEAT);
  const first = brief(root);
  assert.match(first, /Learning: 1 new signal\(s\) not yet a lesson — \/sdlc-learn distils them/);
  assert.match(first, /recurring finding ×2/);
  assert.ok(existsSync(join(root, 'logs', 'learn-brief.json')), 'what was said is recorded');
  assert.equal(brief(root), '', 'said once');
  add(root, 'reviews/payments/G4-api-1.md', LOG('payments', 1, 'List endpoint returns every row without cursor pagination'));
  assert.match(brief(root), /recurring finding ×3/, 'new evidence makes it news again');
});

test('--peek prints without recording', () => {
  const { root } = project(REPEAT);
  assert.match(brief(root, '--peek'), /new signal/);
  assert.ok(!existsSync(join(root, 'logs', 'learn-brief.json')));
  assert.match(brief(root), /new signal/, 'peek did not use it up');
});

test('a signal a lesson already cites is not announced', () => {
  const { root } = project({ ...REPEAT, 'learnings/LRN-CURSOR.md': LESSON() });
  const text = readFileSync(join(root, 'learnings', 'LRN-CURSOR.md'), 'utf8').replace('evidence: [reviews/orders/G4-api-1.md]', 'evidence: [reviews/orders/G4-api-1.md, reviews/invoices/G4-api-1.md]');
  writeFileSync(join(root, 'learnings', 'LRN-CURSOR.md'), text);
  assert.doesNotMatch(brief(root), /new signal/);
});

test('a lesson written or changed after the first brief is named; the first brief only counts them', () => {
  const { root } = project({ 'learnings/LRN-CURSOR.md': LESSON() });
  assert.match(brief(root, '--today', '2026-10-03'), /Lessons: 1 in learnings\//);
  assert.equal(brief(root, '--today', '2026-10-03'), '');
  add(root, 'learnings/LRN-CURSOR.md', LESSON('2026-10-05', 'established'));
  assert.match(brief(root, '--today', '2026-10-06'), /Lesson: LRN-CURSOR \(established\) Every list endpoint/);
});

test('new ideas are offered for ranking once; a stale provisional lesson is named once', () => {
  const { root } = project({ 'ideas.md': IDEAS([['IDEA-001', 'Export to CSV']]), 'learnings/LRN-CURSOR.md': LESSON('2026-01-01') });
  const first = brief(root, '--today', '2026-10-23');
  assert.match(first, /Ideas: 1 new in ideas\.md to rank \(only a human ranks\) — IDEA-001 Export to CSV/);
  assert.match(first, /1 provisional with no new support in 60 days — \/sdlc-learn --audit/);
  assert.equal(brief(root, '--today', '2026-10-23'), '');
  add(root, 'ideas.md', IDEAS([['IDEA-001', 'Export to CSV'], ['IDEA-002', 'Dark mode']]));
  const next = brief(root, '--today', '2026-10-23');
  assert.match(next, /IDEA-002 Dark mode/);
  assert.doesNotMatch(next, /IDEA-001/);
});

test('an established lesson not yet shared is named once; once pushed it is quiet', () => {
  const { root } = project({ 'learnings/LRN-CURSOR.md': LESSON('2026-10-05', 'established') });
  assert.match(brief(root, '--today', '2026-10-06'), /Lessons: 1 established, not yet shared — learn\.mjs push/);
  assert.doesNotMatch(brief(root, '--today', '2026-10-06'), /not yet shared/, 'said once');
  const fake = join(root, '..', 'recall.mjs');
  writeFileSync(fake, 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0));\n');
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'learn.mjs'), 'push', '--root', root], { encoding: 'utf8', env: { ...process.env, SDLC_RECALL_BIN: fake } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  rmSync(join(root, 'logs', 'learn-brief.json'));
  assert.doesNotMatch(brief(root, '--today', '2026-10-06'), /not yet shared/, 'a pushed lesson is shared, under the same project name push used');
});

test('a broken brief file never fails the brief', () => {
  const { root } = project(REPEAT);
  add(root, 'logs/learn-brief.json', '{ not json');
  assert.match(brief(root), /new signal/);
});

test('the SessionStart hook prints the brief, and a second session stays quiet', () => {
  const { dir } = project(REPEAT);
  const run = () => spawnSync(process.execPath, [join(ROOT, 'hooks', 'session-start.mjs')], { cwd: dir, encoding: 'utf8', input: '{}', env: { ...process.env, AFX_NO_UPDATE_CHECK: '1' } });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /\[agentic-fx-dev\][\s\S]*Learning: 1 new signal/);
  assert.doesNotMatch(run().stdout, /Learning:/);
});

test('the stage protocol runs the brief at the end of a stage, and the contract says how the loop runs', () => {
  assert.match(readFileSync(join(ROOT, 'skills', 'dev-stage-protocol', 'SKILL.md'), 'utf8'), /^## 5\. After\n\n1\. [^\n]*\n {3}`learn\.mjs brief` verbatim \(§19\.5\)/m);
  assert.match(readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8'), /^### 19\.5 The loop runs on its own/m);
  const settings = JSON.parse(readFileSync(join(ROOT, 'settings.json'), 'utf8'));
  assert.ok(settings.permissions.allow.includes('Bash(node .sdlc/scripts/learn.mjs brief*)'));
});
