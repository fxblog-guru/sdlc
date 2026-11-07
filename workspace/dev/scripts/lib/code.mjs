/**
 * Walking a repository's source — shared by trace.mjs, pattern-check.mjs and timeout-check.mjs.
 *
 * One list of directories that are never source (dependencies, build output, the dev root, tool
 * scratch), and one answer to "is this a test file", so the three checks agree on what they read.
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor', '.claude', '.stryker-tmp', 'reports', '__pycache__', '.venv', 'venv', '.next', '.turbo', '.vscode-test']);
// What counts as code, and which code is a test, comes from the language registry.
import { CODE_EXT } from './langs.mjs';

export { CODE_EXT, isTestFile } from './langs.mjs';

/** Every code file under the roots, as `{ abs, rel }` (rel is POSIX, from `base`). */
export function walkCode(roots, { base = roots[0], exclude = [] } = {}) {
  const out = [];
  const excluded = exclude.map((e) => e.split(sep).join('/').replace(/\/$/, ''));
  const visit = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries.sort()) {
      const abs = join(dir, entry);
      const rel = relative(base, abs).split(sep).join('/');
      if (excluded.some((e) => rel === e || rel.startsWith(`${e}/`))) continue;
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) visit(abs);
      } else if (CODE_EXT.test(entry) && !entry.endsWith('.d.ts') && !/\.min\.js$/.test(entry)) {
        out.push({ abs, rel });
      }
    }
  };
  for (const r of roots) visit(r);
  return out;
}

/** The word-bounded pattern for one id: `AC-001` never matches inside `AC-0012` or `XAC-001`. */
export function idPattern(id) {
  return new RegExp(`(?<![A-Za-z0-9-])${id.replace(/[-]/g, '\-')}(?![0-9])`);
}
