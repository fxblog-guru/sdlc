#!/usr/bin/env node
/**
 * pr-scan.mjs — the mechanical half of a DEVELOPMENT pull-request review (/sdlc-review-pr).
 *
 *   node <root>/scripts/pr-scan.mjs [--pr <n>] [--base <ref>] [--head <ref>] [--root <dir>] [--json] [--fail-on BLOCKER|MAJOR]
 *
 * It reads the diff from the merge base, maps it to sdlc slugs, and reports what a tool can decide:
 * secrets, debug leftovers, focused or skipped tests, unbounded TODOs, contract and schema files
 * changed, source changed with no test changed, the gate logs a slug's PR must carry, and the size.
 * It never judges whether the code is right — that is the reviewer's half, done by reading.
 *
 * Run from the repository root (the folder that holds the SDLC root, `.sdlc/` or `dev/`, §2; `--root`
 * names another). Pipeline paths under either standard name count, so a PR that moves the root reads. GitLab and GitHub alike: `--pr <n>`
 * fetches `merge-requests/<n>/head` or `pull/<n>/head` from origin; no CLI or token is needed.
 * Exit 0 unless git fails (2), or `--fail-on <severity>` finds something at or above it (1) — the CI
 * job uses `--fail-on BLOCKER`. The verdict on the PR is the reviewer's, not this script's.
 */

import { atOrAbove, bySeverity, CONFLICT_MARKER, git, parseArgs, platformOf, readDiff, scanAdded } from './lib/pr-diff.mjs';
import { compare as compareContracts, declaredBreaks } from './contract-compat.mjs';
import { lintBranch, lintMessage } from './commit-lint.mjs';
import { readProfile } from './lib/profile.mjs';
import { ROOT_NAMES, findQaRoot, findRoot, underQaRoot } from './lib/root.mjs';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The repository-relative names the SDLC root may have in this PR: the configured one (`--root`, else
 * DEV-PROFILE `SDLC root`) and both standard names, since the diff may predate or include a move.
 */
export function rootNames(cwd, explicit = null) {
  const name = findRoot({ explicit, cwd }).name.replace(/\\/g, '/').replace(/^\.\/(?=.)/, '').replace(/\/+$/, '');
  return [...new Set([name, ...ROOT_NAMES])].filter((n) => n && !n.startsWith('/') && !/^[A-Za-z]:/.test(n) && !n.startsWith('..'));
}

/** True when a repository-relative path is under one of the root names. */
const underRoot = (p, roots) => roots.some((r) => p.startsWith(`${r}/`));
import { parseYaml } from './lib/yaml.mjs';

