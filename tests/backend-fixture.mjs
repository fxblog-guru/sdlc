/**
 * The shared backend fixture for the §13.11 checkers: `fixtures/backend/valid` is a small Go +
 * web project every checker passes clean; `fixtures/backend/broken` holds files that, laid over a
 * copy of it, break each rule once. Tests mutate a temporary copy, never the fixture.
 */

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(here, 'fixtures', 'backend');
export const SCRIPTS = join(here, '..', 'workspace', 'dev', 'scripts');

/** A temporary copy of the valid project, optionally with the broken overlay. */
export function project({ broken = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-be-'));
  cpSync(join(FIXTURE, 'valid'), root, { recursive: true });
  if (broken) cpSync(join(FIXTURE, 'broken'), root, { recursive: true });
  return root;
}

/** Replace text in a file of a project copy; throws when the anchor is absent. */
export function edit(root, rel, from, to) {
  const p = join(root, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`${rel}: anchor not found: ${from}`);
  writeFileSync(p, s.replace(from, to));
}

/** Run a checker; returns { status, json } (json from --json). */
export function run(script, args, cwd) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args, '--json'], { cwd, encoding: 'utf8', env });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* usage error */ }
  return { status: r.status, json, stderr: r.stderr, stdout: r.stdout };
}

export const codes = (json) => Object.keys(json?.counts ?? {}).sort();
