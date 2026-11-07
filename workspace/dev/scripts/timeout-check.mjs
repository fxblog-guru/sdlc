#!/usr/bin/env node
/**
 * timeout-check.mjs — a raised test timeout or an added retry needs a recorded cause (DEV-CONTRACTS §13.10).
 *
 * A slow test is a finding. Raising its timeout or retrying it until it passes deletes the only
 * evidence of the race, the unawaited write or the N+1 behind it, and the diff that does so reads
 * as housekeeping. This reads the diff and fails each such line that does not say why.
 *
 *   node dev/scripts/timeout-check.mjs --base <merge base> [--repo <dir>] [--json]
 *   node dev/scripts/timeout-check.mjs --diff <file.diff>                         # a saved diff
 *
 * Flagged, on an added line of a test file or a test-runner config:
 *   timeouts — `timeout:` / `timeout=`, `testTimeout`, `hookTimeout`, `test.setTimeout(`,
 *              `jest.setTimeout(`, `this.timeout(`, Go `-timeout`, `@pytest.mark.timeout(`,
 *              when the value is new or larger than the line it replaced in the same hunk;
 *   retries  — `.retry(`, `retries:` / `retries =` above 0, `retryTimes(`, `@pytest.mark.flaky`,
 *              `@flaky`, `--reruns`.
 * A line passes when it, or the line above it, carries `slow-test: <cause>` (three characters at
 * least; "flaky" alone is not a cause).
 *
 * Exit 0 nothing unexplained · 1 a finding · 2 usage error or git failure.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { isTestFile } from './lib/code.mjs';

const CONFIG = /(^|\/)((vitest|jest|playwright|cypress|karma|mocha)\.config\.[cm]?[jt]s|\.mocharc\.[a-z]+|pytest\.ini|pyproject\.toml|setup\.cfg|tox\.ini|conftest\.py|package\.json|Makefile|\.golangci\.ya?ml|[^/]*\.mk)$/;

const TIMEOUT = [
  { key: 'testTimeout', re: /\btestTimeout\s*[:=]\s*([\d_.]+\s*(?:ms|s|m)?)/ },
  { key: 'hookTimeout', re: /\bhookTimeout\s*[:=]\s*([\d_.]+\s*(?:ms|s|m)?)/ },
  { key: 'setTimeout', re: /\b(?:test|jest|vi)\.setTimeout\(\s*([\d_.]+)/ },
  { key: 'this.timeout', re: /\bthis\.timeout\(\s*([\d_.]+)/ },
  { key: 'pytest.timeout', re: /@pytest\.mark\.timeout\(\s*(?:timeout\s*=\s*)?([\d_.]+)/ },
  { key: 'go -timeout', re: /(?:^|\s)-timeout[= ]([\d.]+(?:ms|s|m|h)?)/ },
  { key: 'timeout', re: /\btimeout\s*[:=]\s*([\d_.]+\s*(?:ms|s|m)?)\b/i },
];
const RETRY = [
  { key: '.retry(', re: /\.retry\(\s*[1-9]/ },
  { key: 'retries', re: /\bretries\s*[:=]\s*(?:process\.env\.\w+\s*\?\s*)?[1-9]/ },
  { key: 'retryTimes', re: /\bretryTimes\(\s*[1-9]/ },
  { key: 'flaky', re: /@(?:pytest\.mark\.)?flaky\b/ },
  { key: '--reruns', re: /--reruns[= ]\s*[1-9]/ },
];
const CAUSE = /slow-test:\s*(\S.{2,})/;

/** A duration in milliseconds: `30_000`, `30s`, `2m`, `1.5`, Go `90s` (bare numbers stay as written). */
export function toMs(raw) {
  const m = /^([\d_.]+)\s*(ms|s|m|h)?$/.exec(String(raw).trim());
  if (!m) return null;
  const n = Number(m[1].replace(/_/g, ''));
  return n * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2]] ?? 1);
}

