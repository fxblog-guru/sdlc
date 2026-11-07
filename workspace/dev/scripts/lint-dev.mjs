#!/usr/bin/env node
/**
 * lint-dev.mjs — the contract linter (DEV-CONTRACTS §11).
 *
 * This checks the mechanical half of the contract and nothing else: is the front matter present and
 * complete, do the headings match the template byte for byte, is every id well-formed, is every
 * vocabulary token one the contract knows, does every checklist row carry evidence. It never asks
 * whether the architecture is sound or the index is justified — that is the reviewing skill's job,
 * on a clean context, with evidence. A linter that starts grading becomes a second, worse reviewer
 * that the author has to argue with on every write, and because this runs on the PostToolUse hook,
 * that argument costs a write→lint→fix→write loop every time.
 *
 * Two classes of finding:
 *   error — blocks. The write is invalid against the contract.
 *   warn  — advisory. Collected for the reviewer; never blocks the author.
 *
 *   node dev/scripts/lint-dev.mjs [--root dev] [--templates <dir>] [--file <path>] [--json] [--quiet]
 *
 *   --file      lint one file (what the hook does). Files outside the dev root, derived files and
 *               templates are skipped silently — exit 0 — so the hook is quiet where it has no say.
 *   --json      machine-readable output for CI and tests.
 *
 * Exit code: 1 if any error, otherwise 0.
 */

import { ROUND_CAP, roundsOf } from './lib/rounds.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { hashArtifact, plain, readDoc, readTable, splitCells, splitRef } from './lib/doc.mjs';
import { behaviourRows } from './lib/behaviour.mjs';
import { PLAN_STATUS, TASK_STATUS, dependsOn, findCycles, readProgress } from './lib/tasks.mjs';
import { budgetProblems, opName, readOperations } from './lib/perf.mjs';
import { checkMatrix, problemTypes } from './lib/error-ux.mjs';
import { readProfile } from './lib/profile.mjs';
import { locateRef, rootFromArgv, stripRoot } from './lib/root.mjs';
import { logRun } from './lib/runlog.mjs';
import { checkResponsive, checkRoles, checkStates, checkTrace, screens as uiScreens } from './lib/ui-spec.mjs';
import { RESULT_LINE, byId as uiCriteria, judge as judgeUiScore, readStatus, verdictsFor } from './lib/ui-score.mjs';

// ---------------------------------------------------------------------------------------------
// Vocabulary — DEV-CONTRACTS §10, byte-exact.
// ---------------------------------------------------------------------------------------------

const isInitiative = (cls) => String(cls ?? '') === 'initiative';

export const VOCAB = {
  verdict: ['PASS', 'CHANGES_REQUESTED', 'BLOCKED', 'SKIPPED'],
  severity: ['BLOCKER', 'MAJOR', 'MINOR', 'INFO'],
  findingClass: ['defect', 'drift', 'bookkeeping', 'follow-up'],
  checklistResult: ['PASS', 'FAIL', 'N/A'],
  checklistResultG4: ['NOT_RUN', 'UNKNOWN'], // §13.12
  resolution: ['RESOLVED', 'ACCEPTED', 'REOPENED', 'DEFERRED'],
  skipReasonType: ['NOT_APPLICABLE', 'DEFERRED', 'HUMAN_OVERRIDE'],
  artifactStatus: ['draft', 'in-review', 'superseded'],
  taskStatus: ['todo', 'in-progress', 'blocked', 'done'],
  changeClass: ['initiative', 'change', 'fix', 'refactor', 'spike', 'fast'],
  decisionStatus: ['open', 'answered', 'assumed', 'withdrawn'],
  stage: [
    'knowledge', 'intake', 'requirements', 'design', 'data', 'api', 'ui', 'plan',
    'implementation', 'verification', 'release', 'deployment', 'monitoring',
  ],
  gate: ['GK', 'G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'],
};

const ARTIFACT_FIELDS = ['slug', 'stage', 'artifact', 'status', 'authored_by', 'reviewed_by', 'created', 'updated'];
const KNOWLEDGE_FIELDS = ['stage', 'artifact', 'status', 'authored_by', 'reviewed_by', 'grounded_at', 'created', 'updated'];
const GATE_LOG_FIELDS = [
  'slug', 'gate', 'stage', 'run_id', 'attempt', 'verdict', 'reviewer',
  'inputs', 'outputs', 'findings', 'unlocks', 'skip_reason', 'override', 'revalidated_from',
];

/** Id formats — DEV-CONTRACTS §1. A malformed id is a join key nothing will ever join on. */
const ID_PATTERNS = {
  REQ: /^REQ-\d{3,}$/,
  ADR: /^ADR-\d{3,}$/,
  TASK: /^TASK-\d{3,}$/,
  CR: /^CR-\d{3,}$/,
  DEC: /^DEC-\d{3,}$/,
  SLO: /^SLO-\d{3,}$/,
  MIG: /^MIG-\d{12}$/,
  AC: /^AC-\d{3,}$/,
};

const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
const PLACEHOLDER = /<[A-Za-z][^<>\n]{0,120}>/g;

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

/**
 * A template file carries two front-matter blocks: the template header (`template_for`, gate,
 * author, reviewer) and, after an explanatory comment, the artifact front matter the author will
 * copy. The `##` headings after that second block are the contract for that artifact type.
 */
export function loadTemplates(dir) {
  const templates = new Map();
  if (!existsSync(dir)) return templates;

  for (const file of walk(dir).filter((f) => f.endsWith('.md'))) {
    const doc = readDoc(file);
    const name = doc.frontMatter.template_for;
    if (!name) continue;

    // The body after the header block contains the comment, the artifact front matter, and the
    // headings. Split off the artifact block if present.
    let rest = doc.body;
    let artifactStage = null;
    const secondBlock = /\n---\n([\s\S]*?)\n---\n/.exec(`\n${rest}`);
    if (secondBlock) {
      const m = /^stage:\s*(.+)$/m.exec(secondBlock[1]);
      if (m && !m[1].trim().startsWith('<')) artifactStage = m[1].trim();
      rest = rest.slice(rest.indexOf(secondBlock[0].trimStart()) + secondBlock[0].trimStart().length);
    }

    templates.set(name, {
      name,
      file,
      headings: headingsOf(rest),
      stage: artifactStage,
      isGateLog: name === 'gate-log',
    });
  }
  return templates;
}

