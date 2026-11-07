#!/usr/bin/env node
/**
 * conventions-check.mjs — the mechanical half of `knowledge/conventions.md` (DEV-CONTRACTS §13.2,
 * §13.11): the half a reviewer gets wrong by sampling.
 *
 *   E117  an sqlc query name (`-- name: X :one`) whose verb is outside the vocabulary
 *         (Get List Create Update Delete Exists Count, plus DEV-PROFILE `Query verbs`)
 *   E118  an env key without the app prefix (DEV-PROFILE `Env prefix`), an `.env.example` key the
 *         config never reads, or a read key `.env.example` lacks
 *   W109  a test helper (an unexported func in a `_test.go`, or in a `*test` package) defined in
 *         more packages than the threshold (DEV-PROFILE `Helper threshold`, default 2), outside
 *         the testkit package
 *   W110  one SQL query body copied into several `queries.sql`
 *
 *   node dev/scripts/conventions-check.mjs [--source .] [--prefix APP_] [--env-example .env.example]
 *        [--config <glob,glob>] [--helper-threshold N] [--profile <DEV-PROFILE.md>] [--json]
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, report, parseArgs, loadProfile, configured, splitList, globRe, readSources, isTestFile, lineAt, blankComments, commentStyle } from './lib/check.mjs';
import { SERVER_EXT, langOf } from './lib/langs.mjs';

export const VOCABULARY = ['Get', 'List', 'Create', 'Update', 'Delete', 'Exists', 'Count'];
export const ALWAYS_SET = new Set(['PATH', 'HOME', 'TZ', 'LANG', 'PORT', 'CI', 'NODE_ENV', 'GOFLAGS', 'TMPDIR', 'USER']);

/** sqlc query names → { name, verb, rel, line, body }. */
export function sqlcQueries(files) {
  const out = [];
  for (const f of files) {
    const re = /^--\s*name:\s*(\w+)\s+:(\w+)[^\n]*\n([\s\S]*?)(?=^--\s*name:|(?![\s\S]))/gm;
    for (const m of f.text.matchAll(re)) {
      const body = m[3].replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      out.push({ name: m[1], verb: /^[A-Z][a-z]*/.exec(m[1])?.[0] ?? m[1], rel: f.rel, line: lineAt(f.text, m.index), body });
    }
  }
  return out;
}

/** Test helpers: unexported top-level funcs in `_test.go`, or any func in a `*test` package. */
export function testHelpers(files, testkit = 'testkit') {
  const out = [];
  for (const f of files) {
    if (!f.rel.endsWith('.go')) continue;
    const dir = dirname(f.rel);
    const pkgDir = basename(dir);
    const isTest = f.rel.endsWith('_test.go');
    const isTestPkg = /test$/.test(pkgDir) && pkgDir !== testkit;
    if (!isTest && !isTestPkg) continue;
    if (dir.split('/').includes(testkit)) continue;
    const code = blankComments(f.text);
    for (const m of code.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\(/gm)) {
      const name = m[1];
      if (/^(Test|Benchmark|Fuzz|Example)[A-Z_]?/.test(name) || name === 'TestMain' || name === 'init') continue;
      if (isTest && /^[A-Z]/.test(name)) continue; // exported from a _test.go is unusual and package-local anyway
      out.push({ name, pkg: dir, rel: f.rel, line: lineAt(code, m.index) });
    }
  }
  return out;
}

