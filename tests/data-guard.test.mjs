/**
 * data-guard.mjs: seeds, fixtures and a preview-DB dump hold only allowed domains (DEV-CONTRACTS §13.6).
 *
 * On release-management an Owner session set the Jira connection's site to a real company's host in
 * the preview database. No seed file held it, so a file scan alone would have passed. The dump case
 * below is that incident: it must be caught.
 *
 *   node --test tests/data-guard.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DEFAULT_ALLOW, allowed, profileAllow, scan, seedFiles } from '../workspace/dev/scripts/data-guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'data-guard.mjs');
const PROJECT_ALLOW = [...DEFAULT_ALLOW, 'kestrel.example', 'kestrel-seed.atlassian.net'];

// The shape of the release-management connection row; the company name is invented here too.
const DUMP = `--
-- PostgreSQL database dump
--
INSERT INTO public.account VALUES ('01a1', 'owner@kestrel.example', 'Owner', now());
INSERT INTO public.connection VALUES ('01a2', '01a0', 'jira_cloud', '{"site_url": "https://northwind-traders.atlassian.net"}', NULL);
COPY public.connection (id, settings) FROM stdin;
01a3\t{"site_url": "https://kestrel-seed.atlassian.net"}
\\.
`;

test('the reserved names and private addresses are allowed; a real host is not', () => {
  for (const h of ['kestrel.example', 'a.test', 'x.invalid', 'localhost', 'mail.example.com', '127.0.0.1', '10.1.2.3', '192.168.0.4']) {
    assert.ok(allowed(h, PROJECT_ALLOW), h);
  }
  for (const h of ['northwind-traders.atlassian.net', 'gmail.com', 'example.com.evil.io', '8.8.8.8', 'notexample']) {
    assert.ok(!allowed(h, PROJECT_ALLOW), h);
  }
});

test('a real Jira host typed into the preview DB is caught in the dump, the invented one is not', () => {
  const found = scan(DUMP, PROJECT_ALLOW);
  assert.deepEqual(found.map((f) => [f.domain, f.line]), [['northwind-traders.atlassian.net', 5]]);
  assert.doesNotMatch(found[0].value, /northwind-traders/, 'the report must not copy the real value');
});

test('e-mails, URLs and bare host values in a seed are all checked', () => {
  const seed = [
    'Email: "qa.bot@kestrel.example",',
    'Email: "an.ngo@realcorp.vn",',
    'SiteURL: "https://kestrel-seed.atlassian.net",',
    'cfg := map[string]string{"host": "db.realcorp.vn"}',
    '{ "domain": "kestrel.example" }',
    'import "github.com/jackc/pgx/v5"',
  ].join('\n');
  assert.deepEqual(scan(seed, PROJECT_ALLOW).map((f) => `${f.kind}:${f.domain}`), ['email:realcorp.vn', 'value:db.realcorp.vn']);
});

test('profileAllow reads DEV-PROFILE `Allowed data domains`', () => {
  const profile = '- **Allowed data domains:** `example` · `test` (default), plus `kestrel.example`, `*.kestrel-seed.atlassian.net`\n';
  assert.deepEqual(profileAllow(profile), ['example', 'test', 'kestrel.example', 'kestrel-seed.atlassian.net']);
  assert.deepEqual(profileAllow('nothing here'), []);
});

function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-guard-'));
  mkdirSync(join(root, 'cmd', 'server'), { recursive: true });
  mkdirSync(join(root, 'internal', 'x', 'testdata'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'seed-lib'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, 'cmd', 'server', 'seed.go'), 'Email: "seed.bot@kestrel.example"\nSite: "https://kestrel-seed.atlassian.net"\n');
  writeFileSync(join(root, 'internal', 'x', 'testdata', 'users.json'), '[{"email":"a@kestrel.example"}]\n');
  writeFileSync(join(root, 'internal', 'x', 'handler.go'), 'const docs = "https://pkg.go.dev"\n'); // not a seed: not scanned
  writeFileSync(join(root, 'node_modules', 'seed-lib', 'seed.js'), 'x = "a@gmail.com"\n'); // a dependency: not scanned
  writeFileSync(join(root, '.claude', 'DEV-PROFILE.md'), '- **Allowed data domains:** `kestrel.example`, `kestrel-seed.atlassian.net`\n');
  return root;
}

test('seedFiles finds seeds and testdata, not ordinary code or dependencies', () => {
  const root = project();
  const names = seedFiles(root).map((f) => f.slice(root.length + 1).split('\\').join('/')).sort();
  assert.deepEqual(names, ['cmd/server/seed.go', 'internal/x/testdata/users.json']);
});

test('the CLI passes clean seeds, and fails on a gzipped dump holding a real host', () => {
  const root = project();
  const clean = spawnSync(process.execPath, [SCRIPT, '--source', root], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const dump = join(root, 'preview.sql.gz');
  writeFileSync(dump, gzipSync(DUMP));
  const dirty = spawnSync(process.execPath, [SCRIPT, '--source', root, '--dump', dump, '--json'], { encoding: 'utf8' });
  assert.equal(dirty.status, 1, dirty.stdout + dirty.stderr);
  const out = JSON.parse(dirty.stdout);
  assert.deepEqual(out.findings.map((f) => [f.source, f.domain]), [['dump', 'northwind-traders.atlassian.net']]);
  assert.deepEqual(out.allow, ['kestrel.example', 'kestrel-seed.atlassian.net']);
});
