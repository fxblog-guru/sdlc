#!/usr/bin/env node
/**
 * visual-extract.mjs — one screen of the approved visual, as the code and CSS that draw it
 * (DEV-CONTRACTS §13.3).
 *
 *   node <root>/scripts/visual-extract.mjs <slug> --screen <kind-or-id> [--json] [--root <dir>]
 *   node <root>/scripts/visual-extract.mjs <slug> --list
 *
 * Why this exists: an implementer building one page opened the whole approved visual to find it —
 * 312 KB on anime-blog, every screen in six skins — on every spawn. The page it needed is a few
 * functions and the rules they use.
 *
 * Two shapes of visual are read, the ones dev-designing-visuals produces:
 *   - screens drawn by script: `<section class="screen" data-kind="home">` and a `const RENDER = {…}`
 *     that maps each kind to its renderer. The renderer is printed whole, then every top-level
 *     function or constant it names (one level), and the names those use in turn, as names only.
 *   - static screens (the starter): the `<section class="screen" id="s-…">` markup itself.
 * Then the CSS: every rule from `<style>` with a selector whose classes, ids and attribute values all
 * occur in what was printed (plus the screen's skin and mode), the `@media` blocks around them, and
 * the `@keyframes` they animate with. Element-only rules (`body`, `h1`) are the page base and kept.
 * A class built by concatenation (`'chip-' + kind`) is not seen; the rule list is a start, not proof.
 *
 * The visual is located through the ui-spec's `visual_reference` (kind `visual`), else
 * `ui/<slug>/visual/index.html`. It is read, never written: it is hashed at G5.
 *
 * Exit 0 · 1 no such screen, or its renderer is not defined in the file · 2 usage, no visual.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDoc } from './lib/doc.mjs';
import { hasRootPrefix, rootFromArgv } from './lib/root.mjs';

const IDENT = /[A-Za-z_$][\w$]*/g;
const BASE_TAGS = new Set(['*', 'html', 'body', ':root']);

/**
 * Walk JavaScript source and call `onDepth(i, depth)` at every newline, skipping strings, template
 * literals (with their `${…}` nesting), comments and regex literals, so a brace in a string never
 * moves the depth. No parser: the visual is one hand-written file and this needs only line starts.
 */
function scanJs(src, onLine) {
  let depth = 0;
  const stack = []; // template-literal nesting: the depth at which each `${` opened
  let i = 0;
  let prev = '';
  const n = src.length;
  const skipString = (q) => { i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; };
  const skipTemplate = () => {
    i++;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { i++; return true; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; stack.push(depth); depth++; return false; }
      i++;
    }
    return true;
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { onLine(i + 1, depth); prev = ''; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      i++;
      let cls = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] ?? '')) i++;
      prev = 'a';
      continue;
    }
    if (c === '"' || c === "'") { skipString(c); prev = 'a'; continue; }
    if (c === '`') { skipTemplate(); prev = 'a'; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (c === '}' && stack.length && stack[stack.length - 1] === depth) { stack.pop(); skipTemplate(); prev = 'a'; continue; }
    }
    prev = /[\w$]/.test(c) ? 'a' : c;
    i++;
  }
}

/** Top-level `function x` / `const x =` / `let x =` declarations: name → source text. */
export function declarations(src) {
  const starts = [0];
  scanJs(src, (at, depth) => { if (depth === 0 && /^\S/.test(src.slice(at, at + 1)) && !/^[})\].]/.test(src[at])) starts.push(at); });
  starts.push(src.length);
  const out = new Map();
  for (let k = 0; k < starts.length - 1; k++) {
    const chunk = src.slice(starts[k], starts[k + 1]);
    const m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(chunk);
    if (!m) continue;
    // A comment line before the next declaration belongs to the next one, not this one.
    const lines = chunk.replace(/\s+$/, '').split('\n');
    while (lines.length > 1 && /^\s*\/\//.test(lines[lines.length - 1])) lines.pop();
    out.set(m[1] ?? m[2], lines.join('\n'));
  }
  return out;
}

/** The `RENDER` object's entries: kind → { fn } for a named renderer, or { inline } for an arrow written in place. */
export function renderMap(decl) {
  const src = decl.get('RENDER');
  if (!src) return null;
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  const parts = [];
  let depth = 0;
  let from = 0;
  let q = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if ('{([' .includes(c)) depth++;
    else if ('})]'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { parts.push(body.slice(from, i)); from = i + 1; }
  }
  parts.push(body.slice(from));
  const out = new Map();
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = /^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*(?::\s*([\s\S]+))?$/.exec(p);
    if (!m) continue;
    const key = m[1] ?? m[2] ?? m[3];
    const value = (m[4] ?? key).trim();
    out.set(key, /^[A-Za-z_$][\w$]*$/.test(value) ? { fn: value } : { inline: value });
  }
  return out;
}

/**
 * Code with string and template text blanked and `${…}` kept: markup says `href="#post"` and
 * `class="category"`, and reading those as calls would print half the file as helpers.
 */
