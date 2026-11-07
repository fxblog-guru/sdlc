#!/usr/bin/env node
/**
 * migrate-ledger-inputs.mjs — rewrite gate logs' whole-ledger inputs to the rows each log relied on
 * (DEV-CONTRACTS §5.2).
 *
 *   node dev/scripts/migrate-ledger-inputs.mjs [--root dev] [--write]
 *
 * For every gate log whose `inputs:` lists `dev/decisions/<slug>.md` with no `#`, the reviewed
 * version of the ledger is found in git history by the recorded hash. The relied-on rows are the
 * DEC ids the log's body cites plus the rows whose `Blocks` names the log's gate, as they stood in
 * that version. The input becomes `dev/decisions/<slug>.md#DEC-…` with the hash of those rows **in
 * the reviewed version** — so a gate that was stale against its rows stays stale, and a gate that
 * was stale only because an unrelated row was added stops being so.
 *
 * Dry run by default: prints what it would change. `--write` edits the front matter, and only the
 * `path` and `sha256` of that one input: never a verdict, a finding or the body. A log whose
 * reviewed ledger cannot be found, or which relies on no row, is left alone and reported.
 *
 * Exit 0 when every whole-ledger input was migrated (or would be) · 1 when some were left alone ·
 * 2 on a usage error or a git failure.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { decisionRowsHash, parseDoc, reliedOnRows, splitRef } from './lib/doc.mjs';
import { findVersion, inGitRepo } from './lib/history.mjs';
import { rootFromArgv, stripRoot } from './lib/root.mjs';

const LEDGER = /(^|\/)decisions\/[^/]+\.md$/;

/**
 * Plan the migration of one log's text. Pure apart from `findReviewed(ledgerAbs, recorded)`.
 * @returns {{ text: string, changes: Array<{ from: string, to: string, sha256: string }>, skipped: Array<{ path: string, reason: string }> }}
 */
export function migrateLog(text, { root, findReviewed }) {
  const doc = parseDoc(text);
  const gate = String(doc.frontMatter.gate ?? '');
  const inputs = Array.isArray(doc.frontMatter.inputs) ? doc.frontMatter.inputs : [];
  const changes = [];
  const skipped = [];
  let out = text;

  for (const ref of inputs) {
    const { file, ids } = splitRef(ref?.path ?? '');
    if (ids || !LEDGER.test(file)) continue;
    const abs = join(root, stripRoot(file));
    if (!existsSync(abs)) { skipped.push({ path: ref.path, reason: 'the ledger is not on disk' }); continue; }
    const reviewed = findReviewed(abs, String(ref.sha256 ?? ''));
    if (!reviewed) { skipped.push({ path: ref.path, reason: 'no committed ledger hashes to the recorded sha256' }); continue; }
    const rows = reliedOnRows(reviewed.text, doc.body, gate);
    if (!rows.length) { skipped.push({ path: ref.path, reason: 'the log relies on no ledger row' }); continue; }
    const to = `${file}#${rows.join(',')}`;
    const sha256 = decisionRowsHash(reviewed.text, rows);

    // Only the first `- path: <ledger>` entry whose next line is its sha256, inside the front matter.
    const end = out.search(/\r?\n---\r?\n/);
    const head = out.slice(0, end);
    const entry = new RegExp(`(- path: )${escape(ref.path)}(\\r?\\n\\s+sha256: )${escape(String(ref.sha256))}(?=\\r?\\n)`);
    if (!entry.test(head)) { skipped.push({ path: ref.path, reason: 'the input is not in the `- path:` / `sha256:` shape' }); continue; }
    out = head.replace(entry, `$1${to}$2${sha256}`) + out.slice(end);
    changes.push({ from: ref.path, to, sha256 });
  }
  return { text: out, changes, skipped };
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function gateLogs(root) {
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return [];
  const out = [];
  for (const dir of readdirSync(reviews).sort()) {
    if (!statSync(join(reviews, dir)).isDirectory()) continue;
    for (const f of readdirSync(join(reviews, dir)).filter((x) => x.endsWith('.md')).sort()) out.push(join(reviews, dir, f));
  }
  return out;
}

function main(argv) {
  const at = argv.indexOf('--root');
  const root = rootFromArgv(argv);
  const write = argv.includes('--write');
  if (!existsSync(root)) {
    console.error(`migrate-ledger-inputs: no SDLC root at ${root}. Pass --root <path>.`);
    process.exit(2);
  }
  if (!inGitRepo(root)) {
    console.error('migrate-ledger-inputs: not a git repository — the reviewed ledger can only be found in history (§4.4).');
    process.exit(2);
  }

  const cache = new Map();
  const findReviewed = (abs, recorded) => {
    const key = `${abs}|${recorded}`;
    if (!cache.has(key)) cache.set(key, findVersion(abs, recorded, (t) => parseDoc(t).bodyHash));
    return cache.get(key);
  };

  let migrated = 0;
  let left = 0;
  for (const path of gateLogs(root)) {
    const rel = path.slice(dirname(root).length + 1).split('\\').join('/');
    let plan;
    try {
      plan = migrateLog(readFileSync(path, 'utf8'), { root, findReviewed });
    } catch (err) {
      console.error(`migrate-ledger-inputs: ${rel}: ${err.message.split(/\r?\n/)[0]}`);
      process.exit(2);
    }
    for (const c of plan.changes) console.log(`${write ? 'migrated' : 'would migrate'}  ${rel}\n    ${c.from} -> ${c.to}`);
    for (const s of plan.skipped) console.log(`left alone  ${rel}\n    ${s.path}: ${s.reason}`);
    if (write && plan.changes.length) writeFileSync(path, plan.text);
    migrated += plan.changes.length;
    left += plan.skipped.length;
  }
  console.log(`\n${migrated} input(s) ${write ? 'migrated' : 'to migrate'}, ${left} left alone${write || !migrated ? '' : ' — re-run with --write to apply'}`);
  process.exit(left ? 1 : 0);
}

if (process.argv[1]?.endsWith('migrate-ledger-inputs.mjs')) main(process.argv.slice(2));
