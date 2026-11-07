/**
 * Sizing before acting, and the levers that keep a run from re-reading what it does not need
 * (DEV-CONTRACTS §15.3), plus the learning ladder (§19.6). Every check here has a mutant in
 * `node tests/mutate.mjs levers`.
 *
 *   node --test tests/token-levers.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SCRIPTS = join(ROOT, 'workspace', 'dev', 'scripts');
const imp = (f) => import(pathToFileURL(join(SCRIPTS, f)).href);
const size = await imp('size.mjs');
const { brief } = await imp('review-brief.mjs');
const { upsert } = await imp('trace-upsert.mjs');
const { nextId } = await imp('run-id.mjs');
const learn = await imp('learn.mjs');
const bench = await imp('bench.mjs');
process.env.SDLC_RUN_LOG = 'off';
process.env.ACTIVITY_LOG = 'off';
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

function project(files) {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-levers-')), '.sdlc');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const run = (script, args, env = {}) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const LOG = (slug, gate, run, verdict = 'PASS', findings = []) => [`reviews/${slug}/${gate}-x-${run}.md`, ['---', `slug: ${slug}`, `gate: ${gate}`, `run_id: ${run}`, 'attempt: 1', `verdict: ${verdict}`, '---', '', '## Findings', '', '| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |', '|---|---|---|---|---|---|---|---|', ...findings.map(([id, p]) => `| ${id} | MAJOR | defect | x | ${p} | e | c | o |`), ''].join('\n')];

// ---- sizing ---------------------------------------------------------------------------------------

test('estimate: the class picks the fewest gates, and every skip says why', () => {
  const fix = size.plan('fix');
  assert.deepEqual(fix.gates, ['G7', 'G8', 'G9']);
  assert.equal(fix.skipped.length, 10);
  assert.ok(fix.skipped.every((s) => s.why.length > 10));
  const change = size.plan('change', ['G4']);
  assert.deepEqual(change.gates, ['G1', 'G4', 'G6', 'G7', 'G8', 'G9']);
  assert.match(change.skipped.find((s) => s.gate === 'G3').why, /not touched/);
  const init = size.plan('initiative');
  assert.equal(init.gates.length, 13);
  assert.ok(fix.tokens < change.tokens && change.tokens < init.tokens, 'cost scales with the class');
  assert.ok(fix.max_spawns < init.max_spawns);
  assert.deepEqual(size.plan('refactor').gates, fix.gates, 'a refactor runs the gates of a fix');
  const spike = size.plan('spike');
  assert.deepEqual(spike.gates, ['G0', 'G2'], 'a spike ships an answer, never code');
  assert.ok(!spike.gates.includes('G9'), 'nothing a spike builds reaches release');
  const fast = size.plan('fast');
  assert.deepEqual(fast.gates, ['G0', 'G1', 'G7', 'G8', 'G9', 'G10'], 'fast decides once, builds, then deploys');
  assert.ok(fast.tokens < init.tokens, 'fast costs less than an initiative');
  assert.deepEqual(size.plan('fast', ['G2']).gates, ['G0', 'G1', 'G2', 'G7', 'G8', 'G9', 'G10'], 'a slice that escalates brings G2 back');
  assert.match(fast.skipped.find((s) => s.gate === 'G3').why, /escalat/);
  assert.match(fast.skipped.find((s) => s.gate === 'G6').why, /class fast/);
  assert.throws(() => size.plan('epic'));
});

test('estimate over the profile budget stops with exit 3 until a human approves', () => {
  const root = project({ 'intake/a/problem.md': '---\nchange_class: initiative\n---\n' });
  const over = run('size.mjs', ['estimate', 'a', '--root', root], { SDLC_BUDGET_TOKENS: '1000' });
  assert.equal(over.status, 3, over.stdout);
  assert.match(over.stdout, /OVER BUDGET/);
  assert.equal(run('size.mjs', ['estimate', 'a', '--root', root, '--approved-by', 'Luan'], { SDLC_BUDGET_TOKENS: '1000' }).status, 0);
  const fresh = project({ 'intake/b/problem.md': '---\nchange_class: fix\n---\n' });
  assert.equal(run('size.mjs', ['estimate', 'b', '--root', fresh], { SDLC_BUDGET_TOKENS: '99000000' }).status, 0, 'inside the budget runs');
});

test('check: over 50 % on tokens, or over the spawn budget, fails unless a reason is recorded', () => {
  const root = project({ 'intake/a/problem.md': '---\nchange_class: fix\n---\n' });
  assert.equal(run('size.mjs', ['estimate', 'a', '--root', root], { SDLC_BUDGET_TOKENS: '' }).status, 0);
  const est = size.load(root, 'a').tokens;
  run('size.mjs', ['actual', 'a', '--gate', 'G7', '--tokens', String(Math.round(est * 1.4)), '--root', root]);
  assert.equal(run('size.mjs', ['check', 'a', '--root', root]).status, 0, '40 % over is inside the band');
  run('size.mjs', ['actual', 'a', '--gate', 'G7', '--tokens', String(Math.round(est * 1.6)), '--root', root]);
  const r = run('size.mjs', ['check', 'a', '--root', root]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /% over the estimate/);
  run('size.mjs', ['reason', 'a', '--cost', 'the schema needed a backfill nobody knew about', '--root', root]);
  assert.equal(run('size.mjs', ['check', 'a', '--root', root]).status, 0, 'a recorded reason clears it');

  const spawny = project({ 'intake/s/problem.md': '---\nchange_class: fix\n---\n' });
  run('size.mjs', ['estimate', 's', '--root', spawny], { SDLC_BUDGET_TOKENS: '' });
  const max = size.load(spawny, 's').max_spawns;
  for (let i = 0; i <= max / 2; i++) {
    const [rel, text] = LOG('s', 'G7', `20261001-1000${String(i).padStart(2, '0')}-aaaa`);
    mkdirSync(dirname(join(spawny, rel)), { recursive: true });
    writeFileSync(join(spawny, rel), text);
  }
  const [skipRel, skipText] = LOG('s', 'G2', '20261001-090000-aaaa', 'SKIPPED');
  writeFileSync(join(spawny, skipRel), skipText);
  assert.ok(size.spawns(spawny, 's') > max, 'two per reviewed log; a SKIPPED log spawned nobody');
  assert.equal(size.spawns(spawny, 's'), (Math.floor(max / 2) + 1) * 2);
  assert.match(size.judge(spawny, 's')[0], /spawns, budget/);
  assert.match(size.judge(project({}), 'none')[0], /no estimate/);
});

// ---- lever 5: the reviewer brief and the model per gate -------------------------------------------

test('model: heavy gates and every initiative gate keep opus; light gates on a change or fix use sonnet', () => {
  assert.equal(size.reviewerModel('G7', 'fix'), 'opus');
  assert.equal(size.reviewerModel('G2', 'change'), 'opus');
  assert.equal(size.reviewerModel('G9', 'fix'), 'sonnet');
  assert.equal(size.reviewerModel('G1', 'change'), 'sonnet');
  assert.equal(size.reviewerModel('G1', 'initiative'), 'opus');
});

test('review brief: names what changed since the last log, the failed rows, lint, and the model', () => {
  const root = project({
    'intake/a/problem.md': '---\nchange_class: change\n---\n',
    'requirements/a/requirements.md': '---\nartifact: requirements\n---\n\n## Scope\n\nx\n',
    'requirements/a/glossary.md': '---\nartifact: glossary\n---\n',
    'reviews/a/G1-requirements-20261001-100000-aaaa.md': '---\ngate: G1\nverdict: CHANGES_REQUESTED\noutputs:\n  - path: requirements/a/glossary.md\n    sha256: 0000\n---\n\n## Checklist\n\n| # | Check | Result | Evidence |\n|---|---|---|---|\n| 1 | a | PASS | e |\n| 2 | b | FAIL | e |\n',
  });
  const b = brief(root, 'a', 'G1');
  assert.equal(b.model, 'sonnet');
  assert.deepEqual(b.open, ['requirements/a/glossary.md', 'requirements/a/requirements.md']);
  assert.deepEqual(b.changed, ['requirements/a/glossary.md', 'requirements/a/requirements.md'], 'a hash that differs, and a file the log never judged');
  assert.deepEqual(b.prior_not_passed, ['2: FAIL']);
  assert.match(b.contracts, /contracts\.mjs 4\.5 5 10/);
  assert.ok(b.lint.some((l) => l.startsWith('requirements/a/')), 'lint findings on the stage files');
  assert.deepEqual(brief(project({}), 'z', 'G9').changed, [], 'nothing written, nothing to open');
});

// ---- lever 4: no agent or command asks for the whole contract --------------------------------------

test('no agent, command or protocol file hands over DEV-CONTRACTS.md whole', () => {
  const files = ['agents/dev-implementer.md', 'agents/dev-gate-reviewer.md', 'commands/sdlc-implement.md', 'commands/sdlc-gate.md', 'commands/sdlc-onboard.md', 'skills/dev-stage-protocol/SKILL.md'];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /`DEV-PROFILE\.md`, `DEV-CONTRACTS\.md`/, `${f} passes the whole contract as a path`);
    assert.doesNotMatch(text, /contracts\.mjs --all/, `${f} prints the whole contract`);
    assert.doesNotMatch(text, /^>?\s*Read `DEV-CONTRACTS\.md`\s*$/m, `${f} reads the contract whole`);
  }
  assert.match(read('agents/dev-implementer.md'), /Do not read the whole file/);
  assert.match(read('agents/dev-gate-reviewer.md'), /review-brief\.mjs/);
  assert.match(read('skills/dev-stage-protocol/SKILL.md'), /review-brief\.mjs \$1 G<N>/);
  assert.match(read('commands/sdlc-intake.md'), /size\.mjs\s+estimate \$1/);
});

// ---- lever 6: ids and traceability without reading the file ----------------------------------------

test('run-id --next: the next REQ, AC or TASK id above the highest defined, claimed once', () => {
  const root = project({ 'plan/a/tasks.md': '| TASK-001 | x |\n| TASK-007 | y |\nsee `TASK-099`\n' });
  assert.deepEqual(nextId(root, 'a', 'TASK'), ['TASK-008'], 'quoted ids are not definitions');
  assert.deepEqual(nextId(root, 'a', 'TASK'), ['TASK-009'], 'a claimed id is not handed out twice');
  assert.deepEqual(nextId(root, 'a', 'REQ', { count: 2 }), ['REQ-001', 'REQ-002']);
  assert.equal(run('run-id.mjs', ['--next', 'ADR', 'a', '--root', root]).status, 2);
});

test('trace-upsert: one cell of one row changes, a new REQ is appended, the rest is untouched', () => {
  const doc = '## Traceability\n\n| REQ | Acceptance criteria | Tasks | Tests | Status |\n|---|---|---|---|---|\n| REQ-001 | AC-001 | — | — | draft |\n| REQ-002 | AC-002 | — | — | draft |\n\n## Preflight\n\nx\n';
  const once = upsert(doc, 'REQ-002', { 2: 'TASK-004', 4: 'implemented' });
  assert.match(once, /\| REQ-002 \| AC-002 \| TASK-004 \| — \| implemented \|/);
  assert.match(once, /\| REQ-001 \| AC-001 \| — \| — \| draft \|/);
  assert.equal(once.replace(/\| REQ-002[^\n]*/, ''), doc.replace(/\| REQ-002[^\n]*/, ''), 'only that row changed');
  const added = upsert(doc, 'REQ-003', { 2: 'TASK-009' });
  assert.match(added, /\| REQ-002 [^\n]*\n\| REQ-003 \| — \| TASK-009 \| — \| — \|\n\n## Preflight/);
  assert.equal(upsert('## Scope\n', 'REQ-001', { 2: 'x' }), null);
});

