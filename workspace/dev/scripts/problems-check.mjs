#!/usr/bin/env node
/**
 * problems-check.mjs — the problem catalogue, the contract and the code name the same problems
 * (DEV-CONTRACTS §13.11).
 *
 * Reads `api/<slug>/problems.yaml`, the openapi `ProblemType` enum and `FieldError.code` enum, and
 * the backend sources (lib/langs.mjs isServerFile: Go, Python, and Next.js server code). A string
 * is `"…"`, `'…'` or a backtick string; one with `${…}` is built at runtime. A status is "chosen" where a composite literal or call carries both a
 * status (the `Status pattern`) and a problem type; it may be chosen only in the files of the
 * `Status table` (DEV-PROFILE `## Backend checks`).
 *
 *   node dev/scripts/problems-check.mjs <slug> [--root dev] [--source .] [--client web/src]
 *        [--catalogue <problems.yaml>] [--openapi <openapi.yaml>] [--profile <DEV-PROFILE.md>]
 *        [--status-table <glob,glob>] [--json] [--bootstrap]
 *
 * --bootstrap prints a draft problems.yaml from the contract and the code (for a brownfield repo
 * adopting the catalogue) and checks nothing. Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml.mjs';
import { findRoot } from './lib/root.mjs';
import {
  Findings, report, parseArgs, loadProfile, configured, splitList, globRe, readSources,
  isTestFile, lineAt, blankComments, stringConsts, enclosing, statusValue, commentStyle,
  readServerSources, STRING_LIT, unquote,
} from './lib/check.mjs';
import { LANGS, lang as langById } from './lib/langs.mjs';

export const CLIENT_UX = ['field', 'form', 'toast', 'page', 'sign-in', 'retry', 'conflict'];
export const SUFFIXES = ['not-found', 'unavailable', 'limit-reached', 'conflict', 'forbidden', 'invalid', 'required'];
export const RESERVED = ['validation', 'malformed-request', 'unauthenticated', 'rate-limited', 'precondition-failed', 'service-unavailable', 'internal', 'payload-too-large', 'upstream-failed', 'upstream-timeout', 'idempotency-key-in-flight'];
export const DEFAULTS = {
  statusTable: '**/problem*.go, **/problem*.py, **/problem*.ts',
  statusPattern: String.raw`\b[Ss]tatus(?:_code)?\s*[:=]\s*(http\.Status\w+|HTTPStatus\.\w+|status\.HTTP_\w+|\d{3})\b`,
  typeSchema: 'ProblemType',
  fieldErrorSchema: 'FieldError',
};
const CLIENT_FILE = /\.(ts|tsx|js|jsx|mjs|vue|svelte)$/;

/** The name grammar: `<noun>-<state>` with one suffix per meaning, or a reserved name. */
export function grammarProblem(type) {
  const name = String(type).split('/').filter(Boolean).at(-1) ?? '';
  if (RESERVED.includes(name)) return null;
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return `\`${name}\` is not kebab-case`;
  const suffix = SUFFIXES.find((s) => name.endsWith(`-${s}`));
  if (!suffix) return `\`${name}\` ends in none of -${SUFFIXES.join(', -')}`;
  if (name.length === suffix.length + 1) return `\`${name}\` has no noun before -${suffix}`;
  return null;
}

/** Title Case: two or more words after the first, every one capitalised. */
export function isTitleCase(title) {
  const words = String(title ?? '').split(/\s+/).filter(Boolean).slice(1).filter((w) => /^[A-Za-z]/.test(w));
  const minor = /^(a|an|the|of|in|on|to|for|and|or|by|at|with)$/i;
  const content = words.filter((w) => !minor.test(w));
  if (content.length < 2) return false;
  return content.every((w) => /^[A-Z][a-z]/.test(w));
}

