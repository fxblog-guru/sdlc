/**
 * layout-check.mjs — every rule must be able to fail (DEV-CONTRACTS §13.9).
 *
 * tests/fixtures/layout/valid/ is a go-react tree that must come out clean. Each directory under
 * tests/fixtures/broken/layout/ is an overlay: its files are copied over the valid tree (or, for a
 * REMOVE list, those paths are deleted), and the result must fail with exactly the rule it breaks.
 *
 *   node --test tests/layout-check.test.mjs
 */

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkLayout, loadBlueprint, parseAccepted, parseBlueprint, parseProfile, matchSegments, goImports, tsImports, pyImports, goAvailable, summarise } from '../workspace/dev/scripts/layout-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BLUEPRINTS = join(here, '..', 'skills', 'dev-resolving-code-placement', 'blueprints');
const VALID = join(here, 'fixtures', 'layout', 'valid');
const BROKEN = join(here, 'fixtures', 'broken', 'layout');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'layout-check.mjs');
const GO_REACT = loadBlueprint('go-react', [BLUEPRINTS]);

/** What each broken overlay must produce: rule → level, and nothing else at fail or warn. */
const EXPECT = {
  'missing-dir': { 'missing-dir': 'fail' },
  'missing-file': { 'missing-file': 'fail' },
  'stray-code': { 'stray-code': 'fail' },
  'top-level': { 'top-level-area': 'fail' },
  'misplaced-test': { 'test-placement': 'fail' },
  'test-tier': { 'test-tier': 'fail' },
  'grab-bag': { 'grab-bag': 'fail', 'grab-bag-file': 'warn' },
  ceiling: { 'package-ceiling': 'warn' },
  'domain-leak': { 'import-direction': 'fail' },
  'platform-leak': { 'import-direction': 'fail' },
  'feature-cross': { 'import-direction': 'fail' },
};

function tree(overlay) {
  const dir = mkdtempSync(join(tmpdir(), 'layout-'));
  cpSync(VALID, dir, { recursive: true });
  if (!overlay) return dir;
  const src = join(BROKEN, overlay);
  const remove = join(src, 'REMOVE');
  if (existsSync(remove)) {
    for (const p of readFileSync(remove, 'utf8').split(/\r?\n/).filter(Boolean)) rmSync(join(dir, p), { recursive: true, force: true });
  } else cpSync(src, dir, { recursive: true });
  return dir;
}

const shape = (findings) => Object.fromEntries(findings.filter((f) => f.level !== 'accepted').map((f) => [f.rule, f.level]));

