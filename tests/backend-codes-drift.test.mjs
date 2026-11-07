/**
 * The §13.11 code table and the six checkers name the same codes, each in the script the table
 * says, with the class its letter says — the contract-drift rule for E100–E119 / W100–W119.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { profileChecks } from '../workspace/dev/scripts/lib/check.mjs';
import { pageDefaults } from '../workspace/dev/scripts/api-style-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const contract = readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8');
const section = contract.split('### 13.11')[1]?.split(/\n## /)[0] ?? '';
const rows = [...section.matchAll(/^\| `([EW]1[01]\d)` \| (error|warn) \| ([a-z-]+)/gm)].map(([, code, level, script]) => ({ code, level, script }));
const SCRIPTS = ['problems-check', 'api-style-check', 'limits-check', 'obs-check', 'conventions-check', 'schema-lint'];
const emitted = Object.fromEntries(SCRIPTS.map((s) => [s, new Set(readFileSync(join(ROOT, 'workspace', 'dev', 'scripts', `${s}.mjs`), 'utf8').match(/['"`][EW]1[01]\d['"`]/g)?.map((c) => c.slice(1, -1)) ?? [])]));

test('§13.11 lists codes, each once, with the class its letter says', () => {
  assert.ok(rows.length >= 30, `only ${rows.length} rows found`);
  assert.deepEqual(rows.map((r) => r.code), [...new Set(rows.map((r) => r.code))]);
  for (const r of rows) assert.equal(r.level, r.code.startsWith('E') ? 'error' : 'warn', r.code);
});

test('every code in the table is emitted by its script, and every emitted code is in the table', () => {
  for (const r of rows) assert.ok(emitted[r.script]?.has(r.code), `${r.code} is listed for ${r.script}, which never emits it`);
  const listed = new Set(rows.map((r) => `${r.script}:${r.code}`));
  for (const [s, codes] of Object.entries(emitted)) for (const c of codes) assert.ok(listed.has(`${s}:${c}`), `${s} emits ${c}, which §13.11 does not list for it`);
});

test('the shipped DEV-PROFILE ## Backend checks parses, and its page size comes from ## Defaults only', () => {
  const text = readFileSync(join(ROOT, 'DEV-PROFILE.md'), 'utf8');
  const checks = profileChecks(text);
  const defaults = profileChecks(text, 'Defaults');
  for (const k of ['status-table', 'env-prefix', 'event-api', 'metric-prefix', 'helper-threshold']) assert.ok(k in checks, `${k} missing`);
  assert.ok(!('page-size' in checks), 'page size is one fact: it lives in ## Defaults, not ## Backend checks (§3.2)');
  assert.equal(defaults['page-size'], '20 / 100');
  assert.deepEqual(pageDefaults({ checks, defaults }), { default: 20, max: 100 });
  assert.deepEqual(pageDefaults({ checks, defaults: { 'page-size': '25 / 200' } }), { default: 25, max: 200 }, 'a project changes it in Defaults');
});

test('§13.12 lists E120–E139 / W120–W139 once each, emitted by the script it names and by no other', () => {
  const sec = contract.split('### 13.12')[1]?.split(/\n## /)[0] ?? '';
  const rows12 = [...sec.matchAll(/^\| `([EW]1[23]\d)` \| (error|warn) \| ([a-z-]+)/gm)].map(([, code, level, script]) => ({ code, level, script }));
  assert.ok(rows12.length >= 30, `only ${rows12.length} §13.12 rows`);
  assert.deepEqual(rows12.map((r) => r.code), [...new Set(rows12.map((r) => r.code))]);
  const scripts = ['api-contract-check', 'contract-compat', 'api-score'];
  const emits = Object.fromEntries(scripts.map((s) => [s, new Set(readFileSync(join(ROOT, 'workspace', 'dev', 'scripts', `${s}.mjs`), 'utf8').match(/['"`][EW]1[23]\d['"`]/g)?.map((c) => c.slice(1, -1)) ?? [])]));
  for (const r of rows12) {
    assert.equal(r.level, r.code.startsWith('E') ? 'error' : 'warn', r.code);
    assert.ok(emits[r.script]?.has(r.code), `${r.code} is listed for ${r.script}, which never emits it`);
  }
  const listed = new Set(rows12.map((r) => `${r.script}:${r.code}`));
  for (const [s, codes] of Object.entries(emits)) for (const c of codes) assert.ok(listed.has(`${s}:${c}`), `${s} emits ${c}, which §13.12 does not list for it`);
});
