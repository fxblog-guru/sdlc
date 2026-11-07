/**
 * copy-lint.mjs — the copy catalogue and the screens against the copy style guide and the
 * glossary (DEV-CONTRACTS §13.3). One broken fixture with one of each fault, one valid fixture.
 *
 *   node --test tests/copy-lint.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { catalogueEntries, copyLint, isTitleCase, literalsIn, readGlossary } from '../workspace/dev/scripts/copy-lint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', 'copy');
const GLOSSARY = join(FIX, 'dev', 'glossary.md');
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'copy-lint.mjs');

test('the catalogue is read as dotted keys, without running it', () => {
  const e = catalogueEntries("export const en = { common: { cancel: 'Cancel' }, a: { b: { c: \"Say: hi\", 'd-e': `x` } } } as const;");
  assert.deepEqual(e.map((x) => [x.key, x.value]), [['common.cancel', 'Cancel'], ['a.b.c', 'Say: hi'], ['a.b.d-e', 'x']]);
});

test('the glossary is any table with a Term and a Not column', () => {
  const g = readGlossary('| Term | Definition | Not |\n|---|---|---|\n| email address | x | e-mail, E-mail |\n| ticket | y | — |\n');
  assert.deepEqual(g.map((t) => [t.term, t.not]), [['email address', ['e-mail', 'E-mail']], ['ticket', []]]);
});

test('valid: a catalogue written to the guide, and screens that read it, are clean', () => {
  const r = copyLint({ project: join(FIX, 'valid'), glossary: GLOSSARY });
  assert.deepEqual(r.findings, []);
  assert.equal(r.terms, 3);
});

test('broken: one finding per fault', () => {
  const r = copyLint({ project: join(FIX, 'broken'), glossary: GLOSSARY });
  const got = r.findings.map((f) => `${f.rule}:${f.key ?? f.message.match(/"([^"]+)"/)?.[1]}`).sort();
  assert.deepEqual(got, [
    'contraction:releases.list.saveFailed',
    'duplicate:releases.list.dismiss',
    'empty-punctuation:releases.list.emptyBody',
    'empty-punctuation:releases.list.emptyTitle',
    'glossary:releases.list.emailLabel',
    'key-shape:Releases.x',
    'literal:Releases',
    'literal:placeholder=\\',
    'title-case:releases.list.header',
  ].sort());
  const cli = spawnSync(process.execPath, [SCRIPT, '--project', join(FIX, 'broken'), '--glossary', GLOSSARY], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  const ok = spawnSync(process.execPath, [SCRIPT, '--project', join(FIX, 'valid'), '--glossary', GLOSSARY], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout);
});

test('Title Case and JSX literals, both directions', () => {
  assert.ok(isTitleCase('Add Tickets To Release'));
  assert.ok(!isTitleCase('Add tickets to the release'));
  assert.ok(!isTitleCase('Export PDF'), 'an acronym is not Title Case');
  assert.ok(!isTitleCase('{n} MUST FIX · Critical {c} · High {h}'), 'a label list is judged per phrase');
  assert.deepEqual(literalsIn('const p: Promise<Paged<T>> = x;\nreturn <p>{copy.a}</p>;').map((l) => l.value), []);
  assert.deepEqual(literalsIn('return (\n  <p>Hello there</p>\n);').map((l) => l.value), ['Hello there']);
});
