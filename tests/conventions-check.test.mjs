/**
 * conventions-check.mjs: the mechanical half of conventions.md — the sqlc vocabulary, queries
 * copied between packages, test helpers duplicated across packages, and the env-key prefix
 * against .env.example (DEV-CONTRACTS §13.11).
 *
 * release-management named inserts Insert/Record/Store/Save with ~40 noun-named reads, copied
 * ProjectExists into several queries.sql, defined newEnv in 15 packages, and shipped 20 env keys
 * with no prefix. G7 check 18 had no greenfield card to compare with.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, run } from './backend-fixture.mjs';
import { sqlcQueries, envExampleKeys, testHelpers } from '../workspace/dev/scripts/conventions-check.mjs';

const ARGS = ['--source', '.', '--prefix', 'DEMO_'];

test('the valid fixture passes clean, the shared lookups file included', () => {
  const r = run('conventions-check.mjs', ARGS, project());
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary['sqlc queries'], 4);
});

test('the broken overlay: off-vocabulary names, a copied query, a helper in three packages, env drift', () => {
  const r = run('conventions-check.mjs', [...ARGS, '--helper-threshold', '2'], project({ broken: true }));
  assert.equal(r.status, 1);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E117 sqlc query `InsertRelease`: `Insert`/);
  assert.match(m, /E117 sqlc query `ReleaseName`: `Release`/);
  assert.match(m, /W110 `(ProjectExists|ExistsProject)` is copied into 3 queries\.sql/);
  assert.match(m, /W109 test helper `newEnv` is defined in 3 packages/);
  assert.match(m, /E118 `BASE_URL` has no `DEMO_` prefix/);
  assert.match(m, /E118 `DEMO_UNUSED` is in \.env\.example and no config reads it/);
  assert.match(m, /E118 `DEMO_LOG_LEVEL` is read and not in \.env\.example/);
});

test('the helper threshold is configurable', () => {
  const r = run('conventions-check.mjs', [...ARGS, '--helper-threshold', '3'], project({ broken: true }));
  assert.equal(r.json.counts.W109 ?? 0, 0);
});

test('parsers', () => {
  const q = sqlcQueries([{ rel: 'a/queries.sql', text: '-- name: GetA :one\nSELECT 1;\n-- name: ListAs :many\nSELECT  2 ;\n' }]);
  assert.deepEqual(q.map((x) => `${x.verb}:${x.body}`), ['Get:select 1;', 'List:select 2 ;']);
  assert.deepEqual([...envExampleKeys('A_B=1\n# A_C=2\n# a comment = x\n').keys()], ['A_B', 'A_C']);
  const h = testHelpers([{ rel: 'x/a_test.go', text: 'package x\nfunc TestA(t *testing.T) {}\nfunc newEnv() {}\nfunc (e *env) close() {}\n' }]);
  assert.deepEqual(h.map((x) => x.name), ['newEnv', 'close']);
});
