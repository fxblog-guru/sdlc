#!/usr/bin/env node
/**
 * threat-trace.mjs — does every threat name the control and the test that proves it (DEV-CONTRACTS §13.6)?
 *
 * Reads `design/<slug>/threat-model.md` `## STRIDE analysis`. Each row must carry a `THR-NNN` id, a
 * `Mitigation`, and a `Test` cell holding one or more test references, comma- or `·`-separated:
 *
 *   TestSessionFixation                     a test name, searched for in the source
 *   internal/http/session_test.go:TestX     a file that must exist and contain the name
 *   web/src/a.test.tsx                      a file that must exist
 *   gate:Secret scan                        a G8 quality gate (DEV-PROFILE §Quality gates)
 *   accepted: <name>                        a residual risk; the id must appear under ## Residual risk
 *
 * Without --source only the shape is checked (G2: the test is named). With --source each reference
 * must resolve in the code (G8: the test exists). A threat with no resolvable test is reported.
 *
 * With --source and --done, only the threats a finished task promised are judged: a `THR-NNN` named in
 * the row of a task `progress.md` marks done. That is the G7 merge check. Waiting for G8 to run the
 * whole trace let 45 of anime-blog's 69 threats sit without a test while the code that should carry
 * them was merged batch after batch; a threat whose task is not done yet is not a gap, and is skipped.
 *
 *   node dev/scripts/threat-trace.mjs <slug> [--root dev] [--source <dir>] [--done] [--profile <DEV-PROFILE.md>] [--json]
 *
 * Exit 1 when any judged threat is untraced, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, plain, readTable } from './lib/doc.mjs';
import { walkSource } from './lib/source.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { latestProgress, readProgress } from './lib/tasks.mjs';

const THR = /^THR-\d{3,}$/;
const CODE_FILE = /\.(go|py|ts|tsx|js|jsx|mjs|cjs|java|kt|rb|rs|cs|php|sql|sh|feature)$/i;
const NAME = /^[A-Za-z_][\w$.\-/ ]*$/;

/** Split a Test cell into references. */
export function parseRefs(cell) {
  const text = String(cell ?? '').replace(/`|\*\*/g, '').trim(); // not plain(): it strips the _ in session_test.go
  if (!text || /^(n\/a|none|tbd|-|—)$/i.test(text)) return [];
  if (/^accepted\s*:/i.test(text)) return [{ kind: 'accepted', who: text.replace(/^accepted\s*:\s*/i, '').trim() }];
  return text.split(/\s*[,;·]\s*/).filter(Boolean).map((raw) => {
    if (/^gate\s*:/i.test(raw)) return { kind: 'gate', name: raw.replace(/^gate\s*:\s*/i, '').trim(), raw };
    const colon = raw.lastIndexOf(':');
    if (colon > 0 && /[./]/.test(raw.slice(0, colon))) {
      return { kind: 'file', path: raw.slice(0, colon), name: raw.slice(colon + 1).trim(), raw };
    }
    if (/[/\\]/.test(raw) || CODE_FILE.test(raw)) return { kind: 'file', path: raw, name: '', raw };
    return { kind: 'name', name: raw, raw };
  });
}

/** Gate names from DEV-PROFILE §Quality gates. */
export function profileGates(text) {
  return readTable(parseDoc(text).body, 'Quality gates').map((r) => plain(r.gate).toLowerCase()).filter(Boolean);
}

/**
 * The trace. `source` is a directory or null; `files` lets a test inject a pre-read corpus.
 * Returns { threats, problems } where each problem is { id, row, reason }.
 */
export function trace(modelText, { source = null, gates = null, only = null } = {}) {
  const doc = parseDoc(modelText);
  const rows = readTable(doc.body, 'STRIDE analysis');
  const residual = sectionText(doc.body, 'Residual risk');
  const problems = [];
  const seen = new Map();
  let corpus = null;
  const loadCorpus = () => {
    if (corpus) return corpus;
    corpus = walkSource(source, (n) => CODE_FILE.test(n)).map((f) => {
      try { return readFileSync(f, 'utf8'); } catch { return ''; }
    });
    return corpus;
  };

  if (rows.length && !('test' in rows[0])) {
    problems.push({ id: '-', row: 0, reason: 'the STRIDE table has no `Test` column — add `Id` and `Test` (template threat-model.md)' });
  }

  let judged = 0;
  rows.forEach((row, i) => {
    const n = i + 1;
    const id = plain(row.id);
    const label = id || `row ${n}`;
    if (only && !only.has(id)) return;
    judged++;
    if (!THR.test(id)) {
      problems.push({ id: label, row: n, reason: id ? `\`${id}\` is not THR-NNN` : 'no THR-NNN id' });
    } else if (seen.has(id)) {
      problems.push({ id, row: n, reason: `duplicate id (also row ${seen.get(id)})` });
    } else {
      seen.set(id, n);
    }
    if (!plain(row.mitigation) || /^(n\/a|none|tbd)$/i.test(plain(row.mitigation))) {
      problems.push({ id: label, row: n, reason: 'no control named in Mitigation' });
    }
    if (!('test' in row)) return;
    const refs = parseRefs(row.test);
    if (!refs.length) {
      problems.push({ id: label, row: n, reason: 'no test named' });
      return;
    }
    for (const ref of refs) {
      const bad = check(ref, { id, residual, source, gates, loadCorpus });
      if (bad) problems.push({ id: label, row: n, reason: bad });
    }
  });

  return { threats: rows.length, judged, problems };
}

