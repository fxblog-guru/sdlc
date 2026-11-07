/**
 * Judgment checks that can fail (DEV-CONTRACTS §13.4, §21): a release plan with no rollback, and an
 * uncited claim a decision rests on, are errors. Each case lints one file in a scratch root.
 *
 *   node --test tests/judgment-gates.test.mjs
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
const readLF = (...p) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

function lint(rel, text) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-judgment-'));
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  return lintTree(root, TEMPLATES).filter((f) => f.level === 'error').map((f) => f.rule);
}

// An artifact with every template heading answered; the Rollback answer is the variable.
const PLAN = 'deployment/demo/release-plan.md';
function fromTemplate(type, stage, author, reviewer, rollback) {
  const headings = readLF('workspace', 'dev', '_templates', `${type}.md`).split('\n').filter((l) => /^## /.test(l));
  const fm = ['---', 'slug: demo', `stage: ${stage}`, `artifact: ${type}`, 'status: draft', `authored_by: ${author}`, `reviewed_by: ${reviewer}`, 'tracker: none', 'created: 2026-10-26', 'updated: 2026-10-26', 'requirements: []', '---', ''].join('\n');
  const body = headings.map((h) => [h, '', h === '## Rollback' ? rollback : 'Rolling deploy of the case search service, one replica at a time.', ''].join('\n')).join('\n');
  return `${fm}\n${body}`;
}
const releasePlan = (rollback) => fromTemplate('release-plan', 'deployment', 'dev-planning-deployment', 'dev-reviewing-deployment', rollback);

test('E035: a release plan with a written rollback is clean', () => {
  assert.deepEqual(lint(PLAN, releasePlan('`kubectl rollout undo deploy/search` — 2 min — the on-call lead decides; forward-only after MIG-202610260900.')), []);
});

for (const [name, text] of [['empty', ''], ['a comment only', '<!-- later -->'], ['N/A', 'N/A'], ['TBD', 'TBD.']]) {
  test(`E035: a rollback that is ${name} fails`, () => {
    assert.deepEqual(lint(PLAN, releasePlan(text)), ['E035']);
  });
}

test('E035 reads only release plans: a runbook with an empty Rollback is not this rule', () => {
  const runbook = fromTemplate('runbook', 'monitoring', 'dev-designing-observability', 'dev-reviewing-monitoring', '');
  assert.ok(!lint('monitoring/demo/runbook.md', runbook).includes('E035'));
});

const ADR = 'design/demo/adr/ADR-001-search.md';
function adr(decision, context = 'Testers search 4k cases.') {
  return `---\nslug: demo\nstage: design\nartifact: adr\nstatus: draft\nauthored_by: dev-brainstorming-architecture\nreviewed_by: dev-reviewing-design\ntracker: none\ncreated: 2026-10-26\nupdated: 2026-10-26\nrequirements: []\n---\n\n## Status\n\nproposed\n\n## Context\n\n${context}\n\n## Decision\n\n${decision}\n\n## Alternatives\n\nA search service, rejected for one more thing to run.\n\n## Consequences\n\nSearch is a query on the existing database; moving later costs a reindex.\n\n## Compliance\n\nThe G7 reviewer checks that no second index is added.\n`;
}

test('E037: an UNVERIFIED claim inside ## Decision is an error; in Context it stays a warning', () => {
  assert.deepEqual(lint(ADR, adr('We will use Postgres full-text search.')), []);
  assert.deepEqual(lint(ADR, adr('We will use Postgres full-text search.\n\nUNVERIFIED: the case table stays under 100k rows.')), ['E037']);
  assert.deepEqual(lint(ADR, adr('We will use Postgres full-text search.', 'UNVERIFIED: the case table stays under 100k rows.')), []);
  assert.deepEqual(lint(ADR, adr('We will use Postgres full-text search; the rule is `UNVERIFIED: <claim>`.')), [], 'a quoted marker is not a claim');
});
