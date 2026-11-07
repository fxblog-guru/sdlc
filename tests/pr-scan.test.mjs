/**
 * pr-scan.mjs — the development-PR scanner (/sdlc-review-pr), against a scratch git repository.
 *
 * A clean change must scan quiet and each seeded defect must raise its own finding: a rule that
 * cannot fail here cannot be trusted in a review. The false positives found on real repositories
 * (fake passwords in fixtures, base64 images, driver-quoted identifiers, a moved test, an `-a2`
 * gate log sorting before its attempt 1) are pinned too.
 *
 *   node --test tests/pr-scan.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const { scan } = await import(pathToFileURL(join(here, '..', 'workspace', 'dev', 'scripts', 'pr-scan.mjs')).href);

const SRC = 'internal/order/service.go';
const TEST = 'internal/order/service_test.go';
const body = (n) => `package order\n\n${Array.from({ length: n }, (_, i) => `func F${i}() int { return ${i} }`).join('\n')}\n`;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'dev-prscan-'));
  const sh = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 'dev@example.test');
  sh('config', 'user.name', 'Dev');
  sh('config', 'core.autocrlf', 'false');
  put(SRC, body(3));
  put(TEST, 'package order\n\nimport "testing"\n\nfunc TestF(t *testing.T) { if F1() != 1 { t.Fatal("F1") } }\n');
  put('migrations/0001_create_order.up.sql', 'CREATE TABLE orders (id uuid primary key);\n');
  sh('add', '-A');
  sh('commit', '-qm', 'base');
  sh('checkout', '-qb', 'feature');
  const commit = (msg = 'feat(order): change the order service') => { sh('add', '-A'); sh('commit', '-qm', msg, '--allow-empty'); };
  return { dir, sh, put, commit, rm: (p) => unlinkSync(join(dir, p)), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const ids = (s) => s.findings.map((f) => f.id);
const run = (r) => scan({ base: 'main', head: 'HEAD', cwd: r.dir });

test('a small change with its test scans quiet', () => {
  const r = repo();
  try {
    r.put(SRC, body(40));
    r.put(TEST, 'package order\n\nimport "testing"\n\nfunc TestF(t *testing.T) { if F39() != 39 { t.Fatal("F39") } }\n');
    r.commit();
    assert.deepEqual(ids(run(r)), []);
  } finally { r.done(); }
});

test('source changed with no test changed is MAJOR', () => {
  const r = repo();
  try {
    r.put(SRC, body(40));
    r.commit();
    const f = run(r).findings.find((x) => x.id === 'PR-NO-TEST');
    assert.equal(f?.severity, 'MAJOR');
  } finally { r.done(); }
});

test('a provider key is a BLOCKER; a fake password in a fixture and a base64 image are not', () => {
  const r = repo();
  try {
    r.put('internal/testfixtures/accounts.go', 'package testfixtures\nconst FixturePassword = "kestrel-fixture-password-1"\n');
    r.put('web/page.html', `<img src="data:image/png;base64,${'sk-'.padEnd(60, 'A')}">\n`);
    r.commit();
    assert.deepEqual(ids(run(r)).filter((x) => x.startsWith('PR-SECRET')), []);
    r.put('internal/order/client.go', `package order\nconst key = "AKIA${'ABCDEFGHIJKLMNOP'}"\n`);
    r.commit();
    assert.equal(run(r).findings.find((x) => x.id === 'PR-SECRET')?.severity, 'BLOCKER');
  } finally { r.done(); }
});

test('SQL built from a value is caught; a driver-quoted identifier is not', () => {
  const r = repo();
  try {
    r.put('internal/order/repo.go', 'package order\nfunc q(name string) string { return `SELECT count(*) FROM ` + pgx.Identifier{name}.Sanitize() }\n');
    r.commit();
    assert.ok(!ids(run(r)).includes('PR-SQL-CONCAT'));
    r.put('internal/order/repo2.go', "package order\nfunc q2(id string) string { return \"SELECT * FROM orders WHERE id = '\" + id + \"'\" }\n");
    r.commit();
    assert.ok(ids(run(r)).includes('PR-SQL-CONCAT'));
  } finally { r.done(); }
});

test('an edited migration is a BLOCKER; a deleted test is MAJOR unless it moved', () => {
  const r = repo();
  try {
    r.put('migrations/0001_create_order.up.sql', 'CREATE TABLE orders (id uuid primary key, total int);\n');
    r.rm(TEST);
    r.commit();
    const got = ids(run(r));
    assert.ok(got.includes('PR-MIGRATION-EDITED'));
    assert.ok(got.includes('PR-TEST-DELETED'));
  } finally { r.done(); }
  const m = repo();
  try {
    m.rm(TEST);
    m.put('internal/order/v2/service_test.go', 'package v2\n\nimport "testing"\n\nfunc TestG(t *testing.T) { t.Log("moved and rewritten") }\n');
    m.commit();
    assert.ok(!ids(run(m)).includes('PR-TEST-DELETED'));
  } finally { m.done(); }
});

test('a focused test and a swallowed error are caught', () => {
  const r = repo();
  try {
    r.put('web/src/order.test.ts', "it.only('x', () => { expect(1).toBe(1); });\n");
    r.put('web/src/order.ts', 'export function f() { try { g(); } catch {} }\n');
    r.commit();
    const got = ids(run(r));
    assert.ok(got.includes('PR-FOCUS'));
    assert.ok(got.includes('PR-SWALLOW'));
  } finally { r.done(); }
});

test('gate logs: the latest attempt wins, and a slug without G8 is reported', () => {
  const r = repo();
  try {
    const log = (verdict, attempt) => `---\nslug: orders\ngate: G7\nrun_id: 20261013-045948-e0bc\nattempt: ${attempt}\nverdict: ${verdict}\n---\n`;
    r.put('dev/intake/orders/problem.md', '---\nslug: orders\n---\n');
    r.put('dev/reviews/orders/G7-implementation-20261013-045948-e0bc.md', log('CHANGES_REQUESTED', 1));
    r.put('dev/reviews/orders/G7-implementation-20261013-045948-e0bc-a2.md', log('PASS', 2));
    r.commit();
    const s = run(r);
    assert.deepEqual(s.slugs, ['orders']);
    assert.equal(s.gates.orders.G7.verdict, 'PASS');
    assert.ok(!ids(s).includes('PR-GATE-OPEN'));
    assert.ok(s.findings.some((f) => f.id === 'PR-GATE-MISSING' && /G8/.test(f.message)));
  } finally { r.done(); }
});

// ---- "does not break" and "right format" -------------------------------------------------------

const OAS = (extra = '', enumValues = 'open, paid') => `openapi: 3.1.0
info:
  title: Orders
  version: 1.0.0
paths:
  /orders/{id}:
    get:
      operationId: getOrder
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  status:
                    type: string
                    enum: [${enumValues}]
${extra}        '404':
          description: missing
`;

test('a breaking API change is a BLOCKER; an added field is not; a declared break is INFO', () => {
  const r = repo();
  try {
    r.put('api/openapi.yaml', OAS());
    r.commit('feat(order): add the contract');
    r.sh('checkout', '-q', 'main');
    r.sh('merge', '-q', '--ff-only', 'feature');
    r.sh('checkout', '-q', 'feature');
    r.put('api/openapi.yaml', OAS('                  total:\n                    type: integer\n'));
    r.commit();
    assert.ok(!ids(run(r)).includes('PR-BREAKING'), 'an additive change reported as breaking');
    r.put('api/openapi.yaml', OAS('', 'open').replace("        '404':\n          description: missing\n", ''));
    r.commit();
    const breaks = run(r).findings.filter((f) => f.id === 'PR-BREAKING');
    assert.ok(breaks.length >= 2, `expected the removed status and the narrowed enum, got ${breaks.map((b) => b.message).join(' | ')}`);
    assert.equal(breaks[0].severity, 'BLOCKER');
    r.put('api/contract-diff.md', '| Change | Breaking |\n|---|---|\n| `getOrder` 404 removed, `status` enum narrowed | yes |\n');
    r.commit();
    const s = run(r);
    assert.ok(!ids(s).includes('PR-BREAKING'), 'a declared break still blocks');
    assert.ok(ids(s).includes('PR-BREAKING-DECLARED'));
  } finally { r.done(); }
});

test('a destructive or locking migration is MAJOR; its .down file is not judged', () => {
  const r = repo();
  try {
    r.put('migrations/0002_drop_note.up.sql', 'ALTER TABLE orders DROP COLUMN note;\n');
    r.put('migrations/0002_drop_note.down.sql', 'ALTER TABLE orders ADD COLUMN note text;\n');
    r.put('migrations/0003_total.up.sql', 'ALTER TABLE orders ADD COLUMN total int NOT NULL;\nCREATE INDEX orders_total ON orders (total);\n');
    r.commit();
    const s = run(r);
    assert.ok(s.findings.some((f) => f.id === 'PR-MIGRATION-DESTRUCTIVE' && f.where.startsWith('migrations/0002_drop_note.up.sql')));
    assert.ok(!s.findings.some((f) => f.where.includes('.down.')));
    assert.equal(s.findings.filter((f) => f.id === 'PR-MIGRATION-LOCK').length, 2);
  } finally { r.done(); }
});

test('a branch that will not merge, a committed conflict marker, and a stale base are caught', () => {
  const r = repo();
  try {
    r.put(SRC, body(3).replace('return 1', 'return 100'));
    r.put('README.md', '# Orders\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> main\n');
    r.commit();
    r.sh('checkout', '-q', 'main');
    r.put(SRC, body(3).replace('return 1', 'return 200'));
    r.commit('fix(order): change F1 on main');
    r.sh('checkout', '-q', 'feature');
    const s = run(r);
    assert.equal(s.behind, 1);
    assert.deepEqual(s.conflicts, [SRC]);
    for (const id of ['PR-CONFLICTS', 'PR-CONFLICT-MARKER', 'PR-BEHIND']) assert.ok(ids(s).includes(id), `${id} not raised`);
  } finally { r.done(); }
});

test('commit messages and the branch name follow the commit-msg hook rules, grouped per rule', () => {
  const r = repo();
  try {
    r.put(SRC, body(3) + '// a\n');
    r.commit('Fixed stuff.');
    r.put(SRC, body(3) + '// b\n');
    r.commit('wip');
    r.put(SRC, body(3) + '// c\n');
    r.commit('feat(order): a good one');
    const s = scan({ base: 'main', head: 'HEAD', cwd: r.dir, branch: 'my_branch' });
    const fmt = s.findings.filter((f) => f.id === 'PR-COMMIT-FORMAT');
    assert.equal(fmt.length, 2, fmt.map((f) => f.message).join(' | '));
    assert.ok(fmt.some((f) => /E092/.test(f.message)) && fmt.some((f) => /E097/.test(f.message)));
    assert.ok(!ids(scan({ base: 'main', head: 'HEAD', cwd: r.dir, branch: 'feature/orders-cap' })).includes('PR-BRANCH-NAME'));
  } finally { r.done(); }
});

test('build output, a large file and a CI change are reported', () => {
  const r = repo();
  try {
    r.put('dist/app.min.js', 'x');
    r.put('assets/dump.bin', Buffer.alloc(1024 * 1024 + 10, 0)); // NUL bytes: git's own binary test
    r.put('.gitlab-ci.yml', 'stages: [test]\n');
    r.commit();
    const got = ids(run(r));
    for (const id of ['PR-GENERATED', 'PR-BIG-FILE', 'PR-BINARY', 'PR-CI-CHANGED']) assert.ok(got.includes(id), `${id} not raised`);
  } finally { r.done(); }
});

test('gate logs and pipeline paths are read under a .sdlc/ root too', () => {
  const r = repo();
  try {
    const log = (gate) => `---\nslug: orders\ngate: ${gate}\nrun_id: 20261013-045948-e0bc\nattempt: 1\nverdict: PASS\n---\n`;
    r.put('.sdlc/intake/orders/problem.md', '---\nslug: orders\n---\n');
    r.put('.sdlc/reviews/orders/G7-implementation-20261013-045948-e0bc.md', log('G7'));
    r.put('.sdlc/reviews/orders/G8-verification-20261013-045948-e0bc.md', log('G8'));
    // Bundle code under the root is not product source with no test.
    r.put('.sdlc/scripts/tool.go', body(60));
    r.commit();
    const s = run(r);
    assert.deepEqual(s.slugs, ['orders']);
    assert.equal(s.gates.orders.G8.verdict, 'PASS');
    assert.ok(!ids(s).includes('PR-GATE-MISSING'), ids(s).join(','));
    assert.ok(!ids(s).includes('PR-NO-TEST'), 'files under the SDLC root are not product source');
  } finally { r.done(); }
});

test('the QA side is .stlc/ (qa 2.2+) as well as qa/', () => {
  for (const qa of ['.stlc', 'qa']) {
    const r = repo();
    try {
      r.put(SRC, body(40));
      r.put(TEST, 'package order\n\nimport "testing"\n\nfunc TestF(t *testing.T) { if F39() != 39 { t.Fatal("F39") } }\n');
      r.put(`${qa}/cases/orders/TC-001.md`, '# case\n');
      r.put(`${qa}/scripts/e2e/orders.spec.ts`, `test('orders', async () => {});\n${'// x\n'.repeat(40)}`);
      r.commit();
      const s = run(r);
      const mixed = s.findings.find((x) => x.id === 'PR-MIXED');
      assert.ok(mixed, `${qa}: ${ids(s).join(',')}`);
      assert.ok(mixed.where.startsWith(`2 ${qa}/ file`), mixed.where);
    } finally { r.done(); }
  }
});
