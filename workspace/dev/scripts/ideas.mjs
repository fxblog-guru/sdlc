#!/usr/bin/env node
/**
 * ideas.mjs — the repository's idea backlog, fed by what releases found (DEV-CONTRACTS §20).
 *
 *   node <root>/scripts/ideas.mjs sync [--root <dir>]     copy every `idea` row of every post-release `## Next` into ideas.md
 *   node <root>/scripts/ideas.mjs check                   every idea cites evidence that exists; a ranked or taken row says who
 *   node <root>/scripts/ideas.mjs list [--top 5]          the ideas worth offering at intake: ranked first, then new
 *
 * The loop inside one project: G11 measures a release against the problem it was for, and its
 * `## Next` table says what that measurement means for the next piece of work. Without this script
 * that table is read once and forgotten; with it, every `idea` row becomes an `IDEA-NNN` in
 * `<root>/ideas.md`, and `/sdlc-intake` offers the top of the list before a blank page.
 *
 * Agents add rows; only a human ranks them. A row with a Value, an Effort or a Confidence carries
 * `Ranked by`, the same rule as `status: assumed` on a DEC (§15.2): a priority an agent chose for
 * itself is a guess with a format. `sync` is append-only and idempotent: a row already in ideas.md
 * (same post-release, same text) is never added twice, and ids are never renumbered.
 *
 * check exits 1 on any error; sync and list exit 0; 2 is a usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDoc, readTable, plain, splitCells } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { logRun } from './lib/runlog.mjs';

export const FILE = 'ideas.md';
export const COLUMNS = ['Id', 'Idea', 'Evidence', 'Class', 'Value', 'Effort', 'Confidence', 'Ranked by', 'Status'];
const KINDS = ['idea', 'lesson', 'check'];
const LEVELS = ['high', 'medium', 'low'];
const STATUS = ['new', 'ranked', 'dropped'];
const CLASSES = ['initiative', 'change', 'fix', 'refactor', 'spike', 'fast'];
const HEADER = `---
artifact: ideas
---

# Ideas

<!-- Written by ideas.mjs sync from each post-release.md \`## Next\` (DEV-CONTRACTS §20). Agents add
     rows; a human ranks them: Value, Effort and Confidence are high | medium | low, and a ranked row
     names who ranked it. Status: new · ranked · taken: <slug> · dropped: <reason>. -->

## Ideas

| ${COLUMNS.join(' | ')} |
|${COLUMNS.map(() => '---').join('|')}|
`;

const posix = (p) => p.split(sep).join('/');
const empty = (v) => ['', '—', '-'].includes(plain(v));

/** The `## Next` rows of one post-release, as { kind, what, evidence, class }. */
export function nextRows(text) {
  return readTable(parseDoc(text).body, 'Next')
    .map((r) => ({ kind: plain(r.kind).toLowerCase(), what: String(r.what ?? '').trim(), evidence: plain(r.evidence), class: plain(r.class).toLowerCase() }))
    .filter((r) => r.what && !/^<.*>$/.test(r.what));
}

/** ideas.md as rows keyed by lower-case column name, or [] when there is none. */
export function readIdeas(root) {
  const p = join(root, FILE);
  return existsSync(p) ? readTable(parseDoc(readFileSync(p, 'utf8')).body, 'Ideas').filter((r) => /^IDEA-\d{3,}$/.test(plain(r.id))) : [];
}

const nextId = (rows) => {
  const max = Math.max(0, ...rows.map((r) => Number(plain(r.id).slice(5))));
  return (n) => `IDEA-${String(max + n).padStart(3, '0')}`;
};

/** Ideas from every post-release that ideas.md does not hold yet: [{ id, idea, evidence, class }]. */
export function pending(root) {
  const have = new Set(readIdeas(root).map((r) => `${plain(r.evidence).split(' ')[0]}|${String(r.idea).trim()}`));
  const out = [];
  const dir = join(root, 'monitoring');
  if (!existsSync(dir)) return out;
  for (const slug of readdirSync(dir).sort()) {
    const p = join(dir, slug, 'post-release.md');
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const rel = posix(relative(root, p));
    for (const r of nextRows(readFileSync(p, 'utf8'))) {
      if (r.kind !== 'idea') continue;
      if (have.has(`${rel}|${r.what}`)) continue;
      have.add(`${rel}|${r.what}`);
      out.push({ idea: r.what, evidence: rel, class: CLASSES.includes(r.class) ? r.class : '' });
    }
  }
  return out;
}

export function sync(root) {
  const rows = readIdeas(root);
  const add = pending(root);
  if (!add.length) return [];
  const id = nextId(rows);
  const added = add.map((a, i) => ({ ...a, id: id(i + 1) }));
  const p = join(root, FILE);
  const text = existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n*$/, '\n') : HEADER;
  const lines = added.map((a) => `| ${a.id} | ${a.idea.replace(/\|/g, '\\|')} | ${a.evidence} | ${a.class || '—'} | — | — | — | — | new |`);
  writeFileSync(p, `${text}${lines.join('\n')}\n`);
  return added;
}

