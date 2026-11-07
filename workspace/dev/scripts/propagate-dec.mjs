#!/usr/bin/env node
/**
 * propagate-dec.mjs — after a DEC is answered, which artifacts still say something else
 * (DEV-CONTRACTS §3.2)?
 *
 *   node dev/scripts/propagate-dec.mjs <slug> [--root dev] [--check] [--json]
 *
 * For each answered DEC with a key token, every artifact of the slug that cites the DEC is one of:
 *   missing  — an OWNING artifact (the stage of a gate the row's Blocks names; a task → plan/) that
 *              cites the DEC and lacks the token: the answer never reached the document it decides.
 *   cites    — another artifact citing the id without the value: correct under the single-source rule.
 *   restates — another artifact carrying the value as well: a second copy that will go stale.
 *
 * The key token is `Key: <token>` in the Answer cell, else its first code span, else its first
 * number with the word after it ("10 attempts"); the attribution after " — " is ignored. An answer
 * with none is listed with key null, never judged. The token is matched, not understood: this is a
 * shape check (§11), and the reviewer decides what a `restates` row means.
 *
 * Exit 0; with --check, 1 when any owning artifact is missing an answer; 2 on a usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { parseDoc, plain, readTable } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';

const STAGE_OF_GATE = { G0: 'intake', G1: 'requirements', G2: 'design', G3: 'data', G4: 'api', G5: 'ui', G6: 'plan', G7: 'implementation', G8: 'verification', G9: 'release', G10: 'deployment', G11: 'monitoring' };
const SKIP = new Set(['decisions', 'reviews', '_templates', 'scripts', 'ci', 'docs', 'knowledge']);
const TEXT = /\.(md|ya?ml|proto)$/;

export function keyToken(answer) {
  const text = String(answer ?? '').split(/\s+[—–]\s+/)[0].trim();
  if (!text || /^[—–-]$/.test(text)) return null;
  const key = /\bKey:\s*([^\s.,;]+(?:\.[^\s.,;]+)*)/i.exec(text)?.[1];
  if (key) return key;
  const code = /`([^`]+)`/.exec(text)?.[1];
  if (code) return code.trim();
  const num = /(?<![\w-])(\d[\d,.]*)(?:\s?(%|[A-Za-z]+))?/.exec(text);
  return num ? `${num[1]}${num[2] ? (num[2] === '%' ? '%' : ` ${num[2]}`) : ''}` : null;
}

function owners(blocks) {
  const stages = new Set();
  for (const g of String(blocks).match(/\bG\d{1,2}\b/g) ?? []) if (STAGE_OF_GATE[g]) stages.add(STAGE_OF_GATE[g]);
  if (/\bTASK-\d{3,}/.test(blocks)) stages.add('plan');
  return stages;
}

function artifacts(root, slug) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (TEXT.test(name)) out.push(abs);
    }
  };
  for (const stage of readdirSync(root)) {
    if (SKIP.has(stage) || !statSync(join(root, stage)).isDirectory()) continue;
    for (const sub of [slug, ...(stage === 'design' ? ['adr'] : [])]) {
      if (existsSync(join(root, stage, sub))) walk(join(root, stage, sub));
    }
  }
  return out.map((abs) => ({ rel: abs.slice(root.length + 1).split(sep).join('/'), text: readFileSync(abs, 'utf8') }));
}

const squash = (t) => t.toLowerCase().replace(/[`*]/g, '').replace(/\s+/g, ' ');

export function propagate(root, slug) {
  const ledger = join(root, 'decisions', `${slug}.md`);
  if (!existsSync(ledger)) return [];
  const files = artifacts(root, slug);
  const report = [];
  for (const row of readTable(parseDoc(readFileSync(ledger, 'utf8')).body, 'Decisions')) {
    if (plain(row.status).toLowerCase() !== 'answered') continue;
    const id = plain(row.id);
    const key = keyToken(row.answer);
    const own = owners(row.blocks ?? '');
    const entry = { id, key, owners: [...own], missing: [], cites: [], restates: [] };
    if (key) {
      const cite = new RegExp(`\\b${id}\\b`);
      for (const f of files) {
        if (!cite.test(f.text)) continue;
        const has = squash(f.text).includes(squash(key));
        const owning = own.has(f.rel.split('/')[0]);
        if (owning && !has) entry.missing.push(f.rel);
        else if (!owning) (has ? entry.restates : entry.cites).push(f.rel);
      }
    }
    report.push(entry);
  }
  return report;
}

function main(argv) {
  const slug = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--root');
  if (!slug) {
    console.error('usage: propagate-dec.mjs <slug> [--root dev] [--check] [--json]');
    process.exit(2);
  }
  const r = argv.indexOf('--root');
  const root = rootFromArgv(argv);
  const report = propagate(root, slug);
  const missing = report.filter((e) => e.missing.length);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const e of report) {
      if (!e.key) { console.log(`${e.id}  no key token in the answer — add \`Key: <token>\` to check it`); continue; }
      if (!e.missing.length && !e.restates.length) continue;
      console.log(`${e.id}  key \`${e.key}\`  owners: ${e.owners.join(', ') || '—'}`);
      for (const f of e.missing) console.log(`  missing   ${f}`);
      for (const f of e.restates) console.log(`  restates  ${f}`);
    }
    const restated = report.reduce((n, e) => n + e.restates.length, 0);
    console.log(`\n${report.length} answered · ${report.filter((e) => !e.key).length} without a key token · ${missing.length} missing in an owner · ${restated} restatement(s)`);
  }
  process.exit(argv.includes('--check') && missing.length ? 1 : 0);
}

if (process.argv[1]?.endsWith('propagate-dec.mjs')) main(process.argv.slice(2));
