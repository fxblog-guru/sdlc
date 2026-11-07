/**
 * env-doctor.mjs — every key an environment needs is set, well formed and in the store (DEV-CONTRACTS §13.4).
 *
 * keys.md lists five keys across staging and production. valid.env is a staging env file with
 * every one set; broken.env sets each wrongly — a bad URL, a short base64 key, a tag that is not a
 * version. variables.json is a GitLab CI/CD variables answer that covers staging and leaves a
 * production key unprotected and another missing.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkStore, checkValues, dbTarget, formatTest, parseEnvFile, parseKeys, required } from '../workspace/dev/scripts/env-doctor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'env-doctor');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'env-doctor.mjs');
const read = (f) => readFileSync(join(FIX, f), 'utf8');
const keys = parseKeys(read('keys.md'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// The CLI merges process.env; keep this machine's variables out of the fixture's keys.
for (const k of keys) delete env[k.name];
const run = (args) => spawnSync(process.execPath, [SCRIPT, '--keys', join(FIX, 'keys.md'), ...args], { encoding: 'utf8', env });

test('parseKeys reads every row, its environments and its format', () => {
  assert.deepEqual(keys.map((k) => k.name), ['DATABASE_URL', 'PUBLIC_HOST', 'TOTP_KEY', 'SMTP_PORT', 'RELEASE_TAG']);
  assert.deepEqual(keys[0].envs, ['staging', 'production']);
  assert.deepEqual(keys[1].envs, ['all']);
  assert.equal(keys[4].format, '/^v\\d+\\.\\d+\\.\\d+$/');
});

test('required picks the keys an environment needs', () => {
  assert.deepEqual(required(keys, 'staging').map((k) => k.name), ['DATABASE_URL', 'PUBLIC_HOST', 'TOTP_KEY', 'RELEASE_TAG']);
  assert.ok(required(keys, 'production').some((k) => k.name === 'SMTP_PORT'));
  assert.deepEqual(required(keys, 'local').map((k) => k.name), ['PUBLIC_HOST', 'RELEASE_TAG']);
});

test('formatTest knows the kinds and /regex/, and refuses an unknown one', () => {
  assert.equal(formatTest('base64-32')('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='), true);
  assert.equal(formatTest('base64-32')('c2hvcnQ='), false);
  assert.equal(formatTest('postgres-url')('postgres://u@h:5432/db'), true);
  assert.equal(formatTest('postgres-url')('mysql://u@h/db'), false);
  assert.equal(formatTest('/^v\\d+$/')('v3'), true);
  assert.equal(formatTest('colour'), null);
});

test('a staging env file with every key set and well formed is ready', () => {
  assert.deepEqual(checkValues(keys, 'staging', parseEnvFile(read('valid.env'))), []);
});

test('a wrong value fails by key and never shows the value', () => {
  const f = checkValues(keys, 'staging', parseEnvFile(read('broken.env')));
  assert.deepEqual(f.map((x) => x.key), ['DATABASE_URL', 'TOTP_KEY', 'RELEASE_TAG']);
  assert.ok(!JSON.stringify(f).includes('c2hvcnQ='), 'a finding must not carry the value');
});

test('a missing key, an empty one and a CRLF value each fail', () => {
  const values = parseEnvFile('PUBLIC_HOST=\r\nRELEASE_TAG=v1.0.0\r\nTOTP_KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=\r\n');
  const f = checkValues(keys, 'staging', values);
  assert.deepEqual(f.map((x) => [x.key, x.problem.split(' ')[0]]), [['DATABASE_URL', 'missing'], ['PUBLIC_HOST', 'missing'], ['TOTP_KEY', 'value'], ['RELEASE_TAG', 'value']]);
});

test('the store covers staging; production misses a key and leaves one unprotected', () => {
  const vars = JSON.parse(read('variables.json'));
  assert.deepEqual(checkStore(keys, 'staging', vars), []);
  assert.deepEqual(checkStore(keys, 'production', vars).map((x) => `${x.key}: ${x.problem}`), [
    'TOTP_KEY: production variable is not protected',
    'SMTP_PORT: not in the store for production',
  ]);
});

test('dbTarget finds the Postgres host to reach', () => {
  assert.deepEqual(dbTarget(keys, 'staging', parseEnvFile(read('valid.env'))), { key: 'DATABASE_URL', host: 'db.staging.invalid', port: 5432 });
});

test('the CLI: ready on the valid file, not ready on the broken one, usage error without --env', () => {
  const ok = run(['--env', 'staging', '--file', join(FIX, 'valid.env'), '--no-db']);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /READY — staging: 4 key\(s\) checked, 0 finding/);
  const bad = run(['--env', 'staging', '--file', join(FIX, 'broken.env'), '--no-db']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL TOTP_KEY: does not match Format base64-32/);
  assert.equal(run(['--file', join(FIX, 'valid.env')]).status, 2);
});

test('the CLI: the store check reads a saved variables answer', () => {
  const r = run(['--env', 'production', '--store', 'gitlab', '--variables', join(FIX, 'variables.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL SMTP_PORT: not in the store for production/);
  assert.equal(run(['--env', 'staging', '--store', 'gitlab', '--variables', join(FIX, 'variables.json')]).status, 0);
});

test('the CLI: an unreachable database is a finding', () => {
  const r = run(['--env', 'staging', '--file', join(FIX, 'valid.env')]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL DATABASE_URL: database host db\.staging\.invalid:5432 does not answer/);
});

// The rule only holds if the gates ask for it: G0 asks where it runs, G6 plans the pipeline and the
// keys first, G10 refuses a key that is not in the store. Each line below is one of those asks.
const ROOT = join(here, '..');
const bundle = (f) => readFileSync(join(ROOT, f), 'utf8');

test('the contract decides host, environments and the secret store at G0, not G10', () => {
  const c = bundle('DEV-CONTRACTS.md');
  assert.match(c, /### 13\.4 Deployment standards — owner `dev-planning-deployment`, enforced at G0 \+ G6 \+ G10/);
  assert.match(c, /A value is never kept in a `\.env` copied or edited by\s+hand/);
  assert.match(c, /`staging\.<domain>`, `staging-admin\.<domain>`, never\s+`admin\.staging\.<domain>`/);
});

test('the host picks the secret store, and local runs on development values only', () => {
  const c = bundle('DEV-CONTRACTS.md');
  assert.match(c, /and the host\s+picks that store/);
  assert.match(c, /A production value never sits in a file on a developer's machine/);
  const s = bundle('skills/dev-planning-deployment/secrets-and-environments.md');
  for (const host of ['Cloudflare Workers', 'AWS', 'Google Cloud', 'Azure', 'Kubernetes', 'A VM or VPS']) {
    assert.match(s, new RegExp(`^\\| ${host}`, 'm'), `no runtime-store row for ${host}`);
  }
  assert.match(s, /\*\*Local is for development only\.\*\*/);
  assert.match(
    bundle('skills/dev-reviewing-deployment/SKILL.md'),
    /\| 28 \|[^\n]*a production value kept in a file on a developer machine/,
  );
});

