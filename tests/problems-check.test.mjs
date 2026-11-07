/**
 * problems-check.mjs: problems.yaml, the openapi ProblemType enum and the code name the same
 * problems, each with one status chosen in one table (DEV-CONTRACTS §13.11).
 *
 * release-management had 67 types matching between Go and the contract and still chose a status
 * in 188 literals across 35 files, with four types answered with two statuses. A shape rule could
 * not see any of it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { project, edit, run, codes, FIXTURE } from './backend-fixture.mjs';
import { grammarProblem, isTitleCase, readCatalogue, emitCodes, check } from '../workspace/dev/scripts/problems-check.mjs';
import { Findings } from '../workspace/dev/scripts/lib/check.mjs';

const ARGS = ['demo', '--root', 'dev', '--source', '.', '--client', 'web/src'];

test('the valid fixture passes clean, with the facts counted', () => {
  const root = project();
  const r = run('problems-check.mjs', ARGS, root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary.catalogue, 4);
  assert.equal(r.json.summary['status choices'], 4);
  assert.equal(r.json.summary['outside the table'], 0);
});

test('the broken overlay trips every code rule', () => {
  const root = project({ broken: true });
  const r = run('problems-check.mjs', ARGS, root);
  assert.equal(r.status, 1);
  for (const c of ['E102', 'E103', 'E104', 'E106', 'E107', 'W101', 'W102']) assert.ok(r.json.counts[c], `${c} expected; got ${JSON.stringify(r.json.counts)}`);
  assert.ok(r.json.findings.some((f) => f.code === 'E102' && /built at runtime/.test(f.message)));
  assert.ok(r.json.findings.some((f) => f.code === 'E104' && /2 statuses/.test(f.message)));
});

test('catalogue ↔ openapi drift is E101 in both directions', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', '        - /problems/internal\n', '        - /problems/internal\n        - /problems/export-unavailable\n');
  edit(root, 'dev/api/demo/problems.yaml', 'type: /problems/release-not-found', 'type: /problems/release-missing-not-found');
  const r = run('problems-check.mjs', ARGS, root);
  const msgs = r.json.findings.filter((f) => f.code === 'E101').map((f) => f.message).join('\n');
  assert.match(msgs, /export-unavailable is in the openapi/);
  assert.match(msgs, /release-missing-not-found is in the catalogue and not in the openapi/);
});

test('a catalogue type never emitted is E105; a malformed entry is E100', () => {
  const root = project();
  edit(root, 'internal/http/problem.go', '	TypeReleaseConflict: {Status: http.StatusConflict, Title: "Release in another state"},\n', '');
  edit(root, 'internal/http/problem.go', '	case errors.Is(err, release.ErrConflict):\n		return TypeReleaseConflict, nil\n', '');
  edit(root, 'dev/api/demo/problems.yaml', 'status: 500', 'status: [500, 501]');
  const r = run('problems-check.mjs', ARGS, root);
  assert.ok(r.json.findings.some((f) => f.code === 'E105' && /release-conflict/.test(f.message)), JSON.stringify(r.json.findings));
  assert.ok(r.json.findings.some((f) => f.code === 'E100' && /exactly one integer/.test(f.message)));
});

test('the status table is configurable: moving it makes the table itself E103', () => {
  const root = project();
  const r = run('problems-check.mjs', [...ARGS, '--status-table', 'internal/errors/*.go'], root);
  assert.equal(r.json.counts.E103, 4);
});

test('no catalogue at all is an error, not a pass', () => {
  const root = project();
  const r = run('problems-check.mjs', ['other', '--root', 'dev', '--source', '.'], root);
  assert.equal(r.status, 1);
  assert.ok(codes(r.json).includes('E100'));
});

test('the type grammar: one suffix per meaning, reserved names exempt', () => {
  for (const ok of ['/problems/release-not-found', '/problems/reset-link-unavailable', '/problems/bug-limit-reached', '/problems/item-scope-conflict', '/problems/validation', '/problems/if-match-required']) assert.equal(grammarProblem(ok), null, ok);
  for (const bad of ['/problems/invitation-not-usable', '/problems/share-link-unusable', '/problems/name-taken', '/problems/not-found', '/problems/Bad_Name']) assert.ok(grammarProblem(bad), bad);
});

test('Title Case is told from sentence case', () => {
  assert.equal(isTitleCase('Last Project Admin'), true);
  assert.equal(isTitleCase('Release Not Found'), true);
  assert.equal(isTitleCase('Release not found'), false);
  assert.equal(isTitleCase('If-Match required'), false);
  assert.equal(isTitleCase('Not found'), false);
});

test('readCatalogue refuses a client_ux outside the set and a duplicate type', () => {
  const f = new Findings();
  readCatalogue('problems:\n  - type: /problems/a-not-found\n    status: 404\n    title: A\n    when: w\n    client_ux: modal\n  - type: /problems/a-not-found\n    status: 404\n    title: A\n    when: w\n    client_ux: page\n', f);
  const m = f.list.map((x) => x.message).join('\n');
  assert.match(m, /client_ux `modal`/);
  assert.match(m, /duplicate type/);
});

test('check() without sources still compares catalogue and contract', () => {
  const { findings } = check({ catalogue: 'problems:\n  - { type: /problems/a-not-found, status: 404, title: A, when: w, client_ux: page }\n', openapi: { components: { schemas: { ProblemType: { enum: ['/problems/b-not-found'] } } } }, files: null });
  assert.equal(findings.count('E101'), 2);
});

test('--emit-codes writes the FieldError enum as Go and Python', () => {
  const go = emitCodes(['required', 'too_long'], 'go');
  assert.match(go, /DO NOT EDIT/);
  assert.match(go, /CodeTooLong\s+Code = "too_long"/);
  assert.match(emitCodes(['too_long'], 'python'), /TOO_LONG = "too_long"/);
});

// A Next.js project (blueprints/nextjs.md): the server code is TypeScript under src/server, route
// handlers and server actions, formatted with single quotes. Before lib/langs.mjs isServerFile the
// checker read none of it: "types in code 0" and every catalogue type E102/E105.
function nextProject(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-next-'));
  cpSync(join(FIXTURE, 'valid', 'dev'), join(root, 'dev'), { recursive: true });
  const files = {
    'src/server/platform/errors/problem.ts': [
      "import 'server-only';",
      '',
      '/** The one status table. */',
      'export const STATUS_TABLE = {',
      "  '/problems/validation': { status: 422, title: 'Validation failed' },",
      "  '/problems/release-not-found': { status: 404, title: 'Release not found' },",
      "  '/problems/release-conflict': { status: 409, title: 'Release in another state' },",
      "  '/problems/internal': { status: 500, title: 'Internal error' },",
      '} as const;',
      '',
    ].join('\n'),
    'src/app/api/releases/[id]/route.ts': [
      "import { toProblem } from '@/server/platform/errors/problem';",
      '',
      'export async function GET() {',
      "  return toProblem('/problems/release-not-found');",
      '}',
      '',
    ].join('\n'),
    'src/features/releases/actions.ts': [
      "'use server';",
      '',
      'export async function publish() {',
      "  return { ok: false, problem: '/problems/release-conflict' };",
      '}',
      '',
    ].join('\n'),
    // UI: never read, so this unknown type is not E102.
    'src/features/releases/components/Banner.tsx': "export const Banner = () => <p>{'/problems/banner-invalid'}</p>;\n",
    ...extra,
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const NEXT_ARGS = ['demo', '--root', 'dev', '--source', '.'];

