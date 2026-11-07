#!/usr/bin/env node
/**
 * bench.mjs — score what the pipeline produced in a project, so two versions of the bundle can be
 * compared on numbers instead of impressions (docs/learning-roadmap.md Step 6).
 *
 *   node <root>/scripts/bench.mjs score [--root <dir>] [--label <name>] [--condition lessons|no-lessons] [--task <id>] [--out <file.json>]
 *   node <root>/scripts/bench.mjs export [--root <dir>] [--condition lessons|no-lessons] [--out <file.json>]
 *   node <root>/scripts/bench.mjs compare <before.json> <after.json> [--reason "<why worse is acceptable>"]
 *
 * Every measure is read from files the pipeline already writes; nothing is judged by a model:
 *
 *   first_pass        share of (initiative, gate) pairs whose first review was PASS, with a 95 %
 *                     Wilson interval — an author that gets it right first time costs one review
 *   rework            pairs that needed a second attempt
 *   reopened          findings the author said were fixed and the reviewer reopened
 *   repeated          findings that recur at one gate across initiatives (learn.mjs harvest), and how
 *                     many of them no lesson covers yet — the number the learning loop exists to lower
 *   unverified        `UNVERIFIED:` claims left in artifacts (§21)
 *   lessons           active lessons, and how many are established
 *   estimates         done tasks whose progress.md `Actual` falls inside the tasks.md range, and the
 *                     median actual ÷ high end: the factor dev-planning-implementation carries forward
 *   repeat_errors     findings that repeat an active lesson after it was written (learn.mjs ladder)
 *   tokens, duration_s  per stage, from `size.mjs actual`; null where nothing was recorded, never guessed
 *   cost              actual tokens against each initiative's `size.mjs estimate`, and whether the gap
 *                     is over 50 % with no reason (the G11 row 23 check)
 *
 * The flat fields task_id, bundle, version, condition, first_pass, repeat_errors, tokens and
 * duration_s are what an external comparer reads; `version` is the bundle's VERSION file. `export`
 * writes them per (initiative, gate) as a bundle-bench file (schema 1), the paired form a comparer tests.
 *
 * `compare` prints the change in each and exits 1 when the later score is worse on first_pass (its
 * interval wholly below the earlier one), on uncovered repeats or on repeat_errors, unless `--reason` says why that is
 * acceptable. A release that gets worse with a written reason is a decision; without one it is a
 * regression nobody looked at.
 *
 * score and compare (when not worse) exit 0; 2 is a usage error.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseDoc, readTable, plain } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { logRun } from './lib/runlog.mjs';
import { harvest, ladder, loadLessons, readLogs } from './learn.mjs';
import { STAGE_OF } from './build-state.mjs';
import { judge, load as loadEstimate } from './size.mjs';
import { readProgress } from './lib/tasks.mjs';

const posix = (p) => p.split(sep).join('/');
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** 95 % Wilson score interval for k successes in n, as [low, high]; [0, 1] when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const round = (x) => Math.round(x * 1000) / 1000;

const HOURS = { m: 1 / 60, min: 1 / 60, h: 1, d: 8 };
/** `2–4h`, `2-4 h; …`, `3h` → [low, high] in hours, or null. The high end is what a plan commits to. */
export function estimateRange(cell) {
  const m = /(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*(min|m|h|d)\b/i.exec(String(cell ?? ''));
  if (!m) return null;
  const u = HOURS[m[3].toLowerCase()];
  return [Number(m[1]) * u, Number(m[2] ?? m[1]) * u];
}

/**
 * Estimates against what happened (roadmap 7.2): each done task whose last progress.md row records
 * an `Actual` (`5h`, `90min`) is compared with its tasks.md range. `within` counts actuals inside the
 * range; `ratio` is the median of actual ÷ high end, the factor the next plan's range should carry.
 * A project that records no actuals scores `of: 0`, never a guess.
 */
export function estimates(root) {
  let of = 0;
  let within = 0;
  const ratios = [];
  const planDir = join(root, 'plan');
  if (!existsSync(planDir)) return { of, within, ratio: null };
  for (const slug of readdirSync(planDir)) {
    const tasksP = join(planDir, slug, 'tasks.md');
    const progP = join(root, 'implementation', slug, 'progress.md');
    if (!existsSync(tasksP) || !existsSync(progP)) continue;
    const ranges = new Map(readTable(parseDoc(readFileSync(tasksP, 'utf8')).body, 'Tasks').map((r) => [plain(r.id), estimateRange(r.estimate)]));
    const last = new Map();
    for (const r of readProgress(readFileSync(progP, 'utf8'))) last.set(r.task, r);
    for (const [id, r] of last) {
      const range = ranges.get(id);
      const actual = estimateRange(r.actual)?.[0];
      if (r.status !== 'done' || !range || actual == null) continue;
      of++;
      if (actual >= range[0] && actual <= range[1]) within++;
      ratios.push(actual / range[1]);
    }
  }
  ratios.sort((a, b) => a - b);
  const ratio = ratios.length ? round(ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) : null;
  return { of, within, ratio };
}

/** The bundle version: VERSION beside the root's scripts (bundle repo) or the install manifest. */
export function bundleVersion(root) {
  for (const p of [join(root, '..', 'VERSION'), join(root, '..', '.claude', 'VERSION'), join(root, 'VERSION')]) {
    if (existsSync(p)) return readFileSync(p, 'utf8').trim() || null;
  }
  const m = join(root, 'scripts', '.manifest.json');
  return existsSync(m) ? (JSON.parse(readFileSync(m, 'utf8')).version ?? null) : null;
}

/** Tokens and seconds per stage, summed over initiatives; a stage with no record is null. */
export function usage(root) {
  const tokens = {};
  const duration = {};
  const cost = [];
  const dir = join(root, 'estimates');
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
    const slug = f.replace(/\.json$/, '');
    const e = loadEstimate(root, slug);
    if (!e) continue;
    let actual = 0;
    for (const [gate, a] of Object.entries(e.actual ?? {})) {
      const stage = STAGE_OF[gate];
      if (a.tokens != null) { tokens[stage] = (tokens[stage] ?? 0) + a.tokens; actual += a.tokens; }
      if (a.duration_s != null) duration[stage] = (duration[stage] ?? 0) + a.duration_s;
    }
    cost.push({ slug, estimate: e.tokens, actual: actual || null, ratio: actual ? round(actual / e.tokens) : null, over: judge(root, slug).length > 0 });
  }
  const all = Object.values(STAGE_OF);
  const fill = (m) => Object.fromEntries(all.map((st) => [st, m[st] ?? null]));
  return { tokens: fill(tokens), duration_s: fill(duration), cost };
}

