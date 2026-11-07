/**
 * Step 3 of docs/learning-roadmap.md (DEV-CONTRACTS §20): what a release found becomes the next
 * piece of work. `## Next` rows of kind `idea` reach ideas.md once each, a human ranks them, intake
 * offers the top ones, and an empty `## Next` is flagged. Every rule has a row it must refuse and
 * the valid one it must accept.
 *
 *   node --test tests/ideas.test.mjs
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
const SCRIPT = join(ROOT, 'workspace', 'dev', 'scripts', 'ideas.mjs');
const ideas = await import(pathToFileURL(SCRIPT).href);
const { lintTree, loadTemplates } = await import(pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'lint-dev.mjs')).href);
const TEMPLATES = loadTemplates(join(ROOT, 'workspace', 'dev', '_templates'));
process.env.SDLC_RUN_LOG = 'off';

const POST = (next) => `---
slug: orders
stage: monitoring
artifact: post-release
---

## What we learned

The export timed out at 40k rows.

## Next

| Kind | What | Evidence | Class |
|---|---|---|---|
${next}

## Follow-up actions
`;
const ROWS = [
  '| idea | Stream the CSV export instead of building it in memory | §Behaviour under real traffic | change |',
  '| lesson | G4 asks for a page size on every export | §What we learned | — |',
  '| idea | Let users schedule the export overnight | §Incidents and anomalies | initiative |',
].join('\n');

function project(files) {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-ideas-')), '.sdlc');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8', env: { ...process.env } });
const ideasFile = (root) => readFileSync(join(root, 'ideas.md'), 'utf8');

test('sync: each idea row becomes an IDEA-NNN, lessons and checks do not, and it passes the gate', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST(ROWS) });
  const added = ideas.sync(root);
  assert.deepEqual(added.map((a) => [a.id, a.class]), [['IDEA-001', 'change'], ['IDEA-002', 'initiative']]);
  assert.match(ideasFile(root), /\| IDEA-001 \| Stream the CSV export instead of building it in memory \| monitoring\/orders\/post-release\.md \| change \| — \| — \| — \| — \| new \|/);
  assert.doesNotMatch(ideasFile(root), /page size on every export/);
  assert.deepEqual(ideas.checkIdeas(root), []);
});

test('sync is idempotent and append-only: no duplicate, no renumbering, new ideas continue the count', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST(ROWS) });
  ideas.sync(root);
  assert.deepEqual(ideas.sync(root), [], 'a second sync adds nothing');
  writeFileSync(join(root, 'monitoring', 'orders', 'post-release.md'), POST(`${ROWS}\n| idea | Email when the export is ready | §Alerts fired | change |`));
  mkdirSync(join(root, 'monitoring', 'invoices'), { recursive: true });
  writeFileSync(join(root, 'monitoring', 'invoices', 'post-release.md'), POST('| idea | Stream the CSV export instead of building it in memory | §x | change |'));
  const added = ideas.sync(root);
  assert.deepEqual(added.map((a) => a.id), ['IDEA-003', 'IDEA-004'], 'the same idea from another release is new evidence, so it is a new row');
  assert.equal((ideasFile(root).match(/\| IDEA-001 \|/g) ?? []).length, 1);
});

test('sync skips the template placeholder and a none row', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST('| none | Nothing to carry: the release met every budget | §SLO status | — |') });
  assert.deepEqual(ideas.sync(root), []);
  const placeholder = project({ 'monitoring/orders/post-release.md': POST('| idea | <a capability to add or change> | <evidence> | <class> |') });
  assert.deepEqual(ideas.sync(placeholder), [], 'an unfilled template row is not an idea');
});

const LEDGER = (rows) => `---\nartifact: ideas\n---\n\n## Ideas\n\n| ${ideas.COLUMNS.join(' | ')} |\n|${ideas.COLUMNS.map(() => '---').join('|')}|\n${rows}\n`;
const GOOD = '| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | high | low | medium | Luan | ranked |';
const BROKEN = {
  'a ranked row with nobody named': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | high | low | medium | — | ranked |', /nobody named/],
  'a value with no ranker': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | high | — | — | — | new |', /nobody named/],
  'missing evidence': ['| IDEA-001 | Stream the export | monitoring/gone/post-release.md | change | — | — | — | — | new |', /does not exist/],
  'no evidence at all': ['| IDEA-001 | Stream the export | — | change | — | — | — | — | new |', /no evidence|does not exist/],
  'a level outside the scale': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | huge | — | — | Luan | ranked |', /value `huge`/],
  'an unknown status': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | — | — | — | — | maybe |', /status `maybe`/],
  'taken by a slug with no problem': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | — | — | — | — | taken: ghost |', /taken by `ghost`/],
  'dropped with no reason': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | — | — | — | — | dropped |', /dropped without a reason/],
  'an id used twice': [`${GOOD}\n${GOOD}`, /used twice/],
  'a bad class': ['| IDEA-001 | Stream the export | monitoring/orders/post-release.md | epic | — | — | — | — | new |', /class `epic`/],
};
test('the gate accepts a ranked row that names its ranker, and a human-evidenced one', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST(ROWS), 'ideas.md': LEDGER(`${GOOD}\n| IDEA-002 | Dark mode | human: Luan — readers asked | change | — | — | — | — | new |`) });
  assert.deepEqual(ideas.checkIdeas(root), []);
});
for (const [name, [rows, why]] of Object.entries(BROKEN)) {
  test(`the gate refuses ${name}`, () => {
    const root = project({ 'monitoring/orders/post-release.md': POST(ROWS), 'ideas.md': LEDGER(rows) });
    const errors = ideas.checkIdeas(root);
    assert.ok(errors.some((e) => why.test(e)), `expected ${why} in:\n  ${errors.join('\n  ') || '(no errors)'}`);
  });
}
test('the gate refuses a table with the wrong columns', () => {
  const root = project({ 'ideas.md': '---\nartifact: ideas\n---\n\n## Ideas\n\n| Id | Idea |\n|---|---|\n| IDEA-001 | x |\n' });
  assert.ok(ideas.checkIdeas(root).some((e) => /must have the columns/.test(e)));
});
test('taken: a slug with a problem.md passes', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST(ROWS), 'intake/stream-export/problem.md': '---\n---\n', 'ideas.md': LEDGER('| IDEA-001 | Stream the export | monitoring/orders/post-release.md | change | — | — | — | — | taken: stream-export |') });
  assert.deepEqual(ideas.checkIdeas(root), []);
});

test('list offers ranked ideas first (value, then confidence, then low effort), then new ones; taken and dropped never', () => {
  const rows = [
    '| IDEA-000 | New one, oldest | human: a — b | change | — | — | — | — | new |',
    '| IDEA-001 | New one | human: a — b | change | — | — | — | — | new |',
    '| IDEA-002 | Medium value | human: a — b | change | medium | low | high | Luan | ranked |',
    '| IDEA-003 | High value, hard | human: a — b | change | high | high | high | Luan | ranked |',
    '| IDEA-004 | High value, easy | human: a — b | change | high | low | high | Luan | ranked |',
    '| IDEA-005 | Dropped | human: a — b | change | — | — | — | — | dropped: done elsewhere |',
  ].join('\n');
  const root = project({ 'ideas.md': LEDGER(rows) });
  assert.deepEqual(ideas.list(root).map((r) => r.id.trim()), ['IDEA-004', 'IDEA-003', 'IDEA-002', 'IDEA-000', 'IDEA-001'], 'ranked before unranked, even when the unranked id is older');
  const out = run(root, 'list', '--top', '2');
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^IDEA-004 · High value, easy\n {4}value high · effort low · confidence high \(Luan\)/m);
  assert.match(out.stdout, /… 3 more in ideas\.md/);
  assert.match(run(project({}), 'list').stdout, /No open idea\./);
  // A row an agent scored without a human (the gate refuses it) must still not jump the queue.
  const sneaky = project({ 'ideas.md': LEDGER(`${rows}\n| IDEA-006 | Scored by nobody | human: a — b | change | high | low | high | — | new |`) });
  assert.equal(ideas.list(sneaky).at(-1).id.trim(), 'IDEA-006', 'an unranked score sorts after every ranked idea');
  // A human may rank without scoring ("do this next"): it still comes before every unranked row.
  const bare = project({ 'ideas.md': LEDGER(`| IDEA-001 | Unranked | human: a — b | change | — | — | — | — | new |\n| IDEA-002 | Ranked, no scores | human: a — b | change | — | — | — | Luan | ranked |`) });
  assert.deepEqual(ideas.list(bare).map((r) => r.id.trim()), ['IDEA-002', 'IDEA-001']);
});

test('the CLI: check exits 1 on an error and 0 when clean; sync reports what it added', () => {
  const root = project({ 'monitoring/orders/post-release.md': POST(ROWS) });
  const s = run(root, 'sync');
  assert.equal(s.status, 0);
  assert.match(s.stdout, /\+ IDEA-001 {2}Stream the CSV export/);
  assert.match(s.stdout, /2 new idea\(s\); a human ranks them in ideas\.md/);
  assert.equal(run(root, 'check').status, 0);
  writeFileSync(join(root, 'ideas.md'), LEDGER(BROKEN['a ranked row with nobody named'][0]));
  assert.equal(run(root, 'check').status, 1);
  assert.equal(run(root, 'bogus').status, 2);
});

// ---- the wiring ------------------------------------------------------------------------------------

test('W095: lint-dev flags a post-release with an empty ## Next, and is quiet when it has a row', () => {
  const tpl = readFileSync(join(ROOT, 'workspace', 'dev', '_templates', 'post-release.md'), 'utf8');
  assert.match(tpl, /^## Next$/m, 'the template carries ## Next');
  assert.match(tpl, /\| Kind \| What \| Evidence \| Class \|/);
  const warns = (next) => lintTree(project({ 'monitoring/orders/post-release.md': POST(next) }), TEMPLATES).filter((f) => f.rule === 'W095');
  assert.equal(warns('').length, 1, 'empty ## Next is flagged');
  assert.equal(warns(ROWS).length, 0);
  assert.equal(warns('| none | Nothing to carry: every budget met | §SLO status | — |').length, 0, 'a none row is an answer');
});

test('lint-dev leaves ideas.md to its own gate', () => {
  const root = project({ 'ideas.md': LEDGER(GOOD), 'monitoring/orders/post-release.md': POST(ROWS) });
  assert.deepEqual(lintTree(root, TEMPLATES).filter((f) => f.file === 'ideas.md'), []);
});

test('G11 checks ## Next, monitor syncs it, intake offers it, and nobody but a human ranks', () => {
  const checklist = readFileSync(join(ROOT, 'skills', 'dev-reviewing-monitoring', 'SKILL.md'), 'utf8');
  assert.match(checklist, /^\| 21 \| `## Next` has a row for each thing/m);
  const monitor = readFileSync(join(ROOT, 'commands', 'sdlc-monitor.md'), 'utf8');
  assert.match(monitor, /ideas\.mjs sync/);
  const intake = readFileSync(join(ROOT, 'commands', 'sdlc-intake.md'), 'utf8');
  assert.match(intake, /ideas\.mjs list --top 3/);
  assert.match(intake, /Never rank an idea yourself/);
});