export function codeOnly(src) {
  let out = '';
  const stack = [];
  let i = 0;
  const n = src.length;
  // Called with i on the opening backtick, or just past the `}` that closes a `${`: text runs to the next either way.
  const template = () => {
    i++;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { out += '`'; i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') { out += '${'; i += 2; stack.push(0); return; }
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } i++; out += "''"; continue; }
    if (c === '`') { out += '`'; template(); continue; }
    if (stack.length && c === '{') stack[stack.length - 1]++;
    if (stack.length && c === '}') {
      if (stack[stack.length - 1] === 0) { stack.pop(); out += '}'; template(); continue; }
      stack[stack.length - 1]--;
    }
    out += c;
    i++;
  }
  return out;
}

/** The top-level names a piece of code mentions, in order, not counting property access (`.name`). */
export function namesIn(source, known) {
  const code = codeOnly(source);
  const out = [];
  for (const m of code.matchAll(IDENT)) {
    if (code[m.index - 1] === '.' && code[m.index - 2] !== '.') continue;
    if (known.has(m[0]) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** `<section class="screen" …>` tags: [{ id, kind, skin, mode, html }] where html is the element. */
export function screens(html) {
  const out = [];
  for (const m of html.matchAll(/<section\b([^>]*)>/g)) {
    const attrs = m[1];
    if (!/\bclass="[^"]*\bscreen\b/.test(attrs)) continue;
    const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
    const end = html.indexOf('</section>', m.index);
    out.push({ id: attr('id'), kind: attr('data-kind'), skin: attr('data-skin'), mode: attr('data-mode'), html: html.slice(m.index, end === -1 ? undefined : end + 10) });
  }
  return out;
}

/** CSS as a tree: [{ selector, body }] for rules, [{ at, rules }] for @media/@supports, [{ at, text }] for the rest. */
export function parseCss(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const parse = (from, to) => {
    const out = [];
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open === -1 || open >= to) break;
      if (semi !== -1 && semi < open && /^\s*@/.test(src.slice(i, semi))) { out.push({ at: src.slice(i, semi).trim(), text: `${src.slice(i, semi).trim()};` }); i = semi + 1; continue; }
      let depth = 1;
      let j = open + 1;
      while (j < to && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      const head = src.slice(i, open).trim();
      if (/^@(media|supports|layer|container)\b/.test(head)) out.push({ at: head, rules: parse(open + 1, j - 1) });
      else if (head.startsWith('@')) out.push({ at: head, text: src.slice(i, j).trim() });
      else out.push({ selector: head, body: src.slice(open + 1, j - 1).trim() });
      i = j;
    }
    return out;
  };
  return parse(0, src.length);
}

/** Does one selector apply to what was printed? Every class, id and attribute value must be a word in it. */
export function selectorUsed(sel, words, html) {
  const s = sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, ' ');
  const needs = [
    ...[...s.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]),
    ...[...s.matchAll(/\[\s*[\w-]+\s*[~|^$*]?=\s*["']?([^"'\]]+)["']?\s*\]/g)].map((m) => m[1].trim()),
  ];
  if (needs.length) return needs.every((w) => words.has(w));
  const tags = [...s.matchAll(/(?:^|[\s>+~])([a-z][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase());
  return !tags.length || tags.every((t) => BASE_TAGS.has(t) || html.includes(`<${t}`));
}

/** The CSS a printed screen needs, as text, and how many rules that is. */
export function pickCss(tree, words, html) {
  const used = [];
  let count = 0;
  const walk = (nodes, indent) => {
    const out = [];
    for (const n of nodes) {
      if (n.selector != null) {
        const kept = n.selector.split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => selectorUsed(x, words, html));
        if (kept.length) { out.push(`${indent}${kept.join(', ')} { ${n.body} }`); count++; used.push(n.body); }
      } else if (n.rules) {
        const inner = walk(n.rules, `${indent}  `);
        if (inner.length) out.push(`${indent}${n.at} {`, ...inner, `${indent}}`);
      }
    }
    return out;
  };
  const lines = walk(tree, '');
  const bodies = used.join(' ');
  const frames = tree.filter((n) => /^@keyframes\s+/.test(n.at ?? '') && new RegExp(`\\b${n.at.split(/\s+/)[1]}\\b`).test(bodies)).map((n) => n.text);
  return { text: [...lines, ...frames].join('\n'), rules: count + frames.length };
}

const tagBlocks = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => m[1]);

