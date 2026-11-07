/**
 * runlog.mjs — the bundle's own run log: one JSON line per checker run and per hook failure, in
 * <root>/logs/runs.jsonl (DEV-CONTRACTS §13.5's fields, so the same collector can ship it).
 *
 *   { timestamp, level, service: "sdlc", event, run_id, script, slug, args, exit, errors,
 *     warnings, codes, duration_ms, message? }
 *
 * `run_id` is SDLC_RUN_ID when the caller sets one (a gate that runs several checkers passes the
 * same id to all of them, so one grep finds the whole gate), else a fresh id per process. A gate
 * that failed is then a line to read, not a terminal scrollback to find.
 *
 * Never throws and never creates the root: no root on disk, no log. SDLC_RUN_LOG=off stops it.
 * The file rolls to runs.1.jsonl past MAX_BYTES, so it never grows without bound.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';

export const MAX_BYTES = 5 * 1024 * 1024;
const SECRET_ARG = /^--?(token|password|secret|api[-_]?key)(=|$)/i;
const PROCESS_RUN_ID = randomBytes(8).toString('hex');

export const runId = (env = process.env) => env.SDLC_RUN_ID || PROCESS_RUN_ID;

/** argv without the values of secret-looking flags. */
export function safeArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (SECRET_ARG.test(a)) {
      out.push(a.includes('=') ? `${a.split('=')[0]}=[REDACTED]` : a);
      if (!a.includes('=') && i + 1 < argv.length) { out.push('[REDACTED]'); i++; }
    } else out.push(a);
  }
  return out;
}

/** The first positional argument is the slug for every checker that takes one. */
const slugOf = (argv) => {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (!argv[i].includes('=') && argv[i + 1] && !argv[i + 1].startsWith('--')) i++; continue; }
    return argv[i];
  }
  return null;
};

/**
 * Append one record. `root` is the SDLC root; the rest is merged over the defaults. Returns the
 * line written, or null when nothing was (off, no root, a write error).
 */
export function logRun(root, record, { env = process.env, argv = process.argv.slice(2), now = new Date() } = {}) {
  try {
    if (env.SDLC_RUN_LOG === 'off' || !root || !existsSync(root)) return null;
    const dir = join(root, 'logs');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'runs.jsonl');
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'runs.1.jsonl'));
    const line = {
      timestamp: now.toISOString(),
      level: record.exit ? 'error' : record.warnings ? 'warn' : 'info',
      service: 'sdlc',
      event: 'check.run_completed',
      run_id: runId(env),
      script: basename(process.argv[1] ?? 'unknown'),
      slug: slugOf(argv),
      args: safeArgs(argv),
      duration_ms: Math.round(process.uptime() * 1000),
      ...record,
    };
    const text = JSON.stringify(line);
    appendFileSync(file, `${text}\n`);
    return text;
  } catch {
    return null;
  }
}
