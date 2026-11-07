#!/usr/bin/env node
/**
 * ui-score.mjs — the machine half of the UI score (DEV-CONTRACTS §13.13).
 *
 * release-management passed G5 and G7 with a UI whose look a human approved from shots, while its
 * states, roles and kit were nobody's check. The score keeps the look rows and adds the rest, and
 * this script fills every row a checker can decide from that checker's own `--json` output. The
 * reviewer decides the rows marked `UNKNOWN (reviewer)`, then pastes the table under `## Verdict`
 * as `### UI score`; lint-dev E145 recomputes it there.
 *
 *   node dev/scripts/ui-score.mjs <slug> --gate G5|G7|G8 [--root dev]
 *     [--rubric <ui-rubric --out json>] [--pseudo <ui-rubric --pseudo --out json>]
 *     [--consistency <ui-consistency --json>] [--kit <design-system kit-check --json>]
 *     [--classes <design-system classes --json>] [--inventory <ui-inventory --json>]
 *     [--copy <copy-lint --json>] [--trace <trace --json>] [--patterns <pattern-check --json>]
 *     [--perf <web-perf --out json>] [--privacy <ui-privacy --json>] [--golden <ui-snap --golden --json>]
 *     [--json] [--baseline <file>] [--write-baseline <file>]
 *
 * A checker whose file is not given is `NOT_RUN` for its rows, never `PASS`. A row outside the gate
 * is `N/A`. Row shape: `{ id, section, criterion, status, weight, evidence, mandatory }`, the shape a
 * sibling scorer shares. --baseline / --write-baseline pass through to lib/check.mjs `report()`:
 * a FAIL already recorded there is known debt.
 *
 * Exit 0 the machine rows give no FAIL · 1 a FAIL · 2 usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, parseArgs, report } from './lib/check.mjs';
import { readDoc } from './lib/doc.mjs';
import { behaviourRows } from './lib/behaviour.mjs';
import { readOperations } from './lib/perf.mjs';
import { checkMatrix, problemTypes } from './lib/error-ux.mjs';
import { checkResponsive, checkRoles, checkStates, checkTrace, screens } from './lib/ui-spec.mjs';
import { CRITERIA, judge, toMarkdown } from './lib/ui-score.mjs';
import { findRoot } from './lib/root.mjs';

const INPUTS = ['rubric', 'pseudo', 'consistency', 'kit', 'classes', 'inventory', 'copy', 'trace', 'patterns', 'perf', 'privacy', 'golden'];

function readJson(path) {
  if (!path) return null;
  if (!existsSync(path)) throw new Error(`${path}: no such file`);
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(text); } catch (err) { throw new Error(`${path}: not JSON (${err.message})`); }
}

const row = (status, evidence) => ({ status, evidence });
const notRun = (what) => row('NOT_RUN', `${what} not given`);
const count = (list, pred = () => true) => (Array.isArray(list) ? list.filter(pred).length : 0);

/** The rubric's findings, flattened: `[{ rule, level, width, name }]`. */
function rubricFindings(j) {
  return (j?.results ?? []).flatMap((r) => (r.findings ?? []).map((f) => ({ ...f, name: r.name, width: r.width })));
}

