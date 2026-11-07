#!/usr/bin/env node
/**
 * status.mjs — print the gate board from dev/state.json.
 *
 * A script rather than a prompt, for the same reason the doctor is: the board is a fact about files
 * on disk, and a fact should not pass through a model on its way to the screen. /sdlc-status runs
 * this; so does the SessionStart hook, with --brief, so every session opens knowing where things are.
 *
 *   node dev/scripts/status.mjs [--root dev] [--brief] [<slug>]
 *   node dev/scripts/status.mjs <slug> --ready
 *
 *   --ready   the tasks that are not done and whose dependencies are all done (wave 1), then the
 *             waves that become ready after it. Cycles and unknown ids are reported, and the tasks
 *             they strand are listed as never ready; either makes the exit code 1.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planWaves } from './lib/tasks.mjs';
import { rootFromArgv, rootPrefix } from './lib/root.mjs';

const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];
const MARK = {
  PASS: '✔', SKIPPED: '–', STALE: '⟳', BLOCKED: '✖', CHANGES_REQUESTED: '±',
  REVIEWING: '◑', AUTHORING: '◐', READY: '○', NOT_STARTED: '·',
};

/** The two states that let the next stage run (DEV-CONTRACTS §4.1). Mirrors build-state.mjs. */
const OPENS_NEXT = new Set(['PASS', 'SKIPPED']);

/** The root's repository-relative name (`.sdlc` or `dev`), for the commands this board prints. */
let PREFIX = 'dev';

function main(argv) {
  const root = rootFromArgv(argv);
  PREFIX = rootPrefix(root);
  const brief = argv.includes('--brief');
  const slug = argv.find((a) => !a.startsWith('--') && a !== argFor(argv, '--root'));
  const statePath = join(root, 'state.json');

  if (!existsSync(statePath)) {
    console.log(`sdlc: no ${statePath.replace(process.cwd(), '.')} yet — run \`node ${PREFIX}/scripts/build-state.mjs\` or any /sdlc-* command.`);
    return;
  }

  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (err) {
    console.log(`sdlc: state.json is not valid JSON (${err.message}). It is derived — regenerate it, do not edit it.`);
    process.exitCode = 1;
    return;
  }

  if (slug && argv.includes('--ready')) return printReady(state, slug);
  if (slug) return printOne(state, slug);
  return printBoard(state, brief);
}

/**
 * The waves come from state.json's `depends_on` and task status — which is read from progress.md
 * when it exists (§8.1), so a wave moves as soon as an implementer records a task done.
 */
function printReady(state, slug) {
  const i = (state.initiatives ?? []).find((x) => x.slug === slug);
  if (!i) {
    console.log(`sdlc: no initiative \`${slug}\`.`);
    process.exitCode = 1;
    return;
  }
  const tasks = i.tasks ?? [];
  if (!tasks.length) {
    console.log(`${slug}: no tasks — ${PREFIX}/plan/${slug}/tasks.md is missing or has no TASK rows.`);
    return;
  }

  const { waves, stuck, cycles, unknown } = planWaves(tasks);
  const done = tasks.filter((t) => t.status === 'done').length;
  const line = (t) => `  ${t.id} ${t.title}${t.status !== 'todo' ? `  [${t.status}]` : ''}`;

  console.log(`${slug} — ${tasks.length - done} task(s) not done, ${done} done`);
  waves.forEach((wave, n) => {
    console.log(`\nwave ${n + 1}${n === 0 ? ' (ready now)' : ''}`);
    for (const t of wave) console.log(line(t));
  });
  if (!waves.length && !stuck.length) console.log('\nall tasks are done.');

  for (const c of cycles) console.log(`\ncycle: ${c.join(' → ')}`);
  for (const u of unknown) console.log(`\nunknown: ${u.task} depends on ${u.dep}, which is not a task in tasks.md`);
  if (stuck.length) {
    console.log(`\nnever ready — on a cycle, or waiting on an unknown id or on a task that is`);
    for (const t of stuck) console.log(line(t));
  }
  if (cycles.length || unknown.length) process.exitCode = 1;
}