/**
 * The THR ids promised by finished tasks: a `THR-NNN` in the row of a task whose latest
 * `progress.md` status is done. Rows are read as text, so any column that names the threat counts.
 */
export function doneThreats(tasksText, progressText) {
  const progress = latestProgress(readProgress(progressText));
  const done = new Set([...progress].filter(([, r]) => r.status === 'done').map(([t]) => t));
  const ids = new Set();
  for (const line of String(tasksText).split(/\r?\n/)) {
    const task = /^\|\s*`?(TASK-\d{3,})`?\s*\|/.exec(line)?.[1];
    if (task && done.has(task)) for (const thr of line.match(/THR-\d{3,}/g) ?? []) ids.add(thr);
  }
  return ids;
}

function check(ref, { id, residual, source, gates, loadCorpus }) {
  if (ref.kind === 'accepted') {
    if (!ref.who) return 'accepted with nobody named';
    if (!id || !residual.includes(id)) return `accepted, but ${id || 'the row'} is not listed under ## Residual risk`;
    return null;
  }
  if (ref.kind === 'gate') {
    if (gates && !gates.includes(ref.name.toLowerCase())) return `gate \`${ref.name}\` is not in DEV-PROFILE §Quality gates`;
    return null;
  }
  if (!source) {
    return ref.kind === 'name' && !NAME.test(ref.name) ? `\`${ref.raw}\` is not a test name` : null;
  }
  if (ref.kind === 'file') {
    const abs = join(source, ref.path);
    if (!existsSync(abs)) return `test file \`${ref.path}\` does not exist`;
    if (ref.name && !new RegExp(`\\b${escape(ref.name)}\\b`).test(readFileSync(abs, 'utf8'))) {
      return `\`${ref.name}\` not found in \`${ref.path}\``;
    }
    return null;
  }
  const re = new RegExp(`(^|[^\\w$])${escape(ref.name)}([^\\w$]|$)`);
  return loadCorpus().some((t) => re.test(t)) ? null : `test \`${ref.name}\` not found in the source`;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionText(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function main(argv) {
  const valued = new Set(['--root', '--source', '--profile']);
  const slug = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  if (!slug) {
    console.error('usage: threat-trace.mjs <slug> [--root dev] [--source <dir>] [--profile <DEV-PROFILE.md>] [--json]');
    process.exit(2);
  }
  const root = rootFromArgv(argv);
  const model = join(root, 'design', slug, 'threat-model.md');
  if (!existsSync(model)) {
    console.error(`threat-trace: no ${model}`);
    process.exit(2);
  }
  const sourceArg = argFor(argv, '--source');
  const source = sourceArg ? resolve(sourceArg) : null;
  const profilePath = argFor(argv, '--profile') ?? ['.claude/DEV-PROFILE.md', 'DEV-PROFILE.md'].find((p) => existsSync(p));
  const gates = profilePath && existsSync(profilePath) ? profileGates(readFileSync(profilePath, 'utf8')) : null;

  let only = null;
  if (argv.includes('--done')) {
    const tasksPath = join(root, 'plan', slug, 'tasks.md');
    const progressPath = join(root, 'implementation', slug, 'progress.md');
    if (!source || !existsSync(tasksPath) || !existsSync(progressPath)) {
      console.error(`threat-trace: --done needs --source and both ${tasksPath} and ${progressPath}`);
      process.exit(2);
    }
    only = doneThreats(readFileSync(tasksPath, 'utf8'), readFileSync(progressPath, 'utf8'));
  }
  const result = trace(readFileSync(model, 'utf8'), { source, gates, only });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ slug, source: source ? 'checked' : 'not checked', ...result }, null, 2));
  } else {
    for (const p of result.problems) console.log(`${p.id.padEnd(8)} ${p.reason}`);
    const noColumn = result.problems.some((p) => p.row === 0);
    const traced = noColumn ? 0 : result.judged - new Set(result.problems.map((p) => p.row)).size;
    const scope = only ? ` promised by done tasks (${result.threats - result.judged} not due yet)` : '';
    console.log(`\n${traced}/${result.judged} threat(s)${scope} traced to a test${source ? ' in the source' : ' (names only — pass --source to check the code)'}`);
  }
  process.exit(result.problems.length ? 1 : 0);
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
