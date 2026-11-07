/**
 * contract-compat.mjs: the no-dependency breaking-change floor under `oasdiff breaking` (§6, §13.12).
 *
 * The baseline is the api-contract valid fixture. Each case changes one thing in a copy and must
 * raise exactly the code named — and an additive change must raise nothing — so a check that
 * goes quiet, or one that calls an additive change breaking, fails here.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from './backend-fixture.mjs';
import { declaredBreaks } from '../workspace/dev/scripts/contract-compat.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = join(here, 'fixtures', 'api-contract', 'valid', 'openapi.yaml');

function variant(edits, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-compat-'));
  let s = readFileSync(BASE, 'utf8');
  for (const [from, to] of edits) {
    if (!s.includes(from)) throw new Error(`anchor not found: ${from}`);
    s = s.replace(from, () => to);
  }
  const p = join(dir, 'new.yaml');
  writeFileSync(p, s);
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, name), text);
  return { dir, p };
}

test('a contract compared with itself has no break', () => {
  const r = run('contract-compat.mjs', [BASE, BASE], here);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary['baseline operations'], 6);
});

test('additive changes are not breaks: a new operation, an optional field, a looser bound, an enum value under extensible', () => {
  const { p } = variant([
    ["        notes: { type: [string, 'null'], maxLength: 10000, default: null }", "        notes: { type: [string, 'null'], maxLength: 10000, default: null }\n        label: { type: string, maxLength: 40 }"],
    ['        name: { type: string, minLength: 1, maxLength: 100 }\n        price_minor', '        name: { type: string, minLength: 1, maxLength: 200 }\n        price_minor'],
    ['        status: { type: string, enum: [draft, live] }', '        status: { type: string, enum: [draft, live, archived] }'],
    ['  /releases/{release_id}:\n', "  /tags:\n    get:\n      operationId: listTags\n      responses:\n        '200': { description: ok }\n  /releases/{release_id}:\n"],
  ]);
  const r = run('contract-compat.mjs', [BASE, p], here);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary.added, 1);
});

const CASES = [
  ['E135 an operation removed', [['    patch:\n      operationId: updateRelease', '    x-gone:\n      operationId: updateRelease']], 'E135', /updateRelease: operation removed/],
  ['E135 a status removed', [["        '304': { description: Not modified. }\n", '']], 'E135', /getRelease: status 304 no longer answered/],
  ['E136 a response field removed', [['      required: [id, name, status, price_minor, currency, notes, created_at]\n      properties:\n        id: { type: string, maxLength: 64, readOnly: true }\n', '      required: [name, status, price_minor, currency, notes, created_at]\n      properties:\n']], 'E136', /response field removed/],
  ['E136 a request field made required', [['      required: [name, price_minor, currency]\n', '      required: [name, price_minor, currency, notes]\n']], 'E136', /request field made required/],
  ['E136 a required parameter added', [["        - $ref: '#/components/parameters/Cursor'\n", "        - $ref: '#/components/parameters/Cursor'\n        - { name: project_id, in: query, required: true, schema: { type: string, maxLength: 64 } }\n"]], 'E136', /required parameter `project_id` added/],
  ['E137 a type changed', [['        price_minor: { type: integer, minimum: 0, maximum: 100000000 }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null', '        price_minor: { type: string, maxLength: 20 }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null']], 'E137', /type integer → string/],
  ['E137 an enum value removed', [['        status: { type: string, enum: [draft, live] }', '        status: { type: string, enum: [draft] }']], 'E137', /"live" removed/],
  ['E137 an enum value added under closed', [['  x-enum-policy: extensible', '  x-enum-policy: closed'], ['        status: { type: string, enum: [draft, live] }', '        status: { type: string, enum: [draft, live, archived] }']], 'E137', /added under x-enum-policy: closed/],
  ['E137 a request bound tightened', [['        name: { type: string, minLength: 1, maxLength: 100 }\n        price_minor', '        name: { type: string, minLength: 1, maxLength: 50 }\n        price_minor']], 'E137', /maxLength 100 → 50/],
  ['W136 an enum value added with no policy stated', [['  x-enum-policy: extensible\n', ''], ['        status: { type: string, enum: [draft, live] }', '        status: { type: string, enum: [draft, live, archived] }']], 'W136', /x-enum-policy is not stated/],
];

for (const [name, edits, code, message] of CASES) {
  test(name, () => {
    const { p } = variant(edits);
    const r = run('contract-compat.mjs', [BASE, p], here);
    const hits = r.json.findings.filter((f) => f.code === code);
    assert.ok(hits.some((f) => message.test(f.message)), `${code} ${message} not raised:\n${r.stdout}`);
    const others = Object.keys(r.json.counts).filter((c) => c !== code);
    assert.deepEqual(others, [], `other codes raised: ${others.join(', ')}\n${r.stdout}`);
    assert.equal(r.status, code.startsWith('E') ? 1 : 0);
  });
}

test('W136 on a shared enum is said once, not once per response that reaches it', () => {
  const { p } = variant([['  x-enum-policy: extensible\n', ''], ['        - /problems/upstream-timeout\n', '        - /problems/upstream-timeout\n        - /problems/release-locked\n']]);
  const base = variant([['  x-enum-policy: extensible\n', '']]).p;
  const r = run('contract-compat.mjs', [base, p], here);
  assert.equal(r.json.counts.W136, 1, r.stdout);
});

test('W135: a break contract-diff.md declares is reported, not failed', () => {
  const diff = '## Removed\n\n| Change | Where | Deprecated since | Removal date | Consumers notified |\n|---|---|---|---|---|\n| removed | `updateRelease` | 2026-09-01 | 2026-12-01 | yes |\n';
  const { dir, p } = variant([['    patch:\n      operationId: updateRelease', '    x-gone:\n      operationId: updateRelease']], { 'contract-diff.md': diff });
  const r = run('contract-compat.mjs', [BASE, p, '--declared', join(dir, 'contract-diff.md')], here);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(Object.keys(r.json.counts), ['W135']);
  assert.ok(declaredBreaks(diff).has('updateRelease'));
});

test('--oasdiff says NOT RUN when the binary is absent, and the fallback still runs', () => {
  const r = run('contract-compat.mjs', [BASE, BASE, '--oasdiff'], here);
  assert.equal(r.status, 0);
  assert.match(String(r.json.summary.oasdiff), /^(NOT RUN|exit \d+)/);
});
