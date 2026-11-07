/**
 * The skeleton pipeline deploys (DEV-CONTRACTS §18.7): the walking-skeleton task copies it, so a new
 * product has build → publish → staging → production from its first slice, not on release day.
 *
 *   node --test tests/skeleton-pipeline.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKELETON = join(ROOT, 'workspace', 'dev', '_templates', 'skeleton');
const { parseYaml } = await import(pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'lib', 'yaml.mjs')).href);
const ci = parseYaml(readFileSync(join(SKELETON, '.gitlab-ci.yml'), 'utf8'));
const DEFAULT_BRANCH = '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH';

test('the stages run test → build → publish → deploy_staging → deploy_production', () => {
  assert.deepEqual(ci.stages, ['test', 'build', 'publish', 'deploy_staging', 'deploy_production']);
  for (const [job, stage] of [['check', 'test'], ['build', 'build'], ['publish', 'publish'], ['deploy_staging', 'deploy_staging'], ['deploy_production', 'deploy_production']]) {
    assert.equal(ci[job]?.stage, stage, `${job} runs in ${stage}`);
  }
});

test('publish pushes the commit-SHA tag to the GitLab registry, from the default branch only', () => {
  assert.equal(ci.variables.IMAGE, '$CI_REGISTRY_IMAGE');
  assert.ok(ci.publish.script.some((l) => /docker push "\$IMAGE:\$CI_COMMIT_SHA"/.test(l)));
  assert.deepEqual(ci.publish.rules, [{ if: DEFAULT_BRANCH }]);
});

test('staging deploys automatically on the default branch; production is manual and promotes the same SHA', () => {
  const s = ci.deploy_staging;
  const p = ci.deploy_production;
  assert.equal(s.environment.name, 'staging');
  assert.deepEqual(s.rules, [{ if: DEFAULT_BRANCH }], 'staging: the default branch, no manual step');
  assert.equal(p.environment.name, 'production');
  assert.deepEqual(p.rules, [{ if: DEFAULT_BRANCH, when: 'manual' }], 'production waits for a person');
  assert.deepEqual(p.needs, ['deploy_staging'], 'production follows staging in the same pipeline');
  assert.equal(p.allow_failure, false, 'the pipeline stays blocked until production is approved or refused');
  assert.ok(s.script.some((l) => l.includes('ops/deploy.sh staging "$CI_COMMIT_SHA"')));
  assert.ok(p.script.some((l) => l.includes('ops/deploy.sh production "$CI_COMMIT_SHA"')), 'the SHA staging ran, never a rebuild');
});

test('a database is snapshotted before the new version migrates, only when DB_SNAPSHOT says how', () => {
  const sh = readFileSync(join(SKELETON, 'ops', 'deploy.sh'), 'utf8');
  const snap = sh.indexOf('if [ -n "${DB_SNAPSHOT:-}" ]; then sh ops/snapshot.sh "$env" "$sha"; fi');
  assert.ok(snap > 0, 'deploy.sh calls ops/snapshot.sh behind DB_SNAPSHOT');
  assert.ok(snap < sh.indexOf('docker compose up'), 'the copy is taken before the new version starts and migrates');
  const s = readFileSync(join(SKELETON, 'ops', 'snapshot.sh'), 'utf8');
  for (const host of ['neon)', 'rds)', 'cloudsql)', 'pg_dump)']) assert.ok(s.includes(host), `snapshot.sh has an example for ${host}`);
  assert.match(s, /\*\) echo "snapshot: unknown DB_SNAPSHOT/, 'an unknown host fails rather than skipping the copy');
  assert.match(s, /set -eu/, 'a failed copy stops the deploy');
});

test('ops/deploy.sh and ops/compose.prod.yaml ship with the skeleton', () => {
  const sh = readFileSync(join(SKELETON, 'ops', 'deploy.sh'), 'utf8');
  assert.match(sh, /usage: ops\/deploy\.sh <staging\|production> <sha>/);
  assert.match(sh, /docker compose pull/);
  assert.match(sh, /readyz/, 'exit 0 only once the new version answers');
  assert.doesNotMatch(sh, /StrictHostKeyChecking=no/, 'host keys are checked');
  assert.match(readFileSync(join(SKELETON, 'ops', 'compose.prod.yaml'), 'utf8'), /\$\{IMAGE:\?[^}]*\}:\$\{TAG:\?/);
  assert.ok(statSync(join(SKELETON, 'ops', 'deploy.sh')).isFile());
});
