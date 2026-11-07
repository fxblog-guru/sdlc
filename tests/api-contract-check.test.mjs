/**
 * api-contract-check.mjs: what a machine can see of §13.1 / §13.7 / §13.12 — typed and bounded
 * schemas, closed request bodies, explicit null, no secret in a response, security, summaries,
 * examples that validate, and the per-operation declarations later gates read.
 *
 * The valid fixture passes clean. Each case below breaks exactly one rule in a copy of it and
 * must raise that rule's code — and only codes the case names — so a rule that stops firing, or
 * one that starts firing on a neighbour, fails here.
 *
 * On release-management (137 operations) the checker found no example in the whole contract,
 * no problem type shown, a csrf_token in two response schemas, and none of the declarations G7
 * and G8 read (x-timeout-ms, x-retry, x-cache, x-audit, x-traffic).
 */

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from './backend-fixture.mjs';
import { check, validate, loadPlan, SECRET_NAME } from '../workspace/dev/scripts/api-contract-check.mjs';
import { parseYaml } from '../workspace/dev/scripts/lib/yaml.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, 'fixtures', 'api-contract', 'valid');

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-acc-'));
  cpSync(VALID, dir, { recursive: true });
  return dir;
}

/** Apply [from, to] replacements to a copy of the valid contract; throw when an anchor is gone. */
function mutate(edits) {
  const dir = copy();
  const p = join(dir, 'openapi.yaml');
  let s = readFileSync(p, 'utf8');
  for (const [from, to] of edits) {
    if (!s.includes(from)) throw new Error(`anchor not found: ${from}`);
    s = s.replace(from, () => to);
  }
  writeFileSync(p, s);
  return dir;
}

const args = (dir) => ['demo', '--openapi', join(dir, 'openapi.yaml'), '--data-model', join(dir, 'data-model.md')];

test('the valid fixture contract passes clean, every example validating', () => {
  const r = run('api-contract-check.mjs', args(VALID), VALID);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary.examples, r.json.summary['examples valid']);
  assert.ok(r.json.summary.examples >= 20, `only ${r.json.summary.examples} examples checked`);
  assert.equal(r.json.summary['problem types shown'], '9/9');
});

