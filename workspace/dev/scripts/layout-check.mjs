#!/usr/bin/env node
/**
 * layout-check.mjs — does this repository have the shape its blueprint says (DEV-CONTRACTS §13.9)?
 *
 * Several placement decisions, each defensible on its own, can leave a repository with no shape.
 * release-management grew a 122-file `internal/http` package, integration tests spread across
 * fourteen packages, and an `ops/` folder holding deploy files. Every gate passed. Each of these
 * is a fact about the tree that a script can check.
 *
 *   node dev/scripts/layout-check.mjs [--root .] [--blueprint go-react|<file.md>] \
 *     [--maturity greenfield|brownfield] [--accept <blueprint ADR>] [--since <git ref>] \
 *     [--blueprints <dir>] [--no-go] [--out <file.json>]
 *
 * Defaults come from DEV-PROFILE.md (`.claude/DEV-PROFILE.md` under --root): Repository blueprint,
 * Project maturity, Blueprint ADR. The blueprint's `## Rules` JSON block is the rule set.
 *
 * Rules: missing-dir · missing-file · folder-readme · top-level-area · stray-code · test-placement ·
 * test-tier · grab-bag · grab-bag-file · single-home · package-ceiling · import-direction · blueprint-fit.
 *
 * A blueprint may also declare: `topLevel` (the complete list of top-level folders), `goModules`
 * (folders holding a go.mod, default the root), `tests.roots` (more than one tier root),
 * `singleHome` (a folder name that may exist only at its home) and `fits` (the DEV-PROFILE
 * Repository model and Architecture it serves).
 *
 * Greenfield: every finding fails, except package-ceiling and grab-bag-file, which warn.
 * blueprint-fit fails in both maturities: a profile that contradicts its blueprint is a setup error.
 * Brownfield: every finding is advisory, except a top-level-area or grab-bag created after --since.
 * A finding the ADR lists as `<rule> <path>` is accepted and never fails.
 * Go imports come from `go list -json` when Go is on PATH, otherwise from the import blocks.
 *
 * Exit 0 nothing failed · 1 a finding failed · 2 usage error or unknown blueprint.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LEGACY_ROOT, ROOT_NAMES, findRoot } from './lib/root.mjs';
import { CODE_EXT as LANG_CODE_EXT, SOURCE_EXT, isTestFile } from './lib/langs.mjs';

export const RULES = ['missing-dir', 'missing-file', 'folder-readme', 'top-level-area', 'stray-code', 'test-placement', 'test-tier', 'grab-bag', 'grab-bag-file', 'single-home', 'package-ceiling', 'import-direction', 'blueprint-fit'];
export const GRAB_BAGS = ['utils', 'util', 'helpers', 'helper', 'common', 'misc'];
const ALWAYS_WARN = new Set(['package-ceiling', 'grab-bag-file']);
const NEW_STILL_FAILS = new Set(['top-level-area', 'grab-bag']);
const ALWAYS_FAIL = new Set(['blueprint-fit']);
// Code is every language the registry knows, plus the SQL and scripts a blueprint also places.
const CODE_EXT = { test: (p) => LANG_CODE_EXT.test(p) || /\.(sql|sh|ps1)$/.test(p) };
const TEST_FILE = { test: isTestFile };
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'out', 'target', '__pycache__', '.venv', '.next', 'testdata']);
const NO_README = new Set(ROOT_NAMES); // the process root belongs to the sdlc bundle (§2)

const toPosix = (p) => p.split(sep).join('/');
const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// Inputs: profile, blueprint, accepted deviations
// ---------------------------------------------------------------------------------------------

/** The DEV-PROFILE values this script reads. A `<placeholder>` reads as unset. */
export function parseProfile(text) {
  const value = (label) => {
    const v = new RegExp(`\\*\\*${label}:\\*\\*\\s*\`([^\`]+)\``).exec(text)?.[1]?.trim();
    return v && !v.startsWith('<') ? v : null;
  };
  return {
    blueprint: value('Repository blueprint'), maturity: value('Project maturity'), adr: value('Blueprint ADR'),
    repositoryModel: value('Repository model'), architecture: value('Architecture'),
  };
}

