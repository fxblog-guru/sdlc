/**
 * check.mjs — what the §13.11 checkers share: findings, the report, the DEV-PROFILE
 * `## Backend checks` keys, argument parsing, and the source scans that read Go and Python
 * without a parser.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { walkSource, toPosix } from './source.mjs';
import { findRoot } from './root.mjs';
import { logRun } from './runlog.mjs';
import { CODE_EXT, NON_CODE_STACKS, isServerFile, isTestPath, langOfStack } from './langs.mjs';

export class Findings {
  constructor() { this.list = []; }
  add(code, file, line, message) {
    this.list.push({ code, level: code.startsWith('E') ? 'error' : 'warn', file: file ?? '-', line: line ?? 0, message });
  }
  get errors() { return this.list.filter((f) => f.level === 'error'); }
  count(code) { return this.list.filter((f) => f.code === code).length; }
  byCode() {
    const out = {};
    for (const f of this.list) out[f.code] = (out[f.code] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort());
  }
}

/**
 * A finding's identity for a baseline: code, file and message with digits blanked — never the line,
 * so an edit above a known finding does not make it new.
 */
export function fingerprint(f) {
  return `${f.code}|${f.file}|${String(f.message).replace(/\d+/g, '#')}`;
}

/**
 * --baseline <file>: findings already recorded there are known debt — shown with `(baseline)`, never
 * failing — so a project adopting a checker late fails only on what it adds. --write-baseline <file>
 * records today's findings. A recorded finding that has gone is reported as cleared, so the file
 * shrinks rather than going stale.
 */
function applyBaseline(findings, baseline, write) {
  if (write) {
    const keys = [...new Set(findings.list.map(fingerprint))].sort();
    writeFileSync(write, `${JSON.stringify({ written: new Date().toISOString().slice(0, 10), findings: keys }, null, 2)}\n`);
  }
  if (!baseline) return { known: 0, cleared: 0 };
  if (!existsSync(baseline)) throw new Error(`--baseline ${baseline}: no such file (write one with --write-baseline)`);
  const known = new Set(JSON.parse(readFileSync(baseline, 'utf8')).findings ?? []);
  const seen = new Set();
  let n = 0;
  for (const f of findings.list) {
    const k = fingerprint(f);
    if (!known.has(k)) continue;
    seen.add(k);
    n++;
    f.level = 'warn';
    f.baseline = true;
  }
  return { known: n, cleared: [...known].filter((k) => !seen.has(k)).length };
}

/**
 * The enabled DEV-PROFILE stacks no language adapter serves (§25). A checker that reads code read
 * none of theirs, so its clean result says nothing about them: report() names them as N/A.
 */
export function unadapted(profileText) {
  const out = [];
  for (const m of String(profileText ?? '').matchAll(/^\| `([\w-]+)` \| yes \|/gm)) {
    const key = m[1];
    if (!langOfStack(key) && !NON_CODE_STACKS.includes(key) && !['postgres', 'mysql'].includes(key)) out.push(key);
  }
  return out;
}

/** Print the findings (or JSON) and return the exit code: 1 on any error not in the baseline. */
export function report(name, findings, summary, { json = false, limit = 400, baseline, writeBaseline, root, profile } = {}) {
  const na = unadapted(profile);
  if (na.length) summary = { ...summary, 'N/A': `no adapter for ${na.join(', ')} — this check did not read that code (§25)` };
  const b = applyBaseline(findings, baseline, writeBaseline);
  const exit = findings.errors.length ? 1 : 0;
  logRun(root ?? findRoot().root, { script: name, exit, errors: findings.errors.length, warnings: findings.list.length - findings.errors.length, codes: findings.byCode() });
  if (baseline) summary = { ...summary, baseline: `${b.known} known, ${b.cleared} cleared` };
  if (json) {
    console.log(JSON.stringify({ script: name, summary, counts: findings.byCode(), findings: findings.list }, null, 2));
  } else {
    const shown = findings.list.slice(0, limit);
    for (const f of shown) console.log(`${f.level === 'error' ? 'ERROR' : 'warn '} ${f.code} ${f.file}${f.line ? `:${f.line}` : ''}  ${f.message}${f.baseline ? ' (baseline)' : ''}`);
    if (findings.list.length > shown.length) console.log(`… ${findings.list.length - shown.length} more (use --json)`);
    const counts = Object.entries(findings.byCode()).map(([k, v]) => `${k}×${v}`).join(' ');
    const facts = Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(' · ');
    console.log(`${name}: ${findings.errors.length} error(s), ${findings.list.length - findings.errors.length} warning(s)${counts ? ` — ${counts}` : ''}${facts ? `\n  ${facts}` : ''}`);
  }
  return exit;
}

