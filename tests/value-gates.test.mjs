/**
 * Step 5c of docs/learning-roadmap.md (DEV-CONTRACTS §23): each stage asks whether the work earns its
 * place, in the template it already writes, and the gate that reads that template judges it. The
 * mechanical half: an initiative with no kill criterion is flagged and one with it is quiet; the
 * templates carry the prompts; each new checklist row was appended, never inserted.
 *
 *   node --test tests/value-gates.test.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const { lintTree, loadTemplates } = await import(pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'lint-dev.mjs')).href);
const TEMPLATES = loadTemplates(join(ROOT, 'workspace', 'dev', '_templates'));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const PROBLEM = 'intake/demo/problem.md';
const valid = read('tests', 'fixtures', 'valid', PROBLEM);

function e038(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-value-'));
  mkdirSync(dirname(join(root, PROBLEM)), { recursive: true });
  writeFileSync(join(root, PROBLEM), mutate(valid));
  return lintTree(root, TEMPLATES).filter((f) => f.rule === 'E038');
}
const asInitiative = (s) => s.replace('change_class: change', 'change_class: initiative');
const withKill = (s) => s.replace(/(## Success looks like\n\n[^\n]+)/, '$1\n\nKill: under 20 % of dispatchers use it by 2027-01-31 — remove the screen.');

test('E038: an initiative with no Kill line is an error; with one, quiet', () => {
  const flagged = e038(asInitiative);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].level, 'error');
  assert.match(flagged[0].message, /no `Kill:` line/);
  assert.equal(e038((s) => withKill(asInitiative(s))).length, 0);
});

test('E038 asks only an initiative: a change or a fix needs no kill criterion', () => {
  assert.match(valid, /change_class: change/);
  assert.equal(e038((s) => s).length, 0);
  assert.equal(e038((s) => s.replace('change_class: change', 'change_class: fix')).length, 0);
});

test('E038: an empty Kill line is not a criterion', () => {
  assert.equal(e038((s) => asInitiative(s).replace(/(## Success looks like\n\n[^\n]+)/, '$1\n\nKill:')).length, 1);
});

test('the templates carry the value prompts where each stage already writes', () => {
  assert.match(read('workspace', 'dev', '_templates', 'problem.md'), /end with one line `Kill: <the result, by when/);
  assert.match(read('workspace', 'dev', '_templates', 'architecture.md'), /one `extensibility` row: name the next two likely features/);
  assert.match(read('workspace', 'dev', '_templates', 'visual-design.md'), /`Usability: <task> — <who> — <time> — <where they hesitated>`/);
  const post = read('workspace', 'dev', '_templates', 'post-release.md');
  assert.match(post, /^## Value and cost$/m);
  assert.match(post, /\| Measure \| Expected \| Actual \| Verdict \|/);
  assert.ok(post.indexOf('## Value and cost') < post.indexOf('## Escaped'), 'value before escapes before next');
});

// Rows are cited by number in every gate log already written, so each new row keeps the number it
// was appended with, and the checklist stays 1..n with no gap or reorder.
const ROWS = [
  ['dev-reviewing-intake', 13, 'with a `Kill:` line', '§23'],
  ['dev-reviewing-design', 23, 'an `extensibility` row', '§23'],
  ['dev-reviewing-design', 24, 'the model id is pinned', 'ai-features.md'],
  ['dev-reviewing-data', 27, 'a retention period with the job that enforces it', 'privacy.md'],
  ['dev-reviewing-ui', 31, 'records a usability pass', '§23'],
  ['dev-reviewing-ui', 32, 'plurals use plural rules', 'seo.md'],
  ['dev-reviewing-verification', 26, 'an eval result over at least 30 cases', 'ai-features.md'],
  ['dev-reviewing-monitoring', 23, '`## Value and cost` quotes the kill criterion', '§23'],
  ['dev-reviewing-monitoring', 24, 'has a postmortem with a timeline', 'postmortem.md'],
];
test('each new gate row holds its number, checklists stay 1..n, and each cites its source', () => {
  for (const [skill, n, text, cite] of ROWS) {
    const rows = [...read('skills', skill, 'SKILL.md').matchAll(/^\| (\d+) \| (.*) \|$/gm)].map((m) => [Number(m[1]), m[2]]);
    const nums = rows.map(([k]) => k);
    assert.deepEqual(nums, nums.map((_, i) => i + 1), `${skill}: rows are 1..${nums.length}, in order`);
    const row = rows.find(([k]) => k === n);
    assert.ok(row?.[1].includes(text), `${skill} row ${n}: ${text}`);
    assert.ok(row[1].includes(cite), `${skill} row ${n} cites ${cite}`);
  }
});

test('each reference file exists, is linked from its skill with when to read it, and says how a gate fails on it', () => {
  for (const [skill, file] of [
    ['dev-framing-problem', 'exploring-ideas.md'],
    ['dev-brainstorming-architecture', 'ai-features.md'],
    ['dev-modeling-data', 'privacy.md'],
    ['dev-specifying-ui', 'i18n.md'],
    ['dev-specifying-ui', 'seo.md'],
    ['dev-designing-observability', 'postmortem.md'],
  ]) {
    const ref = read('skills', skill, file);
    assert.match(ref, /^# .+\n\nRead this when /, `${file} opens with when to read it`);
    assert.ok(read('skills', skill, 'SKILL.md').includes(`\`${file}\``), `${skill} links ${file}`);
  }
  for (const f of ['ai-features.md', 'seo.md', 'i18n.md', 'postmortem.md']) {
    const [skill] = { 'ai-features.md': ['dev-brainstorming-architecture'], 'seo.md': ['dev-specifying-ui'], 'i18n.md': ['dev-specifying-ui'], 'postmortem.md': ['dev-designing-observability'] }[f];
    assert.match(read('skills', skill, f), /\bG\d+ fails\b/, `${f} says what fails its gate`);
  }
});

test('the contract lists all five value checks and the web budget it reuses', () => {
  const c = read('DEV-CONTRACTS.md');
  const s23 = c.slice(c.indexOf('## 23. Value you can see'));
  assert.match(read('skills', 'dev-reviewing-intake', 'SKILL.md'), /^\| 14 \| An `initiative` has `## Pillars` with all five pillars/m, 'G0 row 14 judges ## Pillars');
  assert.match(read('skills', 'dev-reviewing-monitoring', 'SKILL.md'), /a gap over 50 % without a reason is `MAJOR` \(§23\)/, 'G11 row 23 grades the cost gap');
  for (const g of ['G0 row 13', 'G2 row 23', 'G5 row 31', 'G8 row 23', 'G11 row 23']) assert.ok(s23.includes(g), g);
  assert.match(read('skills', 'dev-reviewing-verification', 'SKILL.md'), /^\| 23 \| The performance rows hold the §13\.7 split: the perf smoke and `web-perf\.mjs`/m, 'G8 row 23 is the web budget §23 cites');
  assert.match(read('skills', 'dev-reviewing-verification', 'SKILL.md'), /A public page also ran with `--audit seo,a11y` and scores 100 on both/, 'G8 row 23 runs the SEO and accessibility audit');
});

// ---- §24: the five pillars at intake --------------------------------------------------------------

const PILLARS = (rows) => `\n## Pillars\n\n| Pillar | For this product | Measured by |\n|---|---|---|\n${rows}\n`;
const FIVE = ['Intelligence', 'Memory and learning', 'Judgment and integrity', 'Verification and safety', 'Value and experience']
  .map((p) => `| ${p} | x | a number |`).join('\n');
function w098(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-pillars-'));
  mkdirSync(dirname(join(root, PROBLEM)), { recursive: true });
  writeFileSync(join(root, PROBLEM), mutate(valid));
  const all = lintTree(root, TEMPLATES);
  return { w: all.filter((f) => f.rule === 'W098'), errors: all.filter((f) => f.level === 'error') };
}

test('W098: an initiative answering all five pillars with measures is quiet, and ## Pillars is a valid trailing section', () => {
  const r = w098((s) => withKill(asInitiative(s)) + PILLARS(FIVE));
  assert.deepEqual(r.w, []);
  assert.deepEqual(r.errors, [], 'the optional trailing heading does not break the heading contract');
});

test('W098: missing section, a missing pillar, or a pillar with no measure is flagged', () => {
  assert.match(w098((s) => withKill(asInitiative(s))).w[0].message, /answers 0 of the five pillars/);
  assert.match(w098((s) => withKill(asInitiative(s)) + PILLARS(FIVE.split('\n').slice(0, 4).join('\n'))).w[0].message, /answers 4 of the five/);
  assert.match(w098((s) => withKill(asInitiative(s)) + PILLARS(FIVE.replace('| Value and experience | x | a number |', '| Value and experience | x | — |'))).w[0].message, /no measure: Value and experience/);
});

test('W098 asks only an initiative; a change without ## Pillars stays valid', () => {
  const r = w098((s) => s);
  assert.deepEqual(r.w, []);
  assert.deepEqual(r.errors, []);
});

test('the template carries ## Pillars with the five rows', () => {
  const tpl = read('workspace', 'dev', '_templates', 'problem.md');
  for (const p of ['Intelligence', 'Memory and learning', 'Judgment and integrity', 'Verification and safety', 'Value and experience']) assert.match(tpl, new RegExp(`^\| ${p} \|`, 'm'));
});
