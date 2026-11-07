#!/usr/bin/env node
/**
 * contract-compat.mjs — the common breaking changes between two OpenAPI files (DEV-CONTRACTS §6, §13.12).
 *
 * `oasdiff breaking` is the tool of record and finds far more; this is the no-dependency floor
 * that runs where it is not installed. It answers one question per change — does an existing
 * client, unchanged, keep working? — for the breaks that are found late most often:
 *
 *   E135  an operation removed, or a status code it answered removed
 *   E136  a response field removed; a request field or parameter added as required, or made required
 *   E137  a type changed, an enum value removed (or added under `x-enum-policy: closed`), a bound
 *         tightened on a request (maxLength, minLength, maximum, minimum, maxItems, pattern)
 *   W135  a break `contract-diff.md` already names (with --declared)
 *   W136  an enum value added where the new contract states no `info.x-enum-policy`
 *
 *   node dev/scripts/contract-compat.mjs <baseline.yaml> <new.yaml> [--declared <contract-diff.md>]
 *        [--oasdiff] [--json]
 *
 *   --declared  a break whose operationId, path or field `contract-diff.md` names in a row marked
 *               breaking is reported as W135, not an error: it is known and argued
 *   --oasdiff   also run `oasdiff breaking <baseline> <new>` when it is on PATH and put its exit
 *               status and line count in the summary; NOT RUN otherwise
 *
 * Operations are matched by method and path, with path parameter names ignored. Exit 1 on any
 * error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYaml, deref } from './lib/yaml.mjs';
import { Findings, report, parseArgs } from './lib/check.mjs';

const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const types = (s) => (s?.type === undefined ? [] : [].concat(s.type)).sort();
const norm = (p) => p.replace(/\{[^}]+\}/g, '{}');

function operations(doc) {
  const out = new Map();
  for (const [path, item] of Object.entries(doc?.paths ?? {})) {
    const shared = (item?.parameters ?? []).map((p) => deref(doc, p));
    for (const m of METHODS) {
      const op = item?.[m];
      if (!isObj(op)) continue;
      const params = [...shared, ...(op.parameters ?? []).map((p) => deref(doc, p))].filter(isObj);
      out.set(`${m.toUpperCase()} ${norm(path)}`, { path, method: m, op, params, id: op.operationId ?? `${m.toUpperCase()} ${path}` });
    }
  }
  return out;
}

/** The JSON media schema of a request body or a response, resolved. */
function jsonSchema(doc, holder) {
  const h = deref(doc, holder);
  const content = isObj(h?.content) ? h.content : {};
  const key = Object.keys(content).find((k) => /json/.test(k));
  return key ? content[key].schema : undefined;
}

/** Merge allOf members into one view of the properties and required list. */
function flat(doc, schema, depth = 0) {
  const s = deref(doc, schema);
  if (!isObj(s) || depth > 20) return { s, props: {}, required: [] };
  const props = { ...(isObj(s.properties) ? s.properties : {}) };
  const required = [...(Array.isArray(s.required) ? s.required : [])];
  for (const m of Array.isArray(s.allOf) ? s.allOf : []) {
    const f = flat(doc, m, depth + 1);
    Object.assign(props, f.props);
    required.push(...f.required);
  }
  return { s, props, required };
}

const TIGHTER = [
  ['maxLength', (a, b) => b < a, 'maxLength'],
  ['minLength', (a, b) => b > a, 'minLength'],
  ['maximum', (a, b) => b < a, 'maximum'],
  ['minimum', (a, b) => b > a, 'minimum'],
  ['maxItems', (a, b) => b < a, 'maxItems'],
];

/**
 * Compare one schema across the two contracts. `dir` is `request` (the client writes it) or
 * `response` (the client reads it). Each break goes to `out(code, field, message)`.
 */
