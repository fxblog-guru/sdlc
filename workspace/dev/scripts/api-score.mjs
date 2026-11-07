#!/usr/bin/env node
/**
 * api-score.mjs — the G4 scorecard (DEV-CONTRACTS §13.12).
 *
 * The reviewer writes the checklist; this scores it. A row that cites a checker's codes in its
 * `Check` text — `api-contract-check.mjs … no \`E120\`/\`E121\`` — is a machine row: it fails on
 * any of those error codes in that checker's `--json`, and it is NOT_RUN when that output was not
 * given. One exception: a machine row the reviewer wrote `N/A` stays N/A when its cells cite a DEC
 * the slug's ledger has `answered`, and the checker exited 2 (no input) — `--exit <script>=2`. Every
 * other row is a human row, and keeps the reviewer's Result. A PASS needs evidence.
 *
 *   node dev/scripts/api-score.mjs <slug> --log <G4 log> [--in <checker.json>]… [--exit <script>=<code>]…
 *        [--published <SKILL.md>] [--json]
 *
 * Prints the scorecard for the log's `## Verdict`: per area the weight, the rows and the score;
 * the total; the mandatory rows that fail; the score status and the gate verdict it maps to.
 *
 * Exit 1 on an error (E138, E139), 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, readTable, plain } from './lib/doc.mjs';
import { Findings, report, parseArgs } from './lib/check.mjs';
import { findRoot } from './lib/root.mjs';

export const AREAS = [
  [1, 'Requirement and contract', 8], [2, 'REST and naming', 6], [3, 'Schema', 10], [4, 'Errors', 8],
  [5, 'Security', 14], [6, 'Versioning', 10], [7, 'Pagination, filter, sort', 7], [8, 'Performance', 10],
  [9, 'Idempotency and concurrency', 7], [10, 'Observability', 5], [11, 'Docs and standards', 6],
  [12, 'Testability', 5], [13, 'Gate', 4],
];
const RESULTS = ['PASS', 'FAIL', 'NOT_RUN', 'UNKNOWN', 'N/A'];
const SCRIPTS = ['api-style-check', 'api-contract-check', 'problems-check', 'contract-compat', 'lint-dev', 'api-score'];
export const VERDICT = { PASS: 'PASS', REVIEW: 'CHANGES_REQUESTED', BLOCKED: 'CHANGES_REQUESTED', NEEDS_CLARIFICATION: 'BLOCKED' };

/** The checker a row cites, and the codes it names: `{ script, codes }` or null for a human row. */
export function machineRef(check) {
  const script = SCRIPTS.find((s) => new RegExp(`\\b${s}(?:\\.mjs)?\\b`).test(check));
  const codes = [...new Set(check.match(/\b[EW]\d{3}\b/g) ?? [])];
  return script && codes.length && script !== 'api-score' ? { script: script === 'lint-dev' ? 'lint-dev' : script, codes } : null;
}

/** The checkers' `--json` outputs, keyed by script name. lint-dev's shape is mapped onto the others'. */
export function readOutputs(paths) {
  const out = {};
  for (const p of paths) {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (j.script) out[j.script] = j.findings ?? [];
    else if (Array.isArray(j.findings) && 'errors' in j) out['lint-dev'] = j.findings.map((f) => ({ code: f.rule, level: f.level }));
  }
  return out;
}

/** The exit codes given as `--exit <script>=<code>`, keyed by script name. */
export function readExits(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i] === '--exit' ? argv[i + 1] : argv[i].startsWith('--exit=') ? argv[i].slice(7) : null;
    const m = /^([\w-]+?)(?:\.mjs)?=(\d+)$/.exec(v ?? '');
    if (v != null && !m) throw new Error(`--exit ${v}: expected <script>=<code>`);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/** The ledger's `{ DEC-NNN: status }`. */
export function readDecisions(body) {
  return Object.fromEntries(readTable(body, 'Decisions').map((r) => [plain(r.id), plain(r.status)]).filter(([id]) => id));
}

/**
 * Why a machine row with no checker output may not stay N/A, or null when it may (§13.12): its
 * cells cite a DEC the ledger has `answered`, and the checker exited 2 — it had no input, it did
 * not fail. `decisions` is `{ DEC-NNN: status }` from the ledger; `exits` the checkers' exit codes.
 */
export function naRefusal(r, script, decisions, exits) {
  const cited = [...new Set(`${r.result} ${r.evidence}`.match(/DEC-\d{3,}/g) ?? [])];
  const answered = cited.filter((d) => decisions[d] === 'answered');
  if (!cited.length) return 'N/A cites no DEC-NNN';
  if (!answered.length) return `N/A cites ${cited.map((d) => `${d} (${decisions[d] ? `${decisions[d]} in the ledger` : 'not in the ledger'})`).join(', ')}; only an answered DEC rules a checker out`;
  if (exits[script] !== 2) return `N/A on ${answered.join(', ')}, but ${script} is not given as exiting 2 (no input): \`--exit ${script}=2\``;
  return null;
}

