#!/usr/bin/env node
/**
 * gate-effect.mjs — what each gate caught, and what got past it (DEV-CONTRACTS §22).
 *
 *   node <root>/scripts/gate-effect.mjs [--root <dir>] [--json]
 *
 * A gate earns its cost by catching things before production. Two numbers say whether it does:
 *
 *   caught    findings a gate raised at BLOCKER or MAJOR, across every initiative, that the author
 *             then fixed (RESOLVED in a later attempt) — a problem that would otherwise have shipped
 *   escaped   rows of `## Escaped` in each post-release.md: a defect found after release, with the
 *             gate that should have caught it
 *
 * A gate with escapes and few catches is asking the wrong questions (`/sdlc-improve` adds the missing
 * one, §17). A gate that has caught nothing in ten initiatives is a removal candidate (§17). The
 * numbers do not decide either; they make the question impossible to skip.
 *
 * Also reads <root>/logs/commands.jsonl (bash-guard.mjs) and reports how many approved outward
 * commands ran, by class. Exit 0 always; 2 is a usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDoc, readTable, plain } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { logRun } from './lib/runlog.mjs';

const GATE = /^(GK|G(?:[0-9]|1[01]))$/;
const posix = (p) => p.split(sep).join('/');
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Per gate: { caught, raised, escaped, initiatives, escapes: [{ slug, what }] }. */
export function effect(root) {
  const gates = new Map();
  const at = (g) => {
    if (!gates.has(g)) gates.set(g, { caught: 0, raised: 0, escaped: 0, initiatives: new Set(), escapes: [] });
    return gates.get(g);
  };
  // Every finding a gate raised, by slug + id, and whether a later attempt resolved it.
  const raised = new Map();
  const resolved = new Set();
  for (const p of walk(join(root, 'reviews'))) {
    const rel = posix(relative(root, p));
    if (!rel.endsWith('.md') || rel.startsWith('reviews/_repo/') || /\/\./.test(rel)) continue;
    const doc = parseDoc(readFileSync(p, 'utf8'));
    const gate = String(doc.frontMatter.gate ?? '');
    const slug = String(doc.frontMatter.slug ?? rel.split('/')[1]);
    if (!GATE.test(gate)) continue;
    at(gate).initiatives.add(slug);
    for (const r of readTable(doc.body, 'Findings')) {
      const id = plain(r.id);
      if (/^CR-\d+/.test(id) && /^(BLOCKER|MAJOR)$/.test(plain(r.severity)) && !raised.has(`${slug}|${id}`)) raised.set(`${slug}|${id}`, gate);
    }
    for (const r of readTable(doc.body, 'Finding resolution')) {
      if (plain(r['reviewer verdict']) === 'RESOLVED') resolved.add(`${slug}|${plain(r.id)}`);
    }
  }
  for (const [key, gate] of raised) {
    at(gate).raised++;
    if (resolved.has(key)) at(gate).caught++;
  }
  for (const p of walk(join(root, 'monitoring'))) {
    if (!p.endsWith('post-release.md')) continue;
    const slug = posix(relative(root, p)).split('/')[1];
    for (const r of readTable(parseDoc(readFileSync(p, 'utf8')).body, 'Escaped')) {
      const gate = plain(r['should have been caught at'] ?? r.gate ?? '').split(/[\s,·]/)[0];
      if (!GATE.test(gate)) continue;
      at(gate).escaped++;
      at(gate).escapes.push({ slug, what: plain(r.defect ?? r.what ?? '') });
    }
  }
  return [...gates.entries()]
    .map(([gate, g]) => ({ gate, caught: g.caught, raised: g.raised, escaped: g.escaped, initiatives: g.initiatives.size, escapes: g.escapes }))
    .sort((a, b) => order(a.gate) - order(b.gate));
}
const order = (g) => (g === 'GK' ? -1 : Number(g.slice(1)));

/** A gate that should be looked at, and why — or null. */
export function verdict(g) {
  if (g.escaped && g.escaped >= g.caught) return 'escapes outnumber catches — find the missing check (/sdlc-improve)';
  if (g.escaped) return 'something escaped — is there a check that would have caught it? (/sdlc-improve)';
  if (g.initiatives >= 10 && g.caught === 0) return 'caught nothing in 10+ initiatives — a removal candidate (§17)';
  return null;
}

export function commands(root) {
  const file = join(root, 'logs', 'commands.jsonl');
  const by = {};
  if (!existsSync(file)) return by;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try { const e = JSON.parse(line); if (e.class) by[e.class] = (by[e.class] ?? 0) + 1; } catch { /* a torn line */ }
  }
  return by;
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const root = rootFromArgv(argv, cwd);
  const rows = effect(root);
  const ran = commands(root);
  logRun(root, { script: 'gate-effect.mjs', exit: 0, errors: 0, warnings: 0 });
  if (argv.includes('--json')) { console.log(JSON.stringify({ gates: rows, commands: ran }, null, 2)); return 0; }
  if (!rows.length) { console.log('gate-effect — no gate logs yet'); return 0; }
  console.log('gate  caught/raised  escaped  initiatives');
  for (const g of rows) {
    console.log(`${g.gate.padEnd(5)} ${`${g.caught}/${g.raised}`.padStart(13)}  ${String(g.escaped).padStart(7)}  ${String(g.initiatives).padStart(11)}`);
    const v = verdict(g);
    if (v) console.log(`      ↳ ${v}${g.escapes.length ? `: ${g.escapes.map((e) => `${e.slug} — ${e.what}`).join('; ')}` : ''}`);
  }
  const cls = Object.entries(ran);
  if (cls.length) console.log(`approved outward commands that ran: ${cls.map(([k, v]) => `${k} ×${v}`).join(' · ')} (logs/commands.jsonl)`);
  return 0;
}

const isMain = process.argv[1] && /(^|[\\/])gate-effect\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
