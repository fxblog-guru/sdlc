/**
 * design-system.mjs kit-check and classes (DEV-CONTRACTS §13.3).
 *
 * kit-check: every component the ui-spec's ## Components names is built, and every kit dependency
 * is used. classes: every class the sources use emits a CSS rule, and an arbitrary value carries
 * tokens-ok. Both are held to a fixture that must fail and one that must pass. The compile path is
 * exercised live when a Tailwind 3 install is found (the kit's verification project or
 * release-management); the judging is tested on a stored compiled stylesheet so it always runs.
 *
 *   node --test tests/kit-check.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { kebab, kitCheck, specComponents } from '../workspace/dev/scripts/lib/kit.mjs';
import { definedClasses, extractClasses, isArbitrary, isTailwindish, judgeClasses, utilityOf } from '../workspace/dev/scripts/lib/classes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'kit');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'design-system.mjs');
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const spec = (d) => readFileSync(join(FIX, d, 'ui-spec.md'), 'utf8');

test('specComponents splits kit components from bespoke ones', () => {
  const s = specComponents(spec('valid'));
  assert.deepEqual([...s.kit.keys()], ['Button', 'DropdownMenu', 'DataTable']);
  assert.deepEqual([...s.named.keys()], ['DeployStateCell']);
  assert.equal(kebab('DropdownMenu'), 'dropdown-menu');
  assert.equal(kebab('DataTable'), 'data-table');
});

test('kit-check: the valid project passes', () => {
  const r = kitCheck({ project: join(FIX, 'valid'), specText: spec('valid') });
  assert.deepEqual(r.findings, []);
  const cli = run(['kit-check', '--project', join(FIX, 'valid'), '--spec', join(FIX, 'valid', 'ui-spec.md')]);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});

test('kit-check: missing kit files, a missing bespoke component and unused kit deps fail', () => {
  const r = kitCheck({ project: join(FIX, 'broken'), specText: spec('broken') });
  const got = r.findings.map((f) => `${f.kind}:${f.name}`).sort();
  assert.deepEqual(got, [
    'missing-bespoke:DeployStateCell',
    'missing-kit:DataTable',
    'missing-kit:DropdownMenu',
    'unused-dep:@radix-ui/react-dropdown-menu',
    'unused-dep:@radix-ui/react-tabs',
    'unused-dep:@tanstack/react-table',
  ]);
  const cli = run(['kit-check', '--project', join(FIX, 'broken'), '--spec', join(FIX, 'broken', 'ui-spec.md')]);
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /2 kit component\(s\) missing · 1 bespoke missing · 3 unused kit dependency/);
});

test('extractClasses reads class contexts only: className, cn/cva calls, class constants', () => {
  const src = [
    "const BTN = 'h-control-sm px-3';",
    "const label = 'Delete release';",
    'export const X = () => <div className={cn(BTN, ok && "h-40", `w-px ${y}`)} title="not-a-class" />;',
    "const v = cva('rounded-md', { variants: { tone: { 'danger-outline': 'border border-danger' } } });",
    "if (kind === 'not-found') {}",
  ].join('\n');
  const tokens = extractClasses(src).map((u) => u.token);
  assert.deepEqual(tokens.sort(), ['border', 'border-danger', 'h-40', 'h-control-sm', 'px-3', 'rounded-md', 'w-px'].sort());
});

test('utility, arbitrary and Tailwind-shaped tokens', () => {
  assert.equal(utilityOf('md:hover:bg-surface-2'), 'bg-surface-2');
  assert.equal(utilityOf('[&_svg]:size-icon-md'), 'size-icon-md');
  assert.ok(isArbitrary('w-[123px]'));
  assert.ok(!isArbitrary('[&_svg]:size-4'), 'an arbitrary variant is not an arbitrary value');
  assert.ok(isTailwindish('h-40') && isTailwindish('max-h-60') && isTailwindish('size-icon-md'));
  assert.ok(!isTailwindish('not-found') && !isTailwindish('sign-in') && !isTailwindish('danger-outline'));
  assert.ok(definedClasses('.aspect-\\[210\\/297\\]{} .\\[\\&_svg\\]\\:size-icon-md svg{}').has('[&_svg]:size-icon-md'));
});

const compiled = definedClasses(readFileSync(join(FIX, 'compiled.css'), 'utf8'));
function judge(dir) {
  const file = join(FIX, dir, 'src', 'features', 'ReleasePage.tsx');
  const text = readFileSync(file, 'utf8');
  const uses = extractClasses(text).map((u) => ({ ...u, file: 'f' }));
  return judgeClasses(uses, compiled, new Map([['f', text.split('\n')]]));
}

test('classes: the valid fixture has no dead class, and its arbitrary value is excused by tokens-ok', () => {
  const r = judge('valid');
  assert.deepEqual(r.dead, []);
  assert.deepEqual(r.arbitrary, []);
});

test('classes: classes that emit no rule, and an arbitrary value without tokens-ok, fail', () => {
  const r = judge('broken');
  assert.deepEqual(r.dead.map((u) => u.token).sort(), ['h-40', 'w-px']);
  assert.deepEqual(r.arbitrary.map((u) => u.token), ['w-[123px]']);
  const cli = run(['classes', '--project', join(FIX, 'broken'), '--compiled', join(FIX, 'compiled.css')]);
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /2 emit no rule/);
  const ok = run(['classes', '--project', join(FIX, 'valid'), '--compiled', join(FIX, 'compiled.css')]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

// A real Tailwind 3 install, for the compile path: the kit's verification project, then the
// release-management web app. Skipped where neither exists (CI installs the kit project).
const LIVE = [process.env.KIT_VERIFY_DIR, join(here, '..', '..', 'release-management', 'web'), join(here, '..', '..', '..', '..', '..', 'release-management', 'web')]
  .filter(Boolean)
  .find((d) => existsSync(join(d, 'node_modules', 'tailwindcss', 'package.json')) && existsSync(join(d, 'tailwind.config.ts')));

test('live: the project\'s own Tailwind compiles, and a replaced scale\'s classes are reported dead', { skip: !LIVE && 'no Tailwind 3 project found' }, () => {
  const r = run(['classes', '--project', LIVE, '--src', join(here, 'fixtures', 'kit', 'broken', 'src'), '--json']);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([...new Set(out.dead.map((u) => u.token))].sort(), ['h-40', 'w-px'], r.stderr);
  assert.equal(r.status, 1);
});