const TEST_RE = /(^|\/)(tests?|__tests__|spec|e2e)\/|[._-](test|spec)\.[a-z]+$|_test\.go$|^test_.*\.py$|\/test_[^/]*\.py$/i;
const DOC_RE = /\.(md|txt|adoc|rst)$|^docs?\//i;
const LOCK_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|poetry\.lock|uv\.lock|Cargo\.lock|composer\.lock)$/;
const MANIFEST_RE = /(^|\/)(package\.json|go\.mod|pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|composer\.json)$/;
const MIGRATION_RE = /(^|\/)(migrations?|db\/migrate|alembic\/versions|flyway|liquibase)\/[^/]+$/i;
const CONTRACT_RE = /(openapi|swagger)[^/]*\.(ya?ml|json)$|\.proto$|\.graphqls?$/i;
const FIXTURE_RE = /(^|\/)(tests?|__tests__|spec|e2e|fixtures?|testfixtures|testdata|stubs?|mocks?|seeds?|\w*test)\/|[._-](test|spec|stub|mock|fixture)s?\.[a-z]+$|_test\.go$|(^|\/)seed[^/]*$/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|go|py|cs|java|kt|rb|php|rs|swift|vue|svelte)$/i;
const CODE_RE = { test: (p) => CODE_EXT.test(p) && !/^(dev|qa|\.claude)\//.test(p) };

// Each rule is one thing a tool sees better than a person skimming 600 lines.
const RULES = [
  { id: 'PR-SECRET', severity: 'BLOCKER', message: 'a provider credential (AWS, GitHub, GitLab, Slack, OpenAI/Anthropic, private key) — rotate it, it is in the history now', unless: /data:[a-z]+\/[a-z+.-]+;base64,/i, re: /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|\bsk-(ant-|proj-|live_)?[A-Za-z0-9_-]{32,}\b)/ },
  { id: 'PR-SECRET-LITERAL', severity: 'MAJOR', message: 'a hard-coded password/secret/token value in production code — confirm it is not real, and read it from config', unless: /\b(example|not-a-|dummy|fake|placeholder|change-?me|redacted|xxxx|stub|test|local)|<[a-z_-]+>|\$\{|process\.env|os\.Getenv|os\.environ/i, re: /\b\w*(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"](?=[^'"\s]*[0-9!@#$%^&*])[^'"\s]{10,}['"]/i, when: (p) => !FIXTURE_RE.test(p) },
  { id: 'PR-ENV', severity: 'BLOCKER', message: 'an .env file is part of the diff', re: /.^/, file: (p) => /(^|\/)\.env(\.[^/]*)?$/.test(p) && !/\.example$|\.sample$|\.template$/.test(p) },
  { id: 'PR-FOCUS', severity: 'MAJOR', message: 'a focused test (.only / fit / fdescribe) silently skips the rest of the suite', re: /\b(it|test|describe)\.only\(|\bf(it|describe)\(/, when: (p) => TEST_RE.test(p) },
  { id: 'PR-SKIP', severity: 'MAJOR', message: 'a test skipped with no reason or ticket', re: /\b(it|test|describe)\.skip\(\s*(\)|['"`][^'"`]*['"`]\s*,\s*(async\b|\(|function\b))|\bx(it|describe)\(|@pytest\.mark\.skip\s*$|t\.Skip(Now)?\(\)/, when: (p) => TEST_RE.test(p) },
  { id: 'PR-DEBUG', severity: 'MINOR', message: 'debug output or breakpoint left in production code', re: /\bconsole\.(log|debug)\(|\bdebugger;|\bfmt\.Print(ln|f)?\(|\bpdb\.set_trace\(|\bbreakpoint\(\)|\bvar_dump\(|\bdd\(/, when: (p) => CODE_RE.test(p) && !TEST_RE.test(p) && !/\.(mjs|cjs)$/.test(p) && !/(^|\/)(scripts?|bin|cli|tools|ci)\//.test(p) },
  { id: 'PR-TODO', severity: 'MINOR', message: 'a TODO/FIXME with no ticket — it will outlive everyone who knows what it meant', re: /\b(TODO|FIXME|XXX|HACK)\b(?!.*([A-Z]{2,}-\d+|#\d+|DEC-\d+|TASK-\d+))/, when: (p) => CODE_RE.test(p) },
  { id: 'PR-SWALLOW', severity: 'MAJOR', message: 'an error is swallowed', re: /catch\s*(\([^)]*\))?\s*\{\s*\}|except(\s+\w+)?\s*:\s*pass\b|_\s*=\s*err\b|if err != nil \{\s*\}/, when: (p) => CODE_RE.test(p) },
  { id: 'PR-SQL-CONCAT', severity: 'MAJOR', message: 'SQL built by concatenation or interpolation — parameterise values; quote identifiers with the driver', unless: /Sanitize\(\)|quote_ident|QuoteIdentifier|sql\.Identifier|pgx\.Identifier|escapeId/, re: /\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^;]*(\$\{|['"`]\s*\+\s*\w|%s['"]\s*%|\.format\()|f["'](SELECT|INSERT|UPDATE|DELETE)\b[^"']*\{/, when: (p) => CODE_RE.test(p) && !FIXTURE_RE.test(p) },
  { id: 'PR-DISABLE-CHECK', severity: 'MINOR', message: 'a type or lint check is switched off inline — say why on the line', re: /(eslint-disable(-next-line|-line)?\s*(\*\/|$)|@ts-ignore|@ts-nocheck|# type:\s*ignore(?!\[)|# noqa(?!:)|\/\/nolint(?!:))/, when: (p) => CODE_RE.test(p) },
  // Merge hygiene: a conflict resolved by committing both sides compiles in some languages.
  { id: 'PR-CONFLICT-MARKER', severity: 'BLOCKER', message: 'a merge-conflict marker was committed', re: CONFLICT_MARKER },
  // Schema changes that break the code still running during a rolling deploy, or lock a large table.
  { id: 'PR-MIGRATION-DESTRUCTIVE', severity: 'MAJOR', message: 'drops or renames a table/column, or narrows a type — the running version still reads it during the rollout; expand → migrate → contract over two deploys (DEV-CONTRACTS §7)', re: /\b(DROP\s+(TABLE|COLUMN)|RENAME\s+(TO|COLUMN)|ALTER\s+COLUMN\s+\w+\s+(TYPE|SET\s+DATA\s+TYPE))\b/i, when: (p) => MIGRATION_RE.test(p) && !/\.down\.|[/_]down[._]/i.test(p) },
  { id: 'PR-MIGRATION-LOCK', severity: 'MAJOR', message: 'NOT NULL without a default, or an index built without CONCURRENTLY — rewrites or locks the table while it serves traffic', re: /\bADD\s+COLUMN\b(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b|\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY)/i, when: (p) => MIGRATION_RE.test(p) && /\.sql$/i.test(p) && !/\.down\./i.test(p) },
];

const GENERATED_RE = /(^|\/)(dist|build|out|coverage|node_modules|vendor|__pycache__|\.next|target)\/|\.(min\.js|map|pyc|class|exe|dll|so|dylib)$|(^|\/)(\.DS_Store|Thumbs\.db)$/;
const BIG_FILE_BYTES = 1024 * 1024;

/** Breaking changes between the base and head copy of each changed OpenAPI file (contract-compat.mjs). */
function contractBreaks(d, cwd, add) {
  for (const f of d.files.filter((x) => x.status === 'M' && /(openapi|swagger)[^/]*\.(ya?ml|json)$/i.test(x.path))) {
    let base;
    let next;
    try {
      const load = (ref) => { const t = git(['show', `${ref}:${f.path}`], cwd); return f.path.endsWith('.json') ? JSON.parse(t) : parseYaml(t); };
      base = load(d.mergeBase);
      next = load(d.head);
    } catch (e) {
      add('PR-CONTRACT-UNREADABLE', 'MINOR', f.path, `could not parse both versions (${e.message.split('\n')[0]}) — compare them by hand or with oasdiff`);
      continue;
    }
    let declared = new Set();
    const diffPath = f.path.replace(/[^/]+$/, 'contract-diff.md');
    try { declared = declaredBreaks(git(['show', `${d.head}:${diffPath}`], cwd)); } catch { /* no contract-diff.md */ }
    const { findings } = compareContracts(base, next, { declared });
    for (const x of findings.list) {
      if (x.code === 'W135') add('PR-BREAKING-DECLARED', 'INFO', `${f.path} ${x.file}`, `${x.message} — declared; check the deprecation window and the version bump`);
      else if (x.level === 'error') add('PR-BREAKING', 'BLOCKER', `${f.path} ${x.file}`, `${x.message} — an unchanged client breaks; declare it in contract-diff.md with an ADR, or keep the old shape`);
    }
  }
}

/** Commit messages and the branch name, by the same rules as the commit-msg hook (DEV-CONTRACTS §18.1). */
function formatChecks(d, opts, add) {
  const profile = readProfile(opts.cwd);
  // One finding per rule, naming the commits: ten commits with the same slip are one fix (a reword
  // or a squash), not ten findings.
  const byRule = new Map();
  for (const c of d.commits) {
    if (c.merge) continue;
    for (const p of lintMessage(c.message, { scopes: profile.scopes })) {
      if (p.level !== 'error') continue;
      const r = byRule.get(p.rule) ?? { example: `${c.sha}: ${p.message}`, shas: new Set() };
      r.shas.add(c.sha);
      byRule.set(p.rule, r);
    }
  }
  for (const [rule, r] of byRule) add('PR-COMMIT-FORMAT', 'MINOR', `${r.shas.size} commit(s)`, `${rule} on ${[...r.shas].slice(0, 4).join(', ')}${r.shas.size > 4 ? ', …' : ''} — e.g. ${r.example} (node dev/scripts/commit-lint.mjs --range <base>..HEAD)`);
  const branch = opts.branch ?? (/^refs\/pr-review\//.test(d.head) ? null : d.head.replace(/^(refs\/heads\/|origin\/)/, ''));
  if (branch && !/^[0-9a-f]{7,40}$|^HEAD/.test(branch)) {
    for (const p of lintBranch(branch, profile)) add('PR-BRANCH-NAME', 'MINOR', `branch ${branch}`, `${p.rule}: ${p.message}`);
  }
}

/** A folder under <root>/<stage>/ is a slug only when the slug has an intake (<root>/design/adr is not one). */
function slugsTouched(files, cwd, head, roots) {
  const slugs = new Set();
  const stage = new RegExp(`^(?:${roots.map(escRe).join('|')})/(?:intake|requirements|design|data|api|ui|plan|implementation|verification|release|deployment|monitoring|reviews|decisions)/([a-z0-9][a-z0-9-]*)/`);
  for (const f of files) {
    const m = f.path.match(stage);
    if (m) slugs.add(m[1]);
  }
  const has = (p) => { try { return git(['ls-tree', '--name-only', head, p], cwd).trim() !== ''; } catch { return false; } };
  const isSlug = (s) => roots.some((r) => ['intake', 'reviews'].some((d) => has(`${r}/${d}/${s}/`)));
  return [...slugs].filter(isSlug).sort();
}

/**
 * The latest gate log per gate for a slug, read from the PR's head commit — not the working tree,
 * which may be a different branch. Latest = highest run_id, then highest attempt; file names cannot
 * be sorted for this (`…-e0bc-a2.md` sorts before `…-e0bc.md`).
 */
function gateLogs(cwd, head, slug, roots) {
  const names = [];
  for (const r of roots) {
    try { names.push(...git(['ls-tree', '--name-only', head, `${r}/reviews/${slug}/`], cwd).split('\n').filter((f) => f.endsWith('.md'))); } catch { /* no such root at head */ }
  }
  if (!names.length) return {};
  const latest = {};
  for (const file of names) {
    const t = git(['show', `${head}:${file}`], cwd);
    const field = (k) => (t.match(new RegExp(`^${k}:\\s*(\\S+)`, 'm')) ?? [])[1];
    const gate = field('gate');
    if (!gate) continue;
    const key = `${field('run_id') ?? ''}#${String(field('attempt') ?? 1).padStart(2, '0')}`;
    if (!latest[gate] || key > latest[gate].key) latest[gate] = { file, verdict: field('verdict'), key };
  }
  return latest;
}

export function scan(opts) {
  const d = readDiff(opts);
  const findings = scanAdded(d.addedLines, RULES.filter((r) => !r.file));
  for (const r of RULES.filter((x) => x.file)) for (const f of d.files) if (f.status !== 'D' && r.file(f.path)) findings.push({ id: r.id, severity: r.severity, where: f.path, message: r.message, text: '' });

  const roots = rootNames(opts.cwd, opts.root ?? null);
  // The QA bundle's root (`.stlc/`, or `qa/` before qa 2.2) is its side of the PR, whatever it is called.
  const qaRoot = findQaRoot({ cwd: opts.cwd });
  const isQa = (p) => underQaRoot(p, [qaRoot]);
  const live = d.files.filter((f) => f.status !== 'D');
  const code = live.filter((f) => CODE_RE.test(f.path) && !TEST_RE.test(f.path) && !underRoot(f.path, roots) && !isQa(f.path));
  const tests = d.files.filter((f) => TEST_RE.test(f.path) && !isQa(f.path));
  const qaSide = d.files.filter((f) => isQa(f.path));
  const add = (id, severity, where, message) => findings.push({ id, severity, where, message, text: '' });

  const codeLines = code.reduce((n, f) => n + f.added + f.removed, 0);
  if (codeLines > 30 && tests.length === 0) add('PR-NO-TEST', 'MAJOR', `${code.length} source file(s)`, `${codeLines} changed source lines and no test file changed — name the test that proves it, or the reason none is needed`);
  // A test that moved (same file name added elsewhere) is not a deleted test; git's rename detection
  // misses moves that also changed most of the file.
  const base = (p) => p.split('/').pop();
  const addedNames = new Set(d.files.filter((x) => x.status === 'A' || x.status === 'R').map((x) => base(x.path)));
  for (const f of d.files.filter((x) => x.status !== 'D' && TEST_RE.test(x.path) && x.removed > x.added * 2 && x.removed > 10)) add('PR-TEST-SHRINK', 'MAJOR', f.path, `test file lost ${f.removed - f.added} net lines — check no assertion was deleted to make it pass`);
  for (const f of d.files.filter((x) => x.status === 'D' && TEST_RE.test(x.path) && !addedNames.has(base(x.path)))) add('PR-TEST-DELETED', 'MAJOR', f.path, 'a test file was deleted — name what replaced it');
  const migrations = live.filter((x) => MIGRATION_RE.test(x.path) && x.status === 'A');
  if (migrations.length) add('PR-MIGRATION', 'INFO', `${migrations.length} new migration file(s)`, `check each is reversible, its lock time on large tables, and its order against the deploy: ${migrations.slice(0, 4).map((f) => f.path).join(', ')}${migrations.length > 4 ? ', …' : ''}`);
  for (const f of d.files.filter((x) => MIGRATION_RE.test(x.path) && x.status === 'M')) add('PR-MIGRATION-EDITED', 'BLOCKER', f.path, 'an existing migration was edited — environments that already ran it will never see the change; add a new one');
  for (const f of d.files.filter((x) => CONTRACT_RE.test(x.path) && !/(openapi|swagger)[^/]*\.(ya?ml|json)$/i.test(x.path))) add('PR-CONTRACT', 'INFO', f.path, 'API contract changed (proto / GraphQL — not diffed here) — check for removed or renamed fields, narrowed enums, changed types');
  for (const f of d.files.filter((x) => x.status === 'D' && /(openapi|swagger)[^/]*\.(ya?ml|json)$/i.test(x.path))) add('PR-BREAKING', 'BLOCKER', f.path, 'an API contract file was deleted');
  const locks = d.files.filter((f) => LOCK_RE.test(f.path));
  const manifests = d.files.filter((f) => MANIFEST_RE.test(f.path));
  if (locks.length && !manifests.length) add('PR-LOCK-ONLY', 'MINOR', locks.map((f) => f.path).join(', '), 'lockfile changed with no manifest change — an unintended upgrade or a local install leaking in');
  if (manifests.length) add('PR-DEPENDENCY', 'INFO', manifests.map((f) => f.path).join(', '), 'dependencies changed — check licence, maintenance and why the new one is needed');
  if (qaSide.length && code.length) add('PR-MIXED', 'MINOR', `${qaSide.length} ${qaRoot}/ file(s)`, `this PR also changes ${qaRoot}/ — run /qa-review-pr on it as well, or split the test work out`);

  // Will it merge, onto what it will merge into?
  if (d.conflicts?.length) add('PR-CONFLICTS', 'BLOCKER', `${d.conflicts.length} file(s)`, `does not merge cleanly into ${d.base}: ${d.conflicts.slice(0, 5).join(', ')}${d.conflicts.length > 5 ? ', …' : ''} — rebase or merge the base, then re-review what the resolution changed`);
  if (d.behind > 0) add('PR-BEHIND', d.behind > 20 ? 'MAJOR' : 'MINOR', `${d.behind} commit(s)`, `${d.base} moved ${d.behind} commit(s) since this branch forked — the green pipeline tested an older base; update the branch and let CI run again before merging`);
  contractBreaks(d, opts.cwd, add);
  formatChecks(d, opts, add);
  for (const f of live.filter((x) => GENERATED_RE.test(x.path))) add('PR-GENERATED', 'MINOR', f.path, 'a build output, cache or binary is committed — .gitignore it');
  for (const f of live.filter((x) => x.binary && !/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf)$/i.test(x.path))) add('PR-BINARY', 'MINOR', f.path, 'a binary file — say what it is and why it cannot be built from source');
  for (const f of live) {
    try {
      const size = Number(git(['cat-file', '-s', `${d.head}:${f.path}`], opts.cwd).trim());
      // A generated pipeline document (<root>/, the QA root) is text and expected; a binary or source blob is not.
      const pipelineText = (underRoot(f.path, roots) || isQa(f.path)) && !f.binary;
      if (size > BIG_FILE_BYTES) add('PR-BIG-FILE', pipelineText ? 'MINOR' : 'MAJOR', f.path, `${(size / 1048576).toFixed(1)} MB — it lives in history forever; ${pipelineText ? 'a generated pipeline document this large is worth trimming' : 'use LFS or an artifact store'}`);
    } catch { /* deleted or unreadable */ }
  }
  if (live.some((x) => /(^|\/)\.gitlab-ci\.ya?ml$|^\.github\/workflows\//.test(x.path))) add('PR-CI-CHANGED', 'INFO', 'CI configuration', 'the pipeline itself changed — check no job, stage or required check was removed or made allow_failure');

  const total = d.files.reduce((n, f) => n + f.added + f.removed, 0);
  const nonDoc = d.files.filter((f) => !DOC_RE.test(f.path) && !LOCK_RE.test(f.path)).reduce((n, f) => n + f.added + f.removed, 0);
  if (nonDoc > 800) add('PR-SIZE', 'MAJOR', `${nonDoc} lines`, 'too large to review well (defect detection falls sharply past ~400 lines) — split it, or name the part to review hardest');
  else if (nonDoc > 400) add('PR-SIZE', 'MINOR', `${nonDoc} lines`, 'large PR — reviewers should plan more than one sitting');

  const slugs = slugsTouched(d.files, opts.cwd, d.head, roots);
  const gates = {};
  for (const s of slugs) {
    gates[s] = gateLogs(opts.cwd, d.head, s, roots);
    for (const g of ['G7', 'G8']) {
      const log = gates[s][g];
      if (!log) add('PR-GATE-MISSING', 'MAJOR', `slug ${s}`, `no ${g} gate log — the PR cites G7 and G8 (DEV-PROFILE §Delivery)`);
      else if (!['PASS', 'SKIPPED'].includes(log.verdict)) add('PR-GATE-OPEN', 'MAJOR', log.file, `${g} verdict is ${log.verdict}`);
    }
  }
  const emails = [...new Set(d.commits.map((c) => c.email))];
  return { platform: platformOf(opts.cwd), base: d.base, head: d.head, mergeBase: d.mergeBase, behind: d.behind, conflicts: d.conflicts, pr: opts.pr ?? null, files: d.files.length, lines: total, codeFiles: code.length, testFiles: tests.length, commits: d.commits, authors: emails, slugs, gates, findings: findings.sort(bySeverity) };
}

const isMain = process.argv[1] && /\/scripts\/pr-scan\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  try {
    const { opts, json, failOn } = parseArgs(process.argv.slice(2), process.cwd());
    const ri = process.argv.indexOf('--root');
    if (ri > 0 && process.argv[ri + 1]) opts.root = process.argv[ri + 1];
    const r = scan(opts);
    const failing = atOrAbove(r.findings, failOn);
    process.exitCode = failing.length ? 1 : 0;
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(process.exitCode); }
    console.log(`PR scan (development) — ${r.platform} · ${r.pr ? `#${r.pr} ` : ''}${r.head} vs ${r.base} (merge base ${r.mergeBase})`);
    console.log(`  ${r.files} files · ${r.lines} lines · ${r.codeFiles} source · ${r.testFiles} test · ${r.commits.length} commits · authors: ${r.authors.join(', ') || '—'}`);
    console.log(`  sdlc slugs: ${r.slugs.join(', ') || 'none (not an sdlc change — review on the code alone)'}`);
    for (const [s, g] of Object.entries(r.gates)) console.log(`    ${s}: ${Object.entries(g).map(([k, v]) => `${k} ${v.verdict}`).join(' · ') || 'no gate logs'}`);
    if (!r.findings.length) console.log('  no mechanical findings');
    for (const f of r.findings) console.log(`  ${f.severity.padEnd(7)} ${f.id.padEnd(18)} ${f.where} — ${f.message}${f.text ? `\n          ${f.text}` : ''}`);
    if (failOn) console.log(failing.length ? `FAIL: ${failing.length} finding(s) at ${failOn} or above` : `ok: nothing at ${failOn} or above`);
  } catch (e) {
    console.error(`pr-scan: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
}
