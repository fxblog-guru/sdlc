/**
 * The board's view model: what the page draws, computed here so `model.test.ts` can reach it.
 *
 * This file must not import `vscode`. It runs in the unit tests under plain Node, and keeping it
 * that way is what lets a count, a short title or the "what next" line be asserted without
 * downloading an editor.
 */

import {
  Decision,
  GateState,
  Initiative,
  LoadResult,
  Stage,
  TaskCounts,
  TaskStatus,
  doneWhen,
  knowledgeSummary,
  phaseOf,
  shortTitle,
  taskCounts,
} from './model';
import { ActivityItem, LiveSnapshot, SlugLive, applyLive } from './live';
import { ActivityEvent, NEED_LABEL, openNeeds } from './activity';

const GATE_ORDER = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];

/** How a gate state reads in words. The page never shows a colour without one of these beside it. */
const STATE_LABEL: Record<GateState, string> = {
  PASS: 'passed',
  SKIPPED: 'skipped',
  STALE: 'stale',
  BLOCKED: 'blocked',
  CHANGES_REQUESTED: 'changes requested',
  REVIEWING: 'reviewing',
  AUTHORING: 'authoring',
  READY: 'ready',
  NOT_STARTED: 'not started',
};

export interface GateVM {
  gate: string;
  stage: string;
  state: GateState;
  label: string;
  findings: { blocker: number; major: number; minor: number; info: number };
  open: string[];
  log: string | null;
  attempt: number | null;
  updatedAt: string | null;
  blockedReason: string | null;
  staleBecause: string[];
  skipReason: string | null;
  /** What the files say since the index was built: a newer log's verdict, or work inferred in progress. */
  live: { state: GateState; label: string; note: string; source: 'log' | 'inferred'; log: string | null } | null;
}

export interface FindingVM {
  id: string;
  gate: string;
  stage: string;
  log: string | null;
  blocking: boolean;
  /** From the gate log's Findings table; null when the row could not be read. */
  severity: 'blocker' | 'major' | 'minor' | 'info' | null;
  problem: string | null;
}

export interface TaskVM {
  id: string;
  title: string;
  full: string;
  doneWhen: string | null;
  status: TaskStatus;
  stack: string | null;
  files: string[];
  tests: string[];
  requirements: { id: string; title: string | null }[];
  blockedBy: string | null;
}

export interface InitiativeVM {
  slug: string;
  title: string;
  tracker: string;
  changeClass: string | null;
  currentGate: string;
  phase: string;
  blocked: boolean;
  next: string;
  gates: GateVM[];
  counts: TaskCounts;
  requirements: { total: number; covered: number };
  decisions: { open: number; answered: number; assumed: number; withdrawn: number; blocking: Decision[]; list: DecisionVM[] };
  /** Gates passed or skipped, out of twelve, as a whole percent. */
  percentDone: number;
  /** What a human must do for this initiative, newest first: from the activity log and the index. */
  needsYou: NeedVM[];
  openFindings: FindingVM[];
  severity: { blocker: number; major: number; minor: number; info: number; unknown: number };
  attempt: number | null;
  /** True when task status was read from progress.md because it is newer than the index. */
  tasksLive: boolean;
  tasks: TaskVM[];
  actions: ActionVM[];
  upNext: UpNextVM[];
  recent: RecentVM[];
  requirementList: RequirementVM[];
}

/**
 * A suggested action: what the index says is waiting, and the bundle command that acts on it.
 * `command` is shown and copied, never run — the board does not drive the pipeline.
 */
export interface ActionVM {
  kind: 'blocked' | 'changes' | 'decision' | 'stale' | 'continue' | 'start' | 'findings' | 'done';
  title: string;
  detail: string;
  command: string | null;
  path: string | null;
}

export interface UpNextVM {
  id: string;
  title: string;
  status: TaskStatus;
  stack: string | null;
  blockedBy: string | null;
}

export interface DecisionVM {
  id: string;
  question: string;
  status: string;
  blocks: string[];
  blocking: boolean;
  answer: string | null;
}

export interface NeedVM {
  need: string;
  label: string;
  title: string;
  /** Copied, never run: the board does not drive the pipeline. */
  command: string | null;
  link: string | null;
  at: string | null;
}

export interface RecentVM {
  gate: string;
  stage: string;
  state: GateState;
  label: string;
  updatedAt: string;
  log: string | null;
}

