/**
 * Step 9 of docs/learning-roadmap.md: master in every role. Each role pack is a principles file
 * (principles, trade-offs, anti-patterns) linked from the skill that authors the artifact, reviewer
 * rows that cite it, and an exam: a clean artifact plus one variant per row, each breaking that row
 * only. The exam is taken by an independent reviewer (tests/exam/README.md); these tests hold the
 * exam itself honest, so a passing reviewer means something.
 *
 *   node --test tests/role-packs.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const { ROLES, build } = await import(pathToFileURL(join(here, 'exam', 'build.mjs')).href);
const { grade } = await import(pathToFileURL(join(here, 'exam', 'grade.mjs')).href);
const KEY = JSON.parse(read('tests', 'exam', 'key.json'));

const PACKS = {
  architect: ['dev-brainstorming-architecture', 'architecture-principles.md'],
  security: ['dev-modeling-threats', 'security-principles.md'],
  data: ['dev-modeling-data', 'data-principles.md'],
  sre: ['dev-planning-deployment', 'sre-principles.md'],
  pm: ['dev-framing-problem', 'product-principles.md'],
  ba: ['dev-decomposing-requirements', 'domain-modelling.md'],
  ux: ['dev-specifying-ui', 'ux-principles.md'],
  research: ['dev-framing-problem', 'user-research.md'],
  prioritisation: ['dev-planning-implementation', 'prioritisation.md'],
  docs: ['dev-packaging-release', 'user-docs.md'],
  cicd: ['dev-designing-cloud', 'ci-cd.md'],
  incident: ['dev-designing-observability', 'incident-response.md'],
  cost: ['dev-designing-observability', 'cost-after-release.md'],
  desktop: ['dev-packaging-release', 'desktop.md'],
  extension: ['dev-packaging-release', 'vscode-extension.md'],
  clipack: ['dev-packaging-release', 'cli.md'],
  aipack: ['dev-packaging-release', 'ai-app.md'],
  mobilepack: ['dev-packaging-release', 'mobile.md'],
};

test('each principles file has the three parts, says when to read it, is linked from its skill, and names what fails', () => {
  for (const [role, [skill, file]] of Object.entries(PACKS)) {
    const text = read('skills', skill, file);
    assert.match(text, /^# .+\n\nRead this when /, `${role}: opens with when to read it`);
    // A product pack's middle section is what G8–G11 expect of that type; a role's is its trade-offs.
    const middle = /\(preview\)$/.test(text.split('\n')[0]) ? '## Verify, release, operate' : '## Trade-offs';
    for (const h of ['## Principles', middle, '## Anti-patterns']) assert.ok(text.includes(`\n${h}\n`), `${role}: ${h}`);
    const principles = text.split('## Principles')[1].split(middle)[0].match(/^\| \d+ \|/gm) ?? [];
    assert.ok(principles.length >= 8 && principles.length <= 12, `${role}: ${principles.length} principles (8–12)`);
    assert.match(text, /^\| # \| Principle \| Why \| When it does not hold \|$/m, `${role}: every principle has its why and its exception`);
    assert.match(text, /\bG\d+ fails\b/, `${role}: says what fails its gate`);
    assert.ok(read('skills', skill, 'SKILL.md').includes(`\`${file}\``), `${skill} links ${file}`);
  }
});

test('every exam row is a reviewer row that cites the principles file; the files the key names exist', () => {
  for (const [role, k] of Object.entries(KEY)) {
    const reviewer = read(k.reviewer);
    const file = k.principles.split('/').pop();
    assert.ok(existsSync(join(ROOT, k.principles)), k.principles);
    for (const row of k.rows) {
      const line = reviewer.split('\n').find((l) => l.startsWith(`| ${row} |`));
      assert.ok(line, `${role}: ${k.reviewer} has row ${row}`);
      assert.ok(line.includes(`\`${file}\``), `${role}: row ${row} cites ${file}`);
    }
  }
});

test('the exam on disk is what build.mjs writes, so the key cannot drift from the cases', () => {
  const tmp = join(ROOT, 'tests', 'exam');
  const before = JSON.stringify(KEY);
  const key = build(join(tmp, '..', '..', 'node_modules', '.exam-check'));
  assert.equal(JSON.stringify(key).replace(/node_modules[\\/].exam-check/g, ''), before.replace(/node_modules[\\/].exam-check/g, ''));
  for (const [role, k] of Object.entries(key)) {
    for (const name of Object.keys(k.cases)) {
      assert.equal(read('node_modules', '.exam-check', role, `${name}.md`), read('tests', 'exam', role, `${name}.md`), `${role}/${name}: run node tests/exam/build.mjs`);
    }
  }
});

test('every role has one clean case and one case per row; each flawed case differs from the clean one in one section', () => {
  for (const [role, r] of Object.entries(ROLES)) {
    const k = KEY[role];
    const want = Object.values(k.cases);
    assert.equal(want.filter((x) => !x.length).length, 1, `${role}: one clean case`);
    assert.deepEqual(want.flat().sort(), [...k.rows].sort(), `${role}: one case per row`);
    assert.ok(Object.values(k.cases)[0].length, `${role}: case-1 is not the clean one`);
    for (const change of Object.values(r.flaws)) {
      assert.equal(Object.keys(change).length, 1, `${role}: a flaw changes one section`);
      const [section] = Object.keys(change);
      assert.ok(section in r.base, `${role}: ${section} is a section of the clean case`);
      assert.notEqual(change[section], r.base[section]);
    }
  }
  const total = Object.values(KEY).reduce((n, k) => n + k.rows.length, 0);
  assert.equal(total, 36, 'one flaw per reviewer row: roles 25 (G0 3, G1 2, G2 9, G3 5, G5 2, G10 4), skills 6 (G0 18, G6 23, G9 21, G10 28, G11 25–26), packs 5 (G9 22–26)');
});

test('grading: all found and the clean case passed is a pass; a miss, a false alarm or no answer is a fail', () => {
  const perfect = Object.fromEntries(Object.entries(KEY).map(([r, k]) => [r, k.cases]));
  assert.ok(Object.values(grade(KEY, perfect)).every((g) => g.pass));
  const failAll = Object.fromEntries(Object.entries(KEY).map(([r, k]) => [r, Object.fromEntries(Object.keys(k.cases).map((c) => [c, k.rows]))]));
  assert.ok(Object.values(grade(KEY, failAll)).every((g) => !g.pass && g.falseAlarms.length), 'failing every row on every case is not mastery');
  const passAll = Object.fromEntries(Object.entries(KEY).map(([r, k]) => [r, Object.fromEntries(Object.keys(k.cases).map((c) => [c, []]))]));
  assert.ok(Object.values(grade(KEY, passAll)).every((g) => !g.pass && g.missed.length), 'passing everything is not mastery');
  const { architect, ...rest } = perfect;
  assert.equal(grade(KEY, rest).architect.pass, false, 'a role nobody answered fails');
});

test('the contract and the roadmap name every pack and its rows', () => {
  const c = read('DEV-CONTRACTS.md');
  assert.match(c, /^### 24\.3 Master in every role/m);
  for (const [, file] of Object.values(PACKS)) assert.ok(c.includes(`\`${file}\``), `§24.3 lists ${file}`);
  assert.match(read('docs', 'learning-roadmap.md'), /^### Step 9: Master in every role/m);
});

test('the recorded exam run: independent reviewers found every seeded flaw and passed every clean case, in every exam', () => {
  const run = JSON.parse(read('docs', 'evidence', 'exam', 'answers-2026-10-23.json'));
  const g = grade(KEY, run.roles);
  for (const [role, r] of Object.entries(g)) assert.ok(r.pass, `${role}: missed ${r.missed.join(', ')}; false alarms ${r.falseAlarms.join(', ')}`);
  assert.equal(Object.values(g).reduce((n, r) => n + r.found, 0), 36, 'every exam in key.json was taken and passed');
});
