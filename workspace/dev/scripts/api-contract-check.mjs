#!/usr/bin/env node
/**
 * api-contract-check.mjs — what a machine can see of the §13.1 / §13.7 / §13.12 contract rules.
 *
 * api-style-check.mjs judges the shape of the operations (verbs, statuses, write declarations);
 * this judges what they carry: typed and bounded schemas, closed request bodies, explicit null,
 * no secret in a response, security on every operation, summaries, examples that validate, and
 * the per-operation declarations the later gates read — x-timeout-ms, x-retry, x-cache, x-audit,
 * x-max-body-kb, x-traffic, x-query. Reads OpenAPI 3.x YAML through lib/yaml.mjs, or JSON.
 *
 *   node dev/scripts/api-contract-check.mjs <slug> [--root dev] [--openapi <path>]
 *        [--data-model <path>] [--load-plan] [--json]
 *
 *   --data-model  the data model whose index names x-query must cite (default data/<slug>/data-model.md)
 *   --load-plan   print the G8 load scenarios derived from info.x-traffic-classes instead of findings
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, deref } from './lib/yaml.mjs';
import { Findings, report, parseArgs } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';

const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const JSONISH = /^application\/(?:[\w.+-]*\+)?json$/;
const BOUNDED_FORMATS = new Set(['date', 'date-time', 'time', 'uuid', 'ipv4', 'ipv6', 'duration', 'byte', 'int32', 'int64']);
/** A property name that holds a secret: ends in one of these words (`csrf_token`, `api_key`). */
export const SECRET_NAME = /^(?:[a-z0-9]+_)*(?:password|passwd|passphrase|secret|token|api_?key|private_?key|secret_?key|access_?key|credentials?)$/i;
const NOT_SECRET = /(?:^|_)(?:page|next|prev|cursor)_?token$/i;
const MONEY_NAME = /(?:^|_)(?:amount|price|cost|fee|balance|subtotal)(?:$|_)/i;
const INFO_KEYS = ['x-compression', 'x-cors', 'x-security-headers', 'x-enum-policy'];
const TRAFFIC_KEYS = ['rps', 'peak_factor', 'concurrency', 'rate_limit'];

export const typeList = (s) => (s?.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type]);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hdr = (headers, name) => Object.keys(headers ?? {}).some((h) => h.toLowerCase() === name.toLowerCase());

// ---------------------------------------------------------------------------------------------
// A JSON Schema subset validator — enough to prove an example matches its schema (E126).
// ---------------------------------------------------------------------------------------------

function isType(t, v) {
  switch (t) {
    case 'null': return v === null;
    case 'boolean': return typeof v === 'boolean';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'string': return typeof v === 'string';
    case 'array': return Array.isArray(v);
    case 'object': return isObj(v);
    default: return true;
  }
}

const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const FORMAT = {
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^@\s]+@[^@\s]+$/,
};

/**
 * The ways `value` breaks `schema`, as `$.path: reason` strings; [] when it validates.
 * `mode` is `request` (readOnly members are not required) or `response` (writeOnly ones are not).
 */