function headingsOf(body) {
  return body
    .split('\n')
    .filter((l) => /^## /.test(l))
    .map((l) => l.replace(/\s*<!--.*?-->\s*$/, '').trim());
}

// ---------------------------------------------------------------------------------------------
// Linting one file
// ---------------------------------------------------------------------------------------------

export function lintFile(absPath, ctx) {
  const rel = toPosix(relative(ctx.root, absPath));
  const findings = [];
  const add = (level, rule, line, message) => findings.push({ file: rel, level, rule, line, message });

  if (shouldSkip(rel)) return findings;
  if (PROGRESS_PATH.test(rel)) {
    lintProgress(absPath, add);
    return findings;
  }

  let doc;
  try {
    doc = readDoc(absPath);
  } catch (err) {
    add('error', 'E000', 1, `cannot read: ${err.message}`);
    return findings;
  }

  const isGateLog = rel.startsWith('reviews/');
  const isKnowledge = rel.startsWith('knowledge/');

  if (!doc.hasFrontMatter) {
    add('error', 'E001', 1, 'no front matter — every artifact opens with the YAML block in DEV-CONTRACTS §3.1');
    return findings;
  }
  if (doc.frontMatter.__unparsed__) {
    add('error', 'E001', 1, `front matter has lines the contract shape does not allow: ${doc.frontMatter.__unparsed__.slice(0, 2).join(' | ')}`);
  }

  const fm = doc.frontMatter;
  const bodyStart = countLines(doc.rawFrontMatter) + 3;

  if (isGateLog) {
    lintGateLog(doc, fm, rel, bodyStart, ctx, add);
  } else {
    lintArtifact(doc, fm, rel, bodyStart, ctx, add, isKnowledge);
  }

  lintPlaceholders(doc.body, bodyStart, add);
  lintIds(doc.body, bodyStart, add);
  if (!isGateLog) lintUnverified(doc.body, bodyStart, add);
  if (!isGateLog) lintOneFact(doc, fm, rel, bodyStart, ctx, add);

  return findings;
}

/**
 * `implementation/<slug>/progress.md` — execution status, outside the reviewed plan (§8.1). Not an
 * artifact: no front matter or headings are required, and no gate hashes it. What is checked is
 * the table: a status from the §10 vocabulary, and a reason on every blocked row. Whether each
 * task exists is a cross-file question, answered in lintTraceability.
 */
const PROGRESS_PATH = /^implementation\/[^/]+\/progress\.md$/;

function lintProgress(absPath, add) {
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (err) {
    add('error', 'E000', 1, `cannot read: ${err.message}`);
    return;
  }
  for (const row of readProgress(text)) {
    if (!TASK_STATUS.includes(row.status)) {
      add('error', 'E009', row.line, `progress status \`${row.status}\` for ${row.task} — allowed: ${TASK_STATUS.join(', ')}`);
    }
    if (row.status === 'blocked' && (!row.note || /^[—-]$/.test(row.note))) {
      add('error', 'E022', row.line, `${row.task} is blocked with no reason — say what blocks it in Note: a DEC-NNN, a TASK-NNN, or the outside dependency (DEV-CONTRACTS §8.1)`);
    }
  }
  lintIds(text.replace(/\r\n?/g, '\n'), 1, add);
}

function lintArtifact(doc, fm, rel, bodyStart, ctx, add, isKnowledge) {
  const required = isKnowledge ? KNOWLEDGE_FIELDS : ARTIFACT_FIELDS;
  for (const field of required) {
    if (!(field in fm) || fm[field] === null || fm[field] === '') {
      add('error', 'E002', 1, `front matter is missing \`${field}\``);
    }
  }

  const type = String(fm.artifact ?? '');
  const template = ctx.templates.get(type);
  if (!template) {
    add('error', 'E003', 1, `unknown artifact type \`${type}\` — no template declares \`template_for: ${type}\``);
  } else {
    lintHeadings(doc.body, template, bodyStart, add);
    if (template.stage && fm.stage && fm.stage !== template.stage) {
      add('error', 'E015', 1, `artifact \`${type}\` belongs to stage \`${template.stage}\`, front matter says \`${fm.stage}\``);
    }
  }

  if (fm.stage && !VOCAB.stage.includes(String(fm.stage))) {
    add('error', 'E009', 1, `unknown stage \`${fm.stage}\` — allowed: ${VOCAB.stage.join(', ')}`);
  }
  // `approved` is excluded here because E010 below reports it with the one thing E009 cannot say:
  // where the answer moved to. Two rules firing on one token is how a linter teaches people to skim.
  if (fm.status && fm.status !== 'approved' && !VOCAB.artifactStatus.includes(String(fm.status))) {
    add('error', 'E009', 1, `unknown status \`${fm.status}\` — allowed: ${VOCAB.artifactStatus.join(', ')}`);
  }
  if (fm.change_class && !VOCAB.changeClass.includes(String(fm.change_class))) {
    add('error', 'E009', 1, `unknown change_class \`${fm.change_class}\` — allowed: ${VOCAB.changeClass.join(', ')}`);
  }

  const author = String(fm.authored_by ?? '');
  const reviewer = String(fm.reviewed_by ?? '');
  if (author && reviewer && author === reviewer) {
    add('error', 'E007', 1, `authored_by and reviewed_by are both \`${author}\` — a stage may not review its own work`);
  }
  // `approved` was removed from the vocabulary (DEV-CONTRACTS §3.1): approval lives in the gate log,
  // not in the artifact. The rule survives as its own message because files written under the old
  // vocabulary are still out there, and `unknown status` alone would not say where the answer moved.
  if (fm.status === 'approved') {
    add('error', 'E010', 1, '`status: approved` — there is no approved status; the gate log records the verdict (DEV-CONTRACTS §3.1)');
  }

  if (isKnowledge && fm.grounded_at && !/^[0-9a-f]{7,40}$/.test(String(fm.grounded_at))) {
    add('error', 'E006', 1, `grounded_at \`${fm.grounded_at}\` is not a commit sha`);
  }

  // ADR amendments (§1): one dated entry per line, oldest first — the order is what makes "append-
  // only" checkable at all, since the linter has no history to compare against.
  if (type === 'adr') {
    let last = '';
    const lines = doc.body.split('\n');
    const start = lines.findIndex((l) => l.trim() === '## Amendments');
    for (let k = start + 1; start !== -1 && k < lines.length && !/^## /.test(lines[k]); k += 1) {
      const text = lines[k].trim();
      if (!text || text.startsWith('<!--')) continue;
      const date = /^(?:[-*]\s+)?(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
      if (!date) {
        add('error', 'E027', bodyStart + k, 'an amendment entry opens with its date: "YYYY-MM-DD — <clarification or citation> — <who>" (DEV-CONTRACTS §1)');
      } else if (date < last) {
        add('error', 'E027', bodyStart + k, `amendment dated ${date} after one dated ${last} — Amendments is append-only, oldest first (DEV-CONTRACTS §1)`);
      }
      if (date && date > last) last = date;
    }
  }

  if (type === 'ui-spec' && fm.visual_reference != null) {
    const refs = Array.isArray(fm.visual_reference) ? fm.visual_reference : [fm.visual_reference];
    for (const ref of refs) lintVisualReference(ref, ctx.root, add);
  }
  if (type === 'visual-design') lintApproval(fm, add);
  if (type === 'ui-spec') lintUiTables(doc.body, bodyStart, ctx.root, rel, add);

  // Slice mode (§5.5): a lane writes its own change-summary fragment, never the shared file.
  if (/^implementation\/[^/]+\/lanes\//.test(rel)) {
    if (!LANE_PATH.test(rel)) {
      add('error', 'E015', 1, `a lane fragment is named \`implementation/<slug>/lanes/lane-<x>.md\` (lowercase kebab), not \`${basename(rel)}\` (DEV-CONTRACTS §5.5)`);
    } else if (type !== 'change-summary') {
      add('error', 'E015', 1, `a lane fragment is a \`change-summary\`, not \`${type}\` (DEV-CONTRACTS §5.5)`);
    }
  }

  // The consolidated change summary is generated (§4.4): by hand it drifts, and line numbers rot.
  if (CHANGE_SUMMARY_PATH.test(rel)) {
    if (fm.generated_by !== 'change-summary.mjs') {
      add('warn', 'W032', 1, 'change-summary.md is generated — run `node dev/scripts/change-summary.mjs <slug>`; edit the lane notes, not this file (DEV-CONTRACTS §4.4)');
    }
    const k = doc.body.split('\n').findIndex((l) => FILE_LINE.test(l));
    if (k !== -1) {
      add('warn', 'W032', bodyStart + k, 'a `file:line` citation — cite the path and the symbol (`internal/job/service.go` `AssignJob`); line numbers move on the next commit (DEV-CONTRACTS §5.3)');
    }
  }

  // E040 — a behaviour row is a join key a test names (§6); two rows with one id join nothing.
  if (type === 'ui-spec') {
    const seen = new Set();
    for (const row of behaviourRows(doc.body)) {
      if (seen.has(row.id)) add('error', 'E040', bodyStart + row.line - 1, `behaviour row \`${row.id}\` is defined twice — a UB id names one interaction (DEV-CONTRACTS §1, §6)`);
      seen.add(row.id);
    }
  }

  lintTables(doc.body, bodyStart, fm, add);
  lintSections(doc.body, bodyStart, add);
}

// ---------------------------------------------------------------------------------------------
// One fact, one place (§1.1, §3.2) and size budgets (§3.3) — all advisory, all per file, so the
// write hook reports them on the file just written.
// ---------------------------------------------------------------------------------------------

/** §1.1 — every prefix the bundle registers. A project adds its own in DEV-PROFILE `Id prefixes`. */
export const REGISTERED_PREFIXES = ['REQ', 'AC', 'ADR', 'TASK', 'CR', 'DEC', 'OQ', 'THR', 'SEC', 'SLO', 'MIG', 'WD', 'AP', 'UB', 'PO', 'DEF', 'ENT', 'API', 'KC'];
/** Standard, algorithm and advisory names written `NAME-<digits>`: not ids (§1.1). */
const STANDARD_NAMES = new Set(['SHA', 'ISO', 'RFC', 'UTF', 'AES', 'CVE', 'CWE', 'GHSA', 'GO', 'PYSEC', 'TLS', 'HTTP', 'IEEE', 'ECMA', 'PEP', 'WCAG', 'ASVS', 'NIST', 'OWASP', 'BCP', 'FIPS', 'IEC', 'EN', 'X', 'P', 'UUID', 'ULID', 'PKCS', 'ES', 'HS', 'RS', 'PS', 'CHACHA20', 'BLAKE2B']);
const ID_TOKEN = /\b([A-Z][A-Z0-9]*)-(\d{2,})\b/g;
const CELL_MAX = 300;

/** §3.3 word caps per artifact type; a function takes the body and returns the cap. */
const WORD_CAPS = {
  problem: 1500, prd: 6000, requirements: 10000, 'acceptance-criteria': 15000, glossary: 3000,
  architecture: 12000, adr: 1500, impact: 5000, 'threat-model': 6000, 'data-model': 12000,
  'migration-plan': 5000, 'contract-diff': 4000, 'visual-design': 3000, observability: 4000, runbook: 6000,
  'ui-spec': (body) => Math.max(3000, 1500 * readTable(body, 'Screens').length),
  tasks: (body) => Math.max(3000, 150 * readTable(body, 'Tasks').length),
};

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function glossaryOf(ctx, slug) {
  ctx.glossaries ??= new Map();
  if (!ctx.glossaries.has(slug)) {
    const terms = [];
    const abs = join(ctx.root, 'requirements', slug, 'glossary.md');
    if (existsSync(abs)) {
      try {
        for (const row of readTable(readDoc(abs).body, 'Terms')) {
          const term = plain(row.term);
          for (const not of plain(row.not).split(/\s*[·,;]\s*/)) {
            if (term && not && !/^[—–-]+$/.test(not)) terms.push({ not, term, re: new RegExp(`(?<![\\w-])${escapeRe(not)}(?![\\w-])`, 'i') });
          }
        }
      } catch { /* an unreadable glossary reports its own E000 */ }
    }
    ctx.glossaries.set(slug, terms);
  }
  return ctx.glossaries.get(slug);
}

function lintOneFact(doc, fm, rel, bodyStart, ctx, add) {
  const prose = withoutCode(doc.body);
  const type = String(fm.artifact ?? '');

  // W090 — a banned synonym (§3.2). The glossary is where the banned words are written down.
  const slug = rel.split('/')[1]?.replace(/\.md$/, '');
  if (slug && type !== 'glossary' && !rel.startsWith('knowledge/')) {
    const terms = glossaryOf(ctx, slug);
    prose.forEach((line, i) => {
      for (const t of terms) {
        if (t.re.test(line)) add('warn', 'W090', bodyStart + i, `\`${t.not}\` — the glossary's term is \`${t.term}\` (requirements/${slug}/glossary.md, DEV-CONTRACTS §3.2)`);
      }
    });
  }

  // W091 — an id-shaped token whose prefix nothing registers (§1.1). Reported once per prefix.
  ctx.profile ??= readProfile(ctx.root);
  const known = new Set([...REGISTERED_PREFIXES, ...ctx.profile.idPrefixes, ...(ctx.profile.trackerPrefix ? [ctx.profile.trackerPrefix] : [])]);
  const seen = new Set();
  prose.forEach((line, i) => {
    for (const m of line.matchAll(ID_TOKEN)) {
      if (known.has(m[1]) || STANDARD_NAMES.has(m[1]) || seen.has(m[1])) continue;
      seen.add(m[1]);
      add('warn', 'W091', bodyStart + i, `\`${m[0]}\` has an unregistered prefix — use a §1.1 id, or register \`${m[1]}\` under DEV-PROFILE §Project \`Id prefixes\` (DEV-CONTRACTS §1.1)`);
    }
  });

  // W092 — the artifact's word cap (§3.3).
  const cap = typeof WORD_CAPS[type] === 'function' ? WORD_CAPS[type](doc.body) : WORD_CAPS[type];
  if (cap) {
    const words = doc.body.split(/\s+/).filter(Boolean).length;
    if (words > cap) add('warn', 'W092', bodyStart, `${words.toLocaleString('en-US')} words, over the ${cap.toLocaleString('en-US')}-word cap for \`${type}\` — move detail to an ADR, an appendix artifact or a diagram and link it (DEV-CONTRACTS §3.3)`);
  }

  // W093 — a table cell that is a paragraph (§3.3). Once per file: the first long row and a count,
  // since one finding per row buried every other warning (release-management: 400+ on its ledgers).
  const long = [];
  doc.body.split('\n').forEach((line, i) => {
    if (!/^\s*\|/.test(line)) return;
    const longest = Math.max(...line.replace(/\\\|/g, '  ').split('|').slice(1, -1).map((c) => c.trim().length));
    if (longest > CELL_MAX) long.push({ i, longest });
  });
  if (long.length) {
    const [first] = long;
    const more = long.length > 1 ? ` (and ${long.length - 1} more row${long.length > 2 ? 's' : ''})` : '';
    add('warn', 'W093', bodyStart + first.i, `a table cell of ${first.longest} characters (max ${CELL_MAX})${more} — a cell that long is a paragraph; move it under a heading and cite it (DEV-CONTRACTS §3.3)`);
  }
}

const CHANGE_SUMMARY_PATH = /^implementation\/[^/]+\/change-summary\.md$/;
/** `path/file.ext:42` or `:42-57` — a file with an extension, then a line. `10:30` is not one. */
const FILE_LINE = /[\w./-]+\.[A-Za-z]{1,6}:\d+/;
/** The two things a picture the requester approved can bind (§13.3). */
export const VISUAL_KINDS = ['wireframe', 'visual'];

/**
 * E028 — a picture a ui-spec binds (§13.3) is still the file the requester approved. A reference
 * that silently moved or changed would make G7 build to a picture nobody approved. Path is
 * repo-relative (`dev/...` like a gate-log ref); the hash is the §5.2 one, which
 * `build-state.mjs --hash <path>` prints. W033: a reference with no `kind` predates the split and
 * is read as a wireframe, which binds content and layout but never look. A low-fi wireframe taken
 * as the look is how a product ships grey with every gate green.
 */
function lintVisualReference(ref, root, add) {
  const why = 'visual_reference is `{ path: <repo path>, sha256: <64 hex>, kind: wireframe | visual }`, or a list of them (DEV-CONTRACTS §13.3)';
  if (!ref || typeof ref !== 'object' || !ref.path || !/^[0-9a-f]{64}$/.test(String(ref.sha256 ?? ''))) {
    add('error', 'E028', 1, `${why}; got \`${typeof ref === 'object' ? JSON.stringify(ref) : ref}\` — hash it with \`node dev/scripts/build-state.mjs --hash <path>\``);
    return;
  }
  if (ref.kind == null) {
    add('warn', 'W033', 1, `visual_reference \`${ref.path}\` has no \`kind\` — read as \`wireframe\`: it binds content and layout, not look. Add \`kind: wireframe\`, or \`kind: visual\` for an approved high-fidelity design (DEV-CONTRACTS §13.3)`);
  } else if (!VISUAL_KINDS.includes(String(ref.kind))) {
    add('error', 'E028', 1, `visual_reference \`${ref.path}\` has kind \`${ref.kind}\` — allowed: ${VISUAL_KINDS.join(', ')} (DEV-CONTRACTS §13.3)`);
  }
  const path = String(ref.path).replace(/\\/g, '/');
  if (/^(\/|[A-Za-z]:)/.test(path) || path.split('/').includes('..')) {
    add('error', 'E028', 1, `visual_reference \`${path}\` must be a path inside the repository, not absolute and without \`..\``);
    return;
  }
  const full = locateRef(root, path);
  if (!existsSync(full)) {
    add('error', 'E028', 1, `visual_reference \`${path}\` does not exist — the approved visual must be committed where the spec says`);
    return;
  }
  const actual = hashArtifact(full);
  if (actual !== ref.sha256) {
    add('error', 'E028', 1, `visual_reference \`${path}\` hashes to ${actual.slice(0, 12)}…, not the recorded ${String(ref.sha256).slice(0, 12)}… — it changed after approval; get the change approved, then record the new hash`);
  }
}

/**
 * E029 — approving the visual design is the requester's act, by name (§3.1). A design "approved" by
 * an agent is the look chosen by the thing that drew it.
 */
const NOT_A_PERSON = /^(dev-|sdlc-)|^(user|admin|agent|claude|assistant|system|requester|pending|tbd|none)$/i;
function lintApproval(fm, add) {
  const by = fm.approved_by == null ? '' : String(fm.approved_by).trim();
  // E146 — the other three UI sign-offs (§13.13), each a person, dated with the product owner's.
  if (fm.approvals != null) {
    const a = typeof fm.approvals === 'object' && !Array.isArray(fm.approvals) ? fm.approvals : null;
    if (!a) add('error', 'E146', 1, 'approvals is `{ design: <name>, engineering: <name>, accessibility: <name> }` (DEV-CONTRACTS §13.13)');
    for (const [role, who] of Object.entries(a ?? {})) {
      const name = String(who ?? '').trim();
      if (!name || NOT_A_PERSON.test(name)) add('error', 'E146', 1, `approvals.${role} \`${name}\` is not a person — each UI sign-off is a named human, never an agent (DEV-CONTRACTS §13.13)`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.approved_on ?? ''))) add('error', 'E146', 1, 'approvals are set with no approved_on: YYYY-MM-DD (DEV-CONTRACTS §13.13)');
  }
  if (!by) return;
  if (NOT_A_PERSON.test(by)) add('error', 'E029', 1, `approved_by \`${by}\` is not a person — the requester approves the visual design, by name (DEV-CONTRACTS §3.1)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.approved_on ?? ''))) add('error', 'E029', 1, 'approved_by is set with no approved_on: YYYY-MM-DD (DEV-CONTRACTS §3.1)');
}

/**
 * E140–E144, W140, W141 — the ui-spec tables §13.13 makes countable. E143 needs the slug's contract
 * and W141 the design tokens; each is judged only when that file exists.
 */
function lintUiTables(body, bodyStart, root, rel, add) {
  // A spec with no screen row (`## Screens` N/A — <reason>) has nothing to cross-check.
  if (!uiScreens(body).length) return;
  const { operations, breakpoints } = uiContext(root, rel);
  const ubIds = new Set(behaviourRows(body).map((r) => r.id));
  const level = (rule) => (rule.startsWith('E') ? 'error' : 'warn');
  for (const f of [...checkStates(body), ...checkRoles(body, operations), ...checkTrace(body, operations, ubIds), ...checkResponsive(body, breakpoints)]) {
    add(level(f.rule), f.rule, bodyStart + f.line - 1, f.message);
  }
}

/** The contract's operationIds and the token breakpoints for a ui-spec at `rel` under `root`. */
function uiContext(root, rel) {
  const slug = /^ui\/([^/]+)\/ui-spec\.md$/.exec(rel)?.[1];
  let operations = null;
  let breakpoints = null;
  const api = slug && join(root, 'api', slug, 'openapi.yaml');
  if (api && existsSync(api)) operations = new Set(readOperations(readFileSync(api, 'utf8'), api).map((o) => o.operationId).filter(Boolean));
  const tokens = join(root, 'docs', 'design-tokens.json');
  if (existsSync(tokens)) {
    try { breakpoints = JSON.parse(readFileSync(tokens, 'utf8')).breakpoints ?? null; } catch { breakpoints = null; }
  }
  return { operations, breakpoints };
}

/**
 * E145 — a gate log whose checklist carries a UI score row also carries the `### UI score` table
 * (§13.13), and its stated result and verdict agree with the table recomputed.
 */
function lintUiScore(body, checklist, verdict, bodyStart, add) {
  const row = checklist.find((r) => /UI score/i.test(plain(r.check)));
  if (!row || /^N\/A/.test(plain(row.result))) return;
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === '### UI score');
  const at = (k) => bodyStart + (k < 0 ? 0 : k);
  if (start === -1) {
    add('error', 'E145', lineOf(body, row, bodyStart), 'the checklist has a UI score row and the log has no `### UI score` table under `## Verdict` — node dev/scripts/ui-score.mjs writes its machine rows (DEV-CONTRACTS §13.13)');
    return;
  }
  const rows = [];
  let headers = null;
  let stated = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i].trim();
    if (/^#{2,3} /.test(l)) break;
    const m = RESULT_LINE.exec(l);
    if (m) { stated = { score: Number(m[1]), result: m[2], line: i }; continue; }
    if (!l.startsWith('|')) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const r = Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? '']));
    const st = readStatus(r.status);
    const weight = Number(plain(r.weight));
    if (!st || !Number.isFinite(weight)) {
      add('error', 'E145', at(i), `UI score row \`${plain(r.criterion).slice(0, 60)}\`: status is PASS, FAIL, NOT_RUN, UNKNOWN or N/A — <reason>, weight a number (DEV-CONTRACTS §13.13)`);
      continue;
    }
    if (st.status === 'N/A' && !st.reason) add('error', 'E145', at(i), `UI score row \`${plain(r.criterion).slice(0, 60)}\` is N/A with no reason (DEV-CONTRACTS §13.13)`);
    rows.push({ ...st, weight, evidence: r.evidence ?? '', criterion: plain(r.criterion), mandatory: Boolean(uiCriteria.get(/^(U\d{2})\b/.exec(plain(r.criterion))?.[1])?.mandatory) });
  }
  if (!rows.length) {
    add('error', 'E145', at(start), '`### UI score` has no rows (DEV-CONTRACTS §13.13)');
    return;
  }
  const j = judgeUiScore(rows);
  if (!stated) {
    add('error', 'E145', at(start), `\`### UI score\` has no result line — \`**UI score:** ${j.score} · ${j.result}\` (DEV-CONTRACTS §13.13)`);
    return;
  }
  if (stated.result !== j.result || Math.abs(stated.score - j.score) > 0.1) {
    add('error', 'E145', at(stated.line), `the UI score says ${stated.score} · ${stated.result}; its rows give ${j.score} · ${j.result}${j.why.length ? ` (${j.why.join('; ')})` : ''} (DEV-CONTRACTS §13.13)`);
  }
  if (!verdictsFor(j.result).includes(verdict) && verdict !== 'SKIPPED') {
    add('error', 'E145', at(stated.line), `verdict ${verdict} with a UI score of ${j.result} — only a PASS score may carry a PASS verdict; REVIEW, BLOCKED and NEEDS_CLARIFICATION are CHANGES_REQUESTED (DEV-CONTRACTS §13.13)`);
  }
}