test('every blueprint parses, and its rules name the shared folders', () => {
  for (const name of ['go-react', 'go-service', 'python-react', 'nextjs', 'web-api-ts']) {
    const bp = loadBlueprint(name, [BLUEPRINTS]);
    assert.equal(bp.name, name);
    for (const d of ['tests', 'deploy', 'ops', 'docs', 'dev']) assert.ok(bp.requiredDirs.includes(d), `${name} requires ${d}/`);
    assert.ok(bp.imports.length > 0, `${name} has import rules`);
    assert.equal(bp.packageCeiling, 40);
  }
  assert.throws(() => parseBlueprint('# no rules'), /## Rules/);
  assert.throws(() => loadBlueprint('nope', [BLUEPRINTS]), /no blueprint "nope"/);
});

test('the fixtures cover every rule the script can emit', () => {
  const covered = new Set(Object.values(EXPECT).flatMap((e) => Object.keys(e)));
  for (const rule of ['missing-dir', 'missing-file', 'stray-code', 'top-level-area', 'test-placement', 'test-tier', 'grab-bag', 'grab-bag-file', 'package-ceiling', 'import-direction']) {
    assert.ok(covered.has(rule), `no broken fixture for ${rule}`);
  }
  assert.deepEqual(readdirSync(BROKEN).sort(), Object.keys(EXPECT).sort(), 'every overlay has an expectation, and every expectation an overlay');
});

test('the valid go-react tree is clean, with and without go list', () => {
  for (const useGo of [true, false]) {
    const f = checkLayout({ root: tree(), blueprint: GO_REACT, useGo });
    assert.deepEqual(f, [], `useGo=${useGo}: ${f.map((x) => `${x.rule} ${x.path}`).join(', ')}`);
  }
});

for (const [overlay, want] of Object.entries(EXPECT)) {
  test(`broken/${overlay} fails with exactly ${Object.keys(want).join(' + ')}`, () => {
    assert.deepEqual(shape(checkLayout({ root: tree(overlay), blueprint: GO_REACT, useGo: false })), want);
  });
}

test('a top-level folder without a README is a finding', () => {
  const dir = tree();
  rmSync(join(dir, 'ops', 'README.md'));
  writeFileSync(join(dir, 'ops', 'runbook.md'), '# runbook\n');
  assert.deepEqual(shape(checkLayout({ root: dir, blueprint: GO_REACT, useGo: false })), { 'folder-readme': 'fail' });
});

test('import direction: go list and the grep fallback find the same domain leak', { skip: !goAvailable() && 'Go is not on PATH' }, () => {
  const dir = tree('domain-leak');
  const viaGo = checkLayout({ root: dir, blueprint: GO_REACT, useGo: true }).map((f) => f.message).sort();
  const viaGrep = checkLayout({ root: dir, blueprint: GO_REACT, useGo: false }).map((f) => f.message).sort();
  assert.deepEqual(viaGo, viaGrep);
  assert.equal(viaGo.length, 2);
});

test('brownfield: the same drift is advisory, and nothing fails', () => {
  for (const overlay of ['stray-code', 'top-level', 'misplaced-test', 'domain-leak', 'grab-bag']) {
    const f = checkLayout({ root: tree(overlay), blueprint: GO_REACT, maturity: 'brownfield', useGo: false });
    assert.ok(f.length > 0, `${overlay} still reports`);
    assert.equal(summarise(f).fail, 0, `${overlay}: ${f.map((x) => x.level + ' ' + x.rule).join(', ')}`);
  }
});

test('brownfield: a deviation the ADR lists is accepted', () => {
  const adr = '| Deviation | Why |\n|---|---|\n| `top-level-area lib/` | predates the blueprint |\n| `test-placement internal/release/**` | moves with TASK-031 |\n';
  const accepted = parseAccepted(adr);
  assert.deepEqual(accepted, [{ rule: 'top-level-area', path: 'lib/' }, { rule: 'test-placement', path: 'internal/release/**' }]);
  const f = checkLayout({ root: tree('top-level'), blueprint: GO_REACT, maturity: 'greenfield', accepted, useGo: false });
  assert.deepEqual(f.map((x) => x.level), ['accepted'], 'accepted even in greenfield');
  const g = checkLayout({ root: tree('misplaced-test'), blueprint: GO_REACT, maturity: 'brownfield', accepted, useGo: false });
  assert.deepEqual(g.map((x) => x.level), ['accepted', 'accepted']);
});

test('brownfield --since: a new top-level area or grab-bag fails; old drift stays advisory', { skip: spawnSync('git', ['--version']).status !== 0 && 'git is not on PATH' }, () => {
  const dir = tree('stray-code');
  const git = (...a) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  mkdirSync(join(dir, 'lib'));
  writeFileSync(join(dir, 'lib', 'x.md'), '# new area\n');
  mkdirSync(join(dir, 'internal', 'common'));
  writeFileSync(join(dir, 'internal', 'common', 'c.go'), 'package common\n');
  const f = checkLayout({ root: dir, blueprint: GO_REACT, maturity: 'brownfield', since: 'HEAD', useGo: false });
  const fails = f.filter((x) => x.level === 'fail').map((x) => `${x.rule} ${x.path}`).sort();
  assert.deepEqual(fails, ['grab-bag internal/common/', 'top-level-area lib/']);
  assert.ok(f.some((x) => x.rule === 'stray-code' && x.level === 'warn'), 'the old stray code stays advisory');
});

test('profile: blueprint, maturity and ADR are read, placeholders are unset', () => {
  const p = parseProfile('- **Project maturity:** `brownfield` — x\n- **Repository blueprint:** `go-react` (default)\n- **Blueprint ADR:** `<ADR-NNN path>`\n');
  assert.deepEqual(p, { blueprint: 'go-react', maturity: 'brownfield', adr: null, repositoryModel: null, architecture: null });
  const axes = parseProfile('- **Repository model:** `monorepo` — x\n- **Architecture:** `<monolith | modular-monolith | microservices>`\n');
  assert.equal(axes.repositoryModel, 'monorepo');
  assert.equal(axes.architecture, null, 'a placeholder axis is unset');
  const bundled = parseProfile(readFileSync(join(here, '..', 'DEV-PROFILE.md'), 'utf8'));
  assert.equal(bundled.blueprint, 'fullstack-go-react', 'a new Go + React product defaults to fullstack-go-react');
  assert.deepEqual([bundled.repositoryModel, bundled.architecture], ['monorepo', 'modular-monolith'], 'the default axes (§13.9 rule 7)');
  const fits = loadBlueprint(bundled.blueprint, [BLUEPRINTS]).fits;
  assert.ok(fits.repositoryModel.includes(bundled.repositoryModel) && fits.architecture.includes(bundled.architecture), 'the default blueprint serves the default axes');
});

test('patterns: captures, negation and globstar', () => {
  assert.deepEqual(matchSegments('internal/{d}/domain/**'.split('/'), 'internal/release/domain/x'.split('/')), { d: 'release' });
  assert.equal(matchSegments('internal/!{d}/adapters/**'.split('/'), 'internal/release/adapters/http'.split('/'), { d: 'release' }, true), null);
  assert.ok(matchSegments('internal/!{d}/adapters/**'.split('/'), 'internal/bug/adapters/http'.split('/'), { d: 'release' }, true));
  assert.ok(matchSegments('internal/!platform/**'.split('/'), ['internal', 'release'], {}, true));
  assert.equal(matchSegments('internal/!platform/**'.split('/'), ['internal', 'platform', 'ids'], {}, true), null);
});

test('import extraction: go blocks, ts forms, python relative imports', () => {
  assert.deepEqual(goImports('package x\n\nimport (\n\t"fmt"\n\tdb "a/b/db"\n)\nimport "c/d"\n'), ['fmt', 'a/b/db', 'c/d']);
  assert.deepEqual(tsImports("import a from './a';\nimport type { B } from '@/b';\nexport * from '../c';\nimport './d.css';\nconst e = await import('./e');\n"), ['./a', '@/b', '../c', './d.css', './e']);
  assert.deepEqual(pyImports('import os, sys\nfrom ..app import ports\nfrom fastapi import APIRouter\n'), ['os', 'sys', '..app', 'fastapi']);
});

test('python-react: a domain importing sqlalchemy or an adapter is caught', () => {
  const dir = mkdtempSync(join(tmpdir(), 'layout-py-'));
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  put('backend/src/shop/release/domain/model.py', 'from sqlalchemy import Column\nfrom shop.release.adapters.sql import repo\n');
  put('backend/src/shop/release/app/service.py', 'from ..domain import model\n');
  put('backend/src/shop/platform/errors.py', 'from shop.release.domain import model\n');
  const bp = loadBlueprint('python-react', [BLUEPRINTS]);
  const f = checkLayout({ root: dir, blueprint: bp, useGo: false }).filter((x) => x.rule === 'import-direction').map((x) => `${x.path} ${x.message.split(':')[0]}`).sort();
  assert.deepEqual(f, [
    'backend/src/shop/platform/errors.py imports shop.release.domain',
    'backend/src/shop/release/domain/model.py imports shop.release.adapters.sql',
    'backend/src/shop/release/domain/model.py imports sqlalchemy',
  ]);
});

test('CLI: exit 0 on the valid tree, 1 on a broken one, 2 on an unknown blueprint', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = (root, ...a) => spawnSync(process.execPath, [SCRIPT, '--root', root, '--blueprints', BLUEPRINTS, '--no-go', ...a], { encoding: 'utf8', env });
  assert.equal(run(tree(), '--blueprint', 'go-react').status, 0);
  const broken = run(tree('stray-code'), '--blueprint', 'go-react');
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /FAIL\s+stray-code\s+seed\.go/);
  assert.equal(run(tree('stray-code'), '--blueprint', 'go-react', '--maturity', 'brownfield').status, 0);
  assert.equal(run(tree(), '--blueprint', 'nope').status, 2);
});

