#!/usr/bin/env node
/**
 * autonomy.mjs — the one place an unattended run asks "may I?" (DEV-CONTRACTS §4.6).
 *
 *   node dev/scripts/autonomy.mjs mode
 *   node dev/scripts/autonomy.mjs start --run <run-id> --by "<the human who turned it on>"
 *   node dev/scripts/autonomy.mjs check <action> --run <run-id> [--slug <slug>]
 *   node dev/scripts/autonomy.mjs assume <slug> <DEC-NNN> --run <run-id> --reason "<why>"
 *   node dev/scripts/autonomy.mjs budget --run <run-id> [--tokens <n>]
 *   node dev/scripts/autonomy.mjs report --run <run-id>
 *   node dev/scripts/autonomy.mjs resolve --run <run-id> --by "<the human who reviewed its stops>"
 *
 * The mode is SDLC_AUTONOMY, else DEV-PROFILE §Gate policy `Autonomy`, else `off`:
 *
 *   off       today's behaviour: every choice and every outward step goes to a human.
 *   assisted  a DEC that blocks no gate is taken on its recommended default; one that does is asked.
 *   full      every DEC is taken on its recommended default; the run goes G0 → G9 without asking.
 *
 * A taken default is a ledger row with `status: assumed` and the answer
 * `<default> — who: autonomous-run <run-id> (started by <name>); reason: …; alternatives: …`. The
 * human who turned the run on is named in `runs/<run-id>/run.json`, so `assumed` still traces to a
 * person (E017), and a run nobody started cannot assume anything. It is still an assumption: it
 * stays in Needs you, and one unconfirmed at G9 is a MAJOR there (§15.2).
 *
 * Hard stops hold in every mode. `check` exits 3 for each, writes a `stop` event (lib/activity.mjs)
 * and a line in the run's stops, so the run report and the addons show it:
 *
 *   outward      deploy-prod · merge-main · push-main · delete-data · spend
 *   security     suppress-scanner · widen-access
 *   sign-off     ui-approval · release-signoff   (provisional: the run goes on, merge waits)
 *   budget       the run's tokens or minutes are over SDLC_BUDGET_TOKENS / SDLC_BUDGET_MINUTES
 *
 * A sign-off stop is `provisional`: exit 4, the run may continue on the branch, and merge-main
 * then stops until a human signs. Exit 0 means allowed. Exit 2 is a usage error.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProfile, setting } from './lib/profile.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { logActivity, makeEvent } from './lib/activity.mjs';
import { readTable, parseDoc, plain, splitCells } from './lib/doc.mjs';

export const MODES = ['off', 'assisted', 'full'];
export const HARD = {
  'deploy-prod': 'outward', 'merge-main': 'outward', 'push-main': 'outward', 'delete-data': 'outward', spend: 'outward',
  'suppress-scanner': 'security', 'widen-access': 'security',
  'ui-approval': 'sign-off', 'release-signoff': 'sign-off',
};
const NEEDS = { outward: 'review-stop', security: 'review-stop', 'sign-off': 'sign-off', budget: 'review-stop' };
const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
export const WHO = (run) => `autonomous-run ${run}`;

export function mode(profileText, env = process.env) {
  const raw = String(env.SDLC_AUTONOMY ?? setting(profileText, 'Autonomy') ?? 'off').toLowerCase();
  return MODES.includes(raw) ? raw : 'off';
}

const runDir = (root, run) => join(root, 'runs', run);

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** Record a stop: one line in the run's stops.jsonl and one activity event. */
function stop(root, run, slug, action, cls, outcome) {
  mkdirSync(runDir(root, run), { recursive: true });
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  appendFileSync(join(runDir(root, run), 'stops.jsonl'), `${JSON.stringify({ at, action, class: cls, slug, outcome })}\n`);
  logActivity(root, [makeEvent({ kind: 'stop', slug, outcome: 'stopped', title: `Stopped before ${action} (${cls}${outcome === 'provisional' ? ', provisional' : ''})`, link: reportLink(root, run), run_id: run, needs: NEEDS[cls] })]);
}

const reportLink = (root, run) => relative(join(root, '..'), join(runDir(root, run), 'report.md')).split('\\').join('/');

/** A human reviewed the run's stops: one `pass` per slug with the same link clears them from Needs you. */
export function resolveRun(root, run, by) {
  const file = join(runDir(root, run), 'stops.jsonl');
  const slugs = [...new Set(readStops(file).map((s) => s.slug ?? null))];
  logActivity(root, slugs.map((slug) => makeEvent({ kind: 'stop', slug, outcome: 'pass', title: `Stops of run ${run} reviewed by ${by}`.slice(0, 120), link: reportLink(root, run), run_id: run })));
  return slugs.length;
}

