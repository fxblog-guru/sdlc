/**
 * The realtime layer: what has happened since `state.json` was last written.
 *
 * The index is rebuilt at the end of a command and on the Stop hook. An agent working a G7 lane or a
 * G8 run for three hours writes progress rows, lane notes, gate logs and commits the whole time, and
 * none of that reached the board until the command ended. This file reads those files directly,
 * cheaply, and lays what they say over the index:
 *
 * - **task status** from `progress.md` (last row wins, §8.1), when that file is newer than the index;
 * - **decision status** from the ledger, under the same condition;
 * - **a gate's verdict** from a gate log newer than the one the index recorded — §8 says the gate
 *   logs are right when the two disagree, so copying the log's own `verdict` is not a derivation;
 * - **work in progress** inferred from a verification run, lane notes or a progress row written
 *   after the index, shown as *inferred* and never as a verdict;
 * - **an activity feed** of commits (from `.git/logs/HEAD`, so no git process) and of those files.
 *
 * It still decides nothing the builder decides — no staleness, no unlocks, no thresholds. Every
 * overlay carries a note saying where it came from, and the next rebuild replaces it.
 *
 * Like `viewmodel.ts`, this file must not import `vscode`: the tests run it under plain Node.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ActivityEvent, parseActivity } from './activity';
import { GateState, State } from './model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reltime: { relativeTime(at: number | string, now?: number): string } = require('../media/reltime.js');

/** Shared with the page, so the host and the board never disagree about "2 min ago". */
export function relativeTime(at: number | string, now?: number): string {
  return reltime.relativeTime(at, now);
}

// ---- classifying a file event -------------------------------------------------------------------

export type LiveKind = 'state' | 'progress' | 'gate-log' | 'verification' | 'lane' | 'decision' | 'git';

/**
 * Which source a changed path belongs to, or null for one the board does not read. `rel` is
 * relative to the project root, with either separator. Any dot segment other than the `.git`
 * directory is ignored — `.claude/worktrees` holds agent copies of the same files, and
 * `.reaffirm-*.diff` beside the gate logs is the reaffirm tool's scratch, not a review.
 */
export function classify(rel: string, devRoot = 'dev'): LiveKind | null {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === '.git') {
    const tail = parts.slice(1).join('/');
    return tail === 'HEAD' || tail === 'logs/HEAD' || tail.startsWith('refs/heads/') ? 'git' : null;
  }
  const dev = devRoot.replace(/\\/g, '/').split('/').filter(Boolean);
  if (dev.some((d, n) => parts[n] !== d)) return null;
  // The root itself may be a dot folder (`.sdlc`, §2); a dot segment anywhere else is a copy or scratch.
  const p = parts.slice(dev.length);
  if (p.some((s) => s.startsWith('.'))) return null;
  if (p.length === 1 && p[0] === 'state.json') return 'state';
  if (p[0] === 'implementation' && p.length === 3 && p[2] === 'progress.md') return 'progress';
  if (p[0] === 'implementation' && p.length === 4 && p[2] === 'lanes' && p[3].endsWith('.md')) return 'lane';
  if (p[0] === 'reviews' && p.length === 3 && /^G\w*-.+\.md$/.test(p[2])) return 'gate-log';
  if (p[0] === 'verification' && p.length >= 4 && p[2] === 'runs') return 'verification';
  if (p[0] === 'decisions' && p.length === 2 && p[1].endsWith('.md')) return 'decision';
  return null;
}

// ---- timing ---------------------------------------------------------------------------------------

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * Collects events and flushes them once the burst is over. A lane merge rewrites a dozen files in
 * a second; the board should redraw once, after the last of them, with every kind that changed.
 * `maxWait` bounds the delay, so a file rewritten every 200 ms still redraws about once a second.
 */
export class Debouncer<K> {
  private pending = new Set<K>();
  private handle: unknown;
  private firstAt: number | undefined;

  constructor(
    private readonly flush: (kinds: Set<K>) => void,
    private readonly waitMs = 300,
    private readonly timers: Timers = realTimers,
    private readonly maxWaitMs = 1500,
  ) {}

  push(kind: K): void {
    this.pending.add(kind);
    const now = this.timers.now();
    this.firstAt ??= now;
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    const wait = Math.max(0, Math.min(this.waitMs, this.firstAt + this.maxWaitMs - now));
    this.handle = this.timers.setTimeout(() => this.fire(), wait);
  }