export function readCatalogue(text, findings, file = 'problems.yaml') {
  let doc;
  try { doc = parseYaml(text); } catch (e) { findings.add('E100', file, 0, `does not parse: ${e.message}`); return []; }
  const list = Array.isArray(doc) ? doc : doc?.problems;
  if (!Array.isArray(list)) { findings.add('E100', file, 0, 'no `problems:` list'); return []; }
  const seen = new Set();
  const out = [];
  list.forEach((p, i) => {
    const where = `entry ${i + 1}${p?.type ? ` (${p.type})` : ''}`;
    if (!p || typeof p !== 'object') { findings.add('E100', file, 0, `${where} is not a map`); return; }
    for (const k of ['type', 'status', 'title', 'when', 'client_ux']) {
      if (p[k] === undefined || p[k] === null || p[k] === '') findings.add('E100', file, 0, `${where}: \`${k}\` is missing`);
    }
    if (p.status !== undefined && p.status !== null && !(Number.isInteger(p.status) && p.status >= 400 && p.status <= 599)) {
      findings.add('E100', file, 0, `${where}: status must be exactly one integer 400–599, got ${JSON.stringify(p.status)}`);
    }
    if (p.client_ux && !CLIENT_UX.includes(p.client_ux)) findings.add('E100', file, 0, `${where}: client_ux \`${p.client_ux}\` is not one of ${CLIENT_UX.join(', ')}`);
    if (p.extensions !== undefined && p.extensions !== null && !Array.isArray(p.extensions)) findings.add('E100', file, 0, `${where}: extensions must be a list`);
    if (p.type) {
      if (seen.has(p.type)) findings.add('E100', file, 0, `${where}: duplicate type`);
      seen.add(p.type);
    }
    out.push(p);
  });
  return out;
}

/** The enum of a named schema in an openapi document, or null. */
export function schemaEnum(openapi, name, prop = null) {
  let s = openapi?.components?.schemas?.[name];
  if (prop) s = s?.properties?.[prop];
  return Array.isArray(s?.enum) ? s.enum.map(String) : null;
}

/**
 * Scan sources. Returns { types: Map<value, [{rel,line}]>, names: Map<const, value>, emissions,
 * dynamic, titles: Map<value, [{title, rel, line}]>, codes: [{value|raw, rel, line}], refs: Map<value, n> }.
 */
/** A backtick string with a `${…}` in it: a value built at runtime. */
const DYNAMIC_TPL = '`' + String.raw`(?:[^` + '`' + String.raw`\\]|\\.)*?\$\{[^` + '`' + String.raw`]*` + '`';