test('G0 asks the deploy questions and its reviewer fails an initiative that leaves them open', () => {
  assert.match(bundle('commands/sdlc-intake.md'), /record each gap as a `DEC-NNN` blocking G2, never G10/);
  assert.match(bundle('skills/dev-framing-problem/SKILL.md'), /whose `Blocks` is G2: the\nproduction host/);
  assert.match(bundle('skills/dev-reviewing-intake/SKILL.md'), /\| 18 \| An `initiative` names, or records as a `DEC-NNN` that blocks G2, its production host/);
});

test('G6 plans the pipeline to staging and the keys in the store in the first slice', () => {
  assert.match(bundle('skills/dev-planning-implementation/SKILL.md'), /two tasks sit in the first\nslice, before any feature/);
  assert.match(bundle('skills/dev-reviewing-plan/SKILL.md'), /\| 24 \| An `initiative`'s first slice has the two §13\.4 tasks/);
});

test('G10 needs a Secrets and config section, runs env-doctor and fails a hand-copied key', () => {
  assert.match(bundle('workspace/dev/_templates/release-plan.md'), /\n## Secrets and config\n/);
  assert.match(bundle('commands/sdlc-deploy.md'), /a key not in the store for `\$2`: stop with\n  `BLOCKED`/);
  assert.match(bundle('skills/dev-reviewing-deployment/SKILL.md'), /\| 28 \| `## Secrets and config` lists every key/);
  assert.match(bundle('workspace/dev/_templates/skeleton/ops/config/keys.md'), /\| Key \| Purpose \| Source \| Environments \| Holder \| Rotation \| Format \|/);
});
