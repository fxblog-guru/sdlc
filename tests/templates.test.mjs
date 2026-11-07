/**
 * A new project starts compliant: `_templates/api-contract.yaml`, with every <placeholder> filled
 * the obvious way, passes api-contract-check.mjs and api-style-check.mjs with no finding, and its
 * ProblemType enum matches `_templates/problems.yaml` once that is filled too (§13.11, §13.12).
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from './backend-fixture.mjs';
import { parseYaml } from '../workspace/dev/scripts/lib/yaml.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const TPL = join(ROOT, 'workspace', 'dev', '_templates');

/** Fill the placeholders: `<Resources>` → `Widgets`, a bracketed default → the default. */
export function fill(text) {
  const names = { resources: 'widgets', Resources: 'Widgets', resource: 'widget', Resource: 'Widget', verb: 'approve', 'REQ-NNN': 'REQ-001', host: 'api.example.com', dependency: 'billing' };
  return text
    .replace(/^#.*$/gm, '')
    .replace(/<([A-Za-z-]+)>/g, (m, k) => names[k] ?? m)
    .replace(/<([^<>\n]+)>/g, (m, inner) => (/^[\w.:/ -]+$/.test(inner) ? inner : 'filled'));
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-tpl-'));
  mkdirSync(join(root, 'dev', 'api', 'demo'), { recursive: true });
  mkdirSync(join(root, 'dev', 'data', 'demo'), { recursive: true });
  writeFileSync(join(root, 'dev', 'api', 'demo', 'openapi.yaml'), fill(readFileSync(join(TPL, 'api-contract.yaml'), 'utf8')));
  writeFileSync(join(root, 'dev', 'data', 'demo', 'data-model.md'), '| `widget_pk` | `widget_created_at_id_idx` |\n');
  return root;
}

test('the filled api-contract template has no placeholder left and parses', () => {
  const text = readFileSync(join(project(), 'dev', 'api', 'demo', 'openapi.yaml'), 'utf8');
  assert.doesNotMatch(text, /<[A-Za-z][^>\n]*>/);
  assert.ok(parseYaml(text).paths['/widgets']);
});

test('the filled template passes api-contract-check clean', () => {
  const root = project();
  const r = run('api-contract-check.mjs', ['demo', '--root', 'dev'], root);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings.map((f) => `${f.code} ${f.file} ${f.message}`), []);
  assert.equal(r.json.summary.examples, r.json.summary['examples valid']);
});

test('the filled template passes api-style-check clean', () => {
  const root = project();
  const r = run('api-style-check.mjs', ['demo', '--root', 'dev'], root);
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings.map((f) => `${f.code} ${f.message}`), []);
});

test('the template carries the shared components every project starts from', () => {
  const doc = parseYaml(fill(readFileSync(join(TPL, 'api-contract.yaml'), 'utf8')));
  for (const p of ['IdempotencyKey', 'IfMatch', 'IfNoneMatch', 'RequestId', 'Limit', 'Cursor']) assert.ok(doc.components.parameters[p], p);
  for (const h of ['ETag', 'Location', 'CacheControl', 'RetryAfter', 'Deprecation', 'Sunset', 'RateLimitLimit']) assert.ok(doc.components.headers[h], h);
  const byStatus = {};
  for (const r of Object.values(doc.components.responses)) byStatus[r.content['application/problem+json'].example.status] = true;
  for (const s of [400, 401, 403, 404, 409, 412, 413, 422, 429, 500, 502, 503, 504]) assert.ok(byStatus[s], `no shared problem response for ${s}`);
  assert.ok(doc.components.schemas.PageInfo.properties.next_cursor);
});

test('the template ProblemType enum and the problems.yaml template name the same reserved types', () => {
  const contract = parseYaml(fill(readFileSync(join(TPL, 'api-contract.yaml'), 'utf8')));
  const catalogue = parseYaml(fill(readFileSync(join(TPL, 'problems.yaml'), 'utf8')));
  assert.deepEqual([...catalogue.problems.map((p) => p.type)].sort(), [...contract.components.schemas.ProblemType.enum].sort());
});

test('the reserved problem names are the same in §13.11 and problems-check', async () => {
  const { RESERVED } = await import('../workspace/dev/scripts/problems-check.mjs');
  const contract = readFileSync(join(ROOT, 'DEV-CONTRACTS.md'), 'utf8').replace(/\r\n/g, '\n');
  const sentence = /Reserved, outside the grammar:([\s\S]*?)\*\*/.exec(contract)[1];
  assert.deepEqual([...sentence.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).sort(), [...RESERVED].sort());
});
