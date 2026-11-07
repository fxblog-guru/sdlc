#!/usr/bin/env node
/**
 * api-style-check.mjs — the contract against the §13.11 API style (DEV-CONTRACTS §13.1, §13.11).
 *
 * The no-dependency fallback for `dev/ci/spectral.yaml`: the same rules, plus the ones Spectral
 * cannot express without custom functions (one action style across operations, the verb-class
 * status table). Reads OpenAPI 3.x YAML through lib/yaml.mjs, or JSON.
 *
 *   node dev/scripts/api-style-check.mjs <slug> [--root dev] [--openapi <path>] [--profile <DEV-PROFILE.md>] [--json]
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, deref } from './lib/yaml.mjs';
import { Findings, report, parseArgs, loadProfile, configured, splitList } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';

export const VERBS = {
  read: ['get', 'list'],
  create: ['create'],
  update: ['update'],
  delete: ['delete'],
  state: ['set', 'unset', 'add', 'remove'],
  action: ['approve', 'reject', 'cancel', 'archive', 'restore', 'move', 'start', 'complete', 'send', 'verify', 'refresh', 'undo', 'export', 'import', 'search'],
};
const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const PAGE = { default: 20, max: 100 };

const verbOf = (opId) => /^[a-z]+/.exec(String(opId ?? ''))?.[0] ?? '';
export const classOf = (verb, extra = []) => Object.entries(VERBS).find(([, v]) => v.includes(verb))?.[0] ?? (extra.includes(verb) ? 'action' : null);

/** The expected method(s) and success status(es) per verb class. */
const RULE = {
  read: { methods: ['get'], success: [200] },
  create: { methods: ['post'], success: [201] },
  update: { methods: ['patch'], success: [200] },
  delete: { methods: ['delete'], success: [204] },
  state: { methods: ['put', 'delete'], success: [204] },
  action: { methods: ['post'], success: [200, 202] },
};

const isParamSeg = (s) => /^\{.+\}$/.test(s);

/** Classify the path shape of a non-CRUD operation: `verb`, `state-noun`, `collection`, `dotted`. */
export function actionShape(path, method, verbClass, verb = '') {
  const segs = path.split('/').filter(Boolean);
  const last = segs.at(-1) ?? '';
  if (/\.[a-z0-9]+$/i.test(last) && !isParamSeg(last)) return 'dotted';
  if (verbClass === 'state') return isParamSeg(last) ? 'state-member' : 'state-noun';
  if (verbClass !== 'action') return null;
  if (isParamSeg(last)) return 'collection-item';
  // `POST /releases/{id}/approve` names the verb; `POST /accounts/{id}/invitations` (reissue) is
  // the same action written as a noun collection — the second style §13.11 rules out.
  return verb && last.replace(/-/g, '').startsWith(verb) ? 'verb' : 'collection';
}

