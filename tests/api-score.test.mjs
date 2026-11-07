/**
 * api-score.mjs: the G4 scorecard of §13.12 — weights, mandatory rows, NOT_RUN for a machine row
 * with no checker output, no PASS without evidence, a named human for an exception, and the score
 * status mapped onto a §10 verdict.
 *
 * The log under test is built from dev-reviewing-api's own published checklist, so a row added to
 * the skill without an Area, or an area left with no row, fails here.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from './backend-fixture.mjs';
import { AREAS, machineRef, score, readChecklist, VERDICT } from '../workspace/dev/scripts/api-score.mjs';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SDLC_BUNDLE_ROOT ?? join(here, '..');
const skill = readFileSync(join(ROOT, 'skills', 'dev-reviewing-api', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const published = [...skill.matchAll(/^\| (\d+) \| (\d+) \| (M?) \| (.+) \|$/gm)].map(([, n, area, m, check]) => ({ n: Number(n), area: Number(area), m: m === 'M', check }));

const CLEAN = { script: 'x', findings: [] };
const outputs = (over = {}) => Object.fromEntries(['api-style-check', 'api-contract-check', 'problems-check', 'contract-compat', 'lint-dev'].map((s) => [s, over[s] ?? []]));
const rowsWith = (fn = () => ({})) => published.map((r) => ({ ...r, areaRaw: String(r.area), result: 'PASS', evidence: 'command output: 0 findings', ...fn(r) }));

test('the published checklist: numbered 1..n, every row has an area, every area has a row, mandatory rows exist', () => {
  assert.ok(published.length >= 46, `only ${published.length} rows parsed`);
  assert.deepEqual(published.map((r) => r.n), published.map((_, i) => i + 1));
  for (const [n, name] of AREAS) assert.ok(published.some((r) => r.area === n), `area ${n} ${name} has no row`);
  assert.ok(published.filter((r) => r.m).length >= 15);
  assert.equal(AREAS.reduce((a, [, , w]) => a + w, 0), 100);
  for (const r of published.filter((x) => machineRef(x.check))) assert.ok(machineRef(r.check).codes.length, `row ${r.n}`);
});

test('everything passing with evidence and clean checker output scores 100 → PASS', () => {
  const s = score(rowsWith(), outputs());
  assert.equal(s.total, 100);
  assert.equal(s.status, 'PASS');
  assert.equal(s.verdict, 'PASS');
  assert.equal(s.findings.list.length, 0);
});

test('a machine row with no checker output is NOT_RUN, and a mandatory one BLOCKS', () => {
  const o = outputs();
  delete o['api-contract-check'];
  const s = score(rowsWith(), o);
  const r28 = s.rows.find((r) => r.n === 28);
  assert.equal(r28.status, 'NOT_RUN');
  assert.equal(s.status, 'BLOCKED');
  assert.equal(s.verdict, 'CHANGES_REQUESTED');
  assert.ok(s.findings.count('W137') > 0);
});

test('a PASS a checker contradicts is FAIL and E138; a mandatory failure overrides a high score', () => {
  const s = score(rowsWith(), outputs({ 'api-contract-check': [{ code: 'E123', level: 'error' }] }));
  assert.equal(s.rows.find((r) => r.n === 30).status, 'FAIL');
  assert.ok(s.total >= 90, `total ${s.total}`);
  assert.equal(s.status, 'BLOCKED');
  assert.match(s.findings.list.find((f) => f.code === 'E138').message, /api-contract-check reports E123×1/);
});

test('a warning code a row cites does not fail it: the row says fix or argue', () => {
  const s = score(rowsWith(), outputs({ 'api-contract-check': [{ code: 'W120', level: 'warn' }] }));
  assert.equal(s.rows.find((r) => r.n === 28).status, 'PASS');
});

test('no PASS without evidence', () => {
  const s = score(rowsWith((r) => (r.n === 13 ? { evidence: '' } : {})), outputs());
  assert.equal(s.rows.find((r) => r.n === 13).status, 'FAIL');
  assert.ok(s.findings.count('E138'));
});

test('score bands: 75–89 is REVIEW, below 75 BLOCKED; N/A rows are not counted against an area', () => {
  // Fail non-mandatory rows of the 14-point security area: 33 (one of five) → 14 × 4/5 = 11.2.
  const review = score(rowsWith((r) => ([33, 3, 22, 26, 27].includes(r.n) ? { result: 'FAIL' } : {})), outputs());
  assert.ok(review.total >= 75 && review.total < 90, `total ${review.total}`);
  assert.equal(review.status, 'REVIEW');
  assert.equal(review.verdict, 'CHANGES_REQUESTED');
  const low = score(rowsWith((r) => (!r.m ? { result: 'FAIL' } : {})), outputs());
  assert.ok(low.total < 75, `total ${low.total}`);
  assert.equal(low.status, 'BLOCKED');
  const na = score(rowsWith((r) => (r.area === 12 ? { result: 'N/A — no API consumers test against this yet' } : {})), outputs());
  assert.equal(na.total, 100);
});

test('an open BLOCKER or MAJOR holds a 100 at REVIEW', () => {
  assert.equal(score(rowsWith(), outputs(), { blocking: 1 }).status, 'REVIEW');
});

test('UNKNOWN on a mandatory row, or one resting on an open DEC, NEEDS_CLARIFICATION → BLOCKED', () => {
  const u = score(rowsWith((r) => (r.n === 37 ? { result: 'UNKNOWN' } : {})), outputs());
  assert.equal(u.status, 'NEEDS_CLARIFICATION');
  assert.equal(u.verdict, 'BLOCKED');
  const d = score(rowsWith((r) => (r.n === 37 ? { evidence: 'rps waits on DEC-004' } : {})), outputs(), { openDecisions: ['DEC-004'] });
  assert.equal(d.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(VERDICT, { PASS: 'PASS', REVIEW: 'CHANGES_REQUESTED', BLOCKED: 'CHANGES_REQUESTED', NEEDS_CLARIFICATION: 'BLOCKED' });
});

test('an exception needs a named human', () => {
  const bad = score(rowsWith((r) => (r.n === 31 ? { evidence: 'exception: ADR-009 — approved by the agent' } : {})), outputs());
  assert.equal(bad.rows.find((r) => r.n === 31).status, 'FAIL');
  assert.ok(bad.findings.count('E139'));
  const ok = score(rowsWith((r) => (r.n === 31 ? { evidence: 'exception: ADR-009 — approved by Luan Nguyen' } : {})), outputs());
  assert.equal(ok.findings.count('E139'), 0);
});

test('a Result outside the vocabulary and a row with no area are E138', () => {
  const s = score(rowsWith((r) => (r.n === 2 ? { result: 'OK' } : r.n === 3 ? { area: NaN, areaRaw: '' } : {})), outputs());
  assert.equal(s.findings.count('E138'), 2);
});

test('the CLI reads a log and checker outputs, prints the scorecard, and fails a verdict the score does not map to', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-score-'));
  const table = rowsWith().map((r) => `| ${r.n} | ${r.area} | ${r.m ? 'M' : ''} | ${r.check} | ${r.result} | ${r.evidence} |`).join('\n');
  const log = (verdict) => `---\nslug: demo\ngate: G4\nverdict: ${verdict}\n---\n\n## Checklist\n\n| # | Area | M | Check | Result | Evidence |\n|---|---|---|---|---|---|\n${table}\n\n## Findings\n\nNone.\n`;
  writeFileSync(join(dir, 'pass.md'), log('PASS'));
  writeFileSync(join(dir, 'wrong.md'), log('CHANGES_REQUESTED'));
  const ins = [];
  for (const s of ['api-style-check', 'api-contract-check', 'problems-check', 'contract-compat']) {
    writeFileSync(join(dir, `${s}.json`), JSON.stringify({ ...CLEAN, script: s }));
    ins.push('--in', join(dir, `${s}.json`));
  }
  writeFileSync(join(dir, 'lint.json'), JSON.stringify({ errors: 0, warnings: 0, findings: [] }));
  ins.push('--in', join(dir, 'lint.json'));
  const ok = run('api-score.mjs', ['demo', '--log', join(dir, 'pass.md'), ...ins], dir);
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(ok.json.summary.status, 'PASS');
  assert.equal(readChecklist(log('PASS').split('---\n')[2]).length, published.length);
  const parsed = readChecklist(log('PASS').split('---\n')[2].replace('| PASS | command output: 0 findings |', '| NOT_RUN | the tool was not installed |'));
  assert.equal(score(parsed, outputs()).rows[0].status, 'NOT_RUN', 'a NOT_RUN read from markdown keeps its underscore');
  const wrong = run('api-score.mjs', ['demo', '--log', join(dir, 'wrong.md'), ...ins], dir);
  assert.equal(wrong.status, 1);
  assert.match(wrong.json.findings[0].message, /score status PASS maps to PASS/);
});

test('an area with no row scores 0; --published fills Area and M for a log written before §13.12', () => {
  const s = score(rowsWith().filter((r) => r.area !== 5), outputs());
  assert.equal(s.areas.find((a) => a.n === 5).score, 0);
  assert.equal(s.total, 86);
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-score-old-'));
  const table = rowsWith().slice(0, 27).map((r) => `| ${r.n} | ${r.check} | PASS | evidence |`).join('\n');
  writeFileSync(join(dir, 'old.md'), `---\nslug: demo\ngate: G4\nverdict: PASS\n---\n\n## Checklist\n\n| # | Check | Result | Evidence |\n|---|---|---|---|\n${table}\n`);
  const bare = run('api-score.mjs', ['demo', '--log', join(dir, 'old.md')], dir);
  assert.equal(bare.json.findings.filter((f) => /no §13.12 Area/.test(f.message)).length, 27);
  assert.ok(bare.json.findings.some((f) => /verdict PASS, but score status/.test(f.message)), 'thirteen unexamined areas cannot be a PASS');
  const filled = run('api-score.mjs', ['demo', '--log', join(dir, 'old.md'), '--published', join(ROOT, 'skills', 'dev-reviewing-api', 'SKILL.md')], dir);
  assert.ok(!filled.json.counts.E138 || filled.json.findings.every((f) => !/no §13.12 Area/.test(f.message)), filled.stdout);
  assert.notEqual(filled.json.summary.status, 'PASS', 'rows 1–27 alone leave mandatory rows unrun');
});

// §13.12: a machine row ruled out by a recorded human decision. A project with no HTTP server has no
// openapi.yaml, so api-contract-check exits 2 and gives no output; rows 28, 30 and 37 may then be N/A
// — but only on an answered DEC, and only when the checker had no input rather than failing.
const CONTRACT_ROWS = [28, 30, 37];
const naOn = (cite) => (r) => (CONTRACT_ROWS.includes(r.n) ? { result: `N/A — ${cite}`, evidence: 'api-contract-check.mjs exited 2: no contract at api/demo/openapi.yaml' } : {});
const noContract = () => { const o = outputs(); delete o['api-contract-check']; return o; };
const LEDGER = { 'DEC-007': 'answered', 'DEC-008': 'open' };
const NO_INPUT = { decisions: LEDGER, exits: { 'api-contract-check': 2 } };

test('N/A on an answered DEC, with the checker exiting 2, is N/A and left out of the denominator', () => {
  const s = score(rowsWith(naOn('no HTTP server, so no OpenAPI (DEC-007)')), noContract(), NO_INPUT);
  for (const n of CONTRACT_ROWS) assert.equal(s.rows.find((r) => r.n === n).status, 'N/A', `row ${n}`);
  assert.equal(s.total, 100);
  assert.equal(s.status, 'PASS');
  assert.equal(s.findings.list.length, 0, JSON.stringify(s.findings.list));
  assert.equal(s.areas.find((a) => a.n === 3).judged, published.filter((r) => r.area === 3).length - 1);
});

test('N/A citing no DEC stays NOT_RUN and BLOCKS, with a message', () => {
  const s = score(rowsWith(naOn('we have no HTTP server')), noContract(), NO_INPUT);
  for (const n of CONTRACT_ROWS) assert.equal(s.rows.find((r) => r.n === n).status, 'NOT_RUN', `row ${n}`);
  assert.equal(s.status, 'BLOCKED');
  assert.ok(s.findings.list.some((f) => f.code === 'W137' && /cites no DEC-NNN/.test(f.message)));
});

test('N/A citing an open DEC, or one the ledger lacks, stays NOT_RUN with a message naming it', () => {
  const open = score(rowsWith(naOn('ruled out by DEC-008')), noContract(), NO_INPUT);
  for (const n of CONTRACT_ROWS) assert.equal(open.rows.find((r) => r.n === n).status, 'NOT_RUN', `row ${n}`);
  assert.notEqual(open.status, 'PASS');
  assert.ok(open.findings.list.some((f) => /DEC-008 \(open in the ledger\)/.test(f.message)), JSON.stringify(open.findings.list));
  const missing = score(rowsWith(naOn('ruled out by DEC-099')), noContract(), NO_INPUT);
  assert.equal(missing.rows.find((r) => r.n === 28).status, 'NOT_RUN');
  assert.ok(missing.findings.list.some((f) => /DEC-099 \(not in the ledger\)/.test(f.message)));
});

test('an answered DEC does not excuse a checker that failed (exit 1) or was not run (no exit given)', () => {
  const failed = score(rowsWith(naOn('no OpenAPI (DEC-007)')), noContract(), { decisions: LEDGER, exits: { 'api-contract-check': 1 } });
  for (const n of CONTRACT_ROWS) assert.equal(failed.rows.find((r) => r.n === n).status, 'FAIL', `row ${n}`);
  assert.equal(failed.status, 'BLOCKED');
  assert.ok(failed.findings.list.some((f) => f.code === 'E138' && /exited 1/.test(f.message)));
  const unrun = score(rowsWith(naOn('no OpenAPI (DEC-007)')), noContract(), { decisions: LEDGER });
  assert.equal(unrun.rows.find((r) => r.n === 28).status, 'NOT_RUN');
  assert.ok(unrun.findings.list.some((f) => /not given as exiting 2/.test(f.message)));
});

test('a human row N/A needs no DEC; a machine row with output keeps the checker\'s say', () => {
  const human = score(rowsWith((r) => (r.n === 29 ? { result: 'N/A — no optional members' } : {})), outputs());
  assert.equal(human.rows.find((r) => r.n === 29).status, 'N/A');
  const given = score(rowsWith(naOn('no OpenAPI (DEC-007)')), outputs({ 'api-contract-check': [{ code: 'E123', level: 'error' }] }), NO_INPUT);
  assert.equal(given.rows.find((r) => r.n === 30).status, 'FAIL');
});

test('the CLI: the real checker exits 2 with no openapi.yaml, the ledger\'s answered DEC lets the log PASS, and lint agrees', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-score-na-'));
  mkdirSync(join(dir, '.sdlc', 'decisions'), { recursive: true });
  const ledger = (status) => `---\nslug: demo\nstage: requirements\nartifact: decisions\n---\n\n## Decisions\n\n| Id | Question | Why it is needed | Options | Recommended default | Blocks | Status | Answer |\n|---|---|---|---|---|---|---|---|\n| DEC-007 | Does demo serve HTTP? | Decides whether G4 has an OpenAPI contract | yes · no | no | none | ${status} | ${status === 'answered' ? 'no: file, CLI and editor contracts only' : '—'} |\n`;
  writeFileSync(join(dir, '.sdlc', 'decisions', 'demo.md'), ledger('answered'));
  const contract = run('api-contract-check.mjs', ['demo'], dir);
  assert.equal(contract.status, 2, 'api-contract-check exits 2 when there is no openapi.yaml');
  const rows = rowsWith(naOn('no HTTP server, so no OpenAPI (DEC-007)'));
  const table = rows.map((r) => `| ${r.n} | ${r.area} | ${r.m ? 'M' : ''} | ${r.check} | ${r.result} | ${r.evidence} |`).join('\n');
  const log = `---\nslug: demo\ngate: G4\nverdict: PASS\n---\n\n## Checklist\n\n| # | Area | M | Check | Result | Evidence |\n|---|---|---|---|---|---|\n${table}\n\n## Findings\n\nNone.\n`;
  writeFileSync(join(dir, 'g4.md'), log);
  const ins = [];
  for (const s of ['api-style-check', 'problems-check', 'contract-compat']) {
    writeFileSync(join(dir, `${s}.json`), JSON.stringify({ ...CLEAN, script: s }));
    ins.push('--in', join(dir, `${s}.json`));
  }
  writeFileSync(join(dir, 'lint.json'), JSON.stringify({ errors: 0, warnings: 0, findings: [] }));
  ins.push('--in', join(dir, 'lint.json'));
  const ok = run('api-score.mjs', ['demo', '--log', join(dir, 'g4.md'), ...ins, '--exit', `api-contract-check=${contract.status}`], dir);
  assert.equal(ok.status, 0, ok.stdout);
  assert.equal(ok.json.summary.status, 'PASS');
  assert.equal(ok.json.summary.total, 100);
  for (const n of CONTRACT_ROWS) assert.equal(ok.json.summary.rowStatus.find((r) => r.n === n).status, 'N/A');
  const noExit = run('api-score.mjs', ['demo', '--log', join(dir, 'g4.md'), ...ins], dir);
  assert.equal(noExit.status, 1, 'without --exit the rows are NOT_RUN and the PASS verdict is wrong');
  writeFileSync(join(dir, '.sdlc', 'decisions', 'demo.md'), ledger('open'));
  const open = run('api-score.mjs', ['demo', '--log', join(dir, 'g4.md'), ...ins, '--exit', 'api-contract-check=2'], dir);
  assert.equal(open.status, 1);
  assert.equal(open.json.summary.status, 'BLOCKED', 'the mandatory rows are NOT_RUN');
  assert.ok(open.json.findings.some((f) => /DEC-007 \(open in the ledger\)/.test(f.message)), open.stdout);
  assert.equal(run('api-score.mjs', ['demo', '--log', join(dir, 'g4.md'), '--exit', 'api-contract-check'], dir).status, 2, 'a malformed --exit is a usage error');

  // lint-dev reads the same checklist. It has no API score of its own (E145 recomputes the UI score
  // only), so agreeing means: the N/A rows the scorer accepts are rows lint accepts, and a Result the
  // scorer refuses is one lint refuses.
  const templates = loadTemplates(join(ROOT, 'workspace', 'dev', '_templates'));
  const lintRoot = mkdtempSync(join(tmpdir(), 'sdlc-score-na-lint-'));
  const at = join(lintRoot, 'reviews', 'demo', 'G4-api-20261017-101500-4c1d.md');
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, log);
  const checklistRules = lintTree(lintRoot, templates).filter((f) => ['E008', 'E009', 'E145'].includes(f.rule));
  assert.deepEqual(checklistRules, [], JSON.stringify(checklistRules));
  const garbled = log.replace('| N/A — no HTTP server, so no OpenAPI (DEC-007) |', '| SKIPPED (DEC-007) |');
  writeFileSync(at, garbled);
  assert.ok(lintTree(lintRoot, templates).some((f) => f.rule === 'E009'), 'lint refuses a Result the scorer refuses');
  assert.ok(score(readChecklist(garbled.split('---\n')[2]), noContract(), NO_INPUT).findings.count('E138'));
});