// ---- the ladder and the bench fields ---------------------------------------------------------------

const LESSON = ['---', 'id: LRN-CURSOR', 'title: Every list endpoint is cursor-paginated', 'status: active', 'confidence: established', 'applies_to: [g4, api]', 'evidence: [reviews/old/G4-x-20260901-100000-aaaa.md]', 'probe: Does this list need a cursor?', 'created: 2026-09-15', 'updated: 2026-09-15', '---', '', '- **Do:** give every list endpoint a cursor.', ''].join('\n');
const REPEAT = 'List endpoint returns every row with no cursor pagination';

test('ladder: a finding after the lesson that says the same is a repeat; two propose a check', () => {
  const one = project(Object.fromEntries([['learnings/LRN-CURSOR.md', LESSON], LOG('a', 'G4', '20261001-100000-aaaa', 'CHANGES_REQUESTED', [['CR-001', REPEAT]])]));
  assert.equal(learn.ladder(learn.loadLessons(one), learn.readLogs(one))[0].repeats.length, 1);
  assert.ok(!learn.harvest(one).some((s) => s.signal === 'promote to check'), 'one repeat is not yet a pattern');
  const two = project(Object.fromEntries([
    // The lesson cites the repeats themselves: a ladder signal must still not read as covered.
    ['learnings/LRN-CURSOR.md', LESSON.replace(/^evidence: .*$/m, 'evidence: [reviews/a/G4-x-20261001-100000-aaaa.md, reviews/b/G4-x-20261002-100000-aaaa.md]')],
    LOG('a', 'G4', '20261001-100000-aaaa', 'CHANGES_REQUESTED', [['CR-001', REPEAT]]),
    LOG('b', 'G4', '20261002-100000-aaaa', 'CHANGES_REQUESTED', [['CR-002', REPEAT]]),
    LOG('c', 'G4', '20260910-100000-aaaa', 'CHANGES_REQUESTED', [['CR-003', REPEAT]]),
    LOG('d', 'G2', '20261003-100000-aaaa', 'CHANGES_REQUESTED', [['CR-004', REPEAT]]),
  ]));
  const r = learn.ladder(learn.loadLessons(two), learn.readLogs(two))[0];
  assert.deepEqual(r.repeats.map((x) => x.slug), ['a', 'b'], 'before the lesson, or at another gate, is not a repeat');
  const promote = learn.harvest(two).find((s) => s.signal === 'promote to check');
  assert.equal(promote.lesson, 'LRN-CURSOR');
  assert.equal(promote.covered, false, 'a ladder signal is never covered by its own lesson');
  assert.match(promote.subject, /lint rule, hook or CI script, not another checklist row/);
});