/** The `## Rules` JSON block of a blueprint file. */
export function parseBlueprint(text) {
  const rules = text.replace(/\r\n/g, '\n').split(/^## Rules\s*$/m)[1];
  const json = rules && /```json\n([\s\S]*?)\n```/.exec(rules)?.[1];
  if (!json) throw new Error('the blueprint has no ## Rules block with a ```json fence');
  const bp = JSON.parse(json);
  for (const k of ['name', 'requiredDirs', 'codeRoots']) if (!bp[k]) throw new Error(`the blueprint's rules have no "${k}"`);
  return withProcessRoots({ requiredFiles: [], rootCode: [], tests: null, packageCeiling: 40, imports: [], alias: {}, extraDirs: [], topLevel: null, goModules: ['.'], singleHome: [], fits: null, ...bp });
}

/**
 * A blueprint names the process root `dev`; the root may be `.sdlc` (§2). Wherever a list names
 * `dev`, every root name is meant, so a `.sdlc/` project is held to the same rules.
 */
function withProcessRoots(bp) {
  const expand = (list) => (Array.isArray(list) && list.includes(LEGACY_ROOT) ? [...new Set([...list, ...ROOT_NAMES])] : list);
  return {
    ...bp,
    topLevel: expand(bp.topLevel),
    codeRoots: expand(bp.codeRoots),
    extraDirs: expand(bp.extraDirs),
    singleHome: (bp.singleHome ?? []).map((h) => ({ ...h, ignore: expand(h.ignore) })),
  };
}

export function blueprintDirs(root) {
  const rel = join('skills', 'dev-resolving-code-placement', 'blueprints');
  return [join(root, '.claude', rel), join(here, '..', '..', '..', rel), join(here, '..', '..', '.claude', rel)];
}

export function loadBlueprint(nameOrPath, dirs) {
  if (/\.md$/.test(nameOrPath) && existsSync(nameOrPath)) return parseBlueprint(readFileSync(nameOrPath, 'utf8'));
  for (const d of dirs) {
    const f = join(d, `${nameOrPath}.md`);
    if (existsSync(f)) return parseBlueprint(readFileSync(f, 'utf8'));
  }
  throw new Error(`no blueprint "${nameOrPath}" in ${dirs.filter(existsSync).join(', ') || 'any blueprints folder'}`);
}

/** Accepted deviations: every backticked `<rule> <path>` in the ADR. */
export function parseAccepted(text) {
  const out = [];
  for (const m of text.matchAll(/`([a-z-]+) ([^`\s]+)`/g)) if (RULES.includes(m[1])) out.push({ rule: m[1], path: m[2] });
  return out;
}

const isAccepted = (f, accepted) => accepted.some((a) => a.rule === f.rule && (a.path === f.path || (a.path.endsWith('/**') && (f.path + '/').startsWith(a.path.slice(0, -2)))));

// ---------------------------------------------------------------------------------------------
// Patterns: segments, `*` one segment, `**` any number, `{x}` capture, `!{x}` / `!name` not that
// ---------------------------------------------------------------------------------------------

/** Match `segs` against `pat` in full. Returns the captures, or null. `prefix` lets the pattern match a leading part. */
export function matchSegments(pat, segs, caps = {}, prefix = false) {
  if (pat.length === 0) return prefix || segs.length === 0 ? caps : null;
  const [p, ...rest] = pat;
  if (p === '**') {
    for (let i = 0; i <= segs.length; i += 1) {
      const r = matchSegments(rest, segs.slice(i), { ...caps }, prefix);
      if (r) return r;
    }
    return null;
  }
  if (segs.length === 0) return null;
  const [s, ...more] = segs;
  const cap = /^\{(\w+)\}$/.exec(p);
  const notCap = /^!\{(\w+)\}$/.exec(p);
  if (cap) {
    if (caps[cap[1]] !== undefined && caps[cap[1]] !== s) return null;
    return matchSegments(rest, more, { ...caps, [cap[1]]: s }, prefix);
  }
  if (notCap) return caps[notCap[1]] !== s ? matchSegments(rest, more, caps, prefix) : null;
  if (p.startsWith('!')) return p.slice(1) !== s ? matchSegments(rest, more, caps, prefix) : null;
  if (p === '*' || p === s) return matchSegments(rest, more, caps, prefix);
  return null;
}

// ---------------------------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------------------------

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** Repository-relative POSIX paths: git's view when it is a repository (ignored files excluded), else a walk. */
export function listFiles(root) {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (top && resolve(top.trim()) === resolve(root)) {
    const out = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    if (out !== null) return out.split('\0').filter(Boolean).filter((f) => existsSync(join(root, f)) && !f.split('/').some((s) => SKIP_DIRS.has(s)));
  }
  const files = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(full).isDirectory()) {
        if (SKIP_DIRS.has(e) || e === '.git') continue;
        walk(full, r);
      } else files.push(r);
    }
  };
  walk(root, '');
  return files;
}

/** Paths that existed at `ref`, so anything else is new. Null when git cannot say. */
function pathsAt(root, ref) {
  const out = git(root, ['ls-tree', '-r', '--name-only', '-z', ref]);
  return out === null ? null : out.split('\0').filter(Boolean);
}

const head = (text, n = 20) => text.split(/\r?\n/).slice(0, n).join('\n');
const isGenerated = (text) => /^\/\/ Code generated .* DO NOT EDIT\.$|^# Code generated .* DO NOT EDIT\.?$|@generated/m.test(head(text, 10));

// ---------------------------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------------------------

export function goImports(text) {
  const out = [];
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/^import\s*\(([\s\S]*?)^\)/gm)) for (const q of m[1].matchAll(/"([^"]+)"/g)) out.push(q[1]);
  for (const m of body.matchAll(/^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push(m[1]);
  return out;
}

export function tsImports(text) {
  const out = [];
  for (const m of text.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }
  return out;
}

export function pyImports(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*(?:from\s+(\.*[\w.]*)\s+import\b|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm)) {
    if (m[1] !== undefined) out.push(m[1]);
    else out.push(...m[2].split(',').map((s) => s.trim()));
  }
  return out;
}

/** Go package imports from `go list -json`, keyed by repository-relative directory. Null when Go cannot answer. */
export function goListImports(root) {
  const r = spawnSync('go', ['list', '-e', '-json', './...'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GOFLAGS: '-mod=readonly', GOTOOLCHAIN: 'local' }, timeout: 120000 });
  if (r.status !== 0 || !r.stdout) return null;
  const map = new Map();
  let depth = 0;
  let start = -1;
  let inStr = false;
  const s = r.stdout;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) { if (c === '\\') i += 1; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; } else if (c === '}' && --depth === 0) {
      const pkg = JSON.parse(s.slice(start, i + 1));
      if (pkg.Dir && pkg.GoFiles?.length) map.set(toPosix(relative(root, pkg.Dir)), { imports: pkg.Imports ?? [], files: pkg.GoFiles });
    }
  }
  return map;
}

export function goAvailable() {
  return spawnSync('go', ['version'], { encoding: 'utf8' }).status === 0;
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {string} o.root
 * @param {object} o.blueprint   parseBlueprint() output
 * @param {'greenfield'|'brownfield'} [o.maturity]
 * @param {{rule:string,path:string}[]} [o.accepted]
 * @param {string} [o.since]     git ref: in brownfield, top-level areas and grab-bags created after it fail
 * @param {boolean} [o.useGo]    use `go list` when Go is available (default true)
 * @param {{repositoryModel?:string|null, architecture?:string|null}} [o.axes]  the DEV-PROFILE axes, checked against the blueprint's `fits`
 * @returns {{rule:string, level:'fail'|'warn'|'accepted', path:string, message:string}[]}
 */
export function checkLayout({ root, blueprint: bp, maturity = 'greenfield', accepted = [], since = null, useGo = true, axes = {} }) {
  const files = listFiles(root);
  const raw = [];
  const add = (rule, path, message) => raw.push({ rule, path, message });
  const read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const visible = files.filter((f) => !f.split('/').some((s) => s.startsWith('.')));
  const topDirs = new Set(visible.filter((f) => f.includes('/')).map((f) => f.split('/')[0]));
  const dirExists = (d) => files.some((f) => f.startsWith(`${d}/`));

  // 1. Required folders, root files, and a README per top-level folder.
  for (const d of bp.requiredDirs) {
    // a required `dev/` is the process root, which may be any of ROOT_NAMES (§2)
    const present = d === LEGACY_ROOT ? ROOT_NAMES.some(dirExists) : dirExists(d);
    if (!present) add('missing-dir', `${d}/`, `the ${bp.name} blueprint requires ${d}/`);
    else if (!d.includes('/') && !NO_README.has(d) && !files.includes(`${d}/README.md`)) add('folder-readme', `${d}/README.md`, `${d}/ has no README.md saying what belongs in it`);
  }
  for (const entry of bp.requiredFiles) {
    const options = Array.isArray(entry) ? entry : [entry];
    if (!options.some((f) => files.includes(f))) add('missing-file', options[0], `the ${bp.name} blueprint requires ${options.join(' or ')}`);
  }

  // 2. Top-level areas the blueprint does not have.
  // A blueprint with `topLevel` names every top-level folder; one without it also allows the shared ones.
  const known = new Set(bp.topLevel ?? [...bp.requiredDirs.map((d) => d.split('/')[0]), ...bp.codeRoots, ...bp.extraDirs, 'docs', ...ROOT_NAMES, 'ops', 'deploy', 'tests', 'scripts', 'ci']);
  for (const d of [...topDirs].sort()) if (!known.has(d)) add('top-level-area', `${d}/`, `${d}/ is not a top-level folder of the ${bp.name} blueprint`);

  // 3. Code outside the allowed roots.
  const roots = new Set(bp.codeRoots);
  for (const f of visible) {
    if (!CODE_EXT.test(f)) continue;
    const top = f.split('/')[0];
    if (!f.includes('/') ? !bp.rootCode.includes(f) : !roots.has(top)) add('stray-code', f, f.includes('/') ? `code under ${top}/, which the blueprint keeps code-free; allowed roots: ${bp.codeRoots.join(', ')}` : 'code at the repository root');
  }

  // 4. Tests where the blueprint says.
  const t = bp.tests;
  if (t) {
    for (const f of visible) {
      for (const rule of t.placement ?? []) {
        const base = posix.basename(f);
        if (rule.name && !new RegExp(rule.name).test(base)) continue;
        if (rule.ext && !f.endsWith(rule.ext)) continue;
        if (rule.content && !new RegExp(rule.content, 'm').test(head(read(f)))) continue;
        if (!rule.name && !rule.ext && !rule.content) continue;
        if (!rule.under.some((u) => f.startsWith(u))) { add('test-placement', f, rule.why); break; }
      }
      for (const tr of t.roots ?? [t]) {
        if (!f.startsWith(`${tr.root}/`)) continue;
        const parts = f.slice(tr.root.length + 1).split('/');
        if (parts.length === 1 && !(tr.rootFiles ?? []).includes(parts[0])) add('test-tier', f, `a loose file in ${tr.root}/; tests go in one of ${tr.tiers.join(', ')}`);
        if (parts.length > 1 && !tr.tiers.includes(parts[0])) add('test-tier', `${tr.root}/${parts[0]}/`, `${tr.root}/${parts[0]}/ is not a test tier; the tiers are ${tr.tiers.join(', ')}`);
      }
    }
  }

  // 5. Grab-bag names.
  const dirs = new Set();
  for (const f of visible) { const p = f.split('/'); for (let i = 1; i < p.length; i += 1) dirs.add(p.slice(0, i).join('/')); }
  for (const d of [...dirs].sort()) if (GRAB_BAGS.includes(posix.basename(d).toLowerCase())) add('grab-bag', `${d}/`, `"${posix.basename(d)}" names no responsibility; name the package for what it provides`);
  for (const f of visible) {
    const stem = posix.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
    if (SOURCE_EXT.test(f) && !TEST_FILE.test(f) && GRAB_BAGS.includes(stem)) add('grab-bag-file', f, `a file named "${stem}" collects whatever has no home`);
  }

  // 5b. One home per concern: a folder named for deploy, runbooks, docs, migrations… exists only at its home.
  for (const h of bp.singleHome) {
    for (const d of [...dirs].sort()) {
      if (posix.basename(d) !== h.name) continue;
      const segs = d.split('/');
      if ((h.ignore ?? []).some((p) => matchSegments(p.split('/'), segs, {}, true))) continue;
      if ((h.homes ?? []).some((p) => matchSegments(p.split('/'), segs))) continue;
      add('single-home', `${d}/`, h.why);
    }
  }

  // 6. Package size.
  const perDir = new Map();
  for (const f of visible) {
    if (!SOURCE_EXT.test(f) || TEST_FILE.test(f) || isGenerated(read(f))) continue;
    const d = posix.dirname(f);
    perDir.set(d, (perDir.get(d) ?? 0) + 1);
  }
  for (const [d, n] of [...perDir].sort()) if (n > bp.packageCeiling) add('package-ceiling', `${d}/`, `${n} non-test source files in one package (ceiling ${bp.packageCeiling}); split it by domain`);

  // 7. Import direction.
  for (const v of importViolations(root, bp, visible, read, useGo)) add('import-direction', v.path, v.message);

  // 8. The blueprint serves the repository model and architecture the profile declares.
  for (const [axis, label] of [['repositoryModel', 'Repository model'], ['architecture', 'Architecture']]) {
    const want = axes[axis];
    const fits = bp.fits?.[axis];
    if (want && fits && !fits.includes(want)) add('blueprint-fit', 'DEV-PROFILE.md', `DEV-PROFILE §Stacks says ${label} \`${want}\`; the ${bp.name} blueprint serves ${fits.join(' | ')}. Pick the blueprint from the two axes (§13.9)`);
  }

  // Levels: maturity, then what is new since the reference, then what the ADR accepted.
  const before = maturity === 'brownfield' && since ? pathsAt(root, since) : null;
  const isNew = (p) => before !== null && !before.some((b) => b === p || b.startsWith(p.endsWith('/') ? p : `${p}/`));
  return raw.map((f) => {
    let level = ALWAYS_WARN.has(f.rule) ? 'warn' : 'fail';
    if (maturity === 'brownfield' && !ALWAYS_FAIL.has(f.rule)) level = NEW_STILL_FAILS.has(f.rule) && isNew(f.path) ? 'fail' : 'warn';
    if (isAccepted(f, accepted)) level = 'accepted';
    return { ...f, level };
  });
}

