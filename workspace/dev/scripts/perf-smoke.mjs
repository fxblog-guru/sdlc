#!/usr/bin/env node
/**
 * perf-smoke.mjs — the ~30 s performance smoke on every check (DEV-CONTRACTS §13.7).
 *
 * The full volume run belongs to G8, and on release-management it took nine minutes to seed. That
 * is why nobody ran it before G8, and why every budget breach it found re-opened code already
 * reviewed as done. This is the cheap half: a handful of GET endpoints on the small dev seed, each
 * held to its contract's `x-perf` budget with headroom, run by the project's check script on every
 * check. It does not prove the volume numbers; it catches the breach that is already visible on
 * fifty rows — a query per row, a payload that ships the whole table, a handler that sleeps.
 *
 *   node dev/scripts/perf-smoke.mjs --base http://localhost:8080/v1 --contract dev/api/<slug>/openapi.yaml \
 *     [--call getRelease=/releases/rel_1] [--only listReleases,getRelease] [--header "Cookie: s=…"] \
 *     [--headroom 0.5] [--n 20] [--warmup 3] [--max-endpoints 8] [--query-header X-Query-Count] \
 *     [--require-queries] [--out dev/implementation/<slug>/perf-smoke.json]
 *
 *   --base <url>          the running app; each operation's path is appended to it
 *   --contract <file>     the G4 contract; budgets come from each operation's `x-perf`
 *   --call <op>=<path>    a concrete path for an operation with path parameters (repeatable). A GET
 *                         with no parameters in its path is called as written; one with parameters
 *                         and no --call is skipped and listed
 *   --only <a,b,…>        smoke only these operationIds
 *   --header "<k>: <v>"   sent with every request (repeatable) — a session cookie, a bearer token
 *   --headroom <x>        p95 must be ≤ x × p95_ms (default 0.5). The small seed is faster than the
 *                         G8 volume, so an endpoint already at its budget here will not be under it there
 *   --n <k> · --warmup <k> timed calls per endpoint (default 20) after uncounted warm-up calls (default 3)
 *   --max-endpoints <k>   stop after k endpoints (default 8): the smoke is a handful, not the suite
 *   --query-header <h>    the response header the app's per-request query counter writes in dev and
 *                         test builds (default X-Query-Count). Without it, max_queries is not checked
 *   --require-queries     fail an endpoint whose response carries no query count
 *   --out <file>          also write the results as JSON
 *
 * Beyond the budget, each smoked endpoint is held to its other §13.7 declarations: no call may
 * take longer than its `x-timeout-ms`; an `x-cache` other than `none` must send `Cache-Control`;
 * and a 200 that carries an `ETag` must answer 304 to `If-None-Match` with that tag.
 *
 * Only GET and HEAD are smoked: a check must not write. Writes are held to their budget by the G7
 * integration tests (the per-request query counter), and at volume by G8.
 *
 * Exit 0 every smoked endpoint within budget · 1 a breach · 2 usage error, or nothing to smoke.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { budgetOf, budgetProblems, opName, readOperations } from './lib/perf.mjs';

export const DEFAULTS = { headroom: 0.5, n: 20, warmup: 3, maxEndpoints: 8, queryHeader: 'X-Query-Count', timeoutMs: 10_000 };

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const o = { base: null, contract: null, calls: new Map(), only: null, headers: {}, out: null, requireQueries: false, ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--require-queries') { o.requireQueries = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    i += 1;
    if (flag === '--base') o.base = value.replace(/\/+$/, '');
    else if (flag === '--contract') o.contract = value;
    else if (flag === '--call') {
      const m = /^([^=]+)=(\/.*)$/.exec(value);
      if (!m) throw new Error(`--call ${value}: expected <operationId>=/concrete/path`);
      o.calls.set(m[1], m[2]);
    } else if (flag === '--only') o.only = new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
    else if (flag === '--header') {
      const m = /^([^:]+):\s*(.*)$/.exec(value);
      if (!m) throw new Error(`--header ${value}: expected "Name: value"`);
      o.headers[m[1].trim()] = m[2];
    } else if (flag === '--headroom') o.headroom = positive(flag, value);
    else if (flag === '--n') o.n = Math.round(positive(flag, value));
    else if (flag === '--warmup') o.warmup = Math.round(Number(value)) || 0;
    else if (flag === '--max-endpoints') o.maxEndpoints = Math.round(positive(flag, value));
    else if (flag === '--query-header') o.queryHeader = value;
    else if (flag === '--timeout') o.timeoutMs = positive(flag, value);
    else if (flag === '--out') o.out = value;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!o.base) throw new Error('--base is required');
  if (!o.contract) throw new Error('--contract is required');
  return o;
}

function positive(flag, v) {
  const n = Number(v);
  if (!(n > 0)) throw new Error(`${flag} ${v}: expected a positive number`);
  return n;
}

// ---------------------------------------------------------------------------------------------
// Planning — which operations, at which concrete URL
// ---------------------------------------------------------------------------------------------

/**
 * @returns {{ plan: {op, url, budget}[], skipped: {op, reason}[] }}
 */