export function check(doc, { page = PAGE, extraVerbs = [] } = {}, findings = new Findings()) {
  const ops = [];
  for (const [path, item] of Object.entries(doc?.paths ?? {})) {
    const shared = (item?.parameters ?? []).map((p) => deref(doc, p));
    for (const m of METHODS) {
      const op = item?.[m];
      if (!op) continue;
      const params = [...shared, ...(op.parameters ?? []).map((p) => deref(doc, p))].filter(Boolean);
      ops.push({ path, method: m, op, params, id: op.operationId ?? `${m.toUpperCase()} ${path}` });
    }
  }
  const where = (o) => `${o.method.toUpperCase()} ${o.path}`;
  const has = (o, name, loc) => o.params.some((p) => String(p.name).toLowerCase() === name.toLowerCase() && (!loc || p.in === loc));
  const success = (o) => Object.keys(o.op.responses ?? {}).filter((s) => /^2\d\d$/.test(s)).map(Number);
  const writes = new Set(ops.filter((o) => o.method !== 'get').map((o) => o.path));

  const shapes = new Map();
  const verbCounts = {};
  let declaredIdem = 0;
  let declaredConc = 0;
  for (const o of ops) {
    const verb = verbOf(o.op.operationId);
    verbCounts[verb] = (verbCounts[verb] ?? 0) + 1;
    const cls = classOf(verb, extraVerbs);
    if (!o.op.operationId) findings.add('E111', where(o), 0, 'no operationId');
    else if (!cls) findings.add('E111', where(o), 0, `operationId \`${o.op.operationId}\`: verb \`${verb}\` is outside the closed list (${Object.values(VERBS).flat().join(', ')})`);

    if (cls) {
      const rule = RULE[cls];
      // `search` is the one action a GET may carry: it only reads (AIP-136).
      const okMethod = (rule.methods.includes(o.method) || (verb === 'search' && o.method === 'get')) &&!(cls === 'create' && /\}$/.test(o.path));
      const ss = success(o);
      if (!okMethod) findings.add('E110', where(o), 0, `${o.op.operationId}: a ${cls} is ${rule.methods.map((x) => x.toUpperCase()).join('/')}${cls === 'create' ? ' on the collection' : ''}, not ${o.method.toUpperCase()}`);
      else if (ss.length && !ss.some((s) => rule.success.includes(s))) findings.add('E110', where(o), 0, `${o.op.operationId}: a ${cls} answers ${rule.success.join(' or ')}, not ${ss.join(', ')}`);
      if (cls === 'create' && ss.includes(201) && !o.op.responses?.['201']?.headers?.Location && !deref(doc, o.op.responses?.['201'])?.headers?.Location) {
        findings.add('E110', where(o), 0, `${o.op.operationId}: 201 without a Location header`);
      }
    }
    // The style of a non-CRUD operation is judged whatever its verb: an unlisted verb is still
    // an action or a state, and two styles across the contract are a finding (§13.11).
    // An unlisted verb that is not a create in other words (add, post, record, upload, request…
    // into a collection) counts as an action.
    const createLike = /^(add|post|record|upload|request|share|draft|attach|open)$/.test(verb);
    const shapeClass = cls ?? (o.method === 'post' && !createLike && !/\}$/.test(o.path) && /\}\/[^/{]+$/.test(o.path) ? 'action' : null);
    const shape = shapeClass && !(verb === 'search' && o.method === 'get') && actionShape(o.path, o.method, shapeClass, verb);
    if (shape && shape !== 'state-member') shapes.set(shape, (shapes.get(shape) ?? []).concat(o));
    // A toggle written as POST to set and DELETE to clear is the state class in the wrong method.
    if (o.method === 'post' && ops.some((x) => x.path === o.path && x.method === 'delete') && !/\}$/.test(o.path)) {
      const ss = success(o);
      if (!['create'].includes(cls)) findings.add('E110', where(o), 0, `${o.id}: POST/DELETE on one sub-resource is a toggle; set it with PUT (204), clear it with DELETE (204)${ss.length ? ` — answers ${ss.join(', ')}` : ''}`);
    }

    if (o.method !== 'get') {
      const idem = o.op['x-idempotency'];
      if (idem == null) findings.add('E108', where(o), 0, `${o.id}: no \`x-idempotency: required|exempt:<reason>\``);
      else if (idem === 'required') {
        declaredIdem++;
        if (!has(o, 'Idempotency-Key', 'header')) findings.add('E108', where(o), 0, `${o.id}: x-idempotency required, but no Idempotency-Key header parameter`);
      } else if (/^exempt:\s*\S/.test(String(idem))) declaredIdem++;
      else findings.add('E108', where(o), 0, `${o.id}: x-idempotency \`${idem}\` is not required or exempt:<reason>`);

      const conc = o.op['x-concurrency'];
      if (conc == null) findings.add('E109', where(o), 0, `${o.id}: no \`x-concurrency: if-match|lww:<ADR>|none:<reason>\``);
      else if (conc === 'if-match') {
        declaredConc++;
        if (!has(o, 'If-Match', 'header')) findings.add('E109', where(o), 0, `${o.id}: x-concurrency if-match, but no If-Match header parameter`);
        if (!o.op.responses?.['412']) findings.add('E109', where(o), 0, `${o.id}: x-concurrency if-match, but no 412 response`);
      } else if (/^lww:\s*ADR-\d{3,}/.test(String(conc)) || /^none:\s*\S/.test(String(conc))) declaredConc++;
      else findings.add('E109', where(o), 0, `${o.id}: x-concurrency \`${conc}\` is not if-match, lww:ADR-NNN or none:<reason>`);
    }

    for (const p of o.params) {
      if (p.in === 'path' || p.in === 'query') {
        const s = deref(doc, p.schema) ?? {};
        if (p.in === 'query' && (s.type === 'boolean' || (Array.isArray(s.type) && s.type.includes('boolean'))) && !/^(is|has)_/.test(p.name)) {
          findings.add('W103', where(o), 0, `boolean filter \`${p.name}\` is not is_<adjective> or has_<noun>`);
        }
        if (p.in === 'path' && !/_id$/.test(p.name) && /id$/i.test(p.name) === false && /\{/.test(o.path)) {
          // a path parameter that names a record is an id
          if (s.format !== 'date' && !/^(key|slug|name|token)$/.test(p.name)) findings.add('W103', where(o), 0, `path parameter \`${p.name}\` does not end in _id`);
        } else if ((p.in === 'path' || p.in === 'query') && /[a-z]Id$|^id$/.test(p.name)) {
          findings.add('W103', where(o), 0, `id parameter \`${p.name}\` is not snake_case \`<noun>_id\``);
        }
        if (p.in === 'query' && /^(order|order_by|sort_by|orderBy|sortBy)$/.test(p.name)) findings.add('W103', where(o), 0, `sort parameter \`${p.name}\` is not \`sort\``);
        if (p.in === 'query' && p.name === 'limit') {
          if (s.default !== undefined && s.default !== page.default) findings.add('W103', where(o), 0, `limit default ${s.default}, the profile's is ${page.default}`);
          if (s.maximum !== undefined && s.maximum !== page.max) findings.add('W103', where(o), 0, `limit maximum ${s.maximum}, the profile's is ${page.max}`);
        }
      }
    }

    if (o.method === 'get' && writes.has(o.path) && !/^list/.test(o.op.operationId ?? '')) {
      const r200 = deref(doc, o.op.responses?.['200']);
      const headers = r200?.headers ?? {};
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'etag')) findings.add('W104', where(o), 0, `${o.id}: a GET of a resource that has a write, with no ETag`);
    }
  }

  // One action style, §13.11's: POST /{collection}/{id}/<verb>. An action written as a noun
  // collection, a file extension or a GET is the second style.
  const styles = [...shapes.entries()].filter(([k]) => ['verb', 'collection', 'dotted', 'collection-item'].includes(k));
  for (const [k, list] of styles) {
    if (k === 'verb') continue;
    for (const o of list) findings.add('W103', where(o), 0, `${o.id}: action style \`${k}\`; the one style is POST /{collection}/{id}/<verb>`);
  }

  return {
    findings,
    summary: {
      paths: Object.keys(doc?.paths ?? {}).length,
      operations: ops.length,
      'non-GET': ops.filter((o) => o.method !== 'get').length,
      'x-idempotency declared': declaredIdem,
      'x-concurrency declared': declaredConc,
      'operationId verbs': Object.keys(verbCounts).length,
      'action styles': [...shapes.keys()].filter((k) => k !== 'state-noun' && k !== 'state-member').length,
      'GETs with ETag': ops.filter((o) => o.method === 'get' && Object.keys(deref(doc, o.op.responses?.['200'])?.headers ?? {}).some((h) => h.toLowerCase() === 'etag')).length,
    },
  };
}

export function pageDefaults(profile) {
  const d = { ...(profile?.checks ?? {}), ...(profile?.defaults ?? {}) };
  const both = configured(d['page-size']);
  const m = both && /(\d+)\s*\/\s*(\d+)/.exec(both);
  return {
    default: Number(configured(d['page-size-default']) ?? m?.[1] ?? PAGE.default),
    max: Number(configured(d['page-size-max']) ?? m?.[2] ?? PAGE.max),
  };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const path = a.openapi ?? (slug ? join(root, 'api', slug, 'openapi.yaml') : null);
  if (!path) { console.error('usage: api-style-check.mjs <slug> [--root dev] [--openapi <path>] [--json]'); return 2; }
  if (!existsSync(path)) { console.error(`no contract at ${path}`); return 2; }
  let doc;
  const text = readFileSync(path, 'utf8');
  try { doc = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch (e) { console.error(`${path}: ${e.message}`); return 2; }
  const profile = loadProfile(process.cwd(), a.profile);
  const extraVerbs = splitList(configured(profile.checks['extra-action-verbs']));
  const { findings, summary } = check(doc, { page: pageDefaults(profile), extraVerbs });
  return report('api-style-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
