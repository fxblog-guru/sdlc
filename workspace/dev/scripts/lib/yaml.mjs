/**
 * yaml.mjs — the YAML subset an OpenAPI file, problems.yaml and limits.yaml are written in.
 *
 * Block maps and sequences, flow maps and sequences (one or several lines), block scalars (`|`, `>`
 * with chomping), plain, single- and double-quoted scalars, comments. No anchors, tags or multiple
 * documents: a contract that needs them is outside what the bundle's checkers read, and parse()
 * throws with the line rather than guessing. No dependency, like lib/doc.mjs.
 */

export function parseYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((raw, i) => ({ raw, n: i + 1 }));
  const p = new Parser(lines);
  p.skipBlank();
  if (p.i >= lines.length) return null;
  const v = p.block(p.indentOf(p.i));
  p.skipBlank();
  if (p.i < lines.length) p.fail(`unexpected content at indent ${p.indentOf(p.i)}`);
  return v;
}

class Parser {
  constructor(lines) {
    this.lines = lines;
    this.i = 0;
    // A line's content may be replaced when a sequence item opens a map on the dash's line.
    this.over = new Map();
  }
  text(i) { return this.over.has(i) ? this.over.get(i).text : this.lines[i].raw; }
  indentOf(i) { return this.over.has(i) ? this.over.get(i).indent : this.lines[i].raw.match(/^ */)[0].length; }
  body(i) { return this.over.has(i) ? this.over.get(i).text : this.lines[i].raw.slice(this.indentOf(i)); }
  fail(msg) { throw new Error(`yaml line ${this.lines[Math.min(this.i, this.lines.length - 1)].n}: ${msg}`); }
  isBlank(i) { const b = stripComment(this.body(i)).trim(); return b === ''; }
  skipBlank() { while (this.i < this.lines.length && this.isBlank(this.i)) this.i += 1; }

