#!/usr/bin/env node
/**
 * copy-lint.mjs — one copy catalogue, written one way (DEV-CONTRACTS §13.3).
 *
 * release-management's copy.ts had four keys; the real copy was 1,369 strings in 91 *_COPY objects,
 * "Cancel" thirty times, five wordings of the 412 message, E-mail and e-mail, GO / NO GO and go/no-go,
 * Delete and Remove for the same act, contractions in some places and not others. This lints the
 * catalogue and the screens against the copy style guide (dev-defining-design-system/copy-style.md):
 *
 *   node dev/scripts/copy-lint.mjs --project web [--catalogue src/copy/en.ts] [--glossary dev/glossary.md]
 *        [--src src] [--json]
 *
 * In the catalogue:   key-shape (`{area}.{screen}.{element}`, or common./errors.) · duplicate (one value
 *                     under two keys) · contraction · title-case · empty-punctuation (an empty-state
 *                     sentence ends with a full stop; a title does not) · glossary (a banned synonym)
 * In the screens:     literal (text between JSX tags, or a literal aria-label / title / placeholder /
 *                     alt / label attribute, outside the catalogue and tests)
 *
 * The glossary is any markdown table with a `Term` column and a `Not` column (banned synonyms,
 * comma-separated), such as `dev/glossary.md`; found automatically at <project>/../dev/glossary.md or
 * <project>/dev/glossary.md. No glossary, no glossary rule.
 *
 * Exit 0 clean · 1 findings · 2 usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPosix, walkSource } from './lib/source.mjs';
import { ROOT_NAMES } from './lib/root.mjs';

// ---------------------------------------------------------------------------------------------
// The catalogue: a nested object literal of strings, read without executing it
// ---------------------------------------------------------------------------------------------

/** Every leaf string of the first object literal after `start`: `[{ key: 'a.b.c', value, line }]`. */
export function catalogueEntries(text) {
  const start = text.search(/=\s*\{/);
  if (start === -1) return [];
  const out = [];
  const path = [];
  let pendingKey = null;
  let i = text.indexOf('{', start);
  const lineAt = (k) => text.slice(0, k).split('\n').length;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i === -1) break; continue; }
    if (ch === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === '{') { path.push(pendingKey); pendingKey = null; continue; }
    if (ch === '}') { path.pop(); if (!path.length) break; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      for (; j < text.length && text[j] !== ch; j += 1) if (text[j] === '\\') j += 1;
      const lit = text.slice(i + 1, j);
      const after = /^\s*(\S)/.exec(text.slice(j + 1, j + 4))?.[1];
      if (after === ':') pendingKey = lit;
      else if (pendingKey !== null) {
        out.push({ key: [...path.filter((p) => p !== null), pendingKey].join('.'), value: lit, line: lineAt(i) });
        pendingKey = null;
      }
      i = j;
      continue;
    }
    const ident = /^([A-Za-z_$][\w$]*)\s*:/.exec(text.slice(i, i + 80));
    if (ident && /[\s{,]/.test(text[i - 1])) { pendingKey = ident[1]; i += ident[0].length - 1; continue; }
    if (ch === ',') pendingKey = null;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The glossary
// ---------------------------------------------------------------------------------------------

/** `[{ term, not: [banned…], line }]` from every table with a Term and a Not column. */
export function readGlossary(md) {
  const out = [];
  let headers = null;
  md.replace(/\r\n?/g, '\n').split('\n').forEach((raw, idx) => {
    const l = raw.trim();
    if (!l.startsWith('|')) { headers = null; return; }
    const cells = l.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); return; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) return;
    const ti = headers.findIndex((h) => /^term/.test(h));
    const ni = headers.findIndex((h) => /^(not|avoid|banned|never)/.test(h));
    if (ti === -1 || ni === -1) return;
    const not = (cells[ni] ?? '').split(/[,;·]/).map((s) => s.trim()).filter((s) => s && !/^[—–-]$/.test(s) && !/^n\/?a$/i.test(s));
    if (cells[ti]) out.push({ term: cells[ti], not, line: idx + 1 });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

const KEY = /^(?:common|errors)\.[a-z][\w]*(?:\.[a-z][\w]*)*$|^[a-z][\w-]*\.[a-z][\w-]*\.[a-z][\w]*(?:\.[a-z][\w]*)*$/;
/** Contractions of English auxiliaries; "it's", "don't", "can't", "you'll", "we've", "they're". */
const CONTRACTION = /\b(?:[A-Za-z]+n't|(?:it|that|there|here|what|who|he|she|let)'s|(?:I|you|we|they)'(?:re|ve|ll|d)|I'm|(?:he|she|it)'(?:ll|d))\b/i;
/** Short words left lower-case in Title Case, so "Discard Your Changes" is caught and "Sign in" is not. */
const MINOR = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'from', 'as', 'is', 'per', 'via', 'vs']);

/** Title Case: three or more words, and every non-minor word after the first is capitalised. */
export function isTitleCase(s) {
  // a label list ("MUST FIX · Critical 3 · High 1") is several short phrases, each judged alone
  const parts = s.replace(/\$?\{[^}]*\}/g, ' ').split(/\s[·|—–:]\s/);
  if (parts.length > 1) return parts.some((p) => isTitleCase(p));
  const words = s.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < 3) return false;
  const rest = words.slice(1).filter((w) => !MINOR.has(w.toLowerCase()));
  if (rest.length < 2) return false;
  // all-caps words are acronyms (PDF, GO), not evidence of Title Case
  const judged = rest.filter((w) => !/^[A-Z0-9]{2,}$/.test(w.replace(/[^\w]/g, '')));
  return judged.length >= 2 && judged.every((w) => /^[A-Z]/.test(w));
}