/**
 * Score one checklist. `rows` are `{ n, area, m, check, result, evidence }`; `outputs` from readOutputs;
 * `openDecisions` the DEC ids the ledger still has open; `decisions` the ledger's `{ id: status }`;
 * `exits` the checkers' exit codes; `blocking` the open BLOCKER + MAJOR count.
 */
export function score(rows, outputs, { blocking = 0, openDecisions = [], decisions = {}, exits = {} } = {}, findings = new Findings()) {
  const scored = rows.map((r) => {
    const raw = String(r.result ?? '').replace(/[`*]/g, '').trim(); // plain() would drop the _ of NOT_RUN
    const word = raw.split(/[\s—–-]/)[0].replace(/:$/, '');
    let status = RESULTS.includes(word) ? word : (raw.startsWith('N/A') ? 'N/A' : null);
    const notes = [];
    if (!status) { findings.add('E138', `row ${r.n}`, 0, `Result \`${raw}\` — allowed: ${RESULTS.join(', ')} (N/A with a reason)`); status = 'FAIL'; }
    if (!AREAS.some(([n]) => n === r.area)) findings.add('E138', `row ${r.n}`, 0, `row has no §13.12 Area (1–13), got \`${r.areaRaw}\``);
    const ref = machineRef(r.check);
    if (ref) {
      const got = outputs[ref.script];
      const why = !got && status === 'N/A' ? naRefusal(r, ref.script, decisions, exits) : null;
      if (!got && exits[ref.script] === 1) {
        findings.add('E138', `row ${r.n}`, 0, `${ref.script} exited 1 (it failed), scored FAIL`);
        status = 'FAIL';
        notes.push(`${ref.script} exited 1`);
      } else if (!got && status === 'N/A' && !why) {
        notes.push(`${ref.script} exited 2; N/A on an answered DEC`);
      } else if (!got) {
        if (status === 'PASS') findings.add('W137', `row ${r.n}`, 0, `machine row: no ${ref.script} --json given, scored NOT_RUN`);
        if (why) findings.add('W137', `row ${r.n}`, 0, `machine row: ${why} — scored NOT_RUN (DEV-CONTRACTS §13.12)`);
        status = 'NOT_RUN';
        notes.push(`no ${ref.script} output`);
      } else {
        const hit = got.filter((f) => ref.codes.includes(f.code) && f.level === 'error');
        if (hit.length) {
          if (status === 'PASS') findings.add('E138', `row ${r.n}`, 0, `PASS, but ${ref.script} reports ${[...new Set(hit.map((f) => f.code))].map((c) => `${c}×${hit.filter((f) => f.code === c).length}`).join(' ')}`);
          status = 'FAIL';
          notes.push(`${ref.script}: ${hit.length} error(s)`);
        }
      }
    }
    if (status === 'PASS' && !plain(r.evidence)) { findings.add('E138', `row ${r.n}`, 0, 'PASS with no evidence — scored FAIL (§12.1)'); status = 'FAIL'; }
    if (status === 'N/A' && !/N\/A\s*[—–-]\s*\S/.test(raw) && !plain(r.evidence)) findings.add('E138', `row ${r.n}`, 0, 'N/A with no reason');
    const exception = /exception:/i.test(r.evidence);
    if (exception && !/approved by\s+[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)+/u.test(r.evidence)) {
      findings.add('E139', `row ${r.n}`, 0, 'an exception with no human approver named (`exception: ADR-NNN — approved by <First Last>`)');
      status = 'FAIL';
    }
    const decs = (r.evidence.match(/DEC-\d{3,}/g) ?? []).filter((d) => openDecisions.includes(d));
    return { ...r, status, notes, decs };
  });

  const areas = AREAS.map(([n, name, weight]) => {
    const mine = scored.filter((r) => r.area === n);
    const judged = mine.filter((r) => r.status !== 'N/A');
    const pass = judged.filter((r) => r.status === 'PASS').length;
    // All N/A earns the weight; no row at all earns nothing — an unexamined area is not a pass.
    const value = judged.length ? (weight * pass) / judged.length : mine.length ? weight : 0;
    return { n, name, weight, rows: mine.length, pass, judged: judged.length, score: Math.round(value * 10) / 10 };
  });
  const total = Math.round(areas.reduce((a, x) => a + x.score, 0) * 10) / 10;
  const mandatory = scored.filter((r) => r.m);
  const unknown = mandatory.filter((r) => r.status === 'UNKNOWN' || r.decs.length);
  const failed = mandatory.filter((r) => r.status === 'FAIL' || r.status === 'NOT_RUN');
  let status;
  if (unknown.length) status = 'NEEDS_CLARIFICATION';
  else if (failed.length || total < 75) status = 'BLOCKED';
  else if (total < 90 || blocking > 0) status = 'REVIEW';
  else status = 'PASS';
  return { rows: scored, areas, total, status, verdict: VERDICT[status], failedMandatory: failed.map((r) => r.n), unknownMandatory: unknown.map((r) => r.n), findings };
}

