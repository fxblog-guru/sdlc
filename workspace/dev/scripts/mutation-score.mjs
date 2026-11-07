#!/usr/bin/env node
/**
 * mutation-score.mjs — the mutation score of each changed module, from a Stryker or gremlins report (DEV-CONTRACTS §13.10).
 *
 * Coverage says a line ran; a mutation score says a test would have noticed if it were wrong. The
 * G7 reviewer cannot mutate the repository (read-only), so G8 runs the tools and this script
 * reduces their reports to the modules the change touched, against DEV-PROFILE's threshold.
 *
 *   node dev/scripts/mutation-score.mjs --report <file> [--report <file>]… \
 *     (--base <merge base> [--repo <dir>] | --changed <file list>) [--threshold 60] [--prefix <dir>=<repo path>] [--json]
 *
 *   --report     Stryker `reports/mutation/mutation.json` (mutation-testing-report-schema) or a
 *                gremlins `--output` JSON; the format is detected. Repeatable: one per stack.
 *   --base       changed files = `git diff --name-only <base>...HEAD`; --changed reads them from a
 *                file instead (one path per line)
 *   --threshold  percent, per module (default 60)
 *   --prefix     rewrite report paths: gremlins reports paths inside the Go module, Stryker inside
 *                its project; `--prefix web=web` or `--prefix .=backend` maps them to repo paths
 *
 * A module is the directory of a source file (a Go package, a feature directory). Score =
 * (killed + timed out) / (killed + timed out + survived + no coverage), as both tools define it;
 * compile errors, ignored and not-viable mutants are left out. A changed module with no mutant in
 * any report is `NOT RUN`, never a pass.
 *
 * Exit 0 every changed module measured at or above the threshold · 1 one below, or not run ·
 * 2 usage error or an unreadable report.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { isTestFile, langOf } from './lib/langs.mjs';

const STRYKER = { Killed: 'killed', Timeout: 'killed', Survived: 'survived', NoCoverage: 'survived' };
const GREMLINS = { KILLED: 'killed', TIMED_OUT: 'killed', LIVED: 'survived', NOT_COVERED: 'survived' };
// The languages a supported mutation tool reports on (Stryker, Gremlins), plus the component formats
// Stryker mutates. A language joins when its adapter names a tool here.
const SOURCE = { test: (p) => (['go', 'typescript'].includes(langOf(p)?.id) || /\.(vue|svelte)$/.test(p)) };
const TEST = { test: (p) => isTestFile(p) || /(^|\/)__tests__\//.test(p) };

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/** `[{ file, killed, survived }]` from either tool's JSON. */
export function readReport(json, { prefixes = [] } = {}) {
  const map = (p) => {
    let f = norm(p);
    for (const [from, to] of prefixes) {
      const fr = norm(from).replace(/\/$/, '');
      if (fr === '.' || fr === '') { f = posix.join(to, f); break; }
      if (f === fr || f.startsWith(`${fr}/`)) { f = posix.join(to, f.slice(fr.length)); break; }
    }
    return norm(f);
  };
  const out = [];
  if (json && typeof json.files === 'object' && !Array.isArray(json.files) && json.schemaVersion !== undefined) {
    for (const [file, v] of Object.entries(json.files)) {
      const r = { file: map(file), killed: 0, survived: 0 };
      for (const m of v.mutants ?? []) {
        const k = STRYKER[m.status];
        if (k) r[k] += 1;
      }
      out.push(r);
    }
    return { tool: 'stryker', files: out };
  }
  if (json && Array.isArray(json.files) && ('test_efficacy' in json || 'go_module' in json)) {
    for (const f of json.files) {
      const r = { file: map(f.file_name), killed: 0, survived: 0 };
      for (const m of f.mutations ?? []) {
        const k = GREMLINS[m.status];
        if (k) r[k] += 1;
      }
      out.push(r);
    }
    return { tool: 'gremlins', files: out };
  }
  throw new Error('not a Stryker mutation.json (schemaVersion + files{}) or a gremlins report (go_module + files[])');
}