/** A requirement with the tasks that implement it, so the page can show the fraction done per requirement. */
export interface RequirementVM {
  id: string;
  title: string;
  priority: string | null;
  covered: boolean;
  total: number;
  done: number;
  tasks: { id: string; title: string; status: TaskStatus }[];
}

/** The command that authors each gate, from `/sdlc-help`'s ladder. */
const GATE_COMMAND: Record<string, string> = {
  G0: '/sdlc-intake',
  G1: '/sdlc-requirements',
  G2: '/sdlc-design',
  G3: '/sdlc-data',
  G4: '/sdlc-api',
  G5: '/sdlc-ui',
  G6: '/sdlc-plan',
  G7: '/sdlc-implement',
  G8: '/sdlc-verify',
  G9: '/sdlc-release',
  G10: '/sdlc-deploy',
  G11: '/sdlc-monitor',
};

export type BoardVM =
  | {
      ok: true;
      project: string;
      generatedAt: string;
      generatorVersion: string;
      staleFiles: string[];
      knowledge: { state: GateState; label: string; detail: string } | null;
      initiatives: InitiativeVM[];
      live: LiveVM;
    }
  | { ok: false; reason: string; detail: string | null };

export interface LiveVM {
  /** Whether the host is watching at all; the page shows the pulse only when it is. */
  watching: boolean;
  branch: string | null;
  head: string | null;
  /** The board shows something newer than the index (an overlay is in force). */
  ahead: boolean;
  last: ActivityItem | null;
  activity: ActivityItem[];
  /** The host's clock when this was built, so the page can tell its own clock skew apart. */
  builtAt: number;
}

export interface BuildOptions {
  live?: LiveSnapshot;
  watching?: boolean;
  now?: number;
}

export function buildViewModel(result: LoadResult, opts: BuildOptions = {}): BoardVM {
  if (!result.ok) return { ok: false, reason: result.reason, detail: result.detail ?? null };
  const live = opts.live;
  const state = applyLive(result.state, live);
  const k = knowledgeSummary(state);
  return {
    ok: true,
    project: state.project || 'Pipeline',
    generatedAt: state.generated_at,
    generatorVersion: state.generator_version,
    staleFiles: result.staleFiles,
    knowledge: k && state.knowledge ? { state: state.knowledge.state, label: STATE_LABEL[state.knowledge.state] ?? state.knowledge.state, detail: k.detail } : null,
    initiatives: (state.initiatives ?? []).map((i) => initiativeVM(i, live?.slugs.get(i.slug), live?.events ?? [])),
    live: {
      watching: opts.watching ?? false,
      branch: live?.branch ?? null,
      head: live?.head ?? null,
      ahead: live?.ahead ?? false,
      last: live?.activity[0] ?? null,
      activity: live?.activity ?? [],
      builtAt: opts.now ?? Date.now(),
    },
  };
}

const SEVERITIES = ['blocker', 'major', 'minor', 'info'] as const;

