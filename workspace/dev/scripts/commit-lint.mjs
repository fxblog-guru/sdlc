#!/usr/bin/env node
/**
 * commit-lint.mjs — the commit and branch rules of DEV-CONTRACTS §18.1, as a script.
 *
 *   node dev/scripts/commit-lint.mjs --message <file>          (the commit-msg hook)
 *   node dev/scripts/commit-lint.mjs --branch [<name>]         (the pre-commit hook; default: current)
 *   node dev/scripts/commit-lint.mjs --range <a>..<b> [--json] (CI, and a history audit)
 *   node dev/scripts/commit-lint.mjs --progress <slug> [--root dev]
 *
 * Shared with lint-dev.mjs: the code table (§11.2). Errors:
 *   E092 not Conventional Commits 1.0, or a type outside the list
 *   E093 no scope, or a scope outside DEV-PROFILE §Delivery `Commit scopes` + `sdlc`
 *   E094 subject over 72 characters, starting upper-case, or ending with a full stop
 *   E095 a TASK/DEC/CR id in the message and not in a `Refs:` or `Done:` trailer
 *   E096 a merge subject outside `merge(lane-<x>): …`, or the feature branch merged back into a lane
 *   E097 a `fixup!` / `squash!` / `wip` commit
 *   E098 a commit on a protected branch, or a branch name outside the convention
 * Warning: W094 a commit over 500 changed lines (lock and generated files excluded, --range only).
 *
 * --progress appends one `progress.md` row per `Done: TASK-NNN` trailer on the branch that is not
 * yet recorded, for a task the slug's tasks.md plans (§8.1). The implementer stops typing rows.
 * Only the slug's own commits count (history.mjs belongsTo): TASK numbers restart per slug.
 *
 * Exit 1 on any error; 0 otherwise; 2 on a usage error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readProfile } from './lib/profile.mjs';
import { readProgress } from './lib/tasks.mjs';
import { readTable, parseDoc, plain } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { belongsTo, plannedSlugs } from './lib/history.mjs';

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'style', 'revert'];
const HEADER = /^([a-z]+)(?:\(([^()\s]+)\))?(!)?: (.+)$/;
const MERGE_TEMPLATE = /^merge\(lane-[a-z0-9]+(?:-[a-z0-9]+)*\): \S/;
const IDS = /\b(?:TASK|DEC|CR)-\d{3,}\b/g;
const TRAILER = /^(Refs|Done):\s*(.+)$/gim;
const SUBJECT_MAX = 72;
/** §18.1's own gate-commit template; a long slug with CHANGES_REQUESTED runs past 72, by the template. */
const GATE_TEMPLATE = /^G(?:K|\d{1,2}) [a-z0-9][a-z0-9-]* (?:PASS|CHANGES_REQUESTED|BLOCKED|SKIPPED|STALE) \(\d{8}-\d{6}-[0-9a-f]{4}\)$/;
const LINES_MAX = 500;
const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|.*\.lock|.*\.min\.(js|css)|.*\.pb\.go|.*_gen\.go)$|(^|\/)(db|gen|generated)\//;

