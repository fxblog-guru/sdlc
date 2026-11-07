/**
 * eol-check.mjs — byte-compared files are pinned `eol=lf` by their effective attribute, and none is
 * committed with CRLF.
 *
 *   node --test tests/eol-check.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkEol } from '../workspace/dev/scripts/eol-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'eol-check.mjs');

function repo(files, { autocrlf = 'false' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-eol-'));
  const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'core.autocrlf', autocrlf);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return dir;
}

const codes = (dir) => {
  const r = checkEol(dir).findings.list.map((f) => `${f.code} ${f.file}`);
  rmSync(dir, { recursive: true, force: true });
  return r;
};

test('pinned golden files and fixtures are clean; other files are not checked', () => {
  const dir = repo({ '.gitattributes': 'testdata/** text eol=lf\n*.golden text eol=lf\n', 'testdata/a.json': '{}\n', 'out.golden': 'x\n', 'src/main.go': 'package main\r\n' });
  assert.deepEqual(codes(dir), []);
});

test('E170 a fixture with no eol=lf attribute', () => {
  const dir = repo({ '.gitattributes': '*.golden text eol=lf\n', 'testdata/a.json': '{}\n', 'out.golden': 'x\n' });
  assert.deepEqual(codes(dir), ['E170 testdata/a.json']);
});

// The guard reads git's effective value, never the .gitattributes text: a later line undoes this one.
test('E170 a line that looks right but a later pattern overrides it', () => {
  const dir = repo({ '.gitattributes': 'testdata/** text eol=lf\ntestdata/*.json text eol=crlf\n', 'testdata/a.json': '{}\n' });
  assert.deepEqual(codes(dir), ['E170 testdata/a.json']);
});

test('E171 a fixture committed with CRLF, even once pinned', () => {
  const dir = repo({ 'testdata/a.json': '{}\r\n' });
  // Adding only .gitattributes leaves a.json's committed CRLF bytes in the index, as on a real repo
  // that pins after the fact and forgets `git add --renormalize`.
  writeFileSync(join(dir, '.gitattributes'), 'testdata/** text eol=lf\n');
  execFileSync('git', ['-C', dir, 'add', '.gitattributes'], { encoding: 'utf8' });
  execFileSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-qm', 'pin'], { encoding: 'utf8' });
  assert.deepEqual(codes(dir), ['E171 testdata/a.json']);
});

test('a binary fixture is not checked, and the CLI exits 1 on a finding, 2 outside git', () => {
  const dir = repo({ '.gitattributes': 'testdata/*.png -text\n', 'testdata/a.png': 'PNG\r\n', 'baselines/b.json': '{}\n' });
  const r = spawnSync(process.execPath, [SCRIPT, '--repo', dir], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /E170 baselines\/b\.json/);
  assert.doesNotMatch(r.stdout, /a\.png/);
  const outside = mkdtempSync(join(tmpdir(), 'sdlc-eol-none-'));
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--repo', outside], { encoding: 'utf8' }).status, 2);
  rmSync(outside, { recursive: true, force: true });
});