  /** Flush now, if anything is waiting. */
  fire(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.firstAt = undefined;
    if (!this.pending.size) return;
    const kinds = this.pending;
    this.pending = new Set();
    this.flush(kinds);
  }

  dispose(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.pending.clear();
  }
}

/**
 * Runs a task at most once per `intervalMs`, with one trailing run for requests that arrived inside
 * the window, and never two at once. Used for the optional background `build-state.mjs`.
 */
export class Throttle {
  private lastStart = -Infinity;
  private running = false;
  private queued = false;
  private handle: unknown;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly timers: Timers = realTimers,
  ) {}

  request(): void {
    if (this.running || this.handle !== undefined) {
      this.queued = true;
      return;
    }
    const wait = this.lastStart + this.intervalMs - this.timers.now();
    if (wait > 0) {
      this.handle = this.timers.setTimeout(() => {
        this.handle = undefined;
        void this.start();
      }, wait);
      return;
    }
    void this.start();
  }

  private async start(): Promise<void> {
    this.running = true;
    this.queued = false;
    this.lastStart = this.timers.now();
    try {
      await this.task();
    } catch {
      // A failed rebuild leaves the old index in place; the board keeps showing the live overlay.
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        this.request();
      }
    }
  }

  dispose(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle);
    this.handle = undefined;
    this.queued = false;
  }
}

// ---- reading the sources --------------------------------------------------------------------------

export interface ProgressRow {
  status: string;
  commit: string | null;
  note: string | null;
}

const STATUSES = new Set(['todo', 'in-progress', 'blocked', 'done']);

/** Splits one markdown table row, keeping escaped pipes inside cells. */
function cells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return body.split(/(?<!\\)\|/).map((c) => c.trim());
}

/**
 * The `progress.md` table (§8.1): last row per task wins, `in_progress` accepted as a spelling.
 * Columns are found by header name, so a Source column or a reordered table still reads.
 */
export function parseProgress(text: string): Map<string, ProgressRow> {
  const out = new Map<string, ProgressRow>();
  let col: { task: number; status: number; commit: number; note: number } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      col = undefined;
      continue;
    }
    const c = cells(line);
    if (!col) {
      const h = c.map((x) => x.toLowerCase());
      if (h.includes('task') && h.includes('status')) {
        col = { task: h.indexOf('task'), status: h.indexOf('status'), commit: h.indexOf('commit'), note: h.indexOf('note') };
      }
      continue;
    }
    if (/^:?-+:?$/.test(c[0] ?? '')) continue;
    const id = c[col.task];
    const status = (c[col.status] ?? '').toLowerCase().replace('in_progress', 'in-progress');
    if (!/^TASK-\d+$/.test(id ?? '') || !STATUSES.has(status)) continue;
    const dash = (v: string | undefined): string | null => (v && v !== '—' && v !== '-' ? v : null);
    out.set(id, { status, commit: dash(c[col.commit]), note: dash(c[col.note]) });
  }
  return out;
}

export interface LedgerRow {
  status: string;
  answer: string | null;
}

/** The decision ledger (§15.2): status and answer per DEC id, by header name. */
export function parseLedger(text: string): Map<string, LedgerRow> {
  const out = new Map<string, LedgerRow>();
  let col: { id: number; status: number; answer: number } | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      col = undefined;
      continue;
    }
    const c = cells(line);
    if (!col) {
      const h = c.map((x) => x.toLowerCase());
      if (h.includes('id') && h.includes('status')) col = { id: h.indexOf('id'), status: h.indexOf('status'), answer: h.indexOf('answer') };
      continue;
    }
    const id = c[col.id];
    if (!/^DEC-\d+$/.test(id ?? '')) continue;
    const answer = col.answer >= 0 ? c[col.answer] : undefined;
    out.set(id, { status: (c[col.status] ?? '').toLowerCase(), answer: answer && answer !== '—' ? answer : null });
  }
  return out;
}

export interface LogHead {
  gate: string;
  runId: string;
  attempt: number;
  verdict: string | null;
  scope: string | null;
}

