/**
 * DEV-PROFILE.md, read by the scripts that need a project setting: the id prefixes the project
 * registers (§1.1), the commit scopes and protected branches (§18.1), the CI provider (§18.3).
 *
 * The profile sits in `.claude/` once installed and beside the dev root in the bundle repository,
 * so the reader walks up from the dev root and tries both spellings, as build-state.mjs does.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findProfile(start) {
  let dir = start;
  for (let depth = 0; depth < 4; depth += 1) {
    for (const candidate of [join('.claude', 'DEV-PROFILE.md'), 'DEV-PROFILE.md']) {
      const path = join(dir, candidate);
      if (existsSync(path)) return path;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * The backticked values on a `- **<label>:**` line, before its first ` — ` (the rest explains the
 * value and quotes other names), placeholders dropped.
 */
export function listSetting(text, label) {
  const line = (new RegExp(`^- \\*\\*${label}:\\*\\*(.*)$`, 'mi').exec(text ?? '')?.[1] ?? '').split(/\s[—–]\s/)[0];
  return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter((v) => v && !v.startsWith('<') && !/^\(default\)$/.test(v));
}

/** The first backticked value on a `- **<label>:**` line, or null for a placeholder. */
export function setting(text, label) {
  return listSetting(text, label)[0] ?? null;
}

/**
 * `{ text, path, idPrefixes, scopes, protectedBranches, branchConvention, ci, trackerPrefix }`.
 * Every list is empty, and every value null, when the profile or the line is missing.
 */
export function readProfile(start, explicit = null) {
  const path = explicit ?? findProfile(start);
  const text = path && existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n?/g, '\n') : '';
  const split = (vals) => vals.flatMap((v) => v.split(/\s*[·,|]\s*/)).map((v) => v.trim()).filter(Boolean);
  const tracker = /^- \*\*Tracker:\*\*.*key format `([A-Z][A-Z0-9]*)-/m.exec(text)?.[1] ?? null;
  return {
    text,
    path,
    idPrefixes: split(listSetting(text, 'Id prefixes')),
    scopes: split(listSetting(text, 'Commit scopes')),
    protectedBranches: split(listSetting(text, 'Protected branches')),
    branchConvention: split(listSetting(text, 'Branch convention')),
    ci: (setting(text, 'CI') ?? '').toLowerCase() || null,
    trackerPrefix: tracker,
  };
}
