#!/usr/bin/env node
/**
 * PreToolUse and PostToolUse hook on Bash: block what must never run unattended, and record what
 * ran that a human had to approve (DEV-CONTRACTS §22).
 *
 *   PreToolUse   a command that matches a hard deny exits 2 with the reason on stderr: Claude Code
 *                refuses the call and the model reads why. Nothing an agent says can lift it.
 *   PostToolUse  a command that matches an `ask` class (push, migrate, apply, deploy) is appended to
 *                <root>/logs/commands.jsonl: when, which class, the command with secrets redacted.
 *                It ran, so a human approved it; the log is the record of what they approved.
 *
 * settings.json `deny` holds the same rules as globs, but a glob cannot see `git push -f` written as
 * `git push origin main --force` or `rm -rf ./` written as `rm -r -f .`. This hook parses the command
 * line, so the settings list is the first fence and this the second.
 *
 * Never throws: a hook that crashes must not block work. Exit 0 = allow, 2 = block.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sdlcRoot } from './sdlc-root.mjs';

/** Rules a human may not be asked to approve in the moment, each with why. */
export const DENY = [
  { id: 'force-push', re: /\bgit\s+push\b(?=[^|;&]*\s(?:-f\b|--force\b|--force-with-lease\b|\+\S))/, why: 'a force push rewrites shared history; do it by hand if it is really meant' },
  { id: 'rm-root', re: /\brm\s+(?=[^|;&]*-[a-z]*r)(?=[^|;&]*-[a-z]*f|[^|;&]*\s-[a-z]*f)[^|;&]*\s(?:\/|~|\.|\.\/|\*|\$HOME|"\/"|'\/')(?:\s|$|;|&|\|)/, why: 'a recursive forced delete of /, ~, . or * removes the project or the machine' },
  { id: 'drop-database', re: /\bDROP\s+(?:DATABASE|SCHEMA)\b/i, why: 'dropping a database or schema is irreversible; a migration contracts, it never drops' },
  // SQL only: inside a client call or a quoted statement, so `grep TRUNCATE file` is not one.
  { id: 'truncate', re: /(?:\b(?:psql|mysql|sqlite3|sqlcmd|clickhouse-client)\b[^|;&]*|["'`]\s*)TRUNCATE\s+(?:TABLE\s+)?[`"']?\w/i, why: 'TRUNCATE deletes every row with no undo' },
  { id: 'reset-hard-remote', re: /\bgit\s+reset\s+--hard\s+(?:origin|upstream)\//, why: 'resetting to a remote discards local commits' },
  // The file is `.env` or `.env.<name>` (not .example/.sample/.template), never `config.env.ts`.
  { id: 'env-write', re: /(?:>|\btee\b[^|;&]*)\s*(?:[^\s|;&]*\/)?\.env(?!\.(?:example|sample|template)\b)(?:\.[\w-]+)?(?=\s|$|;|&|\|)/, why: 'secrets live in .env; an agent never writes it' },
  { id: 'no-verify', re: /\bgit\s+(?:commit|push)\b[^|;&]*\s--no-verify\b/, why: 'skipping hooks skips the commit and secret checks' },
];

/** Commands that need a human's yes (settings.json `ask`), by class, for the run log. */
export const ASK = [
  { id: 'push', re: /\bgit\s+push\b/ },
  { id: 'merge-request', re: /\b(?:gh\s+pr\s+create|glab\s+mr\s+create)\b/ },
  { id: 'migrate', re: /\b(?:migrate\s+\S+\s+(?:up|down)|alembic\s+(?:upgrade|downgrade))\b/ },
  { id: 'apply', re: /\b(?:kubectl\s+apply|terraform\s+apply|helm\s+(?:install|upgrade))\b/ },
  { id: 'publish', re: /\b(?:docker\s+push|npm\s+publish|twine\s+upload)\b/ },
];

const SECRET = /((?:token|password|passwd|secret|api[-_]?key)\s*[=:]\s*|--(?:token|password|api-key)[= ]\s*|Bearer\s+)\S+/gi;
export const redact = (cmd) => String(cmd).replace(SECRET, '$1[REDACTED]').slice(0, 500);

/** The first deny rule a command trips, or null. Quoted text is looked at too: `bash -c "rm -rf /"` is still rm. */
export const denied = (cmd) => DENY.find(({ re }) => re.test(String(cmd))) ?? null;
export const askClass = (cmd) => ASK.find(({ re }) => re.test(String(cmd)))?.id ?? null;

export function handle(input, { root = sdlcRoot(), now = new Date(), env = process.env } = {}) {
  const cmd = input?.tool_input?.command;
  if (input?.tool_name !== 'Bash' || typeof cmd !== 'string') return { exit: 0 };
  if (input.hook_event_name === 'PostToolUse') {
    const cls = askClass(cmd);
    if (cls && env.SDLC_RUN_LOG !== 'off' && existsSync(root)) {
      try {
        mkdirSync(join(root, 'logs'), { recursive: true });
        appendFileSync(join(root, 'logs', 'commands.jsonl'), `${JSON.stringify({ at: now.toISOString(), class: cls, command: redact(cmd), session: input.session_id ?? null })}\n`);
      } catch { /* the log is a record, never a gate */ }
    }
    return { exit: 0, logged: cls };
  }
  const rule = denied(cmd);
  if (rule) return { exit: 2, message: `blocked by the sdlc bash guard (${rule.id}): ${rule.why}. If a human really means it, they run it themselves. (DEV-CONTRACTS §22)` };
  return { exit: 0 };
}

function main() {
  let payload = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { payload += c; });
  process.stdin.on('end', () => {
    let out = { exit: 0 };
    try { out = handle(JSON.parse(payload || '{}')); } catch { /* never block on a parse error */ }
    if (out.message) process.stderr.write(`${out.message}\n`);
    process.exit(out.exit);
  });
}

if (process.argv[1] && /(^|[\\/])bash-guard\.mjs$/.test(process.argv[1])) main();
