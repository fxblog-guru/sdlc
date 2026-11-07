#!/usr/bin/env node
/**
 * build-state.mjs — derive <root>/state.json and <root>/DASHBOARD.md from the gate logs and artifacts.
 *
 * This script is the only thing that decides what state a gate is in. Everything downstream — the
 * commands' preflight, /sdlc-status, CI, the VS Code viewer — reads its output rather than
 * re-deriving. That is deliberate: the rules in DEV-CONTRACTS §4.1 and §4.4 are subtle enough
 * (body-only hashing, input as well as output, transitive staleness) that a second implementation
 * would drift, and the drift would look like a gate that is inexplicably stuck.
 *
 * It is a pure derivation: it reads, it writes two generated files, and it changes nothing else.
 * Run it as often as you like — the output is identical for identical input, apart from the
 * timestamp.
 *
 *   node <root>/scripts/build-state.mjs [--root <root>] [--check] [--quiet]   (root: §2, lib/root.mjs)
 *   node <root>/scripts/build-state.mjs --hash <path> [<path>...]
 *
 *   --check   derive and compare against the existing state.json without writing; exit 1 when a gate
 *             state differs (an artifact edited since the build) or the source fingerprint does.
 *             This is what CI uses to prove nobody hand-edited the index.
 *   --hash    print `<sha256>  <path>` for each artifact, using the same rule the builder itself
 *             applies when it decides whether a gate is STALE. A reviewer cannot compute SHA-256 in
 *             its head, and a hash written by guesswork would make every staleness check a lie — so
 *             the tool that judges the hash is also the tool that issues it. One implementation,
 *             one answer.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decisionRowsHash, hashRef, parseDoc, plain, readDoc, readTable, reliedOnRows, splitRef } from './lib/doc.mjs';
import { codePathspec, findVersion, inGitRepo } from './lib/history.mjs';
import { locateRef, normalizeRef, repoPath, rootFromArgv, rootPrefix, stripRoot } from './lib/root.mjs';
import { dependsOn, latestProgress, readProgress } from './lib/tasks.mjs';
import { logActivity, stateEvents } from './lib/activity.mjs';
import { ROUND_CAP, roundsOf } from './lib/rounds.mjs';

export const GENERATOR_VERSION = '1.11.0';
export const SCHEMA = 1;

/** The ladder, in order. DEV-CONTRACTS §4. */
export const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'];

/**
 * GK is a gate like the others — a reviewer, a checklist, a log, a verdict (§16) — but it belongs to
 * the repository rather than to an initiative, so it sits outside the per-slug ladder and its logs
 * live under a reserved folder.
 *
 * `_repo` cannot collide with a real initiative because a slug is lowercase-kebab (§1) and so can
 * never begin with an underscore. That is the whole reason for the underscore: without it, the
 * knowledge track would appear on the board as an initiative called "knowledge" with eleven gates
 * that will never run.
 */
/**
 * What each gate actually depends on (DEV-CONTRACTS §4.2): sequential, except that G3, G4 and G5
 * are siblings under G2 and G6 depends on all three. Staleness propagates over this graph.
 */
export const DEPENDS_ON = {
  G0: [], G1: ['G0'], G2: ['G1'], G3: ['G2'], G4: ['G2'], G5: ['G2'], G6: ['G3', 'G4', 'G5'],
  G7: ['G6'], G8: ['G7'], G9: ['G8'], G10: ['G9'], G11: ['G10'],
};

/** Transitive closure of DEPENDS_ON: every gate a gate's verdict ultimately rests on. */
const ANCESTORS = Object.fromEntries(
  GATES.map((gate) => {
    const seen = new Set();
    const walk = (g) => DEPENDS_ON[g].forEach((d) => { if (!seen.has(d)) { seen.add(d); walk(d); } });
    walk(gate);
    return [gate, seen];
  }),
);

export const KNOWLEDGE_GATE = 'GK';
export const KNOWLEDGE_SLUG = '_repo';
const ALL_GATES = [KNOWLEDGE_GATE, ...GATES];

export const STAGE_OF = {
  GK: 'knowledge',
  G0: 'intake',
  G1: 'requirements',
  G2: 'design',
  G3: 'data',
  G4: 'api',
  G5: 'ui',
  G6: 'plan',
  G7: 'implementation',
  G8: 'verification',
  G9: 'release',
  G10: 'deployment',
  G11: 'monitoring',
};

/**
 * Where each stage writes, used only to tell "nobody has started this" apart from "someone is
 * part-way through and there is no gate log yet". Without it, an interrupted run looks identical
 * to an untouched one, and the board quietly under-reports work in progress.
 */
const STAGE_DIR = {
  GK: () => 'knowledge',
  G0: (slug) => `intake/${slug}`,
  G1: (slug) => `requirements/${slug}`,
  G2: (slug) => `design/${slug}`,
  G3: (slug) => `data/${slug}`,
  G4: (slug) => `api/${slug}`,
  G5: (slug) => `ui/${slug}`,
  G6: (slug) => `plan/${slug}`,
  G7: (slug) => `implementation/${slug}`,
  G8: (slug) => `verification/${slug}`,
  G9: (slug) => `release/${slug}`,
  G10: (slug) => `deployment/${slug}`,
  G11: (slug) => `monitoring/${slug}`,
};

