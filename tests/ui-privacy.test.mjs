/**
 * ui-privacy.mjs (DEV-CONTRACTS §13.13): no secret in a client log, a URL or web storage, and a
 * destructive call that asks first. The broken fixture breaks each rule once; the valid one none.
 *
 *   node --test tests/ui-privacy.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Findings } from '../workspace/dev/scripts/lib/check.mjs';
import { scanFile, uiPrivacy } from '../workspace/dev/scripts/ui-privacy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'ui-privacy');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'ui-privacy.mjs');
const codes = (src) => uiPrivacy(src).findings.list.map((f) => `${f.code} ${f.file}:${f.line}`).sort();

test('valid: the valid tree is clean, tests skipped', () => {
  assert.deepEqual(codes(join(FIX, 'valid')), []);
});

test('broken: a logged token, a token in storage and in a URL, an unguarded delete', () => {
  assert.deepEqual(codes(join(FIX, 'broken')), ['E150 auth.ts:4', 'E151 auth.ts:5', 'E151 auth.ts:6', 'W150 ReleaseRow.tsx:3']);
});

test('a waiver needs a reason; a comment naming a token is not code', () => {
  const run = (text, rel = 'a.ts') => { const f = new Findings(); scanFile({ rel, text }, f); return f.list.map((x) => x.code); };
  assert.deepEqual(run("console.log(token); // privacy-ok: the dev-only mock token, never real\n"), []);
  assert.deepEqual(run('console.log(token); // privacy-ok:\n'), ['E150']);
  assert.deepEqual(run('// console.log(token)\nconsole.log(count);\n'), []);
  assert.deepEqual(run("sessionStorage['refresh_token'] = t;\n"), ['E151']);
  assert.deepEqual(run("const p = new URLSearchParams({ password });\n"), ['E151']);
});

test('CLI: exit 1 on an error, 0 clean, 2 with no --src; --json carries the findings', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const bad = spawnSync(process.execPath, [SCRIPT, '--src', join(FIX, 'broken'), '--json'], { encoding: 'utf8', env });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).counts.E151, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--src', join(FIX, 'valid')], { encoding: 'utf8', env }).status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env }).status, 2);
});

test('§13.13 lists exactly the codes ui-privacy emits, each with the class its letter says', () => {
  const contract = readFileSync(join(here, '..', 'DEV-CONTRACTS.md'), 'utf8');
  const section = contract.split('### 13.13')[1]?.split(/\n## /)[0] ?? '';
  const rows = [...section.matchAll(/^\| `([EW]15\d)` \| (error|warn) \| ([a-z-]+)/gm)].map(([, code, level, script]) => ({ code, level, script }));
  const emitted = new Set(readFileSync(SCRIPT, 'utf8').match(/['"`][EW]15\d['"`]/g).map((c) => c.slice(1, -1)));
  assert.deepEqual(rows.map((r) => r.code).sort(), [...emitted].sort());
  for (const r of rows) {
    assert.equal(r.script, 'ui-privacy');
    assert.equal(r.level, r.code.startsWith('E') ? 'error' : 'warn');
  }
});

test('W150 ignores DOM and collection calls and copy helpers; it reads a mutation hook or a DELETE', () => {
  const run = (text) => { const f = new Findings(); scanFile({ rel: 'A.tsx', text }, f); return f.list.map((x) => x.code); };
  assert.deepEqual(run("window.removeEventListener('scroll', f); listeners.delete(l); el.removeChild(x);\n"), []);
  assert.deepEqual(run('<button aria-label={COPY.removeChosen(name)} />\n'), []);
  assert.deepEqual(run('const m = useDeleteRelease();\n'), ['W150']);
  assert.deepEqual(run("fetch(url, { method: 'DELETE' });\n"), ['W150']);
});
