/**
 * L1 + L2 for the linter (docs/test-plan.md).
 *
 * The broken corpus is fixture-as-code: each case takes a file from the valid corpus and applies one
 * mutation, so the two corpora cannot drift apart when a template changes. The assertion is strict
 * in both directions — exactly the expected rule, and nothing else — because most linter regressions
 * are false positives, and a test that only checks "the right rule fired" never notices them.
 *
 *   node --test tests/lint-dev.test.mjs
 */

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lintFile, lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { hashArtifact } from '../workspace/dev/scripts/lib/doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VALID = join(here, 'fixtures', 'valid');
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));

/**
 * Fixtures are read with LF line endings. A Windows checkout with core.autocrlf=true writes them
 * as CRLF, and every mutation below that matches `\n` then silently does nothing — seven tests
 * failed that way before .gitattributes pinned eol=lf. The linter itself normalises (lib/doc.mjs).
 */
const readLF = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const PROBLEM = 'intake/demo/problem.md';
const REQUIREMENTS = 'requirements/demo/requirements.md';
const DECISIONS = 'decisions/demo.md';
const LOG_G0 = 'reviews/demo/G0-intake-20260916-091203-3f2a.md';
const LOG_G1_ATTEMPT2 = 'reviews/demo/G1-requirements-20260916-141855-b09e-a2.md';
const LOG_G5_SKIPPED = 'reviews/demo/G5-ui-20260917-160500-9a22.md';

/** A scratch dev root holding exactly one file: the valid original, mutated. */
function scratchWith(relPath, mutate, renameTo) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-lint-'));
  const source = readLF(join(VALID, relPath));
  const target = join(root, renameTo ? join(dirname(relPath), renameTo) : relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, mutate ? mutate(source) : source);
  return root;
}

function errorRules(root) {
  return lintTree(root, TEMPLATES).filter((f) => f.level === 'error').map((f) => f.rule);
}

function warnRules(root) {
  return lintTree(root, TEMPLATES).filter((f) => f.level === 'warn').map((f) => f.rule);
}

test('templates load, and every one has a heading contract', () => {
  assert.ok(TEMPLATES.size >= 30, `expected the full template set, got ${TEMPLATES.size}`);
  for (const [name, t] of TEMPLATES) {
    assert.ok(t.headings.length > 0, `template ${name} has no ## headings`);
  }
  assert.ok(TEMPLATES.get('gate-log').isGateLog);
});

test('E009: NOT_RUN and UNKNOWN are G4 checklist results only (§13.12)', () => {
  const notRun = (s) => s.replace('| PASS | §Problem statement names duplication and drift, no technology |', '| NOT_RUN | the tool was not installed |');
  assert.deepEqual(errorRules(scratchWith(LOG_G0, notRun)), ['E009']);
  const asG4 = (s) => notRun(s).replace('gate: G0', 'gate: G4').replace('stage: intake', 'stage: api');
  assert.ok(!errorRules(scratchWith(LOG_G0, asG4, 'G4-api-20260916-091203-3f2a.md')).includes('E009'));
});

test('L2 the valid corpus produces zero errors and zero warnings', () => {
  const findings = lintTree(VALID, TEMPLATES);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
});

/**
 * One row per rule. `assert.deepEqual(rules, [rule])` is the whole point: the mutation must trip
 * exactly its own rule and no other, or the linter is either missing something or crying wolf.
 */
const BROKEN = [
  ['E001 no front matter', PROBLEM, (s) => s.replace(/^---\n[\s\S]*?\n---\n/, ''), 'E001'],
  ['E002 required field missing', PROBLEM, (s) => s.replace(/^status: .*\n/m, ''), 'E002'],
  ['E003 unknown artifact type', PROBLEM, (s) => s.replace('artifact: problem', 'artifact: banana'), 'E003'],
  ['E004 heading renamed', PROBLEM, (s) => s.replace('## Problem statement', '## Problem'), 'E004'],
  ['E004 heading added', PROBLEM, (s) => s.replace('## Constraints', '## Budget\n\nNone.\n\n## Constraints'), 'E004'],
  ['E005 placeholder left behind', PROBLEM, (s) => s.replace('The four testers', '<who has this problem>'), 'E005'],
  ['E006 malformed REQ id', REQUIREMENTS, (s) => s.replace('| REQ-001 |', '| REQ-1 |'), 'E006'],
  ['E007 author reviews own work', PROBLEM, (s) => s.replace('reviewed_by: dev-reviewing-intake', 'reviewed_by: dev-framing-problem'), 'E007'],
  ['E008 checklist row without evidence', LOG_G0, (s) => s.replace('| PASS | §Problem statement names duplication and drift, no technology |', '| PASS |  |'), 'E008'],
  ['E009 unknown verdict', LOG_G0, (s) => s.replace('verdict: PASS', 'verdict: OK'), 'E009'],
  ['E009 unknown severity', LOG_G0, (s) => s.replace('| CR-001 | MINOR |', '| CR-001 | LOW |'), 'E009'],
  ['E009 unknown change class', PROBLEM, (s) => s.replace('change_class: change', 'change_class: epic'), 'E009'],
  ['E010 the withdrawn approved status', PROBLEM, (s) => s.replace('status: in-review', 'status: approved'), 'E010'],
  ['E012 SKIPPED without a typed reason', LOG_G5_SKIPPED, (s) => s.replace(/skip_reason: \{[^\n]*\}/, 'skip_reason: null'), 'E012'],
  ['E013 PASS with nothing reviewed', LOG_G0, (s) => s.replace(/outputs:\n  - path: [^\n]*\n    sha256: [^\n]*\n/, 'outputs:\n'), 'E013'],
  ['E014 attempt 2 with no per-finding resolution', LOG_G1_ATTEMPT2, (s) => s.replace(/## Finding resolution\n\n[\s\S]*?\n\n## Carried forward/, '## Finding resolution\n\nAll addressed.\n\n## Carried forward'), 'E014'],
  ['E015 artifact in the wrong stage', PROBLEM, (s) => s.replace('stage: intake', 'stage: design'), 'E015'],
  // The user's rule, made enforceable: a skill may not answer its own open question by choosing its
  // own default. `assumed` is a human's word, so a row wearing it with nobody named is an agent's
  // answer in the one format that looks like it is not one.
  ['E017 assumed with nobody named', DECISIONS, (s) => s.replace('| open | —', '| assumed | —'), 'E017'],
  // Found in the live shakedown: a reviewer filed the decision ledger under `outputs`, which is
  // defensible-looking — the stage did write the file — and quietly disables the damping valve.
  // Answering one question then marks the reviewed artifact as edited, `--reaffirm` declines on an
  // output change by design, and a single answer costs a full stage re-run (§15.2).
  [
    'E016 decision ledger filed as an output',
    LOG_G0,
    (s) => s.replace(/outputs:\n/, 'outputs:\n  - path: dev/decisions/demo.md\n    sha256: 0000000000000000000000000000000000000000000000000000000000000000\n'),
    'E016',
  ],
];

// §5.3 finding classes. `withClass` adds the Class column the way a reviewer writes it.
const G1_LOG = 'reviews/demo/G1-requirements-20260916-141855-b09e.md';
const withClass = (cls) => (s) => s
  .replace('| Id | Severity | Location |', '| Id | Severity | Class | Location |')
  .replace('|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|---|')
  .replace('| CR-002 | MAJOR |', `| CR-002 | MAJOR | ${cls} |`)
  .replace('| CR-003 | MAJOR |', '| CR-003 | MAJOR | defect |');
BROKEN.push(
  ['E030 a drift finding at MAJOR', G1_LOG, withClass('drift'), 'E030'],
  ['E030 a bookkeeping finding at MAJOR', G1_LOG, withClass('bookkeeping'), 'E030'],
  ['E009 a finding class outside the vocabulary', G1_LOG, withClass('wording'), 'E009'],
);

test('E009 accepts every change class §15.1 names, refactor and spike included', () => {
  for (const cls of ['initiative', 'change', 'fix', 'refactor', 'spike', 'fast']) {
    assert.ok(!errorRules(scratchWith(PROBLEM, (s) => s.replace('change_class: change', `change_class: ${cls}`))).includes('E009'), cls);
  }
});

test('L1 a defect at MAJOR, a MINOR drift, and a log with no Class column are clean (§5.3)', () => {
  assert.deepEqual(errorRules(scratchWith(G1_LOG, withClass('defect'))), []);
  assert.deepEqual(errorRules(scratchWith(G1_LOG)), []);
  const minorDrift = (s) => withClass('drift')(s).replace('| MAJOR | drift |', '| MINOR | drift |');
  assert.deepEqual(errorRules(scratchWith(G1_LOG, minorDrift)), []);
});

for (const [name, file, mutate, rule] of BROKEN) {
  test(`L2 broken — ${name}`, () => {
    const rules = errorRules(scratchWith(file, mutate));
    assert.deepEqual(rules, [rule], `expected exactly [${rule}], got [${rules.join(', ')}]`);
  });
}

test('L2 broken — E011 filename disagrees with front matter', () => {
  const root = scratchWith(LOG_G0, null, 'G0-intake-20260916-999999-ffff.md');
  assert.deepEqual(errorRules(root), ['E011']);
});

test('L1-09 a bare N/A is a warning, never an error', () => {
  const root = scratchWith(PROBLEM, (s) => s.replace(/## Current workaround\n\n[^\n]+/, '## Current workaround\n\nN/A'));
  assert.deepEqual(errorRules(root), []);
  assert.deepEqual(warnRules(root), ['W002']);
});

test('a CRLF checkout of the valid corpus lints exactly as the LF one does', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-crlf-'));
  cpSync(VALID, root, { recursive: true });
  const crlf = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) crlf(p);
      else if (p.endsWith('.md')) writeFileSync(p, readLF(p).replace(/\n/g, '\r\n'));
    }
  };
  crlf(root);
  assert.match(readFileSync(join(root, PROBLEM), 'utf8'), /\r\n/, 'the copy really is CRLF');
  assert.deepEqual(lintTree(root, TEMPLATES), []);
  rmSync(root, { recursive: true, force: true });
});

