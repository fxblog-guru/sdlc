#!/usr/bin/env node
/**
 * learn.mjs — what this project has learned across initiatives, and the gate a lesson passes
 * (/sdlc-learn, DEV-CONTRACTS §19).
 *
 *   node <root>/scripts/learn.mjs check [--root <dir>]          the gate: every lesson well-formed, evidenced, safe, not a duplicate
 *   node <root>/scripts/learn.mjs harvest [--min 2] [--json]     signals in the gate logs and post-release reports that are not yet a lesson
 *   node <root>/scripts/learn.mjs recall [--gate G4] [--stage api] [--skill s] [--module m] [--limit 8] [--full] [--shared]
 *                                                               an index of the active lessons that apply: id, confidence, title, probe;
 *                                                               --shared adds up to three lessons Recall shares with every project
 *   node <root>/scripts/learn.mjs show <LRN-…> [<LRN-…> …]      the bodies of the lessons the index made worth reading
 *   node <root>/scripts/learn.mjs audit [--today YYYY-MM-DD]     stale provisional lessons, broken evidence, flagged text
 *   node <root>/scripts/learn.mjs push [--project <name>] [--dry-run]
 *                                                               share every established lesson through Recall, once each
 *   node <root>/scripts/learn.mjs promote [--min-projects 2] [--request]
 *                                                               lessons Recall holds from several projects: candidates for the bundle,
 *                                                               and the `recall share request` that offers each to every project
 *   node <root>/scripts/learn.mjs promote --local [--approved-by <who>]
 *                                                               this project's process lessons: a candidate on a human's word
 *   node <root>/scripts/learn.mjs brief [--peek] [--today YYYY-MM-DD]
 *                                                               what is new since the last brief: signals to distil, lessons
 *                                                               written, ideas to rank, lessons gone stale; silent when nothing is
 *
 * A lesson is one file, `<root>/learnings/LRN-<TOPIC>.md`: front matter plus a few lines saying what
 * to do next time, why, and what not to do. It is never a log of an initiative (the gate log is the
 * log; the lesson cites it) and never a fact about the product (that is a knowledge card, §16). The
 * format is the QA bundle's (its CONTRACTS §23), so one Recall store holds both and a project running
 * both bundles reads one shape.
 *
 * Confidence is earned. A lesson starts `provisional`, on one initiative's evidence, and becomes
 * `established` only on a second, independent source: another initiative, or a named human. Two
 * logs of the same slug are one source, because one initiative's mistake repeated in its own retry
 * says nothing about the next initiative.
 *
 * Harvest is mechanical; it proposes, it never writes a lesson. The signals:
 *   recurring rework    one gate needed a second attempt on ≥ min initiatives
 *   recurring finding   findings at one gate, on ≥ min initiatives, whose problem text says the same thing
 *   reopened finding    a finding the author said was fixed and the reviewer reopened
 *   post-release        a G11 `## What we learned` that says something
 *   lane friction       a `## Process friction` bullet that ≥ min lane notes say in the same words
 * and the process signals of one initiative, which need no second one (§19.3):
 *   costly gate         one gate logged COSTLY_GATE times or more on a slug
 *   override            a gate held on a human `override:`
 *   reaffirm cascade    REAFFIRM_CASCADE reaffirm logs or more on a slug
 *   out of order        a later gate ran while an earlier one was neither PASS, SKIPPED nor overridden
 * A signal whose every source an active lesson already cites is `covered`, not new.
 *
 * The ladder (§19.6). A finding in a gate log written after an active lesson, at a gate the lesson
 * applies to, that says what the lesson says, is a **repeat error**: the lesson was recalled and the
 * mistake happened anyway. Two repeats of one lesson and harvest proposes `promote to check` (a lint
 * rule, a hook or a CI script, through /sdlc-improve), and never again a checklist row: prose has
 * failed twice. A lesson that has matched nothing in RETIRE_AFTER initiatives since it was written is
 * proposed for retirement. Both are proposals; a human makes the change.
 *
 * Lane friction is the one signal that does not wait for a gate. On anime-blog the lanes wrote the
 * same traps into their reports batch after batch (heredocs eating escapes, timeouts under parallel
 * load, cleanup skipped after a merge) and no gate log ever held them, so nothing proposed a lesson
 * until the owner asked why the bundle had not learned. Two lanes saying it is the repeat.
 *
 * Recall is two steps so a stage pays for the lessons it uses: the index costs one line and a probe
 * per hit; `show` prints the bodies the probe made relevant.
 *
 * `--shared` asks the Recall CLI (`recall search --scope shared`, SDLC_RECALL_BIN overrides the binary;
 * RECALL_URL and RECALL_API_KEY reach the server) for the lessons the Recall Owner shared with every
 * project. The scope matters: a project key reads its own project plus Shared, and its own lessons are
 * not news from elsewhere. An older Recall that does not know `--scope` is asked once more without
 * it, and entries of this project (DEV-PROFILE §Project `Name`) are dropped instead. It is optional
 * and fails open: no binary, no server, a timeout or bad output prints at most one line and the local
 * index stands. What comes back is another project's habit, labelled as such, and scanned like a
 * local lesson before it is printed.
 *
 * A lesson is injected into agents' prompts, so every one is scanned (lib/lesson-scan.mjs, the same
 * file as the QA bundle's): injection phrases, exfiltration steps, credentials, invisible characters.
 * A hit is a gate error, and recall / show withhold the lesson with a warning instead of printing it.
 * There is no override: anything that marked a lesson as allowed would live in the file a poisoned
 * lesson writes.
 *
 * Across projects (§19.4): `push` sends each `established` lesson to Recall as `kind: lesson` with its
 * `--confidence` (dropped, once per run, for an older Recall that refuses it), tagged
 * `sdlc`, its gates, and `project:<name>` (DEV-PROFILE §Project `Name`), and records what it sent in
 * `learnings/.pushed.json` so a lesson goes once and goes again only when it changes. A provisional
 * lesson stays local: one initiative's habit is not yet worth another project's attention. `promote`
 * reads the lessons back and groups the ones that say the same thing; a group from two or more
 * projects is a candidate for the bundle itself, offered to a human through /sdlc-improve. A candidate
 * that names one project's tables, endpoints, paths or ids is refused: that is a fact, not a habit.
 * A pushed lesson stays its project's own until the Recall Owner shares it: for each candidate entry
 * `promote` prints `recall share request <id>`, and `--request` sends them (each needs a key of the
 * lesson's project; Recall scans and cleans the copy before the Owner approves it).
 *
 * The loop must not depend on anyone remembering to run it (§19.5). `brief` runs at session start
 * and at the end of every stage, and says only what changed since it last spoke: it keeps what it
 * has said in `<root>/logs/learn-brief.json` (ignored by git, per machine), so a signal is announced
 * once, and again only when new evidence joins it. It proposes; distilling stays /sdlc-learn, where
 * a judge accepts each lesson.
 *
 * check exits 1 on any error; harvest exits 1 when a signal is flagged; show exits 1 on an unknown or
 * withheld id; recall and audit exit 0; 2 is a usage error.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseDoc, readTable, plain } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { readProfile, setting } from './lib/profile.mjs';
import { logRun } from './lib/runlog.mjs';
import { logActivity, makeEvent, readActivity } from './lib/activity.mjs';
import { scanLesson, scanText, describe } from './lib/lesson-scan.mjs';
import { list as openIdeas } from './ideas.mjs';

export const DIR = 'learnings';
const ID = /^LRN-[A-Z0-9]+(-[A-Z0-9]+)*$/;
const REQUIRED = ['id', 'title', 'status', 'confidence', 'applies_to', 'evidence', 'probe', 'created', 'updated'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STALE_DAYS = 60;
const MAX_BODY_LINES = 30;
const DUPLICATE = 0.6;
const REPEAT_SIMILARITY = 0.35;
export const PROMOTE_AFTER = 2;
export const RETIRE_AFTER = 5;
// The stage folders whose second path segment is the slug (§2): evidence under one of them belongs to that initiative.
const SLUG_DIRS = new Set(['intake', 'requirements', 'design', 'data', 'api', 'ui', 'plan', 'implementation', 'verification', 'release', 'deployment', 'monitoring', 'reviews', 'decisions']);

const posix = (p) => p.split(sep).join('/');
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const list = (v) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const isHuman = (e) => /^human:\s*\S/.test(e);
const pathOf = (e) => e.replace(/#.*$/, '').replace(/:\d+$/, '');

/** The initiative an evidence entry belongs to; anything outside a slug folder is its own source. */
export function sourceOf(e) {
  if (isHuman(e)) return e;
  const p = pathOf(e).replace(/^(\.sdlc|dev)\//, '');
  const m = /^([a-z-]+)\/([a-z0-9][a-z0-9-]*)(?:\/|\.md$)/.exec(p);
  return m && SLUG_DIRS.has(m[1]) ? `slug:${m[2]}` : p;
}

/** Every lesson on disk as { path, fm, body, hasFm }, the path relative to the root. */
export function loadLessons(root) {
  const out = [];
  for (const p of walk(join(root, DIR))) {
    if (!p.endsWith('.md') || basename(p) === 'README.md') continue;
    const doc = parseDoc(readFileSync(p, 'utf8'));
    out.push({ path: posix(relative(root, p)), fm: doc.frontMatter, body: doc.body, hasFm: doc.hasFrontMatter });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
/** Jaccard overlap of the words longer than two letters. */
export function similarity(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** The gate. Returns { errors } as `path: message` strings. */
export function checkLessons(lessons, { root, exists = (p) => existsSync(join(root, p)) } = {}) {
  const errors = [];
  const err = (l, m) => errors.push(`${l.path}: ${m}`);
  const ids = new Map();
  for (const l of lessons) {
    if (!l.hasFm) { err(l, 'no front matter (start from _templates/learning.md)'); continue; }
    const fm = l.fm;
    for (const k of REQUIRED) if (fm[k] == null || (Array.isArray(fm[k]) && !fm[k].length)) err(l, `front matter lacks \`${k}\``);
    const id = String(fm.id ?? '');
    if (!ID.test(id)) err(l, `id "${id}" is not LRN-<TOPIC> (uppercase, kebab)`);
    if (basename(l.path, '.md') !== id) err(l, `file name differs from id ${id}`);
    if (ids.has(id)) err(l, `id ${id} also used by ${ids.get(id)}`);
    ids.set(id, l.path);
    if (!['active', 'deprecated'].includes(fm.status)) err(l, `status "${fm.status}" — active | deprecated`);
    if (!['provisional', 'established'].includes(fm.confidence)) err(l, `confidence "${fm.confidence}" — provisional | established`);
    for (const k of ['created', 'updated']) if (fm[k] != null && !DATE.test(String(fm[k]))) err(l, `${k} "${fm[k]}" is not YYYY-MM-DD`);
    if (fm.probe != null && !String(fm.probe).trim().endsWith('?')) err(l, 'probe is the question a future stage would ask — end it with "?"');
    for (const a of list(fm.applies_to)) {
      if (!KEBAB.test(a) && !a.includes('*')) err(l, `applies_to "${a}" — a gate (g4), a stage, a skill, a module, or a glob`);
    }

    const evidence = list(fm.evidence);
    for (const e of evidence) {
      if (isHuman(e)) continue;
      const p = pathOf(e).replace(/^(\.sdlc|dev)\//, '');
      if (!exists(p)) err(l, `evidence ${e} does not exist — cite a gate log, a post-release report or another artifact under the root, or "human: <who> — <what>"`);
    }
    const sources = new Set(evidence.map(sourceOf));
    if (fm.confidence === 'established' && sources.size < 2 && !evidence.some(isHuman)) {
      err(l, `established on ${sources.size} source — needs a second initiative or a named human; keep it provisional until then`);
    }

    if (fm.status === 'deprecated' && !fm.superseded_by && !fm.reason) err(l, 'deprecated without superseded_by or reason');
    const body = l.body.split('\n').filter((x) => x.trim() && !x.startsWith('#') && !x.trim().startsWith('<!--'));
    if (!body.length) err(l, 'no body — say what to do, why, and what not to do');
    if (body.length > MAX_BODY_LINES) err(l, `${body.length} body lines (max ${MAX_BODY_LINES}) — one lesson per file; split it`);
    for (const f of scanLesson(l)) err(l, `unsafe: ${describe(f)} — a lesson is injected into agent prompts; rewrite it without this, never force it in`);
  }
  for (const l of lessons) {
    if (l.fm?.superseded_by && !ids.has(String(l.fm.superseded_by))) err(l, `superseded_by ${l.fm.superseded_by} is not a lesson`);
  }
  const active = lessons.filter((l) => l.fm?.status === 'active');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const s = similarity(`${active[i].fm.title} ${active[i].fm.probe}`, `${active[j].fm.title} ${active[j].fm.probe}`);
      if (s >= DUPLICATE) err(active[j], `near-duplicate of ${active[i].fm.id} (${Math.round(s * 100)} %) — merge into one and deprecate the other`);
    }
  }
  return { errors };
}

/** { safe, withheld: [{ lesson, findings }] } — a flagged lesson is never printed. */
export function screen(lessons) {
  const safe = [];
  const withheld = [];
  for (const l of lessons) {
    const findings = scanLesson(l);
    if (findings.length) withheld.push({ lesson: l, findings });
    else safe.push(l);
  }
  return { safe, withheld };
}

/** Active lessons that apply: most matched terms first, then established, then id. No terms: every active lesson. */
export function recall(lessons, { gate = null, stage = null, skill = null, module = null } = {}) {
  const wanted = [gate, stage, skill, module].filter(Boolean).map((x) => String(x).toLowerCase());
  const glob = (pattern, value) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
  const score = (l) => wanted.filter((w) => list(l.fm.applies_to).some((a) => glob(a.toLowerCase(), w))).length;
  return lessons
    .filter((l) => l.fm?.status === 'active')
    .map((l) => ({ l, n: score(l) }))
    .filter(({ n }) => !wanted.length || n > 0)
    .sort((a, b) => b.n - a.n
      || (a.l.fm.confidence === b.l.fm.confidence ? 0 : a.l.fm.confidence === 'established' ? -1 : 1)
      || String(a.l.fm.id).localeCompare(String(b.l.fm.id)))
    .map(({ l }) => l);
}

// ---- shared lessons (Recall) -----------------------------------------------------------------------

const SHARED_LIMIT = 3;
const SHARED_TIMEOUT_MS = 5000;

/** Run the Recall CLI; a `.mjs` stands in for it in tests. Never throws: a failure is in the result. */
const recallCli = (args, { env = process.env, spawn = spawnSync, input } = {}) => {
  const bin = env.SDLC_RECALL_BIN || 'recall';
  // A script given as the binary runs under this node, so a test can stand in for the CLI on any OS.
  const [cmd, argv] = /\.m?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
  try { return spawn(cmd, argv, { encoding: 'utf8', timeout: SHARED_TIMEOUT_MS, env, input }); } catch (e) { return { error: e }; }
};

/** True when an older Recall refused `--<flag>` as unknown (Go's flag package, or a generic CLI). */
export const rejectsFlag = (r, flag) => !r?.error && r?.status !== 0
  && new RegExp(`(?:not defined|unknown (?:flag|option))[^\\n]*?-${flag}\\b`).test(`${r?.stderr ?? ''}\n${r?.stdout ?? ''}`);

/** Run with `--flag value`; an older Recall that does not know the flag is asked once more without it. */
export function recallWithFlag(args, flag, value, opts = {}) {
  const r = recallCli([...args, `--${flag}`, value], opts);
  return rejectsFlag(r, flag) ? { ...recallCli(args, opts), fallback: true } : r;
}

const ownEntry = (e, project) => !!project && (e?.project === project || (e?.tags ?? []).includes(`project:${project}`));

/**
 * Up to three shared lessons from Recall as { ok, entries: [{ id, title }], note }. `ok` false means
 * Recall could not be asked; the caller prints `note` and carries on. A flagged entry is dropped and
 * counted. `--scope shared` keeps a project key from handing back the project's own lessons; on an
 * older Recall without it, entries of `project` are dropped here instead.
 */
export function sharedLessons(terms, { env = process.env, run = spawnSync, project = null } = {}) {
  const r = recallWithFlag(['search', ...terms, '--kind', 'lesson', '--limit', String(SHARED_LIMIT), '--json'], 'scope', 'shared', { env, spawn: run });
  if (r.error?.code === 'ENOENT') return { ok: false, entries: [], note: null };
  if (r.error || r.status !== 0) return { ok: false, entries: [], note: 'Recall unreachable — local lessons only' };
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return { ok: false, entries: [], note: 'Recall answered in a shape this script cannot read — local lessons only' }; }
  const entries = [];
  let flagged = 0;
  for (const e of (Array.isArray(parsed?.entries) ? parsed.entries : []).filter((x) => !(r.fallback && ownEntry(x, project))).slice(0, SHARED_LIMIT)) {
    const title = String(e?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!title) continue;
    if (scanText(`${title}\n${e?.body ?? ''}`).length) { flagged++; continue; }
    entries.push({ id: String(e?.id ?? '?').slice(0, 40), title });
  }
  return { ok: true, entries, note: flagged ? `${flagged} shared lesson(s) withheld by the lesson scan` : null };
}

// ---- across projects (§19.4) ---------------------------------------------------------------------

const PUSHED = '.pushed.json';
/** A lesson as Recall stores it: one fact of at most 2000 characters, the body without its heading. */
export function lessonPayload(l, project) {
  const text = l.body.split('\n').filter((x) => !x.startsWith('# ') && !x.trim().startsWith('<!--')).join('\n').trim();
  const tags = ['sdlc', ...list(l.fm.applies_to).filter((a) => !a.includes('*'))];
  if (project) tags.push(`project:${project}`);
  return { title: String(l.fm.title), body: `${text}\n\nProbe: ${l.fm.probe}`.slice(0, 2000), tags: [...new Set(tags)] };
}

const digest = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/** Established, active, safe lessons not yet pushed in their current form: [{ lesson, payload }]. */
export function toPush(lessons, pushed, project) {
  return screen(lessons.filter((l) => l.fm?.status === 'active' && l.fm.confidence === 'established')).safe
    .map((l) => ({ lesson: l, payload: lessonPayload(l, project) }))
    .filter(({ lesson, payload }) => pushed[lesson.fm.id] !== digest(payload));
}

export function push(root, { project, env = process.env, spawn = spawnSync, dryRun = false } = {}) {
  const file = join(root, DIR, PUSHED);
  let pushed = {};
  try { pushed = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first push */ }
  const out = { sent: [], duplicate: [], failed: [], dryRun };
  let oldRecall = false; // an older Recall without --confidence is asked once; the rest of the run goes without it
  for (const { lesson, payload } of toPush(loadLessons(root), pushed, project)) {
    if (dryRun) { out.sent.push(lesson.fm.id); continue; }
    const args = ['push', '--kind', 'lesson', '--title', payload.title, '--body', '-', ...payload.tags.flatMap((t) => ['--tag', t])];
    if (project) args.push('--project', project);
    const opts = { env, spawn, input: payload.body };
    const r = oldRecall ? recallCli(args, opts) : recallWithFlag(args, 'confidence', String(lesson.fm.confidence), opts);
    if (r.fallback) oldRecall = true;
    if (r.error?.code === 'ENOENT') return { ...out, unavailable: true };
    // Recall refuses the same content twice and hands back the entry it holds: already shared.
    const dup = /possible_duplicate/.test(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (r.status === 0 || dup) {
      (dup ? out.duplicate : out.sent).push(lesson.fm.id);
      pushed[lesson.fm.id] = digest(payload);
    } else out.failed.push(lesson.fm.id);
  }
  if (!dryRun && (out.sent.length || out.duplicate.length)) writeFileSync(file, `${JSON.stringify(pushed, null, 2)}\n`);
  return out;
}

// A fact about one system, not a habit: a source path, an endpoint, a table or column, a pipeline id.
const SPECIFIC = [
  { rule: 'path', re: /(?:^|[\s(`'"])(?:\.?\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:go|py|ts|tsx|js|mjs|sql|ya?ml|json)\b/ },
  { rule: 'endpoint', re: /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\w{}/:-]+/ },
  { rule: 'table', re: /`[a-z][a-z0-9]*_[a-z0-9_]+`|\b(?:table|column)\s+`?[a-z][a-z0-9_]*\.[a-z0-9_]+/ },
  { rule: 'id', re: /\b(?:REQ|TASK|DEC|CR|ADR|SLO|THR|IDEA)-\d{3,}\b/ },
];
export const specificTo = (text) => SPECIFIC.filter(({ re }) => re.test(String(text))).map(({ rule }) => rule);

const projectOf = (e) => (e.tags ?? []).find((t) => String(t).startsWith('project:'))?.slice(8) || e.project || null;

/** Shared lessons that say the same thing, grouped: [{ title, projects, ids, refused }], most projects first. */
export function promote(entries, { minProjects = 2 } = {}) {
  const groups = [];
  for (const e of entries.filter((x) => x?.title && projectOf(x) && !scanText(`${x.title}\n${x.body ?? ''}`).length)) {
    const g = groups.find((x) => similarity(x.title, e.title) >= 0.5);
    if (g) g.members.push(e);
    else groups.push({ title: e.title, members: [e] });
  }
  return groups
    .map((g) => ({
      title: g.title,
      projects: [...new Set(g.members.map(projectOf))].sort(),
      ids: g.members.map((m) => m.id),
      // A project's own entry can be offered to the Recall Owner; one already shared (no project) cannot.
      requestable: g.members.filter((m) => m.project && !(m.origin_projects ?? []).length).map((m) => m.id),
      refused: [...new Set(g.members.flatMap((m) => specificTo(`${m.title}\n${m.body ?? ''}`)))],
    }))
    .filter((g) => g.projects.length >= minProjects)
    .sort((a, b) => b.projects.length - a.projects.length || a.title.localeCompare(b.title));
}

/**
 * This project's active lessons about the bundle's own process (`applies_to` names `process`): the one
 * kind a human may send to the bundle from a single project, because the second project they would
 * wait for runs the same broken step first. A lesson that names this system's paths or ids is refused.
 */
export function localCandidates(lessons) {
  return lessons
    .filter((l) => l.fm?.status === 'active' && list(l.fm.applies_to).map((a) => a.toLowerCase()).includes('process') && !scanText(`${l.fm.title}
${l.body}`).length)
    .map((l) => ({ id: String(l.fm.id), title: String(l.fm.title), refused: specificTo(`${l.fm.title}
${l.body}`) }));
}

// ---- harvest --------------------------------------------------------------------------------------

/** Every gate log under reviews/ as { path, slug, gate, attempt, verdict, findings, resolutions }. */
export function readLogs(root) {
  const out = [];
  for (const p of walk(join(root, 'reviews'))) {
    const rel = posix(relative(root, p));
    if (!rel.endsWith('.md') || /\/\./.test(rel) || rel.startsWith('reviews/_repo/')) continue;
    const doc = parseDoc(readFileSync(p, 'utf8'));
    const fm = doc.frontMatter;
    if (!fm.gate) continue;
    out.push({
      path: rel,
      slug: String(fm.slug ?? rel.split('/')[1]),
      gate: String(fm.gate),
      attempt: Number(fm.attempt ?? 1),
      verdict: String(fm.verdict ?? ''),
      date: String(fm.run_id ?? '').slice(0, 8),
      runId: String(fm.run_id ?? ''),
      override: fm.override && String(fm.override) !== 'null' ? String(fm.override) : null,
      reaffirm: Boolean(fm.revalidated_from && String(fm.revalidated_from) !== 'null'),
      findings: readTable(doc.body, 'Findings').filter((r) => /^CR-\d+/.test(plain(r.id))),
      resolutions: readTable(doc.body, 'Finding resolution').filter((r) => /^CR-\d+/.test(plain(r.id))),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The prose of a G11 `## What we learned`, without the template's guidance comment; '' when there is none. */
export function learnedText(text) {
  const body = parseDoc(text).body;
  const m = /^## What we learned\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
  if (!m) return '';
  const prose = m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
  return /^<[^>]*>$/.test(prose) || /^(none|n\/a)\b/i.test(prose) ? '' : prose;
}

/**
 * The top-level bullets under a lane note's `## Process friction`, `**bold**` lead-ins kept as text.
 * A `###` under the last section is read too: notes written before the template had the heading put
 * it there to pass lint-dev E004.
 */
export function frictionBullets(text) {
  const body = parseDoc(text).body;
  const m = /^##{1,2} Process friction\s*\n([\s\S]*?)(?=^##{1,2} |(?![\s\S]))/m.exec(body);
  if (!m) return [];
  return m[1].replace(/<!--[\s\S]*?-->/g, '').split(/\n(?=- )/)
    .map((b) => b.replace(/^- /, '').replace(/\s+/g, ' ').trim())
    .filter((b) => b && !/^(none|n\/a)\b/i.test(b) && !/^<[^>]*>$/.test(b));
}

/** Friction that two or more lane notes report in the same words: greedy clusters, one per lane. */
function laneFriction(root, min) {
  const items = [];
  for (const p of walk(join(root, 'implementation'))) {
    if (!/[\\/]lanes[\\/]lane-[^\\/]+\.md$/.test(p)) continue;
    const path = posix(relative(root, p));
    const lane = basename(p, '.md').replace(/^lane-/, '');
    for (const text of frictionBullets(readFileSync(p, 'utf8'))) items.push({ lane, path, text });
  }
  const out = [];
  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const cluster = [items[i]];
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j) || cluster.some((c) => c.lane === items[j].lane)) continue;
      if (similarity(items[i].text, items[j].text) >= 0.35) { cluster.push(items[j]); used.add(j); }
    }
    if (cluster.length >= min) {
      used.add(i);
      out.push({ signal: 'lane friction', subject: `${cluster[0].text.slice(0, 100)} (${cluster.map((c) => c.lane).join(', ')})`, count: cluster.length, evidence: [...new Set(cluster.map((c) => c.path))] });
    }
  }
  return out;
}

// ---- process signals --------------------------------------------------------------------------
// The findings above are the product's defects. The run's own costs never become findings: a gate
// reviewed again and again, a release shipped on overrides, a ledger edit that staled seven gates, a
// later gate run while an earlier one was still red. They were the expensive part of an initiative,
// and one initiative is enough to show them, so these do not wait for a second.

export const COSTLY_GATE = 4;
export const REAFFIRM_CASCADE = 3;
const CLEARED = new Set(['PASS', 'SKIPPED']);
const gateNo = (g) => (/^G\d+$/.test(g) ? Number(g.slice(1)) : null);

export function processSignals(logs) {
  const out = [];
  const bySlug = new Map();
  for (const l of logs) bySlug.set(l.slug, [...(bySlug.get(l.slug) ?? []), l]);
  for (const [slug, xs] of bySlug) {
    const byGate = new Map();
    for (const l of xs) byGate.set(l.gate, [...(byGate.get(l.gate) ?? []), l]);
    for (const [gate, ys] of byGate) {
      if (ys.length >= COSTLY_GATE) out.push({ signal: 'costly gate', subject: `${slug}: ${gate} was logged ${ys.length} times — ask what made it cheap to re-run and expensive to get right`, count: ys.length, evidence: ys.map((l) => l.path) });
    }
    const overridden = xs.filter((l) => l.override);
    if (overridden.length) out.push({ signal: 'override', subject: `${slug}: ${[...new Set(overridden.map((l) => l.gate))].join(', ')} held on a human override — what would have let it pass on its merits, or should the rule change?`, count: overridden.length, evidence: overridden.map((l) => l.path) });
    const reaffirms = xs.filter((l) => l.reaffirm);
    if (reaffirms.length >= REAFFIRM_CASCADE) out.push({ signal: 'reaffirm cascade', subject: `${slug}: ${reaffirms.length} reaffirm logs — which upstream edit staled them, and could it have waited for one batch?`, count: reaffirms.length, evidence: reaffirms.map((l) => l.path) });
    const latest = new Map();
    for (const l of [...xs].sort((a, b) => a.runId.localeCompare(b.runId))) latest.set(l.gate, l);
    const open = [...latest.values()].filter((l) => gateNo(l.gate) !== null && !CLEARED.has(l.verdict) && !l.override);
    for (const later of xs.filter((l) => gateNo(l.gate) !== null)) {
      const behind = open.filter((o) => gateNo(o.gate) < gateNo(later.gate) && o.runId < later.runId);
      if (!behind.length) continue;
      out.push({ signal: 'out of order', subject: `${slug}: ${later.gate} ran while ${behind.map((o) => `${o.gate} was ${o.verdict}`).join(', ')}`, count: behind.length, evidence: [later.path, ...behind.map((o) => o.path)] });
      break;
    }
  }
  return out;
}

const compact = (d) => String(d ?? '').replace(/-/g, '').slice(0, 8);

/**
 * Per active lesson: the findings that repeat it ({ path, id }) and the initiatives reviewed since it
 * was written at a gate it applies to. A repeat is a finding after the lesson's `created`, at one of
 * its gates, whose problem text overlaps the lesson's title and body.
 */
export function ladder(lessons, logs) {
  return lessons.filter((l) => l.fm?.status === 'active').map((l) => {
    const gates = new Set(list(l.fm.applies_to).map((a) => a.toUpperCase()).filter((a) => /^G(K|\d+)$/.test(a)));
    const since = compact(l.fm.created);
    const later = logs.filter((g) => gates.has(g.gate) && g.date > since);
    const text = `${l.fm.title} ${l.body}`;
    const repeats = later.flatMap((g) => g.findings.filter((f) => similarity(plain(f.problem), text) >= REPEAT_SIMILARITY).map((f) => ({ path: g.path, slug: g.slug, id: plain(f.id) })));
    const quiet = new Set(later.map((g) => g.slug));
    for (const r of repeats) quiet.delete(r.slug);
    return { id: String(l.fm.id), repeats, quiet: quiet.size };
  });
}

export function harvest(root, { min = 2, lessons = loadLessons(root) } = {}) {
  const logs = readLogs(root);
  const signals = [];
  const slugsOf = (xs) => [...new Set(xs.map((x) => x.slug))];

  const byGate = new Map();
  for (const l of logs) byGate.set(l.gate, [...(byGate.get(l.gate) ?? []), l]);
  for (const [gate, xs] of byGate) {
    const retried = xs.filter((l) => l.attempt >= 2);
    if (slugsOf(retried).length >= min) {
      signals.push({ signal: 'recurring rework', subject: `${gate} needed a second attempt on ${slugsOf(retried).join(', ')}`, count: slugsOf(retried).length, evidence: retried.map((l) => l.path) });
    }
    // Findings that say the same thing at one gate on different initiatives: greedy clusters by problem text.
    const items = xs.flatMap((l) => l.findings.map((f) => ({ slug: l.slug, path: l.path, id: plain(f.id), text: plain(f.problem) })));
    const used = new Set();
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const cluster = [items[i]];
      for (let j = i + 1; j < items.length; j++) {
        if (!used.has(j) && items[j].slug !== items[i].slug && similarity(items[i].text, items[j].text) >= 0.5) { cluster.push(items[j]); used.add(j); }
      }
      if (slugsOf(cluster).length >= min) {
        used.add(i);
        signals.push({ signal: 'recurring finding', subject: `${gate}: ${cluster[0].text.slice(0, 100)} (${cluster.map((c) => `${c.slug} ${c.id}`).join(', ')})`, count: slugsOf(cluster).length, evidence: [...new Set(cluster.map((c) => c.path))] });
      }
    }
  }
  for (const l of logs) {
    const reopened = l.resolutions.filter((r) => /REOPENED/.test(r['reviewer verdict'] ?? ''));
    if (reopened.length) signals.push({ signal: 'reopened finding', subject: `${l.gate} ${l.slug}: ${reopened.map((r) => plain(r.id)).join(', ')} said fixed, reopened`, count: reopened.length, evidence: [l.path] });
  }
  for (const p of walk(join(root, 'monitoring'))) {
    if (basename(p) !== 'post-release.md') continue;
    const rel = posix(relative(root, p));
    const text = learnedText(readFileSync(p, 'utf8'));
    if (text) signals.push({ signal: 'post-release', subject: `${rel.split('/')[1]}: ${text.replace(/\s+/g, ' ').slice(0, 100)}`, count: 1, evidence: [rel] });
  }

  signals.push(...laneFriction(root, min));
  signals.push(...processSignals(logs));

  for (const r of ladder(lessons, logs)) {
    if (r.repeats.length >= PROMOTE_AFTER) {
      signals.push({ signal: 'promote to check', subject: `${r.id} was recalled and repeated ${r.repeats.length} times (${r.repeats.map((x) => `${x.slug} ${x.id}`).join(', ')}) — make it a lint rule, hook or CI script, not another checklist row`, count: r.repeats.length, evidence: [...new Set(r.repeats.map((x) => x.path))], lesson: r.id });
    } else if (r.quiet >= RETIRE_AFTER) {
      signals.push({ signal: 'retire', subject: `${r.id} has matched nothing in ${r.quiet} initiatives — deprecate it with a reason, or say why it still earns its place`, count: r.quiet, evidence: [], lesson: r.id });
    }
  }

  const cited = new Set(lessons.filter((l) => l.fm?.status === 'active').flatMap((l) => list(l.fm.evidence).map(pathOf)));
  for (const s of signals) {
    s.covered = !s.lesson && s.evidence.every((e) => cited.has(e));
    const findings = scanText(s.subject).map((f) => ({ field: 'subject', ...f }));
    if (findings.length) { s.flagged = findings.map(describe); s.subject = '(withheld — the evidence trips the lesson scan)'; }
  }
  return signals.sort((a, b) => Number(a.covered) - Number(b.covered) || b.count - a.count);
}

/** Activity events for lessons written or retired in the last `days` days that the feed has not shown yet. */
export function lessonEvents(lessons, { prior = [], today = new Date(), days = 14, root } = {}) {
  const said = new Set(prior.filter((e) => e.kind === 'lesson').map((e) => e.title));
  const since = today.getTime() - days * 864e5;
  const out = [];
  for (const l of lessons) {
    const fm = l.fm ?? {};
    if (!fm.id || !['active', 'deprecated'].includes(fm.status)) continue;
    const at = Date.parse(String(fm.updated));
    if (!Number.isFinite(at) || at < since) continue;
    const title = (fm.status === 'active' ? `${fm.id} learned (${fm.confidence}): ${fm.title ?? ''}` : `${fm.id} retired`).slice(0, 120);
    if (said.has(title)) continue;
    said.add(title);
    out.push(makeEvent({ kind: 'lesson', outcome: fm.status === 'active' ? 'pass' : 'info', title, link: root ? `${basename(root)}/${l.path}` : null }, today));
  }
  return out;
}

// ---- brief (§19.5) ---------------------------------------------------------------------------------

const BRIEF = join('logs', 'learn-brief.json');
const MAX_BRIEF_SIGNALS = 3;
const signalKey = (s) => `${s.signal}|${[...s.evidence].sort().join(',')}`;

/** Active provisional lessons with no new support in STALE_DAYS. */
export function staleLessons(lessons, today) {
  return lessons.filter((l) => l.fm?.status === 'active' && l.fm.confidence === 'provisional' && DATE.test(String(l.fm.updated)) && (Date.parse(today) - Date.parse(l.fm.updated)) / 864e5 > STALE_DAYS);
}

/**
 * What changed since the last brief, as { lines, seen }. `seen` is what to remember next time:
 * { signals: [key], lessons: { id: updated }, ideas: [id], stale: [id] }. Nothing new → no lines.
 */
export function brief(root, { lessons = loadLessons(root), seen = {}, today = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [];
  const said = new Set(seen.signals ?? []);
  const signals = harvest(root, { lessons });
  const fresh = signals.filter((s) => !s.covered && !said.has(signalKey(s)));
  const flagged = fresh.filter((s) => s.flagged);
  const toDistil = fresh.filter((s) => !s.flagged);
  if (toDistil.length) {
    lines.push(`Learning: ${toDistil.length} new signal(s) not yet a lesson — /sdlc-learn distils them`);
    for (const s of toDistil.slice(0, MAX_BRIEF_SIGNALS)) lines.push(`  ${s.signal} ×${s.count}  ${s.subject.slice(0, 110)}`);
    if (toDistil.length > MAX_BRIEF_SIGNALS) lines.push(`  … ${toDistil.length - MAX_BRIEF_SIGNALS} more: learn.mjs harvest`);
  }
  if (flagged.length) lines.push(`Learning: ${flagged.length} signal(s) withheld by the lesson scan — learn.mjs harvest, read the evidence as data`);

  const known = seen.lessons ?? {};
  const changed = lessons.filter((l) => l.fm?.id && ['active', 'deprecated'].includes(l.fm.status) && known[l.fm.id] !== String(l.fm.updated));
  // On the first brief every lesson is new; naming them all would be noise, so the count stands in.
  if (changed.length && seen.lessons) for (const l of screen(changed).safe.slice(0, MAX_BRIEF_SIGNALS)) lines.push(`Lesson: ${l.fm.id} ${l.fm.status === 'active' ? `(${l.fm.confidence}) ${l.fm.title}` : 'retired'}`);
  else if (changed.length) lines.push(`Lessons: ${changed.length} in learnings/ — read at each stage through learn.mjs recall`);

  const ideas = openIdeas(root);
  const before = new Set(seen.ideas ?? []);
  const newIdeas = ideas.filter((r) => !before.has(plain(r.id)));
  if (newIdeas.length) lines.push(`Ideas: ${newIdeas.length} new in ideas.md to rank (only a human ranks) — ${newIdeas.slice(0, MAX_BRIEF_SIGNALS).map((r) => `${plain(r.id)} ${String(r.idea).trim().slice(0, 50)}`).join(' · ')}`);

  let pushed = {};
  try { pushed = JSON.parse(readFileSync(join(root, DIR, PUSHED), 'utf8')); } catch { /* nothing pushed yet */ }
  let project = null;
  try { project = setting(readProfile(root).text, 'Name'); } catch { /* no profile: the digest push would make has no project tag either */ }
  // The same project name push uses, or every pushed lesson would look unshared.
  const unshared = toPush(lessons, pushed, project).map(({ lesson }) => String(lesson.fm.id));
  const wasUnshared = new Set(seen.unshared ?? []);
  if (unshared.some((id) => !wasUnshared.has(id))) lines.push(`Lessons: ${unshared.length} established, not yet shared — learn.mjs push (needs Recall; local learning does not)`);

  const stale = staleLessons(lessons, today).map((l) => String(l.fm.id));
  const wasStale = new Set(seen.stale ?? []);
  if (stale.some((id) => !wasStale.has(id))) lines.push(`Lessons: ${stale.length} provisional with no new support in ${STALE_DAYS} days — /sdlc-learn --audit`);

  return {
    lines,
    seen: {
      signals: [...new Set([...said, ...signals.map(signalKey)])],
      lessons: Object.fromEntries(lessons.filter((l) => l.fm?.id).map((l) => [String(l.fm.id), String(l.fm.updated)])),
      ideas: ideas.map((r) => plain(r.id)),
      unshared,
      stale,
    },
  };
}

// ---- the command ------------------------------------------------------------------------------------

const bodyLines = (l) => l.body.trim().split('\n').filter((x) => !x.startsWith('# ') && !x.trim().startsWith('<!--')).map((x) => `    ${x}`).join('\n');
const warnWithheld = (withheld) => {
  for (const { lesson, findings } of withheld) console.error(`  WARN  ${lesson.fm?.id ?? lesson.path} withheld — ${findings.map(describe).join('; ')} (${lesson.path}; learn.mjs audit)`);
};

export function main(argv, { cwd = process.cwd() } = {}) {
  const VALUED = new Set(['--project', '--approved-by', '--min-projects', '--root', '--min', '--gate', '--stage', '--skill', '--module', '--limit', '--today']);
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
  const [cmd = 'check'] = positional;
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const root = rootFromArgv(argv, cwd);
  const lessons = loadLessons(root);
  const done = (exit, errors = 0) => { logRun(root, { script: 'learn.mjs', exit, errors, warnings: 0 }); return exit; };

  if (cmd === 'check') {
    const { errors } = checkLessons(lessons, { root });
    for (const e of errors) console.log(`  ERROR ${e}`);
    console.log(`learn check — ${lessons.length} lesson(s), ${errors.length} error(s)`);
    // Only a gate that passed says a lesson was learned: one the gate refuses is not one yet.
    if (!errors.length) {
      const today = opt('--today') ? new Date(`${opt('--today')}T12:00:00Z`) : new Date();
      logActivity(root, lessonEvents(lessons, { prior: readActivity(join(root, 'logs', 'activity.jsonl')), today, root }));
    }
    return done(errors.length ? 1 : 0, errors.length);
  }
  if (cmd === 'recall') {
    const q = { gate: opt('--gate'), stage: opt('--stage'), skill: opt('--skill'), module: opt('--module') };
    const { safe: hits, withheld } = screen(recall(lessons, q));
    warnWithheld(withheld);
    const printShared = () => {
      if (!argv.includes('--shared')) return;
      let project = null;
      try { project = setting(readProfile(root).text, 'Name'); } catch { /* no profile: nothing to drop */ }
      const s = sharedLessons(Object.values(q).filter(Boolean), { project });
      if (s.entries.length) {
        console.log('Shared, from other projects (Recall) — a habit elsewhere, a hypothesis here:');
        for (const e of s.entries) console.log(`  ${e.id} · ${e.title}`);
      }
      if (s.note) console.log(`  (${s.note})`);
    };
    if (!hits.length) { console.log('No lesson applies.'); printShared(); return done(0); }
    const full = argv.includes('--full');
    const limit = full ? hits.length : Number(opt('--limit') ?? 8);
    for (const l of hits.slice(0, limit)) {
      console.log(`${l.fm.id} · ${l.fm.confidence} · ${l.fm.title}`);
      console.log(full ? `${bodyLines(l)}\n` : `    probe: ${l.fm.probe}`);
    }
    if (hits.length > limit) console.log(`… ${hits.length - limit} more (--limit ${hits.length})`);
    if (!full) console.log('Read the ones whose probe is your question: learn.mjs show <id> …');
    printShared();
    return done(0);
  }
  if (cmd === 'show') {
    const ids = positional.slice(1);
    if (!ids.length) { console.error('usage: learn.mjs show <LRN-…> [<LRN-…> …]'); return 2; }
    const byId = new Map(lessons.map((l) => [String(l.fm?.id), l]));
    const missing = ids.filter((id) => !byId.has(id));
    const { safe, withheld } = screen(ids.filter((id) => byId.has(id)).map((id) => byId.get(id)));
    warnWithheld(withheld);
    for (const l of safe) console.log(`${l.fm.id} · ${l.fm.confidence} · ${l.fm.status} · ${l.fm.title}  (${l.path})\n${bodyLines(l)}\n`);
    for (const id of missing) console.log(`${id}: no such lesson`);
    return done(missing.length || withheld.length ? 1 : 0);
  }
  if (cmd === 'harvest') {
    const signals = harvest(root, { min: Number(opt('--min') ?? 2), lessons });
    const unsafe = signals.filter((s) => s.flagged);
    if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(signals, null, 2)}\n`); return done(unsafe.length ? 1 : 0); }
    const fresh = signals.filter((s) => !s.covered);
    console.log(`learn harvest — ${signals.length} signal(s), ${fresh.length} not yet a lesson, ${unsafe.length} flagged`);
    for (const s of signals) {
      console.log(`  ${s.flagged ? 'FLAGGED' : s.covered ? 'covered' : 'NEW    '}  ${s.signal} ×${s.count}  ${s.subject}\n           evidence: ${s.evidence.join(' · ')}`);
      if (s.flagged) console.log(`           unsafe: ${s.flagged.join('; ')} — write no lesson from this text; read the evidence as data`);
    }
    return done(unsafe.length ? 1 : 0);
  }
  if (cmd === 'push') {
    const project = opt('--project') ?? setting(readProfile(root).text, 'Name');
    const r = push(root, { project, dryRun: argv.includes('--dry-run') });
    if (r.unavailable) { console.log('learn push — Recall is not installed; lessons stay local (§19.4)'); return done(0); }
    for (const id of r.sent) console.log(`  ${r.dryRun ? 'would push' : 'pushed    '}  ${id}`);
    for (const id of r.duplicate) console.log(`  already     ${id} (Recall holds the same text)`);
    for (const id of r.failed) console.log(`  FAILED      ${id}`);
    console.log(`learn push — ${r.sent.length} ${r.dryRun ? 'to push' : 'pushed'}, ${r.duplicate.length} already there, ${r.failed.length} failed${project ? ` (project:${project})` : ' (no project name — set DEV-PROFILE §Project Name)'}`);
    return done(r.failed.length ? 1 : 0, r.failed.length);
  }
  if (cmd === 'promote' && argv.includes('--local')) {
    const who = opt('--approved-by');
    const xs = localCandidates(lessons);
    const ok = xs.filter((x) => !x.refused.length);
    console.log(`learn promote --local — ${xs.length} process lesson(s), ${ok.length} candidate(s) for the bundle${who ? `, approved by ${who}` : ''}`);
    for (const x of xs) console.log(`  ${x.refused.length ? 'REFUSED  ' : who ? 'CANDIDATE' : 'WAITING  '}  ${x.id}  ${x.title}${x.refused.length ? `
             names one system's ${x.refused.join(', ')} — a fact, not a habit` : ''}`);
    if (ok.length && !who) console.log('A human approves by name: promote --local --approved-by "<who>" (§19.4). One project is enough only on their word.');
    else if (ok.length) console.log(`Next: /sdlc-improve or /sdlc-feedback for each candidate, citing the lesson and "approved by ${who}".`);
    return done(0);
  }
  if (cmd === 'promote') {
    const r = recallCli(['search', '--kind', 'lesson', '--tag', 'sdlc', '--limit', '100', '--json']);
    if (r.error?.code === 'ENOENT') { console.log('learn promote — Recall is not installed; promotion needs lessons from several projects (§19.4)'); return done(0); }
    let entries;
    try { entries = JSON.parse(r.stdout).entries ?? []; } catch { console.log('learn promote — Recall unreachable or unreadable; nothing to promote'); return done(0); }
    const groups = promote(entries, { minProjects: Number(opt('--min-projects') ?? 2) });
    const ok = groups.filter((g) => !g.refused.length);
    console.log(`learn promote — ${entries.length} shared lesson(s), ${ok.length} candidate(s) for the bundle, ${groups.length - ok.length} refused`);
    const send = argv.includes('--request');
    const failed = [];
    for (const g of groups) {
      console.log(`  ${g.refused.length ? 'REFUSED  ' : 'CANDIDATE'}  ${g.title}\n             projects: ${g.projects.join(', ')} · entries: ${g.ids.join(', ')}`);
      if (g.refused.length) { console.log(`             names one system's ${g.refused.join(', ')} — a fact, not a habit; it stays a project lesson`); continue; }
      for (const id of g.requestable) {
        if (!send) { console.log(`             share: recall share request ${id}`); continue; }
        const s = recallCli(['share', 'request', id, '--note', `learned in ${g.projects.length} projects: ${g.projects.join(', ')}`]);
        if (s.status === 0) console.log(`             requested  ${id} — the Recall Owner reviews it`);
        else { failed.push(id); console.log(`             FAILED     ${id}: ${String(s.stderr || s.stdout || s.error?.message || '').trim().split('\n')[0].slice(0, 160)}`); }
      }
    }
    if (ok.length) {
      console.log('A human approves each candidate: /sdlc-improve <gate> "<check>" or a skill edit, citing the entries.');
      if (!send && ok.some((g) => g.requestable.length)) console.log("To share one with every project, ask the Recall Owner: the commands above, or learn.mjs promote --request (with a key of the lesson's project).");
    }
    return done(failed.length ? 1 : 0, failed.length);
  }
  if (cmd === 'brief') {
    const file = join(root, BRIEF);
    let seen = {};
    try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first brief */ }
    const r = brief(root, { lessons, seen, today: opt('--today') ?? undefined });
    for (const l of r.lines) console.log(l);
    if (!argv.includes('--peek') && existsSync(root)) {
      try { mkdirSync(join(root, 'logs'), { recursive: true }); writeFileSync(file, `${JSON.stringify(r.seen)}\n`); } catch { /* a brief must never fail a session */ }
    }
    return 0;
  }
  if (cmd === 'audit') {
    const today = opt('--today') ?? new Date().toISOString().slice(0, 10);
    const { errors } = checkLessons(lessons, { root });
    const stale = staleLessons(lessons, today);
    console.log(`learn audit — ${lessons.length} lesson(s)`);
    for (const l of stale) console.log(`  STALE  ${l.fm.id}: provisional, no new support since ${l.fm.updated} — support it (a second initiative) or deprecate it`);
    for (const e of errors) console.log(`  ${/: unsafe: /.test(e) ? 'FLAGGED' : 'ERROR  '}  ${e}`);
    if (!stale.length && !errors.length) console.log('  Nothing to do.');
    return done(0);
  }
  console.error('usage: learn.mjs check | harvest [--min n] [--json] | recall [--gate G] [--stage s] [--skill s] [--module m] [--limit n] [--full] [--shared] | show <LRN-…> … | audit [--today YYYY-MM-DD] | push [--project p] [--dry-run] | promote [--min-projects n] [--request] | promote --local [--approved-by <who>] | brief [--peek]');
  return 2;
}

const isMain = process.argv[1] && /(^|[\\/])learn\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