const LEDGER_PATH =/(^|\/)decisions\/[^/]+\.md$/;
const LANE_PATH =/^implementation\/[^/]+\/lanes\/lane-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
/** A commit sha as written in a Scope section: 7–40 hex with at least one letter, so a date is not one. */
const COMMIT_SHA = /\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;

function lintGateLog(doc, fm, rel, bodyStart, ctx, add) {
  for (const field of GATE_LOG_FIELDS) {
    if (!(field in fm)) add('error', 'E002', 1, `gate log is missing \`${field}\``);
  }

  const template = ctx.templates.get('gate-log');
  if (template) lintHeadings(doc.body, template, bodyStart, add);

  const verdict = String(fm.verdict ?? '');
  if (!VOCAB.verdict.includes(verdict)) {
    add('error', 'E009', 1, `unknown verdict \`${verdict}\` — allowed: ${VOCAB.verdict.join(', ')}`);
  }
  if (fm.gate && !VOCAB.gate.includes(String(fm.gate))) {
    add('error', 'E009', 1, `unknown gate \`${fm.gate}\``);
  }
  if (fm.stage && !VOCAB.stage.includes(String(fm.stage))) {
    add('error', 'E009', 1, `unknown stage \`${fm.stage}\``);
  }
  if (fm.run_id && !RUN_ID.test(String(fm.run_id))) {
    add(
      'error',
      'E006',
      1,
      `run_id \`${fm.run_id}\` is not YYYYMMDD-HHMMSS-xxxx (UTC, then 4 lowercase hex) — take one from \`node dev/scripts/run-id.mjs\``,
    );
  }
  if (fm.attempt != null && !(Number.isInteger(fm.attempt) && fm.attempt >= 1 && fm.attempt <= 2)) {
    add('error', 'E009', 1, `attempt must be 1 or 2 (a third round is not attempted — DEV-CONTRACTS §4.3), got \`${fm.attempt}\``);
  }

  // A slice review (§5.5) is G7 over one slice's diff, never the gate's verdict, so it must say
  // which slice and which commits — without them, nobody can retrace what was judged.
  if (fm.scope != null) {
    const scope = String(fm.scope);
    if (!/^slice-[1-9]\d*$/.test(scope)) {
      add('error', 'E009', 1, `scope \`${scope}\` — allowed: slice-<n>, n from 1 (DEV-CONTRACTS §5.5)`);
    } else if (fm.gate !== 'G7') {
      add('error', 'E009', 1, `scope \`${scope}\` on ${fm.gate} — only G7 is reviewed per slice (DEV-CONTRACTS §5.5)`);
    } else if (new Set(section(doc.body, 'Scope').match(COMMIT_SHA) ?? []).size < 2) {
      add('error', 'E024', 1, `slice log with no base and head commit in \`## Scope\` — name both shas, e.g. "base 1a2b3c4 → head 5d6e7f8" (DEV-CONTRACTS §5.5)`);
    }
  }

  // A second round writes a NEW log (§5), and §1 gives the whole stage execution one run-id — so
  // attempt 2 needs a name of its own without inventing a run-id. Hence the `-a<N>` suffix, which
  // attempt 1 omits so every log written before this rule existed stays valid.
  //
  // The suffix is checked against `attempt` rather than merely tolerated: a log named `-a2` that
  // says `attempt: 1` is a copy somebody forgot to finish editing, and it is the kind of mistake
  // that quietly duplicates a verdict.
  if (fm.gate && fm.stage && fm.run_id) {
    const attempt = Number(fm.attempt ?? 1);
    const expected = attempt > 1
      ? `${fm.gate}-${fm.stage}-${fm.run_id}-a${attempt}.md`
      : `${fm.gate}-${fm.stage}-${fm.run_id}.md`;
    if (basename(rel) !== expected) {
      add('error', 'E011', 1, `filename should be \`${expected}\` to match its front matter (attempt ${attempt})`);
    }
  }

  // SKIPPED and skip_reason go together, and only the reviewer or a human may declare it.
  const skip = fm.skip_reason;
  if (verdict === 'SKIPPED') {
    if (!skip || typeof skip !== 'object' || !VOCAB.skipReasonType.includes(String(skip.type))) {
      add('error', 'E012', 1, `SKIPPED needs \`skip_reason: { type: ${VOCAB.skipReasonType.join('|')}, explanation: "…" }\``);
    } else if (!skip.explanation) {
      add('error', 'E012', 1, 'skip_reason has no explanation — quote the applicability rule and say why this change does not meet it');
    }
  } else if (skip && skip !== null) {
    add('error', 'E012', 1, `skip_reason is set but verdict is \`${verdict}\`, not SKIPPED`);
  }

  // A verdict about nothing is not a verdict.
  const outputs = Array.isArray(fm.outputs) ? fm.outputs : [];
  // G7 binds the code it judged by commit (§4.4, §5.1); change-summary.md is generated, not judged.
  if (fm.reviewed_commit != null && fm.gate !== 'G7') {
    add('error', 'E031', 1, `reviewed_commit on ${fm.gate} — only the final G7 log binds code by commit (DEV-CONTRACTS §5.1)`);
  } else if (fm.reviewed_commit != null && !/^[0-9a-f]{7,40}$/.test(String(fm.reviewed_commit))) {
    add('error', 'E031', 1, `reviewed_commit \`${fm.reviewed_commit}\` is not a commit sha — write \`git rev-parse --short HEAD\` of the reviewed revision (DEV-CONTRACTS §5.1)`);
  }
  if (fm.gate === 'G7' && fm.scope == null && ['PASS', 'CHANGES_REQUESTED'].includes(verdict)) {
    if (fm.reviewed_commit == null) {
      add('warn', 'W031', 1, 'a final G7 log with no `reviewed_commit` — the verdict cannot say which code it judged (DEV-CONTRACTS §5.1)');
    }
    if (outputs.some((r) => /(^|\/)implementation\/[^/]+\/change-summary\.md$/.test(String(r?.path ?? '')))) {
      add('warn', 'W031', 1, '`change-summary.md` under outputs — it is generated (change-summary.mjs) and never hashed; G7 binds the code by `reviewed_commit` (DEV-CONTRACTS §4.4)');
    }
  }
  if (['PASS', 'CHANGES_REQUESTED'].includes(verdict) && outputs.length === 0 && !(fm.gate === 'G7' && fm.scope == null && fm.reviewed_commit != null)) {
    add('error', 'E013', 1, `verdict ${verdict} with no \`outputs\` — a gate log records what it reviewed, with a hash per file`);
  }
  for (const ref of [...outputs, ...(Array.isArray(fm.inputs) ? fm.inputs : [])]) {
    if (!ref.path || !ref.sha256) add('error', 'E002', 1, 'every inputs/outputs entry needs `path` and `sha256`');
  }

  // Evidence is not optional (§5.3).
  const checklist = readTable(doc.body, 'Checklist');
  checklist.forEach((row, i) => {
    // plain() strips `_` as emphasis; the vocabulary's NOT_RUN keeps it.
    const result = String(row.result ?? '').replace(/[`*]/g, '').trim().split(/\s|—/)[0];
    // G4 scores its checklist (§13.12): a check not executed and one the artifacts cannot answer
    // are two more words, never written as PASS or FAIL.
    const allowed = fm.gate === 'G4' ? [...VOCAB.checklistResult, ...VOCAB.checklistResultG4] : VOCAB.checklistResult;
    if (result && !allowed.includes(result)) {
      add('error', 'E009', lineOf(doc.body, row, bodyStart), `checklist result \`${plain(row.result)}\` — allowed: ${allowed.join(', ')}`);
    }
    if (!plain(row.evidence)) {
      add('error', 'E008', lineOf(doc.body, row, bodyStart), `checklist row ${i + 1} has no evidence — a check nobody can retrace is not a check`);
    }
  });

  lintUiScore(doc.body, checklist, verdict, bodyStart, add);

  const findingsTable = readTable(doc.body, 'Findings');
  for (const row of findingsTable) {
    const sev = plain(row.severity);
    if (sev && !VOCAB.severity.includes(sev)) {
      add('error', 'E009', lineOf(doc.body, row, bodyStart), `severity \`${sev}\` — allowed: ${VOCAB.severity.join(', ')}`);
    }
    // §5.3: drift and bookkeeping never block. A log with no Class column predates the rule.
    const cls = plain(row.class).toLowerCase();
    if (cls && !VOCAB.findingClass.includes(cls)) {
      add('error', 'E009', lineOf(doc.body, row, bodyStart), `finding class \`${plain(row.class)}\` — allowed: ${VOCAB.findingClass.join(', ')}`);
    } else if (['drift', 'bookkeeping'].includes(cls) && ['BLOCKER', 'MAJOR'].includes(sev)) {
      add('error', 'E030', lineOf(doc.body, row, bodyStart), `${plain(row.id)} is ${cls} at ${sev} — drift and bookkeeping are MINOR or INFO; if it changes what gets built, it is a defect (DEV-CONTRACTS §5.3)`);
    }
    if (!plain(row.owner)) {
      add('warn', 'W003', lineOf(doc.body, row, bodyStart), `finding ${plain(row.id)} has no owner`);
    }
  }

  for (const row of readTable(doc.body, 'Finding resolution')) {
    const v = plain(row['reviewer verdict']);
    if (v && !VOCAB.resolution.includes(v)) {
      add('error', 'E009', lineOf(doc.body, row, bodyStart), `resolution \`${v}\` — allowed: ${VOCAB.resolution.join(', ')}`);
    }
    // A deferral is debt with a name on it: who carries it, and where it is next looked at.
    if (v === 'DEFERRED') {
      const missing = [!deferralOwner(row) && 'an owner (`owner: <who>`)', !deferralTarget(row) && 'a target (`target: G<N>` or `target: TASK-NNN`)'].filter(Boolean);
      if (missing.length) {
        add('error', 'E023', lineOf(doc.body, row, bodyStart), `${plain(row.id)} is DEFERRED without ${missing.join(' or ')} (DEV-CONTRACTS §5.3)`);
      }
    }
  }
  if (fm.attempt === 2 && readTable(doc.body, 'Finding resolution').length === 0) {
    add('error', 'E014', 1, 'attempt 2 with no Finding resolution rows — each prior finding is resolved by id, never in bulk (DEV-CONTRACTS §4.3)');
  }
  if (fm.attempt === 2) lintDeltaReview(doc.body, findingsTable, verdict, bodyStart, add);

  // The decision ledger is a living cross-stage document, not a stage artifact. Filed as an output
  // it becomes "the thing this gate was judged on" — so answering one question marks the reviewed
  // artifact as edited, and `--reaffirm` declines on an output change by design (§4.4). A single
  // answer would then cost a full stage re-run. As an input it does exactly what §15.2 intends:
  // the gate goes STALE against changed facts, and the damping valve still works.
  // A row-scoped reference (§5.2): only the decision ledger may be cited by row, and only by DEC id.
  for (const ref of [...(Array.isArray(fm.inputs) ? fm.inputs : []), ...(Array.isArray(fm.outputs) ? fm.outputs : [])]) {
    const { file, ids } = splitRef(ref?.path ?? '');
    if (!ids) continue;
    if (!LEDGER_PATH.test(file)) {
      add('error', 'E025', 1, `\`${ref.path}\` — only the decision ledger may be cited by row (\`dev/decisions/<slug>.md#DEC-NNN,…\`, DEV-CONTRACTS §5.2)`);
    } else if (!ids.length || ids.some((id) => !ID_PATTERNS.DEC.test(id))) {
      add('error', 'E025', 1, `\`${ref.path}\` — after \`#\` comes a comma-separated list of DEC-NNN ids (DEV-CONTRACTS §5.2)`);
    }
  }

  // A whole-ledger input (§5.2) is read as the rows the log relied on only while git still has the
  // reviewed ledger; citing the rows is what makes the scope hold everywhere. Advisory: old logs
  // keep working, and migrate-ledger-inputs.mjs rewrites them.
  for (const ref of Array.isArray(fm.inputs) ? fm.inputs : []) {
    const { file, ids } = splitRef(ref?.path ?? '');
    if (!ids && LEDGER_PATH.test(file)) {
      add('warn', 'W019', 1, `\`${ref.path}\` is the whole ledger — cite the rows this gate relied on (\`#DEC-NNN,…\`), or run \`node dev/scripts/migrate-ledger-inputs.mjs\` (DEV-CONTRACTS §5.2)`);
    }
  }

  for (const ref of Array.isArray(fm.outputs) ? fm.outputs : []) {
    if (LEDGER_PATH.test(splitRef(ref?.path ?? '').file)) {
      add(
        'error',
        'E016',
        1,
        `\`${ref.path}\` is listed under outputs — the decision ledger is always an input, never an output (DEV-CONTRACTS §15.2)`,
      );
    }
  }

  // The declared counts should describe the table beneath them.
  if (fm.findings && typeof fm.findings === 'object') {
    const counted = { BLOCKER: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
    for (const row of findingsTable) {
      const sev = plain(row.severity);
      if (sev in counted) counted[sev] += 1;
    }
    for (const [k, v] of Object.entries(counted)) {
      const declared = Number(fm.findings[k.toLowerCase()] ?? 0);
      if (declared !== v) {
        add('warn', 'W005', 1, `findings.${k.toLowerCase()} says ${declared}, the Findings table has ${v}`);
      }
    }
  }

  lintSections(doc.body, bodyStart, add);
}

/**
 * Headings a template may end with that an artifact may omit. An ADR is immutable, but may gain a
 * dated, append-only `## Amendments` section (§1) — absent until the first amendment, and always
 * last. Accepted whether or not the template on disk already carries it.
 */
// A lane note's friction list is new in this bundle: a project on an older template must not fail on it.
const OPTIONAL_TRAILING = { adr: ['## Amendments'], problem: ['## Pillars'], 'change-summary': ['## Process friction'] };

function lintHeadings(body, template, bodyStart, add) {
  const optional = OPTIONAL_TRAILING[template.name] ?? [];
  const actual = headingsOf(body);
  if (optional.includes(actual.at(-1))) actual.pop();
  const expected = template.headings.filter((h) => !optional.includes(h));
  const max = Math.max(actual.length, expected.length);
  for (let i = 0; i < max; i += 1) {
    if (actual[i] === expected[i]) continue;
    const line = actual[i] ? lineOfText(body, actual[i], bodyStart) : bodyStart + body.split('\n').length;
    if (actual[i] === undefined) {
      add('error', 'E004', line, `missing heading \`${expected[i]}\` (template ${basename(template.file)}, position ${i + 1})`);
    } else if (expected[i] === undefined) {
      add('error', 'E004', line, `unexpected heading \`${actual[i]}\` — add detail inside a section, never a new top-level section`);
    } else {
      add('error', 'E004', line, `heading \`${actual[i]}\` should be \`${expected[i]}\` (template ${basename(template.file)}, position ${i + 1})`);
    }
    break; // one drift finding per file — the rest cascade from it
  }
}

function lintPlaceholders(body, bodyStart, add) {
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    // Angle brackets inside code spans or fences are content, not placeholders.
    if (/^\s*```/.test(line) || /`[^`]*<[^`]*`/.test(line)) return;
    const hits = line.match(PLACEHOLDER);
    if (!hits) return;
    for (const hit of hits) {
      if (/^<(https?:|\/|!--|br\s*\/?|\w+@)/.test(hit)) continue;
      add('error', 'E005', bodyStart + i, `leftover placeholder \`${hit}\` — a placeholder never survives a gate`);
    }
  });
}