test('L1-10 a thin-but-valid section is not graded — the linter does not judge quality', () => {
  // A one-sentence answer is still an answer. Quality is the reviewer's call (DEV-CONTRACTS §11).
  const root = scratchWith(PROBLEM, (s) => s.replace(/## Impact if unsolved\n\n[^\n]+/, '## Impact if unsolved\n\nHalf a day per tester per sprint.'));
  assert.deepEqual(errorRules(root), []);
  assert.deepEqual(warnRules(root), []);
});

test('the id notation in the contract is not a malformed id', () => {
  // §1 writes "an id of this shape" as `REQ-NNN`, and every published checklist uses that form.
  // §5.3 then requires a gate log to quote its checklist rows verbatim. Without this exemption the
  // two rules contradict: quoting correctly fails the linter, and the only escape is to paraphrase
  // the checklist — the precise drift the verbatim rule exists to prevent. Found live, by a G1
  // reviewer that chose to reword and disclose rather than ship a red lint.
  const inserted = (text) => (s) => s.replace('## Checklist', `## Checklist\n\n${text}\n`);

  const notation = 'Every `REQ-NNN` has a `DEC-NNN`, a `TASK-NNN`, an `ADR-NNN` and a `CR-NNN`.';
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted(notation))), []);

  // A genuinely malformed id must still fail, or the exemption has eaten the rule.
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted('See REQ-7 for the shape.'))), ['E006']);
});

test('E006 does not judge ids inside code spans or fenced blocks', () => {
  // Found in the field: prose naming a rule (`REQ-coverage`), a regex (`CR-30[0-9]`) and a
  // shortened id quoted from a tool (`CR-25`) all raised E006, though none of them is an id.
  const inserted = (text) => (s) => s.replace('## Checklist', `## Checklist\n\n${text}\n`);
  const spans = 'The `REQ-coverage` check, the regex `CR-30[0-9]`, and `CR-25` from the tool output.';
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted(spans))), []);

  const fenced = ['```text', 'REQ-1 TASK-x CR-25', '```'].join('\n');
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted(fenced))), []);
  const tilde = ['~~~', 'ADR-7', '~~~'].join('\n');
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted(tilde))), []);

  // A bare malformed id in prose is still an error, including on a line that also has a span.
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted('See REQ-coverage for details.'))), ['E006']);
  assert.deepEqual(errorRules(scratchWith(LOG_G0, inserted('`REQ-coverage` and CR-25.'))), ['E006']);
});

test('an id at the end of a sentence is not malformed', () => {
  const root = scratchWith(PROBLEM, (s) => s.replace('See DEC-001 in the decision ledger.', 'Tracked as DEC-001.'));
  assert.deepEqual(errorRules(root), []);
});

test('a hash made only of digits is still a hash, not the number zero', () => {
  // The attempt-1 G1 log records an all-zero sha256 for its draft; the linter once read that as 0.
  const root = scratchWith('reviews/demo/G1-requirements-20260916-141855-b09e.md');
  assert.deepEqual(errorRules(root), []);
});

test('--file mode: templates, derived files and non-markdown are skipped silently', () => {
  const ctx = { root: VALID, templates: TEMPLATES };
  assert.deepEqual(lintFile(join(VALID, '_templates', 'problem.md'), ctx), []);
  assert.deepEqual(lintFile(join(VALID, 'state.json'), ctx), []);
  assert.deepEqual(lintFile(join(VALID, 'DASHBOARD.md'), ctx), []);
  assert.deepEqual(lintFile(join(VALID, 'api', 'demo', 'openapi.yaml'), ctx), []);
});

test('every artifact token in the contract enum has a template, and vice versa', () => {
  const contract = readLF(join(here, '..', 'DEV-CONTRACTS.md'));
  const enumMatch = /artifact: <([^>]+)>/.exec(contract);
  assert.ok(enumMatch, 'artifact enum not found in DEV-CONTRACTS §3.1');
  const inContract = new Set(enumMatch[1].split('|'));
  const inTemplates = new Set([...TEMPLATES.keys()].filter((k) => k !== 'gate-log'));

  const missingTemplate = [...inContract].filter((a) => !inTemplates.has(a) && a !== 'api-contract');
  const missingEnum = [...inTemplates].filter((t) => !inContract.has(t));
  assert.deepEqual(missingTemplate, [], `in the contract enum but no template: ${missingTemplate}`);
  assert.deepEqual(missingEnum, [], `template exists but not in the contract enum: ${missingEnum}`);
});

test('a superseded gate log cannot fail the build, but is still reported', () => {
  // §5 forbids editing a log and §17 keeps adding checks, so an old log will eventually break a rule
  // it could not have known about. If that failed the build, `dev:lint` would be red forever on a
  // healthy project — and the one signal this pipeline cannot afford is one people learn to skip.
  const root = mkdtempSync(join(tmpdir(), 'sdlc-superseded-'));
  const dir = join(root, 'reviews', 'demo');
  mkdirSync(dir, { recursive: true });

  const A1 = 'G1-requirements-20260916-141855-b09e.md';
  const A2 = 'G1-requirements-20260916-141855-b09e-a2.md';
  const attempt1 = readLF(join(VALID, 'reviews', 'demo', A1));
  const attempt2 = readLF(join(VALID, 'reviews', 'demo', A2));

  // File the decision ledger as an output — E016 — in the SUPERSEDED log only.
  const ledgerAsOutput = (s) =>
    s.replace(
      'outputs:\n',
      ['outputs:', '  - path: dev/decisions/demo.md', `    sha256: ${'0'.repeat(64)}`, ''].join('\n'),
    );

  writeFileSync(join(dir, A1), ledgerAsOutput(attempt1));
  writeFileSync(join(dir, A2), attempt2);
  assert.deepEqual(errorRules(root), [], 'a superseded log never fails the build');
  assert.deepEqual(warnRules(root), ['E016'], 'but it is still reported');

  // The same break in the log that IS in force must fail.
  writeFileSync(join(dir, A2), ledgerAsOutput(attempt2));
  assert.deepEqual(errorRules(root), ['E016'], 'the live log still fails');
});

// -----------------------------------------------------------------------------------------------
// W018 — a stage that never mentions an open decision.
//
// This is a whole-tree rule, so it cannot use scratchWith: the point is the relationship between
// the ledger, one stage's artifacts, and that stage's gate log.
// -----------------------------------------------------------------------------------------------

/** The valid corpus, copied, with one mutation applied to one file. */
function scratchTree(relPath, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-tree-'));
  cpSync(VALID, root, { recursive: true });
  const target = join(root, relPath);
  writeFileSync(target, mutate(readLF(target)));
  return root;
}

const w018 = (findings) => findings.filter((f) => f.rule === 'W018');

test('W018 the valid corpus is silent — every stage names the open decision', () => {
  const findings = w018(lintTree(VALID, TEMPLATES));
  assert.deepEqual(findings, [], 'W018 fired on a corpus where every stage cites DEC-001');
});

test('W018 a stage that stops mentioning the open decision is reported', () => {
  // design/demo/architecture.md is the only design artifact citing DEC-001, and the G2 log does
  // not — so removing it makes the whole design stage silent about a decision still open.
  const root = scratchTree('design/demo/architecture.md', (s) => s.replaceAll('DEC-001', 'the open question'));
  const findings = w018(lintTree(root, TEMPLATES));

  assert.equal(findings.length, 1, `expected exactly one W018, got ${JSON.stringify(findings)}`);
  assert.equal(findings[0].file, 'design/demo');
  assert.equal(findings[0].level, 'warn', 'W018 must stay advisory — the linter does not judge meaning (§11)');
  assert.match(findings[0].message, /DEC-001/);

  rmSync(root, { recursive: true, force: true });
});

