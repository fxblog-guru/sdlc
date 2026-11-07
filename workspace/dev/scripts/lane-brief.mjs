#!/usr/bin/env node
/**
 * lane-brief.mjs — what one G7 implementer needs for one lane, and the ownership check that runs
 * before it is spawned (DEV-CONTRACTS §5.5).
 *
 *   node <root>/scripts/lane-brief.mjs <slug> --lane <x> [--tasks TASK-a,TASK-b] [--limit 5] [--json]
 *       the given tasks (or the lane's next ready ones) as full rows, their dependencies' status,
 *       the lane's file ownership, and the open sections of its lane note
 *   node <root>/scripts/lane-brief.mjs check <slug> --lane <x> [--tasks …] [--json]
 *       every Files path of those tasks that the plan's ownership gives to another lane
 *   node <root>/scripts/lane-brief.mjs merge <slug> --lane <x> --worktree <path> [--branch <b>]
 *       [--compose <project>] [--no-merge]
 *       merge the lane into the current branch (`merge(lane-<x>): <its Done: ids>`), then remove its
 *       compose project, worktree and branch in the same step; `--no-merge` only cleans a lane that
 *       is already merged. Branch defaults to `<current branch>-lane-<x>`.
 *
 * Why `merge` cleans up too: on anime-blog the orchestrator merged every lane and moved on, and the
 * owner had to ask for the leftover worktrees, branches and databases to go (release-management
 * left 83 worktrees). A rule in prose was skipped under load; one command that cannot merge without
 * cleaning is not. It refuses, before touching anything, when either checkout is dirty.
 *
 * Why this exists: an implementer told to read `tasks.md` in full pays for every row of every lane
 * on every spawn (127 rows, ~150 KB on anime-blog) to build three of them. And a Files cell that
 * names another lane's file was found two hours into a spawn, when the implementer stopped to ask;
 * the check moves that stop to before the spawn, where it costs nothing.
 *
 * What it reads, all from `plan/<slug>/tasks.md` and nothing it writes:
 *   - `## Tasks`, by column name, so a plan with extra or reordered columns still reads. Id, Files
 *     and Depends on are required; without them it says which columns it found and exits 2.
 *   - The lane table (header `Lane | Owns`): the globs each lane owns, in code spans.
 *   - The prose beside it: "`a` and `b` belong to `platform`", "`x` stays with `content`",
 *     "`t` is written only by TASK-038 (`content`)". A named file is an exception to the globs.
 *   - The slice table (a `lane` column of `lane: TASK-…` groups): which lane a task is in.
 * Execution status comes from `implementation/<slug>/progress.md` (§8.1), never from tasks.md.
 *
 * Ownership of a path is its most specific rule: a file the prose names, then the glob with the
 * longest literal prefix. `scripts/eslint/**` (platform) beats `scripts/**` (ops). Two lanes tied
 * on one path is reported as contested, because the plan, not this script, has to say who owns it.
 * A path no rule claims is listed as unowned and does not fail the check: the plan lets the one task
 * that writes an unclaimed test own it. Paths under the SDLC root are process artifacts, not code.
 *
 * Exit: brief 0; check 0 clean, 1 a path owned by another lane or contested; 2 usage or a plan it
 * cannot read.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDoc, plain, readTable, splitCells } from './lib/doc.mjs';
import { rootFromArgv, hasRootPrefix } from './lib/root.mjs';
import { dependsOn, latestProgress, readProgress } from './lib/tasks.mjs';
import { globToRegExp } from './risk-paths.mjs';

const TASK_ID = /^TASK-\d{3,}$/;
const NOTE_SECTIONS = ['Known weaknesses', 'Not done'];
const NOTE_TAIL = 40;
const REQUIRED = ['id', 'files', 'depends on'];

/** `a/{b,c}/d` → `a/b/d`, `a/c/d`; nested and repeated groups expand left to right. */
export function expandBraces(p) {
  const m = /\{([^{}]*)\}/.exec(p);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expandBraces(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length)));
}

/** A Files cell as paths: split on `·`, `,` or `;`, code spans unwrapped, prose and `none` dropped. */
export function splitFiles(cell) {
  // A comma inside `{a,b}` is an alternative, not a separator.
  return plain(cell).split(/\s*(?:[·;]|,(?![^{]*\}))\s*/).map((s) => s.trim())
    .filter((s) => s && !/^(?:—|-|none|n\/a)$/i.test(s) && !/\s/.test(s));
}