export function scanSources(files, { prefix = '/problems/', statusPattern = DEFAULTS.statusPattern } = {}) {
  const names = new Map(); // const name → type value
  const strs = new Map(); // const name → any string value (titles, codes)
  const types = new Map();
  const isType = (v) => typeof v === 'string' && v.startsWith(prefix) && v.length > prefix.length;
  const prepared = files.map((f) => ({ ...f, lang: commentStyle(f.rel) })).map((f) => ({ ...f, code: blankComments(f.text, f.lang) }));

  for (const f of prepared) {
    if (isTestFile(f.rel)) continue;
    for (const [k, v] of stringConsts(f.code)) {
      strs.set(k, v);
      if (isType(v)) names.set(k, v);
    }
    for (const m of f.code.matchAll(new RegExp(STRING_LIT, 'g'))) {
      const v = unquote(m[0]);
      if (isType(v)) {
        const at = types.get(v) ?? [];
        at.push({ rel: f.rel, line: lineAt(f.code, m.index) });
        types.set(v, at);
      }
    }
  }

  const resolve = (expr) => {
    const e = String(expr ?? '').trim();
    const lit = unquote(e);
    if (lit !== null) return { value: lit, raw: true };
    const id = /^(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)$/.exec(e);
    if (id && strs.has(id[1])) return { value: strs.get(id[1]), raw: false, name: id[1] };
    return null;
  };

  const emissions = [];
  const dynamic = [];
  const titles = new Map();
  const codes = [];
  const usedNames = new Map();
  const statusRe = new RegExp(statusPattern, 'g');
  // A literal joined with `+`, or a backtick string with `${…}`, is a runtime-built type.
  const typeRe = new RegExp(String.raw`\b[Tt]ype\s*[:=]\s*((?:${STRING_LIT})\s*\+\s*[^,})\n]+|${DYNAMIC_TPL}|${STRING_LIT}|(?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*)`);
  const addTitle = (value, title, rel, line) => {
    if (!isType(value) || typeof title !== 'string') return;
    const list = titles.get(value) ?? [];
    list.push({ title, rel, line });
    titles.set(value, list);
  };

  // The type a literal belongs to: a `Type:` inside it, or the map key in front of it
  // (`TypeX: {Status: …, Title: …}` — a status table).
  const typeOf = (code, box) => {
    const t = typeRe.exec(box.text);
    if (t) return t[1];
    const before = code.slice(Math.max(0, box.start - 120), box.start);
    const k = new RegExp(String.raw`((?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*|${STRING_LIT})\s*:\s*$`).exec(before);
    return k ? k[1] : null;
  };

  for (const f of prepared) {
    if (isTestFile(f.rel)) continue;
    const code = f.code;
    // Emissions: a literal or call carrying a status and a type.
    for (const m of code.matchAll(statusRe)) {
      const status = statusValue(m[1]);
      if (!status || status < 400) continue;
      const box = enclosing(code, m.index);
      if (!box) continue;
      const t = typeOf(code, box);
      if (!t) continue;
      const line = lineAt(code, m.index);
      if (/^["'`]/.test(t) && unquote(t) === null) { dynamic.push({ rel: f.rel, line, expr: t.trim() }); continue; }
      const r = resolve(t);
      if (!r || !isType(r.value)) continue;
      emissions.push({ type: r.value, status, rel: f.rel, line });
    }
    // Dynamic types outside an emission literal: `"/problems/" + x`.
    const pfx = prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    for (const m of code.matchAll(new RegExp(String.raw`(["'])${pfx}\1\s*\+|` + '`' + pfx + String.raw`[^` + '`' + String.raw`]*?\$\{`, 'g'))) {
      const line = lineAt(code, m.index);
      if (!dynamic.some((d) => d.rel === f.rel && d.line === line)) dynamic.push({ rel: f.rel, line, expr: code.slice(m.index, m.index + 60).split('\n')[0] });
    }
    // Titles: `TypeX: "Title"` / `TypeX: titleConst` map entries, `titles[TypeX] = "…"`, and
    // `Title: "…"` beside a `Type:` in one literal.
    for (const m of code.matchAll(new RegExp(String.raw`^\s*((?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*)\s*:\s*(${STRING_LIT}|[A-Za-z_]\w*)\s*,`, 'gm'))) {
      const k = resolve(m[1]);
      const v = resolve(m[2]);
      if (k && !k.raw && isType(k.value) && v && !isType(v.value)) addTitle(k.value, v.value, f.rel, lineAt(code, m.index));
    }
    for (const m of code.matchAll(new RegExp(String.raw`\[\s*((?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*|${STRING_LIT})\s*\]\s*=\s*(${STRING_LIT}|[A-Za-z_]\w*)`, 'g'))) {
      const k = resolve(m[1]);
      const v = resolve(m[2]);
      if (k && isType(k.value) && v && !isType(v.value)) addTitle(k.value, v.value, f.rel, lineAt(code, m.index));
    }
    for (const m of code.matchAll(new RegExp(String.raw`\b[Tt]itle\s*[:=]\s*(${STRING_LIT})`, 'g'))) {
      const box = enclosing(code, m.index);
      const t = box && typeOf(code, box);
      const r = t && resolve(t);
      if (r && isType(r.value)) addTitle(r.value, resolve(m[1]).value, f.rel, lineAt(code, m.index));
    }
    // FieldError codes: `Code: X` / `code=X` — not a typed constant (`CodeX Code = "x"`), not
    // generated code.
    if (/^\/\/ Code generated .* DO NOT EDIT\.$/m.test(f.text) || /^"""Generated by /.test(f.text)) continue;
    for (const m of code.matchAll(new RegExp(String.raw`(?<![\w"'\x60]\s+)\b[Cc]ode\s*[:=]\s*(${STRING_LIT}|(?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*)\s*[,})\n]`, 'g'))) {
      const r = resolve(m[1]);
      if (!r) continue;
      codes.push({ value: r.value, raw: r.raw, rel: f.rel, line: lineAt(code, m.index) });
    }
    // References to a type constant other than its definition — "emitted" in the wide sense.
    for (const [name, value] of names) {
      const re = new RegExp(`\\b${name}\\b`, 'g');
      for (const m of code.matchAll(re)) {
        const lineText = code.slice(code.lastIndexOf('\n', m.index) + 1, code.indexOf('\n', m.index) === -1 ? code.length : code.indexOf('\n', m.index));
        if (new RegExp(`^\\s*(?:export\\s+)?(?:(?:const|var|let)\\s+)?${name}(?:\\s+string|\\s*:\\s*string)?\\s*(?::?=|=)`).test(lineText)) continue; // definition
        if (/^\s*(?:[\w.]+)\s*:\s*(["'`]|[a-z]\w*\s*,)/.test(lineText) && !/[Tt]ype\s*:/.test(lineText)) continue; // a titles-map entry
        if (/\[\s*[\w.]+\s*\]\s*=/.test(lineText)) continue; // titles[X] = …
        usedNames.set(value, (usedNames.get(value) ?? 0) + 1);
      }
    }
  }
  return { names, types, emissions, dynamic, titles, codes, used: usedNames };
}

export function check({ catalogue, openapi, files, statusTable, statusPattern, typeSchema = DEFAULTS.typeSchema, fieldErrorSchema = DEFAULTS.fieldErrorSchema, catalogueFile = 'problems.yaml', prefix }, findings = new Findings()) {
  const entries = catalogue ? readCatalogue(catalogue, findings, catalogueFile) : [];
  const byType = new Map(entries.filter((e) => e.type).map((e) => [String(e.type), e]));
  const pfx = prefix ?? commonPrefix([...byType.keys()]) ?? '/problems/';

  for (const e of entries) {
    const g = e.type && grammarProblem(e.type);
    if (g) findings.add('W100', catalogueFile, 0, `${e.type}: ${g}`);
    if (e.title && isTitleCase(e.title)) findings.add('E106', catalogueFile, 0, `${e.type}: title "${e.title}" is Title Case; write it in sentence case`);
  }

  const enumTypes = openapi ? schemaEnum(openapi, typeSchema) : null;
  if (openapi && !enumTypes) findings.add('E101', 'openapi', 0, `no \`components.schemas.${typeSchema}.enum\` — the contract must list every problem type`);
  if (enumTypes && catalogue) {
    for (const t of byType.keys()) if (!enumTypes.includes(t)) findings.add('E101', catalogueFile, 0, `${t} is in the catalogue and not in the openapi ${typeSchema} enum`);
    for (const t of enumTypes) if (!byType.has(t)) findings.add('E101', 'openapi', 0, `${t} is in the openapi ${typeSchema} enum and not in the catalogue`);
  }

  const summary = { catalogue: byType.size, 'openapi enum': enumTypes?.length ?? 0 };
  if (!files) return { findings, summary };

  const scan = scanSources(files, { prefix: pfx, statusPattern });
  const inTable = (rel) => statusTable.some((re) => re.test(rel));
  const codeTypes = new Set([...scan.names.values(), ...scan.types.keys()]);
  summary['types in code'] = codeTypes.size;
  summary['status choices'] = scan.emissions.length;
  summary['outside the table'] = scan.emissions.filter((e) => !inTable(e.rel)).length;
  summary['files choosing a status'] = new Set(scan.emissions.map((e) => e.rel)).size;
  summary['runtime-built types'] = scan.dynamic.length;

  if (catalogue) {
    for (const t of codeTypes) {
      if (!byType.has(t)) {
        const at = (scan.types.get(t) ?? [])[0];
        findings.add('E102', at?.rel, at?.line, `${t} is in the code and not in the catalogue`);
      }
    }
    for (const t of byType.keys()) if (!codeTypes.has(t)) findings.add('E102', catalogueFile, 0, `${t} has no constant or literal in the code`);
  }
  for (const d of scan.dynamic) findings.add('E102', d.rel, d.line, `a problem type built at runtime (\`${d.expr}\`) cannot be checked against the catalogue — map to a named type`);

  for (const e of scan.emissions) {
    if (!inTable(e.rel)) findings.add('E103', e.rel, e.line, `${e.type} gets status ${e.status} here, outside the status table — return a domain error and let the one mapper choose`);
  }

  const statuses = new Map();
  for (const e of scan.emissions) {
    const s = statuses.get(e.type) ?? new Map();
    s.set(e.status, (s.get(e.status) ?? []).concat(e));
    statuses.set(e.type, s);
  }
  let twoStatus = 0;
  for (const [type, s] of statuses) {
    if (s.size > 1) {
      twoStatus++;
      const first = [...s.values()][0][0];
      findings.add('E104', first.rel, first.line, `${type} is emitted with ${s.size} statuses: ${[...s.entries()].map(([k, v]) => `${k}×${v.length}`).join(', ')}`);
    }
    const want = byType.get(type)?.status;
    if (Number.isInteger(want)) {
      for (const [st, list] of s) if (st !== want) findings.add('E104', list[0].rel, list[0].line, `${type} is emitted with ${st}; the catalogue says ${want}`);
    }
  }
  summary['types with two statuses'] = twoStatus;

  if (catalogue) {
    for (const t of byType.keys()) {
      if (!statuses.has(t) && !scan.used.has(t)) findings.add('E105', catalogueFile, 0, `${t} is never emitted`);
    }
  }

  for (const [type, list] of scan.titles) {
    const want = byType.get(type)?.title;
    for (const t of list) {
      if (want && t.title !== want) findings.add('E106', t.rel, t.line, `${type}: title "${t.title}" differs from the catalogue's "${want}"`);
      else if (!want && isTitleCase(t.title)) findings.add('E106', t.rel, t.line, `${type}: title "${t.title}" is Title Case`);
    }
  }
  summary['files defining titles'] = new Set([...scan.titles.values()].flat().map((t) => t.rel)).size;

  const codeEnum = openapi ? schemaEnum(openapi, fieldErrorSchema, 'code') : null;
  if (codeEnum) {
    let raw = 0;
    for (const c of scan.codes) {
      const looksLikeCode = /^[a-z][a-z0-9_]*$/.test(c.value);
      if (!looksLikeCode) continue;
      if (!codeEnum.includes(c.value)) continue; // a `Code:` that is not a FieldError code (a tracker code, an error kind)
      if (c.raw) { raw++; findings.add('E107', c.rel, c.line, `FieldError code "${c.value}" written as a raw string — use the generated constant`); }
    }
    summary['raw field-error codes'] = raw;
  }
  return { findings, summary, scan };
}

/** Client coverage: catalogue types with no handling site, and bare status comparisons. */
export function checkClient(entries, files, findings = new Findings()) {
  // Generated declarations (openapi-typescript's schema.d.ts) list every type and handle none.
  const code = files.filter((f) => !isTestFile(f.rel) && !/\.d\.ts$/.test(f.rel)).map((f) => ({ ...f, code: blankComments(f.text) }));
  let unhandled = 0;
  for (const e of entries) {
    const type = String(e.type ?? '');
    const name = type.split('/').filter(Boolean).at(-1);
    if (!name) continue;
    const re = new RegExp(`['"\`](?:${type.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}|${name.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')})['"\`]`);
    if (!code.some((f) => re.test(f.code))) { unhandled++; findings.add('W101', 'client', 0, `${type} (client_ux ${e.client_ux ?? '?'}) has no handling site in the client`); }
  }
  let bare = 0;
  const re = /\bstatus(?:Code)?\s*(?:===|!==|==|!=)\s*(4\d\d)\b|\b(4\d\d)\s*(?:===|!==|==|!=)\s*[\w.]*status\b/g;
  for (const f of code) {
    for (const m of f.code.matchAll(re)) {
      bare++;
      findings.add('W102', f.rel, lineAt(f.code, m.index), `bare status comparison \`${m[0]}\` — branch on the problem type`);
    }
  }
  return { findings, summary: { 'client types unhandled': unhandled, 'bare status comparisons': bare } };
}

/** A draft catalogue from the contract and the code: the most common status, the code's title. */
export function bootstrap(openapi, scan, typeSchema = DEFAULTS.typeSchema) {
  const types = schemaEnum(openapi, typeSchema) ?? [...new Set([...scan.names.values()])].sort();
  const lines = ['# Draft from problems-check.mjs --bootstrap: review every status, title and client_ux.', 'problems:'];
  for (const t of types) {
    const counts = new Map();
    for (const e of scan.emissions.filter((x) => x.type === t)) counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    const status = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 400;
    const title = scan.titles.get(t)?.[0]?.title ?? t.split('/').at(-1).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    lines.push(`  - type: ${t}`, `    status: ${status}`, `    title: ${JSON.stringify(title)}`, `    when: "TODO"`, `    extensions: []`, `    client_ux: ${status === 422 ? 'field' : status === 401 ? 'sign-in' : status === 429 || status === 503 ? 'retry' : status === 409 || status === 412 ? 'conflict' : status === 404 ? 'page' : 'form'}`);
  }
  return lines.join('\n') + '\n';
}

/** The FieldError.code enum in a language whose adapter can emit it (§13.2). */
export function emitCodes(codes, lang, pkg = 'fielderr') {
  const l = langById(lang);
  if (!l?.emitCodes) throw new Error(`--emit-codes: unknown language ${lang} (${LANGS.filter((x) => x.emitCodes).map((x) => x.id).join(', ')})`);
  return l.emitCodes(codes, pkg);
}

function commonPrefix(types) {
  if (!types.length) return null;
  const m = /^(.*\/)[^/]+$/.exec(types[0]);
  return m ? m[1] : null;
}

function main(argv) {
  const a = parseArgs(argv, ['json', 'bootstrap']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const catPath = a.catalogue ?? (slug ? join(root, 'api', slug, 'problems.yaml') : null);
  const apiPath = a.openapi ?? (slug ? join(root, 'api', slug, 'openapi.yaml') : null);
  if (!catPath && !apiPath) {
    console.error('usage: problems-check.mjs <slug> [--root dev] [--source .] [--client <dir>] [--catalogue <path>] [--openapi <path>] [--status-table <globs>] [--json] [--bootstrap]');
    return 2;
  }
  const source = a.source ? resolve(a.source) : null;
  const profile = loadProfile(source ?? process.cwd(), a.profile);
  const statusTable = splitList(a['status-table'] ?? configured(profile.checks['status-table']) ?? DEFAULTS.statusTable).map(globRe);
  const statusPattern = configured(profile.checks['status-pattern']) ?? DEFAULTS.statusPattern;
  const typeSchema = configured(profile.checks['problem-type-schema']) ?? DEFAULTS.typeSchema;

  let openapi = null;
  if (apiPath && existsSync(apiPath)) {
    try { openapi = parseYaml(readFileSync(apiPath, 'utf8')); } catch (e) { console.error(`openapi: ${e.message}`); return 2; }
  }
  if (a['emit-codes']) {
    const codes = openapi && schemaEnum(openapi, configured(profile.checks['field-error-schema']) ?? DEFAULTS.fieldErrorSchema, 'code');
    if (!codes) { console.error('--emit-codes needs an openapi file whose FieldError.code has an enum'); return 2; }
    const out = emitCodes(codes, a['emit-codes'], a.package ?? 'fielderr');
    if (a.out) writeFileSync(a.out, out); else process.stdout.write(out);
    return 0;
  }

  const files = source ? readServerSources(source) : null;

  if (a.bootstrap) {
    if (!openapi || !files) { console.error('--bootstrap needs the openapi file and --source'); return 2; }
    process.stdout.write(bootstrap(openapi, scanSources(files, { statusPattern }), typeSchema));
    return 0;
  }

  const catalogue = catPath && existsSync(catPath) ? readFileSync(catPath, 'utf8') : null;
  const findings = new Findings();
  if (!catalogue) findings.add('E100', catPath ?? 'problems.yaml', 0, 'the problem catalogue does not exist (DEV-CONTRACTS §13.11)');
  const { summary } = check({ catalogue, openapi, files, statusTable, statusPattern, typeSchema, catalogueFile: catPath ? catPath.split(/[\\/]/).slice(-3).join('/') : 'problems.yaml' }, findings);
  if (a.client) {
    const entries = catalogue ? readCatalogue(catalogue, new Findings()) : [];
    Object.assign(summary, checkClient(entries, readSources(resolve(a.client), (n) => CLIENT_FILE.test(n), { skipDev: false }), findings).summary);
  }
  return report('problems-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'], profile: profile.text });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