const OPENS_NEXT = new Set(['PASS', 'SKIPPED']);
// Per-lane records and the change summary are derived from the code, not what G7 judged (§5.5):
// regenerating either must not stale a G7 log that still lists it.
export const LANE_FRAGMENT = /(^|\/)implementation\/[^/]+\/(lanes\/[^/]+|change-summary\.md)$/;
// progress.md is execution status, not gated (§2, §8.1): every lane writes a row, and a gate log
// that hashed it went stale on each one (release-management G6, 2026-10-16).
export const NOT_GATED = /(^|\/)implementation\/[^/]+\/progress\.md$/;

// ---------------------------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------------------------

export function buildState(root, now = new Date()) {
  versionCache = new Map();
  const slugs = listSlugs(root);
  const initiatives = slugs.map((slug) => buildInitiative(root, slug)).sort(bySlug);
  const knowledge = buildKnowledge(root);

  const state = {
    schema: SCHEMA,
    generator_version: GENERATOR_VERSION,
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source_hash: '',
    project: readProjectName(root),
    knowledge,
    initiatives,
  };

  state.source_hash = sourceHash(state);
  return state;
}

/**
 * A fingerprint of everything the derivation was based on. Its only job is to let a consumer notice
 * that the index it is holding was not produced from the files currently on disk — a hand edit, a
 * half-finished merge, a copy from another branch. It covers the artifact hashes rather than the
 * derived states, so it changes when the source material changes and not when the derivation logic
 * makes a different judgement about the same material.
 */
function sourceHash(state) {
  const parts = [];
  for (const card of state.knowledge?.cards ?? []) parts.push(`${card.path}:${card.sha256}`);
  for (const initiative of state.initiatives) {
    for (const stage of initiative.stages) {
      parts.push(`${initiative.slug}/${stage.gate}:${stage.log ?? '-'}`);
      for (const s of stage.slices ?? []) parts.push(`${initiative.slug}/${stage.gate}#${s.scope}:${s.log}`);
      for (const ref of [...(stage.inputs ?? []), ...(stage.outputs ?? [])]) {
        parts.push(`${ref.path}:${ref.sha256}`);
      }
    }
  }
  return createHash('sha256').update(parts.sort().join('\n'), 'utf8').digest('hex');
}

function buildInitiative(root, slug) {
  const logsByGate = readGateLogs(root, slug);
  const stages = GATES.map((gate) => deriveStage(root, slug, gate, logsByGate.get(gate)));

  propagateStaleness(stages);
  budgetStages(root, slug, stages, logsByGate.history);

  for (const stage of stages) {
    const held = logsByGate.slices.get(stage.gate);
    if (!held) continue;
    stage.slices = [...held.entries()]
      .sort(([a], [b]) => Number(a.slice(6)) - Number(b.slice(6)))
      .map(([scope, log]) => {
        const s = deriveStage(root, slug, stage.gate, log);
        return { scope, state: s.state, run_id: s.run_id, log: s.log, open_findings: s.open_findings };
      });
  }

  const requirements = readRequirements(root, slug);
  const tasks = readTasks(root, slug);
  const decisions = readDecisions(root, slug);
  linkRequirementsToTasks(requirements, tasks);

  const currentGate = stages.find((s) => !OPENS_NEXT.has(s.state))?.gate ?? 'G11';

  return {
    slug,
    tracker: readIntakeField(root, slug, 'tracker') ?? 'none',
    change_class: readIntakeField(root, slug, 'change_class') ?? 'initiative',
    title: readTitle(root, slug),
    current_gate: currentGate,
    blocked: stages.some((s) => s.state === 'BLOCKED') || decisions.some((d) => d.blocking),
    // A named human approved the visual design (§3.1): what clears G5's "approve the UI" need.
    ui_approved: uiApproved(root, slug),
    stages,
    requirements,
    tasks,
    decisions,
  };
}

/**
 * One gate's state, from its latest log plus the current bytes on disk.
 *
 * The order matters: a verdict is only as good as the material it was given, so a PASS whose inputs
 * or outputs have since changed is STALE rather than PASS. Verdicts that already stop the ladder
 * are left alone — telling someone their BLOCKED gate is also stale helps nobody.
 */
