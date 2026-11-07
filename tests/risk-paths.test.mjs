/**
 * risk-paths.mjs: the changed files G7 reads in full, from DEV-PROFILE `## Security review`
 * (DEV-CONTRACTS §13.6).
 *
 *   node --test tests/risk-paths.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { classify, globToRegExp, profileRisks } from '../workspace/dev/scripts/risk-paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE = readFileSync(join(here, '..', 'DEV-PROFILE.md'), 'utf8');

test('globs: ** spans directories, * stays in a segment, braces alternate', () => {
  const cases = [
    ['**/auth/**', 'internal/auth/login.go', true],
    ['**/auth/**', 'auth/x.go', true],
    ['**/auth/**', 'internal/author.go', false],
    ['**/*.sql', 'migrations/0001_init.up.sql', true],
    ['**/*settings*.{go,py,ts}', 'web/src/app-settings.ts', true],
    ['**/*settings*.{go,py,ts}', 'web/settings.json', false],
    ['**/.env*', '.env.local', true],
  ];
  for (const [g, p, want] of cases) assert.equal(globToRegExp(g).test(p), want, `${g} ~ ${p}`);
});

test('the shipped DEV-PROFILE defines all seven risk classes', () => {
  assert.deepEqual(Object.keys(profileRisks(PROFILE)), [
    'auth / authz', 'session', 'SQL', 'crypto', 'file upload', 'deserialisation', 'secrets and config',
  ]);
});

test('classify sends auth, session, SQL, crypto, upload, decode and secrets files to a full read', () => {
  const changed = [
    'internal/identity/password.go',
    'internal/http/session_middleware.go',
    'internal/release/queries/release.sql',
    'internal/platform/crypto/aead.go',
    'internal/attachment/upload_handler.go',
    'internal/import/csv_decode.go',
    '.env.example',
    'web/src/features/releases/ReleaseTable.tsx',
    'README.md',
  ];
  const hits = classify(changed, profileRisks(PROFILE));
  assert.deepEqual(hits.map((h) => h.file), changed.slice(0, 7));
  assert.ok(hits.find((h) => h.file.endsWith('aead.go')).risks.includes('crypto'));
});

test('a profile with no Security review table yields no risks', () => {
  assert.deepEqual(profileRisks('# DEV-PROFILE\n\n## Project\n'), {});
});
