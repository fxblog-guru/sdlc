#!/usr/bin/env node
/**
 * trace-upsert.mjs — set one cell of one row in requirements.md `## Traceability` (DEV-CONTRACTS §6).
 *
 *   node <root>/scripts/trace-upsert.mjs <slug> <REQ-NNN> --tasks "TASK-004, TASK-005" [--tests "<paths>"] [--status implemented] [--root <dir>]
 *
 * G6 and G7 each add a column to rows they did not write. Reading the whole requirements file to
 * edit one cell costs the agent the file every time, and a hand edit is how a row loses a cell
 * (E032). This rewrites only the named row; a REQ with no row gets one appended. Other text is
 * byte-for-byte unchanged.
 *
 * Exit 0 written · 1 no `## Traceability` table · 2 usage.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootFromArgv } from './lib/root.mjs';
import { splitCells } from './lib/doc.mjs';

const COLUMNS = { '--criteria': 1, '--tasks': 2, '--tests': 3, '--status': 4 };

export function upsert(text, req, set) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Traceability');
  if (start === -1) return null;
  let header = -1;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
    if (header === -1 && lines[i].startsWith('|')) header = i;
  }
  if (header === -1) return null;
  let last = header + 1;
  for (let i = header + 2; i < end && lines[i].startsWith('|'); i++) {
    last = i;
    const cells = splitCells(lines[i]);
    if (cells[0].trim() !== req) continue;
    for (const [col, value] of Object.entries(set)) cells[col] = value;
    lines[i] = `| ${cells.map((c) => c.trim()).join(' | ')} |`;
    return lines.join('\n');
  }
  const width = splitCells(lines[header]).length;
  const cells = Array.from({ length: width }, (_, k) => (k === 0 ? req : set[k] ?? '—'));
  lines.splice(last + 1, 0, `| ${cells.join(' | ')} |`);
  return lines.join('\n');
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const VALUED = new Set(['--root', ...Object.keys(COLUMNS)]);
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const [slug, req] = pos;
  const set = Object.fromEntries(Object.entries(COLUMNS).filter(([k]) => argv.includes(k)).map(([k, col]) => [col, argv[argv.indexOf(k) + 1]]));
  if (!slug || !/^REQ-\d{3,}$/.test(req ?? '') || !Object.keys(set).length) {
    console.error('usage: trace-upsert.mjs <slug> <REQ-NNN> [--criteria …] [--tasks …] [--tests …] [--status …]');
    return 2;
  }
  const file = join(rootFromArgv(argv, cwd), 'requirements', slug, 'requirements.md');
  if (!existsSync(file)) { console.error(`no ${file}`); return 2; }
  const raw = readFileSync(file, 'utf8');
  const out = upsert(raw.replace(/\r\n/g, '\n'), req, set);
  if (out === null) { console.error('requirements.md has no `## Traceability` table'); return 1; }
  writeFileSync(file, out);
  console.log(`${req}: ${Object.keys(set).map((c) => Object.keys(COLUMNS).find((k) => COLUMNS[k] === Number(c)).slice(2)).join(', ')} set`);
  return 0;
}

const isMain = process.argv[1] && /(^|[\\/])trace-upsert\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