/** The message without git's comment lines and the scissors block. */
function clean(message) {
  const cut = message.replace(/\r\n?/g, '\n').split(/^# -+ >8 -+$/m)[0];
  return cut.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
}

export function lintMessage(message, { scopes = [] } = {}) {
  const out = [];
  const add = (rule, msg, level = 'error') => out.push({ rule, level, message: msg });
  const text = clean(message);
  const subject = text.split('\n')[0] ?? '';

  if (/^(fixup!|squash!|amend!)|^wip\b/i.test(subject)) {
    add('E097', `"${subject}" — squash it into the commit it fixes before hand-back`);
    return out;
  }
  if (/^Merge (branch|remote-tracking branch|pull request|lane)\b/.test(subject) || (/^merge\b/i.test(subject) && !MERGE_TEMPLATE.test(subject))) {
    const back = /^Merge (remote-tracking )?branch '[^']+' into .*lane/i.test(subject);
    add('E096', back
      ? `"${subject}" — a lane rebases onto the feature branch before hand-back; the feature branch is never merged into a lane (§18.1)`
      : `"${subject}" — a lane merge is \`merge(lane-<x>): <TASK ids or summary>\` (§18.1)`);
    return out;
  }
  if (MERGE_TEMPLATE.test(subject)) return out;

  const m = HEADER.exec(subject);
  if (!m) {
    add('E092', `"${subject}" is not \`<type>(<scope>): <subject>\` (Conventional Commits 1.0)`);
    return out;
  }
  const [, type, scope, , desc] = m;
  if (!TYPES.includes(type)) add('E092', `type \`${type}\` — allowed: ${TYPES.join(', ')}`);
  if (!scope) add('E093', `no scope — use a module from DEV-PROFILE §Delivery \`Commit scopes\`, or \`sdlc\` for a gate or state commit`);
  else if (scopes.length && !scopes.includes(scope)) add('E093', `scope \`${scope}\` is not in DEV-PROFILE §Delivery \`Commit scopes\` (${scopes.join(', ')})`);
  if (subject.length > SUBJECT_MAX && !(type === 'docs' && scope === 'sdlc' && GATE_TEMPLATE.test(desc))) add('E094', `subject is ${subject.length} characters (max ${SUBJECT_MAX})`);
  else if (/^[A-Z]/.test(desc) && !/^G(?:K|\d{1,2})\b/.test(desc)) add('E094', `subject starts upper-case: "${desc.slice(0, 30)}"`);
  else if (/\.$/.test(desc)) add('E094', 'subject ends with a full stop');

  const trailed = new Set();
  for (const t of text.matchAll(TRAILER)) for (const id of t[2].match(IDS) ?? []) trailed.add(id);
  const prose = text.replace(TRAILER, '');
  const loose = [...new Set(prose.match(IDS) ?? [])].filter((id) => !trailed.has(id));
  // A gate commit names the run, not the findings; its CRs live in the log it commits.
  if (loose.length && !(type === 'docs' && scope === 'sdlc')) add('E095', `${loose.join(', ')} not in a \`Refs:\` trailer — put every TASK, DEC and CR id the commit concerns in \`Refs:\` (or \`Done:\`)`);
  return out;
}

/** `feature/<tracker-key>-<slug>` → a RegExp; a lane suffix is always allowed. */
export function branchPattern(conventions) {
  const alts = conventions.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?<[^>]+>/g, '[A-Za-z0-9][A-Za-z0-9._-]*'));
  return new RegExp(`^(?:${alts.join('|')})(?:-lane-[a-z0-9-]+)?$`);
}

