#!/usr/bin/env node
/**
 * Stop hook: regenerate <root>/state.json and DASHBOARD.md.
 *
 * Runs at the end of every turn, so an interrupted /sdlc-* command can never leave the index
 * describing a state that no longer exists. Silent on success; a failure is printed but never
 * blocks — a broken index builder should not stop someone from finishing their sentence.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sdlcRoot } from './sdlc-root.mjs';

const DEV_ROOT = sdlcRoot();
const builder = join(DEV_ROOT, 'scripts', 'build-state.mjs');

if (existsSync(builder) && existsSync(join(DEV_ROOT, 'reviews'))) {
  const run = spawnSync(process.execPath, [builder, '--root', DEV_ROOT, '--quiet'], { encoding: 'utf8' });
  if (run.status !== 0) {
    const message = `${run.stderr || run.stdout}`.trim();
    console.error(`rebuild-state: ${message}`);
    // The terminal line scrolls away; the run log keeps it (scripts/lib/runlog.mjs).
    try {
      const { logRun } = await import(pathToFileURL(join(DEV_ROOT, 'scripts', 'lib', 'runlog.mjs')).href);
      logRun(DEV_ROOT, { event: 'hook.rebuild_failed', script: 'rebuild-state', exit: run.status ?? 1, message: message.slice(0, 2000) }, { argv: [] });
    } catch { /* an install without runlog.mjs: the terminal line is all there is */ }
  }
}
process.exit(0);
