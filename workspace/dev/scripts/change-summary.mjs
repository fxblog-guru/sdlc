#!/usr/bin/env node
/**
 * change-summary.mjs — build `implementation/<slug>/change-summary.md`; nobody writes it by hand
 * (DEV-CONTRACTS §4.4, §5.5).
 *
 * The summary is derived: tasks and requirements from `plan/<slug>/tasks.md`, status from
 * `progress.md`, commits and changed files from `git log <base>..<head>`, and the narrative sections
 * from the lane notes (`implementation/<slug>/lanes/lane-*.md`), copied in lane order. The G7 verdict
 * binds the code by commit sha (`reviewed_commit:`), not by this file's hash, so regenerating it costs
 * no review. A commit that is another slug's (history.mjs belongsTo) is left out: TASK numbers restart
 * per slug, and a branch that carries two slugs would otherwise credit one with the other's work.
 *
 *   node dev/scripts/change-summary.mjs <slug> [--root dev] [--base <ref>] [--head <ref>]
 *                                       [--out <path> | --stdout | --check]
 *   node dev/scripts/change-summary.mjs <slug> --code-changed-since <sha>
 *
 *   --base    the PR target the branch is diffed against (default: the merge base with origin/main,
 *             else main, else master).
 *   --check   exit 1 when the file on disk differs from what would be generated (body only).
 *   --code-changed-since <sha>   exit 1 when code outside dev/ differs between <sha> and --head,
 *             0 when it does not, 2 when <sha> is unknown. The G7 staleness test for code.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, plain, readTable } from './lib/doc.mjs';
import { latestProgress, readProgress } from './lib/tasks.mjs';
import { belongsTo, commitSlugs, codePathspec, isNotCode, plannedSlugs } from './lib/history.mjs';
import { rootFromArgv } from './lib/root.mjs';

export const GENERATOR = 'change-summary.mjs';

/** Headings of the template, in order. The first is generated; the rest come from lane notes. */
export const SECTIONS = [
  'Tasks completed',
  'What was built',
  'Key decisions made during implementation',
  'Deviations from the plan',
  'Tests',
  'Migrations',
  'Observability added',
  'Configuration and flags',
  'Known weaknesses',
  'Not done',
  'Process friction',
];

const TASK_ID = /TASK-\d{3,}/g;
const REQ_ID = /REQ-\d{3,}/g;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).trim();
}

function tryGit(cwd, args) {
  try { return git(cwd, args); } catch { return null; }
}

function mergeBase(repo, base, head) {
  const candidates = base ? [base] : ['origin/main', 'main', 'master'];
  for (const ref of candidates) {
    const sha = tryGit(repo, ['merge-base', ref, head]);
    if (sha) return { ref, sha };
  }
  return null;
}

/** Commits base..head, oldest first, with the files each touched outside dev/. */
function commitsBetween(repo, base, head, devDir) {
  const range = base ? `${base}..${head}` : head;
  // \x1d closes the message, so the file list after it is never confused with a body line.
  const raw = tryGit(repo, ['log', '--reverse', '--no-merges', '--format=%x1e%h%x1f%s%x1f%b%x1d', '--name-only', range]);
  if (!raw) return [];
  return raw.split('\x1e').filter(Boolean).map((chunk) => {
    const [sha, subject, rest = ''] = chunk.split('\x1f');
    const [body, names = ''] = rest.split('\x1d');
    const files = names.split('\n').map((f) => f.trim()).filter((f) => f && !isNotCode(f, devDir));
    const text = `${subject}\n${body}`;
    return { sha: sha.trim(), subject: subject.trim(), body, tasks: [...new Set(text.match(TASK_ID) ?? [])], files };
  });
}