export function lintBranch(name, { protectedBranches = [], branchConvention = [] } = {}) {
  const out = [];
  if (!name || name === 'HEAD') return out;
  if (protectedBranches.includes(name)) {
    out.push({ rule: 'E098', level: 'error', message: `\`${name}\` is protected — commit on a feature branch (DEV-PROFILE §Delivery)` });
  } else if (branchConvention.length && !branchPattern(branchConvention).test(name)) {
    out.push({ rule: 'E098', level: 'error', message: `branch \`${name}\` does not match ${branchConvention.map((c) => `\`${c}\``).join(' or ')} (DEV-PROFILE §Delivery)` });
  }
  return out;
}

/**
 * progress.md rows for `Done:` trailers not yet recorded. `existing` is readProgress() output.
 * With `slug`, a commit counts only when it is that slug's (belongsTo over `slugs`).
 */
export function progressRows(commits, planned, existing, { slug = null, slugs = [] } = {}) {
  const recorded = new Set(existing.filter((r) => r.status === 'done').map((r) => r.task));
  const rows = [];
  for (const c of commits) {
    if (slug && !belongsTo(c.body, slug, slugs)) continue;
    for (const t of c.body.matchAll(/^Done:\s*(.+)$/gim)) {
      for (const id of t[1].match(/TASK-\d{3,}/g) ?? []) {
        if (!planned.has(id) || recorded.has(id)) continue;
        recorded.add(id);
        rows.push(`| ${id} | done | ${c.sha.slice(0, 7)} | from commit trailer |`);
      }
    }
  }
  return rows;
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });

function commitsIn(range) {
  const raw = git(['log', '--format=%H%x1f%P%x1f%B%x1e', range]);
  return raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, parents, body] = r.split('\x1f');
    return { sha, merge: parents.trim().split(/\s+/).length > 1, body: body.trim() };
  });
}

/**
 * Changed lines per commit of the range, generated and lock files excluded, from one
 * `git log --numstat`. One `git show` per commit took 17 s over release-management's 727.
 */
export function changedLinesIn(range) {
  const out = new Map();
  let sha = null;
  for (const line of git(['log', '--no-merges', '--numstat', '--format=%x1e%H', range]).split('\n')) {
    if (line.startsWith('\x1e')) { sha = line.slice(1).trim(); out.set(sha, 0); continue; }
    const [a, d, file] = line.split('\t');
    if (!sha || !file || GENERATED.test(file) || a === '-') continue;
    out.set(sha, out.get(sha) + Number(a) + Number(d));
  }
  return out;
}

function main(argv) {
  const arg = (f) => (argv.indexOf(f) !== -1 ? argv[argv.indexOf(f) + 1] : undefined);
  const root = rootFromArgv(argv);
  const profile = readProfile(root, arg('--profile') ?? null);
  const scopes = profile.scopes.length ? [...new Set([...profile.scopes, 'sdlc'])] : [];
  const json = argv.includes('--json');

  if (argv.includes('--message')) {
    const file = arg('--message');
    if (!file || !existsSync(file)) { console.error('commit-lint: --message <file>'); process.exit(2); }
    const findings = lintMessage(readFileSync(file, 'utf8'), { scopes });
    for (const f of findings) console.error(`commit-lint ${f.rule}: ${f.message}`);
    process.exit(findings.some((f) => f.level === 'error') ? 1 : 0);
  }

  if (argv.includes('--branch')) {
    const name = arg('--branch') && !arg('--branch').startsWith('--') ? arg('--branch') : git(['branch', '--show-current']).trim();
    const findings = lintBranch(name, profile);
    for (const f of findings) console.error(`commit-lint ${f.rule}: ${f.message}`);
    process.exit(findings.length ? 1 : 0);
  }

  if (argv.includes('--progress')) {
    const slug = arg('--progress');
    const tasks = join(root, 'plan', slug ?? '', 'tasks.md');
    if (!slug || !existsSync(tasks)) { console.error(`commit-lint: no plan/${slug}/tasks.md under ${root}`); process.exit(2); }
    const planned = new Set(readTable(parseDoc(readFileSync(tasks, 'utf8')).body, 'Tasks').map((r) => plain(r.id)));
    const file = join(root, 'implementation', slug, 'progress.md');
    const existing = existsSync(file) ? readProgress(readFileSync(file, 'utf8')) : [];
    const rows = progressRows(commitsIn('HEAD').reverse(), planned, existing, { slug, slugs: plannedSlugs(root) });
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `# Progress — ${slug}\n\nExecution status only (DEV-CONTRACTS §8.1), written from \`Done:\` trailers by commit-lint.mjs --progress.\n\n| Task | Status | Commit | Note |\n|---|---|---|---|\n`);
    }
    if (rows.length) appendFileSync(file, `${rows.join('\n')}\n`);
    console.log(`commit-lint --progress: ${rows.length} row(s) added to ${file}`);
    return;
  }

  const range = arg('--range');
  if (!range) { console.error('usage: commit-lint.mjs --message <file> | --branch [name] | --range <a>..<b> [--json] | --progress <slug>'); process.exit(2); }
  const commits = commitsIn(range);
  const byRule = {};
  const failing = [];
  let large = 0;
  const sizes = argv.includes('--no-size') ? new Map() : changedLinesIn(range);
  for (const c of commits) {
    const findings = lintMessage(c.body, { scopes });
    if (!c.merge && (sizes.get(c.sha) ?? 0) > LINES_MAX) {
      findings.push({ rule: 'W094', level: 'warn', message: `over ${LINES_MAX} changed lines` });
      large += 1;
    }
    for (const r of new Set(findings.map((f) => f.rule))) byRule[r] = (byRule[r] ?? 0) + 1;
    if (findings.some((f) => f.level === 'error')) failing.push({ sha: c.sha.slice(0, 9), subject: c.body.split('\n')[0], rules: findings.filter((f) => f.level === 'error').map((f) => f.rule) });
  }
  const report = { range, commits: commits.length, compliant: commits.length - failing.length, merges: commits.filter((c) => c.merge).length, large, byRule, failing };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const f of failing.slice(0, 50)) console.log(`${f.sha} ${f.rules.join(',')}  ${f.subject.slice(0, 90)}`);
    const pct = commits.length ? Math.round((100 * report.compliant) / commits.length) : 100;
    console.log(`\n${report.compliant}/${commits.length} commits compliant (${pct}%) · ${JSON.stringify(byRule)}`);
  }
  process.exit(failing.length ? 1 : 0);
}

if (process.argv[1]?.endsWith('commit-lint.mjs')) main(process.argv.slice(2));