/** The extract for one screen, or { error, exit }. */
export function extract(html, want) {
  const all = screens(html);
  const hits = all.filter((s) => s.kind === want || s.id === want || s.id === `s-${want}`);
  if (!hits.length) {
    const kinds = [...new Set(all.map((s) => s.kind ?? s.id))];
    return { exit: 1, error: `no screen \`${want}\`; screens: ${kinds.join(', ')}` };
  }
  const kind = hits[0].kind;
  const js = tagBlocks(html, 'script').join('\n');
  const decl = declarations(js);
  const render = renderMap(decl);
  const parts = [];
  let helpers = [];
  let deeper = [];
  let renderer = null;
  if (render && kind) {
    const entry = render.get(kind);
    if (!entry) return { exit: 1, error: `screen kind \`${kind}\` has no entry in RENDER` };
    if (entry.fn && !decl.has(entry.fn)) return { exit: 1, error: `RENDER maps \`${kind}\` to \`${entry.fn}\`, which is not defined at the top level` };
    renderer = entry.fn ?? `(inline) ${kind}`;
    const code = entry.fn ? decl.get(entry.fn) : `// RENDER['${kind}']\n${entry.inline}`;
    parts.push(code);
    const skip = new Set(['RENDER', entry.fn]);
    helpers = namesIn(code, decl).filter((n) => !skip.has(n));
    const seen = new Set([...skip, ...helpers]);
    for (const h of helpers) parts.push(decl.get(h));
    let frontier = helpers;
    while (frontier.length) {
      const next = frontier.flatMap((h) => namesIn(decl.get(h), decl)).filter((n) => !seen.has(n));
      for (const n of next) seen.add(n);
      deeper.push(...new Set(next));
      frontier = [...new Set(next)];
    }
    deeper = [...new Set(deeper)];
  } else {
    parts.push(...hits.map((s) => s.html));
  }
  const printed = parts.join('\n\n');
  const words = new Set([...printed.matchAll(/[A-Za-z_][\w-]*/g)].map((m) => m[0]));
  for (const s of hits) for (const v of [s.skin, s.mode, s.kind]) if (v) words.add(v);
  // The section itself and the router's `.on`: every shown screen carries both.
  words.add('screen');
  words.add('on');
  const css = pickCss(parseCss(tagBlocks(html, 'style').join('\n')), words, printed);
  return { exit: 0, kind, renderer, ids: hits.map((s) => s.id), helpers, deeper, code: printed, css: css.text, cssRules: css.rules };
}

/** The approved visual for a slug: the ui-spec's `visual_reference` of kind visual, else ui/<slug>/visual/index.html. */
export function findVisual(root, slug) {
  const spec = join(root, 'ui', slug, 'ui-spec.md');
  if (existsSync(spec)) {
    const ref = parseDoc(readFileSync(spec, 'utf8')).frontMatter.visual_reference;
    for (const r of Array.isArray(ref) ? ref : ref ? [ref] : []) {
      if (!r?.path || (r.kind && r.kind !== 'visual')) continue;
      const rel = String(r.path).replace(/\\/g, '/');
      const p = hasRootPrefix(rel) ? join(root, rel.replace(/^(?:\.\/)?[^/]+\//, '')) : join(root, '..', rel);
      if (existsSync(p)) return p;
    }
  }
  const fallback = join(root, 'ui', slug, 'visual', 'index.html');
  return existsSync(fallback) ? fallback : null;
}

export function main(argv) {
  const opt = (f) => { const i = argv.indexOf(f); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  const flagged = new Set(['--screen', '--root'].flatMap((f) => [f, opt(f)]));
  const slug = argv.find((a) => !a.startsWith('--') && !flagged.has(a));
  const want = opt('--screen');
  if (!slug || (!want && !argv.includes('--list'))) {
    console.error('usage: visual-extract.mjs <slug> --screen <kind-or-id> [--json] [--root <dir>] | <slug> --list');
    return 2;
  }
  const file = findVisual(rootFromArgv(argv), slug);
  if (!file) { console.error(`visual-extract: no approved visual for ${slug} (ui-spec visual_reference, or ui/${slug}/visual/index.html)`); return 2; }
  const html = readFileSync(file, 'utf8');
  if (argv.includes('--list')) {
    const by = new Map();
    for (const s of screens(html)) by.set(s.kind ?? s.id, [...(by.get(s.kind ?? s.id) ?? []), s.id]);
    for (const [k, ids] of by) console.log(`${k}  ${ids.join(' ')}`);
    return 0;
  }
  const r = extract(html, want);
  if (r.error) { console.error(`visual-extract: ${r.error}`); return r.exit; }
  const before = Buffer.byteLength(html);
  const body = `${r.code}\n\n/* CSS: ${r.cssRules} rule(s) */\n${r.css}`;
  const after = Buffer.byteLength(body);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ file: file.split('\\').join('/'), screen: want, kind: r.kind, ids: r.ids, renderer: r.renderer, helpers: r.helpers, deeper: r.deeper, cssRules: r.cssRules, bytes: { visual: before, extract: after }, code: r.code, css: r.css }, null, 2));
    return 0;
  }
  console.log(`visual-extract ${slug} --screen ${want} — ${r.ids.length} screen(s) of kind ${r.kind ?? '(static)'}; visual ${before} bytes → ${after} (${(100 * after / before).toFixed(1)}%)`);
  console.log(`screens: ${r.ids.join(' ')}`);
  if (r.renderer) console.log(`renderer: ${r.renderer}; helpers: ${r.helpers.join(', ') || 'none'}${r.deeper.length ? `; deeper (names only): ${r.deeper.join(', ')}` : ''}`);
  console.log('');
  console.log(body);
  return 0;
}

const isMain = process.argv[1] && /(^|[\\/])visual-extract\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