test('W018 an answered decision is not chased', () => {
  // DEC-002 is `answered`, and nothing outside the ledger mentions it. That must stay quiet, or the
  // rule fires on every stage of every slug forever and is turned off within a week.
  const root = scratchTree('decisions/demo.md', (s) => s.replace('| DEC-001 |', '| DEC-009 |'));
  const findings = w018(lintTree(root, TEMPLATES));

  // DEC-009 is now open and unmentioned everywhere, so every stage reports — but only once each,
  // and never for DEC-002.
  assert.ok(findings.length > 0, 'renaming the open decision should make every stage silent about it');
  for (const f of findings) {
    assert.match(f.message, /DEC-009/);
    assert.doesNotMatch(f.message, /DEC-002/, 'an answered decision must not be chased');
  }

  rmSync(root, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------------------------
// Cross-file traceability (§6). Whole-tree rules: a reference is only dangling relative to the
// file that should define it, so each case copies the whole corpus and breaks one reference.
// -----------------------------------------------------------------------------------------------

const TASKS = 'plan/demo/tasks.md';
const ACS = 'requirements/demo/acceptance-criteria.md';

function treeErrors(root) {
  const errors = lintTree(root, TEMPLATES).filter((f) => f.level === 'error');
  rmSync(root, { recursive: true, force: true });
  return errors;
}

const TRACE = [
  ['E018 a task cites a REQ that requirements.md does not define', TASKS, (s) => s.replace('| GET list with cursor pagination | REQ-002 |', '| GET list with cursor pagination | REQ-099 |'), 'E018', /REQ-099/],
  ['E018 a criterion cites a REQ that requirements.md does not define', ACS, (s) => s.replace('| AC-003 | REQ-002 |', '| AC-003 | REQ-099 |'), 'E018', /REQ-099/],
  ['E019 tasks.md cites an AC that acceptance-criteria.md does not define', TASKS, (s) => s.replace('| AC-002 | integration |', '| AC-009 | integration |'), 'E019', /AC-009/],
  ['E020 a task depends on a TASK id that does not exist', TASKS, (s) => s.replace('| TASK-003 | telemetry_test.go |', '| TASK-009 | telemetry_test.go |'), 'E020', /TASK-009/],
  ['E021 the dependencies form a cycle', TASKS, (s) => s.replace('| none |', '| TASK-004 |'), 'E021', /TASK-001 → TASK-004 → TASK-003 → TASK-002 → TASK-001/],
  ['E021 a task that depends on itself', TASKS, (s) => s.replace('| internal/testcase/repo.go | TASK-001 |', '| internal/testcase/repo.go | TASK-002 |'), 'E021', /TASK-002 → TASK-002/],
];

for (const [name, file, mutate, rule, mentions] of TRACE) {
  test(`L2 broken — ${name}`, () => {
    const before = readLF(join(VALID, file));
    assert.notEqual(mutate(before), before, 'the mutation must change the file, or the test proves nothing');
    const errors = treeErrors(scratchTree(file, mutate));
    assert.deepEqual(errors.map((f) => f.rule), [rule], JSON.stringify(errors, null, 2));
    assert.match(errors[0].message, mentions);
  });
}

test('cross-file checks stay quiet when the defining file does not exist yet', () => {
  // A `fix` has no requirements.md, and a plan may be drafted before the criteria are final. A
  // reference to a file that is not there is the reviewer's question, not a dangling id.
  const root = scratchTree(TASKS, (s) => s.replace('| AC-002 | integration |', '| AC-009 | integration |'));
  rmSync(join(root, ACS));
  assert.deepEqual(treeErrors(root), []);
});

// -----------------------------------------------------------------------------------------------
// progress.md (§8.1): execution status outside the reviewed plan.
// -----------------------------------------------------------------------------------------------

const PROGRESS = 'implementation/demo/progress.md';

const PROGRESS_BROKEN = [
  ['E022 a progress row for a task tasks.md does not have', (s) => s.replace('| TASK-001 | done |', '| TASK-042 | done |'), 'E022', /TASK-042/],
  ['E009 a progress status outside the vocabulary', (s) => s.replace('| TASK-001 | done |', '| TASK-001 | finished |'), 'E009', /finished/],
  ['E022 a blocked task with no reason in Note', (s) => s.replace('| TASK-003 | in-progress | — | title-only search while DEC-001 is open; sort tiebreaker next |', '| TASK-003 | blocked | — | — |'), 'E022', /blocked/],
];

for (const [name, mutate, rule, mentions] of PROGRESS_BROKEN) {
  test(`L2 broken — ${name}`, () => {
    assert.notEqual(mutate(readLF(join(VALID, PROGRESS))), readLF(join(VALID, PROGRESS)));
    const errors = treeErrors(scratchTree(PROGRESS, mutate));
    assert.deepEqual(errors.map((f) => f.rule), [rule], JSON.stringify(errors, null, 2));
    assert.match(errors[0].message, mentions);
  });
}

test('progress.md accepts in_progress as a spelling of in-progress, and a blocked row with a reason', () => {
  const mutate = (s) => s.replace('| TASK-003 | in-progress |', '| TASK-003 | in_progress |').replace('| TASK-001 | done | 3f9c2a1 |', '| TASK-001 | blocked | — | waiting on DEC-001 |\n| TASK-001 | done | 3f9c2a1 |');
  assert.deepEqual(lintTree(scratchTree(PROGRESS, mutate), TEMPLATES), []);
});

test('W007 execution status written into tasks.md is reported', () => {
  // Marking a task done in the reviewed plan changes its hash and stales G6; progress.md is where it goes.
  const mutate = (s) => s.replace('| repo_test.go | M | todo |', '| repo_test.go | M | done |');
  const findings = lintTree(scratchTree(TASKS, mutate), TEMPLATES);
  assert.deepEqual(findings.map((f) => `${f.level} ${f.rule}`), ['warn W007'], JSON.stringify(findings, null, 2));
  assert.match(findings[0].message, /progress\.md/);
});

// -----------------------------------------------------------------------------------------------
// Slice mode (§5.5): lane fragments and per-slice G7 logs.
// -----------------------------------------------------------------------------------------------

/** A complete, valid artifact built from a template's headings — every section answered. */
function fromTemplate(type, stage) {
  const fm = ['---', 'slug: demo', `stage: ${stage}`, `artifact: ${type}`, 'status: draft', 'authored_by: dev-documenting-changes',
    'reviewed_by: pending', 'tracker: none', 'created: 2026-09-20', 'updated: 2026-09-20', 'requirements: [REQ-001]', '---', ''];
  const body = TEMPLATES.get(type).headings.flatMap((h) => [h, '', 'N/A — this fixture builds nothing in this section.', '']);
  return [...fm, ...body].join('\n');
}

function scratchFile(rel, text) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-slice-'));
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  return root;
}

test('a lane note may end with or without `## Process friction`, but not put it in the middle', () => {
  const full = fromTemplate('change-summary', 'implementation');
  assert.match(full, /## Process friction/);
  const without = full.replace(/\n## Process friction\n[\s\S]*$/, '\n');
  assert.deepEqual(errorRules(scratchFile('implementation/demo/lanes/lane-a.md', full)), [], 'with it');
  assert.deepEqual(errorRules(scratchFile('implementation/demo/lanes/lane-a.md', without)), [], 'a note written before it existed');
  const middle = without.replace('## Not done', '## Process friction\n\n- slow build\n\n## Not done');
  assert.deepEqual(errorRules(scratchFile('implementation/demo/lanes/lane-a.md', middle)), ['E004']);
});

test('a lane fragment is a change-summary under implementation/<slug>/lanes/lane-<x>.md', () => {
  assert.deepEqual(errorRules(scratchFile('implementation/demo/lanes/lane-a.md', fromTemplate('change-summary', 'implementation'))), []);
  assert.deepEqual(errorRules(scratchFile('implementation/demo/lanes/lane-api-2.md', fromTemplate('change-summary', 'implementation'))), []);

  const wrongName = errorRules(scratchFile('implementation/demo/lanes/notes.md', fromTemplate('change-summary', 'implementation')));
  assert.deepEqual(wrongName, ['E015']);
  const wrongType = fromTemplate('change-summary', 'implementation').replace('artifact: change-summary', 'artifact: tasks');
  assert.ok(errorRules(scratchFile('implementation/demo/lanes/lane-a.md', wrongType)).includes('E015'));
});

const G7_SLICE = 'reviews/demo/G7-implementation-20260921-090000-5a1c.md';

function sliceLog(mutate = (s) => s) {
  const s = readLF(join(VALID, LOG_G0))
    .replace('gate: G0', 'gate: G7\nscope: slice-1')
    .replace('stage: intake', 'stage: implementation')
    .replace('run_id: 20260916-091203-3f2a', 'run_id: 20260921-090000-5a1c')
    .replace('reviewer: dev-reviewing-intake', 'reviewer: dev-reviewing-implementation')
    .replace(/## Scope\n\n[^\n]*\n/, '## Scope\n\nSlice 1: base 1a2b3c4 → head 5d6e7f8, TASK-001 and TASK-002.\n');
  return mutate(s);
}

test('a slice G7 log names its scope and its base and head commits', () => {
  assert.deepEqual(errorRules(scratchFile(G7_SLICE, sliceLog())), []);
  assert.deepEqual(errorRules(scratchFile(G7_SLICE, sliceLog((s) => s.replace('scope: slice-1', 'scope: slice-one')))), ['E009']);
  assert.deepEqual(errorRules(scratchFile(G7_SLICE, sliceLog((s) => s.replace('base 1a2b3c4 → head 5d6e7f8', 'the first slice')))), ['E024']);
});

// §4.4 / §5.1: G7 binds code by commit, and change-summary.md is generated (change-summary.mjs).
const G7_FINAL = 'reviews/demo/G7-implementation-20260922-090000-7e7e.md';
function finalG7(mutate = (s) => s) {
  const s = readLF(join(VALID, LOG_G0))
    .replace('gate: G0', 'gate: G7\nreviewed_commit: 5d6e7f8')
    .replace('stage: intake', 'stage: implementation')
    .replace('run_id: 20260916-091203-3f2a', 'run_id: 20260922-090000-7e7e')
    .replace('reviewer: dev-reviewing-intake', 'reviewer: dev-reviewing-implementation')
    .replace(/outputs:\n  - path: [^\n]*\n    sha256: [^\n]*\n/, 'outputs:\n');
  return mutate(s);
}

test('a final G7 log binds the code by reviewed_commit, and needs no outputs', () => {
  assert.deepEqual(errorRules(scratchFile(G7_FINAL, finalG7())), []);
  assert.deepEqual(warnRules(scratchFile(G7_FINAL, finalG7())).filter((r) => r === 'W031'), []);
  assert.deepEqual(errorRules(scratchFile(G7_FINAL, finalG7((s) => s.replace('reviewed_commit: 5d6e7f8', 'reviewed_commit: HEAD')))), ['E031']);
  const onG0 = readLF(join(VALID, LOG_G0)).replace('gate: G0', 'gate: G0\nreviewed_commit: 5d6e7f8');
  assert.deepEqual(errorRules(scratchFile(LOG_G0, onG0)), ['E031']);
});

test('a final G7 log without reviewed_commit, or still hashing change-summary.md, is a warning', () => {
  const noSha = finalG7((s) => s.replace('reviewed_commit: 5d6e7f8\n', '').replace('outputs:\n', 'outputs:\n  - path: dev/implementation/demo/change-summary.md\n    sha256: 4a1c\n'));
  assert.deepEqual(errorRules(scratchFile(G7_FINAL, noSha)), []);
  assert.deepEqual(warnRules(scratchFile(G7_FINAL, noSha)).filter((r) => r === 'W031'), ['W031', 'W031']);
  const noShaNoOutputs = finalG7((s) => s.replace('reviewed_commit: 5d6e7f8\n', ''));
  assert.deepEqual(errorRules(scratchFile(G7_FINAL, noShaNoOutputs)), ['E013']);
  const slice = sliceLog().replace('run_id: 20260921-090000-5a1c', 'run_id: 20260921-090000-5a1c');
  assert.deepEqual(warnRules(scratchFile(G7_SLICE, slice)).filter((r) => r === 'W031'), [], 'a slice log is bound by its Scope shas');
});

test('W031 warns on the G7 log in force only; a superseded attempt cannot be edited to clear it', () => {
  const noSha = finalG7((s) => s.replace('reviewed_commit: 5d6e7f8\n', '')
    .replace('outputs:\n', 'outputs:\n  - path: dev/implementation/demo/change-summary.md\n    sha256: 4a1c\n'));
  const root = scratchFile(G7_FINAL, noSha);
  writeFileSync(join(root, G7_FINAL.replace('.md', '-a2.md')), noSha.replace('attempt: 1', 'attempt: 2'));
  const w031 = lintTree(root, TEMPLATES).filter((f) => f.rule === 'W031').map((f) => f.file.split(sep).join('/'));
  assert.deepEqual(w031, [G7_FINAL.replace('.md', '-a2.md'), G7_FINAL.replace('.md', '-a2.md')]);
});

test('a hand-written change-summary, or one citing file:line, is a warning', () => {
  const CS = 'implementation/demo/change-summary.md';
  const generated = fromTemplate('change-summary', 'implementation').replace('requirements: [REQ-001]', 'requirements: [REQ-001]\ngenerated_by: change-summary.mjs');
  assert.deepEqual(warnRules(scratchFile(CS, generated)).filter((r) => r === 'W032'), []);
  const byHand = fromTemplate('change-summary', 'implementation');
  assert.deepEqual(warnRules(scratchFile(CS, byHand)).filter((r) => r === 'W032'), ['W032']);
  const lines = generated.replace('N/A — this fixture builds nothing in this section.', 'See `internal/job/service.go:42-57` and installer.py:271.');
  assert.deepEqual(warnRules(scratchFile(CS, lines)).filter((r) => r === 'W032'), ['W032']);
  const symbol = generated.replace('N/A — this fixture builds nothing in this section.', 'See `internal/job/service.go` `AssignJob`, and a time 10:30.');
  assert.deepEqual(warnRules(scratchFile(CS, symbol)).filter((r) => r === 'W032'), []);
  assert.deepEqual(warnRules(scratchFile('implementation/demo/lanes/lane-a.md', byHand)).filter((r) => r === 'W032'), [], 'a lane note is written by hand');
});

test('only G7 may be reviewed per slice', () => {
  const g2 = sliceLog((s) => s.replace('gate: G7', 'gate: G2').replace('stage: implementation', 'stage: design').replace('dev-reviewing-implementation', 'dev-reviewing-design'));
  const rules = errorRules(scratchFile('reviews/demo/G2-design-20260921-090000-5a1c.md', g2));
  assert.deepEqual(rules, ['E009']);
});

test('a later slice log does not supersede the final G7 log', () => {
  // The final G7 log is in force for the gate; a slice log is in force only for its slice. If a
  // slice log reviewed after the final one counted, it would demote the final log to advisory.
  const finalLog = sliceLog((s) => s.replace('scope: slice-1\n', '').replace('run_id: 20260921-090000-5a1c', 'run_id: 20260920-090000-0b0b'))
    .replace('outputs:\n', `outputs:\n  - path: dev/decisions/demo.md\n    sha256: ${'0'.repeat(64)}\n`);
  const root = scratchFile('reviews/demo/G7-implementation-20260920-090000-0b0b.md', finalLog);
  writeFileSync(join(root, G7_SLICE), sliceLog());
  assert.deepEqual(errorRules(root), ['E016'], 'the final log stays in force, so its error still fails');
});

// -----------------------------------------------------------------------------------------------
// Row-scoped decision-ledger inputs (§5.2).
// -----------------------------------------------------------------------------------------------

const LOG_G2_PATH = 'reviews/demo/G2-design-20260917-101422-7c15.md';
const citeLedger = (fragment) => (s) => s.replace('inputs:\n', `inputs:\n  - path: dev/decisions/demo.md${fragment}\n    sha256: ${'a'.repeat(64)}\n`);

test('a ledger input may cite the DEC rows it relies on', () => {
  assert.deepEqual(treeErrors(scratchTree(LOG_G2_PATH, citeLedger('#DEC-001,DEC-002'))), []);
  assert.deepEqual(treeErrors(scratchTree(LOG_G2_PATH, citeLedger(''))), [], 'the whole file, as before');
});

test('E025 a ledger input that cites a DEC the ledger does not have, or is malformed', () => {
  const missing = treeErrors(scratchTree(LOG_G2_PATH, citeLedger('#DEC-001,DEC-009')));
  assert.deepEqual(missing.map((f) => f.rule), ['E025'], JSON.stringify(missing));
  assert.match(missing[0].message, /DEC-009/);
  assert.deepEqual(treeErrors(scratchTree(LOG_G2_PATH, citeLedger('#decision-one'))).map((f) => f.rule), ['E025']);
  const notLedger = (s) => s.replace('path: dev/requirements/demo/requirements.md', 'path: dev/requirements/demo/requirements.md#DEC-001');
  assert.deepEqual(treeErrors(scratchTree(LOG_G2_PATH, notLedger)).map((f) => f.rule), ['E025']);
});

test('W019 a whole-ledger input warns on the log in force, and only there', () => {
  const tree = (root) => lintTree(root, TEMPLATES).filter((f) => f.rule === 'W019');
  const whole = tree(scratchTree(LOG_G2_PATH, citeLedger('')));
  assert.deepEqual(whole.map((f) => `${f.level} ${f.file}`), [`warn ${LOG_G2_PATH}`], JSON.stringify(whole));
  assert.match(whole[0].message, /migrate-ledger-inputs/);
  assert.deepEqual(tree(scratchTree(LOG_G2_PATH, citeLedger('#DEC-001'))), [], 'a row-scoped input is silent');

  // A superseded attempt cannot be edited (§5), so the advice is dropped there, not demoted.
  const root = scratchTree(LOG_G1_ATTEMPT2, citeLedger(''));
  const a1 = LOG_G1_ATTEMPT2.replace('-a2.md', '.md');
  writeFileSync(join(root, a1), citeLedger('')(readLF(join(VALID, a1))));
  assert.deepEqual(tree(root).map((f) => f.file), [LOG_G1_ATTEMPT2]);
});

test('E016 still catches a row-scoped ledger filed as an output', () => {
  const asOutput = (s) => s.replace('outputs:\n', `outputs:\n  - path: dev/decisions/demo.md#DEC-001\n    sha256: ${'a'.repeat(64)}\n`);
  assert.deepEqual(treeErrors(scratchTree(LOG_G2_PATH, asOutput)).map((f) => f.rule), ['E016']);
});

// -----------------------------------------------------------------------------------------------
// Reaffirm logs (§4.4): traceable to the review they reaffirm, and a self-edit carries its diff.
// -----------------------------------------------------------------------------------------------

const G0_REAFFIRM = 'reviews/demo/G0-intake-20260919-080000-9c9c.md';
const DIFF_BLOCK = '```diff\n- The four testers\n+ All four testers\n```';

/** A reaffirm of the G0 log. `ownEdit` records a different output hash: the artifact itself moved. */
function reaffirmLog({ from = `dev/${LOG_G0}`, ownEdit = true, scope = DIFF_BLOCK, runId = '20260919-080000-9c9c' } = {}) {
  let s = readLF(join(VALID, LOG_G0))
    .replace('run_id: 20260916-091203-3f2a', `run_id: ${runId}`)
    .replace('revalidated_from: null', `revalidated_from: ${from}`)
    .replace(/## Scope\n\n[^\n]*\n/, `## Scope\n\nReaffirm of the G0 review: one wording change in problem.md.\n\n${scope}\n`);
  if (ownEdit) s = s.replace('50faca82540e0bdc237790944de57613af330bb1f709c23ba08167042d48a8b6', 'b'.repeat(64));
  return s;
}

function treeWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-reaffirm-'));
  cpSync(VALID, root, { recursive: true });
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
  return root;
}

test('a self-edit reaffirm with its diff, from a full review, is valid', () => {
  assert.deepEqual(treeErrors(treeWith({ [G0_REAFFIRM]: reaffirmLog() })), []);
  assert.deepEqual(treeErrors(treeWith({ [G0_REAFFIRM]: reaffirmLog({ ownEdit: false, scope: 'Only requirements upstream moved.' }) })), [], 'an upstream reaffirm needs no diff block');
});

test('E026 a reaffirm log must be traceable and bounded', () => {
  const noDiff = treeErrors(treeWith({ [G0_REAFFIRM]: reaffirmLog({ scope: 'A small wording change.' }) }));
  assert.deepEqual(noDiff.map((f) => f.rule), ['E026'], JSON.stringify(noDiff));
  assert.match(noDiff[0].message, /diff/);

  const nowhere = treeErrors(treeWith({ [G0_REAFFIRM]: reaffirmLog({ from: 'dev/reviews/demo/G0-intake-20200101-000000-0000.md' }) }));
  assert.deepEqual(nowhere.map((f) => f.rule), ['E026']);

  const otherGate = treeErrors(treeWith({ [G0_REAFFIRM]: reaffirmLog({ from: `dev/${LOG_G2_PATH}` }) }));
  assert.deepEqual(otherGate.map((f) => f.rule), ['E026']);

  // Two small self-edits in a row must not add up to one large unreviewed one: the bound is
  // measured from the last FULL review.
  const chained = treeErrors(treeWith({
    [G0_REAFFIRM]: reaffirmLog(),
    'reviews/demo/G0-intake-20260920-080000-9d9d.md': reaffirmLog({ from: `dev/${G0_REAFFIRM}`, runId: '20260920-080000-9d9d' }).replace('b'.repeat(64), 'c'.repeat(64)),
  }));
  assert.deepEqual(chained.map((f) => f.rule), ['E026'], JSON.stringify(chained));
  assert.match(chained[0].message, /full review/);
});

// -----------------------------------------------------------------------------------------------
// ADR amendments (§1): an optional, trailing, append-only `## Amendments` section.
// -----------------------------------------------------------------------------------------------

const ADR_PATH = 'design/adr/ADR-004-cursor-pagination.md';
const AMENDMENTS = '## Amendments';

/** A valid ADR from the template's headings, with or without the Amendments section. */
function adr(templates, amendments) {
  const base = fromTemplate('adr', 'design').replace('authored_by: dev-documenting-changes', 'authored_by: dev-detailing-design');
  const withoutSection = base.replace(/## Amendments\n\nN\/A[^\n]*\n\n?/, '');
  return amendments === undefined ? withoutSection : `${withoutSection.trimEnd()}\n\n${AMENDMENTS}\n\n${amendments}\n`;
}

/** The templates as they are after agent A's change: adr.md ending in `## Amendments`. */
function templatesWithAmendments() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-tpl-'));
  cpSync(join(here, '..', 'workspace', 'dev', '_templates'), dir, { recursive: true });
  const p = join(dir, 'adr.md');
  if (!readLF(p).includes(AMENDMENTS)) writeFileSync(p, `${readLF(p).trimEnd()}\n\n${AMENDMENTS}\n\n<optional, append-only>\n`);
  return loadTemplates(dir);
}

const adrErrors = (text, templates = TEMPLATES) =>
  lintTree(scratchFile(ADR_PATH, text), templates).filter((f) => f.level === 'error').map((f) => f.rule);

test('ADR Amendments is optional and trailing, with either template', () => {
  const entries = '- 2026-09-20 — "list" means every collection endpoint — Lan\n- 2026-10-01 — cites DEC-004 (measured 80k rows) — Lan';
  for (const templates of [TEMPLATES, templatesWithAmendments()]) {
    assert.deepEqual(adrErrors(adr(templates), templates), [], 'an ADR with no amendments');
    assert.deepEqual(adrErrors(adr(templates, entries), templates), [], 'an ADR with dated amendments');
    const misplaced = adr(templates).replace('## Compliance', `${AMENDMENTS}\n\n- 2026-09-20 — early — Lan\n\n## Compliance`);
    assert.deepEqual(adrErrors(misplaced, templates), ['E004'], 'Amendments comes last');
  }
});

test('E027 each amendment is dated, in order — the section is append-only', () => {
  assert.deepEqual(adrErrors(adr(TEMPLATES, '- clarified the scope — Lan')), ['E027']);
  assert.deepEqual(adrErrors(adr(TEMPLATES, '- 2026-10-01 — later — Lan\n- 2026-09-20 — earlier, added after — Lan')), ['E027']);
});

// -----------------------------------------------------------------------------------------------
// Deferred debt (§5.3). A MINOR may be carried forward, but not forever and not anonymously.
// -----------------------------------------------------------------------------------------------

const LOG_G2 = 'reviews/demo/G2-design-20260917-101422-7c15.md';
const LOG_G6 = 'reviews/demo/G6-plan-20260918-104512-0e91.md';
const undefer = (s) => s.replace(/## Finding resolution\n\n[\s\S]*?\n\n## Carried forward/, '## Finding resolution\n\nN/A — first review.\n\n## Carried forward');

test('W004 a MINOR carried by three gates without a deferral is reported', () => {
  // CR-001 (MINOR, G0) is carried by G1, G2, G5 and G6. The valid G6 log defers it with an owner
  // and a target; take the deferral away and the carries are debt nobody owns.
  const root = scratchTree(LOG_G6, undefer);
  const findings = lintTree(root, TEMPLATES);
  rmSync(root, { recursive: true, force: true });
  assert.deepEqual(findings.map((f) => `${f.level} ${f.rule}`), ['warn W004'], JSON.stringify(findings, null, 2));
  assert.match(findings[0].message, /CR-001/);
  assert.match(findings[0].message, /G1, G2, G5, G6/);
  assert.equal(findings[0].file, LOG_G6, 'reported on the latest log that carried it');
});

test('W004 stays quiet below three gates', () => {
  const root = scratchTree(LOG_G6, undefer);
  const g2 = join(root, LOG_G2);
  writeFileSync(g2, readLF(g2).replace('CR-001 (MINOR, G0), CR-004', 'CR-004'));
  assert.deepEqual(lintTree(root, TEMPLATES).map((f) => f.rule), ['W004'], 'three gates (G1, G5, G6) is the threshold');
  const g5 = join(root, 'reviews/demo/G5-ui-20260917-160500-9a22.md');
  writeFileSync(g5, readLF(g5).replace('CR-001, CR-004', 'CR-004'));
  const findings = lintTree(root, TEMPLATES);
  rmSync(root, { recursive: true, force: true });
  assert.deepEqual(findings, []);
});

test('E023 a DEFERRED resolution names an owner and a target', () => {
  const noOwner = (s) => s.replace('owner: intake · target: G11 — ', '');
  assert.notEqual(noOwner(readLF(join(VALID, LOG_G6))), readLF(join(VALID, LOG_G6)));
  const errors = treeErrors(scratchTree(LOG_G6, noOwner));
  assert.deepEqual(errors.map((f) => f.rule), ['E023'], JSON.stringify(errors, null, 2));
  assert.match(errors[0].message, /owner/);

  const noTarget = (s) => s.replace('target: G11', 'target: later');
  assert.deepEqual(treeErrors(scratchTree(LOG_G6, noTarget)).map((f) => f.rule), ['E023']);
});

test('E023 only a MINOR or INFO finding may be DEFERRED', () => {
  // CR-002 is a MAJOR raised in G1 attempt 1. A MAJOR blocks a PASS (§5.3); deferring it would be a
  // PASS with an open MAJOR wearing a different word.
  const deferMajor = (s) => s.replace('| RESOLVED | requirements.md:§Functional requirements |', '| DEFERRED | owner: requirements · target: G6 |');
  const errors = treeErrors(scratchTree(LOG_G1_ATTEMPT2, deferMajor));
  assert.deepEqual(errors.map((f) => f.rule), ['E023'], JSON.stringify(errors, null, 2));
  assert.match(errors[0].message, /CR-002.*MAJOR/);
});

test('ids quoted in code spans are not references', () => {
  const mutate = (s) => s.replace('## Risks and unknowns\n', '## Risks and unknowns\n\nThe old plan used `REQ-777` and `AC-777`.\n');
  assert.notEqual(mutate(readLF(join(VALID, TASKS))), readLF(join(VALID, TASKS)));
  assert.deepEqual(treeErrors(scratchTree(TASKS, mutate)), []);
});

// -----------------------------------------------------------------------------------------------
// The approved visual reference (§13.3): a ui-spec may bind a wireframe by path and hash.
// -----------------------------------------------------------------------------------------------

const UI_SPEC = 'ui/demo/ui-spec.md';
const WIREFRAME = 'ui/demo/wireframe.html';
const WIREFRAME_HTML = '<!doctype html><title>demo</title><section id="s-list">list</section>\n';
const uiSpec = () => fromTemplate('ui-spec', 'ui').replace('authored_by: dev-documenting-changes', 'authored_by: dev-specifying-ui');

/** A dev root holding a valid ui-spec whose front matter carries `visual_reference: <value>`. */
function uiSpecWith(value, { writeWireframe = true } = {}) {
  const root = scratchFile(UI_SPEC, uiSpec().replace('requirements: [REQ-001]', `requirements: [REQ-001]\nvisual_reference: ${value}`));
  if (writeWireframe) writeFileSync(join(root, WIREFRAME), WIREFRAME_HTML);
  return root;
}

function wireframeHash() {
  const root = uiSpecWith('none');
  const hash = hashArtifact(join(root, WIREFRAME));
  rmSync(root, { recursive: true, force: true });
  return hash;
}

test('E028 a visual_reference that exists and hashes as recorded is valid; the key is optional', () => {
  const hash = wireframeHash();
  assert.deepEqual(treeErrors(uiSpecWith(`{ path: dev/ui/demo/wireframe.html, sha256: ${hash} }`)), []);
  assert.deepEqual(treeErrors(scratchFile(UI_SPEC, uiSpec())), []);
});

test('E028 a visual_reference that is missing, malformed or edited since approval is an error', () => {
  const hash = wireframeHash();
  const rules = (root) => treeErrors(root).map((f) => f.rule);
  assert.deepEqual(rules(uiSpecWith(`{ path: dev/ui/demo/wireframe.html, sha256: ${hash} }`, { writeWireframe: false })), ['E028'], 'the file is gone');
  assert.deepEqual(rules(uiSpecWith(`{ path: dev/ui/demo/wireframe.html, sha256: ${'0'.repeat(64)} }`)), ['E028'], 'the file changed after approval');
  assert.deepEqual(rules(uiSpecWith('{ path: dev/ui/demo/wireframe.html }')), ['E028'], 'no hash recorded');
  assert.deepEqual(rules(uiSpecWith('dev/ui/demo/wireframe.html')), ['E028'], 'a bare path, not { path, sha256 }');
  assert.deepEqual(rules(uiSpecWith(`{ path: ../outside.html, sha256: ${hash} }`)), ['E028'], 'a path outside the repository');
});

// A wireframe binds content, a visual design binds look (§13.3). release-management bound a low-fi
// wireframe ("Greys are placeholders") as the look, derived the tokens from it, and shipped grey.
function treeAll(root) {
  const all = lintTree(root, TEMPLATES);
  rmSync(root, { recursive: true, force: true });
  return all;
}

test('E028/W033 visual_reference carries a kind; a list binds a wireframe and a visual; no kind is a warning', () => {
  const hash = wireframeHash();
  const ref = (kind) => `{ path: dev/ui/demo/wireframe.html, sha256: ${hash}${kind ? `, kind: ${kind}` : ''} }`;
  assert.deepEqual(treeAll(uiSpecWith(ref('wireframe'))).map((f) => f.rule), []);
  assert.deepEqual(treeAll(uiSpecWith(`[${ref('wireframe')}, ${ref('visual')}]`)).map((f) => f.rule), [], 'a list of both kinds');
  assert.deepEqual(treeAll(uiSpecWith(ref(null))).map((f) => `${f.level}:${f.rule}`), ['warn:W033'], 'no kind: read as wireframe, warned');
  assert.deepEqual(treeErrors(uiSpecWith(ref('mockup'))).map((f) => f.rule), ['E028'], 'an unknown kind');
  assert.deepEqual(treeErrors(uiSpecWith(`[${ref('visual')}, { path: dev/ui/demo/wireframe.html }]`)).map((f) => f.rule), ['E028'], 'one bad entry in the list');
});

test('E029 a visual design is approved by a named person, with a date', () => {
  const vd = (extra) => fromTemplate('visual-design', 'ui').replace('authored_by: dev-documenting-changes', 'authored_by: dev-designing-visuals').replace('requirements: [REQ-001]', `requirements: [REQ-001]${extra}`);
  const rules = (extra) => treeErrors(scratchFile('ui/demo/visual-design.md', vd(extra))).map((f) => f.rule);
  assert.deepEqual(rules(''), [], 'not approved yet is valid');
  assert.deepEqual(rules('\napproved_by: Luan Nguyen\napproved_on: 2026-10-13'), []);
  assert.deepEqual(rules('\napproved_by: dev-designing-visuals\napproved_on: 2026-10-13'), ['E029'], 'a skill is not a person');
  assert.deepEqual(rules('\napproved_by: user\napproved_on: 2026-10-13'), ['E029']);
  assert.deepEqual(rules('\napproved_by: Luan Nguyen'), ['E029'], 'no date');
});

// Behaviour rows (§1, §6): a UB id is the join key a test names, so it is defined once.
test('E040 a behaviour row id defined twice in one ui-spec', () => {
  const table = (second) => `| Id | Screen | Roles | Trigger | Expected |\n|---|---|---|---|---|\n| UB-001 | S10 | Member | Esc with typed input | the discard bar replaces the footer |\n| ${second} | S10 | Member | Back with typed input | the discard bar, the dialog stays |`;
  const spec = (second) => uiSpec().replace('## Interaction and feedback\n\nN/A — this fixture builds nothing in this section.', `## Interaction and feedback\n\n${table(second)}`);
  assert.notEqual(spec('UB-002'), uiSpec());
  assert.deepEqual(treeErrors(scratchFile(UI_SPEC, spec('UB-002'))).map((f) => f.rule), []);
  assert.deepEqual(treeErrors(scratchFile(UI_SPEC, spec('UB-001'))).map((f) => f.rule), ['E040']);
});

// Table shape (§3): on Recall an unescaped `|` in an AC cell shifted every later cell one column.
test('E032 a table row whose cell count differs from its header', () => {
  const row = '| REQ-001 | A tester can create a test case | P0 | PRD §Functional scope | the core action |';
  const before = readLF(join(VALID, REQUIREMENTS));
  assert.ok(before.includes(row));
  const rules = (replacement) => treeErrors(scratchTree(REQUIREMENTS, (s) => s.replace(row, replacement))).map((f) => f.rule);
  assert.deepEqual(rules(row.replace('a test case', 'a test case | or a suite')), ['E032'], 'a stray pipe adds a cell');
  assert.deepEqual(rules(row.replace(' the core action |', '')), ['E032'], 'a missing cell');
  assert.deepEqual(rules(row.replace('a test case', 'a test case \\| or a suite')), [], 'an escaped pipe is text');
  assert.deepEqual(rules(row.replace('a test case', 'a test case `a|b`')), ['E032'], 'GitHub splits on a pipe inside a code span too');
  assert.deepEqual(rules(row.replace('a test case', 'a test case `a\\|b`')), [], 'escaped inside code is text');
});

// A run_id typed by hand: on fx-blog three G2 logs carried local time written as UTC, so their run
// ids were seven hours later than the commits that added them, and laterLog ordered them wrongly.
test('E034 a committed gate log whose run_id is later than the commit that added it', async () => {
  const { execFileSync } = await import('node:child_process');
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-runid-time-'));
  cpSync(VALID, join(repo, 'dev'), { recursive: true });
  const git = (env, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
  git({}, 'init', '-q');
  // The corpus's latest run_id is 2026-09-18 10:45:12 UTC; committing it all a day later is fine.
  const at = (iso) => ({ GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso });
  git({}, 'add', '.');
  git(at('2026-09-19T10:00:00Z'), 'commit', '-q', '-m', 'docs(sdlc): corpus');
  const e034 = () => lintTree(join(repo, 'dev'), TEMPLATES).filter((f) => f.rule === 'E034');
  assert.deepEqual(e034(), [], 'every corpus log is committed after its run started');
  const late = 'reviews/demo/G0-intake-20260916-091203-3f2a.md';
  const copy = late.replace('G0-intake-20260916-091203-3f2a', 'G0-intake-20260920-091203-3f2b');
  writeFileSync(join(repo, 'dev', copy), readLF(join(VALID, late)).replace('run_id: 20260916-091203-3f2a', 'run_id: 20260920-091203-3f2b'));
  git({}, 'add', '.');
  git(at('2026-09-19T12:00:00Z'), 'commit', '-q', '-m', 'docs(sdlc): a log whose run_id was typed');
  const found = e034();
  rmSync(repo, { recursive: true, force: true });
  assert.deepEqual(found.map((f) => f.file), [copy]);
  assert.match(found[0].message, /run-id\.mjs/);
});

test('E033 a REQ whose Requirement cell is only a list of AC ids', () => {
  const rules = (cell) => treeErrors(scratchTree(REQUIREMENTS, (s) => s.replace('| REQ-001 | A tester can create a test case |', `| REQ-001 | ${cell} |`))).map((f) => f.rule);
  assert.deepEqual(rules('AC-001, AC-002'), ['E033']);
  assert.deepEqual(rules('AC-001'), ['E033']);
  assert.deepEqual(rules('A tester can create a test case (AC-001)'), [], 'a requirement that cites its criterion is fine');
});

// -----------------------------------------------------------------------------------------------
// One fact, one place (§1.1, §3.2) and size budgets (§3.3) — E090, E091, W090–W093.
// -----------------------------------------------------------------------------------------------

const GLOSSARY = 'requirements/demo/glossary.md';
const rulesOf = (root, rule) => lintTree(root, TEMPLATES).filter((f) => f.rule === rule);

test('W090 a banned synonym from the glossary Not column is reported, outside code only', () => {
  const root = scratchTree(REQUIREMENTS, (s) => s.replace('A tester can create a test case', 'A tester can create a test script'));
  const found = rulesOf(root, 'W090');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].file, REQUIREMENTS);
  assert.match(found[0].message, /test script.*test case/);
  const quoted = scratchTree(REQUIREMENTS, (s) => s.replace('A tester can create a test case', 'A tester can create a test case (`test script` in the old UI)'));
  assert.deepEqual(rulesOf(quoted, 'W090'), []);
});

test('W090 the glossary itself, and a slug with no glossary, are quiet', () => {
  const root = scratchTree(REQUIREMENTS, (s) => s.replace('A tester can create a test case', 'A tester can create a test script'));
  rmSync(join(root, GLOSSARY));
  assert.deepEqual(rulesOf(root, 'W090'), []);
});

test('W091 an id-shaped token with an unregistered prefix is reported; registered and standard names are not', () => {
  const root = scratchTree(REQUIREMENTS, (s) => s.replace('the core action', 'the core action, see XY-12; hashed with SHA-256, dates ISO-8601, OQ-01 and WD-03 tracked'));
  const found = rulesOf(root, 'W091');
  assert.deepEqual(found.map((f) => f.message.match(/`([A-Z]+)-/)[1]), ['XY'], JSON.stringify(found));
});

test('W091 a prefix the profile registers under Id prefixes is accepted', () => {
  const root = scratchTree(REQUIREMENTS, (s) => s.replace('the core action', 'the core action, see XY-12'));
  writeFileSync(join(root, 'DEV-PROFILE.md'), '# p\n\n## Project\n\n- **Id prefixes:** `XY` · `QQ`\n');
  assert.deepEqual(rulesOf(root, 'W091'), []);
});

test('E090 a CR id defined by two runs with different text is an error; the same finding repeated is not', () => {
  const G2 = 'reviews/demo/G2-design-20260917-101422-7c15.md';
  const root = scratchTree(G2, (s) => s.replace('| CR-005 | MINOR |', '| CR-001 | MINOR |'));
  const found = rulesOf(root, 'E090');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /CR-001/);
  assert.equal(found[0].level, 'error');
  assert.deepEqual(rulesOf(scratchTree(G2, (s) => s), 'E090'), []);
});

test('E090 a later run carrying a finding under its id ("Carried, unchanged", "Narrowed") is not a restart', () => {
  // On release-management 279 of 287 E090s were rows like these, restating a finding by its permanent id.
  const G2 = 'reviews/demo/G2-design-20260917-101422-7c15.md';
  for (const lead of ['Carried, unchanged.', 'Narrowed. The ledger half is fixed.', '**Reopened.** The fix did not land.', 'Still open, line numbers moved.']) {
    const root = scratchTree(G2, (s) => s.replace(/\| CR-005 \| MINOR \| ([^|]+) \| [^|]+ \|/, `| CR-001 | MINOR | $1 | ${lead} |`));
    assert.match(readLF(join(root, G2)), /\| CR-001 \| MINOR \|/, 'the mutation reuses CR-001');
    assert.deepEqual(rulesOf(root, 'E090'), [], lead);
  }
  const fresh = scratchTree(G2, (s) => s.replace(/\| CR-005 \| MINOR \| ([^|]+) \| [^|]+ \|/, '| CR-001 | MINOR | $1 | A new problem the reviewer numbered from one again. |'));
  assert.equal(rulesOf(fresh, 'E090').length, 1, 'a new problem under a reused id is still an error');
});

test('W092 an artifact over its word cap, and W093 a table cell over 300 characters', () => {
  const long = Array.from({ length: 1600 }, (_, i) => `word${i}`).join(' ');
  const root = scratchTree(PROBLEM, (s) => s.replace('## Constraints', `## Constraints\n\n${long}\n`));
  const caps = rulesOf(root, 'W092');
  assert.equal(caps.length, 1, JSON.stringify(caps));
  assert.match(caps[0].message, /1,500/);
  const cell = 'x'.repeat(301);
  const wide = scratchTree(REQUIREMENTS, (s) => s.replace('the core action', cell));
  const cells = rulesOf(wide, 'W093');
  assert.equal(cells.length, 1, JSON.stringify(cells));
  assert.match(cells[0].message, /301/);
  const many = scratchTree(REQUIREMENTS, (s) => s.split('\n').map((l) => (/^\|/.test(l) && !/^\|[\s|:-]+\|$/.test(l) ? l.replace(/\| ([^|]+) \|$/, `| ${'y'.repeat(301)} |`) : l)).join('\n'));
  const once = rulesOf(many, 'W093');
  assert.equal(once.length, 1, 'one finding per file, however many rows are long');
  assert.match(once[0].message, /more row/);
  assert.deepEqual(rulesOf(scratchTree(REQUIREMENTS, (s) => s.replace('the core action', 'x'.repeat(300))), 'W093'), []);
});

test('E091 once G7 has a log, every SLO needs an alert file that names it', () => {
  const root = scratchTree('design/demo/architecture.md', (s) => s.replace('## Observability', '## Observability\n\n| SLO | Objective |\n|---|---|\n| SLO-001 | p95 of the list under 300 ms (REQ-101) |\n'));
  assert.match(readLF(join(root, 'design', 'demo', 'architecture.md')), /\| SLO-001 \|/, 'the mutation adds an SLO row');
  assert.deepEqual(rulesOf(root, 'E091'), [], 'before G7, no alert file is required');
  const g7 = 'reviews/demo/G7-implementation-20260919-100000-aaaa.md';
  writeFileSync(join(root, g7), readLF(join(VALID, 'reviews/demo/G6-plan-20260918-104512-0e91.md')).replace('gate: G6', 'gate: G7').replace('stage: plan', 'stage: implementation').replace('run_id: 20260918-104512-0e91', 'run_id: 20260919-100000-aaaa'));
  const missing = rulesOf(root, 'E091');
  assert.equal(missing.length, 1, JSON.stringify(missing));
  assert.match(missing[0].message, /SLO-001/);
  // §11.1: the fixture G7 copies G6's checklist, judged before G7 row 34 existed, so it warns.
  assert.equal(missing[0].level, 'warn', 'a G7 without the ops/alerts row is an older checklist');
  writeFileSync(join(root, g7), readLF(join(root, g7)).replace('|---|---|---|---|\n', '|---|---|---|---|\n| 34 | every SLO-NNN has its ops/alerts rule (E091) | FAIL | none |\n'));
  assert.equal(rulesOf(root, 'E091')[0]?.level, 'error', 'a G7 judged with the row: the rule bites');
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-repo-'));
  cpSync(root, join(repo, 'dev'), { recursive: true });
  mkdirSync(join(repo, 'ops', 'alerts'), { recursive: true });
  writeFileSync(join(repo, 'ops', 'alerts', 'demo.yml'), 'groups:\n  - name: demo\n    rules:\n      - alert: ListLatencyBudgetBurn\n        labels: { slo: SLO-001 }\n');
  assert.deepEqual(rulesOf(join(repo, 'dev'), 'E091'), []);
});

// -----------------------------------------------------------------------------------------------
// Where it runs, decided before it is designed (§18.7) and assumptions capped (§15.2) — E041–E044.
// -----------------------------------------------------------------------------------------------

const ARCH = 'design/demo/architecture.md';
const edit = (root, rel, mutate) => writeFileSync(join(root, rel), mutate(readLF(join(root, rel))));

test('E041 a Deploy target that leaves a line out, or names a host with no DEC and no `unchanged`, fails', () => {
  assert.deepEqual(rulesOf(VALID, 'E041'), [], 'the valid corpus names all five lines');
  const empty = rulesOf(scratchTree(ARCH, (s) => s.replace('Who deploys: the release owner', 'Who deploys: TBD')), 'E041');
  assert.equal(empty.length, 1, JSON.stringify(empty));
  assert.match(empty[0].message, /`Who deploys:` is empty/);
  const missing = rulesOf(scratchTree(ARCH, (s) => s.replace(/^Pipeline:.*\n/m, '')), 'E041');
  assert.match(missing[0]?.message ?? '', /no `Pipeline:` line/);
  const chosen = rulesOf(scratchTree(ARCH, (s) => s.replace('Shape: unchanged — the existing modular monolith', 'Shape: modular monolith')), 'E041');
  assert.match(chosen[0]?.message ?? '', /`Shape:` cites no DEC-NNN/);
  assert.deepEqual(rulesOf(scratchTree(ARCH, (s) => s.replace('Shape: unchanged — the existing modular monolith', 'Shape: modular monolith (DEC-002)')), 'E041'), []);
});

test('E042 an initiative plan with no Walking skeleton task fails; a change does not need one', () => {
  assert.deepEqual(rulesOf(VALID, 'E042'), [], 'the demo slug is a change');
  const root = scratchTree('intake/demo/problem.md', (s) => s.replace('change_class: change', 'change_class: initiative'));
  const found = rulesOf(root, 'E042');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].file, 'plan/demo/tasks.md');
  edit(root, 'plan/demo/tasks.md', (s) => s.replace('| TASK-001 |', '| TASK-009 | Walking skeleton: pipeline to staging, empty app deployed | REQ-001 | ops | .gitlab-ci.yml | none | pipeline green | S | todo |\n| TASK-001 |'));
  assert.deepEqual(rulesOf(root, 'E042'), []);
});

test('E043 a G2 PASS while the Host or Shape DEC is not answered fails', () => {
  const root = scratchTree(ARCH, (s) => s.replace('Host: unchanged — the existing service, see docs/codebase-map.md', 'Host: one VM running docker compose (DEC-001)'));
  const found = rulesOf(root, 'E043');
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /DEC-001, which is `open`/);
  edit(root, 'decisions/demo.md', (s) => s.replace('| TASK-003 | open | — |', '| TASK-003 | answered | a VM — who: Owner, 2026-09-17 |'));
  assert.deepEqual(rulesOf(root, 'E043'), []);
});

test('E044 more than five assumed decisions once a gate past G2 has a log fails; five pass', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => `| DEC-01${i} | Q${i}? | why | a · b | a | none | assumed | proceed on a — who: Owner, 2026-09-17 |`).join('\n');
  const withRows = (n) => scratchTree('decisions/demo.md', (s) => s.replace('| none | answered | 20 |\n', `| none | answered | 20 |\n${rows(n)}\n`));
  const six = rulesOf(withRows(6), 'E044');
  assert.equal(six.length, 1, JSON.stringify(six));
  assert.match(six[0].message, /6 decisions are `assumed`/);
  assert.deepEqual(rulesOf(withRows(5), 'E044'), []);
  const early = withRows(6);
  for (const f of readdirSync(join(early, 'reviews', 'demo')).filter((n) => !/^G[012]-/.test(n))) rmSync(join(early, 'reviews', 'demo', f));
  assert.deepEqual(rulesOf(early, 'E044'), [], 'up to G2 the ledger is still being asked');
});

// -----------------------------------------------------------------------------------------------
// Rounds end (§4.3) — E045 a third round with no human decision; E046, E047 attempt 2 reads the delta.
// -----------------------------------------------------------------------------------------------

const ATTEMPT2_LOG = 'reviews/demo/G1-requirements-20260916-141855-b09e-a2.md';
const attempt2 = (cls, sev, verdict = 'PASS') => (s) => s
  .replace('| Id | Severity | Location |', '| Id | Severity | Class | Location |')
  .replace('|---|---|---|---|---|---|---|\n| CR-004 | INFO |', `|---|---|---|---|---|---|---|---|\n| CR-004 | ${sev} | ${cls} |`)
  .replace('verdict: PASS', `verdict: ${verdict}`);

test('E046 a finding new at attempt 2 is a follow-up unless it is a BLOCKER', () => {
  assert.equal(rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('defect', 'MAJOR')), 'E046').length, 1);
  assert.deepEqual(rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('follow-up', 'MAJOR')), 'E046'), []);
  assert.deepEqual(rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('defect', 'BLOCKER')), 'E046'), [], 'a BLOCKER on security or data loss still holds the round');
  assert.deepEqual(rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('follow-up', 'MAJOR')), 'E009'), [], '`follow-up` is in the vocabulary');
});