/** A lane's narrative, section by section, without template comments. */
function laneSections(path) {
  const doc = parseDoc(readFileSync(path, 'utf8'));
  const out = new Map();
  let heading = null;
  let buf = [];
  const flush = () => {
    if (heading) out.set(heading, buf.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim());
  };
  for (const line of doc.body.split('\n')) {
    if (/^## /.test(line)) {
      flush();
      heading = line.slice(3).replace(/\s*<!--.*?-->\s*$/, '').trim();
      buf = [];
    } else if (heading) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

const isEmpty = (text) => !text || /^(none\.?|n\/a\b.*)$/i.test(text.trim());

/**
 * A task's title for the summary: the bold lead of its cell when it has one, else the whole cell.
 * Code spans stay code spans: stripping their backticks would turn `<id>` into a placeholder (E005).
 */
export function taskTitle(cell) {
  const raw = String(cell ?? '').trim();
  const lead = raw.match(/^\*\*(.+?)\*\*/);
  return (lead ? lead[1] : raw).trim();
}

/** A commit subject as text: one with angle brackets goes in a code span, so `<x>` is not a placeholder. */
const subjectText = (s) => (/[<>]/.test(s) && !s.includes('`') ? `\`${s}\`` : s);

/** Demote headings inside a lane's section so they never become `##` sections of the summary. */
const nest = (text) => text.replace(/^(#{3,5}) /gm, (_, h) => `${h}# `);

export function generate({ devRoot, slug, base = null, head = 'HEAD' }) {
  const repo = resolve(devRoot, '..');
  const devDir = basename(devRoot);
  const tasksPath = join(devRoot, 'plan', slug, 'tasks.md');
  if (!existsSync(tasksPath)) throw new Error(`no ${devDir}/plan/${slug}/tasks.md — G6 comes first`);
  const plan = parseDoc(readFileSync(tasksPath, 'utf8'));
  const tasks = readTable(plan.body, 'Tasks')
    .map((r) => ({ id: plain(r.id), title: taskTitle(r.task), reqs: [...new Set(plain(r.req).match(REQ_ID) ?? [])], planned: plain(r.status) }))
    .filter((t) => /^TASK-\d{3,}$/.test(t.id));

  const progressPath = join(devRoot, 'implementation', slug, 'progress.md');
  const progress = existsSync(progressPath) ? latestProgress(readProgress(readFileSync(progressPath, 'utf8'))) : new Map();

  const headSha = tryGit(repo, ['rev-parse', '--short=7', head]);
  const mb = mergeBase(repo, base, head);
  const slugs = plannedSlugs(devRoot);
  const commits = (headSha ? commitsBetween(repo, mb?.sha ?? null, head, devDir) : [])
    // A commit with no task and no Slug: trailer is no slug's; it stays, as a deviation.
    .filter((c) => belongsTo(c.body, slug, slugs) || (!c.tasks.length && !commitSlugs(c.body).length));
  const byShaPrefix = (sha) => commits.find((c) => sha && (c.sha.startsWith(sha) || sha.startsWith(c.sha)));

  const rows = tasks.map((t) => {
    const p = progress.get(t.id);
    const own = commits.filter((c) => c.tasks.includes(t.id));
    const recorded = (p?.commit ?? '').split(/[\s,]+/).filter((s) => /^[0-9a-f]{7,40}$/.test(s));
    for (const sha of recorded) {
      const c = byShaPrefix(sha);
      if (c && !own.includes(c)) own.push(c);
    }
    const shas = own.map((c) => c.sha);
    for (const sha of recorded) if (!shas.some((s) => s.startsWith(sha.slice(0, 7)))) shas.push(sha.slice(0, 7));
    const files = [...new Set(own.flatMap((c) => c.files))].sort();
    return { ...t, status: p?.status || t.planned || 'todo', commits: shas, files };
  });

  const known = new Set(tasks.map((t) => t.id));
  const untasked = commits.filter((c) => !c.tasks.some((id) => known.has(id)) && c.files.length);

  const laneDir = join(devRoot, 'implementation', slug, 'lanes');
  const lanes = existsSync(laneDir)
    ? readdirSync(laneDir).filter((f) => /^lane-[a-z0-9-]+\.md$/.test(f)).sort().map((f) => ({ name: f.replace(/\.md$/, ''), sections: laneSections(join(laneDir, f)) }))
    : [];

  const cell = (s) => String(s).replace(/\|/g, '\\|');
  const out = [];
  out.push('## Tasks completed', '');
  out.push(`Generated by \`${GENERATOR}\` from \`plan/${slug}/tasks.md\`, \`progress.md\` and \`git log ${mb ? `${mb.sha.slice(0, 7)}` : '(no base)'}..${headSha ?? head}\`${mb ? ` (merge base with \`${mb.ref}\`)` : ''}. Do not edit; re-run it.`, '');
  out.push('| TASK | REQ | Status | Commits | Files changed |', '|---|---|---|---|---|');
  for (const r of rows) {
    const files = r.files.length ? r.files.map((f) => `\`${f}\``).join(', ') : '—';
    out.push(`| ${r.id} | ${r.reqs.join(', ') || '—'} | ${r.status} | ${r.commits.map((s) => `\`${s}\``).join(', ') || '—'} | ${cell(files)} |`);
  }
  const done = rows.filter((r) => r.status === 'done').length;
  out.push('', `${done} of ${rows.length} tasks done; ${commits.length} commit(s) in range.`, '');

  for (const heading of SECTIONS.slice(1)) {
    out.push(`## ${heading}`, '');
    const parts = [];
    if (heading === 'Deviations from the plan' && untasked.length) {
      parts.push('Commits that name no task (each is unplanned scope or a follow-up; the lane notes say which):', '');
      for (const c of untasked) parts.push(`- \`${c.sha}\` ${subjectText(c.subject)} — ${c.files.map((f) => `\`${f}\``).join(', ')}`);
      parts.push('');
    }
    for (const lane of lanes) {
      const text = lane.sections.get(heading);
      if (isEmpty(text)) continue;
      parts.push(`### ${lane.name}`, '', nest(text), '');
    }
    if (heading === 'Not done') {
      const open = rows.filter((r) => r.status !== 'done');
      if (open.length) {
        parts.push('Tasks not `done` in `progress.md`:', '');
        for (const r of open) parts.push(`- ${r.id} (${r.status}) — ${r.title}`);
        parts.push('');
      }
    }
    out.push(...(parts.length ? parts : ['None.', '']));
  }

  const reqs = [...new Set(rows.flatMap((r) => r.reqs))].sort();
  const today = new Date().toISOString().slice(0, 10);
  const fm = [
    '---',
    `slug: ${slug}`,
    'stage: implementation',
    'artifact: change-summary',
    'status: draft',
    `authored_by: ${GENERATOR}`,
    'reviewed_by: pending',
    `tracker: ${plan.frontMatter.tracker ?? 'none'}`,
    `created: ${today}`,
    `updated: ${today}`,
    `requirements: [${reqs.join(', ')}]`,
    `generated_by: ${GENERATOR}`,
    `base: ${mb ? mb.sha.slice(0, 7) : 'none'}`,
    `head: ${headSha ?? 'none'}`,
    '---',
    '',
  ];
  const body = `${out.join('\n').replace(/\n+$/, '')}\n`;
  return { text: fm.join('\n') + body, body };
}

/** 0 code unchanged · 1 changed · 2 the sha is unknown. Paths under the dev root are not code. */
export function codeChangedSince(devRoot, sha, head = 'HEAD') {
  const repo = resolve(devRoot, '..');
  if (!tryGit(repo, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])) return 2;
  try {
    execFileSync('git', ['diff', '--quiet', sha, head, '--', ...codePathspec(basename(devRoot))], { cwd: repo, stdio: 'ignore' });
    return 0;
  } catch (err) {
    return err.status === 1 ? 1 : 2;
  }
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

function main(argv) {
  const devRoot = rootFromArgv(argv);
  const valued = new Set(['--root', '--base', '--head', '--out', '--code-changed-since']);
  const slug = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!slug) {
    console.error('usage: change-summary.mjs <slug> [--root dev] [--base <ref>] [--head <ref>] [--out <path> | --stdout | --check]');
    process.exit(2);
  }
  const head = argFor(argv, '--head') ?? 'HEAD';
  const since = argFor(argv, '--code-changed-since');
  if (since) {
    const code = codeChangedSince(devRoot, since, head);
    console.log(['code unchanged since', 'code changed since', 'unknown commit'][code] + ` ${since}`);
    process.exit(code);
  }

  let result;
  try {
    result = generate({ devRoot, slug, base: argFor(argv, '--base'), head });
  } catch (err) {
    console.error(`change-summary: ${err.message}`);
    process.exit(2);
  }
  const target = join(devRoot, 'implementation', slug, 'change-summary.md');
  if (argv.includes('--stdout')) {
    process.stdout.write(result.text);
    return;
  }
  if (argv.includes('--check')) {
    const current = existsSync(target) ? parseDoc(readFileSync(target, 'utf8')).body : '';
    const fresh = parseDoc(result.text).body;
    if (current === fresh) {
      console.log('change-summary.md is up to date');
      return;
    }
    console.log('change-summary.md is out of date — run change-summary.mjs');
    process.exit(1);
  }
  const out = resolve(argFor(argv, '--out') ?? target);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, result.text);
  console.log(`wrote ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