export function lintCatalogue(entries, glossary = []) {
  const out = [];
  const add = (rule, e, message) => out.push({ rule, file: e.file ?? null, line: e.line, key: e.key, message });
  const byValue = new Map();
  for (const e of entries) {
    if (!e.outside && !KEY.test(e.key)) add('key-shape', e, `\`${e.key}\` is not {area}.{screen}.{element} (or common.* / errors.*)`);
    const v = e.value.trim();
    if (v) {
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v).push(e);
    }
    if (CONTRACTION.test(v)) add('contraction', e, `"${v}" uses a contraction (${CONTRACTION.exec(v)[0]}) — write it out`);
    if (isTitleCase(v)) add('title-case', e, `"${v}" is Title Case — use sentence case`);
    const last = e.key.split('.').pop();
    if (/(^|\.)empty(\.|$)/i.test(e.key) || /^empty/i.test(last)) {
      const isTitle = /title|heading/i.test(last);
      if (isTitle && /[.!]$/.test(v)) add('empty-punctuation', e, `the empty-state title "${v}" ends with punctuation — a title does not`);
      if (!isTitle && v && !/[.?]$/.test(v) && /\s/.test(v)) add('empty-punctuation', e, `the empty-state sentence "${v}" does not end with a full stop`);
    }
    for (const g of glossary) {
      for (const bad of g.not) {
        const re = new RegExp(`(^|[^\\w-])${bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\w-])`, /[A-Z]/.test(bad) ? '' : 'i');
        if (re.test(v)) {
          add('glossary', e, `"${v}" says "${bad}" — the glossary term is "${g.term}"`);
          break; // one finding per term, however many of its banned spellings match
        }
      }
    }
  }
  for (const [v, list] of byValue) {
    if (list.length < 2) continue;
    for (const e of list.slice(1)) add('duplicate', e, `"${v}" is also \`${list[0].key}\` — one string, one key (use the common.* key)`);
  }
  return out;
}

const ATTR = /\b(aria-label|title|placeholder|alt|label)\s*=\s*"([^"{}]*[A-Za-z][^"{}]*)"/g;

/** Literal user-facing text in a TSX/JSX file: text between tags, and literal text attributes. */
export function literalsIn(text) {
  const out = [];
  const lineAt = (k) => text.slice(0, k).split('\n').length;
  // JSX text: after a JSX tag closes (`<Tag …>`, `</Tag>`, `<>`) and before the next `<` or `{`.
  // A TypeScript generic (`Promise<Paged>`, `Record<string, X>`) is not a tag: a tag's name follows
  // `<` at the start of an expression, after `(`, `return`, `=>`, `?`, `:`, `&&` or another tag.
  for (const m of text.matchAll(/(<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*?)?>|<>)([^<>{}]*[A-Za-z][^<>{}]*)(?=[<{])/g)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const tag = m[1];
    if (!tag.startsWith('</') && tag !== '<>' && !/(?:^|[\s(,?:]|return|=>|&&|\|\||>)\s*$/.test(before)) continue;
    if (/[=]\s*$/.test(before) && !/=>\s*$/.test(before)) continue; // `x = <T>` is a type assertion
    const s = m[2].replace(/\s+/g, ' ').trim();
    if (!s || /^&[a-z]+;$/.test(s)) continue;
    if (/[;=]|\)\s*:|^[,)|&]|\b(?:return|const|function|import|export|void|string|number|boolean)\b/.test(s)) continue;
    out.push({ rule: 'literal', line: lineAt(m.index + m[1].length), value: s });
  }
  for (const m of text.matchAll(ATTR)) {
    if (/^[\w-]+$/.test(m[2]) && m[1] !== 'aria-label' && m[1] !== 'title' && m[1] !== 'placeholder' && m[1] !== 'alt') continue;
    out.push({ rule: 'literal', line: lineAt(m.index), value: `${m[1]}="${m[2]}"` });
  }
  return out;
}