function initiativeVM(i: Initiative, live?: SlugLive, events: ActivityEvent[] = []): InitiativeVM {
  const reqTitle = new Map((i.requirements ?? []).map((r) => [r.id, r.title]));
  const gates = GATE_ORDER.map((g) => gateVM(g, i.stages.find((s) => s.gate === g), live));
  const decisions = i.decisions ?? [];
  const count = (status: string): number => decisions.filter((d) => d.status === status).length;

  const openFindings: FindingVM[] = [];
  const severity = { blocker: 0, major: 0, minor: 0, info: 0, unknown: 0 };
  for (const s of i.stages ?? []) {
    for (const id of s.open_findings ?? []) {
      const row = live?.findings.get(id);
      const sev = row && (SEVERITIES as readonly string[]).includes(row.severity) ? (row.severity as FindingVM['severity']) : null;
      severity[sev ?? 'unknown'] += 1;
      openFindings.push({
        id,
        gate: s.gate,
        stage: s.stage,
        log: s.log ?? null,
        blocking: sev ? sev === 'blocker' || sev === 'major' : (s.findings?.blocker ?? 0) + (s.findings?.major ?? 0) > 0,
        severity: sev,
        problem: row?.problem ?? null,
      });
    }
  }
  const rank = (f: FindingVM): number => (f.severity ? SEVERITIES.indexOf(f.severity) : 4);
  openFindings.sort((a, b) => rank(a) - rank(b));
  const currentStage = (i.stages ?? []).find((s) => s.gate === i.current_gate);

  return {
    slug: i.slug,
    title: i.title,
    tracker: i.tracker,
    changeClass: i.change_class ?? null,
    currentGate: i.current_gate,
    phase: phaseOf(i),
    blocked: i.blocked,
    next: nextStep(i),
    gates,
    counts: taskCounts(i),
    requirements: { total: i.requirements?.length ?? 0, covered: (i.requirements ?? []).filter((r) => r.covered).length },
    decisions: {
      open: count('open'),
      answered: count('answered'),
      assumed: count('assumed'),
      withdrawn: count('withdrawn'),
      blocking: decisions.filter((d) => d.blocking && d.status !== 'answered'),
      list: decisionList(decisions),
    },
    percentDone: Math.round((gates.filter((g) => g.state === 'PASS' || g.state === 'SKIPPED').length / gates.length) * 100),
    needsYou: needsYou(i, events),
    openFindings,
    severity,
    attempt: live?.gates.get(i.current_gate)?.attempt ?? currentStage?.attempt ?? null,
    tasksLive: live?.tasksFromProgress ?? false,
    actions: actions(i),
    upNext: upNext(i),
    recent: recent(i),
    requirementList: requirementList(i),
    tasks: (i.tasks ?? []).map((t) => ({
      id: t.id,
      title: shortTitle(t.title),
      full: t.title,
      doneWhen: doneWhen(t.title) ?? null,
      status: t.status,
      stack: t.stack ?? null,
      files: t.files ?? [],
      tests: t.tests ?? [],
      requirements: (t.requirements ?? []).map((id) => ({ id, title: reqTitle.get(id) ?? null })),
      blockedBy: t.blocked_by ?? null,
    })),
  };
}

function gateVM(gate: string, s: Stage | undefined, live?: SlugLive): GateVM {
  const state: GateState = s?.state ?? 'NOT_STARTED';
  const o = live?.gates.get(gate);
  return {
    gate,
    stage: s?.stage ?? '',
    state,
    label: STATE_LABEL[state] ?? state,
    findings: s?.findings ?? { blocker: 0, major: 0, minor: 0, info: 0 },
    open: s?.open_findings ?? [],
    log: s?.log ?? null,
    attempt: s?.attempt ?? null,
    updatedAt: s?.updated_at ?? null,
    blockedReason: s?.blocked_reason ?? null,
    staleBecause: (s?.stale_because ?? []).map((c) => `${c.role} ${c.path} changed`),
    skipReason: s?.skip_reason ? `${s.skip_reason.type}${s.skip_reason.explanation ? ` — ${s.skip_reason.explanation}` : ''}` : null,
    live: o && o.state !== state ? { state: o.state, label: STATE_LABEL[o.state] ?? o.state, note: o.note, source: o.source, log: o.log } : null,
  };
}

/**
 * Suggested actions, most urgent first. Each restates a state the builder recorded and names the
 * documented command for it. Nothing here weighs one finding against another or decides that a
 * gate may be skipped — that is what the reviewers and a named human are for.
 */