/** Each checker key → a function from the loaded inputs to `{ status, evidence }` per criterion id. */
export function machineRows({ spec, inputs }) {
  const out = {};
  const { rubric, pseudo, consistency, kit, classes, inventory, copy, trace, patterns, perf, privacy, golden } = inputs;

  if (spec) {
    const s = spec.findings;
    const of = (...rules) => s.filter((f) => rules.includes(f.rule) && f.rule.startsWith('E'));
    const roles = of('E142', 'E143');
    out.U02 = roles.length ? row('FAIL', `lint ${roles.length} × E142/E143: ${roles[0].message.slice(0, 120)}`) : row('PASS', `roles matrix: ${spec.screens} screen(s), every one covered, operations in the contract`);
    const states = of('E140', 'E141');
    out.U03 = states.length ? row('FAIL', `lint ${states.length} × E140/E141: ${states[0].message.slice(0, 120)}`) : row('PASS', `states: ${spec.screens} screen(s) × 9, no empty cell${count(s, (f) => f.rule === 'W140') ? ` (${count(s, (f) => f.rule === 'W140')} bare N/A)` : ''}`);
    const errux = of('E080', 'E081');
    out.U04 = errux.length ? row('FAIL', `lint ${errux.length} × E080/E081: ${errux[0].message.slice(0, 120)}`) : row('PASS', 'Error-UX matrix complete');
    const traceRows = of('E144', 'E143');
    out.U15 = traceRows.length ? row('FAIL', `lint ${traceRows.length} × E144/E143: ${traceRows[0].message.slice(0, 120)}`) : row('PASS', `traceability: every screen → component → operation → ids`);
  }

  if (rubric) {
    const f = rubricFindings(rubric);
    const hier = f.filter((x) => ['primary-count', 'nesting', 'heading-ratio', 'type-off-scale'].includes(x.rule));
    out.U07 = hier.some((x) => x.level === 'fail') ? row('FAIL', `ui-rubric: ${count(hier, (x) => x.level === 'fail')} hierarchy hard fail(s)`) : row('PASS', `ui-rubric: 0 hierarchy hard fail, ${hier.length} advisory`);
    const widths = [...new Set((rubric.results ?? []).map((r) => r.width))].sort((a, b) => b - a);
    const flow = f.filter((x) => ['overflow', 'clipped-column'].includes(x.rule));
    const missingWidth = [1024, 768, 360].filter((w) => !widths.includes(w));
    const resp = spec ? spec.findings.filter((x) => x.rule === 'W141').length : 0;
    if (flow.length) out.U10 = row('FAIL', `ui-rubric: ${flow.length} overflow / clipped at ${[...new Set(flow.map((x) => x.width))].join(', ')}`);
    else if (missingWidth.length) out.U10 = row('NOT_RUN', `ui-rubric ran at ${widths.join(', ')}; not at ${missingWidth.join(', ')}`);
    else out.U10 = row('PASS', `ui-rubric: no overflow or clipping at ${widths.join(', ')}${resp ? `; advisory: ${resp} breakpoint(s) with no responsive row (W141)` : ''}`);
    const ranAxe = (rubric.results ?? []).length && rubric.results.every((r) => r.axe === 'run');
    const a11y = f.filter((x) => ['axe-serious', 'target-size', 'focus-obscured'].includes(x.rule) && x.level === 'fail');
    if (a11y.length) out.U11 = row('FAIL', `ui-rubric: ${a11y.length} accessibility hard fail(s): ${[...new Set(a11y.map((x) => x.rule))].join(', ')}`);
    else if (!ranAxe) out.U11 = row('NOT_RUN', `axe-core not run — ${(rubric.results ?? []).find((r) => r.axeReason)?.axeReason ?? 'no axe-core'}`);
    else out.U11 = row('PASS', `axe run on ${rubric.results.length} page view(s): 0 serious or critical; targets and focus clean`);
  }

  if (kit || classes || inventory) {
    const fails = [];
    if (kit) { if (count(kit.findings)) fails.push(`kit-check ${kit.findings.length}`); } else fails.push(null);
    if (classes) { if (count(classes.dead) || count(classes.arbitrary)) fails.push(`classes ${count(classes.dead)} dead, ${count(classes.arbitrary)} arbitrary`); } else fails.push(null);
    if (inventory) { const e = count(inventory.findings, (x) => x.level === 'error'); if (e) fails.push(`ui-inventory ${e} second implementation(s)`); } else fails.push(null);
    const missing = ['kit-check', 'classes', 'ui-inventory'].filter((_, k) => fails.includes(null) && [kit, classes, inventory][k] == null);
    const real = fails.filter(Boolean);
    out.U05 = real.length ? row('FAIL', real.join(' · ')) : missing.length ? row('NOT_RUN', `${missing.join(', ')} not given`) : row('PASS', 'kit-check, classes and ui-inventory clean');
  }

  if (consistency) out.U06 = count(consistency.fails) ? row('FAIL', `ui-consistency: ${consistency.fails.length} role(s) with more than one value: ${consistency.fails.slice(0, 3).map((x) => x.role).join(', ')}`) : row('PASS', `ui-consistency: ${consistency.pages} page(s), one value per role`);

  if (trace || patterns) {
    const bits = [];
    let failed = false;
    if (trace) { const g = count(trace.gaps); if (g) failed = true; bits.push(`trace ${trace.counts?.traced ?? '?'}/${trace.counts?.required ?? '?'}`); }
    if (patterns) { const v = (patterns.results ?? []).reduce((a, r) => a + count(r.violations), 0); if (v) failed = true; bits.push(`pattern-check ${v} violation(s)`); }
    out.U08 = !trace || !patterns ? row(failed ? 'FAIL' : 'NOT_RUN', `${bits.join(' · ')}${!trace ? ' · trace not given' : ''}${!patterns ? ' · pattern-check not given' : ''}`) : row(failed ? 'FAIL' : 'PASS', bits.join(' · '));
  }

  if (copy || pseudo) {
    const bits = [];
    let failed = false;
    if (copy) { const n = count(copy.findings); if (n) failed = true; bits.push(`copy-lint ${n} finding(s)`); }
    if (pseudo) { const n = rubricFindings(pseudo).filter((x) => ['overflow', 'clipped-column', 'crushed-column'].includes(x.rule)).length; if (n) failed = true; bits.push(`pseudo-locale ${n} overflow/clip`); }
    out.U12 = failed ? row('FAIL', bits.join(' · ')) : copy && pseudo ? row('PASS', bits.join(' · ')) : row('NOT_RUN', `${bits.join(' · ')} · ${copy ? 'pseudo-locale run' : 'copy-lint'} not given`);
  }

  if (perf || rubric) {
    const bits = [];
    let failed = false;
    if (perf) { const b = count(perf.results, (r) => !r.ok); if (b) failed = true; bits.push(`web-perf ${perf.results?.length ?? 0} route(s), ${b} over budget`); }
    const render = rubric ? rubricFindings(rubric).filter((x) => ['long-list', 'image-assets', 'motion-reduce'].includes(x.rule)) : [];
    if (render.length) bits.push(`ui-rubric ${render.length} rendering advisory(ies): ${[...new Set(render.map((x) => x.rule))].join(', ')}`);
    out.U13 = failed ? row('FAIL', bits.join(' · ')) : perf ? row('PASS', bits.join(' · ')) : row('NOT_RUN', `web-perf not given${bits.length ? ` · ${bits.join(' · ')}` : ''}`);
  }

  if (privacy) {
    const e = count(privacy.findings, (x) => x.level === 'error');
    out.U14 = e ? row('FAIL', `ui-privacy: ${e} error(s), ${privacy.counts ? Object.entries(privacy.counts).map(([k, v]) => `${k}×${v}`).join(' ') : ''}`) : row('PASS', `ui-privacy: 0 error, ${count(privacy.findings)} warning(s)`);
  }

  if (golden) {
    const shots = golden.shots ?? [];
    const bad = shots.filter((s) => s.golden && s.golden.ok === false);
    out.U16 = !shots.some((s) => s.golden) ? row('NOT_RUN', 'no golden comparison in the ui-snap output') : bad.length ? row('FAIL', `${bad.length} shot(s) over threshold: ${bad.slice(0, 3).map((s) => `${s.name}@${s.width} ${s.golden.changed}%`).join(', ')}`) : row('PASS', `${shots.filter((s) => s.golden).length} shot(s) within threshold`);
  }
  return out;
}

