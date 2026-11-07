/**
 * security-scan.mjs: SARIF from any scanner becomes one SEC-NNN ledger that keeps a human's triage
 * across runs, and refuses while a serious finding is untriaged (DEV-CONTRACTS §13.15).
 *
 * The failure it exists for: a scan read once, the same CVE found every week, and a "fixed" that
 * was only a scanner that did not run.
 *
 *   node --test tests/security-scan.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { TOOLS, blocking, merge, parseSarif, readLedger, redact, renderLedger, severityOf, toolKey } from '../workspace/dev/scripts/security-scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'security-scan.mjs');
const TODAY = '2026-10-23';

const sarif = (driver, results, rules = []) => ({ version: '2.1.0', runs: [{ tool: { driver: { name: driver, rules } }, results }] });
const result = (ruleId, file, line, text, extra = {}) => ({
  ruleId, message: { text }, locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: line } } }], ...extra,
});

const SEMGREP = sarif('Semgrep OSS', [
  result('python.subprocess-shell-true', 'app.py', 3, 'shell=True', { level: 'error' }),
  result('python.avoid-pickle', 'app.py', 5, 'pickle', { level: 'warning' }),
]);
const TRIVY = sarif('Trivy', [result('CVE-2018-18074', 'requirements.txt', 1, 'requests 2.19.0')], [
  { id: 'CVE-2018-18074', properties: { 'security-severity': '7.5' } },
]);

test('severity: CVSS score first, then the SARIF level; a secret is never below high', () => {
  assert.equal(severityOf({ properties: { 'security-severity': '9.8' } }, {}, 'trivy'), 'critical');
  assert.equal(severityOf({}, { properties: { 'security-severity': '7.5' } }, 'trivy'), 'high');
  assert.equal(severityOf({ level: 'warning' }, {}, 'semgrep'), 'medium');
  assert.equal(severityOf({ level: 'note' }, {}, 'semgrep'), 'low');
  assert.equal(severityOf({ level: 'note', ruleId: 'generic-api-key' }, {}, 'gitleaks'), 'high');
  assert.equal(severityOf({ level: 'warning', ruleId: 'detected-private-key' }, {}, 'semgrep'), 'high');
});

test('driver names map to the tool keys the ledger and the ran-set share', () => {
  assert.equal(toolKey('Semgrep OSS'), 'semgrep');
  assert.equal(toolKey('Trivy'), 'trivy');
  assert.equal(toolKey('gitleaks'), 'gitleaks');
  assert.equal(toolKey('Checkov'), 'checkov');
  assert.equal(toolKey('CodeQL'), 'codeql');
});

test('redaction: the committed ledger never carries the secret it found, nor a table-breaking pipe', () => {
  const leaked = redact('key AKIAQWERTYUIOPASDFGH and token ghp_abcdefghijklmnop1234 password = hunter2hunter | x');
  assert.doesNotMatch(leaked, /AKIAQWERTY|ghp_abcdef|hunter2/);
  assert.doesNotMatch(leaked, /\|/);
  assert.ok(redact('x'.repeat(500)).length <= 160);
});

test('parseSarif: location, rule and a fingerprint that survives a line move', () => {
  const a = parseSarif(SEMGREP);
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].tool, a[0].file, a[0].line, a[0].severity], ['semgrep', 'app.py', 3, 'high']);
  const moved = parseSarif(sarif('Semgrep OSS', [result('python.subprocess-shell-true', 'app.py', 40, 'shell=True', { level: 'error' })]));
  assert.equal(moved[0].fingerprint, a[0].fingerprint, 'a finding that moved lines is the same finding');
  const suppressed = parseSarif(sarif('x', [result('r', 'a.py', 1, 'm', { suppressions: [{ kind: 'inSource' }] })]));
  assert.equal(suppressed.length, 0, 'a finding suppressed in source is not re-raised');
  const uri = parseSarif(sarif('x', [result('r', 'file:///src/pkg/a.go', 1, 'm')]));
  assert.equal(uri[0].file, 'pkg/a.go', 'container and file:// prefixes are stripped');
});

test('merge: new findings get SEC ids; a known one keeps its id and its triage', () => {
  const first = merge([], parseSarif(SEMGREP), new Set(['semgrep']), { runId: 'r1', today: TODAY });
  assert.deepEqual(first.added, ['SEC-001', 'SEC-002']);
  first.rows[0].status = 'accepted';
  first.rows[0].owner = 'Luan';
  first.rows[0].until = '2026-12-31';
  const again = merge(first.rows, parseSarif(SEMGREP), new Set(['semgrep']), { runId: 'r2', today: TODAY });
  assert.deepEqual(again.added, []);
  assert.equal(again.rows[0].status, 'accepted', 'a rerun must not undo a human decision');
});

test('merge: gone means fixed, back means reopened — and only a tool that ran can declare gone', () => {
  const first = merge([], [...parseSarif(SEMGREP), ...parseSarif(TRIVY)], new Set(['semgrep', 'trivy']), { runId: 'r1', today: TODAY });
  const cve = () => first.rows.find((r) => r.rule === 'CVE-2018-18074');
  // trivy ran, found nothing: fixed. semgrep did not run: its rows are untouched.
  const fixed = merge(first.rows, [], new Set(['trivy']), { runId: 'r2', today: TODAY });
  assert.deepEqual(fixed.gone, [cve().id]);
  assert.ok(fixed.rows.filter((r) => r.tool === 'semgrep').every((r) => r.status === 'open'), 'a scanner that did not run proves nothing fixed');
  const back = merge(fixed.rows, parseSarif(TRIVY), new Set(['trivy']), { runId: 'r3', today: TODAY });
  assert.deepEqual(back.reopened, [cve().id]);
  assert.equal(back.rows.find((r) => r.id === cve().id).status, 'open');
});

test('merge: a reviewer-raised row (tool `review`) is never closed by a scanner', () => {
  const row = { id: 'SEC-001', severity: 'high', status: 'open', tool: 'review', rule: 'idor', where: 'api/orders.go:40', finding: 'no owner check', owner: '', until: '', evidence: 'G7 read', fingerprint: 'manual-1' };
  const r = merge([row], [], new Set(Object.keys(TOOLS).concat('review')), { runId: 'r', today: TODAY });
  assert.equal(r.rows[0].status, 'open');
});

test('blocking: untriaged high, ownerless or expired acceptance, evidence-free false positive', () => {
  const base = { severity: 'high', tool: 'semgrep', rule: 'r', where: 'a', finding: 'f', fingerprint: 'x' };
  const rows = [
    { ...base, id: 'SEC-001', status: 'open', owner: '', until: '', evidence: 'found r1' },
    { ...base, id: 'SEC-002', status: 'open', severity: 'medium', owner: '', until: '', evidence: 'found r1' },
    { ...base, id: 'SEC-003', status: 'accepted', owner: '', until: '2026-12-31', evidence: '' },
    { ...base, id: 'SEC-004', status: 'accepted', owner: 'Luan', until: '2026-01-01', evidence: '' },
    { ...base, id: 'SEC-005', status: 'accepted', owner: 'Luan', until: '2026-12-31', evidence: '' },
    { ...base, id: 'SEC-006', status: 'false-positive', owner: '', until: '', evidence: 'found r1' },
    { ...base, id: 'SEC-007', status: 'false-positive', owner: '', until: '', evidence: 'test fixture, AWS docs key' },
    { ...base, id: 'SEC-008', status: 'wontfix', owner: '', until: '', evidence: '' },
    { ...base, id: 'SEC-009', status: 'fixed', owner: '', until: '', evidence: 'gone r2' },
  ];
  assert.deepEqual(blocking(rows, { today: TODAY }).map((b) => b.id), ['SEC-001', 'SEC-003', 'SEC-004', 'SEC-006', 'SEC-008']);
  assert.deepEqual(blocking(rows, { today: TODAY, block: ['critical', 'high', 'medium'] }).map((b) => b.id), ['SEC-001', 'SEC-002', 'SEC-003', 'SEC-004', 'SEC-006', 'SEC-008']);
});

test('ledger: render then read is lossless, open rows first, worst first', () => {
  const { rows } = merge([], [...parseSarif(SEMGREP), ...parseSarif(TRIVY)], new Set(['semgrep', 'trivy']), { runId: 'r1', today: TODAY });
  rows[0].status = 'fixed';
  const text = renderLedger(rows, TODAY);
  const back = readLedger(text);
  assert.equal(back.length, rows.length);
  assert.deepEqual(back.map((r) => r.status), ['open', 'open', 'fixed']);
  assert.deepEqual(new Set(back.map((r) => r.id)), new Set(rows.map((r) => r.id)));
  assert.match(text, /^---\nartifact: security-findings\n/);
});

test('every scanner image is pinned to a version and a digest', () => {
  for (const [name, t] of Object.entries(TOOLS)) {
    assert.match(t.image, /:[\w.-]+@sha256:[0-9a-f]{64}$/, `${name}: ${t.image} is not version@digest`);
    assert.doesNotMatch(t.image, /:latest|:stable/, `${name}: floating tag`);
  }
});

test('CLI: ingest CI SARIF, then check exits 1 until it is triaged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-sec-'));
  const root = join(dir, '.sdlc');
  mkdirSync(root);
  writeFileSync(join(dir, 'trivy.sarif'), JSON.stringify(TRIVY));
  const ingest = spawnSync(process.execPath, [SCRIPT, 'ingest', join(dir, 'trivy.sarif'), '--root', root], { encoding: 'utf8' });
  assert.equal(ingest.status, 1, ingest.stdout + ingest.stderr);
  assert.match(ingest.stdout, /SEC-001 +high and untriaged/);
  const ledger = join(root, 'security', 'findings.md');
  writeFileSync(ledger, readFileSync(ledger, 'utf8').replace('| SEC-001 | high | open |', '| SEC-001 | high | accepted |').replace(/\| {2}\| {2}\| found/, '| Luan | 2099-01-01 | found'));
  const check = spawnSync(process.execPath, [SCRIPT, 'check', '--root', root], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'nope'], { encoding: 'utf8' }).status, 2);
});

test('CLI: a scanner that cannot run is NOT RUN, never a silent pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-sec-'));
  const r = spawnSync(process.execPath, [SCRIPT, 'run', '--root', join(dir, '.sdlc'), '--source', dir, '--tools', 'checkov', '--docker', 'never'], {
    encoding: 'utf8', env: { ...process.env, PATH: '' },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /checkov +NOT RUN/);
  assert.match(r.stdout, /NOT RUN: checkov — a gap in the evidence, not a pass/);
});
