/**
 * The SDLC root for the hooks (DEV-CONTRACTS §2) — the same order as `<root>/scripts/lib/root.mjs`,
 * which the hooks cannot import before they know where the root is:
 *
 *   SDLC_DEV_ROOT (env) · DEV-PROFILE `SDLC root` (`Dev root` on older profiles, unless still
 *   `(default)`) · `.sdlc/` if it exists · `dev/` if it exists · `.sdlc`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function sdlcRoot(cwd = process.cwd()) {
  if (process.env.SDLC_DEV_ROOT) return resolve(cwd, process.env.SDLC_DEV_ROOT);
  for (const p of [join(cwd, '.claude', 'DEV-PROFILE.md'), join(cwd, 'DEV-PROFILE.md')]) {
    if (!existsSync(p)) continue;
    let text = '';
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    const line = /^- \*\*(?:SDLC root|Dev root):\*\*(.*)$/im.exec(text.replace(/\r\n?/g, '\n'))?.[1];
    const head = line?.split(/\s[—–]\s/)[0] ?? '';
    const value = /`([^`]+)`/.exec(head)?.[1]?.trim();
    if (value && !value.startsWith('<') && !/\(default\)/i.test(head)) return resolve(cwd, value.replace(/\/+$/, ''));
    break;
  }
  for (const name of ['.sdlc', 'dev']) if (existsSync(join(cwd, name))) return resolve(cwd, name);
  return resolve(cwd, '.sdlc');
}