export function score(root, { label = null, condition = null, task = null } = {}) {
  const logs = readLogs(root).filter((l) => /^G\d+$/.test(l.gate));
  // The first review of each (initiative, gate): the lowest run id, then attempt 1.
  const first = new Map();
  const runOf = (l) => (/(\d{8}-\d{6}-[0-9a-f]{4})/.exec(l.path) ?? [])[1] ?? l.path;
  for (const l of logs) {
    const key = `${l.slug}|${l.gate}`;
    const prev = first.get(key);
    if (!prev || runOf(l) < runOf(prev) || (runOf(l) === runOf(prev) && l.attempt < prev.attempt)) first.set(key, l);
  }
  const counted = [...first.values()].filter((l) => l.verdict !== 'SKIPPED');
  const passed = counted.filter((l) => l.verdict === 'PASS').length;
  const reworked = new Set(logs.filter((l) => l.attempt >= 2).map((l) => `${l.slug}|${l.gate}`));
  const reopened = logs.reduce((n, l) => n + l.resolutions.filter((r) => /REOPENED/.test(r['reviewer verdict'] ?? '')).length, 0);
  const lessons = loadLessons(root);
  const recurring = harvest(root, { lessons }).filter((s) => s.signal === 'recurring finding');
  let unverified = 0;
  for (const p of walk(root)) {
    const rel = posix(relative(root, p));
    if (!rel.endsWith('.md') || /^(reviews|learnings|_templates|scripts|docs)\//.test(rel)) continue;
    unverified += parseDoc(readFileSync(p, 'utf8')).body.split('\n').filter((x) => /\bUNVERIFIED:/.test(x.replace(/`[^`]*`/g, ''))).length;
  }
  const active = lessons.filter((l) => l.fm?.status === 'active');
  const [lo, hi] = wilson(passed, counted.length);
  const used = usage(root);
  return {
    label,
    task_id: task ?? label,
    bundle: 'sdlc',
    version: bundleVersion(root),
    condition: condition ?? (active.length ? 'lessons' : 'no-lessons'),
    initiatives: new Set(logs.map((l) => l.slug)).size,
    first_pass: { passed, of: counted.length, rate: counted.length ? round(passed / counted.length) : null, ci95: [round(lo), round(hi)] },
    rework: reworked.size,
    reopened,
    repeated: { total: recurring.length, uncovered: recurring.filter((s) => !s.covered).length },
    unverified,
    lessons: { active: active.length, established: active.filter((l) => l.fm.confidence === 'established').length },
    estimates: estimates(root),
    lessons_active: active.length,
    repeat_errors: ladder(lessons, logs).reduce((n, r) => n + r.repeats.length, 0),
    tokens: used.tokens,
    duration_s: used.duration_s,
    cost: used.cost,
  };
}

/**
 * One record per (initiative, gate) in the bundle-bench schema an external comparer reads: the same
 * pair scored under two versions or two conditions is what a paired test needs, and a project total
 * cannot be paired. first_pass is null for a SKIPPED gate: not reviewed is not a pass.
 */
export function exportTasks(root, { condition = null } = {}) {
  const s = score(root, { condition });
  const logs = readLogs(root).filter((l) => /^G\d+$/.test(l.gate));
  const runOf = (l) => (/(\d{8}-\d{6}-[0-9a-f]{4})/.exec(l.path) ?? [])[1] ?? l.path;
  const first = new Map();
  for (const l of logs) {
    const key = `${l.slug}|${l.gate}`;
    const prev = first.get(key);
    if (!prev || runOf(l) < runOf(prev) || (runOf(l) === runOf(prev) && l.attempt < prev.attempt)) first.set(key, l);
  }
  const gateOf = new Map(logs.map((l) => [l.path, l.gate]));
  const repeats = new Map();
  for (const r of ladder(loadLessons(root), logs).flatMap((x) => x.repeats)) {
    const key = `${r.slug}|${gateOf.get(r.path)}`;
    repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }
  const tasks = [...first.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, l]) => {
    const a = loadEstimate(root, l.slug)?.actual?.[l.gate] ?? {};
    return {
      task_id: key,
      first_pass: l.verdict === 'SKIPPED' ? null : l.verdict === 'PASS',
      repeat_errors: repeats.get(key) ?? 0,
      tokens: a.tokens ?? null,
      duration_s: a.duration_s ?? null,
    };
  });
  return { schema: 1, bundle: s.bundle, version: s.version, condition: s.condition, tasks };
}

/** { worse: [reasons], lines: [printable] } */
export function compare(a, b) {
  const worse = [];
  const lines = [];
  const d = (x, y) => (y - x >= 0 ? `+${round(y - x)}` : `${round(y - x)}`);
  const fa = a.first_pass;
  const fb = b.first_pass;
  lines.push(`first_pass   ${fa.rate ?? '—'} [${fa.ci95.join(', ')}] → ${fb.rate ?? '—'} [${fb.ci95.join(', ')}]`);
  if (fa.of && fb.of && fb.ci95[1] < fa.ci95[0]) worse.push('first_pass fell: the later interval sits wholly below the earlier one');
  else if (fa.of && fb.of && fb.ci95[0] > fa.ci95[1]) lines.push('             ↳ improved: the intervals do not overlap');
  else if (fa.of && fb.of) lines.push('             ↳ the intervals overlap: not a measurable change at this sample size');
  lines.push(`rework       ${a.rework} → ${b.rework} (${d(a.rework, b.rework)})`);
  lines.push(`reopened     ${a.reopened} → ${b.reopened} (${d(a.reopened, b.reopened)})`);
  lines.push(`repeated     ${a.repeated.total} → ${b.repeated.total}, uncovered ${a.repeated.uncovered} → ${b.repeated.uncovered} (${d(a.repeated.uncovered, b.repeated.uncovered)})`);
  if (b.repeated.uncovered > a.repeated.uncovered) worse.push('more repeated findings with no lesson');
  // A baseline from before 1.10.0 has no repeat_errors: unknown, not zero, so it gates nothing.
  if (a.repeat_errors != null && b.repeat_errors != null) {
    lines.push(`repeat_errors ${a.repeat_errors} → ${b.repeat_errors} (${d(a.repeat_errors, b.repeat_errors)})`);
    if (b.repeat_errors > a.repeat_errors) worse.push('more findings that repeat a lesson already recalled');
  }
  lines.push(`unverified   ${a.unverified} → ${b.unverified}`);
  lines.push(`lessons      ${a.lessons.active} (${a.lessons.established} established) → ${b.lessons.active} (${b.lessons.established} established)`);
  // A baseline written before estimates were scored has none: say so rather than compare with zero.
  const ea = a.estimates ?? { of: 0, within: 0, ratio: null };
  const eb = b.estimates ?? { of: 0, within: 0, ratio: null };
  lines.push(`estimates    ${ea.of ? `${ea.within}/${ea.of} within, ×${ea.ratio}` : 'no actuals'} → ${eb.of ? `${eb.within}/${eb.of} within, ×${eb.ratio}` : 'no actuals'}`);
  return { worse, lines };
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const VALUED = new Set(['--root', '--label', '--out', '--reason', '--condition', '--task']);
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const [cmd] = pos;
  if (cmd === 'score') {
    const root = rootFromArgv(argv, cwd);
    const s = score(root, { label: opt('--label'), condition: opt('--condition'), task: opt('--task') });
    const text = `${JSON.stringify(s, null, 2)}\n`;
    if (opt('--out')) writeFileSync(opt('--out'), text);
    process.stdout.write(text);
    logRun(root, { script: 'bench.mjs', exit: 0, errors: 0, warnings: 0 });
    return 0;
  }
  if (cmd === 'export') {
    const root = rootFromArgv(argv, cwd);
    const text = `${JSON.stringify(exportTasks(root, { condition: opt('--condition') }), null, 2)}\n`;
    if (opt('--out')) writeFileSync(opt('--out'), text);
    process.stdout.write(text);
    return 0;
  }
  if (cmd === 'compare' && pos.length === 3) {
    const [a, b] = pos.slice(1).map((p) => JSON.parse(readFileSync(p, 'utf8')));
    const { worse, lines } = compare(a, b);
    console.log(`bench compare — ${a.label ?? pos[1]} → ${b.label ?? pos[2]}`);
    for (const l of lines) console.log(`  ${l}`);
    if (!worse.length) { console.log('  not worse on any gated measure'); return 0; }
    for (const w of worse) console.log(`  WORSE  ${w}`);
    if (opt('--reason')) { console.log(`  accepted: ${opt('--reason')}`); return 0; }
    console.log('  a version that scores worse ships only with --reason "<why>"');
    return 1;
  }
  console.error('usage: bench.mjs score [--label l] [--out f.json] | export [--condition c] [--out f.json] | compare <before.json> <after.json> [--reason "<why>"]');
  return 2;
}

const isMain = process.argv[1] && /(^|[\\/])bench\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