// ---------------------------------------------------------------------------------------------
// fullstack-go-react: backend/ frontend/ ops/ docs/ tests/ and the process root, nothing loose
// ---------------------------------------------------------------------------------------------

const FULL = loadBlueprint('fullstack-go-react', [BLUEPRINTS]);
const FULL_VALID = join(here, 'fixtures', 'layout', 'fullstack-valid');
const FULL_BROKEN = join(here, 'fixtures', 'broken', 'layout-fullstack');

/** Each overlay under broken/layout-fullstack/ and exactly what it must produce. */
const FULL_EXPECT = {
  'loose-root-code': { 'top-level-area': 'fail', 'stray-code': 'fail' },
  'two-ops-homes': { 'top-level-area': 'fail', 'single-home': 'fail' },
  'second-docs': { 'single-home': 'fail' },
  'shared-http': { 'single-home': 'fail' },
  'missing-ops-home': { 'missing-dir': 'fail' },
  'missing-backend-go-mod': { 'missing-file': 'fail' },
  'misplaced-integration': { 'test-placement': 'fail' },
  'root-integration-tier': { 'test-tier': 'fail' },
  'backend-test-tier': { 'test-tier': 'fail' },
  'grab-bag': { 'grab-bag': 'fail' },
  ceiling: { 'package-ceiling': 'warn' },
  'domain-leak': { 'import-direction': 'fail' },
  'cross-domain-adapter': { 'import-direction': 'fail' },
  'feature-cross': { 'import-direction': 'fail' },
};

