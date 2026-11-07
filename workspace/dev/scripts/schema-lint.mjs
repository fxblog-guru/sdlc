#!/usr/bin/env node
/**
 * schema-lint.mjs — the migrations against the §13.2 DB naming row (DEV-CONTRACTS §13.2, §13.11).
 *
 * Reads every `*.up.sql` in name order (PostgreSQL syntax) and checks:
 *   E119  constraint and index names: `{table}_{cols}_{pk|fk|uq|ck|idx}`. A `_uq` must be a UNIQUE
 *         constraint, every index ends `_idx`; the name starts with the table; an inline,
 *         unnamed constraint (`id uuid PRIMARY KEY`, `REFERENCES x`, `UNIQUE`, `CHECK (…)`) gets
 *         a server-chosen name and is an error. `_ck` and `_fk` names may say what they check
 *         (`release_name_len_ck`); `_pk` and `_uq` names list their columns.
 *   W111  a table without `created_at timestamptz NOT NULL DEFAULT now()`
 *   W112  a table with neither `updated_at` nor a `-- Append-only` comment above it
 *   W113  `CREATE TYPE … AS ENUM` — enums are a named CHECK (col IN (…))
 *
 *   node dev/scripts/schema-lint.mjs [--migrations migrations] [--source .] [--json]
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, report, parseArgs, readSources, lineAt } from './lib/check.mjs';

const SUFFIX = /_(pk|fk|uq|ck|idx)$/;

/** Split SQL into statements, keeping each one's start offset and the comment lines just above. */
export function statements(text) {
  const out = [];
  let i = 0;
  let start = 0;
  let depth = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') { const j = text.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'") { i++; while (i < n && !(text[i] === "'" && text[i + 1] !== "'")) i += text[i] === "'" ? 2 : 1; i++; continue; }
    if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (tag) { const j = text.indexOf(tag[0], i + tag[0].length); i = j < 0 ? n : j + tag[0].length; continue; }
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth <= 0) { out.push({ sql: text.slice(start, i), at: start }); start = i + 1; }
    i++;
  }
  if (text.slice(start).trim()) out.push({ sql: text.slice(start), at: start });
  return out.map((s) => {
    const lead = /^\s*/.exec(s.sql)[0].length;
    const sql = s.sql.slice(lead);
    const comments = (/^(?:\s*--[^\n]*\n)+/.exec(sql)?.[0] ?? '');
    return { sql, at: s.at + lead, comments, body: sql.slice(comments.length).replace(/--[^\n]*/g, (m) => ' '.repeat(m.length)) };
  }).filter((s) => s.body.trim());
}

/** Top-level comma split inside the parentheses of CREATE TABLE. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let q = false;
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}

const cols = (list) => list.split(',').map((c) => c.trim().replace(/"/g, '').replace(/\s+(ASC|DESC|NULLS\s+\w+).*$/i, '').replace(/\(.*$/, '').toLowerCase()).filter(Boolean);

/** Check one constraint or index name. */
export function nameProblem(name, { table, kind, columns = [] }) {
  const want = { 'PRIMARY KEY': 'pk', 'FOREIGN KEY': 'fk', UNIQUE: 'uq', CHECK: 'ck', EXCLUDE: 'ck', INDEX: 'idx', 'UNIQUE INDEX': 'idx' }[kind];
  const sfx = SUFFIX.exec(name)?.[1];
  if (!sfx) return `\`${name}\` ends in none of _pk, _fk, _uq, _ck, _idx`;
  if (want && sfx !== want) return `\`${name}\` is a ${kind.toLowerCase()} and ends in _${sfx}, not _${want}`;
  if (!name.startsWith(`${table}_`)) return `\`${name}\` does not start with its table \`${table}_\``;
  if ((sfx === 'pk' || sfx === 'uq' || sfx === 'idx') && columns.length) {
    const mid = name.slice(table.length + 1, -(sfx.length + 1));
    const expected = columns.join('_');
    // The leading columns are enough (identifiers stop at 63 characters); a qualifier may follow
    // the full list (`account_email_ci_uq` is not one, `release_project_id_open_idx` for a partial is).
    const prefixes = columns.map((_, i) => columns.slice(0, i + 1).join('_'));
    if (!prefixes.includes(mid) && !mid.startsWith(`${expected}_`)) return `\`${name}\` should list its columns: \`${table}_${expected}_${sfx}\``;
  }
  return null;
}

