/**
 * The ui-spec tables of DEV-CONTRACTS §13.13 — nine states, the roles matrix, traceability and a
 * responsive row per breakpoint (lint E140–E144, W140, W141), and the visual-design approvals (E146).
 * Each rule is shown to fail on a copy of the valid fixture broken in exactly one way.
 *
 *   node --test tests/ui-spec-tables.test.mjs
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { lintTree, loadTemplates } from '../workspace/dev/scripts/lint-dev.mjs';
import { STATE_COLUMNS, screenKey } from '../workspace/dev/scripts/lib/ui-spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = loadTemplates(join(here, '..', 'workspace', 'dev', '_templates'));
const FIX = join(here, 'fixtures', 'ui-spec');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const SPEC = read(join(FIX, 'ui-spec.md'));

function lint(spec, { api = true, tokens = true, visual = null } = {}) {
  const r = mkdtempSync(join(tmpdir(), 'sdlc-uispec-'));
  mkdirSync(join(r, 'ui', 'demo'), { recursive: true });
  writeFileSync(join(r, 'ui', 'demo', 'ui-spec.md'), spec);
  if (api) {
    mkdirSync(join(r, 'api', 'demo'), { recursive: true });
    writeFileSync(join(r, 'api', 'demo', 'openapi.yaml'), read(join(FIX, 'openapi.yaml')));
  }
  if (tokens) {
    mkdirSync(join(r, 'docs'), { recursive: true });
    writeFileSync(join(r, 'docs', 'design-tokens.json'), read(join(FIX, 'design-tokens.json')));
  }
  if (visual) writeFileSync(join(r, 'ui', 'demo', 'visual-design.md'), visual);
  const out = lintTree(r, TEMPLATES).filter((f) => /^[EW]14\d$/.test(f.rule));
  rmSync(r, { recursive: true, force: true });
  return out;
}
const rules = (f) => f.map((x) => x.rule).sort();
const mutate = (from, to) => {
  assert.ok(SPEC.includes(from), `fixture lacks: ${from}`);
  return SPEC.replace(from, to);
};

test('valid: the fixture spec lints clean, with and without a contract and tokens', () => {
  assert.deepEqual(lint(SPEC), []);
  assert.deepEqual(lint(SPEC, { api: false, tokens: false }), []);
});

test('the states columns are the nine §13.13 states, and screens join by id', () => {
  assert.equal(STATE_COLUMNS.length, 10);
  assert.equal(screenKey('S01 Releases'), screenKey('`S01`'));
  assert.equal(screenKey('Sign in'), screenKey('sign in'));
});

test('E140: a states table missing a column; E141: a screen with no row, an empty cell; W140: a bare N/A', () => {
  assert.deepEqual(rules(lint(mutate('| No results |', '| Search |'))), ['E140']);
  assert.deepEqual(rules(lint(mutate(/\n\| S02 Release \| detail skeleton[^\n]*/.exec(SPEC)[0], ''))), ['E141']);
  assert.deepEqual(rules(lint(mutate('| R-403 panel | banner, list kept |', '|  | banner, list kept |'))), ['E141']);
  assert.deepEqual(rules(lint(mutate('N/A — the screen has no filter', 'N/A'))), ['W140']);
});

test('E142: no roles matrix, a screen with no row, a cell outside the vocabulary', () => {
  assert.deepEqual(rules(lint(mutate('### Roles matrix', '### Who sees what'))), ['E142']);
  assert.deepEqual(rules(lint(SPEC.replace(/\| S02 Release \| (view|Delete) \|[^\n]*\n/g, ''))), ['E142']);
  assert.deepEqual(rules(lint(mutate('| hidden | enabled |', '| maybe | enabled |'))), ['E142']);
});

test('E143: an operation the contract does not have, in the roles matrix or in traceability; quiet with no contract', () => {
  assert.deepEqual(rules(lint(mutate('`createRelease` | hidden', '`makeRelease` | hidden'))), ['E143']);
  assert.deepEqual(rules(lint(mutate('`getRelease`, `deleteRelease`', '`getRelease`, `purgeRelease`'))), ['E143']);
  assert.deepEqual(rules(lint(mutate('`createRelease` | hidden', '`makeRelease` | hidden'), { api: false })), []);
});

test('E144: no traceability table, a screen with no row, a UB id the spec does not define', () => {
  assert.deepEqual(rules(lint(mutate('### Traceability', '### Mapping'))), ['E144']);
  assert.deepEqual(rules(lint(mutate('| S02 Release | Card, Dialog | `getRelease`, `deleteRelease` | AC-001 |\n', ''))), ['E144']);
  assert.deepEqual(rules(lint(mutate('AC-001, UB-001', 'AC-001, UB-009'))), ['E144']);
});

test('W141: a token breakpoint with no responsive row; quiet with no tokens', () => {
  assert.deepEqual(rules(lint(mutate('| `bp.md` | icon rail | priority columns | centred dialog | none |\n', ''))), ['W141']);
  assert.deepEqual(rules(lint(mutate('| `bp.md` | icon rail | priority columns | centred dialog | none |\n', ''), { tokens: false })), []);
});

test('a spec with no screen rows is not cross-checked (N/A — <reason> screens)', () => {
  const bare = SPEC.replace(/## Screens\n[\s\S]*?\n## User flows/, '## Screens\n\nN/A — this change adds no screen.\n\n## User flows');
  assert.deepEqual(lint(bare), []);
});

const VISUAL = (extra) => `---\nslug: demo\nstage: ui\nartifact: visual-design\nstatus: draft\nauthored_by: dev-designing-visuals\nreviewed_by: pending\ntracker: none\ncreated: 2026-10-14\nupdated: 2026-10-14\nrequirements: [REQ-001]\n${extra}---\n\n## Basis\n\nclean-saas.\n`;

test('E146: approvals name three humans, dated; an agent or a missing date fails', () => {
  const ok = 'approved_by: Luan Nguyen\napproved_on: 2026-10-14\napprovals: { design: Ana Tran, engineering: Bo Le, accessibility: Cy Do }\n';
  assert.deepEqual(rules(lint(SPEC, { visual: VISUAL(ok) })), []);
  assert.deepEqual(rules(lint(SPEC, { visual: VISUAL(ok.replace('Cy Do', 'dev-reviewing-ui')) })), ['E146']);
  assert.deepEqual(rules(lint(SPEC, { visual: VISUAL('approvals: { design: Ana Tran }\n') })), ['E146']);
});