function compareSchema(base, next, a, b, dir, at, out, policy, seen = new Set(), depth = 0) {
  const A = flat(base, a);
  const B = flat(next, b);
  if (!isObj(A.s) || !isObj(B.s) || depth > 25) return;
  const key = `${a?.$ref ?? at}|${b?.$ref ?? at}|${dir}`;
  if (seen.has(key)) return;
  seen.add(key);

  const ta = types(A.s);
  const tb = types(B.s);
  if (ta.length && tb.length) {
    // A request may widen (accept more), a response may narrow (return less); anything else moved.
    const lost = dir === 'request' ? ta.filter((t) => !tb.includes(t) && !(t === 'integer' && tb.includes('number'))) : tb.filter((t) => !ta.includes(t) && !(t === 'integer' && ta.includes('number')));
    if (lost.length) out('E137', at, `type ${ta.join('|')} → ${tb.join('|')}`);
  }
  if (A.s.format && B.s.format && A.s.format !== B.s.format) out('E137', at, `format ${A.s.format} → ${B.s.format}`);

  if (Array.isArray(A.s.enum) && Array.isArray(B.s.enum)) {
    const removed = A.s.enum.filter((v) => !B.s.enum.includes(v));
    const added = B.s.enum.filter((v) => !A.s.enum.includes(v));
    if (removed.length) out('E137', at, `enum value${removed.length > 1 ? 's' : ''} ${removed.map((v) => JSON.stringify(v)).join(', ')} removed`);
    if (added.length && dir === 'response') {
      if (policy === 'closed') out('E137', at, `enum value${added.length > 1 ? 's' : ''} ${added.map((v) => JSON.stringify(v)).join(', ')} added under x-enum-policy: closed`);
      else if (policy !== 'extensible') out('W136', at, `enum value${added.length > 1 ? 's' : ''} ${added.map((v) => JSON.stringify(v)).join(', ')} added and info.x-enum-policy is not stated — safe only for clients that ignore unknowns`);
    }
  } else if (!Array.isArray(A.s.enum) && Array.isArray(B.s.enum) && dir === 'request') out('E137', at, 'an enum introduced on a request value');

  if (dir === 'request') {
    for (const [k, tighter, name] of TIGHTER) {
      const va = A.s[k];
      const vb = B.s[k];
      if (vb !== undefined && (va === undefined ? true : tighter(va, vb))) out('E137', at, `${name} ${va ?? 'none'} → ${vb}`);
    }
    if (B.s.pattern !== undefined && B.s.pattern !== A.s.pattern) out('E137', at, `pattern ${A.s.pattern ?? 'none'} → ${B.s.pattern}`);
    if (A.s.additionalProperties !== false && B.s.additionalProperties === false && Object.keys(A.props).length) {
      // Closing an open body refuses a member an old client may send; it is a break, and the right one.
      out('E137', at, 'additionalProperties: false introduced');
    }
  }

  for (const [name, pa] of Object.entries(A.props)) {
    const pb = B.props[name];
    const field = `${at}.${name}`;
    if (pb === undefined) {
      if (dir === 'response' && !deref(base, pa)?.writeOnly) out('E136', field, 'response field removed');
      continue;
    }
    if (dir === 'request' && !A.required.includes(name) && B.required.includes(name) && !deref(next, pb)?.readOnly) out('E136', field, 'request field made required');
    if (dir === 'response' && A.required.includes(name) && !B.required.includes(name)) out('E136', field, 'response field no longer always present');
    compareSchema(base, next, pa, pb, dir, field, out, policy, seen, depth + 1);
  }
  if (dir === 'request') {
    for (const name of B.required) {
      if (!(name in A.props) && name in B.props && !deref(next, B.props[name])?.readOnly) out('E136', `${at}.${name}`, 'request field added as required');
    }
  }
  const ia = A.s.items;
  const ib = B.s.items;
  if (isObj(ia) && isObj(ib)) compareSchema(base, next, ia, ib, dir, `${at}[]`, out, policy, seen, depth + 1);
}