/** --flag value / --flag=value / --bool; positional args in `_`. */
export function parseArgs(argv, booleans = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2));
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (booleans.includes(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

/** The `## Backend checks` keys of DEV-PROFILE (`- **Key:** \`value\``), lower-kebab keyed. */
export function profileChecks(text, heading = 'Backend checks') {
  const body = String(text ?? '').replace(/\r\n/g, '\n');
  const m = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = /^- \*\*([^*]+?):\*\*\s*`([^`]*)`/.exec(line);
    if (kv) out[kv[1].trim().toLowerCase().replace(/\s+/g, '-')] = kv[2];
  }
  return out;
}

/** DEV-PROFILE from --profile, or the usual places under `root`. */
export function loadProfile(root, given) {
  for (const p of [given, join(root, '.claude', 'DEV-PROFILE.md'), join(root, 'DEV-PROFILE.md')]) {
    if (p && existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      return { path: p, checks: profileChecks(text), defaults: profileChecks(text, 'Defaults'), text };
    }
  }
  return { path: null, checks: {}, defaults: {}, text: '' };
}

/** A configured value is usable unless it is empty or still a `<placeholder>`. */
export const configured = (v) => (v && !/^<.*>$/.test(v.trim()) ? v.trim() : null);

export const splitList = (v) => String(v ?? '').split(/\s*[,·]\s*/).map((s) => s.trim()).filter(Boolean);

/** Glob (`*`, `**`, `?`) → RegExp over posix paths. */
export function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Read every file under `root` that passes `pred`, as { rel, text }. */
export function readSources(root, pred, opts) {
  const abs = resolve(root);
  return walkSource(abs, pred, opts).map((f) => {
    let text = '';
    try { text = readFileSync(f, 'utf8'); } catch { /* unreadable */ }
    return { rel: toPosix(abs, f), text };
  });
}

/**
 * The backend code under `root`, tests excluded: what the problem, limit and observability checks
 * read. Which file is backend code is the language registry's answer (isServerFile), so a Next.js
 * project's `src/server/` and route handlers are read and its components are not.
 */
export function readServerSources(root, opts) {
  return readSources(root, (n) => CODE_EXT.test(n), opts).filter((f) => !isTestPath(f.rel) && isServerFile(f.rel, f.text));
}

// Which files are tests, and how a file's comments are written, is the language registry's answer.
export { isTestPath as isTestFile, commentStyle } from './langs.mjs';

/** 1-based line of offset `i` in `text`. */
export function lineAt(text, i) {
  let n = 1;
  for (let j = 0; j < i && j < text.length; j++) if (text.charCodeAt(j) === 10) n++;
  return n;
}

/** Replace comments with spaces (offsets kept) in Go/TS/JS (`//`, `/* *\/`) or Python (`#`). */
export function blankComments(text, lang = 'c') {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < n && text[j] !== q) { if (text[j] === '\\' && q !== '`') j++; if (q !== '`' && text[j] === '\n') break; j++; }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (lang === 'py' ? c === '#' : c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      out += ' '.repeat(j - i);
      i = j;
      continue;
    }
    if (lang !== 'py' && c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2);
      if (j < 0) j = n - 2;
      out += text.slice(i, j + 2).replace(/[^\n]/g, ' ');
      i = j + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * RegExp source of one static string literal: `"…"`, `'…'`, or a backtick string with no `${`.
 * A template literal with `${…}` is built at runtime and is not matched.
 */
export const STRING_LIT = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + '`' + String.raw`(?:[^` + '`' + String.raw`\\$]|\\.|\$(?!\{))*` + '`';

/** The value of a STRING_LIT match, or null when `s` is not one static literal. */
export function unquote(s) {
  const t = String(s ?? '').trim();
  return new RegExp(`^(?:${STRING_LIT})$`).test(t) ? t.slice(1, -1) : null;
}

/** Every `Name = "value"` string constant (Go `const`/`var` blocks, Python module constants, TS `const`). */
export function stringConsts(text) {
  const out = new Map();
  const re = new RegExp(String.raw`^\s*(?:export\s+)?(?:(?:const|var|let)\s+)?([A-Za-z_]\w*)(?:\s+string|\s*:\s*(?:str|string|Final\[str\]|Final))?\s*(?::?=|=)\s*(${STRING_LIT})`, 'gm');
  for (const m of text.matchAll(re)) out.set(m[1], unquote(m[2]));
  return out;
}

/** The innermost `{…}` or `(…)` that encloses offset `i` — the composite literal or call it is in. */
export function enclosing(text, i) {
  let depth = 0;
  let start = -1;
  for (let j = i; j >= 0; j--) {
    const c = text[j];
    if (c === '}' || c === ')') depth++;
    else if (c === '{' || c === '(') {
      if (depth === 0) { start = j; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  const close = text[start] === '{' ? '}' : ')';
  const open = text[start];
  depth = 0;
  for (let j = start; j < text.length; j++) {
    if (text[j] === open) depth++;
    else if (text[j] === close) { depth--; if (depth === 0) return { start, end: j + 1, text: text.slice(start, j + 1) }; }
  }
  return { start, end: text.length, text: text.slice(start) };
}

/** Go's net/http status constants. */
export const HTTP_STATUS = {
  StatusOK: 200, StatusCreated: 201, StatusAccepted: 202, StatusNoContent: 204,
  StatusMovedPermanently: 301, StatusFound: 302, StatusSeeOther: 303, StatusNotModified: 304,
  StatusBadRequest: 400, StatusUnauthorized: 401, StatusPaymentRequired: 402, StatusForbidden: 403,
  StatusNotFound: 404, StatusMethodNotAllowed: 405, StatusNotAcceptable: 406, StatusRequestTimeout: 408,
  StatusConflict: 409, StatusGone: 410, StatusLengthRequired: 411, StatusPreconditionFailed: 412,
  StatusRequestEntityTooLarge: 413, StatusRequestURITooLong: 414, StatusUnsupportedMediaType: 415,
  StatusRequestedRangeNotSatisfiable: 416, StatusExpectationFailed: 417, StatusTeapot: 418,
  StatusMisdirectedRequest: 421, StatusUnprocessableEntity: 422, StatusLocked: 423, StatusFailedDependency: 424,
  StatusTooEarly: 425, StatusUpgradeRequired: 426, StatusPreconditionRequired: 428, StatusTooManyRequests: 429,
  StatusRequestHeaderFieldsTooLarge: 431, StatusUnavailableForLegalReasons: 451,
  StatusInternalServerError: 500, StatusNotImplemented: 501, StatusBadGateway: 502, StatusServiceUnavailable: 503,
  StatusGatewayTimeout: 504,
};

/** A status expression → number, or null: `http.StatusConflict`, `HTTPStatus.CONFLICT`, `409`. */
export function statusValue(expr) {
  const e = String(expr ?? '').trim();
  if (/^\d{3}$/.test(e)) return Number(e);
  const go = /(?:^|\.)(Status[A-Za-z]+)$/.exec(e);
  if (go && HTTP_STATUS[go[1]]) return HTTP_STATUS[go[1]];
  const py = /HTTPStatus\.([A-Z_]+)/.exec(e) ?? /status\.HTTP_(\d{3})/.exec(e);
  if (py) {
    if (/^\d{3}$/.test(py[1])) return Number(py[1]);
    const name = 'Status' + py[1].toLowerCase().replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase());
    return HTTP_STATUS[name] ?? null;
  }
  return null;
}