/** The `## Checklist` rows of a G4 log, as score() takes them. */
export function readChecklist(body) {
  return readTable(body, 'Checklist').map((r) => ({
    n: Number(plain(r['#'])),
    areaRaw: plain(r.area),
    area: Number(plain(r.area)),
    m: /^m$/i.test(plain(r.m)),
    check: r.check ?? '',
    result: r.result ?? '',
    evidence: r.evidence ?? '',
  }));
}

export function scorecard(s) {
  const lines = ['| Area | Weight | Rows (PASS / judged) | Score |', '|---|---|---|---|'];
  for (const a of s.areas) lines.push(`| ${a.n} ${a.name} | ${a.weight} | ${a.pass} / ${a.judged}${a.rows > a.judged ? ` (+${a.rows - a.judged} N/A)` : ''} | ${a.score} |`);
  lines.push(`| **Total** | 100 | | **${s.total}** |`);
  lines.push('');
  lines.push(`Mandatory rows failing: ${s.failedMandatory.length ? s.failedMandatory.join(', ') : 'none'} · unknown or on an open DEC: ${s.unknownMandatory.length ? s.unknownMandatory.join(', ') : 'none'}`);
  lines.push(`Score status **${s.status}** → verdict **${s.verdict}** (DEV-CONTRACTS §13.12)`);
  return lines.join('\n');
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const ins = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--in' && argv[i + 1]) ins.push(argv[i + 1]);
  const slug = a._[0];
  if (!slug || !a.log) { console.error('usage: api-score.mjs <slug> --log <G4 log> [--in <checker.json>]… [--exit <script>=<code>]… [--json]'); return 2; }
  if (!existsSync(a.log)) { console.error(`no log at ${a.log}`); return 2; }
  for (const p of ins) if (!existsSync(p)) { console.error(`no checker output at ${p}`); return 2; }
  const doc = parseDoc(readFileSync(a.log, 'utf8'));
  let rows = readChecklist(doc.body);
  if (!rows.length) { console.error(`${a.log}: no ## Checklist rows`); return 2; }
  // A log written before §13.12 has no Area or M column. --published <SKILL.md> takes them from the
  // skill's checklist by row number, so an old log can be scored for comparison; without it, every
  // row is E138 and the score covers nothing (an area with no row is not a PASS).
  if (a.published) {
    if (!existsSync(a.published)) { console.error(`no checklist at ${a.published}`); return 2; }
    const pub = new Map([...readFileSync(a.published, 'utf8').replace(/\r\n/g, '\n').matchAll(/^\| (\d+) \| (\d+) \| (M?) \| .+ \|$/gm)].map(([, n, area, m]) => [Number(n), { area: Number(area), m: m === 'M' }]));
    rows = rows.map((r) => (Number.isFinite(r.area) && r.area > 0 ? r : { ...r, areaRaw: String(pub.get(r.n)?.area ?? ''), area: pub.get(r.n)?.area ?? NaN, m: pub.get(r.n)?.m ?? false }));
  }
  let outputs, exits;
  try { outputs = readOutputs(ins); } catch (e) { console.error(`checker output: ${e.message}`); return 2; }
  try { exits = readExits(argv); } catch (e) { console.error(e.message); return 2; }
  const blocking = readTable(doc.body, 'Findings').filter((r) => /BLOCKER|MAJOR/.test(plain(r.severity))).length;
  const root = findRoot({ explicit: a.root }).root;
  const ledger = resolve(root, 'decisions', `${slug}.md`);
  const decisions = existsSync(ledger) ? readDecisions(parseDoc(readFileSync(ledger, 'utf8')).body) : {};
  const openDecisions = Object.keys(decisions).filter((d) => decisions[d] === 'open');
  const s = score(rows, outputs, { blocking, openDecisions, decisions, exits });
  const verdict = doc.frontMatter?.verdict;
  if (verdict && verdict !== 'SKIPPED' && verdict !== s.verdict) s.findings.add('E138', a.log, 0, `verdict ${verdict}, but score status ${s.status} maps to ${s.verdict}`);
  if (!a.json) console.log(scorecard(s));
  const summary = { rows: rows.length, total: s.total, status: s.status, verdict: s.verdict, 'mandatory failing': s.failedMandatory.length };
  return report('api-score', s.findings, a.json ? { ...summary, areas: s.areas, rowStatus: s.rows.map((r) => ({ n: r.n, status: r.status, notes: r.notes })) } : summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