export function validate(doc, schema, value, { mode = 'response', path = '$', depth = 0 } = {}) {
  const errs = [];
  const s = deref(doc, schema);
  if (!isObj(s) || depth > 40) return errs;
  const sub = (sch, v, p) => validate(doc, sch, v, { mode, path: p, depth: depth + 1 });
  for (const m of s.allOf ?? []) errs.push(...sub(m, value, path));
  if (Array.isArray(s.oneOf)) {
    const n = s.oneOf.filter((m) => sub(m, value, path).length === 0).length;
    if (n !== 1) errs.push(`${path}: matches ${n} of the oneOf branches, not exactly one`);
  }
  if (Array.isArray(s.anyOf) && !s.anyOf.some((m) => sub(m, value, path).length === 0)) errs.push(`${path}: matches none of the anyOf branches`);
  if ('const' in s && !deepEq(s.const, value)) errs.push(`${path}: is not the const ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((e) => deepEq(e, value))) errs.push(`${path}: ${JSON.stringify(value)} is not in the enum`);
  const types = typeList(s);
  if (types.length && !types.some((t) => isType(t, value))) {
    errs.push(`${path}: ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value} is not ${types.join(' or ')}`);
    return errs;
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (s.minLength !== undefined && len < s.minLength) errs.push(`${path}: shorter than minLength ${s.minLength}`);
    if (s.maxLength !== undefined && len > s.maxLength) errs.push(`${path}: longer than maxLength ${s.maxLength}`);
    if (typeof s.pattern === 'string') {
      let re = null;
      try { re = new RegExp(s.pattern, 'u'); } catch { /* an unreadable pattern is not this check's to judge */ }
      if (re && !re.test(value)) errs.push(`${path}: does not match pattern ${s.pattern}`);
    }
    if (FORMAT[s.format] && !FORMAT[s.format].test(value)) errs.push(`${path}: is not a ${s.format}`);
  }
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) errs.push(`${path}: below minimum ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) errs.push(`${path}: above maximum ${s.maximum}`);
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) errs.push(`${path}: not above exclusiveMinimum ${s.exclusiveMinimum}`);
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) errs.push(`${path}: not below exclusiveMaximum ${s.exclusiveMaximum}`);
  }
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) errs.push(`${path}: fewer than minItems ${s.minItems}`);
    if (s.maxItems !== undefined && value.length > s.maxItems) errs.push(`${path}: more than maxItems ${s.maxItems}`);
    if (s.items) value.forEach((v, i) => errs.push(...sub(s.items, v, `${path}[${i}]`)));
  }
  if (isObj(value)) {
    const props = s.properties ?? {};
    for (const r of s.required ?? []) {
      const p = deref(doc, props[r]);
      if (mode === 'request' && p?.readOnly) continue;
      if (mode === 'response' && p?.writeOnly) continue;
      if (!(r in value)) errs.push(`${path}: required member \`${r}\` is missing`);
    }
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...sub(props[k], v, `${path}.${k}`));
      else if (s.additionalProperties === false && !s.allOf) errs.push(`${path}: member \`${k}\` is not in the schema (additionalProperties: false)`);
      else if (isObj(s.additionalProperties)) errs.push(...sub(s.additionalProperties, v, `${path}.${k}`));
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------------------------
// The schema walk
// ---------------------------------------------------------------------------------------------

/**
 * Visit every schema node under `node`, following local $refs once per walk. `visit(node, ptr,
 * via)` gets the resolved node; `onProp(raw, name, ptr)` gets each property as written, before
 * its $ref is followed. `via` is the composition keyword the node was reached through, if any.
 */
function walk(doc, node, ptr, seen, visit, onProp, via = null) {
  if (!isObj(node)) return;
  if (typeof node.$ref === 'string') {
    if (!node.$ref.startsWith('#/') || seen.has(node.$ref)) return;
    seen.add(node.$ref);
    const target = deref(doc, node);
    if (target !== node) walk(doc, target, node.$ref, seen, visit, onProp, via);
    return;
  }
  visit(node, ptr, via);
  for (const [k, v] of Object.entries(isObj(node.properties) ? node.properties : {})) {
    onProp?.(v, k, `${ptr}/properties/${k}`);
    walk(doc, v, `${ptr}/properties/${k}`, seen, visit, onProp);
  }
  if (isObj(node.items)) walk(doc, node.items, `${ptr}/items`, seen, visit, onProp);
  if (isObj(node.additionalProperties)) walk(doc, node.additionalProperties, `${ptr}/additionalProperties`, seen, visit, onProp);
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    (Array.isArray(node[key]) ? node[key] : []).forEach((m, i) => walk(doc, m, `${ptr}/${key}/${i}`, seen, visit, onProp, key));
  }
}

function operations(doc) {
  const ops = [];
  for (const [path, item] of Object.entries(doc?.paths ?? {})) {
    const shared = (item?.parameters ?? []).map((p) => deref(doc, p));
    for (const m of METHODS) {
      const op = item?.[m];
      if (!isObj(op)) continue;
      const params = [...shared, ...(op.parameters ?? []).map((p) => deref(doc, p))].filter(isObj);
      ops.push({ path, method: m, op, params, where: `${m.toUpperCase()} ${path}`, id: op.operationId ?? `${m.toUpperCase()} ${path}` });
    }
  }
  return ops;
}

