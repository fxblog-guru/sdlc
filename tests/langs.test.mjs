/**
 * langs.mjs: the language registry is the one place a language is described, and the bundle's other
 * three places for one (the §Stacks row, the implementation skill, a blueprint) agree with it.
 *
 * Before the registry, each checker carried its own `.go|.py` list. A new stack enabled in a project
 * was read by none of them, and every check passed without having looked. These tests make adding
 * a language a single checklist, and make a missing step fail here rather than in a project.
 *
 *   node --test tests/langs.test.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  LANGS, NON_CODE_STACKS, STACK_KEYS, CODE_EXT, SERVER_EXT, SOURCE_EXT,
  langOf, langOfStack, isTestFile, isTestPath, isServerFile, commentStyle, toolsFor,
} from '../workspace/dev/scripts/lib/langs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'workspace', 'dev', 'scripts');
const read = (p) => readFileSync(p, 'utf8');

/** The `| \`key\` | yes|no |` rows of DEV-PROFILE §Stacks, with their implementation skill cell. */
function profileStacks() {
  const text = read(join(ROOT, 'DEV-PROFILE.md'));
  const section = text.slice(text.indexOf('## Stacks'), text.indexOf('\n## ', text.indexOf('## Stacks') + 4));
  return [...section.matchAll(/^\| `(\w+)` \| (?:yes|no) \| [^|]* \| ([^|]*) \|/gm)].map((m) => ({ key: m[1], skill: m[2] }));
}

test('every adapter is complete', () => {
  for (const l of LANGS) {
    for (const k of ['id', 'role', 'stacks', 'skill', 'source', 'isTest', 'comment', 'tools']) assert.ok(l[k] !== undefined, `${l.id ?? '?'}: no ${k}`);
    assert.ok(['server', 'client'].includes(l.role), `${l.id}: role is server or client`);
    assert.ok(['c', 'hash'].includes(l.comment), `${l.id}: comment is c or hash`);
    for (const s of l.stacks) assert.ok(l.skill[s], `${l.id}: stack ${s} names no implementation skill`);
    if (l.limitConst) assert.ok(l.limitConst.flags.includes('m'), `${l.id}: limitConst must be multiline`);
  }
  assert.equal(new Set(LANGS.map((l) => l.id)).size, LANGS.length, 'two adapters share an id');
  assert.equal(new Set(STACK_KEYS).size, STACK_KEYS.length, 'two adapters claim the same stack key');
});

test('DEV-PROFILE §Stacks and the registry name the same stacks and skills', () => {
  const rows = profileStacks();
  assert.ok(rows.length >= 4, 'could not read §Stacks');
  for (const r of rows) {
    assert.ok(STACK_KEYS.includes(r.key), `§Stacks has \`${r.key}\` but lib/langs.mjs has no adapter for it (or list it in NON_CODE_STACKS)`);
    const l = langOfStack(r.key);
    if (l) assert.ok(r.skill.includes(l.skill[r.key]), `§Stacks \`${r.key}\` names ${r.skill.trim()}, the adapter ${l.skill[r.key]}`);
  }
  for (const k of STACK_KEYS) assert.ok(rows.some((r) => r.key === k), `lib/langs.mjs knows \`${k}\` but DEV-PROFILE §Stacks has no row for it`);
});

test('every implementation skill an adapter names exists', () => {
  for (const l of LANGS) for (const skill of Object.values(l.skill)) {
    assert.ok(existsSync(join(ROOT, 'skills', skill, 'SKILL.md')), `${l.id}: skills/${skill}/SKILL.md is missing`);
  }
});

test('every server language has at least one blueprint that places it', () => {
  const dir = join(ROOT, 'skills', 'dev-resolving-code-placement', 'blueprints');
  const blueprints = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => read(join(dir, f)));
  for (const l of LANGS.filter((x) => x.role === 'server')) {
    const re = new RegExp(`\\b${l.id === 'go' ? 'Go' : l.id[0].toUpperCase() + l.id.slice(1)}\\b`);
    assert.ok(blueprints.some((b) => re.test(b)), `no blueprint places ${l.id} code (skills/dev-resolving-code-placement/blueprints/)`);
  }
});