export function findGlossary(project) {
  for (const p of [...ROOT_NAMES.flatMap((n) => [join(project, '..', n, 'glossary.md'), join(project, n, 'glossary.md')]), join(project, 'glossary.md')]) if (existsSync(p)) return p;
  return null;
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function copyLint({ project, catalogue, glossary, src }) {
  const root = resolve(project);
  const cat = catalogue ? resolve(root, catalogue) : ['src/copy/en.ts', 'copy/en.ts', 'src/lib/copy.ts', 'src/copy.ts'].map((f) => join(root, f)).find((f) => existsSync(f));
  const gPath = glossary ? resolve(glossary) : findGlossary(root);
  const terms = gPath ? readGlossary(readFileSync(gPath, 'utf8')) : [];
  const findings = [];
  let entries = [];
  if (cat) entries = catalogueEntries(readFileSync(cat, 'utf8')).map((e) => ({ ...e, file: toPosix(root, cat) }));
  else findings.push({ rule: 'no-catalogue', file: null, line: 0, message: 'no copy catalogue (src/copy/en.ts) — copy the kit\'s copy/en.ts' });
  const srcDir = resolve(root, src ?? (existsSync(join(root, 'src')) ? 'src' : '.'));
  // Copy that lives outside the catalogue (`*_COPY = { … }` objects) is held to the same content
  // rules — duplicates across the two count — but not to the key shape; ui-inventory reports the objects.
  let outside = 0;
  for (const f of walkSource(srcDir, (n) => /\.(tsx?|jsx?)$/.test(n) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(n))) {
    if (cat && resolve(f) === resolve(cat)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*_COPY)\b[^=]*=\s*/g)) {
      const lineBase = text.slice(0, m.index).split('\n').length - 1;
      const found = catalogueEntries(text.slice(m.index)).map((e) => ({ ...e, key: `${m[1]}.${e.key}`, line: e.line + lineBase, file: toPosix(root, f), outside: true }));
      outside += found.length;
      entries.push(...found);
    }
  }
  findings.push(...lintCatalogue(entries, terms));
  const files = walkSource(srcDir, (n) => /\.(tsx|jsx)$/.test(n) && !/\.(test|spec|stories)\./.test(n)).filter((f) => !/(^|\/)(test|tests|__tests__|copy)\//.test(toPosix(srcDir, f)));
  for (const f of files) {
    for (const l of literalsIn(readFileSync(f, 'utf8'))) findings.push({ rule: 'literal', file: toPosix(root, f), line: l.line, message: `literal text ${JSON.stringify(l.value)} — put it in the copy catalogue` });
  }
  return { catalogue: cat ? toPosix(root, cat) : null, glossary: gPath, terms: terms.length, entries: entries.length - outside, outside, files: files.length, findings };
}

function main(argv) {
  const project = argFor(argv, '--project');
  if (!project || !existsSync(project)) {
    console.error('usage: copy-lint.mjs --project <dir> [--catalogue <en.ts>] [--glossary <glossary.md>] [--src <dir>] [--json]');
    return 2;
  }
  const r = copyLint({ project, catalogue: argFor(argv, '--catalogue'), glossary: argFor(argv, '--glossary'), src: argFor(argv, '--src') });
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    for (const f of r.findings) console.log(`${f.file ?? '-'}:${f.line}  ${f.rule.padEnd(17)} ${f.message}`);
    const by = {};
    for (const f of r.findings) by[f.rule] = (by[f.rule] ?? 0) + 1;
    console.log(`copy-lint: ${r.catalogue ?? 'no catalogue'} · ${r.entries} key(s) · ${r.outside} string(s) in *_COPY objects · ${r.files} screen file(s) · glossary ${r.glossary ? `${r.terms} term(s)` : 'none'} · ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(' · ') || 'clean'}`);
  }
  return r.findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