/** The handful of front-matter keys the overlay needs, from the top of a gate log (§5.1). */
export function parseLogHead(text: string): LogHead | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return undefined;
  const get = (key: string): string | null => {
    const r = new RegExp(`^${key}:\\s*(.*?)\\s*(?:#.*)?$`, 'm').exec(m[1]);
    return r && r[1] && r[1] !== 'null' ? r[1].replace(/^["']|["']$/g, '') : null;
  };
  const gate = get('gate');
  const runId = get('run_id');
  if (!gate || !runId) return undefined;
  return { gate, runId, attempt: Number.parseInt(get('attempt') ?? '1', 10) || 1, verdict: get('verdict'), scope: get('scope') };
}

/** One finding row of a gate log, for the severity chips. */
export interface FindingRow {
  id: string;
  severity: string;
  problem: string;
}

/** The `## Findings` table of a gate log: id, severity, and the problem cut to its first sentence. */
export function parseFindings(text: string): Map<string, FindingRow> {
  const out = new Map<string, FindingRow>();
  const section = /^## Findings\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!section) return out;
  let col: { id: number; sev: number; problem: number } | undefined;
  for (const line of section[1].split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const c = cells(line);
    if (!col) {
      const h = c.map((x) => x.toLowerCase());
      col = { id: h.indexOf('id'), sev: h.indexOf('severity'), problem: h.indexOf('problem') };
      if (col.id < 0 || col.sev < 0) return out;
      continue;
    }
    const id = c[col.id];
    if (!/^CR-\d+$/.test(id ?? '')) continue;
    const raw = (col.problem >= 0 ? c[col.problem] : '') ?? '';
    const plain = raw.replace(/<br\s*\/?>/gi, ' ').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
    // The first sentence, or the first two when the first is only a lead-in ("Carried, and narrowed.").
    const m = /^(.+?[.!?])(?:\s+(.+?[.!?]))?(?:\s|$)/.exec(plain);
    const first = m ? (m[1].length < 48 && m[2] ? `${m[1]} ${m[2]}` : m[1]) : plain;
    out.set(id, { id, severity: (c[col.sev] ?? '').toLowerCase(), problem: first.length > 180 ? `${first.slice(0, 177)}…` : first });
  }
  return out;
}

export interface Commit {
  sha: string;
  subject: string;
  at: number;
  kind: string;
}

/**
 * The newest commits from the reflog. Reading `.git/logs/HEAD` costs one file read and no process,
 * and every commit, merge and amend in the working copy lands there the moment it is made.
 */
export function parseReflog(text: string, limit = 10): Commit[] {
  const out: Commit[] = [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let n = lines.length - 1; n >= 0 && out.length < limit; n--) {
    const m = /^[0-9a-f]{40} ([0-9a-f]{40}) .*? (\d{9,}) [+-]\d{4}\t([^:]+): ?(.*)$/.exec(lines[n]);
    if (!m) continue;
    const kind = m[3].trim();
    if (!kind.startsWith('commit') && !kind.startsWith('merge')) continue;
    out.push({ sha: m[1].slice(0, 7), subject: kind.startsWith('merge') && !kind.startsWith('commit') ? `Merge ${kind.slice(6)}` : m[4], at: Number(m[2]) * 1000, kind });
  }
  return out;
}

/** The git directory that owns `root`, following a worktree's `.git` file. Looks a few levels up. */
export function findGitDir(root: string): string | undefined {
  let dir = root;
  for (let n = 0; n < 6; n++) {
    const candidate = path.join(dir, '.git');
    try {
      const st = fs.statSync(candidate);
      if (st.isDirectory()) return candidate;
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(candidate, 'utf8'));
      if (m) return path.resolve(dir, m[1].trim());
    } catch {
      // keep looking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ---- the snapshot ---------------------------------------------------------------------------------

export type ActivityKind = 'commit' | 'task' | 'gate-log' | 'verification' | 'lane' | 'decision' | 'state' | 'progress' | 'run' | 'stop' | 'gate';

export interface ActivityItem {
  kind: ActivityKind;
  title: string;
  detail: string | null;
  at: number;
  path: string | null;
  slug: string | null;
}

export interface GateOverlay {
  state: GateState;
  /** Where it came from, always shown: an overlay is never mistaken for the builder's verdict. */
  note: string;
  /** `log` = a verdict copied from a gate log; `inferred` = work seen in progress, no verdict. */
  source: 'log' | 'inferred';
  log: string | null;
  attempt: number | null;
}

export interface SlugLive {
  tasks: Map<string, ProgressRow>;
  tasksFromProgress: boolean;
  decisions: Map<string, LedgerRow>;
  decisionsFromLedger: boolean;
  gates: Map<string, GateOverlay>;
  findings: Map<string, FindingRow>;
}

export interface LiveSnapshot {
  /** Events from `<root>/logs/activity.jsonl` (docs/activity-format.md), newest first. */
  events: ActivityEvent[];
  branch: string | null;
  head: string | null;
  slugs: Map<string, SlugLive>;
  activity: ActivityItem[];
  /** Newest file or commit time the snapshot saw — what the "last event" line names. */
  lastEventAt: number | null;
  /** True when anything the board shows came from files newer than the index. */
  ahead: boolean;
}

interface FileCache {
  mtime: number;
  size: number;
  value: unknown;
}

const VERDICT_STATE: Record<string, GateState> = {
  PASS: 'PASS',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
};

const ORDER_WORKING: GateState[] = ['NOT_STARTED', 'READY', 'AUTHORING', 'REVIEWING'];

/**
 * Reads the live sources for every initiative in the index. Files are re-parsed only when their
 * mtime or size moved, so a redraw after one progress row costs a few `stat` calls and one read.
 */
export class LiveReader {
  private readonly cache = new Map<string, FileCache>();
  /** Task transitions seen between two reads of progress.md — "TASK-095 done", with when we saw it. */
  private readonly transitions: ActivityItem[] = [];
  private lastProgress = new Map<string, Map<string, ProgressRow>>();

  constructor(
    private readonly devRoot = 'dev',
    private readonly clock: () => number = Date.now,
  ) {}

  private read<T>(file: string, parse: (text: string) => T): { value: T; mtime: number } | undefined {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      this.cache.delete(`${parse.name}|${file}`);
      return undefined;
    }
    const key = `${parse.name}|${file}`;
    const hit = this.cache.get(key);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return { value: hit.value as T, mtime: st.mtimeMs };
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    const value = parse(text);
    this.cache.set(key, { mtime: st.mtimeMs, size: st.size, value });
    return { value, mtime: st.mtimeMs };
  }

  snapshot(projectRoot: string, state: State): LiveSnapshot {
    const generatedAt = Date.parse(state.generated_at);
    const indexAt = Number.isFinite(generatedAt) ? generatedAt : 0;
    const dev = path.join(projectRoot, this.devRoot);
    const rel = (abs: string): string => path.relative(projectRoot, abs).split(path.sep).join('/');
    const activity: ActivityItem[] = [];
    let ahead = false;

    // git — branch and the newest commits, from files only.
    let branch: string | null = null;
    let head: string | null = null;
    let headAt = 0;
    const gitDir = findGitDir(projectRoot);
    if (gitDir) {
      const h = this.read(path.join(gitDir, 'HEAD'), function gitHead(t) {
        return t.trim();
      });
      if (h) {
        const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(h.value);
        branch = ref ? ref[1] : null;
        head = ref ? null : h.value.slice(0, 7);
      }
      const log = this.read(path.join(gitDir, 'logs', 'HEAD'), function reflog(t) {
        return parseReflog(t, 10);
      });
      for (const c of log?.value ?? []) {
        headAt = Math.max(headAt, c.at);
        activity.push({ kind: 'commit', title: c.subject, detail: c.sha, at: c.at, path: null, slug: null });
      }
      if (!head && log?.value[0]) head = log.value[0].sha;
    }

    if (indexAt) activity.push({ kind: 'state', title: 'Index rebuilt', detail: `builder ${state.generator_version}`, at: indexAt, path: null, slug: null });

    const slugs = new Map<string, SlugLive>();
    for (const initiative of state.initiatives ?? []) {
      const slug = initiative.slug;
      const live: SlugLive = { tasks: new Map(), tasksFromProgress: false, decisions: new Map(), decisionsFromLedger: false, gates: new Map(), findings: new Map() };
      slugs.set(slug, live);
      const stage = (gate: string) => (initiative.stages ?? []).find((s) => s.gate === gate);

      // progress.md — task status, and transitions between two reads.
      const progressFile = path.join(dev, 'implementation', slug, 'progress.md');
      const progress = this.read(progressFile, parseProgress);
      let progressNewer = false;
      if (progress) {
        const before = this.lastProgress.get(slug);
        if (before) {
          for (const [id, row] of progress.value) {
            const was = before.get(id);
            if (!was || was.status !== row.status) {
              this.transitions.unshift({ kind: 'task', title: `${id} ${row.status}`, detail: row.note ?? row.commit, at: this.clock(), path: rel(progressFile), slug });
            }
          }
          if (this.transitions.length > 40) this.transitions.length = 40;
        } else {
          // First read: the newest row stands for the file's last change.
          const last = [...progress.value.entries()].pop();
          if (last) activity.push({ kind: 'progress', title: `${last[0]} ${last[1].status}`, detail: 'progress.md', at: progress.mtime, path: rel(progressFile), slug });
        }
        this.lastProgress.set(slug, progress.value);
        progressNewer = progress.mtime > indexAt + 1000;
        if (progressNewer) {
          live.tasks = progress.value;
          live.tasksFromProgress = true;
          ahead = true;
        }
      }

      // the decision ledger
      const ledgerFile = path.join(dev, 'decisions', `${slug}.md`);
      const ledger = this.read(ledgerFile, parseLedger);
      if (ledger) {
        if (ledger.mtime > indexAt + 1000) {
          live.decisions = ledger.value;
          live.decisionsFromLedger = true;
          ahead = true;
          activity.push({ kind: 'decision', title: 'Decision ledger updated', detail: `${[...ledger.value.values()].filter((d) => d.status === 'open').length} open`, at: ledger.mtime, path: rel(ledgerFile), slug });
        }
      }

      // gate logs — newest per gate by (run_id, attempt), and the findings of the logs in force.
      const reviewsDir = path.join(dev, 'reviews', slug);
      const logs: { file: string; head: LogHead; mtime: number }[] = [];
      for (const name of safeList(reviewsDir)) {
        if (name.startsWith('.') || !/^G\w*-.+\.md$/.test(name)) continue;
        const file = path.join(reviewsDir, name);
        const r = this.read(file, parseLogHead);
        if (r?.value) logs.push({ file, head: r.value, mtime: r.mtime });
      }
      for (const l of [...logs].sort((a, b) => b.mtime - a.mtime).slice(0, 6)) {
        activity.push({
          kind: 'gate-log',
          title: `${l.head.gate} ${l.head.scope ? `${l.head.scope} ` : ''}review log written`,
          detail: `attempt ${l.head.attempt}${l.head.verdict ? ` · ${l.head.verdict.replace(/_/g, ' ').toLowerCase()}` : ''}`,
          at: l.mtime,
          path: rel(l.file),
          slug,
        });
      }
      const newest = new Map<string, { file: string; head: LogHead; mtime: number }>();
      for (const l of logs) {
        if (l.head.scope) continue;
        const cur = newest.get(l.head.gate);
        if (!cur || l.head.runId > cur.head.runId || (l.head.runId === cur.head.runId && l.head.attempt > cur.head.attempt)) newest.set(l.head.gate, l);
      }
      for (const [gate, l] of newest) {
        const s = stage(gate);
        const known = s?.run_id ?? '';
        const knownAttempt = s?.attempt ?? 0;
        const isNewer = l.head.runId > known || (l.head.runId === known && l.head.attempt > knownAttempt);
        if (!isNewer || !l.head.verdict || !VERDICT_STATE[l.head.verdict]) continue;
        live.gates.set(gate, {
          state: VERDICT_STATE[l.head.verdict],
          note: `The gate log says ${l.head.verdict.replace(/_/g, ' ')}; the index has not been rebuilt since.`,
          source: 'log',
          log: rel(l.file),
          attempt: l.head.attempt,
        });
        ahead = true;
      }
      // Findings text for the logs in force: the index's own logs, or the newer one above.
      for (const s of initiative.stages ?? []) {
        const logRel = live.gates.get(s.gate)?.log ?? s.log;
        if (!logRel || !(s.open_findings ?? []).length) continue;
        const f = this.read(path.join(projectRoot, ...logRel.split('/')), parseFindings);
        for (const [id, row] of f?.value ?? []) live.findings.set(id, row);
      }

      // verification runs — G8 work in progress.
      const runsDir = path.join(dev, 'verification', slug, 'runs');
      const runs = safeList(runsDir)
        .filter((n) => !n.startsWith('.'))
        .map((n) => ({ id: n, verify: statMs(path.join(runsDir, n, 'verify.md')), dir: statMs(path.join(runsDir, n)) }))
        .filter((r) => r.dir > 0)
        .sort((a, b) => (b.id > a.id ? 1 : -1));
      for (const r of runs.slice(0, 3)) {
        activity.push({
          kind: 'verification',
          title: r.verify ? `G8 verify.md written` : `G8 verification run started`,
          detail: `run ${r.id}`,
          at: Math.max(r.verify, r.dir),
          path: r.verify ? `${this.devRoot}/verification/${slug}/runs/${r.id}/verify.md` : null,
          slug,
        });
      }
      const g8 = stage('G8');
      const latestRun = runs[0];
      if (latestRun && !live.gates.has('G8') && ORDER_WORKING.includes(g8?.state ?? 'NOT_STARTED') && latestRun.id > (g8?.run_id ?? '')) {
        live.gates.set('G8', {
          state: latestRun.verify ? 'REVIEWING' : 'AUTHORING',
          note: latestRun.verify
            ? `Inferred: run ${latestRun.id} wrote verify.md and no G8 log has followed yet.`
            : `Inferred: verification run ${latestRun.id} is in progress.`,
          source: 'inferred',
          log: latestRun.verify ? `${this.devRoot}/verification/${slug}/runs/${latestRun.id}/verify.md` : null,
          attempt: null,
        });
        ahead = true;
      }

      // lane notes — G7 work in progress.
      const lanesDir = path.join(dev, 'implementation', slug, 'lanes');
      const lanes = safeList(lanesDir)
        .filter((n) => /^lane-.+\.md$/.test(n))
        .map((n) => ({ name: n, mtime: statMs(path.join(lanesDir, n)) }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const l of lanes.slice(0, 3)) {
        activity.push({ kind: 'lane', title: `Lane ${l.name.replace(/^lane-|\.md$/g, '')} notes updated`, detail: 'G7 lane', at: l.mtime, path: `${this.devRoot}/implementation/${slug}/lanes/${l.name}`, slug });
      }
      const g7 = stage('G7');
      const laneNewer = (lanes[0]?.mtime ?? 0) > indexAt + 1000;
      // "Uncommitted" progress: a row written after the last commit, i.e. a task being worked now.
      const progressUncommitted = !!progress && progress.mtime > headAt + 1000 && headAt > 0;
      if (!live.gates.has('G7') && ORDER_WORKING.includes(g7?.state ?? 'NOT_STARTED') && (laneNewer || progressNewer || progressUncommitted)) {
        live.gates.set('G7', {
          state: 'AUTHORING',
          note: `Inferred: ${laneNewer ? 'lane notes' : 'progress.md'} changed after the index was built.`,
          source: 'inferred',
          log: null,
          attempt: null,
        });
        ahead = true;
      }
    }

    // The shared activity log: autonomy-run stops and gate events land in Activity and Needs you.
    const events = this.read(path.join(dev, 'logs', 'activity.jsonl'), parseActivity)?.value ?? [];
    for (const e of events.slice(0, 40)) {
      if (e.kind !== 'run' && e.kind !== 'stop') continue;
      activity.push({ kind: e.kind, title: e.title, detail: e.outcome, at: Date.parse(e.at), path: e.link ?? null, slug: e.slug });
    }

    activity.push(...this.transitions);
    activity.sort((a, b) => b.at - a.at);
    const dedup = dedupe(activity).slice(0, 40);
    return { events, branch, head, slugs, activity: dedup, lastEventAt: dedup[0]?.at ?? null, ahead };
  }
}

function dedupe(items: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.kind}|${i.title}|${i.detail}|${Math.round(i.at / 1000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeList(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function statMs(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The index with the live overlay applied: task and decision status replaced where their files are
 * newer. Gate overlays are not written into the stages — the view model shows them beside the
 * builder's state, so the two are never confused.
 */
export function applyLive(state: State, live: LiveSnapshot | undefined): State {
  if (!live) return state;
  return {
    ...state,
    initiatives: state.initiatives.map((i) => {
      const l = live.slugs.get(i.slug);
      if (!l) return i;
      return {
        ...i,
        tasks: l.tasksFromProgress
          ? (i.tasks ?? []).map((t) => {
              const row = l.tasks.get(t.id);
              if (!row || row.status === t.status) return t;
              return { ...t, status: row.status as typeof t.status, blocked_by: row.status === 'blocked' ? row.note ?? t.blocked_by : undefined };
            })
          : i.tasks,
        decisions: l.decisionsFromLedger
          ? (i.decisions ?? []).map((d) => {
              const row = l.decisions.get(d.id);
              return row && row.status !== d.status ? { ...d, status: row.status as typeof d.status, answer: row.answer ?? d.answer } : d;
            })
          : i.decisions,
      };
    }),
  };
}