/**
 * `REQ-NNN` is not a malformed `REQ-007`; it is how §1 writes "an id of this shape", and every
 * published checklist uses it. §5.3 requires a gate log to quote its checklist rows **verbatim**, so
 * without this exemption the two rules contradict: a reviewer who quotes correctly cannot lint
 * clean, and the only way out is to paraphrase the checklist — which is exactly the drift the
 * verbatim rule exists to prevent.
 *
 * Found in the live shakedown by a G1 reviewer, which chose to alter the wording and disclose the
 * deviation rather than ship a red lint. That was the right call and it should never have been
 * necessary.
 */
function isIdNotation(suffix) {
  return suffix === 'NNN' || suffix === 'N' || /^[A-Z_]+$/.test(suffix);
}

/**
 * W096 — an artifact carries `UNVERIFIED:` claims (§21). Advisory, once per file with the count: the
 * marker is the honest form of a claim nobody could cite, and whether a decision rests on one is the
 * reviewer's question. The warning keeps the count visible so a draft does not ship with them unread.
 */
function lintUnverified(body, bodyStart, add) {
  const lines = body.split('\n');
  const hits = lines.map((l, i) => (/\bUNVERIFIED:/.test(l.replace(/`[^`]*`/g, '')) ? i : -1)).filter((i) => i >= 0);
  if (hits.length) add('warn', 'W096', bodyStart + hits[0], `${hits.length} UNVERIFIED claim(s) — cite each, or raise a DEC; the reviewer fails one a decision rests on (DEV-CONTRACTS §21)`);
  // E037 — the one case a script can see a decision resting on the claim: it sits inside the section
  // that records the decision. Anywhere else, whether something rests on it stays the reviewer's call.
  let inDecision = false;
  lines.forEach((l, i) => {
    if (/^## /.test(l)) inDecision = /^## Decisions?\s*$/.test(l);
    else if (inDecision && hits.includes(i)) add('error', 'E037', bodyStart + i, 'an UNVERIFIED claim inside `## Decision` — the decision rests on it: cite it or raise a DEC before deciding (DEV-CONTRACTS §21)');
  });
}

function lintIds(body, bodyStart, add) {
  // Code is quoted, not asserted: a regex `CR-30[0-9]`, a rule named `REQ-coverage`, a truncated id
  // from tool output. Judging those as ids made authors paraphrase code to get a clean lint.
  const lines = withoutCode(body);
  lines.forEach((line, i) => {
    // `\w+` and not `[\w.]+`: an id at the end of a sentence must not swallow the full stop.
    for (const m of line.matchAll(/\b(REQ|ADR|TASK|CR|DEC|SLO|MIG|AC)-(\w+)/g)) {
      const id = `${m[1]}-${m[2]}`;
      if (isIdNotation(m[2]) || ID_PATTERNS[m[1]].test(id)) continue;
      add('error', 'E006', bodyStart + i, `malformed id \`${id}\` — expected ${describeId(m[1])}`);
    }
  });
}

/**
 * The body's lines with fenced blocks (``` or ~~~) and inline code spans blanked out. Line count is
 * preserved, so a finding's line number still points at the right place.
 */
export function withoutCode(body) {
  let fence = null;
  return body.split('\n').map((line) => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return '';
    }
    if (open) {
      fence = open[1];
      return '';
    }
    return line.replace(/(`+)[^`]*?\1/g, ' ');
  });
}

/**
 * E032 — a table row whose cell count differs from its header. Markdown renders a short row with
 * empty cells and silently drops a long row's extra ones, so the text a reviewer read is not the
 * text a script reading the table sees; on Recall an unescaped `|` in a REQ cell moved every later
 * cell one column right.
 */
function lintTableShape(body, bodyStart, add) {
  let header = null;
  const outsideFences = withoutCode(body);
  body.split('\n').forEach((raw, i) => {
    // withoutCode also blanks code spans, which GitHub still splits on; use it only to skip fences.
    const line = outsideFences[i] === '' ? '' : raw.trim();
    if (!line.startsWith('|')) { header = null; return; }
    const n = splitCells(line).length;
    if (header === null) { header = n; return; }
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line)) return;
    if (n !== header) add('error', 'E032', bodyStart + i, `this row has ${n} cells and its header ${header} — escape a \`|\` inside a cell as \`\\|\`, and give every row every column (DEV-CONTRACTS §3)`);
  });
}

/** E033 — the cell that states a requirement holds only AC ids: the requirement was never written. */
const AC_LIST_ONLY = /^AC-\d+(, AC-\d+)*$/;

function lintRequirementCells(body, bodyStart, add) {
  const lines = body.split('\n');
  for (const heading of headingsOf(body).map((h) => h.slice(3))) {
    for (const row of readTable(body, heading)) {
      if (!('requirement' in row) || !/^REQ-\d{3,}$/.test(plain(row.id))) continue;
      if (!AC_LIST_ONLY.test(plain(row.requirement))) continue;
      const at = lines.findIndex((l) => l.includes(`| ${row.id} |`) || l.includes(`|${row.id}|`));
      add('error', 'E033', bodyStart + Math.max(at, 0), `${plain(row.id)}'s Requirement is only \`${plain(row.requirement)}\` — state what the system must do; criteria cite the requirement, never the other way round (DEV-CONTRACTS §3.2)`);
    }
  }
}