test('E047 attempt 2 with every attempt-1 finding closed and only follow-ups open is a PASS', () => {
  const held = rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('follow-up', 'MAJOR', 'CHANGES_REQUESTED')), 'E047');
  assert.equal(held.length, 1, JSON.stringify(held));
  assert.deepEqual(rulesOf(scratchTree(ATTEMPT2_LOG, attempt2('defect', 'BLOCKER', 'CHANGES_REQUESTED')), 'E047'), [], 'a new BLOCKER may hold it');
  const reopened = scratchTree(ATTEMPT2_LOG, (s) => attempt2('follow-up', 'MAJOR', 'CHANGES_REQUESTED')(s).replace('| RESOLVED | requirements.md:§Functional', '| REOPENED | requirements.md:§Functional'));
  assert.deepEqual(rulesOf(reopened, 'E047'), [], 'an attempt-1 finding reopened may hold it');
});

test('E045 a third full review since the last PASS needs an answered round_decision; reaffirms do not count', () => {
  const G6 = 'reviews/demo/G6-plan-20260918-104512-0e91.md';
  const root = scratchTree(G6, (s) => s);
  const base = readLF(join(root, G6));
  const write = (run, extra = '', verdict = 'CHANGES_REQUESTED') => writeFileSync(join(root, `reviews/demo/G6-plan-${run}.md`),
    base.replace('run_id: 20260918-104512-0e91', `run_id: ${run}`).replace(/^verdict: .*$/m, `verdict: ${verdict}`).replace('revalidated_from: null', `revalidated_from: null${extra}`));
  write('20260919-100000-aaa1');
  write('20260919-110000-aaa2');
  assert.deepEqual(rulesOf(root, 'E045'), [], 'two rounds are allowed');
  write('20260919-115000-aaa9');
  const third = rulesOf(root, 'E045');
  assert.equal(third.length, 1, JSON.stringify(third));
  assert.match(third[0].message, /round 3 of G6/);
  write('20260919-115000-aaa9', '\nround_decision: DEC-001');
  assert.match(rulesOf(root, 'E045')[0]?.message ?? '', /DEC-001, which is not answered/);
  write('20260919-115000-aaa9', '\nround_decision: DEC-002');
  assert.deepEqual(rulesOf(root, 'E045'), [], 'DEC-002 is answered');
  write('20260919-120000-aab0', '', 'PASS');
  write('20260919-130000-aab1');
  assert.deepEqual(rulesOf(root, 'E045').filter((f) => /aab1/.test(f.file)), [], 'a PASS starts the count again');
});

test('initiative-lite is no longer a class: fast replaced it', () => {
  const root = scratchTree('intake/demo/problem.md', (s) => s.replace('change_class: change', 'change_class: initiative-lite'));
  assert.equal(rulesOf(root, 'E009').filter((f) => /change_class/.test(f.message)).length, 1);
});