/** Each media type's examples: `[{ value, where }]` from `example` and `examples`. */
function mediaExamples(doc, media, where) {
  const out = [];
  if (!isObj(media)) return out;
  if ('example' in media) out.push({ value: media.example, where: `${where} example` });
  for (const [name, ex] of Object.entries(isObj(media.examples) ? media.examples : {})) {
    const e = deref(doc, ex);
    if (isObj(e) && 'value' in e) out.push({ value: e.value, where: `${where} examples.${name}` });
  }
  return out;
}

const hasSchemaExample = (doc, schema) => {
  const s = deref(doc, schema);
  return isObj(s) && ('example' in s || (Array.isArray(s.examples) && s.examples.length > 0));
};

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

export function check(doc, { dataModel = null } = {}, findings = new Findings()) {
  const said = new Set();
  const add = (code, where, message) => {
    const key = `${code}|${where}|${message}`;
    if (said.has(key)) return;
    said.add(key);
    findings.add(code, where, 0, message);
  };
  const ops = operations(doc);
  const classes = isObj(doc?.info?.['x-traffic-classes']) ? doc.info['x-traffic-classes'] : {};
  const counts = { schemas: 0, properties: 0, examples: 0, 'examples valid': 0 };
  const checkedExample = new Set();

  const validateExample = (schema, value, where, mode) => {
    if (checkedExample.has(where)) return;
    checkedExample.add(where);
    counts.examples++;
    const errs = validate(doc, schema, value, { mode });
    if (errs.length) add('E126', where, `example does not validate: ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? ` (+${errs.length - 3})` : ''}`);
    else counts['examples valid']++;
  };

  /** Node rules shared by the request and the response walks. */
  const nodeRules = (mode) => (node, ptr, via) => {
    counts.schemas++;
    if ('nullable' in node) add('E122', ptr, '`nullable:` — OAS 3.1 writes null as a type: `type: [x, \'null\']`');
    if (isObj(node.properties) && Object.keys(node.properties).length && !Array.isArray(node.required)) {
      add('W121', ptr, 'an object with properties and no `required` list — write `required: []` when every member is optional');
    }
    const types = typeList(node);
    if (mode === 'request' && !node.readOnly) {
      if (types.includes('string') && node.maxLength === undefined && node.enum === undefined && node.pattern === undefined && node.const === undefined && !BOUNDED_FORMATS.has(node.format) && node.contentMediaType === undefined && node.format !== 'binary') {
        add('W120', ptr, 'a request string with no `maxLength`, `enum`, `pattern` or bounded `format`');
      }
      if ((types.includes('integer') || types.includes('number')) && node.minimum === undefined && node.maximum === undefined && node.exclusiveMinimum === undefined && node.exclusiveMaximum === undefined && node.enum === undefined && node.const === undefined) {
        add('W120', ptr, 'a request number with no `minimum` or `maximum`');
      }
      if (types.includes('array') && node.maxItems === undefined) add('W120', ptr, 'a request array with no `maxItems`');
      const objectLike = isObj(node.properties) && Object.keys(node.properties).length;
      if ((objectLike && via !== 'allOf') || Array.isArray(node.allOf)) {
        if (node.additionalProperties !== false && node.unevaluatedProperties !== false && (objectLike || node.allOf.some((m) => isObj(deref(doc, m)?.properties)))) {
          add('E121', ptr, 'a request-body object without `additionalProperties: false` (or `unevaluatedProperties: false` over allOf) — an unknown member is mass assignment (OWASP API3)');
        }
      }
    }
    for (const [i, ex] of (Array.isArray(node.examples) ? node.examples : []).entries()) validateExample(node, ex, `${ptr} examples[${i}]`, mode);
    if ('example' in node) validateExample(node, node.example, `${ptr} example`, mode);
  };
  const propRules = (sensitiveOk, op) => (raw, name, ptr) => {
    counts.properties++;
    const r = isObj(raw) ? raw : {};
    if (r.$ref === undefined && r.type === undefined && r.const === undefined && r.enum === undefined && !r.allOf && !r.oneOf && !r.anyOf && !r.not) {
      add('E120', ptr, `property \`${name}\` has no \`type\``);
    }
    const s = deref(doc, raw);
    if (MONEY_NAME.test(name) && typeList(s).includes('number')) add('W133', ptr, `money-like \`${name}\` is a \`number\` — money is integer minor units plus a currency, a decimal a string with a scale (§13.1)`);
    if (sensitiveOk === null) return;
    const secret = (SECRET_NAME.test(name) && !NOT_SECRET.test(name) && !typeList(s).includes('boolean')) || s?.['x-sensitive'] === true;
    if (secret && !s?.writeOnly && !sensitiveOk) add('E123', ptr, `\`${name}\` can reach a response (${op.id}) — mark it \`writeOnly\`, drop it, or give the operation \`x-sensitive-response: <reason>\``);
  };

  const shownTypes = new Set();
  for (const o of ops) {
    const { op, where } = o;
    const responses = isObj(op.responses) ? op.responses : {};
    const statuses = Object.keys(responses);
    const resp = (s) => deref(doc, responses[s]);
    const isGet = o.method === 'get';
    const perf = isObj(op['x-perf']) ? op['x-perf'] : null;

    // Security, summary, requirements (E124, E125, W131).
    const sec = op.security !== undefined ? op.security : doc?.security;
    const open = !Array.isArray(sec) || sec.length === 0 || sec.every((r) => isObj(r) && Object.keys(r).length === 0);
    if (open && !/\S/.test(String(op['x-public'] ?? ''))) add('E124', where, `${o.id}: no security requirement — name the scheme, or write \`x-public: <reason>\``);
    if (!/\S/.test(String(op.summary ?? ''))) add('E125', where, `${o.id}: no \`summary\``);
    if (!Array.isArray(op['x-requirements']) || !op['x-requirements'].length) add('W131', where, `${o.id}: no \`x-requirements\` — which REQ does it serve?`);

    // Declarations (E127–E131, E133, E134, W122).
    const t = op['x-timeout-ms'];
    if (!(Number(t) > 0)) add('E127', where, `${o.id}: no positive \`x-timeout-ms\``);
    else if (perf && Number(perf.p95_ms) > Number(t)) add('E127', where, `${o.id}: x-timeout-ms ${t} is below its p95_ms ${perf.p95_ms}`);
    else if (Number(t) > 2000 && !statuses.includes('202')) add('W122', where, `${o.id}: x-timeout-ms ${t} — above 2 s, answer 202 with an operation resource`);

    const retry = op['x-retry'];
    if (!['safe', 'with-key', 'never'].includes(retry)) add('E128', where, `${o.id}: no \`x-retry: safe|with-key|never\``);
    else if (retry === 'safe' && !isGet && !/^exempt:\s*\S/.test(String(op['x-idempotency'] ?? ''))) add('E128', where, `${o.id}: x-retry safe on a write, with no \`x-idempotency: exempt:<reason>\` saying why a repeat is harmless`);
    else if (retry === 'with-key') {
      const key = o.params.some((p) => p.in === 'header' && String(p.name).toLowerCase() === 'idempotency-key');
      if (!key || !statuses.includes('409')) add('E134', where, `${o.id}: x-retry with-key needs an Idempotency-Key parameter and a 409 (idempotency-key-in-flight)`);
    }

    if (isGet && !/^(none|(private|public):\d+[smhd]?)$/.test(String(op['x-cache'] ?? ''))) add('E129', where, `${o.id}: no \`x-cache: none|private:<ttl>|public:<ttl>\``);
    if (!isGet && typeof op['x-audit'] !== 'boolean') add('E130', where, `${o.id}: no \`x-audit: true|false\``);

    const body = deref(doc, op.requestBody);
    if (isObj(body)) {
      if (!(Number(op['x-max-body-kb']) > 0) || !statuses.includes('413')) add('E131', where, `${o.id}: a request body needs \`x-max-body-kb\` and a 413`);
      if (o.method === 'patch' && !Object.keys(body.content ?? {}).includes('application/merge-patch+json')) add('W130', where, `${o.id}: PATCH is JSON Merge Patch — \`application/merge-patch+json\` (RFC 7396)`);
    }

    const cls = op['x-traffic'];
    const c = classes[cls];
    if (!cls) add('E133', where, `${o.id}: no \`x-traffic\` class`);
    else if (!isObj(c)) add('E133', where, `${o.id}: x-traffic \`${cls}\` is not in info.x-traffic-classes`);
    else {
      const missing = TRAFFIC_KEYS.filter((k) => c[k] === undefined || c[k] === '');
      if (missing.length) add('E133', 'info.x-traffic-classes', `class \`${cls}\` lacks ${missing.join(', ')}`);
    }

    // Deprecation (E132).
    if (op.deprecated === true) {
      const ok = statuses.filter((s) => /^2/.test(s)).some((s) => hdr(resp(s)?.headers, 'Deprecation') && hdr(resp(s)?.headers, 'Sunset'));
      if (!ok) add('E132', where, `${o.id}: deprecated, and no 2xx carries \`Deprecation\` (RFC 9745) and \`Sunset\` (RFC 8594)`);
    }

    // Caching (W123), correlation (W132), 429 (W127), downstream (W128).
    if (isGet) {
      const r200 = resp('200');
      if (hdr(r200?.headers, 'ETag') && (!o.params.some((p) => p.in === 'header' && String(p.name).toLowerCase() === 'if-none-match') || !statuses.includes('304'))) {
        add('W123', where, `${o.id}: an ETag with no If-None-Match parameter and 304`);
      }
      if (/^(private|public):/.test(String(op['x-cache'] ?? '')) && !hdr(r200?.headers, 'Cache-Control')) add('W123', where, `${o.id}: x-cache ${op['x-cache']} with no Cache-Control header on the 200`);
      const q = op['x-query'];
      if (!isObj(q) || !/\S/.test(String(q.shape ?? '')) || !Array.isArray(q.indexes)) add('W126', where, `${o.id}: no \`x-query: { shape, indexes }\``);
      else if (dataModel !== null) for (const ix of q.indexes) if (!dataModel.includes(String(ix))) add('W126', where, `${o.id}: index \`${ix}\` is not named in data-model.md`);
    }
    if (!o.params.some((p) => p.in === 'header' && String(p.name).toLowerCase() === 'x-request-id')) add('W132', where, `${o.id}: does not accept X-Request-Id`);
    if (!statuses.includes('429')) add('W127', where, `${o.id}: no 429 response`);
    if (op['x-downstream'] !== undefined) {
      const ds = ['502', '503', '504'].filter((s) => statuses.includes(s));
      if (!ds.length) add('W128', where, `${o.id}: calls ${[].concat(op['x-downstream']).join(', ')} and declares no 502, 503 or 504`);
      for (const s of ds) if (!hdr(resp(s)?.headers, 'Retry-After')) add('W128', where, `${o.id}: ${s} with no Retry-After`);
    }

    // Schemas: the request walk (bounds, closed bodies) and the response walk (secrets).
    const reqSeen = new Set();
    for (const p of o.params) {
      walk(doc, p.schema, `${where} parameter ${p.name}`, reqSeen, nodeRules('request'), propRules(null, o));
      if ('example' in p) validateExample(p.schema, p.example, `${where} parameter ${p.name} example`, 'request');
    }
    for (const [mt, media] of Object.entries(isObj(body?.content) ? body.content : {})) {
      walk(doc, media?.schema, `${where} request ${mt}`, reqSeen, nodeRules('request'), propRules(null, o));
      for (const ex of mediaExamples(doc, media, `${where} request ${mt}`)) validateExample(media.schema, ex.value, ex.where, 'request');
    }
    const resSeen = new Set();
    const sensitiveOk = /\S/.test(String(op['x-sensitive-response'] ?? ''));
    for (const s of statuses) {
      const r = resp(s);
      for (const [mt, media] of Object.entries(isObj(r?.content) ? r.content : {})) {
        walk(doc, media?.schema, `${where} ${s} ${mt}`, resSeen, nodeRules('response'), propRules(sensitiveOk, o));
        const exs = mediaExamples(doc, media, `${where} ${s} ${mt}`);
        for (const ex of exs) {
          validateExample(media.schema, ex.value, ex.where, 'response');
          if (mt === 'application/problem+json' && isObj(ex.value) && ex.value.type) shownTypes.add(ex.value.type);
        }
        if (mt === 'application/problem+json' && hasSchemaExample(doc, media.schema)) {
          const se = deref(doc, media.schema);
          for (const v of [se.example, ...(Array.isArray(se.examples) ? se.examples : [])]) if (isObj(v) && v.type) shownTypes.add(v.type);
        }
        if (/^2/.test(s) && JSONISH.test(mt) && !exs.length && !hasSchemaExample(doc, media.schema)) add('W124', where, `${o.id}: ${s} ${mt} has no example`);
      }
    }
  }

  // Problem types with no example (W125), service-wide declarations (W129).
  const ptEnum = deref(doc, doc?.components?.schemas?.ProblemType)?.enum;
  if (Array.isArray(ptEnum)) for (const t of ptEnum) if (!shownTypes.has(t)) add('W125', 'components.schemas.ProblemType', `\`${t}\` has no problem response example`);
  for (const k of INFO_KEYS) if (doc?.info?.[k] === undefined) add('W129', 'info', `no \`info.${k}\``);

  return {
    findings,
    summary: {
      operations: ops.length,
      'schema nodes': counts.schemas,
      properties: counts.properties,
      examples: counts.examples,
      'examples valid': counts['examples valid'],
      'problem types shown': Array.isArray(ptEnum) ? `${ptEnum.filter((t) => shownTypes.has(t)).length}/${ptEnum.length}` : 'n/a',
      'traffic classes': Object.keys(classes).length,
    },
  };
}

