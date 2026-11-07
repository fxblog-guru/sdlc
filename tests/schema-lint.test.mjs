/**
 * schema-lint.mjs: the migrations against the §13.2 DB naming row (DEV-CONTRACTS §13.11).
 *
 * release-management used _ck/_fk/_uq but _pkey, _uq for both constraints and indexes, and had
 * created_at on 14 of 44 tables; updated_at on 3 and version on 11. Each table was reviewed alone.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, run } from './backend-fixture.mjs';
import { nameProblem, statements, lint } from '../workspace/dev/scripts/schema-lint.mjs';

test('the valid fixture passes clean', () => {
  const r = run('schema-lint.mjs', [], project());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary.tables, 2);
});

test('the broken overlay: inline constraints, wrong suffixes, a stray index name, enum type, no timestamps', () => {
  const r = run('schema-lint.mjs', [], project({ broken: true }));
  assert.equal(r.status, 1);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E119 note\.id: an inline, unnamed PRIMARY KEY/);
  assert.match(m, /E119 note\.release_id: an inline, unnamed REFERENCES/);
  assert.match(m, /E119 `note_body_check` ends in none of/);
  assert.match(m, /E119 `note_release_id_uq` is a unique index and ends in _uq, not _idx/);
  assert.match(m, /E119 `notes_by_release` ends in none of/);
  assert.match(m, /W113 note_kind/);
  assert.match(m, /W111 note: no created_at/);
  assert.match(m, /W112 note: no updated_at/);
});

test('name rules', () => {
  assert.equal(nameProblem('release_id_pk', { table: 'release', kind: 'PRIMARY KEY', columns: ['id'] }), null);
  assert.match(nameProblem('release_pkey', { table: 'release', kind: 'PRIMARY KEY', columns: ['id'] }), /none of/);
  assert.match(nameProblem('release_pk', { table: 'release', kind: 'PRIMARY KEY', columns: ['id'] }), /should list its columns/);
  assert.equal(nameProblem('release_name_len_ck', { table: 'release', kind: 'CHECK' }), null);
  assert.equal(nameProblem('release_project_id_created_at_idx', { table: 'release', kind: 'INDEX', columns: ['project_id', 'created_at', 'id'] }), null);
  assert.match(nameProblem('activity_log_project_idx', { table: 'activity_log_entry', kind: 'INDEX', columns: ['project_id'] }), /start with its table/);
});

test('statements survive strings, dollar quotes and comments', () => {
  const s = statements("-- a;\nCREATE TABLE a (b text DEFAULT ';');\nDO $$ BEGIN PERFORM 1; END $$;\n/* x; */ SELECT 1;");
  assert.equal(s.length, 3);
  assert.match(s[0].comments, /-- a;/);
});

test('a later ALTER adds updated_at, and an append-only comment exempts the table', () => {
  const { findings } = lint([
    { rel: '1.up.sql', text: 'CREATE TABLE a (id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT a_id_pk PRIMARY KEY (id));\n-- Append-only.\nCREATE TABLE b (id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT b_id_pk PRIMARY KEY (id));' },
    { rel: '2.up.sql', text: 'ALTER TABLE a ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();' },
  ]);
  assert.deepEqual(findings.list, []);
});