export function actions(i: Initiative): ActionVM[] {
  const out: ActionVM[] = [];
  const stages = i.stages ?? [];

  for (const s of stages.filter((s) => s.state === 'BLOCKED')) {
    out.push({ kind: 'blocked', title: `Unblock ${s.gate} ${s.stage}`, detail: s.blocked_reason ?? 'A precondition is missing.', command: null, path: s.log ?? null });
  }

  for (const s of stages.filter((s) => s.state === 'CHANGES_REQUESTED')) {
    const n = s.open_findings?.length ?? 0;
    out.push({
      kind: 'changes',
      title: `Fix ${n || 'the'} finding${n === 1 ? '' : 's'} in ${s.gate} ${s.stage}`,
      detail: `The reviewer asked for changes. Fix them in the artifact, then re-run ${GATE_COMMAND[s.gate] ?? 'the gate'}.`,
      command: GATE_COMMAND[s.gate] ? `${GATE_COMMAND[s.gate]} ${i.slug}` : null,
      path: s.log ?? null,
    });
  }

  for (const d of (i.decisions ?? []).filter((d) => d.blocking && d.status !== 'answered')) {
    out.push({ kind: 'decision', title: `Answer ${d.id}`, detail: `${d.question} Blocks ${d.blocks.join(', ')}.`, command: `/sdlc-ask ${i.slug}`, path: null });
  }

  const stale = stages.filter((s) => s.state === 'STALE');
  if (stale.length) {
    const gates = stale.map((s) => s.gate);
    const range = gates.length > 2 ? `${gates[0]}–${gates[gates.length - 1]}` : gates.join(' and ');
    out.push({
      kind: 'stale',
      title: `Reaffirm ${range}`,
      detail: `${gates.length === 1 ? 'An input' : 'Inputs'} changed after review. Reaffirm if the change is bounded; otherwise re-run the gate.`,
      command: `/sdlc-gate ${i.slug} ${gates[0]} --reaffirm`,
      path: stale[0].log ?? null,
    });
  }

  const current = stages.find((s) => s.gate === i.current_gate);
  const working = stages.find((s) => s.state === 'AUTHORING' || s.state === 'REVIEWING');
  if (working) {
    const c = taskCounts(i);
    const detail =
      working.gate === 'G7' && c.total
        ? `${c.done} of ${c.total} tasks done · ${c['in-progress']} in progress · ${c.todo} to go.`
        : `${working.gate} ${working.stage} is ${STATE_LABEL[working.state]}.`;
    out.push({ kind: 'continue', title: `Continue ${working.gate} ${working.stage}`, detail, command: GATE_COMMAND[working.gate] ? `${GATE_COMMAND[working.gate]} ${i.slug}` : null, path: working.log ?? null });
  } else if (current && current.state === 'READY') {
    out.push({ kind: 'start', title: `Start ${current.gate} ${current.stage}`, detail: 'Every input it needs has passed.', command: GATE_COMMAND[current.gate] ? `${GATE_COMMAND[current.gate]} ${i.slug}` : null, path: null });
  }

  const open = stages.filter((s) => s.state !== 'CHANGES_REQUESTED' && (s.open_findings?.length ?? 0) > 0);
  const openCount = open.reduce((n, s) => n + s.open_findings.length, 0);
  if (openCount) {
    out.push({
      kind: 'findings',
      title: `${openCount} open finding${openCount === 1 ? '' : 's'}`,
      detail: `Carried on ${open.map((s) => s.gate).join(', ')}. Each is listed in its gate log.`,
      command: null,
      path: open[0].log ?? null,
    });
  }

  if (!out.length && stages.length && stages.every((s) => s.state === 'PASS' || s.state === 'SKIPPED')) {
    out.push({ kind: 'done', title: 'Every gate has passed', detail: 'Nothing is waiting on this initiative.', command: null, path: null });
  }
  return out;
}

/**
 * What is being worked on and what the plan says comes next: tasks in progress, then the first
 * todo tasks in the order tasks.md lists them (which is the plan's §Sequence), then anything
 * blocked, with what it waits on. Capped so the card stays a card.
 */
export function upNext(i: Initiative, limit = 6): UpNextVM[] {
  const tasks = i.tasks ?? [];
  const pick = (status: TaskStatus): UpNextVM[] =>
    tasks
      .filter((t) => t.status === status)
      .map((t) => ({ id: t.id, title: shortTitle(t.title), status: t.status, stack: t.stack ?? null, blockedBy: t.blocked_by ?? null }));
  return [...pick('in-progress'), ...pick('todo').slice(0, 3), ...pick('blocked')].slice(0, limit);
}

/** Gate activity, newest first, from each stage's `updated_at`. The index keeps one entry per gate. */
export function recent(i: Initiative, limit = 6): RecentVM[] {
  return (i.stages ?? [])
    .filter((s): s is Stage & { updated_at: string } => typeof s.updated_at === 'string' && s.updated_at.length > 0)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit)
    .map((s) => ({ gate: s.gate, stage: s.stage, state: s.state, label: STATE_LABEL[s.state] ?? s.state, updatedAt: s.updated_at, log: s.log ?? null }));
}

/** Requirements with their tasks, joined from both sides: the requirement's task list and each task's requirement list. */
export function requirementList(i: Initiative): RequirementVM[] {
  const tasks = i.tasks ?? [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (i.requirements ?? []).map((r) => {
    const ids = new Set<string>(r.tasks ?? []);
    for (const t of tasks) if ((t.requirements ?? []).includes(r.id)) ids.add(t.id);
    const linked = [...ids]
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, title: shortTitle(t.title), status: t.status }));
    return {
      id: r.id,
      title: r.title,
      // Only a real priority label. In some corpora the column carries prose for a few rows, and
      // a filter chip made of a sentence is worse than no chip.
      priority: r.priority && /^P\d$/.test(r.priority.trim()) ? r.priority.trim() : null,
      covered: r.covered,
      total: linked.length,
      done: linked.filter((t) => t.status === 'done').length,
      tasks: linked,
    };
  });
}

