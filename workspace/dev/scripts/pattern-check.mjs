#!/usr/bin/env node
/**
 * pattern-check.mjs — every component a pattern obligation matches uses the wrapper it requires (DEV-CONTRACTS §13.3).
 *
 * release-management had a DiscardGuard and a ui-spec that said "every dialog with input asks
 * Discard changes?". Five dialogs shipped without it, and the G7 re-review found three more in the
 * fix. The rule was written once and checked by eye. This turns it into a grep a gate can fail on.
 *
 *   node dev/scripts/pattern-check.mjs <slug> [--root dev] [--src <dir>] [--config <file>] [--json]
 *
 * The obligations come from `dev/ui/<slug>/patterns.yaml`, or else from a fenced yaml block in
 * `dev/ui/<slug>/ui-spec.md` that starts with `obligations:`. Each one:
 *
 *   obligations:
 *     - id: PO-001
 *       rule: every dialog with inputs uses the discard guard
 *       files: [web/src/**\/*.tsx]                 # globs, relative to --src
 *       exclude: ["**\/*.test.tsx", web/src/components/DiscardGuard.tsx]
 *       match: ['<Dialog\b', '<Sheet\b']           # a file is a candidate when ANY matches …
 *       when: ['<Input\b', '<Textarea\b']          # … and, if given, ANY of these does too
 *       require: [useDiscardGuard, DiscardBar]     # it complies when ANY of these appears
 *
 * Patterns are JavaScript regular expressions over the whole file. Write them in single quotes,
 * where YAML keeps a backslash literal; inside double quotes a backslash escapes as in JSON, so a
 * word boundary is doubled there. A file opts out of one
 * obligation with a recorded reason, `pattern-ok: PO-001 <why>`, in a comment; a bare marker with
 * no reason does not count.
 *
 * Exit 0 every candidate complies · 1 a violation · 2 usage error or no obligations.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { walkCode } from './lib/code.mjs';
import { findRoot } from './lib/root.mjs';

const KEYS = ['id', 'rule', 'files', 'exclude', 'match', 'when', 'require'];

function scalar(v) {
  const t = v.trim();
  if (/^".*"$/.test(t)) return JSON.parse(t);
  if (/^'.*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  return t.replace(/\s+#.*$/, '');
}

function flow(v) {
  const inner = v.trim().replace(/\s+#[^\]]*$/, '').slice(1, -1);
  const items = [];
  let buf = '';
  let q = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (q) {
      buf += ch;
      if (ch === '\\' && q === '"') { buf += inner[i + 1] ?? ''; i += 1; } else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") { q = ch; buf += ch; } else if (ch === ',') { items.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) items.push(buf);
  return items.map((s) => scalar(s)).filter((s) => s !== '');
}

/**
 * The YAML subset obligations are written in: `obligations:` then a list of maps whose values are
 * scalars, flow lists (`[a, "b"]`) or block lists (`- a`). Anything else is an error naming the
 * line, never a silent skip.
 */
export function parseObligations(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let started = false;
  let itemIndent = null;
  let cur = null;
  let listKey = null;
  const set = (k, v, n) => {
    if (!KEYS.includes(k)) throw new Error(`line ${n}: unknown key \`${k}\` — allowed: ${KEYS.join(', ')}`);
    const t = v.trim();
    listKey = null;
    if (t === '') { cur[k] = []; listKey = k; } else cur[k] = t.startsWith('[') ? flow(t) : scalar(t);
  };
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    if (!started) {
      if (!/^obligations:\s*$/.test(raw)) throw new Error(`line ${n}: expected \`obligations:\``);
      started = true;
      return;
    }
    const dash = /^(\s*)-\s+(.*)$/.exec(raw);
    if (dash && (itemIndent === null || dash[1].length === itemIndent)) {
      const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(dash[2]);
      if (!kv) throw new Error(`line ${n}: an obligation starts with \`- id: PO-NNN\``);
      itemIndent = dash[1].length;
      cur = {};
      out.push(cur);
      set(kv[1], kv[2], n);
      return;
    }
    if (dash && cur && listKey) { cur[listKey].push(scalar(dash[2])); return; }
    const kv = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (kv && cur) { set(kv[1], kv[2], n); return; }
    throw new Error(`line ${n}: cannot read \`${raw.trim()}\``);
  });
  return out.map(normalise);
}

const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function normalise(o) {
  const ob = { id: o.id, rule: o.rule ?? '', files: asList(o.files), exclude: asList(o.exclude), match: asList(o.match), when: asList(o.when), require: asList(o.require) };
  if (!/^PO-\d{3,}$/.test(String(ob.id ?? ''))) throw new Error(`obligation id \`${ob.id}\` is not PO-NNN`);
  for (const k of ['files', 'match', 'require']) if (!ob[k].length) throw new Error(`${ob.id}: \`${k}\` is required`);
  for (const k of ['match', 'when', 'require']) {
    ob[k] = ob[k].map((p) => {
      try { return new RegExp(p, 'm'); } catch (err) { throw new Error(`${ob.id}: ${k} \`${p}\` is not a regular expression: ${err.message}`); }
    });
  }
  ob.filesRe = ob.files.map(globToRegExp);
  ob.excludeRe = ob.exclude.map(globToRegExp);
  return ob;
}

