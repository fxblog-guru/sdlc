#!/usr/bin/env node
/**
 * data-guard.mjs — do seeds, fixtures and the preview database hold only invented data
 * (DEV-CONTRACTS §13.6)?
 *
 * Finds every e-mail address, URL host and `host`/`domain`/`site_url`-style value, and reports the
 * ones whose domain is not on the allow-list: the reserved names (`example`, `test`, `invalid`,
 * `localhost`, example.com/.net/.org, loopback and private IPs), a few spec namespaces, and
 * DEV-PROFILE `Allowed data domains` (the project's invented names, e.g. `kestrel.example`).
 *
 * Files are not enough. On release-management an Owner session typed a real company's Jira host into
 * the preview database; no seed file ever held it. So `--dump` reads a text export of the preview DB
 * (`pg_dump --data-only --inserts`, `mysqldump`, or any query output; `.gz` is read too), and the
 * preview is checked before a review looks at it.
 *
 *   node dev/scripts/data-guard.mjs [--source .] [--profile .claude/DEV-PROFILE.md]
 *                                   [--dump <file>]... [--file <file>]... [--allow <domain>]... [--json]
 *
 *   --source   scan seed and fixture files under this root (paths with seed, fixture, testdata,
 *              mock in them). Default `.`; `--no-files` skips the scan and reads only --dump/--file.
 *
 * Exit 1 when anything is outside the allow-list, 2 on a usage error. Values are printed masked
 * (first letters only), so the report does not itself copy the real data into a log.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { toPosix, walkSource } from './lib/source.mjs';

export const DEFAULT_ALLOW = [
  'example', 'test', 'invalid', 'localhost', 'local',
  'example.com', 'example.net', 'example.org',
  // Namespace URIs in schemas and XML — identifiers, not data.
  'w3.org', 'json-schema.org', 'schema.org', 'spec.openapis.org', 'xmlsoap.org', 'openxmlformats.org', 'purl.org',
];

const SEED_PATH = /(^|\/)(seeds?|fixtures?|testdata|__fixtures__|mocks?|samples?)(\/|$)|seed|fixture/i;
const TEXT_FILE = /\.(go|sql|json|ya?ml|ts|tsx|js|jsx|mjs|py|csv|txt|toml|env\.example)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@"'`<>]+@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|localhost)(?::\d+)?/gi;
const HOST_VALUE = /["']?\b(?:host|hostname|domain|site|site_url|base_url|url|server)["']?\s*[:=]\s*["']([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)["']/gi;

/** `- **Allowed data domains:** `a.example`, `b.test`` from DEV-PROFILE. */
export function profileAllow(text) {
  const line = /\*\*Allowed data domains:\*\*([^\n]*)/.exec(text)?.[1] ?? '';
  return [...line.matchAll(/`([^`<>]+)`/g)].map((m) => m[1].trim().toLowerCase().replace(/^\*\./, '')).filter((d) => d && d !== 'default');
}

export function allowed(host, allow) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0)/.test(h);
  return allow.some((a) => h === a || h.endsWith(`.${a}`));
}

/** Every out-of-list domain in `text`, as { domain, kind, line, value }. */
export function scan(text, allow) {
  const out = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    const seen = new Set();
    const hit = (domain, kind, value) => {
      if (!domain || allowed(domain, allow) || seen.has(domain.toLowerCase())) return;
      // A file name ending in a code extension is not a host (`main.go`, `x.ts`) — skip bare hits.
      if (kind === 'value' && /\.(go|ts|tsx|js|py|md|json|sql|txt|html|css|png|svg)$/i.test(domain)) return;
      seen.add(domain.toLowerCase());
      out.push({ domain: domain.toLowerCase(), kind, line: i + 1, value: mask(value) });
    };
    for (const m of line.matchAll(EMAIL)) hit(m[1], 'email', m[0]);
    for (const m of line.matchAll(URL_HOST)) hit(m[1], 'url', m[0]);
    for (const m of line.matchAll(HOST_VALUE)) hit(m[1], 'value', m[1]);
  });
  return out;
}

/** `jira.acme-corp.com` → `ji…` + length: enough to find it, not enough to republish it. */
function mask(value) {
  return `${value.slice(0, 3)}…(${value.length} chars)`;
}

function readText(path) {
  const buf = readFileSync(path);
  return (path.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
}

export function seedFiles(source) {
  return walkSource(source, (name, full) => TEXT_FILE.test(name) && SEED_PATH.test(toPosix(source, full)));
}

function main(argv) {
  const many = (flag) => argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1]] : []));
  const source = resolve(argFor(argv, '--source') ?? '.');
  const profilePath = argFor(argv, '--profile') ?? ['.claude/DEV-PROFILE.md', 'DEV-PROFILE.md'].map((p) => resolve(source, p)).find((p) => existsSync(p));
  const fromProfile = profilePath && existsSync(profilePath) ? profileAllow(readFileSync(profilePath, 'utf8')) : [];
  const allow = [...DEFAULT_ALLOW, ...fromProfile, ...many('--allow').map((a) => a.toLowerCase())];

  const targets = [
    ...(argv.includes('--no-files') ? [] : seedFiles(source).map((f) => ({ path: f, kind: 'file' }))),
    ...many('--file').map((f) => ({ path: resolve(f), kind: 'file' })),
    ...many('--dump').map((f) => ({ path: resolve(f), kind: 'dump' })),
  ];
  for (const t of targets) {
    if (!existsSync(t.path)) {
      console.error(`data-guard: no such file ${t.path}`);
      process.exit(2);
    }
  }

  const findings = targets.flatMap((t) => scan(readText(t.path), allow).map((f) => ({ file: toPosix(source, t.path), source: t.kind, ...f })));
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ scanned: targets.length, allow: fromProfile, findings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}  ${f.kind.padEnd(5)}  ${f.domain}  (${f.value})`);
    console.log(`\n${findings.length} value(s) outside the allow-list in ${targets.length} file(s)` +
      (fromProfile.length ? '' : ' — DEV-PROFILE `Allowed data domains` not set, reserved names only'));
  }
  process.exit(findings.length ? 1 : 0);
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