/** The gate. Returns `ideas.md:<id>: message` strings. */
export function checkIdeas(root, { exists = (p) => existsSync(join(root, p)) } = {}) {
  const errors = [];
  const p = join(root, FILE);
  if (!existsSync(p)) return errors;
  const body = parseDoc(readFileSync(p, 'utf8')).body;
  const header = body.split('\n').find((l) => /^\|\s*Id\s*\|/.test(l));
  if (!header || splitCells(header).join('|') !== COLUMNS.join('|')) errors.push(`${FILE}: the ## Ideas table must have the columns ${COLUMNS.join(' · ')}`);
  const seen = new Set();
  for (const r of readTable(body, 'Ideas')) {
    const id = plain(r.id);
    const err = (m) => errors.push(`${FILE}:${id || '?'}: ${m}`);
    if (!/^IDEA-\d{3,}$/.test(id)) { err('id is not IDEA-NNN'); continue; }
    if (seen.has(id)) err('id used twice — ids are never reused (§1)');
    seen.add(id);
    const evidence = plain(r.evidence).split(/\s+/)[0];
    if (!evidence) err('no evidence — an idea cites the post-release, review or human statement that raised it');
    else if (!/^human:/.test(plain(r.evidence)) && !exists(evidence)) err(`evidence ${evidence} does not exist`);
    if (!empty(r.class) && !CLASSES.includes(plain(r.class))) err(`class \`${plain(r.class)}\` — ${CLASSES.join(' | ')}`);
    const ranks = ['value', 'effort', 'confidence'].filter((k) => !empty(r[k]));
    for (const k of ranks) if (!LEVELS.includes(plain(r[k]).toLowerCase())) err(`${k} \`${plain(r[k])}\` — ${LEVELS.join(' | ')}`);
    const status = plain(r.status);
    const word = status.split(':')[0].trim();
    if (!['taken', ...STATUS].includes(word)) err(`status \`${status}\` — new · ranked · taken: <slug> · dropped: <reason>`);
    if ((ranks.length || word === 'ranked') && empty(r['ranked by'])) err('ranked with nobody named — only a human ranks an idea, and the row says who (§20)');
    if (word === 'taken') {
      const slug = status.split(':')[1]?.trim();
      if (!slug || !exists(`intake/${slug}/problem.md`)) err(`taken by \`${slug ?? ''}\`, which has no intake/<slug>/problem.md`);
    }
    if (word === 'dropped' && !status.split(':')[1]?.trim()) err('dropped without a reason');
  }
  return errors;
}

const score = { high: 3, medium: 2, low: 1 };
/** Open ideas, ranked ones first by value then confidence then low effort, then new ones oldest first. */
export function list(root) {
  const open = readIdeas(root).filter((r) => ['new', 'ranked'].includes(plain(r.status)));
  // A score counts only where a human is named: an agent's own priority must not move a row up.
  const n = (r, k) => (empty(r['ranked by']) ? 0 : score[plain(r[k]).toLowerCase()] ?? 0);
  return open.sort((a, b) => Number(empty(a['ranked by'])) - Number(empty(b['ranked by']))
    || n(b, 'value') - n(a, 'value') || n(b, 'confidence') - n(a, 'confidence') || n(a, 'effort') - n(b, 'effort')
    || plain(a.id).localeCompare(plain(b.id)));
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const VALUED = new Set(['--root', '--top']);
  const [cmd = 'check'] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const root = rootFromArgv(argv, cwd);
  const done = (exit, errors = 0) => { logRun(root, { script: 'ideas.mjs', exit, errors, warnings: 0 }); return exit; };

  if (cmd === 'sync') {
    const added = sync(root);
    for (const a of added) console.log(`  + ${a.id}  ${a.idea}  (${a.evidence})`);
    console.log(`ideas sync — ${added.length} new idea(s)${added.length ? `; a human ranks them in ${FILE}` : ''}`);
    return done(0);
  }
  if (cmd === 'check') {
    const errors = checkIdeas(root);
    for (const e of errors) console.log(`  ERROR ${e}`);
    console.log(`ideas check — ${readIdeas(root).length} idea(s), ${errors.length} error(s)`);
    return done(errors.length ? 1 : 0, errors.length);
  }
  if (cmd === 'list') {
    const top = Number(opt('--top') ?? 5);
    const open = list(root);
    if (!open.length) { console.log('No open idea.'); return done(0); }
    for (const r of open.slice(0, top)) {
      const ranked = empty(r['ranked by']) ? 'not ranked' : `value ${plain(r.value) || '?'} · effort ${plain(r.effort) || '?'} · confidence ${plain(r.confidence) || '?'} (${plain(r['ranked by'])})`;
      console.log(`${plain(r.id)} · ${String(r.idea).trim()}\n    ${ranked} · from ${plain(r.evidence)}`);
    }
    if (open.length > top) console.log(`… ${open.length - top} more in ${FILE}`);
    return done(0);
  }
  console.error('usage: ideas.mjs sync | check | list [--top n]');
  return 2;
}

export { KINDS };
const isMain = process.argv[1] && /(^|[\\/])ideas\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