const CASES = [
  ['E120 a property with no type', [['        status: { type: string, enum: [draft, live] }', '        status: { description: the state }']], 'E120', /`status` has no `type`/],
  ['E121 a request body that accepts unknown members', [["    ReleaseCreate:\n      type: object\n      additionalProperties: false", '    ReleaseCreate:\n      type: object']], 'E121', /mass assignment/],
  ['E122 nullable instead of a null type', [["        notes: { type: [string, 'null'], maxLength: 10000, description: Null when there are none. }", '        notes: { type: string, nullable: true, maxLength: 10000 }']], 'E122', /nullable/, ['E126']],
  ['E123 a secret in a response schema', [['        created_at: { type: string, format: date-time, readOnly: true }\n    ReleaseCreate:', '        created_at: { type: string, format: date-time, readOnly: true }\n        api_key: { type: string, maxLength: 64 }\n    ReleaseCreate:']], 'E123', /`api_key` can reach a response/],
  ['E123 an x-sensitive member that is not writeOnly', [['        price_minor: { type: integer, minimum: 0, maximum: 100000000 }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null', '        price_minor: { type: integer, minimum: 0, maximum: 100000000, x-sensitive: true }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null']], 'E123', /`price_minor` can reach a response/],
  ['E124 an open operation with no x-public reason', [['      x-public: a load balancer probe, no data\n', '']], 'E124', /getHealth: no security requirement/],
  ['E125 an operation with no summary', [['      summary: One release.\n', '']], 'E125', /getRelease: no `summary`/],
  ['E126 an example that breaks its schema', [['            example: { name: Spring, price_minor: 1500, currency: EUR }', '            example: { name: Spring, price_minor: -5, currency: euro }']], 'E126', /below minimum 0.*does not match pattern/],
  ['E126 an example with an unknown member', [['              example: { status: ok }', '              example: { status: ok, uptime: 3 }']], 'E126', /member `uptime` is not in the schema/],
  ['E127 an operation with no timeout', [['      x-timeout-ms: 800\n', '']], 'E127', /getRelease: no positive `x-timeout-ms`/],
  ['E127 a timeout below the p95 budget', [['      x-timeout-ms: 800\n', '      x-timeout-ms: 100\n']], 'E127', /x-timeout-ms 100 is below its p95_ms 150/],
  ['E128 an operation with no retry declaration', [['      x-retry: never\n', '']], 'E128', /sendRelease: no `x-retry/],
  ['E128 a write declared safe with no idempotency exemption', [['      x-retry: never\n', '      x-retry: safe\n'], ['      x-idempotency: exempt:a second send is refused 409 by the catalogue\n', '      x-idempotency: required\n']], 'E128', /x-retry safe on a write/],
  ['E129 a GET with no cache declaration', [['      x-cache: none\n', '']], 'E129', /getHealth: no `x-cache/],
  ['E130 a write with no audit declaration', [['      x-audit: false\n', '']], 'E130', /updateRelease: no `x-audit/],
  ['E131 a body with no size limit', [["      x-audit: false\n      x-max-body-kb: 16\n", '      x-audit: false\n']], 'E131', /updateRelease: a request body needs `x-max-body-kb`/],
  ['E132 a deprecated operation with no Deprecation header', [["            Deprecation: { $ref: '#/components/headers/Deprecation' }\n", '']], 'E132', /sendRelease: deprecated/],
  ['E133 an operation with no traffic class', [['      x-traffic: write\n      x-perf: { p95_ms: 900', '      x-perf: { p95_ms: 900']], 'E133', /sendRelease: no `x-traffic`/],
  ['E133 a class with no rate limit', [['    read: { rps: 50, peak_factor: 3, concurrency: 40, rate_limit: 300/min per account }', '    read: { rps: 50, peak_factor: 3, concurrency: 40 }']], 'E133', /class `read` lacks rate_limit/],
  ['E134 with-key retry and no 409', [["        '409': { $ref: '#/components/responses/Conflict' }\n", '']], 'E134', /createRelease: x-retry with-key needs/, ['W125']],
  ['W120 an unbounded request string', [['        name: { type: string, minLength: 1, maxLength: 100 }\n        price_minor', '        name: { type: string, minLength: 1 }\n        price_minor']], 'W120', /request string/],
  ['W120 an unbounded request array', [["        notes: { type: [string, 'null'], maxLength: 10000, default: null }", "        notes: { type: [string, 'null'], maxLength: 10000, default: null }\n        tags: { type: array, items: { type: string, maxLength: 20 } }"]], 'W120', /request array with no `maxItems`/],
  ['W121 an object with no required list', [['      required: []\n      properties:\n        name: { type: string, minLength: 1, maxLength: 100 }\n        notes', '      properties:\n        name: { type: string, minLength: 1, maxLength: 100 }\n        notes']], 'W121', /no `required` list/],
  ['W122 a long synchronous timeout', [['      x-timeout-ms: 2000\n', '      x-timeout-ms: 5000\n']], 'W122', /above 2 s, answer 202/],
  ['W123 an ETag with no conditional GET', [["        '304': { description: Not modified. }\n", '']], 'W123', /getRelease: an ETag with no If-None-Match/],
  ['W123 a cached GET with no Cache-Control', [["          headers:\n            Cache-Control: { $ref: '#/components/headers/CacheControl' }\n          content:\n            application/json:\n              schema:\n                type: object\n                additionalProperties: false\n                required: [data, page]", '          content:\n            application/json:\n              schema:\n                type: object\n                additionalProperties: false\n                required: [data, page]']], 'W123', /listReleases: x-cache private:30 with no Cache-Control/],
  ['W124 a 2xx response with no example', [['              example: { sent_at: \'2026-10-01T09:00:00Z\' }\n', '']], 'W124', /sendRelease: 200 application\/json has no example/],
  ['W125 a problem type no example shows', [['        - /problems/upstream-timeout\n', '        - /problems/upstream-timeout\n        - /problems/release-conflict\n']], 'W125', /release-conflict/],
  ['W126 a get with no query shape', [['      x-query: { shape: one row by primary key, indexes: [release_pk] }\n', '']], 'W126', /getRelease: no `x-query/],
  ['W126 an index the data model does not name', [['indexes: [release_pk]', 'indexes: [release_name_idx]']], 'W126', /`release_name_idx` is not named in data-model.md/],
  ['W127 an operation with no 429', [["        '404': { $ref: '#/components/responses/NotFound' }\n        '429': { $ref: '#/components/responses/TooManyRequests' }", "        '404': { $ref: '#/components/responses/NotFound' }"]], 'W127', /getRelease: no 429/],
  ['W128 a downstream call with no 5xx Retry-After', [["    UpstreamTimeout:\n      description: The catalogue timed out.\n      headers:\n        Retry-After: { $ref: '#/components/headers/RetryAfter' }\n", '    UpstreamTimeout:\n      description: The catalogue timed out.\n']], 'W128', /504 with no Retry-After/],
  ['W129 no CORS policy in info', [['  x-cors: same origin only; no Access-Control-Allow-Origin\n', '']], 'W129', /info.x-cors/],
  ['W130 a PATCH that is not merge patch', [['          application/merge-patch+json:', '          application/json:']], 'W130', /JSON Merge Patch/],
  ['W131 an operation with no requirement', [['      x-requirements: [REQ-013]\n', '']], 'W131', /sendRelease: no `x-requirements`/],
  ['W132 an operation with no X-Request-Id', [["      x-downstream: [legacy-catalogue]\n      parameters:\n        - $ref: '#/components/parameters/RequestId'\n", '      x-downstream: [legacy-catalogue]\n']], 'W132', /sendRelease: does not accept X-Request-Id/],
  ['W133 money as a number', [['        price_minor: { type: integer, minimum: 0, maximum: 100000000 }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null', '        price_minor: { type: number, minimum: 0, maximum: 100000000 }\n        currency: { type: string, pattern: \'^[A-Z]{3}$\' }\n        notes: { type: [string, \'null\'], maxLength: 10000, description: Null']], 'W133', /money-like `price_minor`/],
];

