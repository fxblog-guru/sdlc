/**
 * Committed versions of a file, newest first, read through git (DEV-CONTRACTS §4.4: every PASS
 * commits its artifacts, so the version a verdict was reached against can be found by its hash).
 *
 * Shared by reaffirm-check.mjs (the reviewed version of an artifact) and build-state.mjs (the
 * reviewed version of the decision ledger, §5.2). A failure is thrown, never swallowed: "git is not
 * there" and "the file is too big for the buffer" are not the same answer as "no such version".
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Large enough for any artifact a gate reviews; the default 1 MB failed with ENOBUFS. */
export const MAX_BUFFER = 256 * 1024 * 1024;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * The pathspec for "code": the repository minus the dev root and `.claude/`. Neither is product code:
 * dev/ is the workspace, `.claude/` is the installed bundle (an `afx update` must not stale G7) and
 * the profile, which gates hash as an input in their own right.
 */
export const codePathspec = (devDir) => ['.', `:(exclude)${devDir}`, ':(exclude).claude'];

/** True when a repo-relative path is not code by that rule. */
export const isNotCode = (file, devDir) => file.startsWith(`${devDir}/`) || file.startsWith('.claude/');

/** True when `dir` is inside a git work tree. */
export function inGitRepo(dir) {
  try {
    return git(['rev-parse', '--is-inside-work-tree'], dir).trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * The committed versions of `file`, newest first, as a lazy list of `{ commit, text }` — `git show`
 * runs only for the versions a caller actually reaches. A deleting commit is skipped (it has no
 * text). Throws with git's own message on a real failure.
 */
export function* committedVersions(file) {
  const cwd = dirname(file);
  const name = basename(file);
  // Not `--diff-filter=d`: git before 2.4x applies it to the root commit too, which has no parent to
  // diff against, and drops it — so a file committed once had no versions at all (CI's git 2.39).
  // Ask for the status letter instead and skip the deletions here.
  // `--follow` crosses a rename — `dev/` → `.sdlc/` (migrate-root) moves every artifact — and each
  // commit is read at the path it had then, which `--name-status` gives repository-relative.
  const log = git(['log', '--follow', '--format=@%H', '--name-status', '--', name], cwd).split('\n');
  let commit = null;
  for (const line of log) {
    if (line.startsWith('@')) { commit = line.slice(1); continue; }
    if (!commit || !line.trim()) continue;
    const deleted = line.startsWith('D');
    const parts = line.split('\t');
    const path = parts[parts.length - 1];
    const c = commit;
    commit = null;
    if (!deleted) yield { commit: c, text: git(['show', `${c}:${path}`], cwd) };
  }
}

/** The newest committed version of `file` whose `hashOf(text)` starts with `recorded`, or null. */
export function findVersion(file, recorded, hashOf) {
  const want = String(recorded ?? '').toLowerCase().replace(/[….]+$/, '');
  if (!want) return null;
  for (const v of committedVersions(file)) {
    if (hashOf(v.text).startsWith(want)) return v;
  }
  return null;
}

/** The slugs a commit names in `Slug:` trailers (§18.1); empty when it names none. */
export function commitSlugs(body) {
  return [...String(body ?? '').matchAll(/^Slug:\s*(.+)$/gim)].flatMap((m) => m[1].split(/[\s,]+/).filter(Boolean));
}

/**
 * Whether a commit's task ids are `slug`'s. TASK numbers restart per slug, so `Done: TASK-003` on
 * another slug's commit would otherwise mark this slug's TASK-003 done. A commit with a `Slug:`
 * trailer belongs to the slugs it names. One without belongs to `slug` only when `slug` is the sole
 * planned slug: with two plans, an untrailed commit says nothing about which one it finished.
 */
export function belongsTo(body, slug, planned = [slug]) {
  const named = commitSlugs(body);
  if (named.length) return named.includes(slug);
  return planned.length <= 1;
}

/** Every slug with a `plan/<slug>/tasks.md` under the root. */
export function plannedSlugs(root) {
  const dir = join(root, 'plan');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'tasks.md'))).map((d) => d.name);
}
