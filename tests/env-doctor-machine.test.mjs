/**
 * env-doctor.mjs, the machine checks (DEV-CONTRACTS §13.4, dev-planning-deployment/go-live.md): a
 * resolver that cannot find the host, a checkout that rewrites line endings, and a database URL
 * through a transaction pooler. Each was a release-day surprise once; each must be able to fail.
 *
 *   node --test tests/env-doctor-machine.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'dev', 'scripts', 'env-doctor.mjs');
const doctor = await import(pathToFileURL(SCRIPT).href);

test('database url: a pooler host, port 6432 or pgbouncer=true warns, and the URL is never echoed', () => {
  const secret = 'postgresql://app:s3cret@ep-cool-name-123-pooler.region.example.tech/db';
  const risk = doctor.poolerRisk(secret);
  assert.match(risk, /connection pooler/);
  assert.doesNotMatch(risk, /s3cret|app:|ep-cool-name/);
  assert.match(doctor.poolerRisk('postgresql://u:p@db.internal:6432/db'), /6432/);
  assert.match(doctor.poolerRisk('postgresql://u:p@db.internal:5432/db?pgbouncer=true'), /pgbouncer/);
  assert.equal(doctor.poolerRisk('postgresql://u:p@ep-cool-name-123.region.example.tech/db'), null);
  assert.equal(doctor.poolerRisk('postgresql://u:p@mypoolerdb.example/db'), null, 'a word containing pooler is not a pooler');
  assert.equal(doctor.poolerRisk('not a url'), null);
});

test('line endings: autocrlf=true warns; false or unset does not', () => {
  assert.match(doctor.lineEndingRisk('true'), /autocrlf=true/);
  assert.equal(doctor.lineEndingRisk('false'), null);
  assert.equal(doctor.lineEndingRisk(undefined), null);
});

test('a run: an unresolvable --clock-url host fails, a pooler URL warns without printing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-doctor-machine-'));
  writeFileSync(join(dir, 'keys.md'), '| Key | Purpose | Source | Environments | Holder | Rotation | Format |\n|---|---|---|---|---|---|---|\n| DATABASE_URL | db | neon | all | owner | yearly | postgres-url |\n');
  writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgresql://app:s3cret@ep-x-pooler.region.example.tech:5432/db\n');
  const r = spawnSync(process.execPath, [SCRIPT, '--env', 'staging', '--keys', join(dir, 'keys.md'), '--file', join(dir, '.env'), '--no-db', '--clock-url', 'https://no-such-host.invalid'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL \(dns\): no-such-host\.invalid does not resolve here/);
  assert.match(r.stdout, /WARN DATABASE_URL: host `….region.example.tech` is a connection pooler/);
  assert.doesNotMatch(r.stdout, /s3cret/);
});