export function lint(files, findings = new Findings()) {
  const tables = new Map(); // name → { rel, line, created, updated, appendOnly }
  let constraints = 0;
  let indexes = 0;
  const sorted = [...files].sort((a, b) => basename(a.rel).localeCompare(basename(b.rel)));
  for (const f of sorted) {
    for (const st of statements(f.text)) {
      const line = lineAt(f.text, st.at + st.comments.length);
      const b = st.body;
      const enumType = /^CREATE\s+TYPE\s+("?[\w.]+"?)\s+AS\s+ENUM/i.exec(b);
      if (enumType) findings.add('W113', f.rel, line, `${enumType[1]}: an enum is a named CHECK (col IN (…)), not CREATE TYPE … AS ENUM`);

      const ct = /^CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s*\(([\s\S]*)\)\s*(?:PARTITION[\s\S]*|INHERITS[\s\S]*|WITH[\s\S]*)?$/i.exec(b.trim());
      if (ct) {
        const table = ct[1].toLowerCase();
        const t = { rel: f.rel, line, created: false, updated: false, version: false, appendOnly: /append[- ]only/i.test(st.comments) };
        tables.set(table, t);
        for (const part of splitTop(ct[2])) {
          const named = /^CONSTRAINT\s+"?(\w+)"?\s+(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\s*(?:\(([^)]*)\))?/i.exec(part);
          if (named) {
            constraints++;
            const kind = named[2].toUpperCase().replace(/\s+/g, ' ');
            const p = nameProblem(named[1].toLowerCase(), { table, kind, columns: kind === 'CHECK' ? [] : cols(named[3] ?? '') });
            if (p) findings.add('E119', f.rel, line, p);
            continue;
          }
          const tableLevel = /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/i.exec(part);
          if (tableLevel) { constraints++; findings.add('E119', f.rel, line, `${table}: an unnamed ${tableLevel[1].toUpperCase()} — name it CONSTRAINT ${table}_<cols>_<suffix>`); continue; }
          const col = /^"?(\w+)"?\s+([\s\S]*)$/.exec(part);
          if (!col) continue;
          const [, name, rest] = col;
          const lname = name.toLowerCase();
          if (lname === 'created_at') t.created = /timestamptz|timestamp\s+with\s+time\s+zone/i.test(rest) && /NOT\s+NULL/i.test(rest) && /DEFAULT\s+(now\(\)|current_timestamp|clock_timestamp\(\))/i.test(rest);
          if (lname === 'updated_at') t.updated = true;
          if (lname === 'version') t.version = true;
          const inline = rest.replace(/CONSTRAINT\s+\w+\s+(PRIMARY\s+KEY|UNIQUE|CHECK|REFERENCES)/gi, '').match(/\b(PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK\s*\()/gi);
          for (const k of inline ?? []) { constraints++; findings.add('E119', f.rel, line, `${table}.${lname}: an inline, unnamed ${k.replace(/\s*\($/, '').toUpperCase()} — the server names it (${table}_pkey…); declare CONSTRAINT ${table}_${lname}_<suffix>`); }
        }
        continue;
      }

      const ix = /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:ONLY\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s*(?:USING\s+\w+\s*)?\(([\s\S]*?)\)(?:\s+(?:INCLUDE|WHERE|WITH)[\s\S]*)?$/i.exec(b.trim());
      if (ix) {
        indexes++;
        const p = nameProblem(ix[2].toLowerCase(), { table: ix[3].toLowerCase(), kind: ix[1] ? 'UNIQUE INDEX' : 'INDEX', columns: cols(ix[4]).filter((c) => /^\w+$/.test(c)) });
        if (p) findings.add('E119', f.rel, line, p);
        continue;
      }
      const unnamedIx = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?ON\s/i.test(b.trim());
      if (unnamedIx) { indexes++; findings.add('E119', f.rel, line, 'an unnamed index — name it {table}_{cols}_idx'); continue; }

      const alter = /^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?\s+([\s\S]*)$/i.exec(b.trim());
      if (alter) {
        const table = alter[1].toLowerCase();
        for (const m of alter[2].matchAll(/ADD\s+CONSTRAINT\s+"?(\w+)"?\s+(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\s*(?:\(([^)]*)\))?/gi)) {
          constraints++;
          const kind = m[2].toUpperCase().replace(/\s+/g, ' ');
          const p = nameProblem(m[1].toLowerCase(), { table, kind, columns: kind === 'CHECK' ? [] : cols(m[3] ?? '') });
          if (p) findings.add('E119', f.rel, line, p);
        }
        for (const m of alter[2].matchAll(/RENAME\s+CONSTRAINT\s+"?\w+"?\s+TO\s+"?(\w+)"?/gi)) {
          if (!SUFFIX.test(m[1])) findings.add('E119', f.rel, line, `\`${m[1]}\` ends in none of _pk, _fk, _uq, _ck, _idx`);
        }
        const t = tables.get(table);
        if (t) {
          for (const m of alter[2].matchAll(/ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+([^,]*)/gi)) {
            const c = m[1].toLowerCase();
            if (c === 'updated_at') t.updated = true;
            if (c === 'version') t.version = true;
            if (c === 'created_at') t.created = /timestamptz/i.test(m[2]) && /NOT\s+NULL/i.test(m[2]) && /DEFAULT/i.test(m[2]);
          }
          for (const m of alter[2].matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi)) {
            if (m[1].toLowerCase() === 'updated_at') t.updated = false;
          }
        }
        continue;
      }
      const drop = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?\w+"?\.)?"?(\w+)"?/i.exec(b.trim());
      if (drop) tables.delete(drop[1].toLowerCase());
      const rename = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+RENAME\s+TO\s+"?(\w+)"?/i.exec(b.trim());
      if (rename && tables.has(rename[1].toLowerCase())) { tables.set(rename[2].toLowerCase(), tables.get(rename[1].toLowerCase())); tables.delete(rename[1].toLowerCase()); }
    }
  }
  let noCreated = 0;
  let noUpdated = 0;
  for (const [table, t] of tables) {
    if (table === 'schema_migrations') continue;
    if (!t.created) { noCreated++; findings.add('W111', t.rel, t.line, `${table}: no created_at timestamptz NOT NULL DEFAULT now()`); }
    if (!t.updated && !t.appendOnly) { noUpdated++; findings.add('W112', t.rel, t.line, `${table}: no updated_at, and no "-- Append-only" comment saying rows are never updated`); }
  }
  return {
    findings,
    summary: {
      'migration files': files.length,
      tables: tables.size,
      constraints,
      indexes,
      'tables without created_at': noCreated,
      'tables without updated_at or append-only': noUpdated,
      'tables with version': [...tables.values()].filter((t) => t.version).length,
    },
  };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const dir = resolve(a.migrations ?? (a.source ? resolve(a.source, 'migrations') : 'migrations'));
  if (!existsSync(dir)) {
    // A repository with no schema yet has nothing to lint; a wrong --migrations is a usage error.
    if (a.migrations) { console.error(`no migrations directory at ${dir}`); return 2; }
    console.log(`schema-lint: no migrations/ directory — nothing to check (use --migrations <dir>)`);
    return 0;
  }
  const files = readSources(dir, (n) => n.endsWith('.up.sql'), { skipDev: false });
  const { findings, summary } = lint(files);
  return report('schema-lint', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
