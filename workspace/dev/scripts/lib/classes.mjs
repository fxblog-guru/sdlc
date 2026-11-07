/**
 * classes.mjs — the dead-class check behind `design-system.mjs classes` (DEV-CONTRACTS §13.3).
 *
 * A Tailwind config that replaces a default scale (as a token-bound one must) turns every class
 * that named the old scale into a class that emits nothing. release-management had about 98 of them:
 * skeleton heights of 0, a dropdown with no max-height, an invisible `w-px` tick, a missing
 * `min-h-control-sm`. `scan` checks hex and px and saw none of it. This check compiles the
 * project's own Tailwind over the class tokens its sources use, and diffs the two.
 *
 * Only class *contexts* are read, so prose and ids are not taken for classes: `className="…"`,
 * `className={'…'}` / {`…`} (static parts), every string literal inside `cn(`, `clsx(`, `cx(`,
 * `cva(`, `twMerge(`, `tw(`, and string constants whose name says they hold classes.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CALLS = /\b(?:cn|clsx|cx|cva|twMerge|tw|classNames)\s*\(/g;
// a constant whose name says it holds classes, or any ALL_CAPS constant (a lookup of classes)
const CLASS_CONST = /\b(?:const|let)\s+([A-Za-z_$][\w$]*(?:class(?:es|Name)?|Class(?:es|Name)?|CLASS(?:ES)?|_CLS|STYLE|Styles?|BTN|BUTTON|INPUT|BADGE|CHIP|PILL)\w*|[A-Z][A-Z0-9_]+)\s*(?::[^=]+)?=\s*/g;
const STRING = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/** A token that can be a Tailwind class: no spaces, starts like a utility, variant or arbitrary. */
const TOKEN = /^!?-?(?:[a-z@[*]|\[)[^\s'"`{}]*$/;
/** Classes that are markers by design: they emit no rule of their own. */
const MARKERS = /^(?:group|peer)(?:\/[\w-]+)?$/;

/** The index of the bracket that closes the one at `open`, or -1. Strings are skipped. */
function closing(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[text[open]]];
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      for (i += 1; i < text.length && text[i] !== q; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

/** Every string literal in `text[from, to)`, with its offset. Template `${…}` parts are dropped. */
function strings(text, from, to) {
  const out = [];
  STRING.lastIndex = from;
  let m;
  while ((m = STRING.exec(text)) && m.index < to) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const after = /^\s*(\S)/.exec(text.slice(m.index + m[0].length, m.index + m[0].length + 8))?.[1];
    const before = text.slice(Math.max(0, m.index - 4), m.index);
    // an object key (`'danger-outline': …`) or one side of a comparison is not a class string
    if (after === ':' || /[=!]==?\s*$/.test(before)) continue;
    out.push({ value: raw.replace(/\$\{[^}]*\}/g, ' '), index: m.index });
  }
  return out;
}

/**
 * Class tokens used in one source file: `[{ token, line }]`. `tokensOk` lines (a `tokens-ok:`
 * comment on the line or the line above) are returned so arbitrary values there are excused.
 */
export function extractClasses(text) {
  const spans = [];
  for (const m of text.matchAll(/\bclass(?:Name)?\s*=\s*/g)) {
    const at = m.index + m[0].length;
    const ch = text[at];
    if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, at + 1);
      if (end > at) spans.push([at, end + 1]);
    } else if (ch === '{') {
      const end = closing(text, at);
      if (end > at) spans.push([at, end]);
    }
  }
  for (const m of text.matchAll(CALLS)) {
    const open = m.index + m[0].length - 1;
    const end = closing(text, open);
    if (end > open) spans.push([open, end]);
  }
  for (const m of text.matchAll(CLASS_CONST)) {
    const at = m.index + m[0].length;
    const ch = text[at];
    if (ch === '{' || ch === '[' || ch === '(') {
      const end = closing(text, at);
      if (end > at) spans.push([at, end]);
    } else {
      const s = strings(text, at, at + 1);
      if (s.length) spans.push([at, at + s[0].value.length + 2]);
    }
  }
  const seen = new Set();
  const out = [];
  for (const [from, to] of spans) {
    for (const s of strings(text, from, to)) {
      const key = `${s.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = lineAt(text, s.index);
      for (const token of s.value.split(/\s+/)) {
        if (token && isClassLike(token)) out.push({ token, line });
      }
    }
  }
  return out;
}

/**
 * Plain words are classes only when Tailwind has them (`flex`, `hidden`, `truncate`); a word like
 * `button` in a cva key list or `primary` as a variant name is not a class. The check below keeps
 * any token with a dash, a colon, a slash, brackets or a leading `!`/`-`, and the bare utilities.
 */
const BARE = new Set(['flex', 'grid', 'block', 'inline', 'hidden', 'contents', 'table', 'truncate', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize', 'relative', 'absolute', 'fixed', 'sticky', 'static', 'border', 'rounded', 'shadow', 'grow', 'shrink', 'container', 'invisible', 'visible', 'collapse', 'isolate', 'transition', 'transform', 'filter', 'outline', 'ring', 'antialiased', 'ordinal', 'resize', 'sr-only', 'group', 'peer', 'prose', 'overline', 'blur', 'invert', 'grayscale', 'sepia', 'flow-root', 'list-item']);
export function isClassLike(token) {
  if (!TOKEN.test(token)) return false;
  if (/^[a-z]+$/.test(token)) return BARE.has(token);
  if (/^\d|^[A-Z]/.test(token)) return false;
  if (/^https?:|^\/\/|\.(tsx?|jsx?|css|svg|png)$/.test(token)) return false;
  return /[-:/[\]!]/.test(token) || BARE.has(token);
}

/** The utility part of a token, after its variants: `md:hover:bg-x` → `bg-x`. */
export function utilityOf(token) {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === '[') depth += 1;
    else if (token[i] === ']') depth -= 1;
    else if (token[i] === ':' && depth === 0) last = i;
  }
  return token.slice(last + 1).replace(/^!/, '');
}

/**
 * The first segment of every Tailwind 3 utility. A token whose utility starts with none of these
 * (`sign-in`, `not-found`, a variant name in a cva `defaultVariants`) is a string, not a class, and
 * is not judged; a token that does (`h-4`, `max-h-60`, `size-icon-md`) must emit a rule.
 */
const ROOTS = new Set(('p px py pt pr pb pl ps pe m mx my mt mr mb ml ms me space gap w h min max size inset top right bottom left start end z '
  + 'flex grid col row order basis grow shrink justify items content self place float clear object overflow overscroll '
  + 'text font leading tracking whitespace break truncate line list decoration underline indent align '
  + 'bg from via to border divide outline ring shadow opacity mix rounded fill stroke '
  + 'transition duration ease delay animate transform translate rotate scale skew origin '
  + 'cursor select pointer resize scroll snap touch appearance accent caret will '
  + 'sr block inline hidden table contents visible invisible static fixed absolute relative sticky isolate isolation aspect columns box '
  + 'filter blur brightness contrast drop grayscale hue invert saturate sepia backdrop tabular slashed lining oldstyle proportional diagonal normal ordinal '
  + 'italic uppercase lowercase capitalize antialiased subpixel container prose group peer').split(/\s+/));

/** Whether the utility part of `token` is one Tailwind could generate (by its root), or arbitrary. */
export function isTailwindish(token) {
  const u = utilityOf(token).replace(/^-/, '');
  if (u.startsWith('[')) return /^\[[a-z-]+:[^\]]+\]$/.test(u);
  if (u === 'not-sr-only' || u === 'not-italic') return true;
  return ROOTS.has(u.split('-')[0]);
}

/** An arbitrary value: `w-[123px]`, `bg-[#fff]`, `[mask:none]`. An arbitrary *variant* is not one. */
export const isArbitrary = (token) => /\[/.test(utilityOf(token));

/** Class names a stylesheet defines, unescaped: `.hover\:bg-x:hover` → `hover:bg-x`. */
export function definedClasses(css) {
  const out = new Set();
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of noComments.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[^\s.,:>+~()[\]{}#'"\\])+)/g)) {
    out.add(m[1].replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1'));
  }
  return out;
}

/**
 * Judge every use: `{ dead: [{token, file, line}], arbitrary: [...] }`. A token is alive when the
 * compiled CSS defines it. An arbitrary value is excused by `tokens-ok:` on its line or the line above.
 */
export function judgeClasses(uses, defined, sources) {
  const dead = [];
  const arbitrary = [];
  for (const u of uses) {
    if (MARKERS.test(u.token) || !isTailwindish(u.token)) continue;
    if (!defined.has(u.token) && !defined.has(u.token.replace(/^!/, ''))) dead.push(u);
    if (isArbitrary(u.token)) {
      const lines = sources.get(u.file) ?? [];
      const here = `${lines[u.line - 1] ?? ''}\n${lines[u.line - 2] ?? ''}`;
      if (!/tokens-ok:\s*\S/.test(here)) arbitrary.push(u);
    }
  }
  return { dead, arbitrary };
}

/**
 * Compile the project's Tailwind (v3) over `tokens`, with the project's own config and its own
 * tailwindcss and postcss from its node_modules. The CSS entry is the project's (the stylesheet
 * with `@tailwind` directives), so classes it defines in `@layer` count as defined.
 */
export async function compileTailwind(projectDir, { configPath, cssPath, tokens }) {
  const req = createRequire(join(projectDir, 'package.json'));
  let pkg;
  try {
    pkg = req('tailwindcss/package.json');
  } catch {
    throw new Error(`no tailwindcss in ${projectDir}/node_modules — run npm install there first`);
  }
  if (!/^3\./.test(pkg.version)) throw new Error(`tailwindcss ${pkg.version}: only Tailwind 3 is supported by this check so far`);
  const load = await import(pathToFileURL(req.resolve('tailwindcss/loadConfig')).href);
  const loadConfig = load.default?.default ?? load.default ?? load;
  const tailwind = (await import(pathToFileURL(req.resolve('tailwindcss')).href)).default;
  const postcss = (await import(pathToFileURL(req.resolve('postcss')).href)).default;
  const config = loadConfig(configPath);
  const css = cssPath ? readFileSync(cssPath, 'utf8') : '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
  const result = await postcss([tailwind({ ...config, content: [{ raw: tokens.join(' '), extension: 'html' }], safelist: [] })]).process(css, { from: cssPath ?? join(projectDir, 'kit-classes.css') });
  return { css: result.css, version: pkg.version };
}
