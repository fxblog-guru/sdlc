#!/usr/bin/env node
/**
 * contracts.mjs — print only the sections of DEV-CONTRACTS.md that were asked for.
 *
 *   node dev/scripts/contracts.mjs               # table of contents with word counts
 *   node dev/scripts/contracts.mjs 4.5 5 10      # §4.5, all of §5 (with subsections), all of §10
 *   node dev/scripts/contracts.mjs 12.3          # §12 has no subsections: prints §12 whole
 *   node dev/scripts/contracts.mjs --all         # the whole file (what Read would do)
 *
 * Why this exists: every agent is told to read two or three sections of the contract, and the
 * contract is ~9,000 words. A Read of the file costs ~12k tokens per subagent spawn, twice per
 * stage. Printing the cited sections costs a tenth of that and keeps one file as the source of
 * truth — no digest to drift. The section numbering in the headings (`## 4.`, `### 4.5`) is the
 * contract; this script only slices on it.
 *
 * Runs from an installed project (.claude/DEV-CONTRACTS.md) or from the bundle repository
 * (DEV-CONTRACTS.md at the root). Exit 2 if the file cannot be found, 1 if a section does not exist.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cwd = process.cwd();
const candidates = [
  process.env.SDLC_CONTRACTS,
  join(cwd, '.claude', 'DEV-CONTRACTS.md'),
  join(cwd, 'DEV-CONTRACTS.md'),
  resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..', '..', 'DEV-CONTRACTS.md'),
].filter(Boolean);

const file = candidates.find((p) => existsSync(p));
if (!file) {
  console.error('contracts: DEV-CONTRACTS.md not found (looked in .claude/, the cwd, and the bundle root)');
  process.exit(2);
}

const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');

/** Section index: [{ id: '4' | '4.5', level: 2|3, start, end, title }] — `end` exclusive. */
export function indexSections(src) {
  const ls = Array.isArray(src) ? src : src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(/^(##|###) (\d+)(?:\.(\d+[a-z]?))?\.? /);
    if (!m) continue;
    const level = m[1].length;
    const id = m[3] ? `${m[2]}.${m[3]}` : m[2];
    // A `## N.` heading inside a fenced example (e.g. the gate-log skeleton in §5.3) is not a section.
    if (level === 2 && !m[3] && out.some((s) => s.id === id)) continue;
    out.push({ id, level, start: i, title: ls[i].replace(/^#+ /, '') });
  }
  // Close each section at the next heading of the same or higher level.
  for (let k = 0; k < out.length; k++) {
    const s = out[k];
    let end = ls.length;
    for (let j = k + 1; j < out.length; j++) {
      if (out[j].level <= s.level) { end = out[j].start; break; }
    }
    s.end = end;
  }
  return out;
}

export function slice(src, wanted) {
  const ls = Array.isArray(src) ? src : src.replace(/\r\n/g, '\n').split('\n');
  const idx = indexSections(ls);
  const chunks = [];
  const missing = [];
  for (const w of wanted) {
    const want = String(w).replace(/^§/, '');
    let s = idx.find((x) => x.id === want);
    if (!s && /^\d+\.\d+/.test(want)) {
      // §12.3 → §12 (numbered items, not subsections); §4.1a-style ids are matched exactly above.
      const parent = idx.find((x) => x.id === want.split('.')[0] && x.level === 2);
      if (parent && !idx.some((x) => x.level === 3 && x.id.startsWith(parent.id + '.'))) s = parent;
    }
    if (!s) { missing.push(want); continue; }
    chunks.push(ls.slice(s.start, s.end).join('\n').replace(/\n+$/, ''));
  }
  return { text: chunks.join('\n\n---\n\n'), missing };
}

function toc() {
  const idx = indexSections(lines);
  const rows = idx.map((s) => {
    const words = lines.slice(s.start, s.end).join(' ').split(/\s+/).filter(Boolean).length;
    return `${s.level === 3 ? '   ' : ''}§${s.id.padEnd(5)} ${String(words).padStart(5)} words  ${s.title}`;
  });
  return `DEV-CONTRACTS.md — ${lines.join(' ').split(/\s+/).filter(Boolean).length} words. Sections:\n` + rows.join('\n') +
    '\n\nUsage: node dev/scripts/contracts.mjs 4.5 5 10   (print those sections only)';
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--all')) { process.stdout.write(text); process.exit(0); }
  if (args.length === 0) { console.log(toc()); process.exit(0); }
  const { text: out, missing } = slice(lines, args);
  if (out) process.stdout.write(out + '\n');
  if (missing.length) {
    console.error(`contracts: no such section: ${missing.map((m) => '§' + m).join(', ')} (run with no arguments for the table of contents)`);
    process.exit(1);
  }
}