function deriveStage(root, slug, gate, log) {
  const stage = {
    gate,
    stage: STAGE_OF[gate],
    state: 'NOT_STARTED',
    run_id: log?.frontMatter?.run_id ?? null,
    attempt: log?.frontMatter?.attempt ?? null,
    log: log?.relPath ?? null,
    inputs: [],
    outputs: [],
    findings: { blocker: 0, major: 0, minor: 0, info: 0 },
    open_findings: [],
    skip_reason: null,
    updated_at: null,
  };

  if (!log) {
    stage.state = hasStageArtifacts(root, slug, gate) ? 'AUTHORING' : 'NOT_STARTED';
    return stage;
  }

  const fm = log.frontMatter;
  stage.inputs = resolveRefs(root, fm.inputs, 'input', { gate, body: log.body }).filter((ref) => !NOT_GATED.test(ref.path));
  // A lane fragment (§5.5) is the per-lane record; the consolidated change-summary.md is what G7
  // judged. Hashing fragments would stale G7 every time a lane's notes were tidied.
  stage.outputs = resolveRefs(root, fm.outputs, 'output').filter((ref) => !LANE_FRAGMENT.test(ref.path) && !NOT_GATED.test(ref.path));
  stage.findings = normaliseFindings(fm.findings);
  stage.open_findings = openFindingIds(log);
  stage.skip_reason = fm.skip_reason ?? null;
  stage.updated_at = runIdToIso(fm.run_id);
  if (fm.revalidated_from) {
    stage.revalidated_from = fm.revalidated_from;
    stage.revalidated_scope = reaffirmScope(root, fm);
  }
  if (fm.override) stage.override = fm.override;

  const verdict = String(fm.verdict ?? '').toUpperCase();
  stage.state = ['PASS', 'CHANGES_REQUESTED', 'BLOCKED', 'SKIPPED'].includes(verdict)
    ? verdict
    : 'REVIEWING';

  if (verdict === 'BLOCKED') {
    stage.blocked_reason = extractBlockedReason(log);
  }

  if (OPENS_NEXT.has(stage.state)) {
    const drifted = [...stage.inputs, ...stage.outputs].filter((ref) => !ref.current);
    // A final G7 log names the commit it reviewed; code changed since then is an output change.
    if (gate === 'G7' && !fm.scope && fm.reviewed_commit) {
      stage.reviewed_commit = String(fm.reviewed_commit);
      const head = codeMovedSince(root, stage.reviewed_commit);
      if (head) drifted.push({ path: 'code', sha256: stage.reviewed_commit, actual: head, role: 'output' });
    }
    if (drifted.length > 0) {
      stage.state = 'STALE';
      stage.stale_because = drifted.map((ref) => ({
        path: ref.path,
        was: ref.sha256,
        now: ref.actual ?? 'missing',
        role: ref.role,
      }));
    }
  }

  return stage;
}

/**
 * HEAD's sha when code (outside the dev root and `.claude/`) differs between `commit` and HEAD, else null. Null too
 * when there is no git or `commit` is unknown: a check that cannot run leaves the gate as it is.
 */
function codeMovedSince(root, commit) {
  const repo = dirname(root);
  const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!/^[0-9a-f]{4,64}$/i.test(commit) || git(['cat-file', '-e', `${commit}^{commit}`]).status !== 0) return null;
  const diff = git(['diff', '--quiet', commit, 'HEAD', '--', ...codePathspec(basename(root))]);
  if (diff.status !== 1) return null;
  return git(['rev-parse', 'HEAD']).stdout.trim() || null;
}

/**
 * A reaffirm log (§4.4) either damped an upstream change (`upstream`) or bounded an edit to the
 * gate's own artifact (`own-output`): its outputs record different hashes from the log it
 * reaffirms. `unknown` when that log cannot be read.
 */
function reaffirmScope(root, fm) {
  const prior = join(root, stripRoot(fm.revalidated_from));
  if (!existsSync(prior)) return 'unknown';
  const before = new Map((readDoc(prior).frontMatter.outputs ?? []).map((r) => [stripRoot(r.path), String(r.sha256)]));
  const moved = (Array.isArray(fm.outputs) ? fm.outputs : []).some((r) => before.get(stripRoot(r.path)) !== String(r.sha256));
  return moved ? 'own-output' : 'upstream';
}

/**
 * Transitive staleness (DEV-CONTRACTS §4.4).
 *
 * Hash comparison alone catches the gate whose own inputs moved. It does not catch the gate two
 * steps further down whose immediate inputs happen to be unchanged — yet that gate's reasoning
 * still rests on a decision that is now in question. Propagating forwards is what makes "approved"
 * mean "approved on a foundation that still holds".
 */
function propagateStaleness(stages) {
  // Only gates stale on their own account (an input or output hash moved) are origins. A gate is
  // then STALE if any of its ANCESTORS in the §4.2 graph is an origin — siblings are not ancestors,
  // so a stale G3 leaves G4 and G5 alone, and an unstarted G3 is no gap between G2 and G6.
  const origins = new Set(stages.filter((s) => s.state === 'STALE').map((s) => s.gate));
  for (const stage of stages) {
    if (!OPENS_NEXT.has(stage.state)) continue;
    const origin = GATES.find((g) => origins.has(g) && ANCESTORS[stage.gate].has(g));
    if (!origin) continue;
    stage.state = 'STALE';
    stage.stale_because = [{ path: `(upstream ${origin})`, was: '-', now: '-', role: 'upstream' }];
  }
}

/**
 * Resolve the artifact references in a gate log against what is on disk now.
 *
 * `role` is passed in rather than read from the reference, because a gate log records inputs and
 * outputs as two lists — the role is which list it was in. Reading it from the entry produced the
 * word "ref" for everything, which meant a stale gate could not say whether its own output had been
 * edited or the ground under it had moved. Those are different problems with different fixes.
 */
