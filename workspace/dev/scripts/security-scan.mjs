#!/usr/bin/env node
/**
 * security-scan.mjs — run the scanners, keep one ledger of findings across runs, and refuse while a
 * serious one is untriaged (DEV-CONTRACTS §13.15).
 *
 * A scan whose output is read once and forgotten finds the same CVE every week and fixes it never.
 * So every finding becomes a `SEC-NNN` row in `<root>/security/findings.md`, keyed by a fingerprint
 * that survives line moves, and a human triages it once: fixed, accepted (owner + date), or false
 * positive (evidence). The next run keeps that decision.
 *
 *   node dev/scripts/security-scan.mjs run    [--source .] [--tools gitleaks,semgrep,trivy,checkov]
 *                                             [--base <ref>] [--docker auto|never] [--root dev] [--json]
 *   node dev/scripts/security-scan.mjs ingest <file.sarif>… [--root dev]    (e.g. CI's reports/*.sarif)
 *   node dev/scripts/security-scan.mjs check  [--root dev] [--block critical,high] [--json]
 *
 * `run` uses a tool on PATH, else its pinned image under Docker, else records it NOT RUN — never
 * silently absent. Only tools that ran may mark a finding gone: a scanner that did not run proves
 * nothing fixed.
 *
 * Exit 1 when `check` finds a blocking row (also after `run` and `ingest`), 2 on a usage error.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, plain, readTable } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const STATUSES = ['open', 'fixed', 'accepted', 'false-positive'];
const COLUMNS = ['Id', 'Severity', 'Status', 'Tool', 'Rule', 'Where', 'Finding', 'Owner', 'Until', 'Evidence', 'Fingerprint'];

// Releases at least two weeks old, pinned by digest: a scanner runs with the repository in reach,
// so a floating tag is the supply-chain hole the scan exists to find. Bump deliberately.
export const TOOLS = {
  gitleaks: {
    image: 'zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f',
    bin: 'gitleaks',
    // `git` mode reads history too: a secret deleted in a later commit is still leaked.
    args: ({ src, out, isGit }) => [isGit ? 'git' : 'dir', src, '--redact', '--exit-code', '0', '--report-format', 'sarif', '--report-path', `${out}/gitleaks.sarif`],
  },
  semgrep: {
    image: 'semgrep/semgrep:1.179.0@sha256:93963d9295a366f59e4850127b1550400ee7b388f04fe144e4a1f6325d96e01b',
    bin: 'semgrep',
    // `scan` with explicit rulesets: `semgrep ci` without a token loads no policy and passes.
    args: ({ src, out, base, hasRules }) => ['scan', '--config', 'p/default', '--config', 'p/secrets', ...(hasRules ? ['--config', `${src}/.semgrep`] : []),
      ...(base ? ['--baseline-commit', base] : []), '--metrics=off', '--sarif', '-o', `${out}/semgrep.sarif`, src],
  },
  trivy: {
    image: 'aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa',
    bin: 'trivy',
    // Secrets are gitleaks' and misconfiguration checkov's: one finding, one row.
    args: ({ src, out }) => ['fs', '--scanners', 'vuln', '--format', 'sarif', '-o', `${out}/trivy.sarif`, src],
    cache: '/root/.cache/trivy',
  },
  checkov: {
    image: 'bridgecrew/checkov:3.3.22@sha256:617c76e3f9b1f7907ebca9abb6b9d746844edcb48e9bd775e4692c69c1c6ac47',
    bin: 'checkov',
    // CI definitions are in scope: a pipeline is production infrastructure with the deploy keys.
    args: ({ src, out }) => ['-d', src, '--framework', 'terraform,kubernetes,dockerfile,helm,github_actions,gitlab_ci',
      // With one output format checkov treats the path as a directory; with two it is a file.
      '--soft-fail', '--quiet', '-o', 'cli', '-o', 'sarif', '--output-file-path', `console,${out}/checkov.sarif`],
  },
};

// Git refuses a repository owned by another user; inside a container the mount always is one.
const SAFE_DIR_ENV = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };

// ---------------------------------------------------------------------------------------------
// SARIF → findings
// ---------------------------------------------------------------------------------------------

/** A CVSS-style score or a SARIF level, as one of SEVERITIES. */
export function severityOf(result, rule, tool) {
  const score = Number(result?.properties?.['security-severity'] ?? rule?.properties?.['security-severity']);
  let sev;
  if (Number.isFinite(score) && score > 0) sev = score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
  else {
    const level = String(result?.level ?? rule?.defaultConfiguration?.level ?? 'warning').toLowerCase();
    sev = { error: 'high', warning: 'medium', note: 'low', none: 'info' }[level] ?? 'medium';
  }
  // A committed secret is exploitable as found, whatever level the scanner chose to print.
  const secret = /gitleaks/i.test(tool) || /secret|credential|private[-_ ]?key|token/i.test(String(result?.ruleId ?? ''));
  if (secret && SEVERITIES.indexOf(sev) > SEVERITIES.indexOf('high')) sev = 'high';
  return sev;
}