export function planSmoke(ops, opts) {
  const plan = [];
  const skipped = [];
  for (const op of ops) {
    const id = op.operationId ?? `${op.method} ${op.path}`;
    if (opts.only && !opts.only.has(id)) continue;
    if (op.method !== 'GET' && op.method !== 'HEAD') continue;
    const budget = budgetOf(op.perf);
    if (!budget) {
      skipped.push({ op, reason: `budget unusable: ${budgetProblems(op.perf).join(', ')}` });
      continue;
    }
    const path = opts.calls.get(id) ?? (op.path.includes('{') ? null : op.path);
    if (!path) {
      skipped.push({ op, reason: `path parameters and no --call ${id}=/…` });
      continue;
    }
    if (plan.length >= opts.maxEndpoints) {
      skipped.push({ op, reason: `past --max-endpoints ${opts.maxEndpoints}` });
      continue;
    }
    plan.push({ op, url: `${opts.base}${path}`, budget: { ...budget, timeout_ms: op.timeoutMs ?? null, cache: op.cache ?? null } });
  }
  return { plan, skipped };
}

// ---------------------------------------------------------------------------------------------
// Measuring and judging
// ---------------------------------------------------------------------------------------------

/** Nearest-rank percentile of a list of numbers. */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

async function call(url, opts, method, extra = {}) {
  const t0 = performance.now();
  const res = await fetch(url, { method, headers: { ...opts.headers, ...extra }, signal: AbortSignal.timeout(opts.timeoutMs), redirect: 'manual' });
  const body = Buffer.from(await res.arrayBuffer());
  const ms = performance.now() - t0;
  const q = res.headers.get(opts.queryHeader);
  return { status: res.status, ms, bytes: body.length, queries: q === null || q === '' || Number.isNaN(Number(q)) ? null : Number(q), cacheControl: res.headers.get('cache-control'), etag: res.headers.get('etag') };
}

/** Warm up, then n timed calls, one at a time — the smoke measures a request, not a load. */
export async function measure(item, opts) {
  const method = item.op.method;
  for (let k = 0; k < opts.warmup; k += 1) await call(item.url, opts, method);
  const samples = [];
  for (let k = 0; k < opts.n; k += 1) samples.push(await call(item.url, opts, method));
  // One conditional call: an ETag the server sends is one it must honour (§13.7).
  const tag = samples.find((s) => s.etag)?.etag;
  if (tag) samples.revalidated = (await call(item.url, opts, method, { 'If-None-Match': tag })).status;
  return samples;
}

/**
 * Judge one endpoint's samples against its budget. Pure: tests feed it numbers.
 * @returns {{ ok: boolean, p95: number, bytes: number, queries: number|null, breaches: string[], notes: string[] }}
 */
