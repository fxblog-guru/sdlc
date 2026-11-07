#!/usr/bin/env node
/**
 * migrate-root.mjs — move a project's SDLC root between `dev/` and `.sdlc/` (DEV-CONTRACTS §2).
 *
 *   node <root>/scripts/migrate-root.mjs --to .sdlc [--project .] [--write] [--json]
 *   node <root>/scripts/migrate-root.mjs --to dev   [--project .] [--write] [--json]
 *
 * A dry run by default: it prints every step and changes nothing. With --write it
 *
 *   1. moves the folder: `git mv <from> <to>` when the project is a git work tree (untracked and
 *      ignored files move with the folder), a plain rename otherwise;
 *   2. sets DEV-PROFILE `SDLC root` to the new name (replacing a `Dev root` line, or adding one);
 *   3. rewrites the root prefix of `path:` and `revalidated_from:` values in the FRONT MATTER of
 *      every `.md` under the root. A markdown artifact's hash is its body (§5.2), so front matter
 *      is the one place a path can change without touching a hash; every file is re-hashed before
 *      it is written and left alone if its hash would move. A path inside a body, or inside a file
 *      hashed whole (yaml, html), is never rewritten: both prefixes resolve to the root (§2);
 *   4. rewrites `<from>/` in the wiring files that call the scripts — package.json, .gitignore, the
 *      CI files, Taskfile.yml, .claude/settings.json — and `core.hooksPath` when it points into the root;
 *   5. rebuilds state.json and DASHBOARD.md under the new root.
 *
 * Exit 0 on success or a clean dry run, 1 when the move cannot be made, 2 on a usage error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc } from './lib/doc.mjs';
import { DEFAULT_ROOT, LEGACY_ROOT, ROOT_NAMES, profileRoot } from './lib/root.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** `SDLC_ROOT: dev` in a CI template (§2) — the one place the root is named without a `/`. */
const ENV_LINE = (from) => new RegExp(`^(\\s*SDLC_ROOT:\\s*['"]?)${escape(from)}(['"]?\\s*)$`, 'gm');

/** A wiring file's text with the root moved: `<from>/` path prefixes and a `SDLC_ROOT: <from>` line. */
export function rewireText(text, from, to) {
  return text.replace(prefixPattern(from), `${to}/`).replace(ENV_LINE(from), `$1${to}$2`);
}

/** The files outside the root that name it in a command or a glob. Each is plain text, never hashed. */
export const WIRING = ['package.json', '.gitignore', '.gitlab-ci.yml', 'Taskfile.yml', join('.claude', 'settings.json')];
const WIRING_DIRS = [join('.github', 'workflows')];

const toPosix = (p) => p.split(sep).join('/');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `<from>/` at the start of a path token — not `x-dev/`, `/dev/null`, `go.dev/` or `@dev/` — or
 * anchored at the start of a line (`/dev/state.json` in a .gitignore).
 */
const prefixPattern = (from) => new RegExp(`(?<![\\w./@-])${escape(from)}/|(?<=^/)${escape(from)}/`, 'gm');

/** Every file under `dir`, recursively. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * The front matter of `text` with the root prefix of `path:` and `revalidated_from:` values moved
 * from `from` to `to`, and how many values moved. The body is returned byte for byte.
 */
export function rewriteFrontMatter(text, from, to) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const src = text.replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return { text, changed: 0 };
  const end = src.indexOf('\n---', 4);
  if (end === -1) return { text, changed: 0 };
  const head = src.slice(0, end);
  let changed = 0;
  const key = new RegExp(`((?:^|[\\s{,\\[-])(?:path|revalidated_from):\\s*['"]?)(?:\\./)?${escape(from)}/`, 'gm');
  const next = head.replace(key, (_, lead) => { changed += 1; return `${lead}${to}/`; });
  if (!changed) return { text, changed: 0 };
  const out = next + src.slice(end);
  return { text: nl === '\n' ? out : out.replace(/\n/g, '\r\n'), changed };
}

/** The profile text with `SDLC root` set to `to`: an existing SDLC/Dev root entry replaced, or one added. */
export function setProfileRoot(text, to) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const entry = `- **SDLC root:** \`${to}\` — the process root (DEV-CONTRACTS §2); set by migrate-root.mjs.`;
  const at = lines.findIndex((l) => /^- \*\*(?:SDLC root|Dev root):\*\*/i.test(l));
  if (at !== -1) {
    let end = at + 1;
    while (end < lines.length && /^\s{2,}\S/.test(lines[end])) end += 1; // the entry's continuation lines
    lines.splice(at, end - at, entry);
  } else {
    const project = lines.findIndex((l) => /^## Project\s*$/.test(l));
    if (project === -1) lines.push('', '## Project', '', entry);
    else {
      let i = project + 1;
      while (i < lines.length && lines[i].trim() === '') i += 1;
      while (i < lines.length && /^(- |\s{2,}\S)/.test(lines[i])) i += 1;
      lines.splice(i, 0, entry);
    }
  }
  return lines.join(nl === '\n' ? '\n' : '\r\n');
}