/** stops.jsonl, a line torn by a crash skipped. */
function readStops(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/** The budget state of a run, and whether it is over. */
export function budgetState(root, run, env = process.env, now = Date.now()) {
  const file = join(runDir(root, run), 'budget.json');
  const b = readJson(file, null) ?? { started: now, tokens: 0 };
  const maxTokens = Number(env.SDLC_BUDGET_TOKENS) || null;
  const maxMinutes = Number(env.SDLC_BUDGET_MINUTES) || null;
  const minutes = (now - b.started) / 60000;
  const over = (maxTokens && b.tokens > maxTokens) ? `tokens ${b.tokens} > ${maxTokens}` : (maxMinutes && minutes > maxMinutes) ? `minutes ${Math.round(minutes)} > ${maxMinutes}` : null;
  return { file, b, over, minutes };
}

/** `check`: 0 allowed, 3 stop, 4 provisional sign-off. Every action is also checked against the budget. */
export function check(root, run, action, { slug = null, env = process.env, now = Date.now() } = {}) {
  const budget = budgetState(root, run, env, now);
  if (budget.over) { stop(root, run, slug, action, 'budget', 'stopped'); return { code: 3, why: `budget exceeded: ${budget.over}` }; }
  const cls = HARD[action];
  if (!cls) return { code: 0, why: 'not a hard stop' };
  if (cls === 'sign-off') { stop(root, run, slug, action, cls, 'provisional'); return { code: 4, why: 'a named human signs this; the run may continue on its branch, merge waits' }; }
  if (action === 'merge-main' && provisional(root, run).length) { stop(root, run, slug, action, cls, 'stopped'); return { code: 3, why: 'outward, and sign-offs are still provisional' }; }
  stop(root, run, slug, action, cls, 'stopped');
  return { code: 3, why: `${cls}: only a human does this` };
}

function provisional(root, run) {
  const file = join(runDir(root, run), 'stops.jsonl');
  if (!existsSync(file)) return [];
  return readStops(file).filter((s) => s.outcome === 'provisional');
}

/**
 * `assume`: take a DEC's recommended default, as the mode allows. Rewrites that one ledger row; the
 * rest of the file is untouched. Returns `{ code, why }`: 0 written, 3 the mode says ask.
 */
export function assume(root, slug, dec, run, reason, profileText, env = process.env) {
  const m = mode(profileText, env);
  if (m === 'off') return { code: 3, why: 'autonomy is off: put it to a human with /sdlc-ask' };
  const started = readJson(join(runDir(root, run), 'run.json'), null);
  if (!started?.by) return { code: 2, why: `run ${run} was not started with --by <name>: no human authorised it` };
  const file = join(root, 'decisions', `${slug}.md`);
  if (!existsSync(file)) return { code: 2, why: `no ledger at ${file}` };
  const text = readFileSync(file, 'utf8');
  const row = readTable(parseDoc(text).body, 'Decisions').find((r) => plain(r.id) === dec);
  if (!row) return { code: 2, why: `${dec} is not in the ledger` };
  if (plain(row.status) !== 'open') return { code: 2, why: `${dec} is ${plain(row.status)}, not open` };
  const blocksGate = /\bG\d{1,2}\b/.test(row.blocks ?? '');
  if (m === 'assisted' && blocksGate) return { code: 3, why: `${dec} blocks a gate: assisted mode asks a human` };
  const def = plain(row['recommended default']);
  if (!def) return { code: 2, why: `${dec} has no recommended default to take` };
  // A default often qualifies its option ("title only for v1" for the option "title only").
  const alternatives = plain(row.options).split(/\s*·\s*/).filter((o) => o && !def.toLowerCase().startsWith(o.toLowerCase())).join(' · ') || 'none';
  const answer = `${def} — who: ${WHO(run)} (started by ${started.by}); reason: ${reason.replace(/\|/g, '/')}; alternatives: ${alternatives}`;
  // Cells as GitHub splits them (an escaped `\|` stays inside its cell), the row found by its plain
  // id (a bold **DEC-002** is the same row), and the columns found by the header, not by position.
  const lines = text.split('\n');
  const body = parseDoc(text).body.split('\n');
  const head = body.findIndex((l) => /^\|\s*Id\s*\|/i.test(l.trim()) && /\|\s*Status\s*\|/i.test(l));
  const cols = splitCells(body[head] ?? '').map((c) => c.toLowerCase());
  const status = cols.indexOf('status');
  const answerCol = cols.indexOf('answer');
  const i = lines.findIndex((l) => l.trim().startsWith('|') && plain(splitCells(l)[0]) === dec);
  if (i === -1 || status === -1 || answerCol === -1) return { code: 2, why: `${dec}: no ledger row with Status and Answer columns to write` };
  const cells = splitCells(lines[i]);
  cells[status] = 'assumed';
  cells[answerCol] = answer;
  lines[i] = `| ${cells.map((c) => c.replace(/\\?\|/g, '\\|')).join(' | ')} |`;
  writeFileSync(file, lines.join('\n'));
  logActivity(root, [makeEvent({ kind: 'decision', slug, outcome: 'info', title: `${dec} assumed by ${WHO(run)}: ${def}`.slice(0, 120), run_id: run, needs: 'confirm-dec' })]);
  return { code: 0, why: answer };
}

/** `report`: the run, as the MR description. Gates from state.json, DECs from the ledgers, stops from the run. */
export function report(root, run) {
  const state = readJson(join(root, 'state.json'), { initiatives: [] });
  const started = readJson(join(runDir(root, run), 'run.json'), {});
  const out = [`# Autonomous run ${run}`, '', `Started by ${started.by ?? 'nobody recorded'}, mode \`${started.mode ?? 'unknown'}\`.`, ''];
  out.push('## Gates', '', '| Slug | Gate | State |', '|---|---|---|');
  for (const i of state.initiatives ?? []) for (const s of i.stages ?? []) if (s.state !== 'NOT_STARTED') out.push(`| ${i.slug} | ${s.gate} | ${s.state} |`);
  out.push('', '## Decisions taken on their default', '', '| Slug | Id | Answer |', '|---|---|---|');
  let decs = 0;
  for (const i of state.initiatives ?? []) {
    const file = join(root, 'decisions', `${i.slug}.md`);
    if (!existsSync(file)) continue;
    for (const r of readTable(parseDoc(readFileSync(file, 'utf8')).body, 'Decisions')) {
      if (plain(r.status) === 'assumed' && plain(r.answer).includes(WHO(run))) { out.push(`| ${i.slug} | ${plain(r.id)} | ${plain(r.answer)} |`); decs++; }
    }
  }
  if (!decs) out.push('| — | — | none |');
  out.push('', '## Stops', '', '| At | Action | Class | Outcome |', '|---|---|---|---|');
  const file = join(runDir(root, run), 'stops.jsonl');
  const stops = readStops(file);
  for (const s of stops) out.push(`| ${s.at} | ${s.action} | ${s.class} | ${s.outcome} |`);
  if (!stops.length) out.push('| — | — | — | none |');
  out.push('', 'Every assumed decision and every provisional sign-off waits for a named human before merge.', '');
  mkdirSync(runDir(root, run), { recursive: true });
  writeFileSync(join(runDir(root, run), 'report.md'), out.join('\n'));
  return { decs, stops: stops.length, text: out.join('\n') };
}

function main(argv) {
  const [verb, ...rest] = argv;
  const root = rootFromArgv(argv);
  const arg = (f) => (rest.indexOf(f) !== -1 ? rest[rest.indexOf(f) + 1] : undefined);
  const profile = readProfile(process.cwd()).text;
  const run = arg('--run');
  if (verb === 'mode') { console.log(mode(profile)); return 0; }
  if (!run || !RUN_ID.test(run)) { console.error('autonomy: --run <run-id from run-id.mjs> is required'); return 2; }
  if (verb === 'start') {
    const by = arg('--by');
    if (!by || /^(agent|claude|ai|bot|user|admin)$/i.test(by.trim())) { console.error('autonomy start: --by names the human who turned autonomy on'); return 2; }
    mkdirSync(runDir(root, run), { recursive: true });
    writeFileSync(join(runDir(root, run), 'run.json'), JSON.stringify({ run, by, mode: mode(profile), started: new Date().toISOString() }));
    writeFileSync(join(runDir(root, run), 'budget.json'), JSON.stringify({ started: Date.now(), tokens: 0 }));
    console.log(`run ${run} started by ${by}, mode ${mode(profile)}`);
    return 0;
  }
  if (verb === 'check') {
    const action = rest[0];
    if (!action || action.startsWith('--')) { console.error(`autonomy check: name an action (${Object.keys(HARD).join(', ')}, or any other)`); return 2; }
    const r = check(root, run, action, { slug: arg('--slug') ?? null });
    console.log(`${r.code === 0 ? 'allowed' : r.code === 4 ? 'provisional' : 'STOP'}: ${action} — ${r.why}`);
    return r.code;
  }
  if (verb === 'assume') {
    const [slug, dec] = rest;
    const reason = arg('--reason');
    if (!slug || !dec || !reason) { console.error('autonomy assume <slug> <DEC-NNN> --run <run-id> --reason "<why>"'); return 2; }
    const r = assume(root, slug, dec, run, reason, profile);
    console.log(`${r.code === 0 ? 'assumed' : 'ask'}: ${r.why}`);
    return r.code;
  }
  if (verb === 'budget') {
    const s = budgetState(root, run);
    s.b.tokens += Number(arg('--tokens') ?? 0) || 0;
    mkdirSync(runDir(root, run), { recursive: true });
    writeFileSync(s.file, JSON.stringify(s.b));
    const again = budgetState(root, run);
    console.log(again.over ? `over budget: ${again.over}` : `within budget: ${again.b.tokens} tokens, ${Math.round(again.minutes)} min`);
    return again.over ? 3 : 0;
  }
  if (verb === 'resolve') {
    const by = arg('--by');
    if (!by || /^(agent|claude|ai|bot|user|admin)$/i.test(by.trim())) { console.error('autonomy resolve: --by names the human who reviewed the stops'); return 2; }
    console.log(`resolved the stops of ${resolveRun(root, run, by)} slug(s)`);
    return 0;
  }
  if (verb === 'report') { const r = report(root, run); console.log(`report: ${r.decs} decision(s) taken, ${r.stops} stop(s) — ${join(runDir(root, run), 'report.md')}`); return 0; }
  console.error('usage: autonomy.mjs mode | check <action> | assume <slug> <DEC> | budget | report — with --run <run-id>');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
