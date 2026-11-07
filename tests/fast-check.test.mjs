/**
 * fast-check.mjs — a `fast` slug's plan holds to what the class promised (DEV-CONTRACTS §15.1).
 *
 * Each test builds a scratch project: a `fast` problem.md, a pipeline that runs env-doctor, a key
 * list, a decision ledger and a state.json, then a slices.md that is clean until one thing is
 * broken. The CLI is run once, on the clean project and on a broken one, for its exit codes.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { check } from '../workspace/dev/scripts/fast-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'dev', 'scripts', 'fast-check.mjs');

const SLICES = `---
slug: notes
stage: plan
artifact: slices
status: draft
authored_by: /sdlc-fast
reviewed_by: pending
tracker: none
created: 2026-11-01
updated: 2026-11-01
requirements: []
---

## Requested

"I want a product I can use right away, skip the analysis" — Luan, 2026-11-01.

## Skeleton

- Pipeline: \`.gitlab-ci.yml\`
- Keys: \`ops/config/keys.md\`
- Staging: https://staging.example.dev

## Slices

| # | Slice | A user can then | REQ | Escalates | Smoke |
|---|---|---|---|---|---|
| 1 | Deploying skeleton | open the staging URL and see /readyz answer | — | none | curl -f https://staging.example.dev/readyz |
| 2 | Notes | write a note and find it in the list | REQ-001 | none | task smoke:notes |
| 3 | Sign-in with GitLab | sign in with their GitLab account | REQ-002 | G2 | task smoke:signin |

## Decisions

DEC-001 — local installs sign in with the local key.
`;

const STATE = (g2) => JSON.stringify({ initiatives: [{ slug: 'notes', stages: [{ gate: 'G2', state: g2 }, { gate: 'G3', state: 'SKIPPED' }] }] });

function project({ slices = SLICES, cls = 'fast', ci = 'deploy:\n  script: node .sdlc/scripts/env-doctor.mjs --env staging\n', g2 = 'PASS', dec = 'assumed' } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'fast-check-'));
  const root = join(repo, '.sdlc');
  for (const d of ['intake/notes', 'plan/notes', 'decisions']) mkdirSync(join(root, d), { recursive: true });
  mkdirSync(join(repo, 'ops', 'config'), { recursive: true });
  writeFileSync(join(root, 'intake', 'notes', 'problem.md'), `---\nslug: notes\nchange_class: ${cls}\n---\n\n## Problem statement\n\nx\n`);
  writeFileSync(join(root, 'plan', 'notes', 'slices.md'), slices);
  writeFileSync(join(root, 'decisions', 'notes.md'), `---\nslug: notes\n---\n\n## Decisions\n\n| Id | Question | Status | Blocks | Answer |\n|---|---|---|---|---|\n| DEC-001 | How does a local install sign in? | ${dec} | — | the local key |\n`);
  writeFileSync(join(root, 'state.json'), STATE(g2));
  if (ci) writeFileSync(join(repo, '.gitlab-ci.yml'), ci);
  writeFileSync(join(repo, 'ops', 'config', 'keys.md'), '| Key | Purpose |\n|---|---|\n| DATABASE_URL | db |\n');
  return { repo, root, done: () => rmSync(repo, { recursive: true, force: true }) };
}

const codes = (opts, tweak) => {
  const p = project({ ...opts, slices: tweak ? tweak(SLICES) : SLICES });
  try { return check(p.root, 'notes', p.repo).map((f) => `${f.level}:${f.code}`); } finally { p.done(); }
};

test('a fast plan with a skeleton, a quote, honest escalation and recorded decisions is clean', () => {
  assert.deepEqual(codes({}), []);
});

test('F1: no slices.md, or a slug that is not class fast', () => {
  const p = project();
  rmSync(join(p.root, 'plan', 'notes', 'slices.md'));
  try { assert.deepEqual(check(p.root, 'notes', p.repo).map((f) => f.code), ['F1']); } finally { p.done(); }
  assert.deepEqual(codes({ cls: 'change' }), ['error:F1']);
});

test('F2: the request needs the requester\'s words and a date', () => {
  assert.deepEqual(codes({}, (s) => s.replace(/"I want[^\n]*/, 'Luan wants it fast.')), ['error:F2']);
  assert.deepEqual(codes({}, (s) => s.replace('2026-11-01.', 'today.')), ['error:F2']);
});

test('F3: the pipeline exists before any feature, runs env-doctor, and the key list exists', () => {
  assert.deepEqual(codes({ ci: null }), ['error:F3']);
  assert.deepEqual(codes({ ci: 'deploy:\n  script: docker compose up -d\n' }), ['error:F3']);
  assert.deepEqual(codes({}, (s) => s.replace('- Pipeline: `.gitlab-ci.yml`\n', '')), ['error:F3']);
});

test('F4: the slice table keeps its columns and its order', () => {
  assert.deepEqual(codes({}, (s) => s.replace('| 2 | Notes', '| 4 | Notes')), ['error:F4']);
  assert.deepEqual(codes({}, (s) => s.replace('| Escalates | Smoke |', '| Escalates | Check |')), ['error:F4']);
});

test('F5: a slice escalates only to G2, G3 or G4', () => {
  assert.deepEqual(codes({}, (s) => s.replace('| REQ-002 | G2 |', '| REQ-002 | G6 |')), ['error:F5']);
});

test('F6: an escalated gate still SKIPPED by class fails the slice', () => {
  assert.deepEqual(codes({ g2: 'SKIPPED' }), ['error:F6']);
  assert.deepEqual(codes({}, (s) => s.replace('| REQ-001 | none |', '| REQ-001 | G3 |')), ['error:F6']);
});

test('F7: risky words with nothing escalated warn, and do not fail', () => {
  assert.deepEqual(codes({}, (s) => s.replace('| REQ-002 | G2 |', '| REQ-002 | none |')), ['warn:F7']);
});

test('F8: a decision taken on the requester\'s behalf is in the ledger, assumed or answered', () => {
  assert.deepEqual(codes({ dec: 'open' }), ['error:F8']);
  assert.deepEqual(codes({}, (s) => s.replace('DEC-001', 'DEC-009')), ['error:F8']);
});

test('the CLI exits 0 on a clean plan and 1 on an error', () => {
  for (const [opts, status] of [[{}, 0], [{ g2: 'SKIPPED' }, 1]]) {
    const p = project(opts);
    try {
      const r = spawnSync(process.execPath, [SCRIPT, 'notes', '--root', p.root, '--repo', p.repo], { encoding: 'utf8' });
      assert.equal(r.status, status, r.stdout + r.stderr);
    } finally { p.done(); }
  }
});
