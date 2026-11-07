/**
 * The contract and the linter name the same rules.
 *
 * DEV-CONTRACTS.md promised an orphan check and a "MINOR carried across three gates" warning for a
 * whole release while lint-dev.mjs implemented neither, and nothing noticed. This test reads both
 * files and fails when a rule code appears in one and not the other.
 *
 *   node --test tests/contract-drift.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const contract = readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8');
// Two linters share one code table: lint-dev.mjs (artifacts) and commit-lint.mjs (history, §18.1).
const linter = ['lint-dev.mjs', 'commit-lint.mjs', 'lib/ui-spec.mjs'].map((f) => readFileSync(join(ROOT, 'workspace', 'dev', 'scripts', f), 'utf8')).join('\n');

/** Codes the contract names anywhere: `E016`, W018, in a table or in prose. */
const named = new Set(contract.match(/\b[EW](?:0\d\d|14\d)\b/g) ?? []);

/** Codes the linter can emit: the rule argument of a finding, always a quoted literal. */
const emitted = new Set([...linter.matchAll(/['"`]([EW](?:0\d\d|14\d))['"`]/g)].map((m) => m[1]));

test('the extraction finds both sides, or this test proves nothing', () => {
  assert.ok(named.size >= 20, `found only ${named.size} codes in the contract`);
  assert.ok(emitted.size >= 20, `found only ${emitted.size} codes in the linter`);
});

test('every rule code the contract names is implemented by lint-dev.mjs', () => {
  const missing = [...named].filter((c) => !emitted.has(c)).sort();
  assert.deepEqual(missing, [], `named in DEV-CONTRACTS.md, never emitted by lint-dev.mjs: ${missing.join(', ')}`);
});

test('every rule code lint-dev.mjs emits is named in the contract', () => {
  const undocumented = [...emitted].filter((c) => !named.has(c)).sort();
  assert.deepEqual(undocumented, [], `emitted by lint-dev.mjs, not named in DEV-CONTRACTS.md: ${undocumented.join(', ')}`);
});

test('the §11.2 rule table lists each code once, with its class', () => {
  const table = contract.split('### 11.2')[1]?.split(/\n## /)[0] ?? '';
  const rows = [...table.matchAll(/^\| `([EW](?:0\d\d|14\d))` \| (error|warn) \|/gm)];
  assert.ok(rows.length > 0, '§11.2 has no rule rows');
  const codes = rows.map((r) => r[1]);
  assert.deepEqual(codes, [...new Set(codes)], 'a code is listed twice');
  assert.deepEqual([...codes].sort(), [...emitted].sort(), '§11.2 must list exactly the codes the linter emits');
  for (const [, code, level] of rows) {
    assert.equal(level, code.startsWith('E') ? 'error' : 'warn', `${code} is listed as ${level}`);
  }
});
