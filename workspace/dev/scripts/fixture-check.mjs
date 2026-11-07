#!/usr/bin/env node
/**
 * fixture-check.mjs — every fixture and pilot data file validates against the contract schema it
 * claims to be, before G4 passes (DEV-CONTRACTS §13.1).
 *
 * The contract and the data written for it are authored apart, and nothing joins them until a test
 * or a pilot loads the data. On Recall the contract rejected 85 of 270 pilot lines at G8; each was
 * a field renamed or tightened at G4 after the pilot file was written. The join is a list in the
 * contract itself, so it is reviewed with it:
 *
 *   info:
 *     x-fixtures:
 *       - path: testdata/pilot/cards.jsonl      # repository-relative; .json, .jsonl or .ndjson
 *         schema: KnowledgeCard                 # a name under components.schemas
 *         mode: request                         # request (default) or response: readOnly/writeOnly
 *
 *   node dev/scripts/fixture-check.mjs <slug> [--root dev] [--openapi <path>] [--json]
 *
 * A .json file holding an array is one record per element; any other .json is one record.
 *
 *   E160 a listed fixture is missing, unreadable, or names a schema the contract does not have
 *   E161 a record that does not validate against its schema (each file reports its first 5)
 *   W160 the contract lists no x-fixtures while the repository has files under a testdata/ or
 *        fixtures/ directory: nothing proves they match
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml.mjs';
import { Findings, parseArgs, report } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';
import { validate } from './api-contract-check.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PER_FILE = 5;
const DATA_DIR = /(^|\/)(testdata|fixtures|pilot)(\/|$)/;
const DATA_EXT = /\.(jsonl|ndjson|json)$/;

/** The records of a data file, as `{ value, line }`, or a thrown Error naming the bad line. */
export function readRecords(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  if (/\.json$/.test(path)) {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.map((value, i) => ({ value, line: `[${i}]` })) : [{ value: v, line: '' }];
  }
  const out = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    try {
      out.push({ value: JSON.parse(l), line: i + 1 });
    } catch (e) {
      out.push({ error: `not JSON: ${e.message}`, line: i + 1 });
    }
  });
  return out;
}

export function checkFixtures(doc, repo, findings = new Findings()) {
  const list = Array.isArray(doc?.info?.['x-fixtures']) ? doc.info['x-fixtures'] : [];
  const schemas = isObj(doc?.components?.schemas) ? doc.components.schemas : {};
  const summary = { fixtures: list.length, records: 0, valid: 0 };
  for (const f of list) {
    const where = String(f?.path ?? '(no path)');
    if (!f?.path || !f?.schema) { findings.add('E160', where, 0, 'an x-fixtures entry needs both `path` and `schema`'); continue; }
    if (!(f.schema in schemas)) { findings.add('E160', where, 0, `schema \`${f.schema}\` is not under components.schemas`); continue; }
    const full = resolve(repo, f.path);
    if (!existsSync(full)) { findings.add('E160', where, 0, 'listed in x-fixtures and not on disk'); continue; }
    let records;
    try { records = readRecords(full); } catch (e) { findings.add('E160', where, 0, `cannot read: ${e.message}`); continue; }
    const mode = f.mode === 'response' ? 'response' : 'request';
    let bad = 0;
    for (const r of records) {
      summary.records++;
      const errs = r.error ? [r.error] : validate(doc, { $ref: `#/components/schemas/${f.schema}` }, r.value, { mode });
      if (!errs.length) { summary.valid++; continue; }
      bad++;
      if (bad <= PER_FILE) findings.add('E161', where, typeof r.line === 'number' ? r.line : 0, `${r.line && typeof r.line !== 'number' ? `${r.line} ` : ''}does not validate as \`${f.schema}\`: ${errs.slice(0, 3).join('; ')}`);
    }
    if (bad > PER_FILE) findings.add('E161', where, 0, `… and ${bad - PER_FILE} more record(s) that do not validate as \`${f.schema}\``);
  }
  if (!list.length) {
    const found = dataFiles(repo);
    if (found.length) findings.add('W160', 'info.x-fixtures', 0, `no fixtures are listed, and ${found.length} data file(s) exist (${found.slice(0, 3).join(', ')}${found.length > 3 ? ', …' : ''}) — list each with the schema it claims`);
  }
  return { findings, summary };
}

/** Data files under a testdata/, fixtures/ or pilot/ directory; node_modules, .git and the roots skipped. */
function dataFiles(repo, dir = repo, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.sdlc', 'dev', '.claude', 'vendor'].includes(name) && dir === repo) continue;
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    const rel = relative(repo, full).replace(/\\/g, '/');
    if (st.isDirectory()) dataFiles(repo, full, out);
    else if (DATA_EXT.test(name) && DATA_DIR.test(rel)) out.push(rel);
  }
  return out;
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const path = a.openapi ?? (slug ? join(root, 'api', slug, 'openapi.yaml') : null);
  if (!path) { console.error('usage: fixture-check.mjs <slug> [--root dev] [--openapi <path>] [--json]'); return 2; }
  if (!existsSync(path)) { console.error(`no contract at ${path}`); return 2; }
  let doc;
  const text = readFileSync(path, 'utf8');
  try { doc = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch (e) { console.error(`${path}: ${e.message}`); return 2; }
  const { findings, summary } = checkFixtures(doc, a.repo ? resolve(a.repo) : dirname(root));
  return report('fixture-check', findings, summary, { json: a.json, root });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