function printBoard(state, brief) {
  const initiatives = state.initiatives ?? [];
  if (initiatives.length === 0) {
    // GK is upstream of the ladder, so on a fresh install it is usually the real next step. Sending
    // someone to /sdlc-intake here would be answered two commands later by intake's own preflight
    // refusing to run without knowledge cards — a correct refusal arriving after a wasted round.
    const k = state.knowledge;
    const needsOnboard = !k?.cards?.length || !OPENS_NEXT.has(k?.state);
    const next = needsOnboard ? '/sdlc-onboard' : '/sdlc-intake <slug>';
    console.log(`${state.project}: no initiatives. Start with ${next}.`);
    printKnowledge(k);
    return;
  }

  const width = Math.max(10, ...initiatives.map((i) => i.slug.length));
  console.log(`${state.project} — ${initiatives.length} initiative(s) · index ${state.generated_at}`);
  console.log(`${'slug'.padEnd(width)}  class       ${GATES.map((g) => g.padStart(4)).join('')}   at    open  note`);

  for (const i of initiatives) {
    const strip = GATES.map((g) => MARK[i.stages.find((s) => s.gate === g)?.state ?? 'NOT_STARTED'].padStart(4)).join('');
    const open = i.stages.reduce((n, s) => n + (s.open_findings?.length ?? 0), 0);
    const note = noteFor(i);
    console.log(`${i.slug.padEnd(width)}  ${(i.change_class ?? '').padEnd(10)}  ${strip}   ${i.current_gate.padEnd(4)}  ${String(open || '—').padEnd(4)}  ${note}`);
  }

  // Before the brief cut-off, deliberately. --brief is what the SessionStart hook prints, and GK
  // being stale is precisely the thing worth knowing at the start of a session rather than three
  // stages in, when a design has already been written against cards nobody re-checked.
  printKnowledge(state.knowledge);

  if (brief) return;

  const open = initiatives.flatMap((i) => (i.decisions ?? []).filter((d) => d.status === 'open').map((d) => `${i.slug} ${d.id} — ${d.question}`));
  if (open.length) {
    console.log(`\nopen decisions (${open.length}) — answer them with /sdlc-ask:`);
    for (const line of open) console.log(`  ${line}`);
  }

  console.log(`\nlegend  ${Object.entries(MARK).map(([k, v]) => `${v} ${k.toLowerCase().replace('_', ' ')}`).join('  ')}`);
}

/**
 * GK gets a line of its own, always — including on a board with no initiatives yet.
 *
 * It was briefly printed only when the ladder had something on it, which meant a knowledge card
 * edited after its review left GK `STALE` and the board completely silent about it. A stale gate
 * nobody is told about is worse than no gate: the next stage reads cards that no longer match what
 * was checked, and the machinery that noticed is sitting in state.json saying so to nobody.
 */
function printKnowledge(k) {
  if (!k) return;
  const mark = MARK[k.state] ?? '?';
  const cards = k.cards?.length ? `${k.cards.length} card(s)` : 'no cards';
  const why =
    k.state === 'STALE' && k.stale_because?.length
      ? ` — ${trim(k.stale_because[0].path, 50)} changed since the review; re-run /sdlc-onboard --refresh`
      : k.state === 'AUTHORING'
        ? ' — cards written, not yet reviewed; run /sdlc-onboard'
        : k.state === 'NOT_STARTED'
          ? ' — run /sdlc-onboard'
          : '';
  console.log(`\n${mark} GK   knowledge        ${k.state.padEnd(18)} ${cards}${why}`);
}

function noteFor(i) {
  const blocked = i.stages.find((s) => s.state === 'BLOCKED');
  if (blocked) return `${blocked.gate} blocked — ${trim(blocked.blocked_reason, 60)}`;
  const stale = i.stages.find((s) => s.state === 'STALE');
  if (stale) return `${stale.gate} stale — ${trim(stale.stale_because?.[0]?.path, 60)}`;
  const changes = i.stages.find((s) => s.state === 'CHANGES_REQUESTED');
  if (changes) return `${changes.gate} changes requested (attempt ${changes.attempt})`;
  const active = i.stages.find((s) => s.state === 'AUTHORING' || s.state === 'REVIEWING');
  if (active) return `${active.gate} ${active.state.toLowerCase()}`;
  return '';
}