function resolveRefs(root, refs, role, log = null) {
  if (!Array.isArray(refs)) return [];
  return refs
    .filter((ref) => ref && ref.path)
    .map((ref) => {
      // `dev/decisions/<slug>.md#DEC-002,DEC-007` hashes only the cited rows (§5.2).
      // Either root prefix (`dev/`, `.sdlc/`) names the root, so a log survives a migration (§2).
      const { file, ids } = splitRef(ref.path);
      const full = locateRef(root, file);
      let actual = null;
      try {
        actual = hashRef(ids ? `${full}#${ids.join(',')}` : full);
      } catch {
        actual = null;
      }
      const recorded = String(ref.sha256 ?? '');
      // state.json names the file where it is now: a `dev/` path read under `.sdlc/` says `.sdlc/`.
      const out = {
        path: normalizeRef(root, ref.path),
        sha256: recorded,
        current: actual !== null && hashesMatch(recorded, actual),
        actual,
        role,
      };
      // A whole-ledger input is read as the rows the log relied on (§5.2): a new DEC row, or an
      // answer to a decision this gate never cited, does not make it stale.
      if (!out.current && actual !== null && !ids && log && LEDGER.test(file)) {
        const rows = ledgerRowsUnchanged(full, recorded, log);
        if (rows) Object.assign(out, { current: true, rows });
      }
      return out;
    });
}

const LEDGER = /(^|\/)decisions\/[^/]+\.md$/;

/** Committed ledger versions, per build: a ladder of twelve gates asks about the same file. */
let versionCache = new Map();

/**
 * The relied-on rows of a whole-ledger input, when every one of them is unchanged since the reviewed
 * version; otherwise null (and the input is stale by whole-body semantics). The reviewed version is
 * the committed ledger whose body hashes to what the log recorded.
 */
function ledgerRowsUnchanged(full, recorded, log) {
  const key = `${full}|${recorded}`;
  if (!versionCache.has(key)) {
    let reviewed = null;
    try {
      if (inGitRepo(dirname(full))) reviewed = findVersion(full, recorded, (text) => parseDoc(text).bodyHash);
    } catch (err) {
      // Not "no reviewed version": git failed. Fall back to whole-body semantics, loudly.
      console.error(`build-state: cannot read the history of ${full}: ${err.message.split(/\r?\n/)[0]}`);
    }
    versionCache.set(key, reviewed);
  }
  const reviewed = versionCache.get(key);
  if (!reviewed) return null;
  const ids = reliedOnRows(reviewed.text, log.body, log.gate);
  if (ids.length === 0) return null;
  const then = decisionRowsHash(reviewed.text, ids);
  const now = decisionRowsHash(readFileSync(full, 'utf8'), ids);
  return then !== null && then === now ? ids : null;
}


/**
 * Fixtures and examples abbreviate hashes (`4a1c…`), and a builder that called every abbreviated
 * hash a mismatch would report the entire sample corpus as stale. A prefix match is enough to tell
 * "this is the file that was reviewed" from "this is a different file", which is the only question
 * being asked.
 */
function hashesMatch(recorded, actual) {
  const clean = recorded.replace(/[….]+$/, '');
  if (!clean) return false;
  return clean.length >= 64 ? clean === actual : actual.startsWith(clean);
}

function normaliseFindings(value) {
  const f = value && typeof value === 'object' ? value : {};
  return {
    blocker: Number(f.blocker ?? 0),
    major: Number(f.major ?? 0),
    minor: Number(f.minor ?? 0),
    info: Number(f.info ?? 0),
  };
}

/**
 * Which findings are still open, read from the log's own tables: everything raised, minus whatever
 * the resolution table marked RESOLVED or ACCEPTED. A finding the author disputed and the reviewer
 * REOPENED stays open, which is the point of recording resolutions per id rather than in bulk.
 */
function openFindingIds(log) {
  const raised = readTable(log.body, 'Findings')
    .map((row) => plain(row.id))
    .filter((id) => /^CR-\d+$/.test(id));

  const closed = new Set(
    readTable(log.body, 'Finding resolution')
      .filter((row) => /RESOLVED|ACCEPTED/i.test(plain(row['reviewer verdict'] ?? '')))
      .map((row) => plain(row.id)),
  );

  return raised.filter((id) => !closed.has(id));
}

function extractBlockedReason(log) {
  const blockers = readTable(log.body, 'Findings').filter((r) => /BLOCKER/i.test(plain(r.severity)));
  if (blockers.length) {
    const first = blockers[0];
    return `${plain(first.id)}: ${plain(first.problem || first.finding)} — owner: ${plain(first.owner) || 'unassigned'}`;
  }
  const verdict = log.body.split('## Verdict')[1];
  return verdict ? verdict.trim().split('\n')[0] : 'Blocked — see the gate log.';
}

