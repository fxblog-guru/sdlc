#!/usr/bin/env node
/**
 * run-id.mjs — print a fresh run-id (DEV-CONTRACTS §1): `YYYYMMDD-HHMMSS-xxxx`, UTC time and
 * 4 lowercase hex characters. With `--next-cr <slug>` or `--next-dec <slug>`, print the next free
 * finding or decision id instead.
 *
 *   node dev/scripts/run-id.mjs
 *   node dev/scripts/run-id.mjs --next-cr <slug> [--count N] [--root dev]
 *   node dev/scripts/run-id.mjs --next-dec <slug> [--count N] [--root dev]
 *   node dev/scripts/run-id.mjs --next <REQ|AC|TASK> <slug> [--count N] [--root dev]
 *
 * A run-id written by hand drifts: upper-case hex, five characters, local time without seconds.
 * Each of those fails E006 on the gate log after the review has already been paid for, so the
 * stage protocol takes its run-id from here.
 *
 * A CR id numbered per run restarts at CR-001 and collides with the last run's (E090). The next one
 * is the highest CR-NNN in every log of the slug, plus one (§1.1); ids in code spans are quoted.
 *
 * Two reviewers started in parallel both read the same highest CR before either wrote its log, and
 * both took the same next id. So every id handed out is also claimed: a file
 * `<root>/.claims/<slug>/CR-042`, created exclusively, which a second process cannot create too. A
 * claim expires after CLAIM_TTL_MS; by then the log that uses the id is written and the scan sees it.
 * DEC ids go the same way against the decision ledger.
 */

import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootFromArgv } from './lib/root.mjs';

/** `now` and `rand` are injectable for tests; `rand` returns an integer in [0, 0xffff]. */
export function runId(now = new Date(), rand = () => randomInt(0x10000)) {
  const iso = now.toISOString(); // 2026-09-18T14:35:22.900Z
  const date = iso.slice(0, 10).replace(/-/g, '');
  const time = iso.slice(11, 19).replace(/:/g, '');
  const hex = (rand() & 0xffff).toString(16).padStart(4, '0');
  return `${date}-${time}-${hex}`;
}

/** The highest `<kind>-NNN` in a text, outside code. */
function maxIn(text, kind) {
  const bare = text.replace(/```[\s\S]*?```/g, '').replace(/(`+)[^`\n]*?\1/g, ' ');
  let max = 0;
  for (const m of bare.matchAll(new RegExp(`\\b${kind}-(\\d{3,})\\b`, 'g'))) max = Math.max(max, Number(m[1]));
  return max;
}

/** The highest CR number in a slug's logs, outside code. */
export function maxCr(root, slug) {
  const dir = join(root, 'reviews', slug);
  let max = 0;
  if (!existsSync(dir)) return max;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    max = Math.max(max, maxIn(readFileSync(join(dir, f), 'utf8'), 'CR'));
  }
  return max;
}

/** The highest DEC number in a slug's ledger, outside code. */
export function maxDec(root, slug) {
  const file = join(root, 'decisions', `${slug}.md`);
  return existsSync(file) ? maxIn(readFileSync(file, 'utf8'), 'DEC') : 0;
}

/** Long enough to write a gate log or a ledger row; short enough that a crashed run frees its ids. */
export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

const fmt = (kind, n) => `${kind}-${String(n).padStart(3, '0')}`;

/**
 * Claim `count` consecutive free ids of `kind` for `slug`, above the highest written id and every
 * live claim. Exclusive create (`wx`) is the lock: of two processes racing for one number, exactly
 * one creates the file; the other starts its block again above it.
 */
export function claimIds(root, slug, kind, written, { count = 1, now = Date.now(), ttl = CLAIM_TTL_MS } = {}) {
  const dir = join(root, '.claims', slug);
  mkdirSync(dir, { recursive: true });
  const shape = new RegExp(`^${kind}-(\\d{3,})$`);
  let floor = written;
  for (const name of readdirSync(dir)) {
    const m = shape.exec(name);
    if (!m) continue;
    let mtime;
    try { mtime = statSync(join(dir, name)).mtimeMs; } catch { continue; }
    if (now - mtime > ttl) { rmSync(join(dir, name), { force: true }); continue; }
    floor = Math.max(floor, Number(m[1]));
  }
  const out = [];
  for (let n = floor + 1; out.length < count; n += 1) {
    try {
      writeFileSync(join(dir, fmt(kind, n)), `${new Date(now).toISOString()} pid ${process.pid}\n`, { flag: 'wx' });
      out.push(fmt(kind, n));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // A block that skipped a number would not be consecutive; the ids already taken stay claimed
      // and simply go unused, which costs a gap and never a collision.
      out.length = 0;
    }
  }
  return out;
}

/** The file that defines each kind (§2): an agent asks for the next id instead of reading the file. */
export const DEFINED_IN = { REQ: 'requirements/<slug>/requirements.md', AC: 'requirements/<slug>/acceptance-criteria.md', TASK: 'plan/<slug>/tasks.md' };

export function maxOf(root, slug, kind) {
  const file = join(root, DEFINED_IN[kind].replace('<slug>', slug));
  return existsSync(file) ? maxIn(readFileSync(file, 'utf8'), kind) : 0;
}

export function nextId(root, slug, kind, opts) {
  return claimIds(root, slug, kind, maxOf(root, slug, kind), opts);
}

export function nextCr(root, slug, opts) {
  return claimIds(root, slug, 'CR', maxCr(root, slug), opts);
}

export function nextDec(root, slug, opts) {
  return claimIds(root, slug, 'DEC', maxDec(root, slug), opts);
}

if (process.argv[1]?.endsWith('run-id.mjs')) {
  const argv = process.argv.slice(2);
  const flag = ['--next-cr', '--next-dec', '--next'].find((f) => argv.includes(f));
  const kind = flag === '--next' ? argv[argv.indexOf(flag) + 1] : null;
  if (flag === '--next' && !DEFINED_IN[kind]) {
    console.error(`run-id: --next takes ${Object.keys(DEFINED_IN).join(', ')}`);
    process.exit(2);
  }
  if (!flag) {
    console.log(runId());
  } else {
    const slug = argv[argv.indexOf(flag) + (kind ? 2 : 1)];
    const c = argv.indexOf('--count');
    const count = c === -1 ? 1 : Number(argv[c + 1]);
    if (!slug || slug.startsWith('--')) {
      console.error(`run-id: ${flag} needs a slug`);
      process.exit(2);
    }
    if (!Number.isInteger(count) || count < 1) {
      console.error('run-id: --count needs a whole number, 1 or more');
      process.exit(2);
    }
    const root = rootFromArgv(argv);
    const ids = kind ? nextId(root, slug, kind, { count }) : (flag === '--next-cr' ? nextCr : nextDec)(root, slug, { count });
    console.log(ids.join('\n'));
  }
}