/** The G8 load scenarios: one per traffic class, at rps × peak_factor (§13.7). */
export function loadPlan(doc) {
  const classes = isObj(doc?.info?.['x-traffic-classes']) ? doc.info['x-traffic-classes'] : {};
  return Object.entries(classes).map(([name, c]) => {
    const members = operations(doc).filter((o) => o.op['x-traffic'] === name);
    return {
      class: name,
      rps: Number(c.rps),
      peak_factor: Number(c.peak_factor),
      target_rps: Number(c.rps) * Number(c.peak_factor),
      concurrency: Number(c.concurrency),
      rate_limit: c.rate_limit,
      operations: members.map((o) => ({ id: o.id, method: o.method.toUpperCase(), path: o.path, ...(isObj(o.op['x-perf']) ? o.op['x-perf'] : {}), timeout_ms: o.op['x-timeout-ms'] })),
    };
  });
}

function main(argv) {
  const a = parseArgs(argv, ['json', 'load-plan']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const path = a.openapi ?? (slug ? join(root, 'api', slug, 'openapi.yaml') : null);
  if (!path) { console.error('usage: api-contract-check.mjs <slug> [--root dev] [--openapi <path>] [--data-model <path>] [--load-plan] [--json]'); return 2; }
  if (!existsSync(path)) { console.error(`no contract at ${path}`); return 2; }
  let doc;
  const text = readFileSync(path, 'utf8');
  try { doc = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch (e) { console.error(`${path}: ${e.message}`); return 2; }
  if (a['load-plan']) {
    const plan = loadPlan(doc);
    if (a.json) console.log(JSON.stringify({ script: 'api-contract-check', loadPlan: plan }, null, 2));
    else {
      console.log('| Class | Target rps (rps × peak) | Concurrency | Rate limit | Operations (p95 ms) |\n|---|---|---|---|---|');
      for (const s of plan) console.log(`| ${s.class} | ${s.target_rps} (${s.rps} × ${s.peak_factor}) | ${s.concurrency} | ${s.rate_limit} | ${s.operations.map((o) => `${o.id} (${o.p95_ms ?? '—'})`).join(', ')} |`);
    }
    return plan.length ? 0 : 2;
  }
  const dmPath = a['data-model'] ?? (slug ? join(root, 'data', slug, 'data-model.md') : null);
  const dataModel = dmPath && existsSync(dmPath) ? readFileSync(dmPath, 'utf8') : null;
  const { findings, summary } = check(doc, { dataModel });
  return report('api-contract-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
