#!/usr/bin/env node
/**
 * size.mjs — size an initiative before it starts, and hold it to that size after (DEV-CONTRACTS §15.3).
 *
 *   node <root>/scripts/size.mjs estimate <slug> [--class initiative|change|fix|refactor|spike|fast] [--touches G3,G4] [--approved-by "<human>"]
 *   node <root>/scripts/size.mjs actual <slug> --gate <G> [--tokens <n>] [--seconds <n>]
 *   node <root>/scripts/size.mjs reason <slug> (--cost "<why>" | --spawns "<why>")
 *   node <root>/scripts/size.mjs check <slug>
 *   node <root>/scripts/size.mjs model <gate> <class>
 *
 * `estimate` picks the fewest gates the class needs (§15.1), lists each one it skips and why, and
 * writes `<root>/estimates/<slug>.json`: tokens, cost, and the spawn budget. Exit 3 when the tokens
 * are over the profile's `Token budget` (or SDLC_BUDGET_TOKENS) and no human approved it: the stage
 * stops and asks before starting, instead of finding the overrun half-way.
 *
 * `check` is the G11 half (row 23): exit 1 when the recorded actual tokens exceed the estimate by
 * more than 50 %, or the spawns counted from the gate logs exceed the budget, with no recorded
 * reason. Spawns are counted, not reported: two per gate log that is not SKIPPED (author and
 * reviewer), one per lane note. Actual tokens are only what `actual` recorded — never guessed.
 *
 * `model` prints the reviewer model for a gate: the gates whose mistakes are expensive to undo keep
 * opus; the rest run on sonnet for a `change` or a `fix`.
 *
 * Exit 0 ok · 1 check failed · 2 usage · 3 over budget, ask a human.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDoc } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { readProfile, setting } from './lib/profile.mjs';

export const GATES = ['GK', 'G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];
// Thousands of tokens per gate, author and reviewer together. Starting points: bench.mjs reports the
// actuals, and a project whose ratio drifts edits its profile `Token budget`, not these.
export const KTOKENS = { GK: 120, G0: 60, G1: 120, G2: 200, G3: 150, G4: 150, G5: 200, G6: 120, G7: 900, G8: 250, G9: 100, G10: 120, G11: 80 };
const RUNS = {
  initiative: GATES,
  change: ['G1', 'G6', 'G7', 'G8', 'G9'],
  fix: ['G7', 'G8', 'G9'],
  refactor: ['G7', 'G8', 'G9'],
  // An answer, never code: framed at G0, recorded as an ADR at G2, never merged (§15.1).
  spike: ['G0', 'G2'],
  // Decide once, then build in slices; G2–G4 come back only for a slice that escalates (§15.1).
  fast: ['G0', 'G1', 'G7', 'G8', 'G9', 'G10'],
};
// The gates a class may still need: run when the work touches them, decided by their reviewer
// (`change`) or by a slice's Escalates column (`fast`).
const TOUCHABLE_BY = {
  change: ['G2', 'G3', 'G4', 'G5', 'G10', 'G11'],
  fast: ['G2', 'G3', 'G4', 'G5'],
};
// A wrong design, schema, contract, code or rollout is the expensive thing to undo.
export const HEAVY = new Set(['G2', 'G3', 'G4', 'G7', 'G10']);
const USD_PER_MTOK = 15;
const GAP = 0.5;

export function reviewerModel(gate, cls) {
  return cls === 'initiative' || HEAVY.has(gate) ? 'opus' : 'sonnet';
}

export function plan(cls, touches = []) {
  if (!RUNS[cls]) throw new Error(`unknown class \`${cls}\` — ${Object.keys(RUNS).join(', ')}`);
  const touchable = TOUCHABLE_BY[cls] ?? [];
  const runs = [...RUNS[cls], ...touchable.filter((g) => touches.includes(g))];
  const gates = GATES.filter((g) => runs.includes(g));
  const skipped = GATES.filter((g) => !runs.includes(g)).map((gate) => ({
    gate,
    why: touchable.includes(gate)
      ? (cls === 'fast' ? 'not escalated by any slice; a slice that touches it brings it back (§15.1)' : 'not touched by this change; its reviewer may still claim it (§5.4)')
      : `not run for class ${cls} (§15.1)`,
  }));
  const weight = (g) => KTOKENS[g];
  const tokens = gates.reduce((n, g) => n + weight(g) * 1000, 0);
  // One retry on half the gates is normal; more than that is a signal, not a schedule.
  const maxSpawns = Math.ceil(gates.length * 2 * 1.5);
  return { class: cls, gates, skipped, tokens, cost_usd: Math.round((tokens / 1e6) * USD_PER_MTOK * 100) / 100, max_spawns: maxSpawns };
}

const fileOf = (root, slug) => join(root, 'estimates', `${slug}.json`);
export function load(root, slug) {
  try { return JSON.parse(readFileSync(fileOf(root, slug), 'utf8')); } catch { return null; }
}
function save(root, slug, data) {
  mkdirSync(join(root, 'estimates'), { recursive: true });
  writeFileSync(fileOf(root, slug), `${JSON.stringify(data, null, 2)}\n`);
}

function classOf(root, slug, given) {
  if (given) return given;
  const p = join(root, 'intake', slug, 'problem.md');
  return existsSync(p) ? String(parseDoc(readFileSync(p, 'utf8')).frontMatter.change_class ?? '') || null : null;
}

/** Spawns the gate logs prove happened: two per reviewed log, one per lane note. */
export function spawns(root, slug) {
  let n = 0;
  const dir = join(root, 'reviews', slug);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      if (String(parseDoc(readFileSync(join(dir, f), 'utf8')).frontMatter.verdict ?? '') !== 'SKIPPED') n += 2;
    }
  }
  const lanes = join(root, 'implementation', slug, 'lanes');
  if (existsSync(lanes)) n += readdirSync(lanes).filter((x) => x.endsWith('.md')).length;
  return n;
}

