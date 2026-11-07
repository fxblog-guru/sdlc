/**
 * fixture-check.mjs — fixture and pilot data validate against the contract schema they claim.
 *
 * On Recall the contract rejected 85 of 270 pilot lines at G8; each was a field renamed or
 * tightened at G4 after the file was written. Every case here starts from a clean file and breaks it.
 *
 *   node --test tests/fixture-check.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseYaml } from '../workspace/dev/scripts/lib/yaml.mjs';
import { checkFixtures } from '../workspace/dev/scripts/fixture-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'fixture-check.mjs');
const CONTRACT = readFileSync(join(here, 'fixtures', 'api-contract', 'valid', 'openapi.yaml'), 'utf8');

const withFixtures = (entries) => CONTRACT.replace('info:\n', `info:\n  x-fixtures:\n${entries.map((e) => `    - { ${Object.entries(e).map(([k, v]) => `${k}: ${v}`).join(', ')} }`).join('\n')}\n`);

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-fix-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const GOOD = '{"field":"title","code":"required"}\n{"field":"name","code":"too_long","limit":200}\n';
const codes = (r) => r.findings.list.map((f) => f.code);

test('a fixture whose every record validates is clean, and every record is counted', () => {
  const dir = repo({ 'testdata/errors.jsonl': GOOD });
  const r = checkFixtures(parseYaml(withFixtures([{ path: 'testdata/errors.jsonl', schema: 'FieldError' }])), dir);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(codes(r), []);
  assert.deepEqual(r.summary, { fixtures: 1, records: 2, valid: 2 });
});

test('E161 a record that breaks its schema: a renamed field, a value outside an enum, a bad line', () => {
  const cases = [
    ['{"name":"title","code":"required"}\n', /field/],
    ['{"field":"title","code":"missing"}\n', /code/],
    ['{"field":"title",\n', /not JSON/],
  ];
  for (const [line, mentions] of cases) {
    const dir = repo({ 'testdata/errors.jsonl': GOOD + line });
    const r = checkFixtures(parseYaml(withFixtures([{ path: 'testdata/errors.jsonl', schema: 'FieldError' }])), dir);
    rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(codes(r), ['E161'], line);
    assert.equal(r.findings.list[0].line, 3, 'the line of the bad record');
    assert.match(r.findings.list[0].message, mentions);
  }
});

test('E161 reports at most five records per file, then a count', () => {
  const bad = '{"field":"x","code":"nope"}\n'.repeat(8);
  const dir = repo({ 'testdata/errors.json': `[${bad.trim().split('\n').join(',')}]` });
  const r = checkFixtures(parseYaml(withFixtures([{ path: 'testdata/errors.json', schema: 'FieldError' }])), dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.findings.list.length, 6);
  assert.match(r.findings.list[5].message, /3 more/);
});

test('E160 a listed file that is missing, or a schema the contract lacks', () => {
  const dir = repo({ 'testdata/errors.jsonl': GOOD });
  const r = checkFixtures(parseYaml(withFixtures([{ path: 'testdata/gone.jsonl', schema: 'FieldError' }, { path: 'testdata/errors.jsonl', schema: 'Card' }])), dir);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(codes(r), ['E160', 'E160']);
});

test('W160 data files exist and the contract lists none; the CLI exits 1 on an error and 0 on a warning', () => {
  const dir = repo({ 'testdata/pilot/errors.jsonl': '{"field":"x","code":"nope"}\n', 'dev/api/demo/openapi.yaml': CONTRACT });
  const quiet = spawnSync(process.execPath, [SCRIPT, 'demo', '--root', join(dir, 'dev')], { encoding: 'utf8' });
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr);
  assert.match(quiet.stdout, /W160/);
  writeFileSync(join(dir, 'dev', 'api', 'demo', 'openapi.yaml'), withFixtures([{ path: 'testdata/pilot/errors.jsonl', schema: 'FieldError' }]));
  const loud = spawnSync(process.execPath, [SCRIPT, 'demo', '--root', join(dir, 'dev')], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(loud.status, 1, loud.stdout);
  assert.match(loud.stdout, /E161/);
});