function printOne(state, slug) {
  const i = (state.initiatives ?? []).find((x) => x.slug === slug);
  if (!i) {
    console.log(`sdlc: no initiative \`${slug}\`. Known: ${state.initiatives.map((x) => x.slug).join(', ') || 'none'}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${i.slug} — ${i.title}`);
  console.log(`class ${i.change_class} · at ${i.current_gate} · tracker ${i.tracker}${i.blocked ? ' · BLOCKED' : ''}\n`);

  for (const s of i.stages) {
    const mark = MARK[s.state] ?? '?';
    const bits = [];
    if (s.attempt && s.attempt > 1) bits.push(`attempt ${s.attempt}`);
    if (s.open_findings?.length) bits.push(`open ${s.open_findings.join(', ')}`);
    if (s.stale_because?.length) bits.push(`stale: ${s.stale_because[0].role} ${s.stale_because[0].path}`);
    if (s.blocked_reason) bits.push(s.blocked_reason);
    if (s.skip_reason?.type) bits.push(`skipped ${s.skip_reason.type}`);
    console.log(`  ${mark} ${s.gate.padEnd(4)} ${s.stage.padEnd(15)} ${s.state.padEnd(18)} ${bits.join(' · ')}`);
  }

  if (i.tasks?.length) {
    const by = {};
    for (const t of i.tasks) by[t.status] = (by[t.status] ?? 0) + 1;
    console.log(`\ntasks: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
    for (const t of i.tasks.filter((x) => x.status === 'blocked')) console.log(`  ✖ ${t.id} ${t.title} — ${t.blocked_by ?? 'blocked'}`);
  }

  const open = (i.decisions ?? []).filter((d) => d.status === 'open');
  if (open.length) {
    console.log(`\nopen decisions:`);
    for (const d of open) console.log(`  ${d.id} — ${d.question}${d.blocks?.length ? ` (blocks ${d.blocks.join(', ')})` : ''}`);
  }

  const next = nextCommand(i);
  if (next) console.log(`\nnext: ${next}`);
}

function nextCommand(i) {
  // A decision that blocks a gate blocks the initiative (§15.2), so the stage command would refuse
  // at preflight. Naming it anyway sends someone to a command that exists only to turn them around
  // — the same failure as pointing a fresh brownfield repo at /sdlc-intake before /sdlc-onboard.
  const blockingDecisions = (i.decisions ?? []).filter((d) => d.status === 'open' && d.blocking);
  if (blockingDecisions.length) {
    return `/sdlc-ask ${i.slug}   (${blockingDecisions.length} decision(s) block this; only a human can answer them)`;
  }

  const s = i.stages.find((x) => !['PASS', 'SKIPPED'].includes(x.state));
  if (!s) return null;
  const cmd = { G0: 'intake', G1: 'requirements', G2: 'design', G3: 'data', G4: 'api', G5: 'ui', G6: 'plan', G7: 'implement', G8: 'verify', G9: 'ship', G10: 'deploy', G11: 'monitor' }[s.gate];
  if (s.state === 'STALE') {
    // When the gate's own output moved, --reaffirm applies only inside the §4.4 self-edit bound, and
    // only a script can say whether the edit is inside it — so name the check before the command.
    const own = s.stale_because?.find((c) => c.role === 'output');
    return own
      ? `/sdlc-${cmd} ${i.slug}   (${trim(own.path, 50)} changed after review; if \`node ${PREFIX}/scripts/reaffirm-check.mjs ${own.path} --against ${String(own.was).slice(0, 12)}\` says within the bound, /sdlc-gate ${i.slug} ${s.gate} --reaffirm instead)`
      : `/sdlc-gate ${i.slug} ${s.gate} --reaffirm   (or re-run /sdlc-${cmd} ${i.slug})`;
  }
  if (s.state === 'BLOCKED') return `resolve: ${s.blocked_reason ?? 'see the gate log'}`;
  if (s.state === 'CHANGES_REQUESTED') return `/sdlc-${cmd} ${i.slug}   (attempt ${(s.attempt ?? 1) + 1})`;
  return `/sdlc-${cmd} ${i.slug}`;
}

function trim(text, n) {
  const t = String(text ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

main(process.argv.slice(2));