/** Keys an `.env.example` declares (commented `# KEY=` examples included). */
export function envExampleKeys(text) {
  const out = new Map();
  text.split(/\r?\n/).forEach((l, i) => {
    const m = /^\s*(?:#\s*)?(?:export\s+)?([A-Z][A-Z0-9_]*)=/.exec(l);
    if (m && !out.has(m[1])) out.set(m[1], i + 1);
  });
  return out;
}

/** Keys the code reads: Getenv/LookupEnv/os.environ/process.env and get("KEY") in config files. */
export function readKeys(files, configRes) {
  const out = new Map();
  const add = (k, rel, line) => { if (!out.has(k)) out.set(k, { rel, line }); };
  for (const f of files) {
    const code = blankComments(f.text, commentStyle(f.rel));
    const generic = /(?:Getenv|LookupEnv|os\.environ\.get|os\.environ\[|os\.getenv|process\.env\[?)\(?\s*\.?["'`]?([A-Z][A-Z0-9_]{1,})["'`]?/g;
    for (const m of code.matchAll(generic)) add(m[1], f.rel, lineAt(code, m.index));
    for (const m of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) add(m[1], f.rel, lineAt(code, m.index));
    if (configRes.some((re) => re.test(f.rel))) {
      for (const m of code.matchAll(/"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3,})"/g)) add(m[1], f.rel, lineAt(code, m.index));
    }
  }
  return out;
}

export function check({ code, sql, tests, envExample, prefix, configRes, vocabulary = VOCABULARY, threshold = 2, envFile = '.env.example', testkit = 'testkit' }, findings = new Findings()) {
  const queries = sqlcQueries(sql);
  let off = 0;
  for (const q of queries) {
    if (!vocabulary.includes(q.verb)) { off++; findings.add('E117', q.rel, q.line, `sqlc query \`${q.name}\`: \`${q.verb}\` is outside the vocabulary (${vocabulary.join(', ')})`); }
  }
  const bodies = new Map();
  for (const q of queries) bodies.set(q.body, (bodies.get(q.body) ?? []).concat(q));
  let copied = 0;
  for (const list of bodies.values()) {
    const files = [...new Set(list.map((q) => q.rel))];
    if (files.length > 1) { copied++; findings.add('W110', list[1].rel, list[1].line, `\`${list[0].name}\` is copied into ${files.length} queries.sql (${files.join(', ')}) — move it to the shared lookups file`); }
  }

  const helpers = testHelpers(tests, testkit);
  const byName = new Map();
  for (const h of helpers) byName.set(h.name, (byName.get(h.name) ?? new Map()).set(h.pkg, h));
  let dupHelpers = 0;
  for (const [name, pkgs] of byName) {
    if (pkgs.size > threshold) {
      dupHelpers++;
      const first = [...pkgs.values()][0];
      findings.add('W109', first.rel, first.line, `test helper \`${name}\` is defined in ${pkgs.size} packages — move it to ${testkit}`);
    }
  }

  const summary = {
    'sqlc queries': queries.length,
    'outside the vocabulary': off,
    'query verbs in use': new Set(queries.map((q) => q.verb)).size,
    'queries copied across files': copied,
    'test helpers': helpers.length,
    'helpers in more than threshold packages': dupHelpers,
  };

  if (envExample != null) {
    const declared = envExampleKeys(envExample);
    const read = readKeys(code, configRes);
    let noPrefix = 0;
    if (prefix) {
      for (const [k, line] of declared) if (!k.startsWith(prefix) && !/^OTEL_/.test(k)) { noPrefix++; findings.add('E118', envFile, line, `\`${k}\` has no \`${prefix}\` prefix`); }
    }
    let unread = 0;
    // OTEL_* keys are read by the OpenTelemetry SDK itself, not by the app's config.
    for (const [k, line] of declared) if (!read.has(k) && !/^OTEL_/.test(k)) { unread++; findings.add('E118', envFile, line, `\`${k}\` is in ${envFile} and no config reads it`); }
    let undeclared = 0;
    for (const [k, at] of read) {
      if (declared.has(k) || ALWAYS_SET.has(k) || /^OTEL_/.test(k)) continue;
      if (/(^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(at.rel)) continue; // build tooling (vite, vitest), not the app
      if (prefix && !k.startsWith(prefix)) continue; // a test or tool variable, not the app's
      undeclared++; findings.add('E118', at.rel, at.line, `\`${k}\` is read and not in ${envFile}`);
    }
    Object.assign(summary, { 'env keys declared': declared.size, 'env keys without prefix': noPrefix, 'declared, never read': unread, 'read, not declared': undeclared });
  }
  return { findings, summary };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const source = resolve(a.source ?? '.');
  const profile = loadProfile(source, a.profile);
  const prefix = a.prefix ?? configured(profile.checks['env-prefix']);
  const vocabulary = [...VOCABULARY, ...splitList(configured(profile.checks['query-verbs']))];
  const threshold = Number(a['helper-threshold'] ?? configured(profile.checks['helper-threshold']) ?? 2);
  const testkit = configured(profile.checks.testkit) ?? 'testkit';
  const configRes = splitList(a.config ?? configured(profile.checks['config-files']) ?? '**/config/*.go, **/config.py, **/settings.py, **/config.ts').map(globRe);
  const envPath = resolve(source, a['env-example'] ?? '.env.example');

  // Every server language, plus plain TS/JS modules (config is read there, not in .tsx components).
  const sourceFiles = readSources(source, (n) => SERVER_EXT.test(n) || /\.(ts|js|mjs)$/.test(n));
  const code = sourceFiles.filter((f) => !isTestFile(f.rel));
  const tests = sourceFiles.filter((f) => langOf(f.rel)?.id === 'go'); // W109 reads Go test helpers only
  const sql = readSources(source, (n) => /^(queries|lookups)\.sql$|\.queries\.sql$/.test(n));
  const envExample = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
  const { findings, summary } = check({ code, sql, tests, envExample, prefix, configRes, vocabulary, threshold, envFile: basename(envPath), testkit });
  if (!prefix) summary['env prefix'] = 'not configured (DEV-PROFILE Env prefix)';
  return report('conventions-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'], profile: profile.text });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