const ESC = /[.+^$()|[\]\\]/g;

/** `**` any depth, `*` within a segment, `?` one character, `{a,b}` alternatives. */
export function globToRegExp(glob) {
  let re = '';
  const g = String(glob).replace(/^\.\//, '');
  for (let i = 0; i < g.length; i += 1) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') {
      i += 1;
      if (g[i + 1] === '/') { i += 1; re += '(?:.*/)?'; } else re += '.*';
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '{' && g.indexOf('}', i) > i) {
      const end = g.indexOf('}', i);
      re += `(?:${g.slice(i + 1, end).split(',').map((s) => s.replace(ESC, '\\$&')).join('|')})`;
      i = end;
    } else re += ch.replace(ESC, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** The obligations for a slug: patterns.yaml first, else the ui-spec's fenced block. */
export function loadObligations(devRoot, slug, config) {
  const yaml = config ?? join(devRoot, 'ui', slug, 'patterns.yaml');
  if (existsSync(yaml)) return { from: yaml, obligations: parseObligations(readFileSync(yaml, 'utf8')) };
  if (config) throw new Error(`${config} does not exist`);
  const spec = join(devRoot, 'ui', slug, 'ui-spec.md');
  if (existsSync(spec)) {
    const block = /```ya?ml[^\n]*\n(obligations:[\s\S]*?)\n```/.exec(readFileSync(spec, 'utf8').replace(/\r\n?/g, '\n'));
    if (block) return { from: spec, obligations: parseObligations(block[1]) };
  }
  return { from: null, obligations: [] };
}

/** Per obligation: how many files matched, which skip the wrapper, which carry a waiver. */
export function check(obligations, srcRoot) {
  const files = walkCode([srcRoot], { base: srcRoot });
  return obligations.map((ob) => {
    const r = { id: ob.id, rule: ob.rule, candidates: 0, violations: [], waived: [] };
    for (const f of files) {
      if (!ob.filesRe.some((re) => re.test(f.rel)) || ob.excludeRe.some((re) => re.test(f.rel))) continue;
      const text = readFileSync(f.abs, 'utf8');
      if (!ob.match.some((re) => re.test(text))) continue;
      if (ob.when.length && !ob.when.some((re) => re.test(text))) continue;
      r.candidates += 1;
      if (ob.require.some((re) => re.test(text))) continue;
      const waiver = new RegExp(`pattern-ok:\\s*${ob.id}\\b[ \\t:—-]*([^\\n]*)`).exec(text);
      const reason = waiver?.[1].replace(/\*\/|-->|\}/g, '').trim() ?? '';
      if (reason.length >= 3) r.waived.push({ file: f.rel, reason });
      else r.violations.push(f.rel);
    }
    return r;
  });
}

export function format(results) {
  const out = [];
  for (const r of results) {
    for (const v of r.violations) out.push(`FAIL ${r.id} ${v} — ${r.rule || 'matches the obligation'}, and uses none of its required wrappers`);
    for (const w of r.waived) out.push(`note ${r.id} ${w.file} — waived: ${w.reason}`);
  }
  const bad = results.reduce((n, r) => n + r.violations.length, 0);
  out.push(`pattern-check: ${results.length} obligation(s) · ${results.reduce((n, r) => n + r.candidates, 0)} candidate file(s) · ${bad} violation(s)`);
  return out.join('\n');
}

export function parseArgs(argv) {
  const o = { slug: null, root: null, src: null, config: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (['--root', '--src', '--config'].includes(a)) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = v;
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!o.slug) o.slug = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!o.slug) throw new Error('give the slug');
  o.root = findRoot({ explicit: o.root }).root;
  return o;
}

function main(argv) {
  let o;
  let loaded;
  try {
    o = parseArgs(argv);
    loaded = loadObligations(resolve(o.root), o.slug, o.config && resolve(o.config));
  } catch (err) {
    console.error(`pattern-check: ${err.message}\nusage: pattern-check.mjs <slug> [--root dev] [--src <dir>] [--config <patterns.yaml>] [--json]`);
    return 2;
  }
  if (!loaded.obligations.length) {
    console.error(`pattern-check: no obligations for \`${o.slug}\` — none in ${o.root}/ui/${o.slug}/patterns.yaml or its ui-spec`);
    return 2;
  }
  const results = check(loaded.obligations, resolve(o.src ?? dirname(resolve(o.root))));
  console.log(o.json ? JSON.stringify({ from: loaded.from, results: results.map(({ id, rule, candidates, violations, waived }) => ({ id, rule, candidates, violations, waived })) }, null, 2) : format(results));
  return results.some((r) => r.violations.length) ? 1 : 0;
}

if (process.argv[1]?.endsWith('pattern-check.mjs')) process.exitCode = main(process.argv.slice(2));