test('Next.js: single-quoted TypeScript server code is read, its status table passes clean', () => {
  const r = run('problems-check.mjs', NEXT_ARGS, nextProject());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary['types in code'], 4);
  assert.equal(r.json.summary['status choices'], 4);
  assert.equal(r.json.summary['outside the table'], 0);
});

test('Next.js: a status chosen in a server action, outside the table, is E103 and E104', () => {
  const root = nextProject({
    'src/features/releases/actions.ts': [
      "'use server';",
      '',
      'export async function publish() {',
      "  return Response.json({ type: '/problems/release-conflict', status: 400 });",
      '}',
      '',
    ].join('\n'),
  });
  const r = run('problems-check.mjs', NEXT_ARGS, root);
  assert.equal(r.status, 1);
  assert.ok(r.json.findings.some((f) => f.code === 'E103' && f.file === 'src/features/releases/actions.ts'), JSON.stringify(r.json.findings));
  assert.ok(r.json.findings.some((f) => f.code === 'E104' && /release-conflict is emitted with 2 statuses/.test(f.message)));
});

test('a backtick type with ${} is runtime-built; one without is a literal', () => {
  const files = [{ rel: 'src/server/x/problem.ts', text: "const a = { type: `/problems/${kind}-invalid`, status: 422 };\nconst b = { type: `/problems/internal`, status: 500 };\n" }];
  const { scan } = check({ catalogue: null, openapi: null, files, statusTable: [/problem\.ts$/], statusPattern: undefined, prefix: '/problems/' });
  assert.deepEqual(scan.dynamic.map((d) => d.line), [1]);
  assert.deepEqual(scan.emissions.map((e) => `${e.type} ${e.status}`), ['/problems/internal 500']);
});