function hasStageArtifacts(root, slug, gate) {
  const dir = join(root, STAGE_DIR[gate](slug));
  try {
    return readdirSync(dir).some((f) => f.endsWith('.md') || f.endsWith('.yaml'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Reading the source documents
// ---------------------------------------------------------------------------------------------

function listSlugs(root) {
  const reviews = join(root, 'reviews');
  const slugs = new Set();
  if (existsSync(reviews)) {
    for (const entry of readdirSync(reviews)) {
      if (entry.startsWith('_')) continue; // reserved — `_repo` holds the GK log, not an initiative
      if (statSync(join(reviews, entry)).isDirectory()) slugs.add(entry);
    }
  }
  // An initiative whose first stage is still being authored has no gate log yet, and leaving it off
  // the board is how work in progress becomes invisible.
  for (const stageDir of ['intake', 'requirements', 'design']) {
    const dir = join(root, stageDir);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (entry !== 'adr' && statSync(join(dir, entry)).isDirectory()) slugs.add(entry);
    }
  }
  return [...slugs].sort();
}

function readGateLogs(root, slug) {
  const dir = join(root, 'reviews', slug);
  const byGate = new Map();
  const slices = new Map();
  byGate.slices = slices;
  byGate.history = [];
  if (!existsSync(dir)) return byGate;

  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    let doc;
    try {
      doc = readDoc(join(dir, file));
    } catch {
      continue;
    }
    const gate = String(doc.frontMatter.gate ?? '');
    if (!ALL_GATES.includes(gate)) continue;

    const entry = { ...doc, relPath: repoPath(root, `reviews/${slug}/${file}`), file };
    byGate.history.push({ fm: doc.frontMatter });

    // A slice review (§5.5) is G7 over one slice's diff. It never decides the gate — the final G7
    // over the whole branch does — so it is kept beside the ladder, latest per slice.
    const scope = String(doc.frontMatter.scope ?? '');
    if (/^slice-\d+$/.test(scope)) {
      const held = slices.get(gate) ?? new Map();
      if (!held.has(scope) || laterLog(entry, held.get(scope))) held.set(scope, entry);
      slices.set(gate, held);
      continue;
    }

    const existing = byGate.get(gate);
    if (!existing || laterLog(entry, existing)) byGate.set(gate, entry);
  }
  return byGate;
}

/**
 * Which of two logs for the same gate is the current one.
 *
 * This used to be a filename comparison, on the reasoning that run-ids are timestamp-ordered so the
 * last filename is the newest log. That holds across runs and breaks within one: §1 gives a whole
 * stage execution a single run-id, so attempt 2 can only be a distinct file by carrying a suffix —
 * and `-` (0x2D) sorts *before* `.` (0x2E), which put `…-a2.md` ahead of `…md` and handed the gate
 * to attempt 1. A CHANGES_REQUESTED would have silently outranked the PASS that resolved it.
 *
 * So order by what the documents actually say: `attempt` within a run, `run_id` between runs. The
 * filename stops being load-bearing, which is the right place for it to stop.
 */
function laterLog(a, b) {
  const runA = String(a.frontMatter?.run_id ?? '');
  const runB = String(b.frontMatter?.run_id ?? '');
  if (runA !== runB) return runA > runB;

  const attemptA = Number(a.frontMatter?.attempt ?? 1);
  const attemptB = Number(b.frontMatter?.attempt ?? 1);
  if (attemptA !== attemptB) return attemptA > attemptB;

  return a.file >= b.file;
}

function readRequirements(root, slug) {
  const path = join(root, 'requirements', slug, 'requirements.md');
  if (!existsSync(path)) return [];
  const doc = readDoc(path);
  const rows = [
    ...readTable(doc.body, 'Functional requirements'),
    ...readTable(doc.body, 'Non-functional requirements'),
  ];
  return rows
    .map((row) => ({
      id: plain(row.id),
      title: plain(row.requirement ?? row.title ?? ''),
      priority: plain(row.priority ?? row.target ?? ''),
      tasks: [],
      covered: false,
    }))
    .filter((r) => /^REQ-\d+$/.test(r.id));
}

function readTasks(root, slug) {
  const path = join(root, 'plan', slug, 'tasks.md');
  if (!existsSync(path)) return [];
  const doc = readDoc(path);
  const progress = readProgressRows(root, slug);
  return readTable(doc.body, 'Tasks')
    .map((row) => ({
      id: plain(row.id),
      title: plain(row.task ?? row.title ?? ''),
      status: normaliseTaskStatus(plain(row.status)),
      stack: plain(row.stack ?? '') || undefined,
      files: splitList(row.files),
      requirements: splitList(row.req ?? row.requirements),
      depends_on: dependsOn(row['depends on']),
      tests: splitList(row.test ?? row.tests),
    }))
    .filter((t) => /^TASK-\d+$/.test(t.id))
    .map((t) => withProgress(t, progress));
}

/**
 * Execution status lives in `implementation/<slug>/progress.md` (§8.1), outside the reviewed plan,
 * so recording a task done never changes the hash G6 was judged on. A task with no progress row
 * keeps the status tasks.md gives it; the last row for a task wins.
 */
function readProgressRows(root, slug) {
  const path = join(root, 'implementation', slug, 'progress.md');
  if (!existsSync(path)) return new Map();
  return latestProgress(readProgress(readFileSync(path, 'utf8')));
}

function withProgress(task, progress) {
  const row = progress.get(task.id);
  if (!row) return task;
  const out = { ...task, status: normaliseTaskStatus(row.status) };
  if (row.commit && !/^[—-]$/.test(row.commit)) out.commit = row.commit;
  if (row.status === 'blocked' && row.note) out.blocked_by = row.note;
  return out;
}

function uiApproved(root, slug) {
  const path = join(root, 'ui', slug, 'visual-design.md');
  if (!existsSync(path)) return false;
  const fm = readDoc(path).frontMatter;
  return Boolean(fm.approved_by && fm.approved_on);
}

function readDecisions(root, slug) {
  const path = join(root, 'decisions', `${slug}.md`);
  if (!existsSync(path)) return [];
  const doc = readDoc(path);
  return readTable(doc.body, 'Decisions')
    .map((row) => {
      const status = (plain(row.status) || 'open').toLowerCase();
      return {
        id: plain(row.id),
        question: plain(row.question),
        status,
        blocks: splitList(row.blocks),
        answer: plain(row.answer ?? ''),
        // An open decision only blocks when a gate is actually waiting on it. One that blocks a task
        // three stages away is a question worth asking, not a reason to stop.
        blocking: status === 'open' && splitList(row.blocks).some((b) => /^G\d+$/.test(b)),
      };
    })
    .filter((d) => /^DEC-\d+$/.test(d.id));
}

function linkRequirementsToTasks(requirements, tasks) {
  for (const req of requirements) {
    req.tasks = tasks.filter((t) => t.requirements.includes(req.id)).map((t) => t.id);
    req.covered = req.tasks.length > 0;
  }
}

/**
 * GK, derived exactly like any other gate (§16).
 *
 * An earlier version of this returned `PRESENT` when the folder had files in it. That was wrong in
 * a way worth recording: `PRESENT` is not one of the nine states in §4.1, so nothing downstream
 * could reason about it — and more importantly, it said the cards exist, not that anyone had
 * checked them. Six confidently wrong knowledge cards are `PRESENT`. Reusing `deriveStage` means GK
 * gets the same verdict handling and the same staleness rule as everything else: edit a card after
 * its review and the gate goes STALE, because the log hashes the cards as its outputs.
 *
 * `cards` is kept alongside for consumers that want the grounding commits without walking the
 * outputs, and because `sourceHash` fingerprints them.
 */
function buildKnowledge(root) {
  const dir = join(root, 'knowledge');
  const cards = [];
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const doc = readDoc(join(dir, file));
      cards.push({
        path: repoPath(root, `knowledge/${file}`),
        sha256: doc.bodyHash,
        grounded_at: doc.frontMatter.grounded_at ?? null,
      });
    }
  }

  const log = readGateLogs(root, KNOWLEDGE_SLUG).get(KNOWLEDGE_GATE);
  const knowledge = deriveStage(root, KNOWLEDGE_SLUG, KNOWLEDGE_GATE, log);
  knowledge.cards = cards;
  return knowledge;
}

