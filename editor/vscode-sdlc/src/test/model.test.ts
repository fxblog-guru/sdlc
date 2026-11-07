/**
 * Tests for the only logic this extension owns: loading and classifying. They run against the same
 * fixture that `build-state.mjs` must reproduce, so a drift between builder and viewer fails here
 * rather than in someone's board at the wrong moment.
 *
 * Run with: npm run compile && npm test
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { State, SUPPORTED_SCHEMA, blockingFindingCount, doneWhen, findProjectRoots, knowledgeSummary, loadState, openFindingCount, phaseOf, findProjectRootsAny, resolveStatePath, shortTitle, stateCandidates, taskCounts } from '../model';
import { actions, buildViewModel, nextStep, recent, requirementList, upNext } from '../viewmodel';

const FIXTURE = path.resolve(
  __dirname,
  '../../../../tests/fixtures/state.sample.json',
);

function loadSample(): State {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as State;
}

function workspaceWith(stateJson: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-test-'));
  fs.mkdirSync(path.join(root, 'dev'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'state.json'), JSON.stringify(stateJson, null, 2));
  return root;
}

test('loads the golden fixture, and it carries every field the board reads', () => {
  // The fixture is GENERATED from the corpus by tests/regen-sample.mjs, so this asserts against the
  // shape build-state.mjs really emits. The previous hand-written version had drifted three fields
  // behind the builder while every test here stayed green — which is the failure mode that matters,
  // because the board would have rendered blanks for fields the builder had been emitting for weeks.
  const root = workspaceWith(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.schema, SUPPORTED_SCHEMA);
  assert.equal(result.state.initiatives.length, 1);

  const [i] = result.state.initiatives;
  assert.equal(i.slug, 'demo');
  assert.equal(i.change_class, 'change');
  assert.equal(i.stages.length, 12);
  assert.ok(Array.isArray(i.decisions) && i.decisions.length > 0, 'decisions reach the board');
});

test('a missing index reports why, and does not throw', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-empty-'));
  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /No state index/);
});

test('an unknown schema is refused rather than guessed at', () => {
  const root = workspaceWith({ schema: 99, initiatives: [] });
  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Unsupported state schema 99/);
});

test('malformed JSON is reported, not swallowed into an empty board', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-bad-'));
  fs.mkdirSync(path.join(root, 'dev'));
  fs.writeFileSync(path.join(root, 'dev', 'state.json'), '{ not json');
  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /not valid JSON/);
});

test('phase is derived from the current gate — backlog lives at initiative level', () => {
  const at = (gate: string) =>
    phaseOf({
      slug: 's', tracker: 'none', title: 't', current_gate: gate, blocked: false,
      stages: [], requirements: [], tasks: [],
    });
  assert.equal(at('G0'), 'Backlog');
  assert.equal(at('G1'), 'Backlog');
  assert.equal(at('G2'), 'Design');
  assert.equal(at('G6'), 'Design');
  assert.equal(at('G7'), 'Build');
  assert.equal(at('G8'), 'Build');
  assert.equal(at('G9'), 'Ship');
  assert.equal(at('G10'), 'Ship');
  assert.equal(at('G11'), 'Live');
});

test('finding counts add up across stages', () => {
  const root = workspaceWith(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));
  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const demo = result.state.initiatives.find((i) => i.slug === 'demo');
  assert.ok(demo);

  // Five findings are open across the corpus and none of them blocks: every BLOCKER and MAJOR was
  // resolved in a second round, and what remains is MINOR and INFO carried forward. The two counts
  // differing is the point — a board that showed one number could not tell "five things noted" from
  // "five things stopping this".
  assert.equal(openFindingCount(demo), 5);
  assert.equal(blockingFindingCount(demo), 0);
});

test('blocking findings are counted from the latest log, and only from severities that block', () => {
  // Synthetic on purpose: the corpus deliberately converges, so it has no unresolved BLOCKER to
  // count. Building the case here keeps the corpus honest and still exercises the arithmetic.
  const initiative = {
    slug: 's', tracker: 'none', title: 't', current_gate: 'G2', blocked: true,
    requirements: [], tasks: [],
    stages: [
      { gate: 'G0', findings: { blocker: 0, major: 0, minor: 2, info: 1 }, open_findings: ['CR-001', 'CR-002'] },
      { gate: 'G1', findings: { blocker: 1, major: 2, minor: 0, info: 0 }, open_findings: ['CR-003'] },
    ],
  } as never;
  assert.equal(openFindingCount(initiative), 3);
  assert.equal(blockingFindingCount(initiative), 3, 'blocker + major only — minor and info do not block');
});

test('files newer than the index are reported as possibly stale', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const root = workspaceWith(fixture);
  const artifact = path.join(root, 'dev', 'intake', 'demo', 'problem.md');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, '# edited after the index was built\n');

  const result = loadState(root, 'dev/state.json');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.staleFiles.includes('dev/intake/demo/problem.md'));
});

// -------------------------------------------------------------------------------------------
// GK on the board.
//
// The extension parsed `knowledge` into the model and then rendered it nowhere, so `status.mjs`
// and the extension disagreed about which gates exist — and the one they disagreed about is what
// every brownfield gate downstream rests on. These pin the summary all three renderings now share.
// -------------------------------------------------------------------------------------------

test('GK is summarised, not dropped', () => {
  const state = loadSample();
  const summary = knowledgeSummary(state);
  assert.ok(summary, 'the sample index carries a knowledge gate and the board must show it');
  assert.match(summary.label, /^GK\b/);
  assert.match(summary.detail, new RegExp(state.knowledge!.state));
});

test('GK with cards reads as a count; GK with none reads as a prompt', () => {
  const withCards = knowledgeSummary({
    ...loadSample(),
    knowledge: { ...loadSample().knowledge!, state: 'PASS', cards: [{ path: 'a', sha256: 'x', grounded_at: null }] },
  })!;
  assert.match(withCards.detail, /1 card/);
  assert.equal(withCards.severity, 'info');

  const empty = knowledgeSummary({
    ...loadSample(),
    knowledge: { ...loadSample().knowledge!, state: 'NOT_STARTED', cards: [] },
  })!;
  assert.match(empty.detail, /no cards/, 'an empty knowledge gate must say what to run');
  assert.match(empty.detail, /sdlc-onboard/);
  // A fresh greenfield install lands here, so it is a prompt rather than a failure — but it must
  // still be visible, because a brownfield repo landing here is a real problem.
  assert.equal(empty.severity, 'warning');
});

test('an index with no knowledge gate at all is not invented', () => {
  const sample = loadSample();
  delete (sample as Partial<State>).knowledge;
  assert.equal(knowledgeSummary(sample), undefined, 'a missing GK must render as absent, not as NOT_STARTED');
});

test('a workspace that is a parent of projects finds the index below it, and resolves paths there', () => {
  // agentic-fx is opened as one folder holding release-management/, todo-app/ and so on. The index
  // lives one level down, and every path inside it is relative to that project, not the workspace.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-parent-'));
  const write = (dir: string, project: string, mtime: number): void => {
    fs.mkdirSync(path.join(dir, 'dev'), { recursive: true });
    const file = path.join(dir, 'dev', 'state.json');
    fs.writeFileSync(file, JSON.stringify({ ...loadSample(), project }));
    fs.utimesSync(file, mtime, mtime);
  };
  const now = Date.now() / 1000;
  write(path.join(parent, 'older'), 'older', now - 3600);
  write(path.join(parent, 'newer'), 'newer', now - 60);
  // An agent worktree copy, newest of all, must never win over the project of record.
  write(path.join(parent, '.claude', 'worktrees', 'agent-x'), 'worktree', now);

  const result = loadState(parent, 'dev/state.json');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.project, 'newer');
  assert.equal(result.projectRoot, path.join(parent, 'newer'));
});

test('task counts follow the four statuses and nothing else', () => {
  const sample = loadSample();
  const [i] = sample.initiatives;
  const counts = taskCounts(i);
  assert.equal(counts.total, i.tasks.length);
  assert.equal(counts.done + counts['in-progress'] + counts.todo + counts.blocked, counts.total);
  assert.equal(counts.done, 2);
  assert.equal(counts['in-progress'], 1);
  assert.equal(counts.todo, 1);
});

test('a task title is cut at its first sentence for lists, and keeps its acceptance clause for detail', () => {
  const title =
    'Skeleton: Go module, server CLI, configuration, redacting logger. Step 0 is not code. Done when go build ./... passes, and the redaction test passes';
  assert.equal(shortTitle(title), 'Skeleton: Go module, server CLI, configuration, redacting logger.');
  assert.equal(doneWhen(title), 'go build ./... passes, and the redaction test passes');
  assert.equal(shortTitle('Migration: create testcases'), 'Migration: create testcases');
  assert.equal(doneWhen('Migration: create testcases'), undefined);
  // A version number is not a sentence end.
  assert.equal(shortTitle('Bump to v1.2 and rebuild. Then ship.'), 'Bump to v1.2 and rebuild.');
});

test('the view model carries counts, short titles, requirement text and one next step', () => {
  const root = workspaceWith(loadSample());
  const vm = buildViewModel(loadState(root, 'dev/state.json'));
  assert.equal(vm.ok, true);
  if (!vm.ok) return;
  const [i] = vm.initiatives;
  assert.equal(i.counts.total, 4);
  assert.equal(i.gates.length, 12);
  assert.equal(i.gates[2].label, 'stale');
  assert.ok(i.tasks[0].requirements[0].title, 'a task requirement carries the requirement text');
  // G2 is stale in the fixture, so the next step names the reaffirm command for it.
  assert.match(i.next, /stale/);
  assert.match(i.next, /\/sdlc-gate demo G2 --reaffirm/);
});

test('the next step names a blocked gate before anything else', () => {
  const sample = loadSample();
  const [i] = sample.initiatives;
  i.stages[3].state = 'BLOCKED';
  i.stages[3].blocked_reason = 'the data model is missing';
  assert.equal(nextStep(i), 'Blocked at G3 data: the data model is missing.');
});

test('suggested actions name the stale gates, the gate being worked on and the open findings, in that order of urgency', () => {
  const [i] = loadSample().initiatives;
  const kinds = actions(i).map((a) => a.kind);
  assert.ok(kinds.includes('stale'), `expected a stale action, got ${kinds.join(', ')}`);
  const stale = actions(i).find((a) => a.kind === 'stale');
  assert.ok(stale);
  assert.equal(stale.command, '/sdlc-gate demo G2 --reaffirm');
  assert.ok(kinds.indexOf('stale') < kinds.indexOf('findings'), 'stale comes before carried findings');
});

test('a blocked gate is the first action, and a blocking decision comes before stale gates', () => {
  const [i] = loadSample().initiatives;
  i.stages[3].state = 'BLOCKED';
  i.stages[3].blocked_reason = 'the data model is missing';
  i.decisions = [{ id: 'DEC-009', question: 'Which database?', status: 'open', blocks: ['G3'], blocking: true }];
  const kinds = actions(i).map((a) => a.kind);
  assert.equal(kinds[0], 'blocked');
  assert.ok(kinds.indexOf('decision') < kinds.indexOf('stale'));
  assert.equal(actions(i)[0].title, 'Unblock G3 data');
});

test('up next lists in-progress tasks first, then the next todo tasks in plan order, then blocked ones', () => {
  const [i] = loadSample().initiatives;
  i.tasks.push({ id: 'TASK-099', title: 'Later', status: 'blocked', files: [], requirements: [], tests: [], blocked_by: 'TASK-003' });
  const next = upNext(i);
  assert.deepEqual(
    next.map((t) => t.status),
    ['in-progress', 'todo', 'blocked'],
  );
  assert.equal(next[2].blockedBy, 'TASK-003');
});

test('recent activity is newest first and only lists gates that have run', () => {
  const [i] = loadSample().initiatives;
  const r = recent(i);
  assert.ok(r.length > 0);
  for (let k = 1; k < r.length; k++) assert.ok(Date.parse(r[k - 1].updatedAt) >= Date.parse(r[k].updatedAt));
  assert.ok(r.every((x) => x.updatedAt));
});

test('each requirement carries its tasks and the fraction of them done', () => {
  const [i] = loadSample().initiatives;
  const reqs = requirementList(i);
  assert.equal(reqs.length, i.requirements.length);
  const withTasks = reqs.find((r) => r.total > 0);
  assert.ok(withTasks, 'the fixture links at least one requirement to a task');
  assert.ok(withTasks.done <= withTasks.total);
  assert.ok(withTasks.tasks.every((t) => i.tasks.some((x) => x.id === t.id)));
});

test('a requirement priority is only shown when it is a priority label', () => {
  const [i] = loadSample().initiatives;
  i.requirements[0].priority = 'P0';
  i.requirements.push({ id: 'REQ-900', title: 'Odd row', priority: '0 WCAG 2.2 AA failures', tasks: [], covered: false });
  const reqs = requirementList(i);
  assert.equal(reqs[0].priority, 'P0');
  assert.equal(reqs[reqs.length - 1].priority, null);
});

test('resolveStatePath follows the bundle resolver: setting, then .sdlc/, then dev/, then .sdlc', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-statepath-'));
  assert.equal(resolveStatePath(root, ''), '.sdlc/state.json', 'nothing there: the new default');
  fs.mkdirSync(path.join(root, 'dev'));
  assert.equal(resolveStatePath(root, undefined), 'dev/state.json', 'an existing dev/ project keeps working');
  fs.mkdirSync(path.join(root, '.sdlc'));
  assert.equal(resolveStatePath(root, ''), '.sdlc/state.json', 'both: .sdlc wins, as in lib/root.mjs');
  assert.equal(resolveStatePath(root, 'custom/state.json'), 'custom/state.json', 'an explicit setting wins');

  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-parent-'));
  fs.mkdirSync(path.join(parent, 'app', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(parent, 'app', 'dev', 'state.json'), '{}');
  assert.equal(resolveStatePath(parent, ''), 'dev/state.json', 'a parent workspace finds a dev/ project below it');
});

test('every project under a parent workspace is listed, newest first, without worktree copies', () => {
  // A large workspace holds several projects on the bundle. The reader picks one; nothing is hidden
  // just because another index was written more recently.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-many-'));
  const write = (dir: string, project: string, mtime: number): void => {
    fs.mkdirSync(path.join(dir, 'dev'), { recursive: true });
    const file = path.join(dir, 'dev', 'state.json');
    fs.writeFileSync(file, JSON.stringify({ ...loadSample(), project }));
    fs.utimesSync(file, mtime, mtime);
  };
  const now = Date.now() / 1000;
  write(path.join(parent, 'a'), 'a', now - 3600);
  write(path.join(parent, 'group', 'b'), 'b', now - 60);
  // Nested inside project a: its own code, not another project.
  write(path.join(parent, 'a', 'packages', 'inner'), 'inner', now - 30);
  write(path.join(parent, '.claude', 'worktrees', 'agent-x'), 'worktree', now);

  const roots = findProjectRoots(parent, 'dev/state.json').map((p) => p.root);
  assert.deepEqual(roots, [path.join(parent, 'group', 'b'), path.join(parent, 'a')]);

  // An explicit choice wins over the newest index.
  const chosen = loadState(parent, 'dev/state.json', path.join(parent, 'a'));
  assert.equal(chosen.ok, true);
  if (!chosen.ok) return;
  assert.equal(chosen.state.project, 'a');
  assert.equal(chosen.projectRoot, path.join(parent, 'a'));
});

test('a parent workspace lists its .sdlc/ and dev/ projects together, each read from its own root', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-mixed-'));
  const write = (dir: string, rootName: string, project: string, mtime: number): void => {
    fs.mkdirSync(path.join(dir, rootName), { recursive: true });
    const file = path.join(dir, rootName, 'state.json');
    fs.writeFileSync(file, JSON.stringify({ ...loadSample(), project }));
    fs.utimesSync(file, mtime, mtime);
  };
  const now = Date.now() / 1000;
  write(path.join(parent, 'old'), 'dev', 'old', now - 3600);
  write(path.join(parent, 'new'), '.sdlc', 'new', now - 60);
  write(path.join(parent, '.claude', 'worktrees', 'agent-x'), '.sdlc', 'worktree', now);

  const roots = findProjectRootsAny(parent, stateCandidates('')).map((p) => p.root);
  assert.deepEqual(roots, [path.join(parent, 'new'), path.join(parent, 'old')]);
  assert.deepEqual(stateCandidates('custom/state.json'), ['custom/state.json'], 'an explicit setting is the only path');

  const old = path.join(parent, 'old');
  const loaded = loadState(parent, resolveStatePath(old, ''), old);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.state.project, 'old');
});