function lintTables(body, bodyStart, fm, add) {
  lintTableShape(body, bodyStart, add);
  // E038 — an initiative with no kill criterion (§23). An error, not advice: as a warning it was left
  // unwritten on the initiatives it fired on, and nothing else would ever tell one to stop.
  if (fm.artifact === 'problem' && isInitiative(fm.change_class) && !/^Kill:[ \t]*\S/m.test(body)) {
    add('error', 'E038', lineOfText(body, '## Success looks like', bodyStart), 'initiative with no `Kill:` line under `## Success looks like` — say what result, by when, means it is removed or reversed (DEV-CONTRACTS §23)');
  }
  // E035 — a release plan whose `## Rollback` says nothing (§13.4). A missing heading is already E004;
  // this is the heading kept and the answer left out, which looks done until someone needs it.
  if (fm.artifact === 'release-plan' && /^## Rollback\s*$/m.test(body)) {
    const text = section(body, 'Rollback').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!text || /^(n\/a|none|tbd|todo|-|—)\.?$/i.test(text)) {
      add('error', 'E035', lineOfText(body, '## Rollback', bodyStart), '`## Rollback` is empty — give the exact command, its duration, who decides, and the point of no return (DEV-CONTRACTS §13.4)');
    }
  }
  // E041 — an architecture whose `## Deploy target` leaves a line out (§18.7). A missing heading is
  // already E004; this is the heading kept and the host left for G10, where it was chosen on release day.
  if (fm.artifact === 'architecture' && /^## Deploy target\s*$/m.test(body)) {
    const problems = deployTargetProblems(section(body, 'Deploy target'));
    if (problems.length) {
      add('error', 'E041', lineOfText(body, '## Deploy target', bodyStart), `\`## Deploy target\`: ${problems.join('; ')} — host, shape, environments, pipeline and who deploys are decided before design (DEV-CONTRACTS §18.7)`);
    }
  }
  // W098 — an initiative whose ## Pillars is missing, or has a pillar with no measure (§24).
  if (fm.artifact === 'problem' && isInitiative(fm.change_class)) {
    const rows = readTable(body, 'Pillars').filter((r) => plain(r.pillar) && !/^<.*>$/.test(plain(r.pillar)));
    const unmeasured = rows.filter((r) => { const m = plain(r['measured by']); return !m || /^<.*>$/.test(m) || ['—', '-'].includes(m); }).map((r) => plain(r.pillar));
    if (rows.length < 5 || unmeasured.length) {
      add('warn', 'W098', lineOfText(body, '## Pillars', bodyStart), rows.length < 5 ? `initiative answers ${rows.length} of the five pillars in \`## Pillars\` (DEV-CONTRACTS §24)` : `pillar(s) with no measure: ${unmeasured.join(', ')} — say how you would see it (DEV-CONTRACTS §24)`);
    }
  }
  // W095 — a post-release with an empty `## Next` (§20). Advisory: whether a row is worth carrying is
  // G11 row 21's call; that the table was left blank is a fact.
  if (fm.artifact === 'post-release' && /^## Next\s*$/m.test(body) && !readTable(body, 'Next').some((r) => plain(r.kind) && !/^<.*>$/.test(plain(r.kind)))) {
    add('warn', 'W095', lineOfText(body, '## Next', bodyStart), 'post-release `## Next` has no row — carry each idea, lesson or missing check forward, or write one `none` row saying why (DEV-CONTRACTS §20)');
  }
  if (fm.artifact === 'requirements') lintRequirementCells(body, bodyStart, add);
  for (const row of readTable(body, 'Tasks')) {
    const s = plain(row.status);
    if (s && !VOCAB.taskStatus.includes(s)) {
      add('error', 'E009', lineOf(body, row, bodyStart), `task status \`${s}\` — allowed: ${VOCAB.taskStatus.join(', ')}`);
    } else if (s && fm.artifact === 'tasks' && !PLAN_STATUS.includes(s)) {
      // Execution status in the reviewed plan changes its hash and stales G6 for nothing.
      add('warn', 'W007', lineOf(body, row, bodyStart), `${plain(row.id)} is \`${s}\` in tasks.md — the plan holds only ${PLAN_STATUS.join(' / ')}; record execution status in implementation/<slug>/progress.md (DEV-CONTRACTS §8.1)`);
    }
  }
  // Only the decision ledger's `## Decisions` is a DEC table. architecture.md has a section of the
  // same name that lists ADRs, whose Status column speaks a different vocabulary.
  for (const row of fm.artifact === 'decisions' ? readTable(body, 'Decisions') : []) {
    const s = plain(row.status);
    if (s && !VOCAB.decisionStatus.includes(s)) {
      add('error', 'E009', lineOf(body, row, bodyStart), `decision status \`${s}\` — allowed: ${VOCAB.decisionStatus.join(', ')}`);
    }
    if (s === 'open' && !plain(row['recommended default'])) {
      add('warn', 'W006', lineOf(body, row, bodyStart), `${plain(row.id)} has no recommended default — a question with no proposed answer makes the reader do your work`);
    }
    // `assumed` means a human said "proceed on that default". An agent setting it has answered a
    // question it was told it could not answer, in the one format that looks like it did not — so
    // the status carries a name, exactly as an override does (§4.5, §15.2). Without the name there
    // is nothing to tell the two apart, and the ledger's whole purpose leaks away through it.
    if (s === 'assumed' && !namesAHuman(row)) {
      add(
        'error',
        'E017',
        lineOf(body, row, bodyStart),
        `${plain(row.id)} is \`assumed\` with nobody named — only a human may set it, and the row must say who (DEV-CONTRACTS §15.2)`,
      );
    }
  }
}

/**
 * E046, E047 — attempt 2 checks the delta (§4.3). A finding attempt 2 raises that is not one of
 * attempt 1's (no resolution row) is a `follow-up` unless it is a BLOCKER: it is carried, and it
 * cannot hold the gate. Without this a reviewer that finds something new each round never lets a
 * gate end. E047 is the verdict that follows: every attempt-1 finding closed, nothing open but
 * follow-up, drift or bookkeeping — PASS.
 */
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DEFERRED']);
function lintDeltaReview(body, findings, verdict, bodyStart, add) {
  const resolutions = readTable(body, 'Finding resolution');
  const prior = new Set(resolutions.map((r) => plain(r.id)));
  const fresh = findings.filter((r) => /^CR-\d+/.test(plain(r.id)) && !prior.has(plain(r.id)));
  for (const row of fresh) {
    if (plain(row.class).toLowerCase() === 'defect' && plain(row.severity) !== 'BLOCKER') {
      add('error', 'E046', lineOf(body, row, bodyStart), `${plain(row.id)} is new at attempt 2 and not a BLOCKER — record it as \`follow-up\` with an owner and a target gate; it does not hold this round (DEV-CONTRACTS §4.3)`);
    }
  }
  const allClosed = resolutions.length > 0 && resolutions.every((r) => CLOSED.has(plain(r['reviewer verdict'])));
  const blocking = fresh.filter((r) => !['follow-up', 'drift', 'bookkeeping'].includes(plain(r.class).toLowerCase()));
  if (['CHANGES_REQUESTED', 'BLOCKED'].includes(verdict) && allClosed && !blocking.length) {
    add('error', 'E047', 1, `attempt 2 is ${verdict} with every attempt-1 finding closed and only follow-up, drift or bookkeeping open — the verdict is PASS (DEV-CONTRACTS §4.3)`);
  }
}

export const DEPLOY_LINES = ['Host', 'Shape', 'Environments', 'Pipeline', 'Who deploys'];
const EMPTY_VALUE = /^(?:|n\/a|none|tbd|todo|later|-|—|<[^>]*>)\.?$/i;

/** What a `## Deploy target` section leaves out: a line missing or empty; Host/Shape citing neither a DEC nor `unchanged`. */
export function deployTargetProblems(text) {
  const out = [];
  const prose = text.replace(/<!--[\s\S]*?-->/g, '');
  const lines = prose.split('\n');
  for (const key of DEPLOY_LINES) {
    const lead = `${key.toLowerCase()}:`;
    const line = lines.map((l) => l.replace(/^\s*(?:[-*]\s+)?/, '').replace(/\*\*/g, '')).find((l) => l.toLowerCase().startsWith(lead));
    const value = line === undefined ? null : plain(line.slice(lead.length)).trim();
    if (value === null) out.push(`no \`${key}:\` line`);
    else if (EMPTY_VALUE.test(value)) out.push(`\`${key}:\` is empty`);
    else if ((key === 'Host' || key === 'Shape') && !/\bDEC-\d{3,}\b/.test(value) && !/^unchanged\b/i.test(value)) out.push(`\`${key}:\` cites no DEC-NNN and does not say \`unchanged\``);
  }
  return out;
}

/**
 * An `assumed` row has to attribute itself. The ledger template puts the attribution in `Answer`
 * ("proceed on the default — <name>"), and some projects add a `Who` column; accept either, because
 * what matters is that a person is named, not which cell holds the name.
 */
function namesAHuman(row) {
  const cell = plain(row.who ?? row.answer ?? '');
  return cell !== '' && cell !== '—' && cell !== '-';
}

/**
 * A DEFERRED row names its owner and target either in columns of those names or as `owner: …` and
 * `target: …` anywhere in the row — the template puts them in the Evidence cell.
 */
function deferralOwner(row) {
  const col = plain(row.owner ?? '');
  if (col && col !== '—' && col !== '-') return col;
  return /\bowner:\s*[^\s·|,;]+/i.exec(Object.values(row).join(' | '))?.[0] ?? null;
}

