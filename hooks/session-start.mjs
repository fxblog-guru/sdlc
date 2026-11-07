#!/usr/bin/env node
/**
 * SessionStart hook: print the gate board, briefly.
 *
 * Every session opens knowing which initiatives are at which gate and what is stuck, instead of
 * asking. Output goes to stdout, which Claude Code adds to the session context.
 *
 * state.json is derived and not tracked in git (DEV-CONTRACTS §8), so a fresh clone or a new lane
 * worktree has none: build it first, or the board, the commands' preflight and the editor
 * extension would all read nothing.
 *
 * It also prints one line when an update of this bundle is known. The installer (`afx`, or the public
 * `npx agentic-fx`) writes `.claude/.agentic-fx-updates.json`; this hook only reads it and never
 * touches the network. Any
 * doubt (no file, bad JSON, a kind of "none" or "unknown", AFX_NO_UPDATE_CHECK=1) means silence.
 * Then the learning brief (DEV-CONTRACTS §19.5): signals not yet a lesson, lessons written, ideas
 * to rank, all only when new since the last brief, so the loop runs without anyone remembering it.
 *
 * Nothing here can fail the hook: a session must always start.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sdlcRoot } from './sdlc-root.mjs';

const SEMVER = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,40})?$/;
const KINDS = ['patch', 'minor', 'major'];

/**
 * The update command for the installer that wrote the notice: `npm:` sources came from the public
 * npx package, everything else from afx. Picked from two fixed strings, never read from the file.
 */
export function updateCommand(source) {
  return typeof source === 'string' && source.startsWith('npm:') ? 'npx agentic-fx@latest update --bundle dev' : 'afx update --bundle dev';
}

/**
 * The one update line for the dev bundle, or '' when there is nothing certain to say.
 * The file's text lands in the session context, so every field is checked for shape first.
 */
export function updateLine(cwd = process.cwd(), env = process.env) {
  try {
    if (env.AFX_NO_UPDATE_CHECK === '1') return '';
    const file = join(cwd, '.claude', '.agentic-fx-updates.json');
    if (!existsSync(file)) return '';
    const dev = JSON.parse(readFileSync(file, 'utf8'))?.bundles?.dev;
    if (!dev || typeof dev !== 'object') return '';
    if (!KINDS.includes(dev.kind)) return '';
    if (!SEMVER.test(String(dev.latest)) || !SEMVER.test(String(dev.installed))) return '';
    const url = typeof dev.changelog_url === 'string' && /^https:\/\/\S{1,300}$/.test(dev.changelog_url) ? dev.changelog_url : '';
    let line = `agentic-fx-dev ${dev.latest} available (installed ${dev.installed}, ${dev.kind}) — ${updateCommand(dev.source)}`;
    if (url) line += ` · ${url}`;
    if (dev.kind === 'major') line += ' — MAJOR: read UPGRADE.md first';
    return line;
  } catch {
    return '';
  }
}

function main() {
  let printed = false;
  try {
    const DEV_ROOT = sdlcRoot();
    const status = join(DEV_ROOT, 'scripts', 'status.mjs');
    const builder = join(DEV_ROOT, 'scripts', 'build-state.mjs');
    if (!existsSync(join(DEV_ROOT, 'state.json')) && existsSync(builder) && existsSync(join(DEV_ROOT, 'reviews'))) {
      spawnSync(process.execPath, [builder, '--root', DEV_ROOT, '--quiet'], { encoding: 'utf8' });
    }
    if (existsSync(status) && existsSync(join(DEV_ROOT, 'state.json'))) {
      const run = spawnSync(process.execPath, [status, '--root', DEV_ROOT, '--brief'], { encoding: 'utf8' });
      if (run.stdout) {
        process.stdout.write(`[agentic-fx-dev]\n${run.stdout}`);
        printed = true;
      }
    }
  } catch {
    // the board is a convenience
  }
  try {
    const DEV_ROOT = sdlcRoot();
    const learn = join(DEV_ROOT, 'scripts', 'learn.mjs');
    if (existsSync(learn)) {
      const run = spawnSync(process.execPath, [learn, 'brief', '--root', DEV_ROOT], { encoding: 'utf8', timeout: 8000 });
      if (run.status === 0 && run.stdout.trim()) {
        process.stdout.write(`${printed ? '' : '[agentic-fx-dev]\n'}${run.stdout}`);
        printed = true;
      }
    }
  } catch {
    // learning is a convenience too: it never stops a session
  }
  const line = updateLine();
  if (line) process.stdout.write(`${printed ? '' : '[agentic-fx-dev]\n'}${line}\n`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