  block(indent) {
    this.skipBlank();
    const b = stripComment(this.body(this.i));
    if (/^-(\s|$)/.test(b)) return this.seq(indent);
    if (/^[[{"']/.test(b.trim()) && !keyOf(b)) return this.inlineValue(this.body(this.i), indent - 1);
    return this.map(indent);
  }

  seq(indent) {
    const out = [];
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length || this.indentOf(this.i) !== indent) break;
      const b = this.body(this.i);
      const m = /^-(\s+|$)(.*)$/.exec(b);
      if (!m) break;
      const rest = m[2];
      if (stripComment(rest).trim() === '') {
        this.i += 1;
        this.skipBlank();
        out.push(this.i < this.lines.length && this.indentOf(this.i) > indent ? this.block(this.indentOf(this.i)) : null);
        continue;
      }
      const inner = indent + 1 + m[1].length;
      if (/^-(\s|$)/.test(rest) || (keyOf(stripComment(rest)) && !/^[[{]/.test(rest.trim()))) {
        this.over.set(this.i, { indent: inner, text: rest });
        out.push(this.block(inner));
      } else {
        out.push(this.inlineValue(rest, indent));
      }
    }
    return out;
  }

  map(indent) {
    const out = {};
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const ind = this.indentOf(this.i);
      if (ind < indent) break;
      if (ind > indent) this.fail(`bad indentation (${ind}, expected ${indent})`);
      const b = stripComment(this.body(this.i));
      if (/^-(\s|$)/.test(b)) break;
      const kv = keyOf(b);
      if (!kv) this.fail(`expected "key: value", got "${b.trim().slice(0, 40)}"`);
      const key = kv[0];
      const rest = keyOf(this.body(this.i))?.[1] ?? kv[1];
      if (stripComment(rest).trim() === '') {
        this.i += 1;
        this.skipBlank();
        if (this.i < this.lines.length && (this.indentOf(this.i) > indent || (this.indentOf(this.i) === indent && /^-(\s|$)/.test(this.body(this.i))))) {
          out[key] = this.block(this.indentOf(this.i));
        } else out[key] = null;
      } else {
        out[key] = this.inlineValue(rest, indent);
      }
    }
    return out;
  }

  /** The value after `key:` or `- ` on line this.i; consumes it and any continuation lines. */
  inlineValue(rest, indent) {
    const t = stripComment(rest).trim();
    if (/^[&*!]/.test(t)) this.fail('anchors, aliases and tags are outside the subset this parser reads');
    const block = /^([|>])([+-]?)(\d*)([+-]?)$/.exec(t);
    if (block) return this.blockScalar(block[1], block[2] || block[4], indent);
    if (t.startsWith('[') || t.startsWith('{')) {
      let src = t;
      while (!balanced(src)) {
        this.i += 1;
        if (this.i >= this.lines.length) this.fail('unclosed flow collection');
        src += ' ' + stripComment(this.lines[this.i].raw).trim();
      }
      this.i += 1;
      return parseFlow(src, (m) => this.fail(m));
    }
    if (t.startsWith('"') || t.startsWith("'")) {
      let src = rest.trim();
      while (!quoteClosed(src)) {
        this.i += 1;
        if (this.i >= this.lines.length) this.fail('unclosed quoted scalar');
        src += ' ' + this.lines[this.i].raw.trim();
      }
      this.i += 1;
      return unquote(stripComment(src).trim());
    }
    // A plain scalar may continue on more-indented lines.
    let v = t;
    this.i += 1;
    while (this.i < this.lines.length && !this.isBlank(this.i) && this.indentOf(this.i) > indent && !keyOf(stripComment(this.body(this.i)))) {
      v += ' ' + stripComment(this.body(this.i)).trim();
      this.i += 1;
    }
    return scalar(v);
  }

  blockScalar(style, chomp, indent) {
    this.i += 1;
    const parts = [];
    let inner = null;
    while (this.i < this.lines.length) {
      const raw = this.lines[this.i].raw;
      if (raw.trim() === '') { parts.push(''); this.i += 1; continue; }
      const ind = raw.match(/^ */)[0].length;
      if (inner === null) inner = ind;
      if (ind < inner || ind <= indent) break;
      parts.push(raw.slice(inner));
      this.i += 1;
    }
    while (parts.length && parts.at(-1) === '' && chomp !== '+') parts.pop();
    let s = style === '|' ? parts.join('\n') : parts.reduce((acc, l) => (acc === '' ? l : l === '' ? acc + '\n' : acc.endsWith('\n') ? acc + l : acc + ' ' + l), '');
    if (chomp !== '-' && s !== '') s += '\n';
    return s;
  }
}

/** `key: rest` → [key, rest], or null. A key may be quoted; a plain key may hold `{` `/` `.`. */
function keyOf(b) {
  const s = b.trimStart();
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0];
    let j = 1;
    for (; j < s.length; j++) {
      if (s[j] === q) { if (q === "'" && s[j + 1] === "'") { j++; continue; } break; }
      if (q === '"' && s[j] === '\\') j++;
    }
    const after = s.slice(j + 1);
    const m = /^\s*:(\s+|$)(.*)$/.exec(after);
    return m ? [unquote(s.slice(0, j + 1)), m[2]] : null;
  }
  if (/^[[{]/.test(s)) return null;
  const m = /^([^\s#][^:]*?|[^\s#].*?[^\s]):(\s+|$)(.*)$/.exec(s);
  if (!m) return null;
  return [m[1].trim(), m[3]];
}

function stripComment(s) {
  let q = null;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) {
      if (c === q) q = null;
      else if (q === '"' && c === '\\') j++;
      continue;
    }
    if ((c === '"' || c === "'") && (j === 0 || /[\s:[{,-]/.test(s[j - 1]))) { q = c; continue; }
    if (c === '#' && (j === 0 || /\s/.test(s[j - 1]))) return s.slice(0, j);
  }
  return s;
}

function quoteClosed(s) {
  const q = s[0];
  for (let j = 1; j < s.length; j++) {
    if (q === "'" && s[j] === "'") { if (s[j + 1] === "'") { j++; continue; } return true; }
    if (q === '"' && s[j] === '\\') { j++; continue; }
    if (q === '"' && s[j] === '"') return true;
  }
  return false;
}

function balanced(s) {
  let d = 0;
  let q = null;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = null; else if (q === '"' && c === '\\') j++; continue; }
    if ((c === '"' || c === "'") && /^$|[[{,:]$/.test(s.slice(0, j).trimEnd())) q = c;
    else if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') d--;
  }
  return d <= 0;
}

function unquote(s) {
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('"')) {
    return s.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e) => (e[0] === 'u' ? String.fromCharCode(parseInt(e.slice(1), 16)) : { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', 0: '\0' }[e] ?? e));
  }
  return s;
}

function scalar(v) {
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^[-+]?\d+$/.test(v)) return Number(v);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseFlow(src, fail) {
  let j = 0;
  const ws = () => { while (j < src.length && /\s/.test(src[j])) j++; };
  const value = (stops) => {
    ws();
    const c = src[j];
    if (c === '[') {
      j++;
      const arr = [];
      ws();
      if (src[j] === ']') { j++; return arr; }
      for (;;) {
        arr.push(value(',]'));
        ws();
        if (src[j] === ',') { j++; ws(); if (src[j] === ']') { j++; return arr; } continue; }
        if (src[j] === ']') { j++; return arr; }
        fail(`bad flow sequence near "${src.slice(j, j + 20)}"`);
      }
    }
    if (c === '{') {
      j++;
      const obj = {};
      ws();
      if (src[j] === '}') { j++; return obj; }
      for (;;) {
        ws();
        const k = value(':,}');
        ws();
        let v = null;
        if (src[j] === ':') { j++; v = value(',}'); }
        obj[String(k)] = v;
        ws();
        if (src[j] === ',') { j++; ws(); if (src[j] === '}') { j++; return obj; } continue; }
        if (src[j] === '}') { j++; return obj; }
        fail(`bad flow map near "${src.slice(j, j + 20)}"`);
      }
    }
    if (c === '"' || c === "'") {
      const start = j;
      j++;
      for (; j < src.length; j++) {
        if (c === "'" && src[j] === "'") { if (src[j + 1] === "'") { j++; continue; } break; }
        if (c === '"' && src[j] === '\\') { j++; continue; }
        if (c === '"' && src[j] === '"') break;
      }
      j++;
      return unquote(src.slice(start, j));
    }
    const start = j;
    while (j < src.length) {
      const ch = src[j];
      if (stops.includes(ch) && (ch !== ':' || /\s|$/.test(src[j + 1] ?? ''))) break;
      j++;
    }
    return scalar(src.slice(start, j).trim());
  };
  const v = value('');
  return v;
}

/** Resolve a local `$ref` (`#/components/...`) against the document root. */
export function deref(root, node, depth = 0) {
  if (!node || typeof node !== 'object' || typeof node.$ref !== 'string' || depth > 20) return node;
  if (!node.$ref.startsWith('#/')) return node;
  let cur = root;
  for (const part of node.$ref.slice(2).split('/')) cur = cur?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  return deref(root, cur, depth + 1) ?? node;
}
