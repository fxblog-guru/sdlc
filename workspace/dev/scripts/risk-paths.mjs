#!/usr/bin/env node
/**
 * risk-paths.mjs — which changed files does the G7 reviewer read in full (DEV-CONTRACTS §13.6)?
 *
 * Reads the globs in DEV-PROFILE `## Security review` and matches them against the files changed
 * since the base. A match is read whole, against the security checklist in dev-reviewing-implementation;
 * every other file is read by diff. Test files are listed too: a test for an auth path is where a
 * weakened assertion hides.
 *
 *   node dev/scripts/risk-paths.mjs [--base <ref>] [--head HEAD] [--profile <DEV-PROFILE.md>] [--json]
 *   node dev/scripts/risk-paths.mjs --files <a> <b> …        (match a given list, no git)
 *
 * Exit 0 always (it lists, it does not judge); 2 on a usage error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, readTable } from './lib/doc.mjs';
import { hasRootPrefix } from './lib/root.mjs';

/** `**` any depth, `*` within a segment, `?` one char, `{a,b}` either. Matched against the posix path. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') { i += 1; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{' && glob.indexOf('}', i) > i) {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((alt) => alt.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** { risk: [glob…] } from DEV-PROFILE `## Security review`. */
export function profileRisks(text) {
  const out = {};
  for (const row of readTable(parseDoc(text).body, 'Security review')) {
    const risk = String(row.risk ?? '').replace(/[`*]/g, '').trim();
    const cell = Object.entries(row).find(([k]) => k.startsWith('globs'))?.[1] ?? '';
    const globs = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((g) => !g.startsWith('<'));
    if (risk && globs.length) out[risk] = globs;
  }
  return out;
}

/** [{ file, risks: [..] }] for the files that match at least one glob. */
export function classify(files, risks) {
  const compiled = Object.entries(risks).map(([risk, globs]) => [risk, globs.map(globToRegExp)]);
  return files.flatMap((file) => {
    const p = file.split('\\').join('/');
    const hit = compiled.filter(([, res]) => res.some((re) => re.test(p))).map(([risk]) => risk);
    return hit.length ? [{ file: p, risks: hit }] : [];
  });
}

function changedFiles(base, head) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let from = base;
  if (!from) {
    for (const ref of ['origin/main', 'main', 'master']) {
      try { from = git(['merge-base', ref, head]); break; } catch { /* next */ }
    }
  }
  if (!from) throw new Error('no base — pass --base <ref>');
  return git(['diff', '--name-only', '--diff-filter=ACMR', `${from}...${head}`]).split('\n').filter((f) => f && !hasRootPrefix(f));
}

function main(argv) {
  const profilePath = argFor(argv, '--profile') ?? ['.claude/DEV-PROFILE.md', 'DEV-PROFILE.md'].find((p) => existsSync(p));
  if (!profilePath || !existsSync(profilePath)) {
    console.error('risk-paths: no DEV-PROFILE.md — pass --profile');
    process.exit(2);
  }
  const risks = profileRisks(readFileSync(profilePath, 'utf8'));
  if (!Object.keys(risks).length) {
    console.error('risk-paths: DEV-PROFILE has no `## Security review` globs');
    process.exit(2);
  }
  const at = argv.indexOf('--files');
  let files;
  try {
    files = at !== -1 ? argv.slice(at + 1).filter((a) => !a.startsWith('--')) : changedFiles(argFor(argv, '--base'), argFor(argv, '--head') ?? 'HEAD');
  } catch (err) {
    console.error(`risk-paths: ${err.message}`);
    process.exit(2);
  }
  const hits = classify(files, risks);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ changed: files.length, full: hits }, null, 2));
  } else {
    for (const h of hits) console.log(`${h.file}  [${h.risks.join(', ')}]`);
    console.log(`\n${hits.length} of ${files.length} changed file(s) to read in full; the rest by diff`);
  }
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