/** Per changed module: mutants, score, result. */
export function score(reports, changed, threshold = 60) {
  const modules = new Map();
  for (const f of changed.map(norm).filter((p) => SOURCE.test(p) && !TEST.test(p))) {
    const dir = posix.dirname(f);
    if (!modules.has(dir)) modules.set(dir, { module: dir, files: [], killed: 0, survived: 0, tools: new Set() });
    modules.get(dir).files.push(f);
  }
  for (const rep of reports) {
    for (const r of rep.files) {
      const m = modules.get(posix.dirname(r.file));
      if (!m) continue;
      m.killed += r.killed;
      m.survived += r.survived;
      if (r.killed + r.survived) m.tools.add(rep.tool);
    }
  }
  return [...modules.values()].sort((a, b) => a.module.localeCompare(b.module)).map((m) => {
    const total = m.killed + m.survived;
    const pct = total ? Math.round((m.killed / total) * 1000) / 10 : null;
    const result = pct === null ? 'NOT RUN' : pct >= threshold ? 'PASS' : 'FAIL';
    return { module: m.module, tools: [...m.tools], killed: m.killed, survived: m.survived, score: pct, threshold, result };
  });
}

export function format(rows) {
  const out = ['| Module | Tool | Killed | Survived | Score % | Threshold | Result |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.module} | ${r.tools.join(', ') || '—'} | ${r.killed} | ${r.survived} | ${r.score ?? '—'} | ${r.threshold} | ${r.result}${r.result === 'NOT RUN' ? ' — no mutant in any report' : ''} |`);
  const bad = rows.filter((r) => r.result !== 'PASS').length;
  out.push('', `mutation-score: ${rows.length} changed module(s) · ${bad} below threshold or not run`);
  return out.join('\n');
}

export function parseArgs(argv) {
  const o = { reports: [], base: null, repo: '.', changed: null, threshold: 60, prefixes: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') { o.json = true; continue; }
    const v = argv[i + 1];
    if (!['--report', '--base', '--repo', '--changed', '--threshold', '--prefix'].includes(a)) throw new Error(`unknown argument ${a}`);
    if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
    i += 1;
    if (a === '--report') o.reports.push(v);
    else if (a === '--threshold') {
      o.threshold = Number(v);
      if (!Number.isFinite(o.threshold) || o.threshold < 0 || o.threshold > 100) throw new Error('--threshold is a percentage');
    } else if (a === '--prefix') {
      const k = v.indexOf('=');
      if (k < 0) throw new Error('--prefix is <report dir>=<repo path>');
      o.prefixes.push([v.slice(0, k), v.slice(k + 1)]);
    } else o[a.slice(2)] = v;
  }
  if (!o.reports.length) throw new Error('give at least one --report');
  if (!o.base === !o.changed) throw new Error('give exactly one of --base <ref> or --changed <file>');
  return o;
}

function main(argv) {
  let o;
  let reports;
  let changed;
  try {
    o = parseArgs(argv);
    reports = o.reports.map((p) => readReport(JSON.parse(readFileSync(p, 'utf8')), { prefixes: o.prefixes }));
    changed = (o.changed ? readFileSync(o.changed, 'utf8') : execFileSync('git', ['-C', o.repo, 'diff', '--name-only', `${o.base}...HEAD`], { encoding: 'utf8' })).split(/\r?\n/).filter(Boolean);
  } catch (err) {
    console.error(`mutation-score: ${err.message.split('\n')[0]}\nusage: mutation-score.mjs --report <file>… (--base <ref> | --changed <file>) [--threshold 60] [--prefix a=b]`);
    return 2;
  }
  const rows = score(reports, changed, o.threshold);
  console.log(o.json ? JSON.stringify(rows, null, 2) : format(rows));
  return rows.some((r) => r.result !== 'PASS') ? 1 : 0;
}

if (process.argv[1]?.endsWith('mutation-score.mjs')) process.exitCode = main(process.argv.slice(2));