function importViolations(root, bp, files, read, useGo) {
  const rules = bp.imports ?? [];
  if (!rules.length) return [];
  const out = [];
  const seen = new Set();
  const report = (path, message) => { const k = `${path} ${message}`; if (!seen.has(k)) { seen.add(k); out.push({ path, message }); } };

  /** Check one import of a file in `dir` against every rule whose `from` matches. */
  const check = (lang, file, dir, target, repoPath) => {
    for (const r of rules) {
      if (r.lang !== lang) continue;
      const caps = matchSegments(r.from.split('/'), dir.split('/'));
      if (!caps) continue;
      for (const deny of r.deny) {
        const sepChar = lang === 'py' ? '.' : '/';
        const subject = repoPath ?? target;
        const segs = repoPath ? repoPath.split('/') : target.split(sepChar);
        if (matchSegments(deny.split(sepChar), segs, caps, true)) {
          report(file, `imports ${subject}: ${r.why}`);
          break;
        }
      }
    }
  };

  // Go: package imports from go list when it can answer; the import blocks otherwise. Each module
  // (a folder with a go.mod) is read on its own, and its import paths map back to repository paths.
  const allGo = files.filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  const goOn = useGo && allGo.length > 0 && goAvailable();
  for (const md of bp.goModules) {
    const prefix = md === '.' ? '' : `${md}/`;
    const module = /^module\s+(\S+)/m.exec(read(`${prefix}go.mod`))?.[1] ?? null;
    const goFiles = allGo.filter((f) => f.startsWith(prefix));
    const goTarget = (imp) => (module && (imp === module || imp.startsWith(`${module}/`)) ? prefix + imp.slice(module.length + 1) : null);
    const listed = goOn && goFiles.length && module ? goListImports(join(root, md)) : null;
    if (listed) {
      for (const [rel, pkg] of listed) {
        const dir = rel ? prefix + rel : md === '.' ? '' : md;
        for (const imp of pkg.imports) {
          const owner = pkg.files.find((f) => read(dir ? `${dir}/${f}` : f).includes(`"${imp}"`)) ?? pkg.files[0];
          check('go', dir ? `${dir}/${owner}` : owner, dir, imp, goTarget(imp));
        }
      }
    } else {
      for (const f of goFiles) for (const imp of goImports(read(f))) check('go', f, posix.dirname(f), imp, goTarget(imp));
    }
  }

  // TypeScript: relative and aliased imports resolve to repository paths.
  for (const f of files.filter((x) => /\.(ts|tsx|js|jsx|mjs)$/.test(x) && !TEST_FILE.test(x))) {
    for (const imp of tsImports(read(f))) {
      let repoPath = null;
      if (imp.startsWith('.')) repoPath = posix.normalize(posix.join(posix.dirname(f), imp));
      else for (const [alias, target] of Object.entries(bp.alias ?? {})) if (imp.startsWith(alias)) repoPath = target + imp.slice(alias.length);
      check('ts', f, posix.dirname(f), imp, repoPath ? repoPath.replace(/\/$/, '') : null);
    }
  }

  // Python: dotted modules, relative imports resolved against the file's package.
  for (const f of files.filter((x) => x.endsWith('.py') && !TEST_FILE.test(x))) {
    const srcAt = f.split('/').indexOf('src');
    const pkgParts = f.split('/').slice(srcAt + 1, -1);
    for (const imp of pyImports(read(f))) {
      let mod = imp;
      const dots = /^\.+/.exec(imp)?.[0].length ?? 0;
      if (dots) mod = [...pkgParts.slice(0, pkgParts.length - dots + 1), ...imp.slice(dots).split('.').filter(Boolean)].join('.');
      check('py', f, posix.dirname(f), mod, null);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const o = { root: '.', blueprint: null, maturity: null, accept: null, since: null, blueprints: null, useGo: true, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--no-go') { o.useGo = false; continue; }
    const key = { '--root': 'root', '--blueprint': 'blueprint', '--maturity': 'maturity', '--accept': 'accept', '--since': 'since', '--blueprints': 'blueprints', '--out': 'out' }[flag];
    const value = argv[i + 1];
    if (!key) throw new Error(`unknown flag ${flag}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    o[key] = value;
    i += 1;
  }
  if (o.maturity && !['greenfield', 'brownfield'].includes(o.maturity)) throw new Error('--maturity is greenfield or brownfield');
  return o;
}

export function summarise(findings) {
  const by = (l) => findings.filter((f) => f.level === l).length;
  return { fail: by('fail'), warn: by('warn'), accepted: by('accepted') };
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (err) { console.error(`layout-check: ${err.message}`); process.exit(2); }
  const root = resolve(o.root);
  const profilePath = [join(root, '.claude', 'DEV-PROFILE.md'), join(root, 'DEV-PROFILE.md')].find(existsSync);
  const profile = profilePath ? parseProfile(readFileSync(profilePath, 'utf8')) : {};
  const name = o.blueprint ?? profile.blueprint;
  if (!name) {
    console.error('layout-check: > **Project setup required:** DEV-PROFILE §Stacks has no Repository blueprint, and no --blueprint was given.');
    process.exit(2);
  }
  let blueprint;
  try { blueprint = loadBlueprint(name, o.blueprints ? [o.blueprints] : blueprintDirs(root)); } catch (err) { console.error(`layout-check: ${err.message}`); process.exit(2); }
  const maturity = o.maturity ?? profile.maturity ?? 'greenfield';
  const adr = o.accept ?? profile.adr;
  const adrPath = adr ? [resolve(root, adr), resolve(findRoot({ cwd: root }).root, adr), ...ROOT_NAMES.map((n) => resolve(root, n, adr))].find(existsSync) : null;
  if (adr && !adrPath) console.error(`layout-check: the blueprint ADR ${adr} does not exist; no deviation is accepted`);
  const accepted = adrPath ? parseAccepted(readFileSync(adrPath, 'utf8')) : [];

  const axes = { repositoryModel: profile.repositoryModel ?? null, architecture: profile.architecture ?? null };
  const findings = checkLayout({ root, blueprint, maturity, accepted, since: o.since, useGo: o.useGo, axes });
  const order = { fail: 0, warn: 1, accepted: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level] || RULES.indexOf(a.rule) - RULES.indexOf(b.rule) || a.path.localeCompare(b.path));
  console.log(`layout-check: ${blueprint.name} · ${maturity}${adrPath ? ` · deviations from ${toPosix(relative(root, adrPath))}` : ''}${o.since ? ` · new since ${o.since}` : ''}`);
  for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(16)} ${f.path} — ${f.message}`);
  const s = summarise(findings);
  console.log(`\n${s.fail} fail · ${s.warn} advisory · ${s.accepted} accepted`);
  if (o.out) writeFileSync(o.out, `${JSON.stringify({ blueprint: blueprint.name, maturity, findings }, null, 2)}\n`);
  process.exit(s.fail ? 1 : 0);
}

if (process.argv[1]?.endsWith('layout-check.mjs')) main(process.argv.slice(2));
