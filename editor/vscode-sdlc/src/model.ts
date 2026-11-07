/**
 * The extension's entire understanding of the pipeline lives in this file, and it is deliberately
 * thin: types that mirror DEV-CONTRACTS.md §8, a loader, and a staleness check.
 *
 * What is NOT here, and must never arrive here: parsing markdown, deriving a gate state, deciding
 * what blocks what, or judging anything. Those rules live in the bundle, are enforced by the
 * reviewers and `build-state.mjs`, and a second implementation in an editor plugin would drift from
 * them within weeks — silently, because nobody diffs a viewer against a contract.
 *
 * If this file ever needs a threshold or a verdict, the answer is a new field in state.json.
 */

import * as fs from 'fs';
import * as path from 'path';

/** The schema this build understands. An unknown schema is reported, never guessed at. */
export const SUPPORTED_SCHEMA = 1;

export type GateState =
  | 'NOT_STARTED'
  | 'READY'
  | 'AUTHORING'
  | 'REVIEWING'
  | 'PASS'
  | 'CHANGES_REQUESTED'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'STALE';

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';

export interface ArtifactRef {
  path: string;
  sha256: string;
  current: boolean;
}

export interface Findings {
  blocker: number;
  major: number;
  minor: number;
  info: number;
}

export interface StaleCause {
  path: string;
  was: string;
  now: string;
  role: 'input' | 'output' | string;
}

export interface Stage {
  gate: string;
  stage: string;
  state: GateState;
  run_id?: string | null;
  attempt?: number;
  log?: string | null;
  inputs: ArtifactRef[];
  outputs: ArtifactRef[];
  findings: Findings;
  open_findings: string[];
  skip_reason?: { type: string; explanation?: string; who?: string; ticket?: string; until?: string } | null;
  blocked_reason?: string;
  stale_because?: StaleCause[];
  updated_at?: string | null;
  rounds?: { used: number; cap: number }; // full reviews since the last PASS (§4.3)
  first_log_at?: string | null;
  tokens?: number | null; // only what size.mjs actual recorded
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  stack?: string;
  files: string[];
  requirements: string[];
  tests: string[];
  blocked_by?: string;
}

export interface Requirement {
  id: string;
  title: string;
  priority?: string;
  tasks: string[];
  covered: boolean;
}

export type ChangeClass = 'initiative' | 'change' | 'fix' | 'refactor' | 'spike' | 'fast';
export type DecisionStatus = 'open' | 'answered' | 'assumed' | 'withdrawn';

/** DEV-CONTRACTS §15.2. The board shows these; it never answers one. */
export interface Decision {
  id: string;
  question: string;
  status: DecisionStatus;
  blocks: string[];
  /** True only when a GATE is blocked — a decision that blocks one task does not stop the slug. */
  blocking: boolean;
  answer?: string | null;
}

export interface KnowledgeCard {
  path: string;
  sha256: string;
  grounded_at: string | null;
}

/**
 * GK (§16.2), shaped like a stage so the board can render it with the same code, plus the cards.
 * It is a `Stage` because it really is one: a reviewer, a checklist, a log and a verdict. The
 * distinction it exists to preserve is that *the cards exist* and *someone checked the cards* are
 * different claims, and only the second lets the gates downstream trust them.
 */
export interface Knowledge extends Stage {
  cards: KnowledgeCard[];
}

export interface Initiative {
  slug: string;
  tracker: string;
  title: string;
  /** §15.1 — decides which gates run at all, so the board must show it next to the gate strip. */
  change_class?: ChangeClass;
  current_gate: string;
  blocked: boolean;
  stages: Stage[];
  requirements: Requirement[];
  tasks: Task[];
  decisions?: Decision[];
}

export interface State {
  schema: number;
  generator_version: string;
  generated_at: string;
  source_hash: string;
  project: string;
  knowledge?: Knowledge;
  initiatives: Initiative[];
}

export type LoadResult =
  | { ok: true; state: State; statePath: string; projectRoot: string; staleFiles: string[] }
  | { ok: false; reason: string; detail?: string; statePath: string };

/**
 * Initiative-level phase. This is where "backlog" lives: a slug that has not reached G7 is not yet
 * being built. Task status stays the four values in DEV-CONTRACTS §10 — a task-level backlog column
 * would always be empty, because tasks only come into existence at G6 once they are already planned.
 */
export type Phase = 'Backlog' | 'Design' | 'Build' | 'Ship' | 'Live';

export const PHASES: Phase[] = ['Backlog', 'Design', 'Build', 'Ship', 'Live'];

export function gateNumber(gate: string): number {
  const n = Number.parseInt(gate.replace(/^G/, ''), 10);
  return Number.isFinite(n) ? n : -1;
}

export function phaseOf(initiative: Initiative): Phase {
  const g = gateNumber(initiative.current_gate);
  if (g <= 1) return 'Backlog';
  if (g <= 6) return 'Design';
  if (g <= 8) return 'Build';
  if (g <= 10) return 'Ship';
  return 'Live';
}

