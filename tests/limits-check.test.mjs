/**
 * limits-check.mjs: one value per limit, in limits.yaml, and every layer agrees (DEV-CONTRACTS
 * §13.11).
 *
 * release-management quoted 500 characters in Go and allowed 501 in SQL, and had two MaxReason
 * constants of 500 and 2000; MaxPage was defined eleven times. Nothing compared the layers.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, edit, run } from './backend-fixture.mjs';
import { evalInt, scanSql, scanCode, scanMessages } from '../workspace/dev/scripts/limits-check.mjs';

const ARGS = ['demo', '--root', 'dev', '--source', '.', '--web', 'web/src'];

test('the valid fixture passes clean', () => {
  const r = run('limits-check.mjs', ARGS, project());
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary.sql, 2);
});

test('the broken overlay: a later migration drifts, a name with two values, a repeat, a digit', () => {
  const r = run('limits-check.mjs', ARGS, project({ broken: true }));
  assert.equal(r.status, 1);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E112 release\.notes: sql release\.notes is 10001; limits\.yaml says 10000/);
  assert.match(m, /E112 MaxReason has 2 values in go \(bug 500, gonogo 2000\)/);
  assert.match(m, /E113 release\.name is defined 2 times in go|E113 MaxName = 100 is defined 2 times/);
  assert.match(m, /W105 .*1 to 2000 characters/);
  assert.match(m, /W106 go gonogo\.MaxReason = 2000 is in no limits\.yaml entry/);
});

test('an openapi value that differs, and a match that finds nothing, are E112', () => {
  const root = project();
  edit(root, 'dev/api/demo/openapi.yaml', 'tags: { type: array, maxItems: 20,', 'tags: { type: array, maxItems: 25,');
  edit(root, 'dev/data/demo/limits.yaml', 'web: [MAX_NAME]', 'web: [MAX_NAME, MAX_TITLE]');
  const m = run('limits-check.mjs', ARGS, root).json.findings.map((f) => f.message).join('\n');
  assert.match(m, /release\.tags: openapi ReleaseCreate\.tags is 25/);
  assert.match(m, /web `MAX_TITLE` matches nothing/);
});

test('no limits.yaml is an error', () => {
  const r = run('limits-check.mjs', ['other', '--root', 'dev', '--source', '.'], project());
  assert.equal(r.status, 1);
});

test('constant expressions, SQL forms and message digits', () => {
  assert.equal(evalInt('26_214_400'), 26214400);
  assert.equal(evalInt('2 << 20'), 2097152);
  assert.equal(evalInt('os.Getenv("X")'), null);
  const sql = scanSql([
    { rel: 'm/1.up.sql', text: 'CREATE TABLE t (\n  a varchar(40),\n  b text,\n  CONSTRAINT t_b_ck CHECK (char_length(b) < 51),\n  CONSTRAINT t_c_ck CHECK (cardinality(c) <= 5)\n);\n' },
    { rel: 'm/1.down.sql', text: 'CREATE TABLE t (b text CHECK (char_length(b) <= 1));' },
  ]);
  assert.deepEqual(sql.map((x) => `${x.id}=${x.value}${x.unit[0]}`).sort(), ['t.a=40c', 't.b=50c', 't.c=5i']);
  const go = scanCode([{ rel: 'internal/x/a.go', text: 'package x\nconst (\n\tMaxBody = 2 << 20\n\tQuoteLimit = 500\n\tTimeout = 30\n)\n' }]);
  assert.deepEqual(go.map((x) => `${x.id}=${x.value}`), ['x.MaxBody=2097152', 'x.QuoteLimit=500']);
  const msgs = scanMessages([{ rel: 'a.go', text: 'const A = 1\nvar NameMessage = "The name is 1 to 100 characters."\nvar OKMessage = "See REQ-012."\nvar Diag = fmt.Sprintf("at %d", n)\n' }]);
  assert.equal(msgs.length, 1);
});

// Next.js server code is TypeScript, and Prettier's singleQuote writes its strings with `'`.
test('a single-quoted message with a digit in TypeScript server code is W105; a component is not read', () => {
  const msgs = scanMessages([
    { rel: 'src/server/posts/app/validate.ts', text: "export const titleError = { message: 'The title is 1 to 120 characters.' };\nconst ok = { detail: `See REQ-012.` };\n" },
    { rel: 'src/features/posts/actions.ts', text: "'use server';\nreturn { message: `At most ${MAX} tags.` };\n" },
    { rel: 'src/features/posts/components/Form.tsx', text: "const hint = { message: 'Up to 120 characters.' };\n" },
    { rel: 'src/lib/format.ts', text: "const x = { message: 'Page 2 of 3' };\n" },
  ]);
  assert.deepEqual(msgs.map((m) => `${m.rel}:${m.line} ${m.text}`), ['src/server/posts/app/validate.ts:1 The title is 1 to 120 characters.']);
});