export function judge(samples, budget, opts) {
  const breaches = [];
  const notes = [];
  const bad = samples.filter((s) => s.status < 200 || s.status >= 300);
  // `samples.revalidated` is the status of the one If-None-Match call measure() makes, if any.
  if (bad.length) breaches.push(`status ${bad[0].status} on ${bad.length} of ${samples.length} calls — a smoke of an error page measures nothing`);
  const p95 = percentile(samples.map((s) => s.ms), 95);
  const limit = budget.p95_ms * opts.headroom;
  if (p95 > limit) breaches.push(`p95 ${p95.toFixed(1)} ms > ${limit.toFixed(0)} ms (${opts.headroom} × p95_ms ${budget.p95_ms})`);
  const bytes = Math.max(...samples.map((s) => s.bytes));
  if (bytes > budget.max_payload_kb * 1024) breaches.push(`payload ${(bytes / 1024).toFixed(1)} KB > max_payload_kb ${budget.max_payload_kb}`);
  const counted = samples.map((s) => s.queries).filter((q) => q !== null);
  const queries = counted.length ? Math.max(...counted) : null;
  if (queries === null) {
    const msg = `no ${opts.queryHeader} header — max_queries ${budget.max_queries} not checked`;
    (opts.requireQueries ? breaches : notes).push(msg);
  } else if (queries > budget.max_queries) {
    breaches.push(`${queries} queries > max_queries ${budget.max_queries} — a query per row is the N+1 shape`);
  }
  const slowest = Math.max(...samples.map((s) => s.ms));
  if (budget.timeout_ms && slowest > budget.timeout_ms) breaches.push(`a call took ${slowest.toFixed(0)} ms > x-timeout-ms ${budget.timeout_ms}`);
  if (budget.cache && budget.cache !== 'none' && !samples.some((s) => s.cacheControl)) breaches.push(`x-cache ${budget.cache}, and no Cache-Control header`);
  if (samples.revalidated !== undefined && samples.revalidated !== 304) breaches.push(`ETag sent, and If-None-Match answered ${samples.revalidated}, not 304`);
  return { ok: breaches.length === 0, p95, bytes, queries, breaches, notes };
}

export async function runSmoke(opts) {
  const ops = readOperations(readFileSync(opts.contract, 'utf8'), opts.contract);
  const { plan, skipped } = planSmoke(ops, opts);
  const results = [];
  for (const item of plan) {
    let r;
    try {
      r = judge(await measure(item, opts), item.budget, opts);
    } catch (err) {
      r = { ok: false, p95: NaN, bytes: 0, queries: null, breaches: [`${err.cause?.code ?? err.name}: ${err.message} calling ${item.url}`], notes: [] };
    }
    results.push({ name: opName(item.op), url: item.url, budget: item.budget, ...r });
  }
  return { results, skipped: skipped.map((s) => ({ name: opName(s.op), reason: s.reason })) };
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`perf-smoke: ${err.message}`);
    console.error('usage: perf-smoke.mjs --base <url> --contract <openapi.yaml> [--call <op>=<path>]… [--headroom 0.5] [--out <file.json>]');
    return 2;
  }
  const started = performance.now();
  let run;
  try {
    run = await runSmoke(opts);
  } catch (err) {
    console.error(`perf-smoke: ${err.message}`);
    return 2;
  }
  for (const r of run.results) {
    const q = r.queries === null ? '—' : `${r.queries}/${r.budget.max_queries}`;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}  p95 ${Number.isNaN(r.p95) ? '—' : r.p95.toFixed(1)}/${r.budget.p95_ms} ms  ${(r.bytes / 1024).toFixed(1)}/${r.budget.max_payload_kb} KB  queries ${q}`);
    for (const b of r.breaches) console.log(`       ${b}`);
    for (const n of r.notes) console.log(`       note: ${n}`);
  }
  for (const s of run.skipped) console.log(`skip ${s.name}  (${s.reason})`);
  const fails = run.results.filter((r) => !r.ok).length;
  const secs = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`perf-smoke: ${run.results.length} endpoint(s), ${fails} over budget, ${run.skipped.length} skipped, ${secs} s (headroom ${opts.headroom})`);
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify({ generated: new Date().toISOString(), headroom: opts.headroom, ...run }, null, 2)}\n`);
  if (!run.results.length) {
    console.error('perf-smoke: nothing smoked — budget the GET operations (x-perf) or pass --call for the ones with path parameters');
    return 2;
  }
  return fails ? 1 : 0;
}

if (process.argv[1]?.endsWith('perf-smoke.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