test('ladder: a lesson that matched nothing in five initiatives is proposed for retirement', () => {
  const quiet = (n) => project(Object.fromEntries([['learnings/LRN-CURSOR.md', LESSON], ...Array.from({ length: n }, (_, i) => LOG(`s${i}`, 'G4', `2026100${i}-100000-aaaa`, 'PASS', [['CR-001', 'The error body lacks a type URI']]))]));
  assert.ok(!learn.harvest(quiet(4)).some((s) => s.signal === 'retire'));
  const r = learn.harvest(quiet(5)).find((s) => s.signal === 'retire');
  assert.match(r.subject, /LRN-CURSOR has matched nothing in 5 initiatives/);
});

test('bench: version, condition, repeat_errors, lessons_active, tokens and duration_s; compare gates repeats', () => {
  const root = project(Object.fromEntries([
    ['learnings/LRN-CURSOR.md', LESSON],
    ['intake/a/problem.md', '---\nchange_class: fix\n---\n'],
    LOG('a', 'G4', '20261001-100000-aaaa', 'CHANGES_REQUESTED', [['CR-001', REPEAT]]),
  ]));
  writeFileSync(join(dirname(root), 'VERSION'), '9.9.9\n');
  run('size.mjs', ['estimate', 'a', '--root', root], { SDLC_BUDGET_TOKENS: '' });
  run('size.mjs', ['actual', 'a', '--gate', 'G7', '--tokens', '5000', '--seconds', '60', '--root', root]);
  const s = bench.score(root, { task: 't1' });
  assert.equal(s.version, '9.9.9');
  assert.equal(s.task_id, 't1');
  assert.equal(s.bundle, 'sdlc');
  assert.equal(s.condition, 'lessons');
  assert.equal(s.lessons_active, 1);
  assert.equal(s.repeat_errors, 1);
  assert.equal(s.tokens.implementation, 5000);
  assert.equal(s.duration_s.implementation, 60);
  assert.equal(s.tokens.design, null, 'unknown is null, never zero');
  assert.equal(s.cost[0].actual, 5000);
  assert.equal(bench.score(project({}), { condition: 'no-lessons' }).condition, 'no-lessons');
  const base = { first_pass: { of: 0, ci95: [0, 1] }, rework: 0, reopened: 0, repeated: { total: 0, uncovered: 0 }, unverified: 0, lessons: { active: 1, established: 1 } };
  assert.match(bench.compare({ ...base, repeat_errors: 1 }, { ...base, repeat_errors: 3 }).worse[0], /repeat a lesson/);
  assert.deepEqual(bench.compare({ ...base, repeat_errors: 3 }, { ...base, repeat_errors: 1 }).worse, []);
  assert.deepEqual(bench.compare(base, { ...base, repeat_errors: 3 }).worse, [], 'an old baseline without the field gates nothing');
});
