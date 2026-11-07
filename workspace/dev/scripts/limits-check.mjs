#!/usr/bin/env node
/**
 * limits-check.mjs — every limit has one value, in limits.yaml, and every layer agrees with it
 * (DEV-CONTRACTS §13.11).
 *
 * Layers: Go and Python constants (`Max*`, `*Limit`, `*Cap`, `MAX_*`), SQL CHECK limits on
 * char_length / octet_length / cardinality and varchar(n) in the migrations (the last definition
 * of a column wins, so a later migration may change it), openapi maxLength / maxItems / maximum,
 * and web `MAX_*` constants. A field or user message that carries a digit is warned: the number
 * belongs in FieldError.limit.
 *
 *   node dev/scripts/limits-check.mjs <slug> [--root dev] [--source .] [--catalogue <limits.yaml>]
 *        [--openapi <openapi.yaml>] [--web <dir>] [--profile <DEV-PROFILE.md>] [--json]
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, deref } from './lib/yaml.mjs';
import { Findings, report, parseArgs, loadProfile, configured, readSources, readServerSources, isTestFile, lineAt, blankComments, globRe, commentStyle, STRING_LIT, unquote } from './lib/check.mjs';
import { lang, langOf, isServerFile } from './lib/langs.mjs';
import { findRoot } from './lib/root.mjs';

export const DEFAULTS = {
  goName: lang('go').limitName,
  constName: String.raw`^(?:MAX|MIN)_[A-Z0-9_]+$`,
};
const CODE_LAYERS = ['go', 'python', 'web']; // the layer names reports use; a new language adds its id

/** Evaluate a constant expression: digits with `_`, `<<`, `*`, `+`, parentheses. */
export function evalInt(expr) {
  const e = String(expr).replace(/_/g, '').trim();
  if (!/^[\d\s<*+()-]+$/.test(e)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${e});`)();
    return Number.isSafeInteger(v) ? v : null;
  } catch { return null; }
}

/** Go / Python / web limit constants: { layer, id, pkg, name, value, rel, line }. */
export function scanCode(files, { goName = DEFAULTS.goName, constName = DEFAULTS.constName } = {}) {
  const out = [];
  const goRe = new RegExp(goName);
  const cRe = new RegExp(constName);
  for (const f of files) {
    if (isTestFile(f.rel)) continue;
    const l = langOf(f.rel);
    if (!l?.limitConst) continue;
    const layer = l.id === 'typescript' ? 'web' : l.id;
    const code = blankComments(f.text, commentStyle(f.rel));
    const pkg = basename(dirname(f.rel));
    const re = new RegExp(l.limitConst.source, 'gm');
    // Go's profile key (`limits-go-name`) overrides its adapter's default; other languages use the shared one.
    const nameRe = l.id === 'go' ? goRe : l.limitName ? new RegExp(l.limitName) : cRe;
    for (const m of code.matchAll(re)) {
      const name = m[1];
      if (!nameRe.test(name)) continue;
      const value = evalInt(m[2]);
      if (value === null) continue;
      out.push({ layer, id: layer === 'web' ? name : `${pkg}.${name}`, pkg, name, value, rel: f.rel, line: lineAt(code, m.index) });
    }
    if (layer === 'python') {
      let cls = null;
      const lines = code.split('\n');
      lines.forEach((l, i) => {
        const c = /^class\s+(\w+)/.exec(l);
        if (c) cls = c[1];
        const fm = /^\s+(\w+)\s*:[^=]*=\s*Field\([^)]*\bmax_(?:length|items)\s*=\s*(\d+)/.exec(l);
        if (fm && cls) out.push({ layer, id: `${cls}.${fm[1]}`, pkg: cls, name: fm[1], value: Number(fm[2]), rel: f.rel, line: i + 1, field: true });
      });
    }
  }
  return out;
}

/** SQL limits from migrations, last definition per column winning: { layer:'sql', id: table.col, value, unit }. */
export function scanSql(files) {
  const byId = new Map();
  const sorted = [...files].filter((f) => !/\.down\.sql$/.test(f.rel) && !/(^|\/)queries\.sql$/.test(f.rel)).sort((a, b) => basename(a.rel).localeCompare(basename(b.rel)));
  for (const f of sorted) {
    const text = f.text.replace(/--[^\n]*/g, (s) => ' '.repeat(s.length));
    const tables = [...text.matchAll(/\b(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+ONLY)?(?:\s+IF\s+EXISTS)?)\s+(?:"?\w+"?\.)?"?(\w+)"?/gi)].map((m) => ({ at: m.index, table: m[1] }));
    const tableAt = (i) => [...tables].reverse().find((t) => t.at <= i)?.table;
    const put = (table, col, value, unit, i) => {
      if (!table) return;
      byId.set(`${table}.${col}`, { layer: 'sql', id: `${table}.${col}`, name: col, value, unit, rel: f.rel, line: lineAt(text, i) });
    };
    for (const m of text.matchAll(/\b(char_length|character_length|length|octet_length|cardinality|array_length)\s*\(\s*"?(\w+)"?(?:\s*,\s*1)?\s*\)\s*(<=|<|BETWEEN\s+\d+\s+AND)\s*(\d+)/gi)) {
      const v = Number(m[4]) - (m[3] === '<' ? 1 : 0);
      const unit = /octet/i.test(m[1]) ? 'bytes' : /cardinality|array/i.test(m[1]) ? 'items' : 'chars';
      put(tableAt(m.index), m[2], v, unit, m.index);
    }
    for (const m of text.matchAll(/^\s*"?(\w+)"?\s+(?:varchar|character\s+varying|char)\s*\(\s*(\d+)\s*\)/gim)) put(tableAt(m.index), m[1], Number(m[2]), 'chars', m.index);
  }
  return [...byId.values()];
}

/** openapi limits: schema properties (nested) and parameters. */
export function scanOpenapi(doc) {
  const out = [];
  const seen = new Set();
  const visit = (schemaName, path, s, depth = 0) => {
    s = deref(doc, s);
    if (!s || typeof s !== 'object' || depth > 6) return;
    for (const [key, kind] of [['maxLength', 'chars'], ['maxItems', 'items'], ['maximum', 'count']]) {
      if (path && Number.isInteger(s[key])) {
        const id = `${schemaName}.${path}`;
        const k = `${id}|${key}`;
        if (!seen.has(k)) { seen.add(k); out.push({ layer: 'openapi', id, name: path.split('.').at(-1), value: s[key], unit: kind, rel: 'openapi', line: 0 }); }
      }
    }
    for (const [p, sub] of Object.entries(s.properties ?? {})) visit(schemaName, path ? `${path}.${p}` : p, sub, depth + 1);
    if (s.items && !s.items.$ref) visit(schemaName, path, s.items, depth + 1);
  };
  for (const [name, s] of Object.entries(doc?.components?.schemas ?? {})) visit(name, '', s);
  const params = new Map();
  const addParam = (p) => {
    p = deref(doc, p);
    const s = deref(doc, p?.schema);
    if (!p?.name || !s) return;
    for (const [key, kind] of [['maximum', 'count'], ['maxLength', 'chars']]) {
      if (Number.isInteger(s[key])) {
        const id = `param:${p.name}`;
        const list = params.get(id) ?? [];
        list.push({ layer: 'openapi', id, name: p.name, value: s[key], unit: kind, rel: 'openapi', line: 0 });
        params.set(id, list);
      }
    }
  };
  for (const p of Object.values(doc?.components?.parameters ?? {})) addParam(p);
  for (const item of Object.values(doc?.paths ?? {})) {
    for (const p of item?.parameters ?? []) addParam(p);
    for (const m of ['get', 'put', 'post', 'patch', 'delete']) for (const p of item?.[m]?.parameters ?? []) addParam(p);
  }
  for (const list of params.values()) {
    const vals = new Map();
    for (const x of list) vals.set(x.value, x);
    out.push(...vals.values());
  }
  return out;
}

/** User and field messages in backend code that carry a digit; any quote style (STRING_LIT). */
export function scanMessages(files) {
  const out = [];
  const re = new RegExp(String.raw`\b(\w*Message|Detail|[Mm]essage|detail)\s*(?:=|:)\s*(?:fmt\.Sprintf\(\s*)?(${STRING_LIT})`, 'g');
  for (const f of files) {
    if (isTestFile(f.rel) || !isServerFile(f.rel, f.text)) continue;
    const code = blankComments(f.text, commentStyle(f.rel));
    for (const m of code.matchAll(re)) {
      const s = unquote(m[2]);
      // A format string (`%d`) is an operator diagnostic, not a sentence a user reads.
      if (!s.includes('%') && /\d/.test(s.replace(/\b(?:REQ|DEC|ADR)-\d+|\b[A-Z]+-\d+\b|\b\d{1,2}:\d{2}\b/g, ''))) out.push({ rel: f.rel, line: lineAt(code, m.index), text: s });
    }
  }
  return out;
}

export function readCatalogue(text, findings, file = 'limits.yaml') {
  let doc;
  try { doc = parseYaml(text); } catch (e) { findings.add('E112', file, 0, `does not parse: ${e.message}`); return []; }
  const list = Array.isArray(doc) ? doc : doc?.limits;
  if (!Array.isArray(list)) { findings.add('E112', file, 0, 'no `limits:` list'); return []; }
  const names = new Set();
  return list.filter((e, i) => {
    const bad = !e?.name || !Number.isInteger(e?.value);
    if (bad) findings.add('E112', file, 0, `entry ${i + 1}: needs a name and one integer value`);
    if (e?.name && names.has(e.name)) findings.add('E113', file, 0, `${e.name} is listed twice`);
    names.add(e?.name);
    return !bad;
  });
}

/** Does pattern `p` (layer-specific) match limit `x`? */
function matches(p, x) {
  const s = String(p);
  if (lang(x.layer)?.role === 'server') {
    if (!s.includes('.')) return globRe(s).test(x.name);
    return globRe(s).test(x.id);
  }
  return globRe(s).test(x.id);
}

export function check({ catalogue, limits, messages }, findings = new Findings(), catalogueFile = 'limits.yaml') {
  const entries = catalogue == null ? [] : readCatalogue(catalogue, findings, catalogueFile);
  const matchedBy = new Map(); // limit → entry names
  for (const e of entries) {
    const hits = [];
    for (const layer of ['go', 'python', 'sql', 'openapi', 'web']) {
      for (const p of e.match?.[layer] ?? []) {
        const found = limits.filter((x) => x.layer === layer && matches(p, x));
        if (!found.length) findings.add('E112', catalogueFile, 0, `${e.name}: ${layer} \`${p}\` matches nothing in the code`);
        hits.push(...found);
      }
    }
    for (const x of new Set(hits)) {
      matchedBy.set(x, (matchedBy.get(x) ?? []).concat(e.name));
      if (x.value !== e.value) findings.add('E112', x.rel, x.line, `${e.name}: ${x.layer} ${x.id} is ${x.value}; limits.yaml says ${e.value}`);
    }
    for (const layer of CODE_LAYERS) {
      const inLayer = [...new Set(hits)].filter((x) => x.layer === layer && !x.field);
      if (inLayer.length > 1) findings.add('E113', inLayer[1].rel, inLayer[1].line, `${e.name} is defined ${inLayer.length} times in ${layer}: ${inLayer.map((x) => `${x.id}=${x.value}`).join(', ')}`);
    }
  }
  // One constant name with one value in several packages is one limit defined several times
  // (MaxPage ×11). The same name with different values is several limits sharing a name — the
  // catalogue tells them apart, so uncatalogued ones are only named in W106 below.
  const collisions = [];
  for (const layer of CODE_LAYERS) {
    const byName = new Map();
    for (const x of limits.filter((y) => y.layer === layer && !y.field)) byName.set(x.name, (byName.get(x.name) ?? []).concat(x));
    for (const [name, list] of byName) {
      if (list.length < 2) continue;
      const entriesHit = new Set(list.flatMap((x) => matchedBy.get(x) ?? []));
      if (entriesHit.size >= 1 && list.every((x) => matchedBy.has(x))) continue; // the entry check above judged it
      const values = [...new Set(list.map((x) => x.value))];
      if (values.length === 1) findings.add('E113', list[1].rel, list[1].line, `${name} = ${values[0]} is defined ${list.length} times in ${layer} (${list.map((x) => x.pkg).join(', ')}) — define it once and import it`);
      else {
        collisions.push(name);
        findings.add('E112', list[1].rel, list[1].line, `${name} has ${values.length} values in ${layer} (${list.map((x) => `${x.pkg} ${x.value}`).join(', ')}) — one limit drifted, or several share a name: limits.yaml must name each`);
      }
    }
  }
  if (catalogue != null) {
    for (const x of limits) if (!matchedBy.has(x) && x.layer !== 'openapi') findings.add('W106', x.rel, x.line, `${x.layer} ${x.id} = ${x.value} is in no limits.yaml entry`);
  }
  for (const m of messages) findings.add('W105', m.rel, m.line, `a digit in a user message ("${m.text.slice(0, 70)}") — put the number in FieldError.limit`);

  const per = (l) => limits.filter((x) => x.layer === l).length;
  return {
    findings,
    summary: {
      catalogue: entries.length,
      go: per('go'), python: per('python'), sql: per('sql'), openapi: per('openapi'), web: per('web'),
      'drifted values': findings.list.filter((f) => f.code === 'E112' && /says|differ/.test(f.message)).length,
      'messages with digits': messages.length,
      'names shared by different limits': collisions.length,
    },
    collisions,
  };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const source = resolve(a.source ?? '.');
  const catPath = a.catalogue ?? (slug ? join(root, 'data', slug, 'limits.yaml') : null);
  const apiPath = a.openapi ?? (slug ? join(root, 'api', slug, 'openapi.yaml') : null);
  const profile = loadProfile(source, a.profile);
  const opts = { goName: configured(profile.checks['go-limit-pattern']) ?? DEFAULTS.goName, constName: configured(profile.checks['const-limit-pattern']) ?? DEFAULTS.constName };

  const code = readServerSources(source);
  // A Next.js server file can sit under --web too; read it once, or one constant counts twice.
  const seen = new Set(code.map((f) => resolve(source, f.rel)));
  const web = a.web ? readSources(resolve(a.web), (n) => /\.(ts|tsx|js|jsx|mjs)$/.test(n) && !/\.d\.ts$/.test(n), { skipDev: false }).filter((f) => !seen.has(resolve(a.web, f.rel))) : [];
  const sql = readSources(source, (n) => n.endsWith('.sql'));
  let doc = null;
  if (apiPath && existsSync(apiPath)) {
    try { doc = parseYaml(readFileSync(apiPath, 'utf8')); } catch (e) { console.error(`openapi: ${e.message}`); return 2; }
  }
  const limits = [...scanCode([...code, ...web], opts), ...scanSql(sql), ...(doc ? scanOpenapi(doc) : [])];
  const findings = new Findings();
  const catalogue = catPath && existsSync(catPath) ? readFileSync(catPath, 'utf8') : null;
  if (catalogue == null) findings.add('E112', catPath ?? 'limits.yaml', 0, 'limits.yaml does not exist (DEV-CONTRACTS §13.11)');
  const { summary } = check({ catalogue, limits, messages: scanMessages(code) }, findings, catPath ? catPath.split(/[\\/]/).slice(-3).join('/') : 'limits.yaml');
  return report('limits-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'], profile: profile.text });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
