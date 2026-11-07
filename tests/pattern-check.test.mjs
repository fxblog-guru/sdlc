/**
 * pattern-check.mjs — a component that matches a pattern obligation and skips its wrapper fails (DEV-CONTRACTS §13.3).
 *
 * The fixture is release-management's defect in miniature: a DiscardGuard exists, one dialog with
 * input uses it, one does not, one confirm has no input, one is waived with a reason, one carries
 * a bare marker that must not count, and the guard file and a test are excluded.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { check, globToRegExp, loadObligations, parseObligations } from '../workspace/dev/scripts/pattern-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'pattern-check');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'pattern-check.mjs');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const cli = (root, ...args) => spawnSync(process.execPath, [SCRIPT, 'demo', '--root', join(root, 'dev'), '--src', root, ...args], { encoding: 'utf8', env });

test('globToRegExp: ** spans directories, * stays in a segment', () => {
  assert.ok(globToRegExp('web/src/**/*.tsx').test('web/src/a/b/C.tsx'));
  assert.ok(globToRegExp('web/src/**/*.tsx').test('web/src/C.tsx'));
  assert.ok(!globToRegExp('web/src/*.tsx').test('web/src/a/C.tsx'));
  assert.ok(globToRegExp('**/*.{ts,tsx}').test('x/y.ts'));
});

test('parseObligations: flow and block lists, quoted regexes; a bad shape names its line', () => {
  const [ob] = parseObligations('obligations:\n  - id: PO-001\n    files: [a/**/*.tsx]\n    match: [\'<Dialog\\b\', "<Sheet\\\\b"]\n    require:\n      - useGuard\n');
  assert.equal(ob.id, 'PO-001');
  assert.ok(ob.match[0].test('<Dialog open>'));
  assert.ok(!ob.match[0].test('<DialogTitle>'));
  assert.ok(ob.match[1].test('<Sheet>') && !ob.match[1].test('<SheetTitle>'), 'a doubled backslash in double quotes');
  assert.ok(ob.require[0].test('useGuard('));
  assert.throws(() => parseObligations('obligations:\n  - id: PO-1\n    files: [x]\n    match: [x]\n    require: [y]\n'), /PO-NNN/);
  assert.throws(() => parseObligations('obligations:\n  - id: PO-001\n    files: [x]\n    match: [x]\n'), /require/);
  assert.throws(() => parseObligations('obligations:\n  - id: PO-001\n    colour: red\n'), /line 3: unknown key/);
});

test('check: only the unguarded dialog and the bare marker fail; the waiver is listed with its reason', () => {
  const { obligations } = loadObligations(join(FIX, 'dev'), 'demo');
  const [r] = check(obligations, FIX);
  assert.deepEqual(r.violations.sort(), ['web/src/features/BareMarkerDialog.tsx', 'web/src/features/UnguardedDialog.tsx']);
  assert.deepEqual(r.waived.map((w) => w.file), ['web/src/features/WaivedDialog.tsx']);
  assert.match(r.waived[0].reason, /read-only preview/);
  assert.equal(r.candidates, 4, 'guarded + unguarded + waived + bare; the confirm, the guard and the test are not candidates');
});

test('cli: exit 1 naming each violation; exit 0 once the dialog is guarded; exit 2 with no obligations', () => {
  const bad = cli(FIX);
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /FAIL PO-001 web\/src\/features\/UnguardedDialog\.tsx/);
  const root = mkdtempSync(join(tmpdir(), 'pattern-'));
  cpSync(FIX, root, { recursive: true });
  writeFileSync(join(root, 'web/src/features/UnguardedDialog.tsx'), 'export const U = () => { useDiscardGuard(true); return <Dialog><Textarea /></Dialog>; };\n');
  writeFileSync(join(root, 'web/src/features/BareMarkerDialog.tsx'), 'export const B = () => <Dialog><Input /><DiscardBar /></Dialog>;\n');
  const ok = cli(root);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const empty = mkdtempSync(join(tmpdir(), 'pattern-'));
  mkdirSync(join(empty, 'dev'));
  assert.equal(cli(empty).status, 2);
});

test('obligations may live in the ui-spec as a fenced yaml block', () => {
  const root = mkdtempSync(join(tmpdir(), 'pattern-'));
  mkdirSync(join(root, 'dev', 'ui', 'demo'), { recursive: true });
  writeFileSync(join(root, 'dev', 'ui', 'demo', 'ui-spec.md'), '## Components\n\n```yaml\nobligations:\n  - id: PO-002\n    files: ["**/*.tsx"]\n    match: ["<Sheet"]\n    require: [useDiscardGuard]\n```\n');
  const { obligations, from } = loadObligations(join(root, 'dev'), 'demo');
  assert.equal(obligations[0].id, 'PO-002');
  assert.match(from, /ui-spec\.md$/);
});
