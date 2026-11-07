#!/usr/bin/env node
/**
 * ui-inventory.mjs — the project's component inventory, generated, and every second implementation
 * of a kit role it can see (DEV-CONTRACTS §13.3).
 *
 * release-management named a kit and built none of it: 130 raw <button>s in 36 class sets, ten badge
 * implementations, seven hand-rolled menus, thirteen private Skeletons, six private date formatters
 * and 91 *_COPY objects. No reviewer could see that, because no file listed what existed. This one
 * does:
 *
 *   node dev/scripts/ui-inventory.mjs --project web [--ui src/components/ui] [--slug <slug>]
 *        [--out dev/ui/<slug>/components.md] [--severity <file.json>] [--json] [--dry-run]
 *
 * It writes `dev/ui/<slug>/components.md` (with --slug or --out): each primitive in components/ui,
 * its cva variants, and the files that import it; then every duplicate found outside components/ui.
 * `--dry-run` prints instead of writing. The file is derived, never gated, never hashed (§2).
 *
 * Severity per rule is `error`, `warn` or `off`, from --severity (a JSON object) over the defaults
 * below. Exit 0 no error-level finding · 1 one or more · 2 usage error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPosix, walkSource } from './lib/source.mjs';
import { findRoot } from './lib/root.mjs';

/** Each rule: what it finds, where it is allowed, and the kit part it duplicates. */
export const RULES = {
  'local-skeleton': { level: 'error', kit: 'Skeleton', why: 'a private Skeleton' },
  'badge-function': { level: 'error', kit: 'Badge / StatusBadge', why: 'a *Badge / *Chip function or a class-string helper for one' },
  'hand-rolled-menu': { level: 'error', kit: 'DropdownMenu', why: 'role="menu" outside components/ui' },
  'raw-button': { level: 'error', kit: 'Button', why: 'a raw <button className=…> outside components/ui' },
  'raw-input': { level: 'error', kit: 'Input / Checkbox / Select / Textarea', why: 'a raw <input|select|textarea className=…> outside components/ui' },
  'raw-table': { level: 'error', kit: 'DataTable', why: 'a raw <table> outside components/ui' },
  'class-constant': { level: 'error', kit: 'Button / Input variants', why: 'a local BTN / INPUT class constant' },
  'private-formatter': { level: 'error', kit: 'lib/format', why: 'date or number formatting outside lib/format' },
  'dialog-no-guard': { level: 'error', kit: 'Dialog dirty={…}', why: 'a kit Dialog holding a form, with no discard guard' },
  'form-validation': { level: 'error', kit: 'noValidate + Field + ErrorSummary', why: 'a <form> without noValidate, or without an ErrorSummary' },
  'unmarked-mutation': { level: 'error', kit: 'Button mutates pending', why: 'a submit or mutating Button not marked `mutates`' },
  'static-alert': { level: 'warn', kit: 'Notice announce / ErrorSummary', why: 'role="alert" outside components/ui' },
  'copy-object': { level: 'warn', kit: 'copy/en.ts', why: 'a *_COPY object outside the copy catalogue' },
  'copy-duplicate': { level: 'error', kit: 'copy/en.ts', why: 'the same string in two or more *_COPY objects' },
};