/**
 * One line answering "so what do I do now?". It restates what the index already says — which
 * stage is blocked, which are stale, which is in progress — and names the command that acts on
 * it. It decides nothing: the states come from the builder, and the command is the one the bundle
 * documents for that state.
 */
export function nextStep(i: Initiative): string {
  const blocked = i.stages.find((s) => s.state === 'BLOCKED');
  if (blocked) return `Blocked at ${blocked.gate} ${blocked.stage}: ${blocked.blocked_reason ?? 'a precondition is missing'}.`;

  const changes = i.stages.find((s) => s.state === 'CHANGES_REQUESTED');
  if (changes) return `${changes.gate} ${changes.stage} has changes requested — fix the findings in its log and re-run the gate.`;

  const stale = i.stages.filter((s) => s.state === 'STALE').map((s) => s.gate);
  const current = i.stages.find((s) => s.gate === i.current_gate);
  const working = current && (current.state === 'AUTHORING' || current.state === 'REVIEWING') ? current : undefined;

  const parts: string[] = [];
  if (working) parts.push(`${working.gate} ${working.stage} is ${STATE_LABEL[working.state]}.`);
  if (stale.length) {
    const range = stale.length > 2 ? `${stale[0]}–${stale[stale.length - 1]}` : stale.join(', ');
    parts.push(`${range} ${stale.length === 1 ? 'is' : 'are'} stale: an input changed after review — \`/sdlc-gate ${i.slug} ${stale[0]} --reaffirm\` if the change is bounded, or re-run the gate.`);
  }
  if (parts.length) return parts.join(' ');

  const open = i.stages.find((s) => s.state === 'READY');
  if (open) return `${open.gate} ${open.stage} is ready to start.`;
  if (i.stages.every((s) => s.state === 'PASS' || s.state === 'SKIPPED')) return 'Every gate has passed.';
  return `At ${i.current_gate}.`;
}

const DECISION_ORDER = ['open', 'assumed', 'answered', 'withdrawn'];

/** Open first (blocking ones on top), then assumed, then answered. */
export function decisionList(decisions: Decision[]): DecisionVM[] {
  const rank = (d: Decision): number => DECISION_ORDER.indexOf(d.status) * 2 + (d.blocking ? 0 : 1);
  return [...decisions]
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
    .map((d) => ({ id: d.id, question: d.question, status: d.status, blocks: d.blocks, blocking: d.blocking, answer: d.answer && !/^[—–-]$/.test(d.answer.trim()) ? d.answer : null }));
}

/**
 * What waits on a human. The activity log says what a run asked for (a UI approval, a stop to
 * review, a push); the index adds what it can see on its own: open decisions to answer and assumed
 * ones to confirm, which `/sdlc-ask` handles in one batch.
 */
/**
 * A list of ids short enough for one line: three or fewer are named, more become a range with a
 * count, because a row that names 24 decisions is read as a wall of text and the full list is one
 * click away in Decisions.
 */
export function idSpan(ids: string[]): string {
  if (ids.length <= 3) return ids.join(', ');
  return `${ids[0]} … ${ids[ids.length - 1]}`;
}

export function needsYou(i: Initiative, events: ActivityEvent[]): NeedVM[] {
  const out: NeedVM[] = [];
  const decisions = i.decisions ?? [];
  const open = decisions.filter((d) => d.status === 'open');
  const assumed = decisions.filter((d) => d.status === 'assumed');
  if (open.length) out.push({ need: 'answer-dec', label: NEED_LABEL['answer-dec'], title: `${open.length} open: ${idSpan(open.map((d) => d.id))}`, command: `/sdlc-ask ${i.slug}`, link: null, at: null });
  if (assumed.length) out.push({ need: 'confirm-dec', label: NEED_LABEL['confirm-dec'], title: `${assumed.length} assumed: ${idSpan(assumed.map((d) => d.id))}`, command: `/sdlc-ask ${i.slug}`, link: null, at: null });
  for (const n of openNeeds(events.filter((e) => e.slug === i.slug))) {
    // Decisions are counted from the ledger above; an event about one would be said twice.
    if (n.need === 'answer-dec' || n.need === 'confirm-dec') continue;
    out.push({ need: n.need, label: NEED_LABEL[n.need], title: n.title, command: null, link: n.link, at: n.at });
  }
  return out;
}
