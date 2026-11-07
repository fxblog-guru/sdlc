#!/usr/bin/env node
/**
 * ui-privacy.mjs — web code keeps secrets out of the places a browser leaks them (DEV-CONTRACTS §13.13).
 *
 * A token logged to the console is in every support screenshot and every browser extension's
 * reach; one in a URL is in history, the Referer header and the proxy log; one in localStorage is
 * readable by any script the page ever runs. None of those fails a test. This grep does:
 *
 *   node dev/scripts/ui-privacy.mjs --src web/src [--json] [--baseline <file>] [--write-baseline <file>]
 *
 *   E150  a console.* call whose arguments name a token, password, secret, cookie or authorization
 *   E151  a token, password or secret put into a URL (query string, URLSearchParams, location) or
 *         into localStorage / sessionStorage
 *   W150  a file that calls a destructive mutation (delete, remove, revoke, purge, destroy …) and
 *         renders no confirmation or undo (ConfirmDialog, AlertDialog, confirm(, undo)
 *
 * Test files, stories and mocks are skipped. A line opts out with `privacy-ok: <reason>` in a
 * comment on it; a bare marker with no reason does not count.
 *
 * Exit 0 no error · 1 an error · 2 usage error.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, blankComments, isTestFile, lineAt, parseArgs, readSources, report } from './lib/check.mjs';

const SENSITIVE = /\b(?:access_?token|refresh_?token|id_?token|token|jwt|bearer|password|passwd|secret|api_?key|client_?secret|cookie|authorization|session_?id|otp)\b/i;
const CONSOLE = /\bconsole\.(?:log|info|debug|warn|error|trace|dir|table)\s*\(/g;
const STORAGE = /\b(?:localStorage|sessionStorage)\.setItem\s*\(|\b(?:localStorage|sessionStorage)\s*\[\s*['"`][^'"`]*['"`]\s*\]\s*=/g;
const URLISH = /\bnew\s+URLSearchParams\s*\(|\.searchParams\.(?:set|append)\s*\(|\b(?:window\.)?location(?:\.href)?\s*=|\bnavigate\s*\(|\bhistory\.(?:push|replace)State\s*\(|[?&][a-z_]*(?:token|password|secret|key)=/gi;
// A server mutation that destroys or revokes: an API call or mutation hook named so, or a DELETE
// request. DOM and collection calls (removeEventListener, removeChild, Map.delete) are not.
// A copy helper (`COPY.removeChosen(name)`) is a label, not a call to the server.
const DESTRUCTIVE = /(?<![.\w])(?:use(?:Delete|Remove|Revoke|Purge|Destroy|Deactivate|Archive)|delete|remove|revoke|purge|destroy|deactivate|archive)(?!EventListener|Child|Attribute|Item|Property|Listener|Class)[A-Z]\w*\s*\(|\bmethod:\s*['"]DELETE['"]|\.delete\s*\(\s*[`'"]\/|\bapi\.delete\b/;
const GUARD = /\b(?:ConfirmDialog|AlertDialog|useConfirm|confirm\s*\(|[Uu]ndo|DiscardGuard)\b/;

/** The text of the call starting at `i` (its balanced parentheses), at most one statement. */
function callText(text, i) {
  const open = text.indexOf('(', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < text.length && j < open + 2000; j += 1) {
    if (text[j] === '(') depth += 1;
    else if (text[j] === ')') { depth -= 1; if (depth === 0) return text.slice(i, j + 1); }
  }
  return text.slice(i, open + 400);
}

const waived = (lines, line) => /privacy-ok:\s*\S{3,}/.test(lines[line - 1] ?? '');

/** Findings for one source file `{ rel, text }`. */
export function scanFile({ rel, text }, findings) {
  const code = blankComments(text);
  const lines = text.split('\n');
  for (const m of code.matchAll(CONSOLE)) {
    const call = callText(code, m.index);
    const hit = SENSITIVE.exec(call.replace(/^console\.\w+\s*\(/, ''));
    const line = lineAt(code, m.index);
    if (hit && !waived(lines, line)) findings.add('E150', rel, line, `\`${call.slice(0, 80)}\` logs \`${hit[0]}\` — a client log is readable by anyone at the screen and every extension; log an id, never the value (DEV-CONTRACTS §13.13)`);
  }
  const seen = new Set();
  for (const re of [STORAGE, URLISH]) {
    for (const m of code.matchAll(re)) {
      const call = m[0].includes('=') && !m[0].includes('(') ? code.slice(m.index, code.indexOf('\n', m.index)) : callText(code, m.index);
      const hit = SENSITIVE.exec(call) ?? (/[?&][a-z_]*(?:token|password|secret|key)=/i.test(m[0]) ? [m[0]] : null);
      const line = lineAt(code, m.index);
      if (hit && !waived(lines, line) && !seen.has(line)) {
        seen.add(line);
        const where = re === STORAGE ? 'web storage — readable by every script on the origin' : 'a URL — kept in history, the Referer header and proxy logs';
        findings.add('E151', rel, line, `\`${call.slice(0, 80)}\` puts \`${hit[0]}\` into ${where}; keep it in memory or an HttpOnly cookie (DEV-CONTRACTS §13.13)`);
      }
    }
  }
  if (/\.(tsx|jsx)$/.test(rel) && DESTRUCTIVE.test(code) && !GUARD.test(code)) {
    const i = code.search(DESTRUCTIVE);
    const line = lineAt(code, i);
    if (!waived(lines, line)) findings.add('W150', rel, line, 'a destructive call with no ConfirmDialog, confirm or undo in the file — an irreversible action names its object and asks first, a reversible one offers undo (docs/ui-patterns.md Confirmation)');
  }
}

export function uiPrivacy(src) {
  const findings = new Findings();
  const files = readSources(src, (n) => /\.(tsx?|jsx?|mjs|vue|svelte)$/.test(n) && !/\.d\.ts$/.test(n))
    .filter((f) => !isTestFile(f.rel) && !/\.stories\.|(^|\/)(__mocks__|mocks|fixtures)\//.test(f.rel));
  for (const f of files) scanFile(f, findings);
  return { findings, files: files.length };
}

function main(argv) {
  const o = parseArgs(argv, ['json']);
  if (!o.src || !existsSync(o.src)) {
    console.error('usage: ui-privacy.mjs --src <web source dir> [--json] [--baseline <file>] [--write-baseline <file>]');
    return 2;
  }
  const { findings, files } = uiPrivacy(o.src);
  return report('ui-privacy', findings, { files }, { json: o.json, baseline: o.baseline, writeBaseline: o['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