/** Only code spans that look like a path or a glob; `(site)` or `todo` in prose are not files. */
const pathSpans = (text) => [...String(text).matchAll(/`([^`\s]+)`/g)].map((m) => m[1])
  .filter((s) => !/^\(.*\)$/.test(s) && !s.includes('<') && (/[/.*]/.test(s) || /^[A-Z][\w-]*$/.test(s)));

/**
 * An Owns cell as { globs, not }. "`scripts/**` other than `scripts/eslint/**`" owns the first and
 * not the second, so the clause after "other than" / "except" is cut out of the claim; reading it as
 * a claim would make the lane contest a path it hands away.
 */
export function ownsCell(cell) {
  const globs = [];
  const not = [];
  for (const part of String(cell ?? '').split(/,(?![^{]*\})/)) {
    const [mine, ...rest] = part.split(/\b(?:other than|except(?: for)?|excluding|but not)\b/i);
    globs.push(...pathSpans(mine));
    not.push(...pathSpans(rest.join(' ')));
  }
  return { globs, not };
}

/** Characters before the first wildcard: how specific a glob is. */
const literalPrefix = (g) => g.split(/[*?{]/)[0].length;
/** One concrete path a glob matches, to ask whether another lane's glob covers it. */
const sample = (g) => expandBraces(g)[0].replace(/\*\*/g, 'x').replace(/[*?]/g, 'x');

/**
 * The plan as this script needs it, or `{ error }` naming what is missing.
 * @returns {{ columns: string[], tasks: Map<string, object>, order: string[], lanes: Map<string, {globs: string[]}>,
 *            files: Map<string, string>, laneOf: Map<string, string>, sliceOf: Map<string, string>, error?: string }}
 */
export function readPlan(text) {
  const body = parseDoc(text).body;
  const rows = readTable(body, 'Tasks');
  const columns = rows.length ? Object.keys(rows[0]) : headerOf(body, 'Tasks');
  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (!rows.length && !columns.length) return { error: 'tasks.md has no `## Tasks` table' };
  if (missing.length) return { error: `tasks.md \`## Tasks\` has columns ${columns.map((c) => `\`${c}\``).join(', ') || '(none)'}; lane-brief needs ${missing.map((c) => `\`${c}\``).join(', ')}` };

  const tasks = new Map();
  const order = [];
  for (const row of rows) {
    const id = plain(row.id);
    if (!TASK_ID.test(id)) continue;
    tasks.set(id, { id, row, files: splitFiles(row.files).flatMap(expandBraces), depends: dependsOn(row['depends on']) });
    order.push(id);
  }

  const lanes = new Map();
  const laneOf = new Map();
  const sliceOf = new Map();
  for (const t of tables(body)) {
    const h = t.header;
    const owns = h.findIndex((c) => /^owns?\b/.test(c));
    if (h[0] === 'lane' && owns > 0) {
      for (const r of t.rows) {
        const lane = plain(r[0]);
        if (lane) lanes.set(lane, ownsCell(r[owns]));
      }
      continue;
    }
    const by = h.findIndex((c) => /lane/.test(c));
    if (by === -1) continue;
    const slice = h.findIndex((c) => c === 'slice');
    for (const r of t.rows) {
      for (const group of String(r[by] ?? '').split('·')) {
        const m = /^\s*`?([a-z][a-z0-9-]*)`?\s*:(.*)$/.exec(group);
        if (!m) continue;
        for (const id of m[2].match(/TASK-\d{3,}/g) ?? []) {
          laneOf.set(id, m[1]);
          if (slice !== -1) sliceOf.set(id, plain(r[slice]));
        }
      }
    }
  }
  return { columns, tasks, order, lanes, files: proseOwnership(body, new Set([...lanes.keys(), ...laneOf.values()])), laneOf, sliceOf };
}

function headerOf(body, heading) {
  const lines = body.split('\n');
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  const row = at === -1 ? null : lines.slice(at + 1).find((l) => l.trim().startsWith('|') || l.startsWith('## '));
  return row && row.trim().startsWith('|') ? splitCells(row).map((c) => c.toLowerCase()) : [];
}

/** Every markdown table in the body, as { header (lower-case), rows (cells) }. */
function tables(body) {
  const out = [];
  let cur = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) { cur = null; continue; }
    const cells = splitCells(line);
    if (!cur) { cur = { header: cells.map((c) => plain(c).toLowerCase()), rows: [] }; out.push(cur); continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    cur.rows.push(cells);
  }
  return out;
}

/**
 * Files the prose hands to a lane by name. A sentence is cut at each lane anchor ("to `x`",
 * "with `x`", "by TASK-NNN (`x`)"), and the paths since the previous anchor go to that lane, so
 * "`a` stays with `content`, `b` with `platform`" gives each its own owner.
 */
export function proseOwnership(body, lanes) {
  const out = new Map();
  const text = body.split('\n').filter((l) => !l.trim().startsWith('|')).join('\n');
  for (const sentence of text.split(/\.\s+|\n\s*\n/)) {
    if (!/\b(?:belongs?|stays?|written only)\b/.test(sentence)) continue;
    const anchor = /(?:\b(?:to|with)\s+|\bby\s+TASK-\d+\s+\()`([a-z][a-z0-9-]*)`/g;
    let from = 0;
    for (const m of sentence.matchAll(anchor)) {
      if (!lanes.has(m[1])) continue;
      for (const p of pathSpans(sentence.slice(from, m.index))) for (const e of expandBraces(p)) out.set(e, m[1]);
      from = m.index + m[0].length;
    }
  }
  return out;
}

/** Who owns one path: { lane, rule, contested? } or { lane: null } when no rule claims it. */
export function ownerOf(path, plan) {
  if (plan.files.has(path)) return { lane: plan.files.get(path), rule: path };
  let best = null;
  for (const [lane, { globs }] of plan.lanes) {
    if (plan.lanes.get(lane).not?.some((g) => globToRegExp(g).test(path))) continue;
    for (const g of globs) {
      if (!globToRegExp(g).test(path)) continue;
      const score = literalPrefix(g);
      if (!best || score > best.score) best = { lane, rule: g, score, others: [] };
      else if (score === best.score && lane !== best.lane) best.others.push(lane);
    }
  }
  if (!best) return { lane: null };
  return best.others.length ? { lane: best.lane, rule: best.rule, contested: [best.lane, ...best.others] } : { lane: best.lane, rule: best.rule };
}

/** The lane's globs, the files the prose gives it, and the paths under its globs that another lane holds. */
export function laneOwnership(plan, lane) {
  const globs = plan.lanes.get(lane)?.globs ?? [];
  const named = [...plan.files].filter(([, l]) => l === lane).map(([p]) => p);
  const except = [];
  for (const [other, { globs: og }] of plan.lanes) {
    if (other === lane) continue;
    for (const g of og) if (ownerOf(sample(g), plan).lane === other && globs.some((m) => globToRegExp(m).test(sample(g)))) except.push({ rule: g, lane: other });
  }
  for (const [p, other] of plan.files) {
    if (other !== lane && globs.some((m) => globToRegExp(m).test(p))) except.push({ rule: p, lane: other });
  }
  return { globs, named, except };
}

/**
 * The tasks to brief: the ones asked for, or the lane's next ready ones in plan order. A task is
 * ready when every dependency is done or already picked for this spawn, since one implementer
 * works its list in dependency order.
 */
export function pickTasks(plan, lane, done, { tasks = null, limit = 5 } = {}) {
  if (tasks) return { picked: tasks.filter((id) => plan.tasks.has(id)), unknown: tasks.filter((id) => !plan.tasks.has(id)) };
  let mine = plan.order.filter((id) => plan.laneOf.get(id) === lane && !done.has(id));
  // Slices run in order (§5.5): a later slice's task is never next while this lane has an open one earlier.
  const slices = mine.map((id) => Number(plan.sliceOf.get(id))).filter(Number.isFinite);
  if (slices.length) mine = mine.filter((id) => Number(plan.sliceOf.get(id)) === Math.min(...slices));
  const picked = [];
  let grew = true;
  while (grew && picked.length < limit) {
    grew = false;
    for (const id of mine) {
      if (picked.length >= limit) break;
      if (picked.includes(id)) continue;
      if (plan.tasks.get(id).depends.every((d) => done.has(d) || picked.includes(d))) { picked.push(id); grew = true; }
    }
  }
  // An empty brief must say why, or the orchestrator spawns an implementer with nothing to do.
  const waiting = mine.filter((id) => !picked.includes(id))
    .map((id) => ({ id, on: plan.tasks.get(id).depends.filter((d) => !done.has(d) && !picked.includes(d)) }));
  return { picked, unknown: [], waiting };
}

/** Every Files path of the given tasks, with its owner; `foreign` holds the ones the lane may not write. */
export function checkOwnership(plan, lane, ids) {
  const rows = [];
  for (const id of ids) {
    for (const file of plan.tasks.get(id)?.files ?? []) {
      if (hasRootPrefix(file)) continue;
      const o = ownerOf(file, plan);
      const state = !o.lane ? 'unowned' : o.contested ? 'contested' : o.lane === lane ? 'own' : 'foreign';
      rows.push({ task: id, file, owner: o.lane, rule: o.rule ?? null, contested: o.contested ?? null, state });
    }
  }
  return { rows, foreign: rows.filter((r) => r.state === 'foreign' || r.state === 'contested'), unowned: rows.filter((r) => r.state === 'unowned') };
}

/** `## Known weaknesses` and `## Not done` of a lane note, else its last lines. */
export function noteExcerpt(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const heads = lines.map((l, i) => (/^## /.test(l) ? i : -1)).filter((i) => i !== -1);
  const parts = [];
  for (const name of NOTE_SECTIONS) {
    const at = heads.find((i) => lines[i].slice(3).trim().toLowerCase() === name.toLowerCase());
    if (at === undefined) continue;
    const end = heads.find((i) => i > at) ?? lines.length;
    parts.push(lines.slice(at, end).join('\n').replace(/\n+$/, ''));
  }
  return parts.length ? parts.join('\n\n') : lines.slice(-NOTE_TAIL).join('\n').trim();
}

function load(root, slug) {
  const path = join(root, 'plan', slug, 'tasks.md');
  if (!existsSync(path)) return { error: `no ${join('plan', slug, 'tasks.md')} under ${root}` };
  const plan = readPlan(readFileSync(path, 'utf8'));
  if (plan.error) return plan;
  const prog = join(root, 'implementation', slug, 'progress.md');
  const latest = existsSync(prog) ? latestProgress(readProgress(readFileSync(prog, 'utf8'))) : new Map();
  plan.status = new Map([...latest].map(([id, r]) => [id, r]));
  plan.done = new Set([...latest].filter(([, r]) => r.status === 'done').map(([id]) => id));
  plan.bytes = readFileSync(path).length;
  return plan;
}

const statusOf = (plan, id) => plan.status.get(id)?.status || 'todo';

function renderBrief(b) {
  const out = [`lane-brief ${b.slug} --lane ${b.lane} — ${b.tasks.length} task(s); tasks.md ${b.planBytes} bytes, this brief ~${b.bytes}`];
  out.push('', '## Ownership');
  if (!b.ownership.globs.length && !b.ownership.named.length) out.push('No lane table names this lane: ownership is undeclared.');
  if (b.ownership.globs.length) out.push(`Owns: ${b.ownership.globs.map((g) => `\`${g}\``).join(', ')}`);
  if (b.ownership.named.length) out.push(`Also: ${b.ownership.named.map((g) => `\`${g}\``).join(', ')}`);
  if (b.ownership.except.length) out.push(`Not yours: ${b.ownership.except.map((e) => `\`${e.rule}\` (${e.lane})`).join(', ')}`);
  const bad = b.check.foreign;
  out.push(bad.length ? `CONFLICT: ${bad.map((r) => `${r.task} \`${r.file}\` → ${r.contested ? `contested by ${r.contested.join(', ')}` : r.owner}`).join('; ')}` : 'Files check: every Files path is this lane\'s or unclaimed.');
  for (const t of b.tasks) {
    out.push('', `## ${t.id} (slice ${t.slice ?? '?'}, lane ${t.lane ?? '?'})`);
    for (const [k, v] of Object.entries(t.row)) if (k !== 'id') out.push(`- ${k}: ${v}`);
    if (t.deps.length) out.push(`- dependency status: ${t.deps.map((d) => `${d.id} ${d.status}${d.lane && d.lane !== b.lane ? ` (${d.lane})` : ''}`).join(', ')}`);
  }
  if (!b.tasks.length) out.push('', b.waiting?.length ? `Nothing ready. Waiting: ${b.waiting.map((w) => `${w.id} on ${w.on.join(', ')}`).join('; ')}` : 'Nothing left for this lane.');
  out.push('', `## Lane note (${b.note.path})`, b.note.text || '(no lane note yet)');
  return out.join('\n');
}

function renderCheck(slug, lane, ids, c) {
  const out = [`lane-brief check ${slug} --lane ${lane} — ${ids.join(', ') || '(no tasks)'}: ${c.rows.length} path(s), ${c.foreign.length} owned by another lane, ${c.unowned.length} unclaimed`];
  for (const r of c.foreign) out.push(`  FOREIGN  ${r.task}  ${r.file}  → ${r.contested ? `contested: ${r.contested.join(', ')}` : `${r.owner} (${r.rule})`}`);
  for (const r of c.unowned) out.push(`  unowned  ${r.task}  ${r.file}`);
  if (c.foreign.length) out.push('Do not spawn: move the file to the owning lane\'s task, or make the task depend on one there (§5.5).');
  return out.join('\n');
}

/** `Done: TASK-…` ids of the commits on `branch` that HEAD does not have, in commit order. */
function doneIds(git, branch) {
  const log = git('log', '--reverse', '--format=%B', `HEAD..${branch}`);
  if (log.status !== 0) return null;
  const ids = [];
  for (const m of log.stdout.matchAll(/^Done:\s*(.+)$/gim)) {
    for (const id of m[1].match(/TASK-\d{3,}/g) ?? []) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Merge a finished lane and remove everything it ran on. Returns an exit code; each step prints
 * one line so a stop says exactly how far it got.
 */
export function mergeLane({ cwd = process.cwd(), lane, worktree: given, branch, compose, merge = true }) {
  // `git worktree list` prints absolute paths; a relative `--worktree ../x` never matched it, so the
  // first real run merged, skipped the worktree as "not a worktree", and then failed on the branch.
  const worktree = given ? resolve(cwd, given) : given;
  const git = (...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const say = (s) => console.log(`lane-brief merge: ${s}`);
  const fail = (s) => { console.error(`lane-brief merge: ${s}`); return 1; };
  const current = git('branch', '--show-current').stdout.trim();
  const laneBranch = branch ?? `${current}-lane-${lane}`;
  if (git('rev-parse', '--verify', '--quiet', laneBranch).status !== 0) return fail(`no branch ${laneBranch}`);
  if (git('status', '--porcelain').stdout.trim()) return fail(`${cwd} has uncommitted changes; nothing done`);
  const listed = git('worktree', 'list', '--porcelain').stdout;
  const hasWorktree = worktree && listed.split('\n').some((l) => l.startsWith('worktree ') && samePath(l.slice(9), worktree));
  if (worktree && !hasWorktree && existsSync(worktree)) return fail(`${worktree} exists but is not a worktree of this repository; nothing done`);
  if (hasWorktree && spawnSync('git', ['status', '--porcelain'], { cwd: worktree, encoding: 'utf8' }).stdout.trim()) {
    return fail(`${worktree} has uncommitted changes; nothing done`);
  }
  if (merge) {
    const ids = doneIds(git, laneBranch) ?? [];
    const r = git('merge', '--no-ff', laneBranch, '-m', `merge(lane-${lane}): ${ids.join(', ') || 'no Done: trailers'}`);
    if (r.status !== 0) return fail(`merge stopped (resolve it, commit, then rerun with --no-merge):\n${r.stdout}${r.stderr}`);
    say(`merged ${laneBranch} (${ids.length} task(s))`);
  } else if (git('merge-base', '--is-ancestor', laneBranch, 'HEAD').status !== 0) {
    return fail(`${laneBranch} is not merged into ${current}; nothing removed`);
  }
  if (compose) {
    const d = spawnSync('docker', ['compose', '-p', compose, 'down', '-v'], { cwd, encoding: 'utf8' });
    say(d.status === 0 ? `compose project ${compose} down, volumes removed` : `compose ${compose}: ${(d.stderr || '').trim().split('\n').pop()}`);
  }
  if (hasWorktree) {
    const w = git('worktree', 'remove', worktree);
    if (w.status !== 0) return fail(`worktree remove: ${w.stderr.trim()}`);
    // On Windows a build folder still held by a dev server (`.next`) survives `worktree remove`,
    // which reports success; on anime-blog that blocked the next `worktree add` at the same path.
    if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true, maxRetries: 5 });
    if (existsSync(worktree)) return fail(`${worktree} is still there (a process holds a file in it); stop it and rerun with --no-merge`);
    say(`worktree ${worktree} removed`);
  }
  git('worktree', 'prune');
  const b = git('branch', '-d', laneBranch);
  if (b.status !== 0) return fail(`branch -d: ${b.stderr.trim()}`);
  say(`branch ${laneBranch} deleted`);
  return 0;
}

const samePath = (a, b) => a.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  === b.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();

export function main(argv) {
  const opt = (f) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  const flagged = new Set(['--lane', '--tasks', '--limit', '--root', '--worktree', '--branch', '--compose'].flatMap((f) => [f, opt(f)]));
  const pos = argv.filter((a) => !a.startsWith('--') && !flagged.has(a));
  if (pos[0] === 'merge') {
    const lane = opt('--lane');
    if (!pos[1] || !lane) {
      console.error('usage: lane-brief.mjs merge <slug> --lane <lane> --worktree <path> [--branch <b>] [--compose <project>] [--no-merge]');
      return 2;
    }
    return mergeLane({ lane, worktree: opt('--worktree'), branch: opt('--branch'), compose: opt('--compose'), merge: !argv.includes('--no-merge') });
  }
  const isCheck = pos[0] === 'check';
  const slug = isCheck ? pos[1] : pos[0];
  const lane = opt('--lane');
  if (!slug || !lane) {
    console.error('usage: lane-brief.mjs [check] <slug> --lane <lane> [--tasks TASK-a,TASK-b] [--limit 5] [--json] [--root <dir>]');
    return 2;
  }
  const plan = load(rootFromArgv(argv), slug);
  if (plan.error) { console.error(`lane-brief: ${plan.error}`); return 2; }
  const asked = opt('--tasks')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  if (!asked && !plan.laneOf.size) { console.error('lane-brief: tasks.md has no slice table naming lanes (`lane: TASK-…`); pass --tasks'); return 2; }
  const known = new Set([...plan.lanes.keys(), ...plan.laneOf.values()]);
  if (known.size && !known.has(lane)) { console.error(`lane-brief: no lane \`${lane}\` in the plan; lanes: ${[...known].sort().join(', ')}`); return 2; }
  const { picked, unknown, waiting } = pickTasks(plan, lane, plan.done, { tasks: asked, limit: Number(opt('--limit') ?? 5) });
  if (unknown.length) { console.error(`lane-brief: not in \`## Tasks\`: ${unknown.join(', ')}`); return 2; }
  const check = checkOwnership(plan, lane, picked);

  if (isCheck) {
    if (argv.includes('--json')) console.log(JSON.stringify({ slug, lane, tasks: picked, ...check }, null, 2));
    else console.log(renderCheck(slug, lane, picked, check));
    return check.foreign.length ? 1 : 0;
  }

  const root = rootFromArgv(argv);
  const notePath = join('implementation', slug, 'lanes', `lane-${lane}.md`);
  const noteFile = join(root, notePath);
  const brief = {
    slug, lane, planBytes: plan.bytes, waiting: waiting ?? [],
    ownership: laneOwnership(plan, lane),
    check,
    tasks: picked.map((id) => ({
      id, lane: plan.laneOf.get(id) ?? null, slice: plan.sliceOf.get(id) ?? null, status: statusOf(plan, id),
      row: plan.tasks.get(id).row,
      deps: plan.tasks.get(id).depends.map((d) => ({ id: d, status: statusOf(plan, d), lane: plan.laneOf.get(d) ?? null })),
    })),
    note: { path: notePath.split('\\').join('/'), text: existsSync(noteFile) ? noteExcerpt(readFileSync(noteFile, 'utf8')) : '' },
  };
  if (argv.includes('--json')) { console.log(JSON.stringify(brief, null, 2)); return 0; }
  brief.bytes = 0;
  const text = renderBrief(brief);
  brief.bytes = Buffer.byteLength(text);
  console.log(renderBrief(brief));
  return 0;
}

const isMain = process.argv[1] && /(^|[\\/])lane-brief\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
