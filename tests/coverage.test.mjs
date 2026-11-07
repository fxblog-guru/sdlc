/**
 * Step 8.0 of docs/learning-roadmap.md (DEV-CONTRACTS §25): every product type and language gets the
 * gates, and the bundle says how much more it knows. A stack with no adapter runs at `generic` and is
 * reported — never a green check on code no checker read, and never a refusal to run.
 *
 *   node --test tests/coverage.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SCRIPTS = join(ROOT, 'workspace', 'dev', 'scripts');
const cov = await import(pathToFileURL(join(SCRIPTS, 'lib', 'coverage.mjs')).href);

test('tiers: a known stack on web is full; an unknown language is generic; a type with no pack is generic', () => {
  assert.equal(cov.tierOf('go', 'web'), 'full');
  assert.equal(cov.tierOf('nextjs', 'web'), 'full');
  assert.equal(cov.tierOf('rust', 'web'), 'generic');
  assert.equal(cov.tierOf('typescript-electron', 'desktop'), 'generic', 'an unknown language stays generic even on a preview pack');
  assert.equal(cov.tierOf('react', 'desktop'), 'preview', 'desktop has a pack, not yet proven on a real repository');
  assert.equal(cov.tierOf('react', 'game'), 'generic', 'game has no pack');
  for (const t of ['desktop', 'extension', 'cli', 'library', 'ai', 'mobile']) assert.equal(cov.tierOf('python', t), 'preview', t);
});

test('coverage: the summary is the weakest tier, and every gap is a note that says what it means', () => {
  const full = cov.coverage(['go', 'react'], 'web');
  assert.equal(full.summary, 'full');
  assert.deepEqual(full.notes, []);
  const mixed = cov.coverage(['go', 'rust'], 'web');
  assert.equal(mixed.summary, 'generic');
  assert.match(mixed.notes.join('\n'), /`rust`: no language adapter — conventions come from knowledge\/conventions\.md, and code checkers report N\/A/);
  const game = cov.coverage(['react'], 'game');
  assert.match(game.notes.join('\n'), /no pack for `game` yet: release means store build, operate means crash rate, frame time/);
  const desktop = cov.coverage(['react'], 'desktop');
  assert.equal(desktop.summary, 'preview');
  assert.match(desktop.notes.join('\n'), /`desktop` pack is preview: blueprint `electron` and its release reference apply, but no repository of this type has passed G6–G9 on it yet/);
  const odd = cov.coverage(['go'], 'spaceship');
  assert.equal(odd.known, false);
  assert.match(odd.notes[0], /product type `spaceship` is not one of web, desktop/);
  assert.equal(cov.coverage([], 'web').summary, 'none');
});

test('every product type says what release and operate mean; every pack names only types that exist', () => {
  for (const [type, v] of Object.entries(cov.PRODUCT_TYPES)) {
    assert.ok(v.release && v.operate, type);
  }
  for (const type of Object.keys(cov.PACKS)) assert.ok(type in cov.PRODUCT_TYPES, type);
});

// ---- doctor, as a project runs it -----------------------------------------------------------------

function project(profile) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-coverage-'));
  mkdirSync(join(root, '.claude', 'commands'), { recursive: true });
  mkdirSync(join(root, 'dev'));
  cpSync(SCRIPTS, join(root, 'dev', 'scripts'), { recursive: true });
  writeFileSync(join(root, '.claude', 'DEV-PROFILE.md'), profile);
  return root;
}
const PROFILE = (rows, type) => `# DEV-PROFILE\n\n## Project\n\n- **Name:** \`demo\`\n- **Project maturity:** \`brownfield\`\n\n## Stacks\n\n${type ? `- **Product type:** \`${type}\` — what ships\n\n` : ''}| Stack | Enabled | Version | Implementation skill | Unit test tool |\n|---|---|---|---|---|\n${rows}\n`;
const doctor = (root) => {
  const r = spawnSync(process.execPath, [join(root, 'dev', 'scripts', 'doctor.mjs')], { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
};

test('doctor: a web project on known stacks reports full coverage', () => {
  const { out } = doctor(project(PROFILE('| `go` | yes | 1.24 | dev-writing-go-code | go test |')));
  assert.match(out, /\[PASS\] coverage\s+web · go full/);
});

test('doctor: an unknown language is a generic warning, not a failure that stops the project', () => {
  const { out } = doctor(project(PROFILE('| `go` | yes | 1.24 | x | x |\n| `rust` | yes | 1.80 | — | cargo test |')));
  assert.match(out, /\[WARN\] coverage\s+web · go full · rust generic/);
  assert.match(out, /`rust`: no language adapter/);
  assert.doesNotMatch(out, /\[FAIL\] profile[^\n]*rust/, 'an unadapted stack no longer fails the profile');
});

test('doctor: the product type comes from the profile; a preview pack and a missing pack each say what they mean', () => {
  const { out } = doctor(project(PROFILE('| `react` | yes | 19 | dev-writing-react-code | vitest |', 'desktop')));
  assert.match(out, /\[WARN\] coverage\s+desktop · react preview/);
  assert.match(out, /`desktop` pack is preview: blueprint `electron`/);
  const game = doctor(project(PROFILE('| `react` | yes | 19 | dev-writing-react-code | vitest |', 'game'))).out;
  assert.match(game, /\[WARN\] coverage\s+game · react generic/);
  assert.match(game, /no pack for `game` yet: release means store build/);
});

test('every preview pack names a blueprint that parses and a release reference that exists', async () => {
  const { loadBlueprint } = await import(pathToFileURL(join(SCRIPTS, 'layout-check.mjs')).href);
  const files = { electron: 'desktop.md', 'vscode-extension': 'vscode-extension.md', cli: 'cli.md', 'ai-app': 'ai-app.md', 'react-native': 'mobile.md' };
  for (const [type, bp] of Object.entries(cov.PREVIEW_PACKS)) {
    assert.ok(type in cov.PRODUCT_TYPES, type);
    assert.equal(loadBlueprint(bp, [join(ROOT, 'skills', 'dev-resolving-code-placement', 'blueprints')]).name, bp);
    assert.match(readFileSync(join(ROOT, 'skills', 'dev-packaging-release', files[bp]), 'utf8'), /^# .+\(preview\)\n\nRead this when /, `${files[bp]} is marked preview`);
    assert.ok(!(type in cov.PACKS), `${type} is not proven yet, so it is not in PACKS`);
  }
});

test('the bundle profile, the contract and the pack template agree', () => {
  const profile = readFileSync(join(ROOT, 'DEV-PROFILE.md'), 'utf8');
  const line = /^- \*\*Product type:\*\* `web` \(default\) — `<([^>]+)>`/m.exec(profile);
  assert.ok(line, 'DEV-PROFILE names the product type, web by default');
  assert.deepEqual(line[1].split(' | '), Object.keys(cov.PRODUCT_TYPES), 'the profile lists exactly the types coverage.mjs knows');
  assert.match(readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8'), /^## 25\. Beyond web — coverage tiers and packs/m);
  const tpl = readFileSync(join(ROOT, 'docs', 'pack-template.md'), 'utf8');
  assert.match(tpl, /## The six parts/);
  assert.match(tpl, /## The proof a pack needs/);
});

// ---- the code checkers, on a stack no adapter reads -----------------------------------------------

const check = await import(pathToFileURL(join(SCRIPTS, 'lib', 'check.mjs')).href);

test('unadapted: an enabled stack with no adapter is named; known stacks, sql, stores and disabled rows are not', () => {
  const text = '| `go` | yes | 1 |\n| `rust` | yes | 1 |\n| `kotlin` | no | 1 |\n| `sql` | yes | 1 |\n| `postgres` | yes | 16 |\n| `typescript-electron` | yes | 1 |';
  assert.deepEqual(check.unadapted(text), ['rust', 'typescript-electron']);
  assert.deepEqual(check.unadapted(''), []);
});

test('a code checker says N/A for a stack it never read, instead of a clean pass that covers it', () => {
  const root = project(PROFILE('| `go` | yes | 1.24 | x | x |\n| `rust` | yes | 1.80 | — | cargo test |'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'main.rs'), 'fn main() { let x = 1; }\n');
  for (const [script, ...args] of [['limits-check.mjs'], ['obs-check.mjs', 'demo'], ['conventions-check.mjs']]) {
    const r = spawnSync(process.execPath, [join(root, 'dev', 'scripts', script), ...args, '--source', root, '--profile', join(root, '.claude', 'DEV-PROFILE.md')], { cwd: root, encoding: 'utf8', env: { ...process.env, SDLC_RUN_LOG: 'off' } });
    assert.match(r.stdout, /N\/A no adapter for rust — this check did not read that code \(§25\)/, `${script}: ${r.stdout}${r.stderr}`);
  }
  const clean = project(PROFILE('| `go` | yes | 1.24 | x | x |'));
  const r = spawnSync(process.execPath, [join(clean, 'dev', 'scripts', 'limits-check.mjs'), '--source', clean], { cwd: clean, encoding: 'utf8', env: { ...process.env, SDLC_RUN_LOG: 'off' } });
  assert.doesNotMatch(r.stdout, /N\/A/);
});