function deferralTarget(row) {
  const target = /^(GK|G\d{1,2}|TASK-\d{3,})$/;
  if (target.test(plain(row.target ?? ''))) return plain(row.target);
  return /\btarget:\s*`?(GK|G\d{1,2}|TASK-\d{3,})\b/i.exec(Object.values(row).join(' | '))?.[1] ?? null;
}

/**
 * Advisory only. A section with almost nothing in it is worth a reviewer's glance, and `N/A` with no
 * reason is a section that was skipped rather than answered — but neither is the linter's call to
 * block on. Meaning belongs to the reviewer.
 */
function lintSections(body, bodyStart, add) {
  const lines = body.split('\n');
  let heading = null;
  let start = 0;
  let content = [];
  const flush = () => {
    if (!heading) return;
    const text = content.join('\n').trim();
    if (/^N\/A\s*$/i.test(text)) {
      add('warn', 'W002', bodyStart + start, `\`${heading}\` is "N/A" with no reason — say why it does not apply`);
    } else if (/^none\.?$/i.test(text) || /^N\/A\s*[—-]\s*\S/i.test(text)) {
      // "None." and "N/A — <reason>" are complete answers, not thin ones.
    } else if (text.length > 0 && text.replace(/[|\-:\s]/g, '').length < 12) {
      add('warn', 'W001', bodyStart + start, `\`${heading}\` has almost no content`);
    }
  };
  lines.forEach((line, i) => {
    if (/^## /.test(line)) {
      flush();
      heading = line.slice(3).trim();
      start = i;
      content = [];
    } else if (heading && !/^<!--/.test(line)) {
      content.push(line);
    }
  });
  flush();
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function shouldSkip(rel) {
  return (
    rel.startsWith('_templates/') ||
    rel.startsWith('scripts/') ||
    rel.startsWith('ci/') ||
    rel === 'state.json' ||
    rel === 'DASHBOARD.md' ||
    /^ui\/[^/]+\/components\.md$/.test(rel) || // ui-inventory.mjs output: generated, never gated (§2)
    rel.startsWith('docs/') ||
    // Pull-request reviews (`/sdlc-review-pr`) review a teammate's diff, not a stage artifact:
    // they carry their own front matter and are never gate logs (DEV-CONTRACTS §2).
    rel.startsWith('pr-reviews/') ||
    // Lessons have their own gate, learn.mjs check (§19); they are not stage artifacts.
    rel.startsWith('learnings/') ||
    rel === 'ideas.md' || // the backlog has its own gate, ideas.mjs check (§20)
    // The security ledger and audits are written by security-scan.mjs and /sdlc-security; check
    // validates the ledger, and neither is a stage artifact (§13.15).
    rel.startsWith('security/') ||
    !rel.endsWith('.md')
  );
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function toPosix(p) {
  return p.split(sep).join('/');
}

function countLines(text) {
  return text ? text.split('\n').length : 0;
}

function lineOfText(body, text, bodyStart) {
  const idx = body.split('\n').findIndex((l) => l.includes(text));
  return idx === -1 ? bodyStart : bodyStart + idx;
}

function lineOf(body, row, bodyStart) {
  const key = plain(row.id) || plain(row.check) || Object.values(row).find((v) => v);
  return key ? lineOfText(body, key, bodyStart) : bodyStart;
}

function describeId(prefix) {
  return prefix === 'MIG' ? 'MIG-YYYYMMDDHHMM' : `${prefix}-NNN with at least three digits`;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function lintTree(root, templates) {
  const ctx = { root, templates };
  const files = walk(root).filter((f) => f.endsWith('.md'));
  const perFile = files.flatMap((f) => lintFile(f, ctx));
  return demoteOlderChecklist(dropSupersededAdvice(demoteSuperseded([...perFile, ...lintOpenDecisions(root, files), ...lintTraceability(root), ...lintDeferredDebt(root), ...lintLedgerRefs(root), ...lintReaffirm(root), ...lintCiDeferrals(root), ...lintPerfBudgets(root), ...lintErrorUx(root), ...lintCrReuse(root), ...lintSloAlerts(root), ...lintDeployEarly(root), ...lintRoundCap(root), ...lintRunIdTimes(root)], root), root), root);
}

/**
 * §18.7, §15.2 — where it runs is decided before it is designed, and assumptions do not pile up.
 *   E042  an `initiative` plan with no `Walking skeleton` task: on anime-blog the pipeline and the
 *         first deploy were left to release day, and production ran from a laptop.
 *   E043  a G2 `PASS` in force while a DEC that `## Deploy target` cites for Host or Shape is not
 *         `answered`: the shape was a default nobody chose, and the host changed four times on release day.
 *   E044  more than MAX_ASSUMED `assumed` decisions once a gate past G2 has a log: 29 reached G9 there
 *         and blocked the release in one batch.
 */
export const MAX_ASSUMED = 5;

function gateLogs(root, slug) {
  const dir = join(root, 'reviews', slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^G\d+-.*\.md$/.test(f)).map((f) => optionalDoc(root, `reviews/${slug}/${f}`)).filter(Boolean)
    .sort((a, b) => String(a.doc.frontMatter.run_id ?? '').localeCompare(String(b.doc.frontMatter.run_id ?? '')) || a.rel.localeCompare(b.rel));
}

function lintDeployEarly(root) {
  const out = [];
  const slugs = new Set();
  for (const area of ['intake', 'design', 'plan', 'reviews']) {
    const dir = join(root, area);
    if (existsSync(dir)) for (const d of readdirSync(dir)) if (d !== '_repo' && statSync(join(dir, d)).isDirectory()) slugs.add(d);
  }
  for (const slug of [...slugs].sort()) {
    const problem = optionalDoc(root, `intake/${slug}/problem.md`);
    const initiative = isInitiative(problem?.doc.frontMatter.change_class);
    const logs = gateLogs(root, slug);
    const ledger = optionalDoc(root, `decisions/${slug}.md`);
    const rows = ledger ? readTable(ledger.doc.body, 'Decisions') : [];
    const statusOf = new Map(rows.map((r) => [plain(r.id), plain(r.status)]));

    const tasks = optionalDoc(root, `plan/${slug}/tasks.md`);
    if (initiative && tasks && !readTable(tasks.doc.body, 'Tasks').some((r) => /^(?:walking skeleton|pipeline)\b/i.test(plain(r.task)))) {
      const at = tasks.lines.findIndex((l) => l.trim() === '## Tasks');
      out.push({ file: tasks.rel, level: 'error', rule: 'E042', line: at + 1 || 1, message: 'an initiative plan with no pipeline task (`Pipeline` or `Walking skeleton`) — plan the pipeline (build → registry → staging on merge → production on approval) and a first deploy of the empty app to the real target, before the features (DEV-CONTRACTS §18.7)' });
    }

    const g2 = logs.filter((l) => String(l.doc.frontMatter.gate) === 'G2').at(-1);
    const arch = optionalDoc(root, `design/${slug}/architecture.md`);
    if (g2 && String(g2.doc.frontMatter.verdict) === 'PASS' && arch) {
      const target = section(arch.doc.body, 'Deploy target');
      for (const key of ['Host', 'Shape']) {
        const line = target.split('\n').find((l) => l.replace(/^\s*(?:[-*]\s+)?/, '').replace(/\*\*/g, '').toLowerCase().startsWith(`${key.toLowerCase()}:`)) ?? '';
        for (const id of line.match(/\bDEC-\d{3,}\b/g) ?? []) {
          const status = statusOf.get(id);
          if (status !== 'answered') out.push(traceFinding(arch, 'E043', id, `\`${key}:\` rests on ${id}, which is \`${status ?? 'not in the ledger'}\` while G2 passed — the owner answers where it runs and how the code is split before design is approved (DEV-CONTRACTS §18.7)`));
        }
      }
    }

    const assumed = rows.filter((r) => plain(r.status) === 'assumed');
    const pastG2 = logs.some((l) => Number(String(l.doc.frontMatter.gate).slice(1)) > 2);
    if (ledger && pastG2 && assumed.length > MAX_ASSUMED) {
      out.push(traceFinding(ledger, 'E044', plain(assumed[MAX_ASSUMED].id), `${assumed.length} decisions are \`assumed\` past G2 (at most ${MAX_ASSUMED}) — put them to the owner with /sdlc-ask now, while an answer can still change the design (DEV-CONTRACTS §15.2)`));
    }
  }
  return out;
}

/**
 * E045 — a third or later full review of a gate since its last PASS or override, with no human
 * decision (§4.3). Counted across runs: a new run after CHANGES_REQUESTED is not a fresh start. On
 * the first product built with the bundle one gate was reviewed nine times in a row; each round
 * looked cheap, and together they were most of the cost.
 */
function lintRoundCap(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  for (const slug of readdirSync(reviews).filter((d) => d !== '_repo' && statSync(join(reviews, d)).isDirectory()).sort()) {
    const logs = gateLogs(root, slug).map((l) => ({ ...l, fm: l.doc.frontMatter }));
    const ledger = optionalDoc(root, `decisions/${slug}.md`);
    const answered = new Set((ledger ? readTable(ledger.doc.body, 'Decisions') : []).filter((r) => plain(r.status) === 'answered').map((r) => plain(r.id)));
    for (const [l, round] of roundsOf(logs).perLog) {
      if (round <= ROUND_CAP) continue;
      const dec = String(l.fm.round_decision ?? '').match(/\bDEC-\d{3,}\b/)?.[0];
      if (dec && answered.has(dec)) continue;
      out.push({ file: l.rel, level: 'error', rule: 'E045', line: 1, message: `round ${round} of ${l.fm.gate} since its last PASS ${dec ? `cites ${dec}, which is not answered` : 'with no `round_decision`'} — after two rounds the human chooses: fix now, ship with known risks, or abandon, as an answered DEC (DEV-CONTRACTS §4.3)` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Performance budgets — DEV-CONTRACTS §13.1, §13.7. The contract is YAML, not a templated
// artifact, so this reads `api/<slug>/openapi.{yaml,yml,json}` on its own: every operation names
// its `x-perf` budget, or the G7 query tests, the check-time smoke and G8 have nothing to hold it to.
// Advisory: whether the numbers are right is the G4 reviewer's question, not the linter's.
// ---------------------------------------------------------------------------------------------

function lintPerfBudgets(root) {
  const out = [];
  const api = join(root, 'api');
  if (!existsSync(api)) return out;
  for (const slug of readdirSync(api)) {
    const dir = join(api, slug);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((n) => /^openapi\.(ya?ml|json)$/.test(n))) {
      const rel = `api/${slug}/${f}`;
      let ops;
      try {
        ops = readOperations(readFileSync(join(dir, f), 'utf8'), f);
      } catch {
        continue;
      }
      for (const op of ops) {
        const problems = budgetProblems(op.perf);
        // A server that gives up before its own p95 fails one request in twenty by design (§13.7).
        if (!problems.length && op.timeoutMs !== null && op.timeoutMs < Number(op.perf.p95_ms)) problems.push(`\`p95_ms: ${op.perf.p95_ms}\` is above \`x-timeout-ms: ${op.timeoutMs}\``);
        if (!problems.length) continue;
        const rule = op.perf ? 'W051' : 'W050';
        const message = op.perf
          ? `${opName(op)}: x-perf ${problems.join(', ')} — each of p95_ms, max_queries, max_payload_kb is a positive number, p95_ms within x-timeout-ms (DEV-CONTRACTS §13.7)`
          : `${opName(op)} has no \`x-perf\` budget — add \`x-perf: { p95_ms, max_queries, max_payload_kb }\` (DEV-CONTRACTS §13.1, §13.7)`;
        out.push({ file: rel, level: 'warn', rule, line: op.line, message });
      }
    }
  }
  return out;
}

/**
 * E090 — a CR id defined by two runs with different Problem text (§3.2). A reviewer that numbers
 * findings per run restarts at CR-001 and every later citation is ambiguous; on release-management
 * 57 ids were defined twice. A run's attempt 2 restating its own finding is the same definition.
 */
/**
 * A later run restating a finding under its permanent id says so first: "Carried, unchanged",
 * "Narrowed", "Reopened", "Still open", "As in <run>". That is the id doing its job (§1.1), not a
 * restart; on release-management all 26 E090 errors on logs in force were such rows.
 */
const CARRIED_ROW = /^(?:carried|unchanged|narrowed|reopened|re-?raised|restated|still open|as in\b|result unchanged|changed by diff)/i;

function lintCrReuse(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  const norm = (t) => plain(t).toLowerCase().replace(/\s+/g, ' ');
  for (const dir of readdirSync(reviews).sort()) {
    if (!statSync(join(reviews, dir)).isDirectory()) continue;
    const logs = readdirSync(join(reviews, dir)).filter((f) => f.endsWith('.md')).map((f) => optionalDoc(root, `reviews/${dir}/${f}`)).filter(Boolean);
    logs.sort((a, b) => String(a.doc.frontMatter.run_id ?? '').localeCompare(String(b.doc.frontMatter.run_id ?? '')) || a.rel.localeCompare(b.rel));
    const first = new Map();
    for (const log of logs) {
      const run = String(log.doc.frontMatter.run_id ?? log.rel);
      for (const row of readTable(log.doc.body, 'Findings')) {
        const id = plain(row.id);
        if (!/^CR-\d{3,}$/.test(id) || row.problem === undefined) continue;
        const held = first.get(id);
        if (held && CARRIED_ROW.test(plain(row.problem).replace(/^\W+/, ''))) continue;
        if (!held) {
          first.set(id, { run, problem: norm(row.problem), rel: log.rel });
        } else if (held.run !== run && held.problem !== norm(row.problem)) {
          out.push(traceFinding(log, 'E090', id, `${id} is already defined by ${basename(held.rel)} with different text — take the next id from \`run-id.mjs --next-cr ${dir}\` (DEV-CONTRACTS §1.1, §3.2)`));
        }
      }
    }
  }
  return out;
}

/**
 * E034 — a gate log whose run_id is later than the commit that added it. A run-id is taken from
 * run-id.mjs when the review starts, so it cannot postdate the commit of its log; one that does was
 * typed by hand, and ordering logs by run_id (build-state laterLog) then hands the gate to the wrong
 * log. Committed logs only; a skew of RUN_ID_SKEW_MS covers a clock that is a little off.
 */
const RUN_ID_SKEW_MS = 10 * 60 * 1000;

export function runIdTime(runId) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[0-9a-f]{4}$/.exec(String(runId ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function lintRunIdTimes(root) {
  const out = [];
  if (!existsSync(join(root, 'reviews'))) return out;
  const repo = dirname(root);
  let raw;
  try {
    raw = execFileSync('git', ['log', '--diff-filter=A', '--format=%x1e%cI', '--name-only', '--', relative(repo, join(root, 'reviews')).replace(/\\/g, '/')], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  } catch {
    return out; // no git, or not a repository: nothing to compare against
  }
  const added = new Map();
  for (const chunk of raw.split('\x1e').filter(Boolean)) {
    const [when, ...names] = chunk.trim().split('\n');
    // git log runs newest first, so the last write is the first commit that added the file.
    for (const name of names.filter(Boolean)) added.set(name.trim(), Date.parse(when));
  }
  const prefix = relative(repo, root).replace(/\\/g, '/');
  for (const [name, committed] of added) {
    if (!name.startsWith(`${prefix}/reviews/`) || !name.endsWith('.md')) continue;
    const rel = name.slice(prefix.length + 1);
    const log = optionalDoc(root, rel);
    const ran = runIdTime(log?.doc.frontMatter.run_id);
    if (ran === null || ran - committed <= RUN_ID_SKEW_MS) continue;
    out.push({ file: rel, level: 'error', rule: 'E034', line: 1, message: `run_id \`${log.doc.frontMatter.run_id}\` is later than the commit that added this log (${new Date(committed).toISOString()}) — a run-id comes from \`run-id.mjs\` when the review starts, never typed by hand (DEV-CONTRACTS §1)` });
  }
  return out;
}

/**
 * E091 — once a slug has a G7 log, every SLO-NNN it defines has an alert file that names it
 * (§18.3). Alerts first written at G11 were never built or reviewed; on release-management they
 * lived in Go code only. The repository root is the dev root's parent.
 */
function lintSloAlerts(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  const alertsDir = join(root, '..', 'ops', 'alerts');
  const alerts = existsSync(alertsDir)
    ? readdirSync(alertsDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => readFileSync(join(alertsDir, f), 'utf8')).join('\n')
    : '';
  for (const slug of readdirSync(reviews).filter((d) => d !== '_repo' && statSync(join(reviews, d)).isDirectory()).sort()) {
    if (!readdirSync(join(reviews, slug)).some((f) => /^G7-.*\.md$/.test(f))) continue;
    for (const rel of [`design/${slug}/architecture.md`, `monitoring/${slug}/observability.md`]) {
      const doc = optionalDoc(root, rel);
      if (!doc) continue;
      const defined = [...new Set(doc.lines.map((l) => /^\|\s*`?(SLO-\d{3,})`?\s*\|/.exec(l)?.[1]).filter(Boolean))];
      const missing = defined.filter((id) => !new RegExp(`\\b${id}\\b`).test(alerts));
      if (missing.length) {
        out.push(traceFinding(doc, 'E091', missing[0], `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no alert in ops/alerts/*.yml — dev-designing-observability writes one per SLO, built at G7 (DEV-CONTRACTS §18.3)`));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cross-file traceability — DEV-CONTRACTS §6. A per-file lint cannot see a dangling reference:
// `REQ-099` is a well-formed id in tasks.md, and only requirements.md knows it was never written.
// ---------------------------------------------------------------------------------------------

const REQ_TABLES = ['Functional requirements', 'Non-functional requirements'];
const AC_TABLES = ['Criteria', 'Negative and edge cases'];

function lintTraceability(root) {
  const out = [];
  const plan = join(root, 'plan');
  const requirements = join(root, 'requirements');
  const slugs = new Set();
  for (const dir of [plan, requirements]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) if (statSync(join(dir, entry)).isDirectory()) slugs.add(entry);
  }

  for (const slug of [...slugs].sort()) {
    const reqFile = optionalDoc(root, `requirements/${slug}/requirements.md`);
    const acFile = optionalDoc(root, `requirements/${slug}/acceptance-criteria.md`);
    const taskFile = optionalDoc(root, `plan/${slug}/tasks.md`);

    const reqs = reqFile ? idsInColumn(reqFile.doc.body, REQ_TABLES, 'id', /REQ-\d{3,}/g) : null;
    const acs = acFile ? idsInColumn(acFile.doc.body, AC_TABLES, 'id', /AC-\d{3,}/g) : null;

    // E018 — every REQ a criterion or a task cites is defined in this slug's requirements.md.
    if (reqs) {
      for (const [file, tables] of [[acFile, AC_TABLES], [taskFile, ['Tasks']]]) {
        if (!file) continue;
        for (const id of idsInColumn(file.doc.body, tables, 'req', /REQ-\d{3,}/g)) {
          if (!reqs.has(id)) {
            out.push(traceFinding(file, 'E018', id, `\`${id}\` is cited here but \`requirements/${slug}/requirements.md\` does not define it — an orphan reference (DEV-CONTRACTS §6)`));
          }
        }
      }
    }

    if (!taskFile) continue;

    // E019 — every AC tasks.md cites is defined in acceptance-criteria.md.
    if (acs) {
      for (const id of referencedIds(taskFile.doc.body, /AC-\d{3,}/g)) {
        if (!acs.has(id)) {
          out.push(traceFinding(taskFile, 'E019', id, `\`${id}\` is cited here but \`requirements/${slug}/acceptance-criteria.md\` does not define it (DEV-CONTRACTS §6)`));
        }
      }
    }

    // E020 / E021 — the dependency graph is closed and acyclic.
    const rows = readTable(taskFile.doc.body, 'Tasks').filter((r) => /^TASK-\d{3,}$/.test(plain(r.id)));
    const graph = new Map(rows.map((r) => [plain(r.id), dependsOn(r['depends on'])]));
    for (const [id, deps] of graph) {
      for (const dep of deps) {
        if (!graph.has(dep)) {
          out.push(traceFinding(taskFile, 'E020', id, `${id} depends on \`${dep}\`, which is not a task in this tasks.md (DEV-CONTRACTS §6)`));
        }
      }
    }
    for (const cycle of findCycles(graph)) {
      out.push(traceFinding(taskFile, 'E021', cycle[0], `dependency cycle ${cycle.join(' → ')} — no order can satisfy it (DEV-CONTRACTS §6)`));
    }

    // E022 — progress.md records only tasks the plan has.
    const progress = optionalDoc(root, `implementation/${slug}/progress.md`);
    for (const row of progress ? readProgress(progress.lines.join('\n')) : []) {
      if (!graph.has(row.task)) {
        out.push({ file: progress.rel, level: 'error', rule: 'E022', line: row.line, message: `\`${row.task}\` is not a task in plan/${slug}/tasks.md — progress.md records only planned tasks (DEV-CONTRACTS §8.1)` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Error-UX matrix — DEV-CONTRACTS §13.3. A ui-spec's `### Error-UX matrix` covers every problem type
// the slug's OpenAPI contract declares, and every required status (lib/error-ux.mjs).
// ---------------------------------------------------------------------------------------------

const ERROR_UX_LEVEL = { 'E080': 'error', 'E081': 'error', 'W080': 'warn' };

function lintErrorUx(root) {
  const out = [];
  const ui = join(root, 'ui');
  if (!existsSync(ui)) return out;
  for (const slug of readdirSync(ui).sort()) {
    const spec = optionalDoc(root, `ui/${slug}/ui-spec.md`);
    if (!spec) continue;
    const api = join(root, 'api', slug, 'openapi.yaml');
    const types = existsSync(api) ? problemTypes(readFileSync(api, 'utf8')) : null;
    const bodyStart = spec.lines.length - spec.doc.body.split('\n').length + 1;
    for (const f of checkMatrix(spec.doc.body, types)) {
      out.push({ file: spec.rel, level: ERROR_UX_LEVEL[f.rule], rule: f.rule, line: bodyStart + f.line, message: f.message });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Deferred debt — DEV-CONTRACTS §5.3. A MINOR may be carried forward; carried by three gates with
// nobody owning it, it has stopped being "recorded" and started being forgotten in public.
// ---------------------------------------------------------------------------------------------

const W004_GATES = 3;

function lintDeferredDebt(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  const inForce = currentLogs(root) ?? new Set();

  for (const dir of readdirSync(reviews).sort()) {
    if (!statSync(join(reviews, dir)).isDirectory()) continue;
    const logs = [];
    for (const file of readdirSync(join(reviews, dir)).filter((f) => f.endsWith('.md')).sort()) {
      const doc = optionalDoc(root, `reviews/${dir}/${file}`);
      if (doc) logs.push(doc);
    }

    // Severity and raising gate per finding, from every log: a superseded attempt still raised it.
    const raised = new Map();
    for (const log of logs) {
      for (const row of readTable(log.doc.body, 'Findings')) {
        const id = plain(row.id);
        if (/^CR-\d{3,}$/.test(id) && !raised.has(id)) {
          raised.set(id, { severity: plain(row.severity), gate: String(log.doc.frontMatter.gate ?? '') });
        }
      }
    }

    const closed = new Set();
    for (const log of logs) {
      for (const row of readTable(log.doc.body, 'Finding resolution')) {
        const id = plain(row.id);
        const verdict = plain(row['reviewer verdict']);
        if (inForce.has(log.rel) && ['RESOLVED', 'ACCEPTED', 'DEFERRED'].includes(verdict)) closed.add(id);
        const severity = raised.get(id)?.severity;
        if (verdict === 'DEFERRED' && severity && !['MINOR', 'INFO'].includes(severity)) {
          out.push(traceFinding(log, 'E023', id, `${id} is a ${severity} and cannot be DEFERRED — only a MINOR or INFO finding may be carried with an owner and a target; a ${severity} blocks a PASS (DEV-CONTRACTS §5.3)`));
        }
      }
    }

    const live = logs.filter((l) => inForce.has(l.rel));
    for (const [id, origin] of raised) {
      if (origin.severity !== 'MINOR' || closed.has(id)) continue;
      const mention = new RegExp(`\\b${id}\\b`);
      const carriers = live.filter((l) => String(l.doc.frontMatter.gate) !== origin.gate && mention.test(section(l.doc.body, 'Carried forward')));
      const gates = [...new Set(carriers.map((l) => String(l.doc.frontMatter.gate)))].sort((a, b) => VOCAB.gate.indexOf(a) - VOCAB.gate.indexOf(b));
      if (gates.length < W004_GATES) continue;
      const last = carriers.sort((a, b) => String(a.doc.frontMatter.run_id).localeCompare(String(b.doc.frontMatter.run_id))).at(-1);
      out.push({
        file: last.rel,
        level: 'warn',
        rule: 'W004',
        line: (last.lines.findIndex((l) => l.startsWith('## Carried forward')) + 1) || 1,
        message: `${id} (MINOR, ${origin.gate}) has been carried forward by ${gates.join(', ')} and is still open — fix it, or record it as DEFERRED with an owner and a target (DEV-CONTRACTS §5.3)`,
      });
    }
  }
  return out;
}

/**
 * E060 / W060 — a G8 row `NOT RUN` because CI runs it is a promise, kept at G9 (DEV-CONTRACTS §5.6).
 * On release-management `-race`, the 60 s fuzz and the DB roles were all "CI runs it", and nothing
 * downstream ever asked for the CI run. The proof is one `CI proof: <gate> — <url or path> — passed`
 * line in `pull-request.md`; the shape is checked, never whether the job really passed.
 */
const CI_DEFERRAL = /\bCI\b|\bpipeline\b|\bci job\b/i;
const CI_PROOF = /CI proof:\s*(.+?)\s+[—–-]+\s+(\S+)\s+[—–-]+\s+passed\b/gi;

export function deferredRows(verifyBody) {
  return readTable(verifyBody, 'Quality gates')
    .filter((r) => /^NOT RUN\b/i.test(plain(r.result)) && CI_DEFERRAL.test(Object.values(r).join(' ')))
    .map((r) => plain(r.gate));
}

export function ciProofs(prText, root) {
  const proofs = new Set();
  for (const m of prText.matchAll(CI_PROOF)) {
    const ref = m[2].replace(/[`<>]/g, '');
    const local = ref.replace(/^[^/]+\//, '');
    if (/^https?:\/\/\S+/.test(ref) || existsSync(join(root, ref)) || existsSync(join(root, local))) proofs.add(plain(m[1]).toLowerCase());
  }
  return proofs;
}

function lintCiDeferrals(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  const inForce = [...(currentLogs(root) ?? [])];

  for (const slug of readdirSync(reviews).filter((d) => d !== '_repo')) {
    const logOf = (gate) => inForce.map((rel) => optionalDoc(root, rel)).find((d) => d && d.rel.startsWith(`reviews/${slug}/`) && String(d.doc.frontMatter.gate) === gate && !d.doc.frontMatter.scope);
    // The verify.md the G8 log in force cites; before G8 is reviewed, the latest run's — so the
    // warning reaches the verifier while it can still go and get the CI log.
    const g8 = logOf('G8');
    const refs = g8 ? [...(g8.doc.frontMatter.inputs ?? []), ...(g8.doc.frontMatter.outputs ?? [])].map((r) => String(r?.path ?? '')) : [];
    const runs = join(root, 'verification', slug, 'runs');
    const latest = existsSync(runs) ? readdirSync(runs).filter((r) => RUN_ID.test(r)).sort().at(-1) : null;
    const cited = refs.map((p) => /verification\/.+\/verify\.md$/.exec(p)?.[0]).find(Boolean)
      ?? (latest ? `verification/${slug}/runs/${latest}/verify.md` : null);
    const verify = cited && optionalDoc(root, cited);
    if (!verify) continue;
    const deferred = deferredRows(verify.doc.body);
    if (!deferred.length) continue;

    const pr = optionalDoc(root, `release/${slug}/pull-request.md`);
    const proven = pr ? ciProofs(pr.lines.join('\n'), root) : new Set();
    const missing = deferred.filter((g) => !proven.has(g.toLowerCase()));
    for (const gate of missing) {
      const line = (verify.lines.findIndex((l) => l.startsWith('|') && plain(l.split('|')[1]) === gate) + 1) || 1;
      out.push({ file: verify.rel, level: 'warn', rule: 'W060', line, message: `\`${gate}\` is NOT RUN because CI runs it — G9 needs \`CI proof: ${gate} — <job URL or log path> — passed\` in release/${slug}/pull-request.md (DEV-CONTRACTS §5.6)` });
    }
    const g9 = logOf('G9');
    if (missing.length && g9 && String(g9.doc.frontMatter.verdict) === 'PASS') {
      out.push({ file: g9.rel, level: 'error', rule: 'E060', line: 1, message: `G9 PASS while ${missing.length} G8 row(s) deferred to CI have no CI proof: ${missing.join(', ')} (DEV-CONTRACTS §5.6)` });
    }
  }
  return out;
}

/**
 * E025, cross-file half: a row-scoped ledger input names DEC rows the ledger has. A citation of a
 * row that does not exist hashes to nothing, and the gate would be STALE with no way to clear it.
 */
function lintLedgerRefs(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  for (const dir of readdirSync(reviews).sort()) {
    if (!statSync(join(reviews, dir)).isDirectory()) continue;
    for (const file of readdirSync(join(reviews, dir)).filter((f) => f.endsWith('.md')).sort()) {
      const log = optionalDoc(root, `reviews/${dir}/${file}`);
      for (const ref of Array.isArray(log?.doc.frontMatter.inputs) ? log.doc.frontMatter.inputs : []) {
        const { file: target, ids } = splitRef(ref?.path ?? '');
        if (!ids || !LEDGER_PATH.test(target) || ids.some((id) => !ID_PATTERNS.DEC.test(id))) continue;
        const ledger = optionalDoc(root, stripRoot(target));
        const known = new Set(ledger ? readTable(ledger.doc.body, 'Decisions').map((r) => plain(r.id)) : []);
        const missing = ids.filter((id) => !known.has(id));
        if (missing.length) {
          out.push({ file: log.rel, level: 'error', rule: 'E025', line: (log.lines.findIndex((l) => l.includes(ref.path)) + 1) || 1, message: `\`${ref.path}\` cites ${missing.join(', ')}, which \`${target}\` does not have (DEV-CONTRACTS §5.2)` });
        }
      }
    }
  }
  return out;
}

/**
 * E026 — a reaffirm log (§4.4) reaffirms a real, earlier log of the same gate. When the gate's own
 * output moved (a self-edit reaffirm), the log carries the diff it judged as a ```diff block, and it
 * reaffirms a FULL review — two bounded self-edits in a row would otherwise add up to an unbounded
 * one nobody reviewed. Whether the diff is inside the bound is reaffirm-check.mjs's question; this
 * checks that the log is traceable enough for anyone to re-ask it.
 */
function lintReaffirm(root) {
  const out = [];
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return out;
  for (const dir of readdirSync(reviews).sort()) {
    if (!statSync(join(reviews, dir)).isDirectory()) continue;
    for (const file of readdirSync(join(reviews, dir)).filter((f) => f.endsWith('.md')).sort()) {
      const log = optionalDoc(root, `reviews/${dir}/${file}`);
      const fm = log?.doc.frontMatter;
      if (!fm?.revalidated_from) continue;
      const fail = (message) => out.push({ file: log.rel, level: 'error', rule: 'E026', line: 1, message: `${message} (DEV-CONTRACTS §4.4)` });

      const priorRel = stripRoot(fm.revalidated_from);
      const prior = priorRel !== log.rel ? optionalDoc(root, priorRel) : null;
      if (!prior || String(prior.doc.frontMatter.gate) !== String(fm.gate)) {
        fail(`revalidated_from \`${fm.revalidated_from}\` is not an earlier log of ${fm.gate}`);
        continue;
      }
      const before = new Map((Array.isArray(prior.doc.frontMatter.outputs) ? prior.doc.frontMatter.outputs : []).map((r) => [stripRoot(r.path), String(r.sha256)]));
      const ownEdit = (Array.isArray(fm.outputs) ? fm.outputs : []).some((r) => before.get(stripRoot(r.path)) !== String(r.sha256));
      if (!ownEdit) continue;
      if (prior.doc.frontMatter.revalidated_from) {
        fail(`a self-edit reaffirm must reaffirm a full review, and \`${fm.revalidated_from}\` is itself a reaffirm — measure the diff from the last full review`);
      } else if (!/^```diff$/m.test(section(log.doc.body, 'Scope'))) {
        fail('the gate\'s own output changed, so `## Scope` must carry the diff that was judged as a ```diff block (reaffirm-check.mjs prints it)');
      }
    }
  }
  return out;
}

/** The text under one `## heading`, up to the next `## `. */
function section(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

function optionalDoc(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  try {
    const text = readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n');
    return { rel, lines: text.split('\n'), doc: readDoc(abs) };
  } catch {
    return null;
  }
}

/** Ids matching `pattern` in one column of the named tables. */
function idsInColumn(body, tables, column, pattern) {
  const ids = new Set();
  for (const table of tables) {
    for (const row of readTable(body, table)) {
      for (const id of plain(row[column] ?? '').match(pattern) ?? []) ids.add(id);
    }
  }
  return ids;
}

/**
 * Ids cited anywhere in a body: table cells count with their backticks stripped (an id is often
 * formatted as code in a table), prose counts only outside code spans and fences.
 */
function referencedIds(body, pattern) {
  const ids = new Set();
  const prose = withoutCode(body);
  body.split('\n').forEach((line, i) => {
    const text = /^\s*\|/.test(line) && prose[i] !== '' ? plain(line) : prose[i];
    for (const id of text.match(pattern) ?? []) ids.add(id);
  });
  return ids;
}

function traceFinding(file, rule, id, message) {
  const idx = file.lines.findIndex((l) => l.includes(id) && /^\s*\|/.test(l));
  const line = idx === -1 ? file.lines.findIndex((l) => l.includes(id)) : idx;
  return { file: file.rel, level: 'error', rule, line: line + 1 || 1, message };
}

/**
 * W018 — a stage that never mentions an open decision.
 *
 * The expensive failure of §15.2 is not an agent inventing an answer, which reads as obviously
 * wrong. It is an agent recording the question, recommending a default, and then writing the
 * artifact to that default anyway: the ledger says `open` while the specification has already
 * chosen. Three consecutive gates in this bundle's own shakedown leaked the same decision, each in
 * different wording, and each was caught only by a reviewer reading for it.
 *
 * A linter cannot tell whether a sentence picks a branch — that is meaning, and §11 keeps the
 * linter out of meaning. What it can tell is that a stage produced artifacts while a decision was
 * open and **never referred to it at all**. That is either genuinely independent of the answer, in
 * which case the warning costs a glance, or it is the silent version, in which case this is the
 * cheapest place anyone will ever see it.
 *
 * Advisory by construction (§11): it reports a shape, not a judgement, and it never fails a build.
 */
function lintOpenDecisions(root, files) {
  const out = [];
  const decisionsDir = join(root, 'decisions');
  if (!existsSync(decisionsDir)) return out;

  for (const ledger of files) {
    const rel = relative(root, ledger).split(sep).join('/');
    const m = /^decisions\/(.+)\.md$/.exec(rel);
    if (!m) continue;
    const slug = m[1];

    let doc;
    try {
      doc = readDoc(ledger);
    } catch {
      continue;
    }

    const open = [];
    for (const row of readTable(doc.body, 'Decisions')) {
      if (plain(row.status ?? '').toLowerCase() === 'open') {
        const id = plain(row.id ?? '');
        if (id) open.push(id);
      }
    }
    if (!open.length) continue;

    // One entry per stage folder, because the unit a reviewer judges is the gate, not the file.
    const byStage = new Map();
    for (const file of files) {
      const r = relative(root, file).split(sep).join('/');
      const parts = r.split('/');
      if (parts.length < 3 || parts[1] !== slug) continue;
      if (parts[0] === 'reviews' || parts[0] === 'decisions' || parts[0] === '_templates') continue;
      if (!byStage.has(parts[0])) byStage.set(parts[0], []);
      byStage.get(parts[0]).push(file);
    }

    // A gate log that discusses the decision is the acknowledgement this rule is looking for, and
    // it is where it most often lives: a gate can pass before a decision exists, go `STALE` when it
    // is opened, and be re-reviewed against it without the artifact ever needing to change. Reading
    // only the artifacts would report that as silence, which is the opposite of what happened.
    for (const file of files) {
      const r = relative(root, file).split(sep).join('/');
      const parts = r.split('/');
      if (parts[0] !== 'reviews' || parts[1] !== slug) continue;
      let fm;
      try {
        fm = readDoc(file).frontMatter;
      } catch {
        continue;
      }
      const stage = String(fm.stage ?? '');
      if (!stage || !byStage.has(stage)) continue;
      byStage.get(stage).push(file);
    }

    for (const [stage, stageFiles] of byStage) {
      const text = stageFiles
        .map((f) => {
          try {
            return readDoc(f).body;
          } catch {
            return '';
          }
        })
        .join(String.fromCharCode(10));
      const unmentioned = open.filter((id) => !text.includes(id));
      if (unmentioned.length === open.length) {
        out.push({
          file: `${stage}/${slug}`,
          line: 1,
          level: 'warn',
          rule: 'W018',
          message:
            `stage \`${stage}\` names none of the open decisions (${open.join(', ')}) — either it does ` +
            'not depend on them, or it has answered one without saying so (DEV-CONTRACTS §15.2)',
        });
      }
    }
  }
  return out;
}

/**
 * A gate log is immutable (§5): a second round writes a new log, and the old one stays on disk
 * because the history of what was wrong is most of the audit trail's value.
 *
 * That collides with the improvement loop (§17), which adds checks over time. A log written before
 * a rule existed will fail it forever, and nothing may edit the log to satisfy it — so `dev:lint`
 * would be permanently red, which is the fastest way to teach a team to stop reading it.
 *
 * The resolution: a superseded log is still checked — a hand-edit that rewrites history must still
 * surface — but its findings are advisory. Only the log currently in force for a gate can fail the
 * build, because only that one describes the pipeline as it now stands.
 */
function demoteSuperseded(findings, root) {
  const winners = currentLogs(root);
  if (winners === null) return findings;

  return findings.map((f) => {
    const rel = f.file.split('\\').join('/');
    if (!/^reviews\//.test(rel) || f.level !== 'error' || winners.has(rel)) return f;
    return {
      ...f,
      level: 'warn',
      message: `${f.message} — superseded log, advisory only (a later log is in force for this gate; §5 forbids editing this one)`,
    };
  });
}

/**
 * Advice a superseded log cannot act on is dropped rather than demoted: §5 forbids editing the log,
 * so a whole-ledger warning (W019) on every old attempt would be noise that never clears. The same
 * holds for W031 (no `reviewed_commit`, or a hashed change-summary): on release-management every
 * G7 attempt written before the rule carried it, ten warnings that only a new log could clear.
 */
const ONLY_IN_FORCE = new Set(['W019', 'W031', 'W093']);

/**
 * §11.1: an artifact rule a reviewer enforces from a checklist row bites once that gate is judged
 * with the row. Until the log in force for the gate carries it, the artifact was approved under an
 * older checklist, and the error is a warning that names the gate to re-review. A slug with no log
 * for the gate yet is being authored under the current rules, so the error stands.
 * On release-management E080 (Error-UX matrix, G5 row 24) and E091 (SLO alerts, G7 row 34) fired on
 * a G5 and a G7 that passed before either row existed.
 */
const RULE_GATE_ROW = {
  E080: { gate: 'G5', row: /Error-UX matrix/i },
  E081: { gate: 'G5', row: /Error-UX matrix/i },
  E091: { gate: 'G7', row: /ops\/alerts|E091/ },
  // §13.13: a ui-spec judged before the nine-state, roles and traceability rows existed.
  E140: { gate: 'G5', row: /nine states|E140/i },
  E141: { gate: 'G5', row: /nine states|E140/i },
  E142: { gate: 'G5', row: /roles matrix|E142/i },
  E143: { gate: 'G5', row: /roles matrix|E142/i },
  E144: { gate: 'G5', row: /traceability|E144/i },
};

function demoteOlderChecklist(findings, root) {
  const winners = currentLogs(root);
  if (winners === null) return findings;
  const judged = new Map();
  const carriesRow = (slug, gate, row) => {
    const key = `${slug}/${gate}`;
    if (!judged.has(key)) {
      const rel = [...winners].find((r) => r.startsWith(`reviews/${slug}/${gate}-`) && !optionalDoc(root, r)?.doc.frontMatter.scope);
      const log = rel && optionalDoc(root, rel);
      judged.set(key, log ? { rel, text: readTable(log.doc.body, 'Checklist').map((r) => Object.values(r).join(' ')).join('\n') } : null);
    }
    const j = judged.get(key);
    return j === null ? null : { rel: j.rel, has: row.test(j.text) };
  };
  return findings.map((f) => {
    const rule = RULE_GATE_ROW[f.rule];
    if (!rule || f.level !== 'error') return f;
    const slug = f.file.split(/[\\/]/)[1]?.replace(/\.md$/, '');
    const held = slug && carriesRow(slug, rule.gate, rule.row);
    if (!held || held.has) return f;
    return { ...f, level: 'warn', message: `${f.message} — ${basename(held.rel)} was judged before this rule's checklist row existed; it is an error from the next ${rule.gate} review (DEV-CONTRACTS §11.1)` };
  });
}

function dropSupersededAdvice(findings, root) {
  const winners = currentLogs(root);
  if (winners === null) return findings;
  return findings.filter((f) => {
    const rel = f.file.split(sep).join('/');
    return !ONLY_IN_FORCE.has(f.rule) || !rel.startsWith('reviews/') || winners.has(rel);
  });
}

/** The relative path of the log in force for each (slug, gate), by the §5 ordering rule. */
function currentLogs(root) {
  const reviews = join(root, 'reviews');
  if (!existsSync(reviews)) return null;

  const best = new Map();
  for (const dir of readdirSync(reviews)) {
    const abs = join(reviews, dir);
    let entries;
    try {
      entries = readdirSync(abs).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const file of entries) {
      let fm;
      try {
        fm = readDoc(join(abs, file)).frontMatter;
      } catch {
        continue;
      }
      // A slice log (§5.5) is in force for its slice only; the final log is in force for the gate.
      const key = `${dir}/${fm.gate ?? '?'}${fm.scope ? `#${fm.scope}` : ''}`;
      const rank = [String(fm.run_id ?? ''), String(Number(fm.attempt ?? 1)).padStart(3, '0')].join('#');
      const held = best.get(key);
      if (!held || rank > held.rank) best.set(key, { rank, rel: `reviews/${dir}/${file}` });
    }
  }
  return new Set([...best.values()].map((v) => v.rel));
}

function main(argv) {
  const root = rootFromArgv(argv);
  const templatesDir = resolve(process.cwd(), argFor(argv, '--templates') ?? join(root, '_templates'));
  const single = argFor(argv, '--file');
  const asJson = argv.includes('--json');
  const quiet = argv.includes('--quiet');

  const templates = loadTemplates(templatesDir);
  if (templates.size === 0) {
    console.error(`lint-dev: no templates found at ${templatesDir} — pass --templates <dir>.`);
    process.exit(2);
  }

  let findings;
  if (single) {
    const abs = resolve(process.cwd(), single);
    const inside = !relative(root, abs).startsWith('..') && existsSync(abs);
    findings = inside ? lintFile(abs, { root, templates }) : [];
  } else {
    if (!existsSync(root)) {
      console.error(`lint-dev: no SDLC root at ${root} — pass --root <path> (DEV-CONTRACTS §2).`);
      process.exit(2);
    }
    findings = lintTree(root, templates);
  }

  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');

  if (asJson) {
    console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, findings }, null, 2));
  } else if (!quiet || errors.length) {
    let current = null;
    for (const f of [...errors, ...warns].sort(byFileThenLine)) {
      if (f.file !== current) {
        current = f.file;
        console.log(`\n${f.file}`);
      }
      console.log(`  ${f.level === 'error' ? 'E' : 'W'} ${f.rule}:${f.line}  ${f.message}`);
    }
    console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
  }

  const codes = {};
  for (const f of findings) codes[f.rule] = (codes[f.rule] ?? 0) + 1;
  logRun(root, { script: 'lint-dev', exit: errors.length ? 1 : 0, errors: errors.length, warnings: warns.length, codes, ...(single ? { file: relative(root, resolve(process.cwd(), single)).split(sep).join('/') } : {}) });
  process.exit(errors.length ? 1 : 0);
}

function byFileThenLine(a, b) {
  return a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file);
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

if (process.argv[1]?.endsWith('lint-dev.mjs')) {
  main(process.argv.slice(2));
}