function fullTree(overlay) {
  const dir = mkdtempSync(join(tmpdir(), 'layout-full-'));
  cpSync(FULL_VALID, dir, { recursive: true });
  if (!overlay) return dir;
  const src = join(FULL_BROKEN, overlay);
  const remove = join(src, 'REMOVE');
  if (existsSync(remove)) {
    for (const p of readFileSync(remove, 'utf8').split(/\r?\n/).filter(Boolean)) rmSync(join(dir, p), { recursive: true, force: true });
  } else cpSync(src, dir, { recursive: true });
  return dir;
}

test('fullstack-go-react and service-go parse, and declare the axes they serve', () => {
  assert.deepEqual(FULL.fits, { repositoryModel: ['monorepo'], architecture: ['monolith', 'modular-monolith'] });
  assert.deepEqual(FULL.goModules, ['backend']);
  for (const d of ['backend', 'frontend', 'ops', 'docs', 'tests']) assert.ok(FULL.topLevel.includes(d) && FULL.requiredDirs.includes(d), `fullstack-go-react requires ${d}/`);
  for (const d of ['ops/deploy', 'ops/config', 'ops/alerts', 'ops/dashboards', 'ops/runbooks']) assert.ok(FULL.requiredDirs.includes(d), `one home for sysops: ${d}/`);
  const svc = loadBlueprint('service-go', [BLUEPRINTS]);
  assert.deepEqual(svc.fits.repositoryModel, ['polyrepo']);
  for (const d of ['cmd', 'internal', 'api', 'ops', 'docs']) assert.ok(svc.requiredDirs.includes(d), `service-go requires ${d}/`);
  assert.ok(readFileSync(join(BLUEPRINTS, 'service-go.md'), 'utf8').includes('V2 — schema only'), 'service-go is marked V2');
});

test('fullstack-go-react: every overlay has an expectation, and together they cover every structural rule', () => {
  assert.deepEqual(readdirSync(FULL_BROKEN).sort(), Object.keys(FULL_EXPECT).sort());
  const covered = new Set(Object.values(FULL_EXPECT).flatMap((e) => Object.keys(e)));
  for (const rule of ['missing-dir', 'missing-file', 'top-level-area', 'stray-code', 'test-placement', 'test-tier', 'grab-bag', 'single-home', 'package-ceiling', 'import-direction']) assert.ok(covered.has(rule), `no fullstack overlay for ${rule}`);
});

test('fullstack-go-react: the valid tree is clean, with and without go list', () => {
  for (const useGo of [true, false]) {
    const f = checkLayout({ root: fullTree(), blueprint: FULL, useGo, axes: { repositoryModel: 'monorepo', architecture: 'modular-monolith' } });
    assert.deepEqual(f, [], `useGo=${useGo}: ${f.map((x) => `${x.rule} ${x.path}`).join(', ')}`);
  }
});