// The ledger is committed: a finding's text must never carry the secret it found.
export function redact(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/(?:AKIA|ASIA)[A-Z0-9]{12,}/g, '[REDACTED]')
    .replace(/\b(?:gh[pousr]_|glpat-|xox[abpr]-|sk-(?:ant-)?)[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED]')
    .replace(/((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)["']?[^\s"',;]{4,}/gi, '$1[REDACTED]')
    .replace(/\|/g, '/')
    .trim()
    .slice(0, 160);
}

/** SARIF driver names vary ("Semgrep OSS", "Trivy"); the ledger keys rows by the TOOLS name. */
export function toolKey(driver) {
  const name = String(driver ?? 'unknown').toLowerCase().trim();
  return Object.keys(TOOLS).find((k) => name.includes(k)) ?? name.replace(/[^a-z0-9-]+/g, '-');
}

// Scanners in a container report `/src/...` or `file:///src/...`; the ledger keeps repo paths.
const posix = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^file:\/\//, '').replace(/^\/src\//, '').replace(/^\.\//, '');

/** Every result of a SARIF document as { tool, rule, severity, file, line, message, fingerprint }. */
export function parseSarif(doc) {
  const out = [];
  for (const run of doc?.runs ?? []) {
    const tool = toolKey(run?.tool?.driver?.name);
    const rules = new Map((run?.tool?.driver?.rules ?? []).map((r) => [r.id, r]));
    for (const res of run?.results ?? []) {
      if (res.suppressions?.length) continue; // suppressed in source, with the reason there
      const loc = res.locations?.[0]?.physicalLocation;
      const file = posix(loc?.artifactLocation?.uri);
      const line = loc?.region?.startLine ?? null;
      const rule = String(res.ruleId ?? 'unknown');
      const message = redact(res.message?.text ?? rules.get(res.ruleId)?.shortDescription?.text ?? rule);
      // Line numbers move with every edit above the finding; the scanner's own key, else the text.
      const stable = Object.values(res.partialFingerprints ?? res.fingerprints ?? {})[0] ?? message;
      const fingerprint = createHash('sha256').update(`${tool}|${rule}|${file}|${stable}`).digest('hex').slice(0, 16);
      out.push({ tool, rule, severity: severityOf(res, rules.get(res.ruleId), tool), file, line, message, fingerprint });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------------------------

/** Rows of `## Findings`, keyed by lower-case column name. */
export function readLedger(text) {
  return readTable(parseDoc(text).body, 'Findings').map((r) => Object.fromEntries(COLUMNS.map((c) => [c.toLowerCase(), plain(r[c.toLowerCase()] ?? '')])));
}

const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');

export function renderLedger(rows, today) {
  const order = (r) => [STATUSES.indexOf(r.status) === 0 ? 0 : 1, SEVERITIES.indexOf(r.severity), r.id];
  const sorted = [...rows].sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
  });
  return `---
artifact: security-findings
updated: ${today}
---

# Security findings

Written by \`security-scan.mjs\` (DEV-CONTRACTS §13.15). Triage by editing **Status**, **Owner**,
**Until** and **Evidence** only: \`fixed\` · \`accepted\` (Owner and Until required) ·
\`false-positive\` (Evidence required). A \`review\` row is a reviewer's finding no scanner made.

## Findings

| ${COLUMNS.join(' | ')} |
|${COLUMNS.map(() => '---').join('|')}|
${sorted.map((r) => `| ${COLUMNS.map((c) => cell(r[c.toLowerCase()])).join(' | ')} |`).join('\n')}
`;
}

/**
 * Fold one run's findings into the ledger. `ran` is the set of tools that completed: a row from any
 * other tool is left exactly as it was. Returns { rows, added, reopened, gone }.
 */
export function merge(rows, findings, ran, { runId, today }) {
  const next = rows.map((r) => ({ ...r }));
  const byFp = new Map(next.map((r) => [r.fingerprint, r]));
  let max = Math.max(0, ...next.map((r) => Number(/^SEC-(\d+)$/.exec(r.id)?.[1] ?? 0)));
  const seen = new Set();
  const stats = { added: [], reopened: [], gone: [] };
  for (const f of findings) {
    if (seen.has(f.fingerprint)) continue;
    seen.add(f.fingerprint);
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    const row = byFp.get(f.fingerprint);
    if (!row) {
      max += 1;
      const id = `SEC-${String(max).padStart(3, '0')}`;
      const added = { id, severity: f.severity, status: 'open', tool: f.tool, rule: f.rule, where, finding: f.message, owner: '', until: '', evidence: `found ${runId}`, fingerprint: f.fingerprint };
      next.push(added);
      byFp.set(f.fingerprint, added);
      stats.added.push(id);
      continue;
    }
    row.where = where;
    row.severity = f.severity;
    if (row.status === 'fixed') {
      row.status = 'open';
      row.evidence = `reappeared ${runId}`;
      stats.reopened.push(row.id);
    }
  }
  for (const r of next) {
    if (r.status !== 'open' || r.tool === 'review' || !ran.has(r.tool) || seen.has(r.fingerprint)) continue;
    r.status = 'fixed';
    r.evidence = `gone ${runId} (${today})`;
    stats.gone.push(r.id);
  }
  return { rows: next, ...stats };
}

/** The rows that refuse a release, each with its reason. */
export function blocking(rows, { block = ['critical', 'high'], today }) {
  const out = [];
  for (const r of rows) {
    if (!STATUSES.includes(r.status)) out.push({ id: r.id, reason: `status \`${r.status}\` — allowed: ${STATUSES.join(', ')}` });
    else if (r.status === 'open' && block.includes(r.severity)) out.push({ id: r.id, reason: `${r.severity} and untriaged — fix it, or accept it with an owner and a date` });
    else if (r.status === 'accepted') {
      if (!r.owner) out.push({ id: r.id, reason: 'accepted with nobody named in Owner' });
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.until)) out.push({ id: r.id, reason: 'accepted with no Until date (YYYY-MM-DD)' });
      else if (r.until < today) out.push({ id: r.id, reason: `acceptance expired ${r.until} — triage again` });
    } else if (r.status === 'false-positive' && (!r.evidence || /^(found|reappeared|gone) /.test(r.evidence))) {
      out.push({ id: r.id, reason: 'false-positive with no evidence of why' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Running the tools
// ---------------------------------------------------------------------------------------------

function onPath(bin) {
  const r = spawnSync(bin, ['--version'], { stdio: 'ignore', shell: false });
  return r.status === 0;
}

/** Run one tool. Returns { tool, how, status: 'ran'|'NOT RUN'|'FAILED', note }. */
export function runTool(name, { src, outDir, base, docker = 'auto', exec = spawnSync }) {
  const t = TOOLS[name];
  const isGit = existsSync(join(src, '.git'));
  const hasRules = existsSync(join(src, '.semgrep'));
  const env = { ...process.env, ...SAFE_DIR_ENV };
  let cmd;
  let args;
  let how;
  if (onPath(t.bin)) {
    [cmd, args, how] = [t.bin, t.args({ src, out: outDir, base, isGit, hasRules }), 'local'];
  } else if (docker !== 'never' && exec('docker', ['version'], { stdio: 'ignore' }).status === 0) {
    const envFlags = Object.entries(SAFE_DIR_ENV).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const cache = t.cache ? ['-v', `sdlc-${name}-cache:${t.cache}`] : [];
    args = ['run', '--rm', '-v', `${src}:/src`, '-v', `${outDir}:/out`, ...cache, ...envFlags, '-w', '/src', '--entrypoint', t.bin, t.image,
      ...t.args({ src: '/src', out: '/out', base, isGit, hasRules })];
    [cmd, how] = ['docker', 'docker'];
  } else {
    return { tool: name, how: '-', status: 'NOT RUN', note: `${t.bin} not on PATH and Docker unavailable` };
  }
  const r = exec(cmd, args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const sarif = join(outDir, `${name}.sarif`);
  if (!existsSync(sarif)) {
    const tail = String(r.stderr ?? r.error?.message ?? '').trim().split('\n').slice(-2).join(' ');
    return { tool: name, how, status: 'FAILED', note: `exit ${r.status}, no SARIF written${tail ? ` — ${redact(tail)}` : ''}` };
  }
  return { tool: name, how, status: 'ran', note: `exit ${r.status}` };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function runId(now = new Date()) {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${createHash('sha1').update(String(Math.random())).digest('hex').slice(0, 4)}`;
}

function ingestInto(root, files, ran, id, today) {
  const ledgerPath = join(root, 'security', 'findings.md');
  const rows = existsSync(ledgerPath) ? readLedger(readFileSync(ledgerPath, 'utf8')) : [];
  const findings = [];
  for (const f of files) {
    try {
      const doc = JSON.parse(readFileSync(f, 'utf8'));
      const found = parseSarif(doc);
      findings.push(...found);
      for (const run of doc.runs ?? []) ran.add(toolKey(run?.tool?.driver?.name));
    } catch (err) {
      console.error(`security-scan: cannot read ${f}: ${err.message}`);
    }
  }
  const merged = merge(rows, findings, ran, { runId: id, today });
  mkdirSync(join(root, 'security'), { recursive: true });
  writeFileSync(ledgerPath, renderLedger(merged.rows, today));
  return { ledgerPath, findings: findings.length, ...merged };
}

function report(root, rows, block, today, json, extra = {}) {
  const bad = blocking(rows, { block, today });
  const count = (s) => rows.filter((r) => r.status === s).length;
  if (json) {
    console.log(JSON.stringify({ ...extra, open: count('open'), accepted: count('accepted'), fixed: count('fixed'), falsePositive: count('false-positive'), blocking: bad }, null, 2));
  } else {
    for (const b of bad) console.log(`${b.id.padEnd(8)} ${b.reason}`);
    console.log(`\n${rows.length} finding(s): ${count('open')} open · ${count('accepted')} accepted · ${count('fixed')} fixed · ${count('false-positive')} false positive — ${bad.length ? `${bad.length} BLOCKING` : 'nothing blocking'}`);
    console.log(`ledger: ${relative(process.cwd(), join(root, 'security', 'findings.md')) || 'findings.md'}`);
  }
  return bad.length ? 1 : 0;
}

function main(argv) {
  const [mode, ...rest] = argv;
  const root = rootFromArgv(rest);
  const today = new Date().toISOString().slice(0, 10);
  const block = (argFor(rest, '--block') ?? 'critical,high').split(',').map((s) => s.trim().toLowerCase());
  const json = rest.includes('--json');
  const ledgerPath = join(root, 'security', 'findings.md');

  if (mode === 'check') {
    const rows = existsSync(ledgerPath) ? readLedger(readFileSync(ledgerPath, 'utf8')) : [];
    if (!existsSync(ledgerPath)) console.log('security-scan: no ledger yet — run `security-scan.mjs run` first');
    process.exit(report(root, rows, block, today, json));
  }

  if (mode === 'ingest') {
    const valued = new Set(['--root', '--block']);
    const files = rest.filter((a, i) => !a.startsWith('--') && !valued.has(rest[i - 1]));
    if (!files.length) return usage();
    const r = ingestInto(root, files, new Set(), `ingest-${today}`, today);
    console.log(`ingested ${r.findings} result(s): ${r.added.length} new · ${r.reopened.length} reopened · ${r.gone.length} gone`);
    process.exit(report(root, r.rows, block, today, json));
  }

  if (mode === 'run') {
    const src = resolve(argFor(rest, '--source') ?? '.');
    const tools = (argFor(rest, '--tools') ?? Object.keys(TOOLS).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = tools.filter((t) => !TOOLS[t]);
    if (unknown.length) {
      console.error(`security-scan: unknown tool(s) ${unknown.join(', ')} — known: ${Object.keys(TOOLS).join(', ')}`);
      process.exit(2);
    }
    const id = runId();
    const outDir = join(root, 'security', 'runs', id);
    mkdirSync(outDir, { recursive: true });
    const results = tools.map((t) => runTool(t, { src, outDir, base: argFor(rest, '--base'), docker: argFor(rest, '--docker') ?? 'auto' }));
    const ran = new Set();
    const files = [];
    for (const r of results) {
      if (r.status !== 'ran') continue;
      ran.add(r.tool);
      files.push(join(outDir, `${r.tool}.sarif`));
    }
    const merged = ingestInto(root, files, ran, id, today);
    const lines = results.map((r) => `| ${r.tool} | ${r.how} | ${r.status} | ${r.note} |`);
    writeFileSync(join(outDir, 'tools.md'), `# Scanners — run ${id}\n\n| Tool | How | Status | Note |\n|---|---|---|---|\n${lines.join('\n')}\n`);
    if (!json) {
      for (const r of results) console.log(`${r.tool.padEnd(9)} ${r.status.padEnd(8)} ${r.how.padEnd(7)} ${r.note}`);
      console.log(`run ${id}: ${merged.findings} result(s) — ${merged.added.length} new · ${merged.reopened.length} reopened · ${merged.gone.length} gone`);
    }
    const notRun = results.filter((r) => r.status !== 'ran').map((r) => r.tool);
    const code = report(root, merged.rows, block, today, json, { run: id, tools: results });
    if (notRun.length && !json) console.log(`NOT RUN: ${notRun.join(', ')} — a gap in the evidence, not a pass`);
    process.exit(code);
  }
  usage();
}

function usage() {
  console.error('usage: security-scan.mjs run [--source .] [--tools a,b] [--base <ref>] [--docker auto|never] | ingest <file.sarif>… | check [--block critical,high]  [--root dev] [--json]');
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