/** [problem, …] — empty when the initiative stayed inside its estimate or said why it did not. */
export function judge(root, slug) {
  const e = load(root, slug);
  if (!e) return [`no estimate for ${slug} — run size.mjs estimate ${slug} at intake`];
  const out = [];
  const actual = Object.values(e.actual ?? {}).reduce((n, a) => n + (a.tokens ?? 0), 0);
  if (actual && actual > e.tokens * (1 + GAP) && !e.cost_reason) out.push(`tokens ${actual} are ${Math.round((actual / e.tokens - 1) * 100)} % over the estimate ${e.tokens} with no reason — size.mjs reason ${slug} --cost "<why>"`);
  const used = spawns(root, slug);
  if (used > e.max_spawns && !e.spawn_reason) out.push(`${used} spawns, budget ${e.max_spawns}, no reason — size.mjs reason ${slug} --spawns "<why>"`);
  return out;
}

export function main(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const VALUED = new Set(['--root', '--class', '--touches', '--approved-by', '--gate', '--tokens', '--seconds', '--cost', '--spawns']);
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const [cmd, slug, cls] = pos;
  if (cmd === 'model' && slug && cls) { console.log(reviewerModel(slug, cls)); return 0; }
  if (!slug) { console.error('usage: size.mjs estimate|actual|reason|check <slug> … | model <gate> <class>'); return 2; }
  const root = rootFromArgv(argv, cwd);
  if (cmd === 'estimate') {
    const c = classOf(root, slug, opt('--class'));
    if (!RUNS[c]) { console.error(`size estimate — no class for ${slug}: pass --class ${Object.keys(RUNS).join('|')}`); return 2; }
    const p = plan(c, String(opt('--touches') ?? '').split(',').map((s) => s.trim()));
    const budget = Number(env.SDLC_BUDGET_TOKENS) || Number(String(setting(readProfile(root).text, 'Token budget') ?? '').replace(/[^\d]/g, '')) || null;
    const prior = load(root, slug) ?? {};
    const data = { ...prior, slug, ...p, budget_tokens: budget, approved_by: opt('--approved-by') ?? prior.approved_by ?? null };
    save(root, slug, data);
    console.log(`size ${slug} — ${c}: ${p.gates.join(' ')} · ~${Math.round(p.tokens / 1000)}k tokens (~US$ ${p.cost_usd}) · at most ${p.max_spawns} spawns`);
    for (const s of p.skipped) console.log(`  skip ${s.gate}: ${s.why}`);
    if (budget && p.tokens > budget && !data.approved_by) {
      console.log(`  OVER BUDGET: ${p.tokens} > ${budget} — stop and ask a human; re-run with --approved-by "<name>" once one agrees`);
      return 3;
    }
    return 0;
  }
  const e = load(root, slug);
  if (cmd === 'actual' || cmd === 'reason') {
    if (!e) { console.error(`no estimate for ${slug}`); return 2; }
    if (cmd === 'actual') {
      const g = opt('--gate');
      if (!GATES.includes(g)) { console.error('--gate GK|G0…G11'); return 2; }
      e.actual = { ...e.actual, [g]: { tokens: opt('--tokens') ? Number(opt('--tokens')) : null, duration_s: opt('--seconds') ? Number(opt('--seconds')) : null } };
    } else {
      if (!opt('--cost') && !opt('--spawns')) { console.error('--cost "<why>" or --spawns "<why>"'); return 2; }
      if (opt('--cost')) e.cost_reason = opt('--cost');
      if (opt('--spawns')) e.spawn_reason = opt('--spawns');
    }
    save(root, slug, e);
    return 0;
  }
  if (cmd === 'check') {
    const problems = judge(root, slug);
    for (const p of problems) console.log(`  FAIL ${p}`);
    console.log(`size check ${slug} — ${problems.length ? 'over' : 'within'} its estimate`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: size.mjs estimate|actual|reason|check <slug> … | model <gate> <class>');
  return 2;
}

const isMain = process.argv[1] && /(^|[\\/])size\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
