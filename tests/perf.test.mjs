/**
 * Performance budgets: the `x-perf` reader, its lint (W050/W051), and perf-smoke.mjs — every check
 * must be able to fail (DEV-CONTRACTS §13.7).
 *
 * The smoke runs against a real HTTP server in this process. The valid contract's endpoints are
 * within budget; the broken contract's /slow, /fat and /chatty each breach exactly one budget —
 * latency, payload, and the query count an N+1 produces — and must fail with that reason.
 *
 *   node --test tests/perf.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { budgetOf, budgetProblems, readOperations } from '../workspace/dev/scripts/lib/perf.mjs';
import { judge, parseArgs, percentile, planSmoke, runSmoke } from '../workspace/dev/scripts/perf-smoke.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, 'fixtures', 'valid', 'perf', 'openapi.yaml');
const BROKEN = join(here, 'fixtures', 'broken', 'perf', 'openapi.yaml');
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'perf-smoke.mjs');

// ---------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------

test('readOperations finds every operation under paths:, with flow and block x-perf, and nothing outside', () => {
  const ops = readOperations(readFileSync(VALID, 'utf8'));
  assert.deepEqual(ops.map((o) => `${o.method} ${o.path} ${o.operationId}`), [
    'GET /fast getFast', 'GET /items listItems', 'POST /items createItem', 'GET /items/{id} getItem',
  ]);
  assert.deepEqual(ops.map((o) => [o.timeoutMs, o.cache]), [[null, null], [null, null], [null, null], [1000, 'private:30']]);
  assert.deepEqual(ops.map((o) => budgetOf(o.perf)), [
    { p95_ms: 400, max_queries: 3, max_payload_kb: 4 },
    { p95_ms: 500, max_queries: 4, max_payload_kb: 16 },
    { p95_ms: 300, max_queries: 2, max_payload_kb: 2 },
    { p95_ms: 200, max_queries: 2, max_payload_kb: 4 },
  ]);
});

test('readOperations reads a JSON contract too', () => {
  const ops = readOperations(JSON.stringify({ paths: { '/a': { get: { operationId: 'a', 'x-perf': { p95_ms: 1, max_queries: 1, max_payload_kb: 1 } }, parameters: [] } } }), 'openapi.json');
  assert.equal(ops.length, 1);
  assert.deepEqual(budgetOf(ops[0].perf), { p95_ms: 1, max_queries: 1, max_payload_kb: 1 });
});

test('budgetProblems names what is missing or not a positive number', () => {
  assert.deepEqual(budgetProblems(null), ['no `x-perf` budget']);
  assert.deepEqual(budgetProblems({ p95_ms: '0', max_queries: '3' }), ['`p95_ms: 0` is not a positive number', '`max_payload_kb` missing']);
  assert.deepEqual(budgetProblems({ __unread__: 'fast' }), ['`x-perf: fast` is not a map']);
  assert.deepEqual(budgetProblems({ p95_ms: '1', max_queries: '1', max_payload_kb: '1' }), []);
});

// ---------------------------------------------------------------------------------------------
// The lint: W050 no budget, W051 an incomplete one — on the contract, advisory
// ---------------------------------------------------------------------------------------------

function devRootWith(contract) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-perf-'));
  mkdirSync(join(root, 'api', 'demo'), { recursive: true });
  cpSync(contract, join(root, 'api', 'demo', 'openapi.yaml'));
  return root;
}

test('W050/W051: a fully budgeted contract is clean', () => {
  assert.deepEqual(lintTree(devRootWith(VALID), TEMPLATES), []);
});

test('W051: a p95 budget above the operation x-timeout-ms', () => {
  const root = devRootWith(VALID);
  const p = join(root, 'api', 'demo', 'openapi.yaml');
  writeFileSync(p, readFileSync(p, 'utf8').replace('x-timeout-ms: 1000', 'x-timeout-ms: 150'));
  const findings = lintTree(root, TEMPLATES);
  assert.deepEqual(findings.map((f) => f.rule), ['W051']);
  assert.match(findings[0].message, /`p95_ms: 200` is above `x-timeout-ms: 150`/);
});

test('W050/W051: an operation with no budget, and one with an incomplete budget, are warnings — and only those', () => {
  const findings = lintTree(devRootWith(BROKEN), TEMPLATES);
  assert.deepEqual(findings.map((f) => `${f.level} ${f.rule} ${f.line}`), ['warn W050 35', 'warn W051 40']);
  assert.match(findings[0].message, /getUnbudgeted \(GET \/unbudgeted\) has no `x-perf`/);
  assert.match(findings[1].message, /p95_ms: 0.*max_payload_kb` missing/);
});

// ---------------------------------------------------------------------------------------------
// perf-smoke: pure parts
// ---------------------------------------------------------------------------------------------

test('parseArgs: base and contract required, --call needs a path, defaults hold', () => {
  assert.throws(() => parseArgs(['--contract', 'x']), /--base is required/);
  assert.throws(() => parseArgs(['--base', 'http://x', '--contract', 'c', '--call', 'getItem']), /expected <operationId>=/);
  const o = parseArgs(['--base', 'http://x/v1/', '--contract', 'c', '--call', 'getItem=/items/1', '--header', 'Cookie: s=1', '--require-queries']);
  assert.equal(o.base, 'http://x/v1');
  assert.equal(o.calls.get('getItem'), '/items/1');
  assert.deepEqual(o.headers, { Cookie: 's=1' });
  assert.equal(o.headroom, 0.5);
  assert.equal(o.requireQueries, true);
});

test('planSmoke: GETs only, concrete paths, a path parameter without --call is skipped and said', () => {
  const ops = readOperations(readFileSync(VALID, 'utf8'));
  const base = parseArgs(['--base', 'http://h', '--contract', 'c']);
  const { plan, skipped } = planSmoke(ops, base);
  assert.deepEqual(plan.map((p) => p.url), ['http://h/fast', 'http://h/items']);
  assert.deepEqual(skipped.map((s) => s.reason), ['path parameters and no --call getItem=/…']);
  const withCall = planSmoke(ops, parseArgs(['--base', 'http://h', '--contract', 'c', '--call', 'getItem=/items/7', '--max-endpoints', '2']));
  assert.deepEqual(withCall.plan.map((p) => p.url), ['http://h/fast', 'http://h/items']);
  assert.match(withCall.skipped[0].reason, /past --max-endpoints 2/);
});

test('percentile is nearest-rank', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95), 19);
});

test('judge: latency over headroom, payload over budget, queries over budget, and a non-2xx each breach', () => {
  const budget = { p95_ms: 100, max_queries: 3, max_payload_kb: 1 };
  const opts = { headroom: 0.5, queryHeader: 'X-Query-Count', requireQueries: false };
  const ok = Array.from({ length: 20 }, () => ({ status: 200, ms: 10, bytes: 100, queries: 2 }));
  assert.equal(judge(ok, budget, opts).ok, true);
  const slow = ok.map((s) => ({ ...s, ms: 60 }));
  assert.match(judge(slow, budget, opts).breaches[0], /p95 60.0 ms > 50 ms/);
  assert.match(judge(ok.map((s) => ({ ...s, bytes: 2048 })), budget, opts).breaches[0], /payload 2.0 KB > max_payload_kb 1/);
  assert.match(judge(ok.map((s) => ({ ...s, queries: 21 })), budget, opts).breaches[0], /21 queries > max_queries 3 .*N\+1/);
  assert.match(judge(ok.map((s) => ({ ...s, status: 500 })), budget, opts).breaches[0], /status 500/);
  const uncounted = ok.map((s) => ({ ...s, queries: null }));
  assert.equal(judge(uncounted, budget, opts).ok, true, 'no counter header is a note by default');
  assert.equal(judge(uncounted, budget, { ...opts, requireQueries: true }).ok, false, '--require-queries makes it a breach');
  assert.match(judge(ok.map((s, i) => ({ ...s, ms: i ? 10 : 900 })), { ...budget, p95_ms: 2000, timeout_ms: 500 }, opts).breaches[0], /a call took 900 ms > x-timeout-ms 500/);
  assert.equal(judge(ok, { ...budget, cache: 'none' }, opts).ok, true, 'x-cache none needs no Cache-Control');
});

// ---------------------------------------------------------------------------------------------
// perf-smoke: live, against a real server
// ---------------------------------------------------------------------------------------------

function startApp() {
  const server = createServer((req, res) => {
    const send = (body, queries, delay = 0) => setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json', 'x-query-count': String(queries) });
      res.end(body);
    }, delay);
    const path = req.url.split('?')[0];
    if (path === '/fast') return send('{"ok":true}', 1);
    if (path === '/items') return send(JSON.stringify({ data: [{ id: 1 }, { id: 2 }], page: { has_more: false, limit: 20 } }), 2);
    if (path === '/items/7') {
      if (req.headers['if-none-match'] === '"v1"') return res.writeHead(304, { etag: '"v1"' }).end();
      res.writeHead(200, { 'content-type': 'application/json', 'x-query-count': '1', etag: '"v1"', 'cache-control': 'private, max-age=30' });
      return res.end('{"id":7}');
    }
    if (path === '/stale') {
      res.writeHead(200, { 'content-type': 'application/json', 'x-query-count': '1', etag: '"s1"' });
      return res.end('{"ok":true}');
    }
    if (path === '/slow') return send('{"ok":true}', 1, 120); // budget 100 ms → limit 50 ms at headroom 0.5
    if (path === '/fat') return send(JSON.stringify({ data: 'x'.repeat(10 * 1024) }), 1); // 10 KB > 4 KB
    if (path === '/chatty') return send('{"data":[]}', 21); // one query per row: 21 > 3
    res.writeHead(404).end();
  });
  return new Promise((r) => { server.listen(0, '127.0.0.1', () => r(server)); });
}

test('live: the valid contract smokes clean, the broken one fails slow, fat and chatty with their reasons', { timeout: 60_000 }, async () => {
  const server = await startApp();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const good = await runSmoke(parseArgs(['--base', base, '--contract', VALID, '--call', 'getItem=/items/7', '--n', '8', '--warmup', '1', '--require-queries']));
    assert.deepEqual(good.results.map((r) => [r.name, r.ok, r.breaches]), [
      ['getFast (GET /fast)', true, []], ['listItems (GET /items)', true, []], ['getItem (GET /items/{id})', true, []],
    ]);
    const bad = await runSmoke(parseArgs(['--base', base, '--contract', BROKEN, '--n', '8', '--warmup', '1']));
    const byName = Object.fromEntries(bad.results.map((r) => [r.name.split(' ')[0], r]));
    assert.deepEqual(Object.keys(byName), ['getSlow', 'getFat', 'listChatty', 'getStale'], 'the unbudgeted and partial operations are skipped, not smoked');
    assert.deepEqual(byName.getStale.breaches.map((b) => b.split(',')[0]), ['x-cache public:60', 'ETag sent']);
    assert.equal(byName.getSlow.breaches.length, 1);
    assert.match(byName.getSlow.breaches[0], /^p95 .* > 50 ms/);
    assert.deepEqual(byName.getFat.breaches.map((b) => b.split(' ')[0]), ['payload']);
    assert.deepEqual(byName.listChatty.breaches.map((b) => b.split(' ')[1]), ['queries']);
    assert.deepEqual(bad.skipped.map((s) => s.name.split(' ')[0]), ['getUnbudgeted', 'getPartial']);
  } finally {
    server.close();
  }
});

test('live: the CLI exits 1 on a breach and 0 when clean, and stays well inside 30 s', { timeout: 60_000 }, async () => {
  const server = await startApp();
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const run = (contract) => new Promise((resolveIt) => {
    // async spawn: a spawnSync would block this process's event loop, and with it the server
    import('node:child_process').then(({ spawn }) => {
      const child = spawn(process.execPath, [SCRIPT, '--base', base, '--contract', contract, '--call', 'getItem=/items/7'], { env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (code) => resolveIt({ code, out }));
    });
  });
  try {
    const t0 = Date.now();
    const good = await run(VALID);
    assert.equal(good.code, 0, good.out);
    assert.ok(Date.now() - t0 < 30_000, 'the smoke is a ~30 s step, not a suite');
    const bad = await run(BROKEN);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, /FAIL getSlow/);
    assert.match(bad.out, /perf-smoke: 4 endpoint\(s\), 4 over budget, 2 skipped/);
  } finally {
    server.close();
  }
});

test('the CLI exits 2 on a usage error', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(process.execPath, [SCRIPT, '--contract', VALID], { encoding: 'utf8', env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--base is required/);
});