const DETECTORS = [
  { rule: 'local-skeleton', re: /\b(?:function|const|let)\s+(\w*Skeleton\w*)\b/g },
  // a function named for a badge whose body styles one: a class string with a colour or fill in it
  { rule: 'badge-function', re: /\b(?:export\s+)?(?:function|const)\s+(\w*(?:Badge|Chip|Pill)(?:Class|Cls|Style|Tone)?|\w*(?:badge|chip|pill)(?:Class|Cls|Style|Tone)\w*)\s*[=(]/g, body: /['"`][^'"`\n]*\b(?:bg|text|border)-[a-z]|className=\{\w*(?:Class|Cls|Style|Tone)\w*\(/ },
  { rule: 'hand-rolled-menu', re: /role\s*=\s*["'{`]*\s*(menu|menubar)\b/g },
  { rule: 'raw-button', re: /<(button)\b/g, tag: /\bclassName\s*=/ },
  { rule: 'raw-input', re: /<(input|select|textarea)\b/g, tag: /\bclassName\s*=/ },
  { rule: 'raw-table', re: /<(table)\b/g },
  { rule: 'class-constant', re: /\b(?:const|let)\s+((?:BTN|BUTTON|INPUT|FIELD)(?:_[A-Z0-9]+)*)\s*(?::[^=]+)?=/g },
  { rule: 'private-formatter', re: /\.(getUTC(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds)|toLocale(?:Date|Time)?String|toFixed)\s*\(|new\s+Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\b|\.(slice)\(\s*0\s*,\s*(?:10|16|19)\s*\)/g },
  { rule: 'copy-object', re: /\b(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_COPY)\b/g },
  // the kit's Dialog holding a form or a control, with no `dirty` prop for the discard guard
  { rule: 'dialog-no-guard', re: /<(Dialog)\b/g, check: (tag, inner) => !/\bdirty\b/.test(tag) && !/DiscardGuard|useDiscardGuard/.test(inner) && /<(?:form|input|textarea|select|Input|Textarea|Select|Field)\b/.test(inner) },
  // a form the browser validates, or one with no error summary for a failed submit
  { rule: 'form-validation', re: /<(form)\b/g, check: (tag, inner) => !/\bnoValidate\b/.test(tag) || !/\bErrorSummary\b/.test(inner) },
  { rule: 'static-alert', re: /role\s*=\s*["'{`]*\s*(alert)\b/g },
  // a submit, or a button whose handler calls a mutation (`mutate`, `mutateAsync`), not marked `mutates`
  { rule: 'unmarked-mutation', re: /<(Button)\b/g, check: (tag) => !/\bmutates\b/.test(tag) && /type\s*=\s*["']submit["']|\bmutate(?:Async)?\s*\(/.test(tag) },
];

/** The text between the opening tag at `idx` and its closing `</name>` (no nesting of the same name assumed beyond depth). */
function innerOf(text, idx, name) {
  const open = tagAt(text, idx);
  const start = idx + open.length;
  if (open.endsWith('/>')) return '';
  const re = new RegExp(`<${name}\\b|</${name}\\s*>`, 'g');
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (!depth) return text.slice(start, m.index);
  }
  return text.slice(start);
}

const SRC = (n) => /\.(tsx|jsx|ts|js)$/.test(n) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(n);
const isTestPath = (rel) => /(^|\/)(test|tests|__tests__|__mocks__|fixtures)\//.test(rel);
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/** The JSX opening tag starting at `idx`, up to its `>` at brace depth 0 (so `onClick={() => x}` is inside). */
export function tagAt(text, idx) {
  let depth = 0;
  for (let i = idx + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if ((ch === '"' || ch === "'") && depth === 0) {
      for (i += 1; i < text.length && text[i] !== ch; i += 1);
    } else if (ch === '>' && depth === 0) return text.slice(idx, i + 1);
  }
  return text.slice(idx);
}

/** Where each rule is allowed: components/ui for the kit's own parts, lib/format and copy/ for theirs. */
function allowed(rule, rel, ui) {
  if (rel.startsWith(`${ui}/`)) return rule !== 'copy-object' && rule !== 'copy-duplicate' && rule !== 'private-formatter';
  if (rule === 'private-formatter') return /(^|\/)lib\/format(\/|\.)/.test(rel);
  if (rule === 'copy-object' || rule === 'copy-duplicate') return /(^|\/)copy\//.test(rel);
  return false;
}

/** The string values of a `*_COPY = { … }` object: `[{ key, value, line }]`. */
export function copyStrings(text, start) {
  const open = text.indexOf('{', start);
  if (open === -1) return [];
  let depth = 0;
  let end = open;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (!depth) { end = i; break; } }
  }
  const body = text.slice(open, end);
  const out = [];
  for (const m of body.matchAll(/([\w$]+)\s*:\s*(?:\([^)]*\)\s*=>\s*)?(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g)) {
    out.push({ key: m[1], value: m[3].replace(/\$\{[^}]*\}/g, '{}'), line: lineOf(text, open + m.index) });
  }
  return out;
}

/** The cva variant groups and values of a kit file: `{ variant: ['primary', …], size: [...] }`. */
export function cvaVariants(text) {
  const out = {};
  const at = text.search(/\bvariants\s*:\s*\{/);
  if (at === -1) return out;
  let i = text.indexOf('{', at);
  let depth = 0;
  let end = i;
  for (; i < text.length; i += 1) {
    if (text[i] === "'" || text[i] === '"' || text[i] === '`') {
      const q = text[i];
      for (i += 1; i < text.length && text[i] !== q; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (!depth) { end = i; break; } }
  }
  const block = text.slice(text.indexOf('{', at) + 1, end);
  for (const g of block.matchAll(/([\w-]+)\s*:\s*\{([^{}]*)\}/g)) {
    out[g[1]] = [...g[2].matchAll(/(?:^|,|\n)\s*['"]?([\w-]+)['"]?\s*:/g)].map((m) => m[1]);
  }
  return out;
}

/**
 * The inventory of a project: primitives in `ui` with their exports, variants and consumers, and
 * findings outside it. Pure over the files on disk; writes nothing.
 */
export function inventory({ project, ui, severity = {} }) {
  const root = resolve(project);
  const uiRel = ui ?? ['src/components/ui', 'components/ui', 'app/components/ui'].find((c) => existsSync(join(root, c))) ?? 'src/components/ui';
  const files = walkSource(root, SRC).map((f) => ({ abs: f, rel: toPosix(root, f) })).filter((f) => !isTestPath(f.rel));
  const levels = Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, severity[k] ?? v.level]));

  const primitives = [];
  for (const f of files.filter((x) => x.rel.startsWith(`${uiRel}/`))) {
    const text = readFileSync(f.abs, 'utf8');
    const exports = [...text.matchAll(/export\s+(?:const|function|class)\s+([A-Z]\w*)/g)].map((m) => m[1]);
    if (!exports.length) continue;
    primitives.push({ file: f.rel, name: basename(f.rel).replace(/\.\w+$/, ''), exports, variants: cvaVariants(text), consumers: [] });
  }

  const findings = [];
  const copies = [];
  for (const f of files) {
    const text = readFileSync(f.abs, 'utf8');
    for (const p of primitives) {
      if (f.rel === p.file) continue;
      const stem = p.file.replace(/\.\w+$/, '').split('/').pop();
      if (new RegExp(`from\\s+['"][^'"]*(?:components/ui|/ui|\\.)/${stem}['"]`).test(text)) p.consumers.push(f.rel);
    }
    for (const d of DETECTORS) {
      if (levels[d.rule] === 'off' || allowed(d.rule, f.rel, uiRel)) continue;
      d.re.lastIndex = 0;
      for (const m of text.matchAll(d.re)) {
        if (d.tag && !d.tag.test(tagAt(text, m.index))) continue;
        if (d.body && !d.body.test(text.slice(m.index, m.index + 600))) continue;
        if (d.check && !d.check(tagAt(text, m.index), innerOf(text, m.index, m[1]))) continue;
        const what = m.slice(1).find(Boolean) ?? m[0];
        findings.push({ rule: d.rule, level: levels[d.rule], file: f.rel, line: lineOf(text, m.index), what });
        if (d.rule === 'copy-object') copies.push(...copyStrings(text, m.index).map((c) => ({ ...c, file: f.rel, block: what })));
      }
    }
  }
  if (levels['copy-duplicate'] !== 'off') {
    const byValue = new Map();
    for (const c of copies) {
      if (!c.value.trim()) continue;
      const k = c.value.trim();
      if (!byValue.has(k)) byValue.set(k, []);
      byValue.get(k).push(c);
    }
    for (const [value, list] of byValue) {
      const blocks = new Set(list.map((c) => `${c.file}#${c.block}`));
      if (blocks.size < 2) continue;
      findings.push({ rule: 'copy-duplicate', level: levels['copy-duplicate'], file: list[0].file, line: list[0].line, what: `"${value.length > 60 ? `${value.slice(0, 57)}…` : value}" ×${list.length} in ${blocks.size} objects` });
    }
  }
  return { ui: uiRel, primitives, findings, copyStrings: copies.length };
}

/** Counts per rule, and the distinct names per rule (e.g. the 13 Skeleton copies are 13 findings). */
export function summary(findings) {
  const by = {};
  for (const f of findings) by[f.rule] = (by[f.rule] ?? 0) + 1;
  return by;
}

export function renderMarkdown(inv, { slug, project }) {
  const L = [];
  L.push(`<!-- GENERATED by dev/scripts/ui-inventory.mjs — do not edit; re-run it (DEV-CONTRACTS §2, §13.3) -->`);
  L.push(`# Component inventory — ${slug ?? project}`, '');
  L.push(`Kit directory: \`${inv.ui}\` · ${inv.primitives.length} primitive file(s) · ${inv.findings.length} finding(s) outside it.`, '');
  L.push('## Primitives', '');
  L.push('| Primitive | Exports | Variants | Consumers |', '|---|---|---|---|');
  for (const p of inv.primitives.sort((a, b) => a.name.localeCompare(b.name))) {
    const v = Object.entries(p.variants).map(([g, vals]) => `${g}: ${vals.join(', ')}`).join('; ') || '—';
    L.push(`| \`${p.name}\` | ${p.exports.map((e) => `\`${e}\``).join(', ')} | ${v} | ${p.consumers.length} |`);
  }
  L.push('', '## Second implementations', '');
  const by = summary(inv.findings);
  L.push('| Rule | Level | Count | Use instead |', '|---|---|---|---|');
  for (const [rule, r] of Object.entries(RULES)) {
    const n = by[rule] ?? 0;
    if (!n) continue;
    const lvl = inv.findings.find((f) => f.rule === rule)?.level ?? r.level;
    L.push(`| ${r.why} | ${lvl} | ${n} | ${r.kit} |`);
  }
  if (!inv.findings.length) L.push('| none | — | 0 | — |');
  L.push('', '## Where', '');
  for (const f of inv.findings) L.push(`- \`${f.file}:${f.line}\` ${f.rule} — ${f.what}`);
  if (!inv.findings.length) L.push('None.');
  L.push('');
  return L.join('\n');
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const project = argFor(argv, '--project');
  if (!project || !existsSync(project)) {
    console.error('usage: ui-inventory.mjs --project <dir> [--ui <components/ui>] [--slug <slug> | --out <components.md>] [--severity <json>] [--json] [--dry-run]');
    return 2;
  }
  const sevPath = argFor(argv, '--severity');
  const severity = sevPath ? JSON.parse(readFileSync(sevPath, 'utf8')) : {};
  const bad = Object.entries(severity).filter(([k, v]) => !RULES[k] || !['error', 'warn', 'off'].includes(v));
  if (bad.length) {
    console.error(`ui-inventory: unknown rule or level in ${sevPath}: ${bad.map(([k, v]) => `${k}=${v}`).join(', ')} — rules: ${Object.keys(RULES).join(', ')}; levels: error, warn, off`);
    return 2;
  }
  const inv = inventory({ project, ui: argFor(argv, '--ui'), severity });
  const slug = argFor(argv, '--slug');
  const out = argFor(argv, '--out') ?? (slug ? join(findRoot().root, 'ui', slug, 'components.md') : null);
  if (argv.includes('--json')) console.log(JSON.stringify({ ...inv, summary: summary(inv.findings) }, null, 2));
  else {
    const md = renderMarkdown(inv, { slug, project });
    if (out && !argv.includes('--dry-run')) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, md);
      console.log(`ui-inventory: wrote ${toPosix('.', resolve(out))}`);
    } else if (argv.includes('--dry-run')) console.log(md);
    const by = summary(inv.findings);
    console.log(`ui-inventory: ${inv.primitives.length} primitive(s) in ${inv.ui} · ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(' · ') || 'no second implementations'}`);
  }
  return inv.findings.some((f) => f.level === 'error') ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
