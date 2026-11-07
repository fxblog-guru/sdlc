/**
 * source.mjs — walk a project's source tree for the security scripts (threat-trace, data-guard).
 *
 * Skips what is never authored code and is often huge: dependency folders, build output, VCS
 * metadata, the dev/ artifact tree and agent worktrees. Without the skips a scan of a Next.js repo
 * reads node_modules and takes minutes.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT_NAMES } from './root.mjs';

export const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'out', '.next', 'coverage', '.venv', 'venv',
  '__pycache__', '.turbo', '.cache', 'target', '.claude', '.idea', '.vscode',
]);

/** Every file under `root` whose name passes `pred`, as absolute paths, skipping SKIP_DIRS. */
export function walkSource(root, pred, { skipDev = true, maxBytes = 8 * 1024 * 1024 } = {}) {
  const out = [];
  const visit = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (skipDev && dir === root && ROOT_NAMES.includes(e.name)) continue;
        visit(full);
      } else if (e.isFile() && pred(e.name, full)) {
        try { if (statSync(full).size <= maxBytes) out.push(full); } catch { /* vanished */ }
      }
    }
  };
  visit(root);
  return out;
}

export function toPosix(root, abs) {
  return relative(root, abs).split(sep).join('/');
}