/** Split a unified diff into files of hunks; each line keeps its new-file line number. */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let newLine = 0;
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('diff --git ')) { file = { path: null, hunks: [] }; files.push(file); hunk = null; continue; }
    if (line.startsWith('+++ ')) {
      if (!file) { file = { path: null, hunks: [] }; files.push(file); }
      file.path = line.slice(4).replace(/^b\//, '').trim();
      continue;
    }
    if (line.startsWith('--- ')) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h && file) { hunk = []; file.hunks.push(hunk); newLine = Number(h[1]); continue; }
    if (!hunk) continue;
    if (line.startsWith('+')) hunk.push({ kind: '+', text: line.slice(1), line: newLine++ });
    else if (line.startsWith('-')) hunk.push({ kind: '-', text: line.slice(1), line: null });
    else if (line.startsWith(' ') || line === '') hunk.push({ kind: ' ', text: line.slice(1), line: newLine++ });
  }
  return files.filter((f) => f.path && f.path !== '/dev/null');
}

const inScope = (path) => isTestFile(path) || CONFIG.test(path) || CONFIG.test(basename(path));

function firstTimeout(text) {
  for (const t of TIMEOUT) {
    const m = t.re.exec(text);
    if (m) return { key: t.key, value: toMs(m[1]), raw: m[1].trim() };
  }
  return null;
}

/** Every added line that raises a timeout or adds a retry with no `slow-test:` cause. */
export function findings(diffText) {
  const out = [];
  for (const file of parseDiff(diffText)) {
    if (!inScope(file.path)) continue;
    for (const hunk of file.hunks) {
      const removed = hunk.filter((l) => l.kind === '-').map((l) => firstTimeout(l.text)).filter(Boolean);
      hunk.forEach((l, i) => {
        if (l.kind !== '+') return;
        let kind = null;
        let detail = '';
        const retry = RETRY.find((r) => r.re.test(l.text));
        if (retry && !RETRY.some((r) => hunk.some((o) => o.kind === '-' && r.re.test(o.text) && o.text.trim() === l.text.trim()))) {
          kind = 'retry';
          detail = `adds a retry (${retry.key})`;
        } else {
          const t = firstTimeout(l.text);
          if (t) {
            const before = removed.find((r) => r.key === t.key);
            if (!before) { kind = 'timeout'; detail = `sets a test timeout (${t.key} ${t.raw})`; } else if (t.value !== null && before.value !== null && t.value > before.value) {
              kind = 'timeout';
              detail = `raises a test timeout (${t.key} ${before.raw} → ${t.raw})`;
            }
          }
        }
        if (!kind) return;
        const above = hunk.slice(0, i).reverse().find((o) => o.kind !== '-');
        const cause = CAUSE.exec(l.text) ?? (above ? CAUSE.exec(above.text) : null);
        if (cause && !/^flaky\.?$/i.test(cause[1].trim())) return;
        out.push({ file: file.path, line: l.line, kind, message: `${detail} with no recorded cause — add \`slow-test: <what is slow or racy>\` on this line or the one above, or fix the test (DEV-CONTRACTS §13.10)`, text: l.text.trim() });
      });
    }
  }
  return out;
}

export function parseArgs(argv) {
  const o = { base: null, diff: null, repo: '.', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (['--base', '--diff', '--repo'].includes(a)) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = v;
      i += 1;
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!o.base === !o.diff) throw new Error('give exactly one of --base <ref> or --diff <file>');
  return o;
}

function main(argv) {
  let o;
  let text;
  try {
    o = parseArgs(argv);
    text = o.diff ? readFileSync(o.diff, 'utf8') : execFileSync('git', ['-C', o.repo, 'diff', '--no-color', '--no-ext-diff', '-U1', `${o.base}...HEAD`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    console.error(`timeout-check: ${err.message.split('\n')[0]}\nusage: timeout-check.mjs --base <merge base> [--repo <dir>] | --diff <file>`);
    return 2;
  }
  const f = findings(text);
  if (o.json) console.log(JSON.stringify(f, null, 2));
  else {
    for (const x of f) console.log(`FAIL ${x.file}:${x.line} ${x.message}\n       ${x.text}`);
    console.log(`timeout-check: ${f.length} unexplained timeout raise(s) or retry(ies)`);
  }
  return f.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('timeout-check.mjs')) process.exitCode = main(process.argv.slice(2));