function readIntakeField(root, slug, field) {
  const path = join(root, 'intake', slug, 'problem.md');
  if (!existsSync(path)) return null;
  try {
    const value = readDoc(path).frontMatter[field];
    return value == null ? null : String(value);
  } catch {
    return null;
  }
}

function readTitle(root, slug) {
  for (const candidate of [
    join(root, 'requirements', slug, 'prd.md'),
    join(root, 'intake', slug, 'problem.md'),
  ]) {
    if (!existsSync(candidate)) continue;
    const doc = readDoc(candidate);
    const summary = doc.body.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('<'));
    if (summary) return summary.trim().replace(/^[*_>\s]+/, '').slice(0, 120);
  }
  return slug;
}

/**
 * The profile lands in `.claude/` when the bundle is installed, and sits beside the dev root when
 * the bundle is being developed. Walking up a few levels and checking both spellings covers every
 * layout without making the caller pass a path it should not have to know.
 */
function readProjectName(root) {
  let dir = root;
  for (let depth = 0; depth < 4; depth += 1) {
    for (const candidate of ['DEV-PROFILE.md', join('.claude', 'DEV-PROFILE.md')]) {
      const path = join(dir, candidate);
      if (!existsSync(path)) continue;
      const match = /^- \*\*Name:\*\*\s*`?([^`\n]+)`?/m.exec(readFileSync(path, 'utf8'));
      if (match && !match[1].startsWith('<')) return match[1].trim();
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'Unnamed project';
}

function splitList(cell) {
  return plain(cell)
    .split(/[,;·]/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '—' && s !== '-' && s !== 'none');
}

function normaliseTaskStatus(value) {
  const v = value.toLowerCase().replace(/\s+/g, '-');
  return ['todo', 'in-progress', 'blocked', 'done'].includes(v) ? v : 'todo';
}

/**
 * Per gate, what it has cost so far (§8, §4.3): full reviews since its last PASS against the cap,
 * when its first log was written, and the tokens size.mjs actual recorded — null when nobody
 * recorded them, never an estimate.
 */
function budgetStages(root, slug, stages, history) {
  const { open } = roundsOf(history);
  let actual = {};
  try { actual = JSON.parse(readFileSync(join(root, 'estimates', `${slug}.json`), 'utf8')).actual ?? {}; } catch { /* no record */ }
  for (const stage of stages) {
    const first = history.filter((l) => String(l.fm.gate) === stage.gate).map((l) => String(l.fm.run_id ?? '')).filter(Boolean).sort()[0];
    stage.rounds = { used: open.get(stage.gate) ?? 0, cap: ROUND_CAP };
    stage.first_log_at = first ? runIdToIso(first) : null;
    stage.tokens = Number.isFinite(actual[stage.gate]?.tokens) ? actual[stage.gate].tokens : null;
  }
}

function runIdToIso(runId) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(String(runId ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

function bySlug(a, b) {
  return a.slug.localeCompare(b.slug);
}

// ---------------------------------------------------------------------------------------------
// The human-readable board
// ---------------------------------------------------------------------------------------------

const MARK = {
  PASS: '✔', SKIPPED: '–', STALE: '⟳', BLOCKED: '✖', CHANGES_REQUESTED: '±',
  REVIEWING: '◑', AUTHORING: '◐', READY: '○', NOT_STARTED: '·',
};

export /**
 * Writes only when something other than the timestamp moved.
 *
 * `generated_at` changes on every run, so a naive write makes the index differ from its committed
 * copy every single time it is rebuilt. That is not cosmetic: the index is committed (§8), and CI
 * compares the rebuild against what was committed to catch a stale read model. With a moving
 * timestamp that comparison fails on every pipeline, and a check that always fails is a check
 * everyone learns to ignore - which costs you the one thing it was protecting.
 *
 * So the timestamp is treated as metadata about the run, not as content: if the rest is
 * byte-identical, the file on disk is left exactly as it was.
 */
function writeStable(path, next) {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (stripGeneratedAt(current) === stripGeneratedAt(next)) return;
  }
  writeFileSync(path, next, 'utf8');
}

/** Both renderings carry the timestamp once; blanking only it keeps a builder-version change visible. */
function stripGeneratedAt(text) {
  return text
    .replace(/"generated_at":\s*"[^"]*"/, '"generated_at": ""')
    .replace(/^Generated \S+/m, 'Generated');
}

export function renderDashboard(state, prefix = 'dev') {
  const lines = [
    `<!-- Generated by ${prefix}/scripts/build-state.mjs — do not edit. Run \`npm run dev:state\`. -->`,
    '',
    `# ${state.project} — pipeline`,
    '',
    `Generated ${state.generated_at} · builder ${state.generator_version} · schema ${state.schema}`,
    '',
    `Legend: ${Object.entries(MARK).map(([k, v]) => `${v} ${k.toLowerCase().replace('_', ' ')}`).join(' · ')}`,
    '',
    `| Initiative | Class | ${GATES.join(' | ')} | At | Open |`,
    `|---|---|${GATES.map(() => '---').join('|')}|---|---|`,
  ];

  for (const i of state.initiatives) {
    const cells = GATES.map((g) => MARK[i.stages.find((s) => s.gate === g)?.state ?? 'NOT_STARTED']);
    const open = i.stages.reduce((n, s) => n + s.open_findings.length, 0);
    lines.push(`| ${i.slug} | ${i.change_class} | ${cells.join(' | ')} | ${i.current_gate} | ${open || '—'} |`);
  }

  for (const i of state.initiatives) {
    const notes = [];
    for (const s of i.stages) {
      if (s.blocked_reason) notes.push(`- **${s.gate} blocked** — ${s.blocked_reason}`);
      if (s.state === 'STALE') {
        notes.push(`- **${s.gate} stale** — ${s.stale_because?.[0]?.path ?? 'an input changed'}`);
      }
    }
    for (const d of i.decisions.filter((x) => x.status === 'open')) {
      notes.push(`- **${d.id} open** — ${d.question}${d.blocks.length ? ` (blocks ${d.blocks.join(', ')})` : ''}`);
    }
    for (const s of i.stages.filter((x) => x.rounds?.used && !['PASS', 'SKIPPED'].includes(x.state))) {
      const days = s.first_log_at ? Math.floor((Date.parse(state.generated_at) - Date.parse(s.first_log_at)) / 864e5) : null;
      const over = s.rounds.used >= s.rounds.cap ? ' — at the cap: the next round needs a `round_decision` from the human' : '';
      notes.push(`- **${s.gate} round ${s.rounds.used}/${s.rounds.cap}**${days === null ? '' : ` · open ${days} day(s) since its first log`}${s.tokens === null ? '' : ` · ${s.tokens} tokens recorded`}${over}`);
    }
    if (notes.length) lines.push('', `## ${i.slug}`, '', ...notes);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--hash')) return hashCommand(argv.slice(argv.indexOf('--hash') + 1));

  const root = rootFromArgv(argv);
  const check = argv.includes('--check');
  const quiet = argv.includes('--quiet');

  if (!existsSync(root)) {
    console.error(`build-state: no SDLC root at ${root}. Pass --root <path>, or set DEV-PROFILE "SDLC root".`);
    process.exit(2);
  }

  const state = buildState(root);
  const statePath = join(root, 'state.json');
  const dashboardPath = join(root, 'DASHBOARD.md');
  const json = `${JSON.stringify(state, null, 2)}\n`;

  if (check) {
    if (!existsSync(statePath)) {
      console.error('build-state --check: state.json does not exist.');
      process.exit(1);
    }
    const existing = JSON.parse(readFileSync(statePath, 'utf8'));
    // source_hash fingerprints the logs and the hashes they *recorded*, so an artifact edited on
    // disk leaves it unchanged. The derived states are what a stale index gets wrong (CR-461).
    const moved = stateDrift(existing, state);
    if (moved.length) {
      console.error(
        'build-state --check: state.json records gate states a fresh derive does not reach:\n' +
          moved.map((m) => `  ${m}`).join('\n') +
          '\n  The index is derived — run `npm run dev:state` rather than editing it.',
      );
      process.exit(1);
    }
    if (existing.source_hash !== state.source_hash) {
      console.error(
        'build-state --check: state.json does not match the files on disk.\n' +
          `  recorded source_hash ${existing.source_hash}\n` +
          `  derived  source_hash ${state.source_hash}\n` +
          '  The index is derived — run `npm run dev:state` rather than editing it.',
      );
      process.exit(1);
    }
    if (!quiet) console.log('build-state --check: state.json is current.');
    return;
  }

  const prior = existsSync(statePath) ? safeJson(readFileSync(statePath, 'utf8')) : null;
  mkdirSync(dirname(statePath), { recursive: true });
  writeStable(statePath, json);
  // Printed even with --quiet: a wrong hash is caught here, on the build that first sees the log,
  // instead of surfacing later as a STALE nobody can explain.
  for (const line of bornStale(prior, state)) console.error(line);
  // The addons' Activity and Needs you views read these (docs/activity-format.md).
  logActivity(root, stateEvents(prior, state));
  writeStable(dashboardPath, renderDashboard(state, rootPrefix(root)));

  if (!quiet) {
    const counts = new Map();
    for (const i of state.initiatives) {
      for (const s of i.stages) counts.set(s.state, (counts.get(s.state) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .filter(([k]) => k !== 'NOT_STARTED')
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    console.log(
      `build-state: ${state.initiatives.length} initiative(s) → ${relative(process.cwd(), statePath)}` +
        (summary ? `\n  ${summary}` : ''),
    );
  }
}

/**
 * Every gate whose recorded state differs from the derived one, as `<slug> <gate>: <was> -> <now>`.
 * GK is compared too; an initiative present on one side only is reported once.
 */
export function stateDrift(recorded, derived) {
  const states = (s) => {
    const out = new Map();
    if (s?.knowledge?.gate) out.set(`${KNOWLEDGE_SLUG} ${KNOWLEDGE_GATE}`, s.knowledge.state);
    for (const i of s?.initiatives ?? []) for (const st of i.stages ?? []) out.set(`${i.slug} ${st.gate}`, st.state);
    return out;
  };
  const was = states(recorded);
  const now = states(derived);
  const out = [];
  for (const key of [...new Set([...was.keys(), ...now.keys()])].sort()) {
    if (was.get(key) !== now.get(key)) out.push(`${key}: ${was.get(key) ?? 'absent'} -> ${now.get(key) ?? 'absent'}`);
  }
  return out;
}

/**
 * `--hash` is the reviewer's tool. Gate logs record the body hash of everything a gate produced and
 * everything it consumed (§5.1), and those hashes are what turn "someone edited the requirements"
 * into a STALE gate rather than a silent divergence. So they have to be real.
 */
const WIN_SEP = String.fromCharCode(92);

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Logs this build sees for the first time whose own recorded hashes already disagree with the files.
 * A reviewer that hashed by eye, or reused a hash from an earlier log, writes a log that is STALE
 * the moment it lands; found later, the cause is lost. With no prior state.json nothing is "new".
 */
export function bornStale(prior, state) {
  if (!prior) return [];
  const seen = new Set();
  for (const i of prior.initiatives ?? []) for (const s of i.stages ?? []) if (s.log) seen.add(s.log);
  const out = [];
  for (const i of state.initiatives) {
    for (const s of i.stages) {
      if (!s.log || seen.has(s.log) || s.state !== 'STALE') continue;
      const own = (s.stale_because ?? []).filter((r) => r.path !== 'code');
      if (!own.length) continue;
      out.push(`build-state: ${s.log} is STALE as soon as it is written — its recorded hash does not match ${own.map((r) => r.path).join(', ')}. Re-hash with \`build-state.mjs --hash <path>\`; never by eye or from an earlier log.`);
    }
  }
  return out;
}

function hashCommand(paths) {
  if (paths.length === 0) {
    console.error('build-state --hash: give at least one artifact path.');
    process.exit(2);
  }
  let failed = false;
  for (const p of paths) {
    const { file, ids } = splitRef(p);
    const full = resolve(process.cwd(), file);
    if (!existsSync(full)) {
      console.error(`build-state --hash: no such file — ${p}`);
      failed = true;
      continue;
    }
    const hash = hashRef(ids ? `${full}#${ids.join(',')}` : full);
    if (hash === null) {
      console.error(`build-state --hash: ${file} has no Decisions row for one of ${ids.join(', ')}`);
      failed = true;
      continue;
    }
    // Paths are printed with forward slashes so a hash copied off a Windows terminal pastes into a
    // gate log that a Linux CI run will still match. WIN_SEP avoids a literal backslash here.
    console.log(`${hash}  ${p.split(WIN_SEP).join('/')}`);
  }
  if (failed) process.exit(1);
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-state.mjs')) {
  main(process.argv.slice(2));
}