test('fullstack-go-react: a project whose process root is .sdlc/ is held to the same rules', () => {
  // The blueprint names the root `dev`; the 1.6 default root is `.sdlc` (§2). Both must be clean,
  // and a deploy folder inside either root is still exempt from single-home.
  const dir = fullTree();
  cpSync(join(dir, 'dev'), join(dir, '.sdlc'), { recursive: true });
  rmSync(join(dir, 'dev'), { recursive: true, force: true });
  mkdirSync(join(dir, '.sdlc', 'verification', 'deploy'), { recursive: true });
  writeFileSync(join(dir, '.sdlc', 'verification', 'deploy', 'run.md'), '# a deploy run record\n');
  const f = checkLayout({ root: dir, blueprint: FULL, useGo: false, axes: { repositoryModel: 'monorepo', architecture: 'modular-monolith' } });
  assert.deepEqual(f, [], f.map((x) => `${x.rule} ${x.path}`).join(', '));
  assert.ok(FULL.singleHome.every((h) => h.ignore?.includes('.sdlc') || !h.ignore?.includes('dev')), 'every single-home ignore that names dev also names .sdlc');
});

test('a blueprint that requires `dev/` is satisfied by a .sdlc/ process root, and still fails with neither', () => {
  // nextjs lists the process root in requiredDirs; withProcessRoots expanded every list but that one,
  // so every .sdlc/ project failed `missing-dir dev/` (anime-blog G6 CR-349).
  const bp = parseBlueprint(readFileSync(join(BLUEPRINTS, 'nextjs.md'), 'utf8'));
  assert.ok(bp.requiredDirs.includes('dev'), 'the fixture premise: nextjs requires dev/');
  const dir = mkdtempSync(join(tmpdir(), 'layout-root-'));
  const put = (p) => { mkdirSync(join(dir, dirname(p)), { recursive: true }); writeFileSync(join(dir, p), '# x\n'); };
  put('.sdlc/state.json');
  const missing = (root) => checkLayout({ root, blueprint: bp, useGo: false }).filter((f) => f.rule === 'missing-dir').map((f) => f.path);
  assert.ok(!missing(dir).includes('dev/'), `.sdlc/ should satisfy dev/: ${missing(dir).join(', ')}`);
  rmSync(join(dir, '.sdlc'), { recursive: true, force: true });
  put('README.md');
  assert.ok(missing(dir).some((p) => p === 'dev/' || p === '.sdlc/'), 'with no process root at all, the rule still fails');
});

for (const [overlay, want] of Object.entries(FULL_EXPECT)) {
  test(`fullstack broken/${overlay} fails with exactly ${Object.keys(want).join(' + ')}`, () => {
    assert.deepEqual(shape(checkLayout({ root: fullTree(overlay), blueprint: FULL, useGo: false })), want);
  });
}

test('fullstack-go-react: a Go leak inside backend/ is found through backend/go.mod, by go list and by grep alike', { skip: !goAvailable() && 'Go is not on PATH' }, () => {
  for (const overlay of ['domain-leak', 'cross-domain-adapter']) {
    const dir = fullTree(overlay);
    const viaGo = checkLayout({ root: dir, blueprint: FULL, useGo: true }).map((f) => f.message).sort();
    const viaGrep = checkLayout({ root: dir, blueprint: FULL, useGo: false }).map((f) => f.message).sort();
    assert.deepEqual(viaGo, viaGrep, overlay);
    assert.ok(viaGo.length > 0, `${overlay} is found`);
  }
});

test('fullstack-go-react: a domain may be named for an ops concept, and the process roots are not checked', () => {
  const dir = fullTree();
  mkdirSync(join(dir, 'backend', 'internal', 'deploy', 'app'), { recursive: true });
  writeFileSync(join(dir, 'backend', 'internal', 'deploy', 'app', 'service.go'), 'package app\n');
  mkdirSync(join(dir, 'qa', 'docs'), { recursive: true });
  writeFileSync(join(dir, 'qa', 'docs', 'plan.md'), '# plan\n');
  assert.deepEqual(checkLayout({ root: dir, blueprint: FULL, useGo: false }), []);
});

test('fullstack-go-react: the old go-react shape is all advisory in brownfield', () => {
  const f = checkLayout({ root: tree(), blueprint: FULL, maturity: 'brownfield', useGo: false });
  assert.ok(f.some((x) => x.rule === 'top-level-area' && x.path === 'internal/'), 'internal/ at the root is reported');
  assert.ok(f.some((x) => x.rule === 'missing-dir' && x.path === 'backend/'), 'backend/ is reported missing');
  assert.equal(summarise(f).fail, 0);
});

