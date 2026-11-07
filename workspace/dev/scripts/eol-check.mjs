#!/usr/bin/env node
/**
 * eol-check.mjs — fixtures, golden files and baselines are pinned `eol=lf`, and the evidence a gate
 * hashes is the committed bytes, not a Windows working tree (DEV-CONTRACTS §5.2).
 *
 * With core.autocrlf on, git checks a file out with CRLF and commits it with LF. A golden file
 * compared byte for byte then fails on one machine and passes on another, and a hash taken from
 * the working tree matches no commit. On Recall, a G7 evidence bundle hashed the CRLF tree and CI,
 * on LF, called every input stale. Two things are checked:
 *
 *   E170 a tracked file under a fixture, golden, snapshot or baseline path whose effective
 *        `eol` attribute (`git check-attr`) is not `lf`: a `.gitattributes` line is missing
 *   E171 such a file committed with CRLF in the index (`git ls-files --eol` reports `i/crlf`)
 *
 *   node dev/scripts/eol-check.mjs [--repo .] [--json]
 *
 * The attribute checked is the effective one git reports for each path, never the text of
 * `.gitattributes`: a later pattern, a nested file or `-text` can undo a line that looks right.
 * For evidence, take files from `git -c core.autocrlf=false archive HEAD`, never the working tree.
 *
 * Exit 1 on any error, 0 otherwise, 2 when the directory is not a git work tree.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, parseArgs, report } from './lib/check.mjs';

/** Paths whose bytes a test or a gate compares exactly. */
export const PINNED = /(^|\/)(testdata|fixtures?|golden|__snapshots__|snapshots|baselines?)\/|\.(golden|snap)$|(^|\/)[^/]*baseline[^/]*\.(json|txt|md)$/i;

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });

/** `git ls-files --eol` lines → `{ path, index }`, index one of lf · crlf · mixed · none · -text. */
function indexEol(repo) {
  return git(repo, ['ls-files', '--eol', '-z']).split('\0').filter(Boolean).map((l) => {
    // The attr field holds spaces (`attr/text eol=lf`); the tab is the only safe separator.
    const m = /^i\/(\S*)\s+w\/\S*\s+attr\/[^\t]*\t(.+)$/.exec(l);
    return m ? { path: m[2], index: m[1] } : null;
  }).filter(Boolean);
}

/** The effective `eol` attribute of each path, from git itself. */
function eolAttr(repo, paths) {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const raw = execFileSync('git', ['-C', repo, 'check-attr', '-z', 'eol', 'text', '--stdin'], { input: chunk.join('\0'), encoding: 'utf8', maxBuffer: 1 << 28 });
    const parts = raw.split('\0');
    for (let j = 0; j + 2 < parts.length; j += 3) {
      const [path, attr, value] = [parts[j], parts[j + 1], parts[j + 2]];
      const held = out.get(path) ?? {};
      held[attr] = value;
      out.set(path, held);
    }
  }
  return out;
}

export function checkEol(repo, findings = new Findings()) {
  const files = indexEol(repo).filter((f) => PINNED.test(f.path) && f.index !== '-text' && f.index !== 'none');
  const attrs = eolAttr(repo, files.map((f) => f.path));
  let pinned = 0;
  for (const f of files) {
    const a = attrs.get(f.path) ?? {};
    // `text` unset or `-text` means binary to git: no conversion, nothing to pin.
    if (a.text === 'unset') continue;
    if (a.eol === 'lf') pinned++;
    else findings.add('E170', f.path, 0, `compared byte for byte, and its effective eol is \`${a.eol ?? 'unspecified'}\` — add \`${f.path.split('/').slice(0, -1).join('/') || '.'}/** text eol=lf\` (or a narrower pattern) to .gitattributes`);
    if (f.index === 'crlf' || f.index === 'mixed') findings.add('E171', f.path, 0, `committed with ${f.index.toUpperCase()} line endings — after pinning, \`git add --renormalize ${f.path}\``);
  }
  return { findings, summary: { files: files.length, pinned } };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const repo = resolve(a.repo ?? '.');
  try {
    if (git(repo, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new Error('not a work tree');
  } catch {
    console.error(`eol-check: ${repo} is not a git work tree`);
    return 2;
  }
  const { findings, summary } = checkEol(repo);
  return report('eol-check', findings, summary, { json: a.json });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
