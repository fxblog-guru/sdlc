#!/usr/bin/env node
/**
 * trace.mjs — which acceptance criteria and behaviour rows does a test actually name (DEV-CONTRACTS §6, §13.10).
 *
 * release-management's QC pass found six behaviour bugs after G8, every one of them written in its
 * ui-spec, and its G7 had passed. Nothing joined a spec row to a test, so "every task has a test"
 * was true while the rows that mattered had none. This joins them by id: an AC or UB id is traced
 * when a test file names it (in a test title or a comment beside the test).
 *
 *   node dev/scripts/trace.mjs <slug> [--root dev] [--src <dir>]… [--check] [--json]
 *
 *   --root   the dev root (default dev)
 *   --src    a directory to search (repeatable; default: the dev root's parent). The dev root,
 *            node_modules, build output and .claude/ are never searched.
 *   --check  exit 1 when a required id is untraced
 *   --json   print the report as JSON
 *
 * Required: every AC of tier `unit` or `integration` in requirements/<slug>/acceptance-criteria.md
 * (`## Criteria`, `## Negative and edge cases`), and every UB-NNN row of ui/<slug>/ui-spec.md.
 * An `automation` or `manual` AC is the QA bundle's (§9): listed, never required.
 * Test files: Go `*_test.go`; TS/JS `*.test.*`, `*.spec.*`, `__tests__/`; Python `test_*.py`, `*_test.py`.
 * An id that appears only in non-test code is untraced, and the report names where it does appear.
 *
 * Exit 0 traced (or no --check) · 1 untraced ids with --check · 2 usage error or nothing to trace.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { readDoc, readTable, plain } from './lib/doc.mjs';
import { behaviourRows } from './lib/behaviour.mjs';
import { isTestFile, walkCode } from './lib/code.mjs';
import { findRoot } from './lib/root.mjs';

const AC_TABLES = ['Criteria', 'Negative and edge cases'];
const DEV_TIERS = ['unit', 'integration'];
/** An id by word boundary: AC-001 never matches inside AC-0012 or XAC-001. */
const ID_SCAN = /(?<![A-Za-z0-9-])((?:AC|UB)-\d{3,})(?![0-9])/g;

/** The ids to trace for a slug: `{ id, kind, tier, required }`. */
export function readIds(devRoot, slug) {
  const ids = [];
  const acPath = join(devRoot, 'requirements', slug, 'acceptance-criteria.md');
  if (existsSync(acPath)) {
    const body = readDoc(acPath).body;
    for (const table of AC_TABLES) {
      for (const row of readTable(body, table)) {
        const id = plain(row.id);
        if (!/^AC-\d{3,}$/.test(id)) continue;
        const tier = plain(row.tier).toLowerCase();
        ids.push({ id, kind: 'AC', tier, required: DEV_TIERS.some((t) => tier.split(/[^a-z]+/).includes(t)) });
      }
    }
  }
  const specPath = join(devRoot, 'ui', slug, 'ui-spec.md');
  if (existsSync(specPath)) {
    for (const row of behaviourRows(readDoc(specPath).body)) ids.push({ id: row.id, kind: 'UB', tier: 'behaviour', required: true });
  }
  return { ids, sources: [acPath, specPath].filter(existsSync) };
}

/** Where each id is named: `Map<id, { tests: [rel], code: [rel] }>`. */
export function scanCode(roots, { exclude = [], base = roots[0] } = {}) {
  const hits = new Map();
  for (const f of walkCode(roots, { base, exclude })) {
    let text;
    try { text = readFileSync(f.abs, 'utf8'); } catch { continue; }
    const kind = isTestFile(f.rel) ? 'tests' : 'code';
    for (const id of new Set([...text.matchAll(ID_SCAN)].map((m) => m[1]))) {
      if (!hits.has(id)) hits.set(id, { tests: [], code: [] });
      hits.get(id)[kind].push(f.rel);
    }
  }
  return hits;
}

/** The report: every id with its status — `traced`, `untraced`, `code-only`, or `qa` (not required). */
export function trace({ devRoot, slug, srcRoots }) {
  const { ids, sources } = readIds(devRoot, slug);
  const base = srcRoots[0];
  const devRel = relative(base, resolve(devRoot));
  const hits = scanCode(srcRoots, { base, exclude: devRel && !devRel.startsWith('..') ? [devRel] : [] });
  const rows = ids.map((x) => {
    const h = hits.get(x.id) ?? { tests: [], code: [] };
    let status = 'traced';
    if (!h.tests.length) status = h.code.length ? 'code-only' : 'untraced';
    if (!x.required && status !== 'traced') status = 'qa';
    return { ...x, status, tests: h.tests, code: h.code };
  });
  const required = rows.filter((r) => r.required);
  const gaps = required.filter((r) => r.status !== 'traced');
  return {
    slug,
    sources,
    rows,
    counts: { required: required.length, traced: required.length - gaps.length, untraced: gaps.filter((r) => r.status === 'untraced').length, codeOnly: gaps.filter((r) => r.status === 'code-only').length, qa: rows.filter((r) => !r.required).length },
    gaps,
  };
}

export function format(report) {
  const out = [];
  for (const r of report.gaps) {
    out.push(r.status === 'code-only'
      ? `UNTRACED ${r.id} (${r.tier}) — named only in non-test code: ${r.code.slice(0, 3).join(', ')}; name it in the test that proves it`
      : `UNTRACED ${r.id} (${r.tier}) — no test names it`);
  }
  const c = report.counts;
  out.push(`trace ${report.slug}: ${c.traced}/${c.required} traced · ${c.untraced} untraced · ${c.codeOnly} only in non-test code · ${c.qa} automation/manual (QA's, not required)`);
  return out.join('\n');
}

export function parseArgs(argv) {
  const o = { slug: null, root: null, src: [], check: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') o.check = true;
    else if (a === '--json') o.json = true;
    else if (a === '--root' || a === '--src') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--root') o.root = v; else o.src.push(v);
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!o.slug) o.slug = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!o.slug) throw new Error('give the slug');
  o.root = findRoot({ explicit: o.root }).root;
  if (!o.src.length) o.src.push(dirname(resolve(o.root)));
  return o;
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (err) {
    console.error(`trace: ${err.message}\nusage: trace.mjs <slug> [--root dev] [--src <dir>]… [--check] [--json]`);
    return 2;
  }
  const report = trace({ devRoot: resolve(o.root), slug: o.slug, srcRoots: o.src.map((s) => resolve(s)) });
  if (!report.rows.length) {
    console.error(`trace: no AC or UB ids for \`${o.slug}\` under ${o.root} — nothing to trace`);
    return 2;
  }
  console.log(o.json ? JSON.stringify(report, null, 2) : format(report));
  return o.check && report.gaps.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('trace.mjs')) process.exitCode = main(process.argv.slice(2));
