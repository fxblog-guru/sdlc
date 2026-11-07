/**
 * root.mjs — where the process root is (DEV-CONTRACTS §2), and how a gate-log path maps onto it.
 *
 * The root holds every artifact the bundle writes. New projects keep it in `.sdlc/`, so the
 * reviews, evidence and scripts stay out of the product's tree and its pull requests; projects
 * installed before 1.6.0 keep `dev/`, which goes on working unchanged. Every script resolves the
 * root here, in one order:
 *
 *   1. an explicit `--root <path>` (relative to the working directory);
 *   2. DEV-PROFILE `SDLC root` (`Dev root` on older profiles), unless the line still carries the
 *      template's `(default)` marker — an untouched default is not a choice;
 *   3. whichever of `.sdlc/` or `dev/` exists, `.sdlc/` first;
 *   4. `.sdlc`.
 *
 * Gate logs record repository-relative paths (`dev/requirements/…`, `.sdlc/requirements/…`). Both
 * prefixes name the root, whatever the root is called today, so a log written before a migration
 * still resolves after it. Hashes cover artifact bodies only, never a path, so none of this touches
 * a hash.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

export const DEFAULT_ROOT = '.sdlc';
export const LEGACY_ROOT = 'dev';
/** The two names a root may have, in the order an unconfigured project looks for them. */
export const ROOT_NAMES = [DEFAULT_ROOT, LEGACY_ROOT];

const PREFIX = /^(?:\.\/)?(?:\.sdlc|dev)\//;

/** The profile's root, or null when the line is missing, a placeholder, or still `(default)`. */
export function profileRoot(text) {
  const line = /^- \*\*(?:SDLC root|Dev root):\*\*(.*)$/im.exec(String(text ?? '').replace(/\r\n?/g, '\n'))?.[1];
  if (line == null) return null;
  const head = line.split(/\s[—–]\s/)[0];
  if (/\(default\)/i.test(head)) return null;
  const value = /`([^`]+)`/.exec(head)?.[1]?.trim();
  if (!value || value.startsWith('<')) return null;
  return value.replace(/\\/g, '/').replace(/^\.\/(?=.)/, '').replace(/\/+$/, '') || null;
}

/** DEV-PROFILE.md as an installed project (`.claude/`) or the bundle repository (beside it) keeps it. */
export function profileText(project) {
  for (const p of [join(project, '.claude', 'DEV-PROFILE.md'), join(project, 'DEV-PROFILE.md')]) {
    if (!existsSync(p)) continue;
    try { return readFileSync(p, 'utf8'); } catch { /* unreadable: fall through */ }
  }
  return '';
}

/**
 * The root for a project, as `{ root, name, source }`: `root` absolute, `name` as configured
 * (`.sdlc`, `dev`, or the explicit argument), `source` one of explicit · profile · found · default.
 */
export function findRoot({ explicit = null, cwd = process.cwd() } = {}) {
  if (explicit) return { root: resolve(cwd, explicit), name: explicit, source: 'explicit' };
  const configured = profileRoot(profileText(cwd));
  if (configured) return { root: resolve(cwd, configured), name: configured, source: 'profile' };
  const found = ROOT_NAMES.find((n) => existsSync(join(cwd, n)));
  if (found) return { root: resolve(cwd, found), name: found, source: 'found' };
  return { root: resolve(cwd, DEFAULT_ROOT), name: DEFAULT_ROOT, source: 'default' };
}

/** The absolute root for a script's argv: `--root <path>` if given, else findRoot. */
export function rootFromArgv(argv, cwd = process.cwd()) {
  const i = argv.indexOf('--root');
  const explicit = i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  return findRoot({ explicit, cwd }).root;
}

/** The repository-relative prefix new paths under this root are written with: `.sdlc` or `dev`. */
export function rootPrefix(root) {
  return basename(String(root ?? '')) === DEFAULT_ROOT ? DEFAULT_ROOT : LEGACY_ROOT;
}

/** True when a repository-relative path starts with either root name. */
export function hasRootPrefix(path) {
  return PREFIX.test(String(path ?? '').replace(/\\/g, '/'));
}

/** The path inside the root: `dev/x` and `.sdlc/x` both give `x`; any other path is returned as is. */
export function stripRoot(path) {
  return String(path ?? '').replace(/\\/g, '/').replace(PREFIX, '');
}

/** `<prefix>/<rel>` — how a path under `root` is written into a gate log or state.json. */
export function repoPath(root, rel) {
  return `${rootPrefix(root)}/${String(rel).replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** A recorded path with its root prefix rewritten to this root's; other paths unchanged. */
export function normalizeRef(root, path) {
  return hasRootPrefix(path) ? repoPath(root, stripRoot(path)) : String(path ?? '');
}

/**
 * The file a gate-log path names. A root-prefixed path is under the root, whichever prefix it uses.
 * An absolute path (evidence outside the repository, `C:/…/README.md`) is taken as written: joining
 * it under the root named a file that never exists, and the gate read STALE the moment it passed.
 * Anything else is repository-relative (`.claude/DEV-PROFILE.md`), and failing that, root-relative.
 */
export function locateRef(root, file) {
  if (isAbsolute(String(file))) return String(file);
  if (hasRootPrefix(file)) return join(root, stripRoot(file));
  const underProject = join(root, '..', String(file));
  return existsSync(underProject) ? underProject : join(root, String(file));
}

/*
 * The QA root belongs to the QA bundle (agentic-fx-qa, CONTRACTS §2 there): `.stlc/` in a project
 * installed with qa 2.2+, `qa/` before. This bundle only reads it (§9), so it mirrors that bundle's
 * order: `QA_ROOT`, PROJECT-PROFILE `QA root` (not while it says `(default)`), whichever of `.stlc/`
 * or `qa/` exists, then `.stlc`.
 */
export const QA_ROOT_NAMES = ['.stlc', 'qa'];

/** PROJECT-PROFILE `QA root`, or null when the line is missing, a placeholder, or still `(default)`. */
export function qaProfileRoot(text) {
  const line = /^- \*\*QA root:\*\*(.*)$/im.exec(String(text ?? '').replace(/\r\n?/g, '\n'))?.[1];
  if (line == null) return null;
  const head = line.split(/\s[—–]\s/)[0];
  if (/\(default\)/i.test(head)) return null;
  const value = /`([^`]+)`/.exec(head)?.[1]?.trim();
  if (!value || value.startsWith('<')) return null;
  return value.replace(/\\/g, '/').replace(/^\.\/(?=.)/, '').replace(/\/+$/, '') || null;
}

/** The QA root's repository-relative name for a project: `.stlc`, `qa`, or what the profile says. */
export function findQaRoot({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.QA_ROOT) return env.QA_ROOT.replace(/\\/g, '/').replace(/\/+$/, '');
  let text = '';
  try { text = readFileSync(join(cwd, '.claude', 'PROJECT-PROFILE.md'), 'utf8'); } catch { /* no qa bundle */ }
  const configured = qaProfileRoot(text);
  if (configured) return configured;
  return QA_ROOT_NAMES.find((n) => existsSync(join(cwd, n))) ?? QA_ROOT_NAMES[0];
}

/** True when a repository-relative path sits under a QA root (`.stlc/`, `qa/`, or one of `extra`). */
export function underQaRoot(path, extra = []) {
  const p = String(path ?? '').replace(/\\/g, '/');
  return [...new Set([...QA_ROOT_NAMES, ...extra])].some((n) => p.startsWith(`${n}/`));
}
