/**
 * api-style-check.mjs: one action style, one status per verb class, a closed operationId verb
 * list, and x-idempotency / x-concurrency on every non-GET (DEV-CONTRACTS §13.11).
 *
 * release-management's 137 operations used 45 operationId verbs and three action styles; pin was
 * POST 200 where star was PUT 204. Each choice was defensible alone, which is why a reviewer
 * reading for "taste" passed them all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, edit, run } from './backend-fixture.mjs';
import { check, classOf, actionShape, pageDefaults } from '../workspace/dev/scripts/api-style-check.mjs';
import { parseYaml } from '../workspace/dev/scripts/lib/yaml.mjs';

const ARGS = ['demo', '--root', 'dev'];

test('the valid fixture contract passes clean', () => {
  const r = run('api-style-check.mjs', ARGS, project());
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary['x-idempotency declared'], 6);
});

test('a missing or malformed x-idempotency / x-concurrency is an error', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', '      x-idempotency: required\n      x-concurrency: none:a new record has no prior version\n', '      x-concurrency: maybe\n');
  edit(root, 'dev/api/demo/openapi.yaml', '      x-idempotency: exempt:a repeated delete answers 404\n', '      x-idempotency: exempt:a repeated delete answers 404\n      x-concurrency-note: x\n');
  const r = run('api-style-check.mjs', ARGS, root);
  assert.equal(r.status, 1);
  assert.match(r.json.findings.find((f) => f.code === 'E108').message, /createRelease: no `x-idempotency/);
  assert.match(r.json.findings.find((f) => f.code === 'E109').message, /`maybe` is not/);
});

test('if-match without the header or the 412, and required without Idempotency-Key, are errors', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', "        '412': { $ref: '#/components/responses/Problem' }\n    delete:", '    delete:');
  edit(root, 'dev/api/demo/openapi.yaml', "        - { $ref: '#/components/parameters/IdempotencyKey' }\n      requestBody:", '      requestBody:');
  const r = run('api-style-check.mjs', ARGS, root);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E109 updateRelease: x-concurrency if-match, but no 412/);
  assert.match(m, /E108 createRelease: x-idempotency required, but no Idempotency-Key/);
});

test('a status outside the verb class, a toggle as POST, an unlisted verb', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', "        '204': { description: Deleted. }", "        '200': { description: Deleted. }");
  edit(root, 'dev/api/demo/openapi.yaml', '    put:\n      operationId: setReleasePin', '    post:\n      operationId: pinRelease');
  const r = run('api-style-check.mjs', ARGS, root);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E110 deleteRelease: a delete answers 204, not 200/);
  assert.match(m, /E110 pinRelease: POST\/DELETE on one sub-resource is a toggle/);
  assert.match(m, /E111 operationId `pinRelease`: verb `pin`/);
});

test('style warnings: a second action style, boolean and id naming, page size, sort, ETag', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', '  /releases/{release_id}/approve:', '  /releases/{release_id}/approvals:');
  edit(root, 'dev/api/demo/openapi.yaml', 'name: is_archived', 'name: archived');
  edit(root, 'dev/api/demo/openapi.yaml', 'name: project_id', 'name: projectId');
  edit(root, 'dev/api/demo/openapi.yaml', 'maximum: 100, default: 20', 'maximum: 50, default: 20');
  edit(root, 'dev/api/demo/openapi.yaml', 'name: sort,', 'name: order_by,');
  edit(root, 'dev/api/demo/openapi.yaml', "          headers:\n            ETag: { schema: { type: string } }\n    patch:", '    patch:');
  const r = run('api-style-check.mjs', ARGS, root);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  for (const want of [/action style `collection`/, /boolean filter `archived`/, /id parameter `projectId`/, /limit maximum 50/, /sort parameter `order_by`/, /W104 getRelease/]) assert.match(m, want);
  assert.equal(r.status, 0, 'style findings are warnings: they do not fail the run');
});

test('verb classes and action shapes', () => {
  assert.equal(classOf('approve'), 'action');
  assert.equal(classOf('unset'), 'state');
  assert.equal(classOf('toggle'), null);
  assert.equal(classOf('toggle', ['toggle']), 'action');
  assert.equal(actionShape('/releases/{id}/approve', 'post', 'action', 'approve'), 'verb');
  assert.equal(actionShape('/accounts/{id}/invitations', 'post', 'action', 'reissue'), 'collection');
  assert.equal(actionShape('/releases/{id}/export.pdf', 'get', 'action', 'export'), 'dotted');
  assert.equal(actionShape('/threads/{id}/star', 'put', 'state', 'set'), 'state-noun');
});

test('page defaults come from DEV-PROFILE §Defaults', () => {
  assert.deepEqual(pageDefaults({ defaults: { 'page-size': '25 / 200' } }), { default: 25, max: 200 });
  assert.deepEqual(pageDefaults({ defaults: {} }), { default: 20, max: 100 });
  const doc = parseYaml("paths:\n  /a:\n    get:\n      operationId: listAs\n      parameters:\n        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }\n      responses: { '200': { description: ok } }\n");
  assert.equal(check(doc, { page: { default: 25, max: 200 } }).findings.count('W103'), 2);
});