/** The words of contract-diff.md rows marked breaking: the operationIds, paths and fields they name. */
export function declaredBreaks(text) {
  const words = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!/^\|/.test(line) || !/\b(yes|breaking)\b/i.test(line) && !/removed/i.test(line)) continue;
    for (const m of line.matchAll(/`([^`]+)`|([A-Za-z_][\w.]*(?:\/[\w{}.-]+)+|[a-z]+[A-Z]\w+)/g)) words.add((m[1] ?? m[2]).trim());
  }
  return words;
}

export function compare(base, next, { declared = new Set() } = {}, findings = new Findings()) {
  const policy = next?.info?.['x-enum-policy'];
  const A = operations(base);
  const B = operations(next);
  const named = (o, field) => [o.id, o.path, `${o.method.toUpperCase()} ${o.path}`, field, field?.split('.').pop()].some((w) => w && declared.has(w));
  let breaks = 0;
  // A shared schema (the ProblemType enum) reaches every response; its one W136 is said once.
  const saidOnce = new Set();
  for (const [key, oa] of A) {
    const ob = B.get(key);
    const out = (code, field, message) => {
      if (code === 'W136') {
        if (saidOnce.has(message)) return;
        saidOnce.add(message);
      }
      const known = code !== 'W136' && named(oa, field);
      if (!code.startsWith('W')) breaks++;
      findings.add(known ? 'W135' : code, `${key}${field ? ` ${field}` : ''}`, 0, `${oa.id}: ${message}${known ? ' — declared in contract-diff.md' : ''}`);
    };
    if (!ob) { out('E135', '', 'operation removed'); continue; }
    for (const s of Object.keys(oa.op.responses ?? {})) if (!(s in (ob.op.responses ?? {}))) out('E135', '', `status ${s} no longer answered`);

    // Parameters: a new required one, or one made required, breaks every old call.
    const pa = new Map(oa.params.map((p) => [`${p.in}:${String(p.name).toLowerCase()}`, p]));
    for (const p of ob.params) {
      const k = `${p.in}:${String(p.name).toLowerCase()}`;
      const old = pa.get(k);
      if (p.required && (!old || !old.required) && p.in !== 'path') out('E136', `parameter ${p.name}`, old ? `parameter \`${p.name}\` made required` : `required parameter \`${p.name}\` added`);
      if (old) compareSchema(base, next, old.schema, p.schema, 'request', `parameter ${p.name}`, out, policy);
    }
    const rbA = deref(base, oa.op.requestBody);
    const rbB = deref(next, ob.op.requestBody);
    if (!rbA && rbB?.required) out('E136', 'body', 'a required request body added');
    if (rbA && rbB) compareSchema(base, next, jsonSchema(base, rbA), jsonSchema(next, rbB), 'request', 'body', out, policy);
    for (const [s, ra] of Object.entries(oa.op.responses ?? {})) {
      const rb = ob.op.responses?.[s];
      if (rb) compareSchema(base, next, jsonSchema(base, ra), jsonSchema(next, rb), 'response', `${s}`, out, policy);
    }
  }
  return { findings, summary: { 'baseline operations': A.size, 'new operations': B.size, added: [...B.keys()].filter((k) => !A.has(k)).length, breaks } };
}

function oasdiff(basePath, newPath) {
  const r = spawnSync('oasdiff', ['breaking', basePath, newPath], { encoding: 'utf8' });
  if (r.error) return 'NOT RUN (oasdiff not on PATH; docker run --rm -v "$PWD:/w" tufin/oasdiff breaking /w/<a> /w/<b>)';
  const lines = r.stdout.split('\n').filter((l) => l.trim()).length;
  return `exit ${r.status}, ${lines} line(s)`;
}

function load(path) {
  const text = readFileSync(path, 'utf8');
  return path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
}

function main(argv) {
  const a = parseArgs(argv, ['json', 'oasdiff']);
  const [bp, np] = a._;
  if (!bp || !np) { console.error('usage: contract-compat.mjs <baseline.yaml> <new.yaml> [--declared contract-diff.md] [--oasdiff] [--json]'); return 2; }
  for (const p of [bp, np]) if (!existsSync(p)) { console.error(`no contract at ${p}`); return 2; }
  let base;
  let next;
  try { base = load(bp); next = load(np); } catch (e) { console.error(e.message); return 2; }
  const declared = a.declared && existsSync(a.declared) ? declaredBreaks(readFileSync(a.declared, 'utf8')) : new Set();
  const { findings, summary } = compare(base, next, { declared });
  if (a.oasdiff) summary.oasdiff = oasdiff(bp, np);
  return report('contract-compat', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