export function openFindingCount(initiative: Initiative): number {
  return initiative.stages.reduce((n, s) => n + (s.open_findings?.length ?? 0), 0);
}

export function blockingFindingCount(initiative: Initiative): number {
  return initiative.stages.reduce((n, s) => n + (s.findings?.blocker ?? 0) + (s.findings?.major ?? 0), 0);
}

/** A stage that stops the ladder. Used only for presentation — the state itself comes from the builder. */
export function halts(state: GateState): boolean {
  return state === 'BLOCKED' || state === 'STALE' || state === 'CHANGES_REQUESTED';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Where the index lives under each SDLC root name, in the order the bundle's resolver prefers (DEV-CONTRACTS §2). */
export const STATE_CANDIDATES = ['.sdlc/state.json', 'dev/state.json'];

/**
 * The index path to read: `sdlc.statePath` when set, else `.sdlc/state.json` when that root exists,
 * else `dev/state.json` when that one does, else `.sdlc/state.json` — the bundle's `lib/root.mjs`
 * order. A parent workspace with no root of its own looks one level of projects down, as
 * findProjectRoot does, so a `dev/` project under it is not shadowed by the `.sdlc` default.
 */
export function resolveStatePath(workspaceRoot: string, configured?: string | null): string {
  const set = (configured ?? '').trim();
  if (set) return set;
  for (const rel of STATE_CANDIDATES) {
    if (fs.existsSync(path.join(workspaceRoot, path.dirname(rel)))) return rel;
  }
  for (const rel of STATE_CANDIDATES) {
    if (findProjectRoot(workspaceRoot, rel)) return rel;
  }
  return STATE_CANDIDATES[0];
}

/**
 * Load and validate the index. Every failure path returns a reason the user can act on: a viewer
 * that renders an empty board when the file is malformed is worse than one that says so, because
 * an empty board looks like "no work in progress".
 */
export function loadState(workspaceRoot: string, relStatePath: string, chosenRoot?: string): LoadResult {
  // Every path inside the index is relative to the project that owns it, not to the workspace.
  const projectRoot = chosenRoot ?? findProjectRoot(workspaceRoot, relStatePath) ?? workspaceRoot;
  const statePath = path.join(projectRoot, relStatePath);

  let raw: string;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      statePath,
      reason: 'No state index found.',
      detail:
        `Expected ${relStatePath}. It is generated — run \`npm run dev:state\` ` +
        `(or any /sdlc-* command) to create it. Check sdlc.statePath if your dev root differs.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      statePath,
      reason: 'The state index is not valid JSON.',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!isRecord(parsed) || typeof parsed.schema !== 'number') {
    return { ok: false, statePath, reason: 'The state index has no schema field.' };
  }

  if (parsed.schema !== SUPPORTED_SCHEMA) {
    return {
      ok: false,
      statePath,
      reason: `Unsupported state schema ${parsed.schema}.`,
      detail:
        `This extension understands schema ${SUPPORTED_SCHEMA}. Rather than guess at a layout it ` +
        `does not know, it is showing you nothing. Update the extension, or check which bundle ` +
        `version wrote this file.`,
    };
  }

  const state = parsed as unknown as State;
  if (!Array.isArray(state.initiatives)) {
    return { ok: false, statePath, reason: 'The state index has no initiatives array.' };
  }

  return { ok: true, state, statePath, projectRoot, staleFiles: findStaleFiles(projectRoot, state) };
}

/** Folders that hold copies or dependencies, never a project of their own: `.claude/worktrees`, `.git`, `node_modules`. */
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'out', 'dist', 'build']);
const MAX_DEPTH = 5;

export interface ProjectRef {
  root: string;
  /** Modification time of the project's index, in ms. */
  mtime: number;
}

/**
 * Every project under the workspace that has an index, newest first.
 *
 * The workspace root counts when it has one. Below it, a folder with an index is a project and is
 * not searched further — a project's own subfolders are its code, not more projects. Dot folders
 * are skipped, because `.claude/worktrees` holds agent copies of the same index that are not the
 * project of record.
 */
export function findProjectRoots(workspaceRoot: string, relStatePath: string): ProjectRef[] {
  const found: ProjectRef[] = [];
  const probe = (dir: string): boolean => {
    try {
      found.push({ root: dir, mtime: fs.statSync(path.join(dir, relStatePath)).mtimeMs });
      return true;
    } catch {
      return false;
    }
  };
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const candidate = path.join(dir, e.name);
      if (!probe(candidate)) walk(candidate, depth + 1);
    }
  };
  probe(workspaceRoot);
  walk(workspaceRoot, 1);
  return found.sort((a, b) => b.mtime - a.mtime);
}

/**
 * The index paths a project may use: the setting when set, else every SDLC root name (§2), so a
 * parent workspace lists its `.sdlc/` and its `dev/` projects together in SDLC: Select Project.
 */
export function stateCandidates(configured?: string | null): string[] {
  const set = (configured ?? '').trim();
  return set ? [set] : STATE_CANDIDATES;
}

/** findProjectRoots over several index paths: one entry per project, newest first. */
export function findProjectRootsAny(workspaceRoot: string, relStatePaths: string[]): ProjectRef[] {
  const byRoot = new Map<string, ProjectRef>();
  for (const rel of relStatePaths) {
    for (const p of findProjectRoots(workspaceRoot, rel)) if (!byRoot.has(p.root)) byRoot.set(p.root, p);
  }
  return [...byRoot.values()].sort((a, b) => b.mtime - a.mtime);
}

/**
 * Which folder owns the index when the reader has not chosen one.
 *
 * The workspace root, when it has one. Otherwise the workspace is a parent of several projects
 * (agentic-fx holds release-management, todo-app, ...), so take the project whose index was written
 * most recently, which is the one a command just ran in.
 */
export function findProjectRoot(workspaceRoot: string, relStatePath: string): string | undefined {
  if (fs.existsSync(path.join(workspaceRoot, relStatePath))) return workspaceRoot;
  return findProjectRoots(workspaceRoot, relStatePath)[0]?.root;
}

/**
 * Freshness check.
 *
 * The obvious approach — recompute `source_hash` and compare — would mean hashing every artifact
 * with the builder's exact normalisation rules (body only, CRLF folded, trailing whitespace
 * stripped). That is a second implementation of a rule that belongs to the bundle, and the two
 * would diverge the first time the rule is refined.
 *
 * So instead: every file the index references is compared by modification time against
 * `generated_at`. Anything newer means the index was built before that file's current content, so
 * the board may be showing a verdict about a version that no longer exists. Cheap, no duplicated
 * logic, and it fails in the safe direction — it can say "possibly stale" when nothing meaningful
 * changed, but it cannot stay silent when something did.
 */
function findStaleFiles(workspaceRoot: string, state: State): string[] {
  const generatedAt = Date.parse(state.generated_at);
  if (!Number.isFinite(generatedAt)) return [];

  const referenced = new Set<string>();
  for (const initiative of state.initiatives) {
    for (const stage of initiative.stages ?? []) {
      if (stage.log) referenced.add(stage.log);
      for (const a of stage.inputs ?? []) referenced.add(a.path);
      for (const a of stage.outputs ?? []) referenced.add(a.path);
    }
  }

  const stale: string[] = [];
  for (const rel of referenced) {
    try {
      const mtime = fs.statSync(path.join(workspaceRoot, rel)).mtimeMs;
      if (mtime > generatedAt + 1000) stale.push(rel);
    } catch {
      // A referenced file that has vanished is worth surfacing too — the builder will call it
      // BLOCKED on its next run, and until then the board should not pretend everything is fine.
      stale.push(rel);
    }
  }
  return stale.sort();
}

/**
 * How GK reads on a board, decided once.
 *
 * GK is a gate, not a folder (§16.2). `status.mjs` prints it above the ladder on every run, and the
 * extension used to drop it entirely — so two renderings of one index disagreed about which gates
 * exist, and the one they disagreed about is what every brownfield gate downstream rests on.
 *
 * The distinction this preserves is the one §16.2 exists for: *cards exist* and *someone checked
 * the cards* are different claims. `NOT_STARTED` with no cards is a prompt, not a failure, which is
 * why it is a warning rather than an error.
 */
export function knowledgeSummary(
  state: State,
): { label: string; detail: string; severity: 'info' | 'warning' } | undefined {
  const k = state.knowledge;
  if (!k) return undefined;
  const count = k.cards?.length ?? 0;
  return {
    label: 'GK  knowledge',
    detail: count > 0 ? `${k.state} · ${count} card(s)` : `${k.state} · no cards — run /sdlc-onboard`,
    severity: count === 0 && k.state !== 'PASS' ? 'warning' : 'info',
  };
}

/** Task counts by status, in the fixed column order the board and the status bar both use. */
export interface TaskCounts {
  total: number;
  todo: number;
  'in-progress': number;
  blocked: number;
  done: number;
}

export function taskCounts(initiative: Initiative): TaskCounts {
  const counts: TaskCounts = { total: 0, todo: 0, 'in-progress': 0, blocked: 0, done: 0 };
  for (const t of initiative.tasks ?? []) {
    counts.total += 1;
    if (t.status in counts) counts[t.status] += 1;
  }
  return counts;
}

/**
 * The first sentence of a task title. tasks.md bolds a short heading and follows it with the full
 * description in the same cell; the builder flattens the markdown, so the board gets one long
 * string. Splitting at the first sentence end gives the heading back for lists, and the full text
 * stays available for the detail panel. Abbreviations with a dot (e.g. `v1.2`) do not end a
 * sentence, because the split needs a space after the dot.
 */
export function shortTitle(title: string): string {
  const m = /^(.+?[.!?])(?:\s|$)/.exec(title.trim());
  const first = m ? m[1] : title.trim();
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
}

/**
 * The acceptance clause of a task description, when the author wrote one in the house style
 * ("Done when ..."). Absent, the detail panel says so rather than guessing.
 */
export function doneWhen(title: string): string | undefined {
  const m = /\bDone when\b\s*(.+)$/is.exec(title);
  return m ? m[1].trim().replace(/\s*[.。]$/, '') : undefined;
}
