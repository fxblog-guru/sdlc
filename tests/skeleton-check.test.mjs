/**
 * skeleton-check.mjs (DEV-CONTRACTS §18.2, §18.3). release-management reached G8 with no root
 * README, ARCHITECTURE, CHANGELOG or Dockerfile, a web version of 0.0.0, 32 of 33 npm ranges caret,
 * no .nvmrc / engines / save-exact, no update bot and no licence check, CI images pinned by tag, and
 * alerts that lived only in Go code. The shipped skeleton must pass its own check; each mutation of
 * it must fail exactly one row.
 *
 *   node --test tests/skeleton-check.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const SKELETON = join(ROOT, 'workspace', 'dev', '_templates', 'skeleton');
const SCRIPT = join(ROOT, 'workspace', 'dev', 'scripts', 'skeleton-check.mjs');
const { checkSkeleton } = await import(pathToFileURL(SCRIPT).href);

/** The skeleton as a project would have it after the G6 tasks: placeholders filled. */
function project(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-skel-'));
  cpSync(SKELETON, dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '0.1.0', engines: { node: '>=22' }, dependencies: { react: '19.1.0' }, devDependencies: { vitest: '3.2.4' } }, null, 2));
  mutate(dir);
  return dir;
}
const failing = (dir) => checkSkeleton(dir).filter((r) => r.result === 'FAIL' || r.result === 'MISSING').map((r) => r.check);

test('the shipped skeleton passes its own check', () => {
  const rows = checkSkeleton(project());
  assert.deepEqual(rows.filter((r) => r.result !== 'PASS'), [], JSON.stringify(rows, null, 2));
  assert.ok(rows.length >= 12, `expected every §18.2 row, got ${rows.length}`);
});

const BROKEN = [
  ['no README', (d) => rmSync(join(d, 'README.md')), 'README.md'],
  ['a README with no runnable block', (d) => writeFileSync(join(d, 'README.md'), '# Demo\n\nIt is good.\n'), 'README.md'],
  ['ARCHITECTURE without a mermaid C4 diagram', (d) => writeFileSync(join(d, 'ARCHITECTURE.md'), '# Architecture\n\nboxes\n'), 'ARCHITECTURE.md'],
  ['CHANGELOG without Unreleased', (d) => writeFileSync(join(d, 'CHANGELOG.md'), '# Changelog\n'), 'CHANGELOG.md'],
  ['a FROM pinned by tag only', (d) => writeFileSync(join(d, 'Dockerfile'), readFileSync(join(d, 'Dockerfile'), 'utf8').replace(/@sha256:[0-9a-f]{64}/, '')), 'Dockerfile'],
  ['Taskfile without check:fast', (d) => writeFileSync(join(d, 'Taskfile.yml'), readFileSync(join(d, 'Taskfile.yml'), 'utf8').replace('check:fast:', 'quick:')), 'Taskfile.yml'],
  ['no renovate.json', (d) => rmSync(join(d, 'renovate.json')), 'renovate.json'],
  ['no licence step', (d) => writeFileSync(join(d, 'Taskfile.yml'), readFileSync(join(d, 'Taskfile.yml'), 'utf8').replace(/licen[cs]e/gi, 'lint')), 'licence check'],
  ['no .editorconfig', (d) => rmSync(join(d, '.editorconfig')), '.editorconfig'],
  ['no .nvmrc and no engines', (d) => { rmSync(join(d, '.nvmrc')); writeFileSync(join(d, 'package.json'), '{"name":"demo","version":"0.1.0"}'); }, 'node version'],
  ['.npmrc without save-exact', (d) => writeFileSync(join(d, '.npmrc'), 'fund=false\n'), '.npmrc'],
  ['a caret range in package.json', (d) => writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.1.0', engines: { node: '>=22' }, dependencies: { react: '^19.1.0' } })), 'exact versions'],
  ['version 0.0.0', (d) => writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'demo', version: '0.0.0', engines: { node: '>=22' } })), 'version'],
  ['a CI image pinned by tag', (d) => writeFileSync(join(d, '.gitlab-ci.yml'), 'test:\n  image: node:22\n  script: [true]\n'), 'CI images'],
  // release-management's shape: the tag behind a variable, and the `image: name:` form.
  ['a CI image pinned by tag through a variable', (d) => writeFileSync(join(d, '.gitlab-ci.yml'), 'variables:\n  GO_IMAGE: golang:1.27.2-bookworm\nbuild:\n  image: $GO_IMAGE\n'), 'CI images'],
  ['a CI image pinned by tag in the name form', (d) => writeFileSync(join(d, '.gitlab-ci.yml'), 'scan:\n  image:\n    name: zricethezav/gitleaks:v8.30.1\n    entrypoint: [""]\n'), 'CI images'],
  ['an alert with no runbook', (d) => rmSync(join(d, 'ops', 'runbooks', 'ServiceErrorBudgetBurn.md')), 'runbooks'],
  ['no collector config', (d) => rmSync(join(d, 'ops', 'otel', 'collector.yaml')), 'collector'],
  ['a collector that drops the log→trace link', (d) => writeFileSync(join(d, 'ops', 'otel', 'collector.yaml'), readFileSync(join(d, 'ops', 'otel', 'collector.yaml'), 'utf8').replace(/trace_parser/g, 'noop')), 'collector'],
];

for (const [name, mutate, row] of BROKEN) {
  test(`broken — ${name}`, () => {
    assert.deepEqual(failing(project(mutate)), [row]);
  });
}

test('a Go project reports its version through -ldflags instead of package.json', () => {
  const dir = project((d) => {
    rmSync(join(d, 'package.json'));
    rmSync(join(d, '.npmrc'));
    rmSync(join(d, '.nvmrc'));
    writeFileSync(join(d, 'go.mod'), 'module example.com/demo\n\ngo 1.26\n');
  });
  assert.deepEqual(failing(dir), [], 'the Taskfile build passes -X main.version');
  for (const f of ['Taskfile.yml', 'Dockerfile']) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace(/-X main\.version=[^ "']+/g, ''));
  assert.deepEqual(failing(dir), ['version']);
});

test('fullstack-go-react: go.mod in backend/ and an unreleased frontend package still report the Go version', () => {
  const dir = project((d) => {
    mkdirSync(join(d, 'backend'));
    writeFileSync(join(d, 'backend', 'go.mod'), 'module example.com/demo\n\ngo 1.26\n');
    mkdirSync(join(d, 'frontend'));
    renameSync(join(d, 'package.json'), join(d, 'frontend', 'package.json'));
    const pkg = JSON.parse(readFileSync(join(d, 'frontend', 'package.json'), 'utf8'));
    writeFileSync(join(d, 'frontend', 'package.json'), JSON.stringify({ ...pkg, version: '0.0.0', private: true }));
  });
  assert.deepEqual(failing(dir), [], 'the Go build carries the version; the SPA package need not');
  for (const f of ['Taskfile.yml', 'Dockerfile']) writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace(/-X main\.version=[^ "']+/g, ''));
  assert.deepEqual(failing(dir), ['version']);
});

test('the CLI exits 1 on any row that does not pass, and prints the table', () => {
  const dir = project((d) => rmSync(join(d, 'renovate.json')));
  let out = '';
  try {
    execFileSync(process.execPath, [SCRIPT, '--source', dir], { encoding: 'utf8' });
    assert.fail('must exit 1');
  } catch (err) {
    assert.equal(err.status, 1);
    out = err.stdout;
  }
  assert.match(out, /MISSING\s+renovate\.json/);
});