for (const [name, edits, code, message, alsoAllowed = []] of CASES) {
  test(name, () => {
    const dir = mutate(edits);
    const r = run('api-contract-check.mjs', args(dir), dir);
    const hits = r.json.findings.filter((f) => f.code === code);
    assert.ok(hits.length >= 1, `${code} not raised:\n${r.stdout}`);
    assert.ok(hits.some((f) => message.test(f.message)), `${code} raised with another message: ${hits.map((f) => f.message).join(' | ')}`);
    const others = Object.keys(r.json.counts).filter((c) => c !== code && !alsoAllowed.includes(c));
    assert.deepEqual(others, [], `the mutation raised other codes too: ${others.join(', ')}\n${r.stdout}`);
    assert.equal(r.status, code.startsWith('E') ? 1 : 0, 'an error fails the run, a warning does not');
  });
}

test('validate: types, null, bounds, enums, required by direction, oneOf', () => {
  const doc = parseYaml("components:\n  schemas:\n    A:\n      type: object\n      additionalProperties: false\n      required: [id, secret, n]\n      properties:\n        id: { type: string, readOnly: true }\n        secret: { type: string, writeOnly: true }\n        n: { type: [integer, 'null'], minimum: 1 }\n        k: { oneOf: [{ type: string }, { type: integer }] }\n");
  const A = { $ref: '#/components/schemas/A' };
  assert.deepEqual(validate(doc, A, { secret: 's', n: null }, { mode: 'request' }), []);
  assert.deepEqual(validate(doc, A, { id: 'x', n: 2 }, { mode: 'response' }), []);
  assert.match(validate(doc, A, { secret: 's', n: 0 }, { mode: 'request' }).join(), /below minimum 1/);
  assert.match(validate(doc, A, { id: 'x' }, { mode: 'response' }).join(), /`n` is missing/);
  assert.match(validate(doc, A, { id: 'x', n: 1, k: true }, { mode: 'response' }).join(), /0 of the oneOf/);
  assert.match(validate(doc, A, { id: 'x', n: 1.5 }, { mode: 'response' }).join(), /not integer or null/);
});

test('secret names: suffix words, not cursors', () => {
  for (const n of ['password', 'new_password', 'csrf_token', 'api_key', 'apikey', 'client_secret', 'private_key', 'credentials']) assert.ok(SECRET_NAME.test(n), n);
  for (const n of ['token_count', 'password_changed_at', 'tokenizer']) assert.ok(!SECRET_NAME.test(n), n);
  const doc = parseYaml("paths:\n  /a:\n    get:\n      responses:\n        '200':\n          content:\n            application/json:\n              schema: { type: object, required: [], properties: { next_page_token: { type: string } } }\n");
  assert.equal(check(doc).findings.count('E123'), 0);
  const flag = parseYaml("paths:\n  /a:\n    get:\n      responses:\n        '200':\n          content:\n            application/json:\n              schema: { type: object, required: [], properties: { has_password: { type: boolean } } }\n");
  assert.equal(check(flag).findings.count('E123'), 0, 'a boolean about a secret is not the secret');
});

test('an x-sensitive-response reason allows a secret returned once', () => {
  const dir = mutate([['        created_at: { type: string, format: date-time, readOnly: true }\n    ReleaseCreate:', '        created_at: { type: string, format: date-time, readOnly: true }\n        api_key: { type: string, maxLength: 64 }\n    ReleaseCreate:']]);
  const doc = parseYaml(readFileSync(join(dir, 'openapi.yaml'), 'utf8'));
  for (const item of Object.values(doc.paths)) for (const op of Object.values(item)) if (op && typeof op === 'object' && op.responses) op['x-sensitive-response'] = 'shown once on creation';
  assert.equal(check(doc).findings.count('E123'), 0);
});

test('--load-plan: one scenario per traffic class at rps × peak_factor', () => {
  const plan = loadPlan(parseYaml(readFileSync(join(VALID, 'openapi.yaml'), 'utf8')));
  assert.deepEqual(plan.map((s) => [s.class, s.target_rps, s.concurrency, s.operations.length]), [['read', 150, 40, 3], ['write', 20, 10, 3]]);
  const r = run('api-contract-check.mjs', [...args(VALID), '--load-plan'], VALID);
  assert.equal(r.status, 0);
  assert.equal(r.json.loadPlan[0].operations[0].p95_ms, 20);
});