test('file classification', () => {
  assert.equal(langOf('internal/a/b.go').id, 'go');
  assert.equal(langOf('src/pkg/m.py').id, 'python');
  assert.equal(langOf('web/src/A.tsx').id, 'typescript');
  assert.equal(langOf('tools/x.mjs').id, 'typescript');
  assert.equal(langOf('README.md'), null);
  for (const t of ['a/b_test.go', 'tests/unit/test_a.py', 'a/conftest.py', 'src/A.test.tsx', 'src/a.spec.ts', 'src/__tests__/a.ts', 'x.test.mjs']) assert.ok(isTestFile(t), t);
  for (const t of ['a/b.go', 'src/m.py', 'src/A.tsx', 'tests/fixtures/data.json']) assert.ok(!isTestFile(t), t);
  assert.ok(isTestPath('tests/helpers/limits.go'), 'anything under tests/ is test code for the source checkers');
  assert.equal(commentStyle('a.py'), 'py');
  assert.equal(commentStyle('a.go'), 'c');
  // SERVER_EXT is the server-role languages only; TypeScript server files come from isServerFile.
  assert.ok(SERVER_EXT.test('a.go') && SERVER_EXT.test('a.py') && !SERVER_EXT.test('a.ts') && !SERVER_EXT.test('ago'));
  assert.ok(CODE_EXT.test('a.mjs') && !SOURCE_EXT.test('a.mjs'));
});

// Next.js keeps server code beside the UI (blueprints/nextjs.md). The role stays 'client'; the
// backend checkers find the server files through isServerFile, and never read a component.
test('isServerFile: Go and Python always, TypeScript only where Next.js puts server code', () => {
  for (const p of ['src/server/posts/app/publish.ts', 'src/app/api/x/route.ts', 'src/features/a/actions.ts', 'src/proxy.ts', 'src/server-entry.ts', 'src/instrumentation.ts', 'middleware.ts', 'server/index.mjs', 'internal/a/b.go', 'src/pkg/m.py']) {
    assert.ok(isServerFile(p), `${p} is server code`);
  }
  for (const p of ['src/components/Button.tsx', 'src/features/a/components/x.tsx', 'src/lib/x.ts', 'src/server/emails/Welcome.tsx', 'src/app/page.tsx', 'src/server/types.d.ts', 'src/observer/x.ts', 'README.md']) {
    assert.ok(!isServerFile(p), `${p} is not server code`);
  }
  assert.ok(isServerFile('src/lib/save.ts', "// saves\n'use server';\nexport async function save() {}\n"), "a 'use server' module is server code");
  assert.ok(!isServerFile('src/lib/save.ts', "import x from 'y';\n'use server';\n"), 'the directive counts only at the top of the file');
  assert.equal(langOf('src/server/a.ts').role, 'client', 'typescript keeps its client role');
});

test('doctor asks for the toolchain of each enabled stack, from the registry', () => {
  assert.deepEqual([...toolsFor(['go']).keys()], ['go', 'golangci-lint']);
  assert.deepEqual([...toolsFor(['react', 'nextjs']).keys()], ['npm']);
  assert.deepEqual([...toolsFor(NON_CODE_STACKS).keys()], []);
});

// The point of the registry: no checker keeps a private language list. A file extension list or a
// `lang === '…'` branch in a checker is how the next language gets silently skipped.
test('no checker carries its own language list', () => {
  const allowed = new Set(['lib/langs.mjs']);
  // An extension alternation that names a language the registry owns: `\.(go|py)`, `\.(ts|…|go|…)`.
  const pattern = /\\\.\((?:[a-z]+\|)*(?:go|py)(?:\|[a-z]+)*\)|endsWith\('\.(?:go|py)'\)|endsWith\('_test\.go'\)|lang === '(?:py|go|python)'/;
  // Known language-native scanners: each reads one language's syntax (Go test helpers, go list,
  // Python Field()), and each is named here so a new one is a decision, not an accident.
  const native = new Map([
    ['conventions-check.mjs', 2], // W109 Go test helpers: a Go-only rule
    ['layout-check.mjs', 4], // go list / Go and Python import grammars
    ['limits-check.mjs', 1], // Python pydantic Field(max_length=)
    ['obs-check.mjs', 1], // prometheus_client metric constructors in Python
    ['data-guard.mjs', 2], // text files to scan for e-mails, not code
    ['threat-trace.mjs', 1], // a test reference in any language the threat model cites
    ['pr-scan.mjs', 1], // reviews a teammate's PR in ANY language, adapter or not — deliberately wider
    ['lib/check.mjs', 1], // blankComments' comment vocabulary: 'py' means `#`, fed by commentStyle()
  ]);
  const problems = [];
  const files = readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')).concat(readdirSync(join(SCRIPTS, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => `lib/${f}`));
  for (const f of files) {
    if (allowed.has(f)) continue;
    const hits = read(join(SCRIPTS, f)).split('\n').filter((l) => pattern.test(l)).length;
    if (hits > (native.get(f) ?? 0)) problems.push(`${f}: ${hits} language-specific line(s), ${native.get(f) ?? 0} allowed — use lib/langs.mjs`);
  }
  assert.deepEqual(problems, []);
});