function profilePath(project) {
  return [join(project, '.claude', 'DEV-PROFILE.md'), join(project, 'DEV-PROFILE.md')].find((p) => existsSync(p)) ?? null;
}

function inGit(project) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8' });
  return r.status === 0 && resolve(r.stdout.trim()) === resolve(project);
}

/**
 * The migration plan for `project`, moving to `to`. Pure apart from reading the disk.
 * `{ from, to, problems[], frontMatter: [{ file, changed }], bodyMentions: [{ file, count }],
 *    wiring: [{ file, lines: [{ was, now }] }], hooksPath, profile }`
 */
export function plan(project, to) {
  const problems = [];
  const from = to === DEFAULT_ROOT ? LEGACY_ROOT : DEFAULT_ROOT;
  const fromAbs = join(project, from);
  const toAbs = join(project, to);
  const out = { project, from, to, problems, frontMatter: [], bodyMentions: [], wiring: [], hooksPath: null, profile: null, git: false };
  if (!ROOT_NAMES.includes(to)) { problems.push(`--to is ${ROOT_NAMES.join(' or ')}, not \`${to}\``); return out; }
  if (existsSync(toAbs)) problems.push(`${to}/ already exists — nothing to move into`);
  if (!existsSync(fromAbs)) problems.push(`${from}/ does not exist — nothing to move`);
  if (problems.length) return out;
  out.git = inGit(project);

  const pattern = prefixPattern(from);
  for (const abs of walk(fromAbs)) {
    const rel = toPosix(relative(fromAbs, abs));
    if (/^(scripts|_templates|ci)\//.test(rel)) continue; // bundle code and templates; ci/ is rewired below
    if (!abs.endsWith('.md')) {
      if (/\.(ya?ml|json|html|txt)$/.test(abs)) {
        const n = (readFileSync(abs, 'utf8').match(pattern) ?? []).length;
        if (n && rel !== 'state.json') out.bodyMentions.push({ file: `${from}/${rel}`, count: n, why: 'hashed whole' });
      }
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    const { text: next, changed } = rewriteFrontMatter(text, from, to);
    if (changed) {
      if (parseDoc(next).bodyHash !== parseDoc(text).bodyHash) problems.push(`${from}/${rel}: rewriting its front matter would move its hash — left alone`);
      else out.frontMatter.push({ file: rel, changed });
    }
    const body = parseDoc(next).body;
    const n = (body.match(pattern) ?? []).length;
    if (n && rel !== 'DASHBOARD.md') out.bodyMentions.push({ file: `${from}/${rel}`, count: n, why: 'in the hashed body' });
  }

  // The root's own CI templates name it in SDLC_ROOT; they are bundle templates, never a gate artifact.
  const rootCi = ['gitlab-ci.yml', 'github-workflow.yml'].map((f) => join(from, 'ci', f));
  const wiringFiles = [...WIRING, ...rootCi, ...WIRING_DIRS.flatMap((d) => (existsSync(join(project, d)) ? readdirSync(join(project, d)).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(d, f)) : []))];
  for (const f of wiringFiles) {
    const abs = join(project, f);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    const moved = lines.map((l) => ({ was: l, now: rewireText(l, from, to) })).filter((m) => m.now !== m.was).map((m) => ({ was: m.was.trim(), now: m.now.trim() }));
    if (moved.length) out.wiring.push({ file: toPosix(f), lines: moved });
  }
  if (out.git) {
    const hp = spawnSync('git', ['config', '--local', 'core.hooksPath'], { cwd: project, encoding: 'utf8' }).stdout.trim();
    if (hp && (hp === from || hp.startsWith(`${from}/`))) out.hooksPath = { was: hp, now: `${to}${hp.slice(from.length)}` };
  }
  const pp = profilePath(project);
  if (pp) out.profile = { file: toPosix(relative(project, pp)), was: profileRoot(readFileSync(pp, 'utf8')) };
  return out;
}

/** Carry the plan out. Returns the build-state exit status. */
export function apply(p) {
  const { project, from, to } = p;
  const fromAbs = join(project, from);
  const toAbs = join(project, to);
  // 1. The folder. `git mv` renames the directory, so untracked and ignored files go with it.
  const tracked = p.git && execFileSync('git', ['ls-files', '--', from], { cwd: project, encoding: 'utf8' }).trim();
  if (tracked) execFileSync('git', ['mv', from, to], { cwd: project, stdio: 'pipe' });
  else renameSync(fromAbs, toAbs);
  if (existsSync(fromAbs)) {
    // git mv moved the tracked files; anything it left (ignored files) follows by hand.
    for (const abs of walk(fromAbs)) {
      const dest = join(toAbs, relative(fromAbs, abs));
      if (!existsSync(dest)) { mkdirSync(dirname(dest), { recursive: true }); renameSync(abs, dest); }
    }
    rmSync(fromAbs, { recursive: true, force: true });
  }
  // 2. The profile.
  if (p.profile) {
    const abs = join(project, p.profile.file);
    writeFileSync(abs, setProfileRoot(readFileSync(abs, 'utf8'), to));
  }
  // 3. Front matter — re-checked against the hash at write time.
  for (const { file } of p.frontMatter) {
    const abs = join(toAbs, file);
    const text = readFileSync(abs, 'utf8');
    const { text: next } = rewriteFrontMatter(text, from, to);
    if (parseDoc(next).bodyHash === parseDoc(text).bodyHash) writeFileSync(abs, next);
  }
  // 4. Wiring.
  for (const { file } of p.wiring) {
    // A file inside the root has moved with it.
    const abs = join(project, file.startsWith(`${from}/`) ? `${to}/${file.slice(from.length + 1)}` : file);
    writeFileSync(abs, rewireText(readFileSync(abs, 'utf8'), from, to));
  }
  if (p.hooksPath) execFileSync('git', ['config', '--local', 'core.hooksPath', p.hooksPath.now], { cwd: project });
  // 5. The derived index, under the new root, by the project's own builder when it has one.
  const builder = [join(toAbs, 'scripts', 'build-state.mjs'), join(here, 'build-state.mjs')].find((b) => existsSync(b));
  if (!existsSync(join(toAbs, 'reviews')) && !existsSync(join(toAbs, 'knowledge'))) return 0;
  const run = spawnSync(process.execPath, [builder, '--root', toAbs, '--quiet'], { cwd: project, encoding: 'utf8' });
  if (run.status !== 0) console.error(`migrate-root: build-state failed: ${(run.stderr || run.stdout).trim()}`);
  return run.status ?? 1;
}

function report(p, write) {
  const L = [];
  L.push(`migrate-root: ${p.from}/ → ${p.to}/ in ${p.project}${write ? '' : '   (dry run — add --write)'}`);
  L.push(`  move      ${p.git ? 'git mv' : 'rename'} ${p.from} ${p.to}`);
  if (p.profile) L.push(`  profile   ${p.profile.file}: SDLC root \`${p.profile.was ?? '(default)'}\` → \`${p.to}\``);
  else L.push('  profile   no DEV-PROFILE.md found — the scripts will find the root by its folder');
  const fm = p.frontMatter.reduce((n, f) => n + f.changed, 0);
  L.push(`  front     ${fm} path(s) in the front matter of ${p.frontMatter.length} file(s); no hash moves`);
  for (const f of p.frontMatter) L.push(`              ${p.to}/${f.file} (${f.changed})`);
  for (const w of p.wiring) for (const l of w.lines) L.push(`  wiring    ${w.file}: ${l.was}  →  ${l.now}`);
  if (p.hooksPath) L.push(`  git       core.hooksPath ${p.hooksPath.was} → ${p.hooksPath.now}`);
  if (p.bodyMentions.length) {
    const n = p.bodyMentions.reduce((s, b) => s + b.count, 0);
    L.push(`  kept      ${n} \`${p.from}/\` mention(s) in ${p.bodyMentions.length} hashed file(s) — they still resolve (§2); rewriting them would stale their gates`);
  }
  L.push('  rebuild   state.json and DASHBOARD.md');
  return L.join('\n');
}

function main(argv) {
  const at = (f) => (argv.indexOf(f) !== -1 ? argv[argv.indexOf(f) + 1] : undefined);
  const to = String(at('--to') ?? '').replace(/\/+$/, '').replace(/^\.\/(?=.)/, '');
  if (!to) {
    console.error('usage: migrate-root.mjs --to .sdlc|dev [--project <dir>] [--write] [--json]');
    process.exit(2);
  }
  const project = resolve(at('--project') ?? process.cwd());
  const write = argv.includes('--write');
  const p = plan(project, to);
  if (argv.includes('--json')) console.log(JSON.stringify(p, null, 2));
  if (p.problems.length) {
    for (const pr of p.problems) console.error(`migrate-root: ${pr}`);
    process.exit(1);
  }
  if (!argv.includes('--json')) console.log(report(p, write));
  if (!write) return;
  const status = apply(p);
  console.log(status === 0 ? `migrate-root: done — the root is ${p.to}/. Commit the move as one change.` : 'migrate-root: moved, but the index did not rebuild — run build-state.mjs');
  process.exit(status === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