/** The ui-spec facts the spec rows need, from the dev root. */
export function readSpec(root, slug) {
  const path = join(root, 'ui', slug, 'ui-spec.md');
  if (!existsSync(path)) return null;
  const body = readDoc(path).body;
  const api = join(root, 'api', slug, 'openapi.yaml');
  const yaml = existsSync(api) ? readFileSync(api, 'utf8') : null;
  const ops = yaml ? new Set(readOperations(yaml, api).map((o) => o.operationId).filter(Boolean)) : null;
  let bps = null;
  const tok = join(root, 'docs', 'design-tokens.json');
  if (existsSync(tok)) { try { bps = JSON.parse(readFileSync(tok, 'utf8')).breakpoints ?? null; } catch { bps = null; } }
  const ub = new Set(behaviourRows(body).map((r) => r.id));
  const findings = [...checkStates(body), ...checkRoles(body, ops), ...checkTrace(body, ops, ub), ...checkResponsive(body, bps), ...checkMatrix(body, yaml ? problemTypes(yaml) : null)];
  return { path, screens: screens(body).length, findings };
}

/** The full table for one gate: machine rows where a checker decided, reviewer rows UNKNOWN. */
export function scoreRows({ gate, spec, inputs }) {
  const decided = machineRows({ spec, inputs });
  return CRITERIA.map((c) => {
    const base = { id: c.id, section: c.section, criterion: c.criterion, weight: c.weight, mandatory: c.mandatory };
    if (!c.gates.includes(gate)) return { ...base, status: 'N/A', reason: `not judged at ${gate}`, evidence: `not judged at ${gate}` };
    if (c.source === 'reviewer') return { ...base, status: 'UNKNOWN', evidence: 'reviewer' };
    if (c.source === 'spec' && !spec) return { ...base, status: 'NOT_RUN', evidence: 'no ui-spec' };
    const d = decided[c.id];
    if (!d) return { ...base, status: 'NOT_RUN', evidence: `${c.source} output not given` };
    return { ...base, ...d };
  });
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv, ['json']);
    if (!o._[0]) throw new Error('give the slug');
    if (!['G5', 'G7', 'G8'].includes(o.gate)) throw new Error('--gate is G5, G7 or G8');
    o.inputs = Object.fromEntries(INPUTS.map((k) => [k, readJson(o[k])]));
  } catch (err) {
    console.error(`ui-score: ${err.message}\nusage: ui-score.mjs <slug> --gate G5|G7|G8 [--root dev] [--rubric <json>] [--consistency <json>] … [--json]`);
    return 2;
  }
  const root = findRoot({ explicit: o.root }).root;
  const spec = readSpec(root, o._[0]);
  const rows = scoreRows({ gate: o.gate, spec, inputs: o.inputs });
  const j = judge(rows);
  const findings = new Findings();
  // A FAIL is an error, a NOT_RUN a warning: the checker that would decide it was not given.
  for (const r of rows.filter((x) => x.status === 'FAIL' || x.status === 'NOT_RUN')) {
    findings.list.push({ code: r.status, level: r.status === 'FAIL' ? 'error' : 'warn', file: r.id, line: 0, message: `${r.section}: ${r.evidence}` });
  }
  if (o.json) {
    console.log(JSON.stringify({ script: 'ui-score', slug: o._[0], gate: o.gate, score: j.score, result: j.result, why: j.why, rows: rows.map(({ id, section, criterion, status, weight, evidence, mandatory }) => ({ id, section, criterion, status, weight, evidence, mandatory })) }, null, 2));
    return rows.some((r) => r.status === 'FAIL') ? 1 : 0;
  }
  console.log(toMarkdown(rows, j));
  console.log('');
  console.log(`(machine rows only — the reviewer decides the UNKNOWN rows, then the result is recomputed; ${j.why.join('; ') || 'nothing outstanding'})`);
  return report('ui-score', findings, { gate: o.gate, score: j.score, result: j.result }, { baseline: o.baseline, writeBaseline: o['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