test('blueprint-fit: a profile whose axes contradict the blueprint fails, even in brownfield', () => {
  for (const maturity of ['greenfield', 'brownfield']) {
    const f = checkLayout({ root: fullTree(), blueprint: FULL, maturity, useGo: false, axes: { repositoryModel: 'polyrepo', architecture: 'microservices' } });
    assert.deepEqual(f.map((x) => `${x.level} ${x.rule}`), ['fail blueprint-fit', 'fail blueprint-fit'], maturity);
    assert.match(f[0].message, /Repository model `polyrepo`/);
  }
  assert.deepEqual(checkLayout({ root: tree(), blueprint: GO_REACT, useGo: false, axes: { repositoryModel: 'polyrepo' } }), [], 'a blueprint with no fits declared checks no axis');
});

test('CLI: the axes are read from DEV-PROFILE', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const dir = fullTree();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'DEV-PROFILE.md'), '- **Repository blueprint:** `fullstack-go-react`\n- **Repository model:** `monorepo`\n- **Architecture:** `microservices`\n');
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--blueprints', BLUEPRINTS, '--no-go'], { encoding: 'utf8', env });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL\s+blueprint-fit\s+DEV-PROFILE\.md/);
});

test('service-go: a single service repository is checked; a shared http package and a missing contract fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'layout-svc-'));
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  for (const f of ['README.md', 'CONTRIBUTING.md', 'Makefile', '.editorconfig', '.env.example', 'CODEOWNERS', 'cmd/README.md', 'internal/README.md', 'api/README.md', 'tests/README.md', 'ops/README.md', 'ops/deploy/docker/Dockerfile', 'ops/runbooks/svc.md', 'docs/README.md']) put(f, '# x\n');
  put('go.mod', 'module example.com/svc\n');
  put('api/openapi.yaml', 'openapi: 3.1.0\n');
  put('cmd/server/main.go', 'package main\n\nfunc main() {}\n');
  put('internal/release/domain/release.go', 'package domain\n');
  put('tests/integration/release/r_integration_test.go', 'package release_test\n');
  const svc = loadBlueprint('service-go', [BLUEPRINTS]);
  assert.deepEqual(checkLayout({ root: dir, blueprint: svc, useGo: false }), []);
  put('internal/http/router.go', 'package http\n');
  rmSync(join(dir, 'api', 'openapi.yaml'));
  assert.deepEqual(shape(checkLayout({ root: dir, blueprint: svc, useGo: false })), { 'missing-file': 'fail', 'single-home': 'fail' });
});

test('web-api-ts: the web app reaches the server only through packages/contract', () => {
  const dir = mkdtempSync(join(tmpdir(), 'layout-webapi-'));
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  put('apps/web/src/features/posts/api.ts', "import { client } from '@shop/contract';\nimport { list } from './list';\n");
  put('apps/web/src/features/posts/list.ts', 'export const list = 1;\n');
  put('apps/api/src/posts/app/list.ts', "import { repo } from '../adapters/db/repo';\n");
  put('packages/contract/src/index.ts', "export * from './generated/client';\n");
  const bp = loadBlueprint('web-api-ts', [BLUEPRINTS]);
  const violations = () => checkLayout({ root: dir, blueprint: bp, useGo: false }).filter((x) => x.rule === 'import-direction').map((x) => `${x.path} ${x.message.split(':')[0]}`).sort();
  assert.deepEqual(violations(), [], 'web through the contract, api inside its own layers: clean');
  put('apps/web/src/features/posts/save.ts', "import { create } from '../../../../api/src/posts/app/create';\nimport { db } from '@shop/api';\nimport { Pool } from 'pg';\n");
  put('apps/api/src/posts/adapters/http/page.ts', "import React from 'react';\n");
  assert.deepEqual(violations(), [
    'apps/api/src/posts/adapters/http/page.ts imports react',
    'apps/web/src/features/posts/save.ts imports @shop/api',
    'apps/web/src/features/posts/save.ts imports apps/api/src/posts/app/create',
    'apps/web/src/features/posts/save.ts imports pg',
  ]);
  assert.deepEqual(bp.fits, { repositoryModel: ['monorepo'], architecture: ['monolith', 'modular-monolith'] });
  for (const d of ['apps/web', 'apps/api', 'packages/contract', 'tests', 'deploy', 'ops', 'docs', 'dev']) assert.ok(bp.requiredDirs.includes(d), `requires ${d}/`);
  for (const f of ['apps/web/Dockerfile', 'apps/api/Dockerfile', 'packages/contract/openapi.yaml']) assert.ok(bp.requiredFiles.includes(f), `two deployables and the contract: ${f}`);
});
