/**
 * Shared document primitives for the linter and the state builder.
 *
 * Both scripts need the same three things, and they must agree byte for byte: how to split an
 * artifact into front matter and body, how to hash the body, and how to read the small YAML subset
 * the front matter uses. Two implementations of "how do we hash an artifact" would eventually
 * disagree, and the disagreement would show up as a gate that is permanently STALE for no visible
 * reason — so there is exactly one implementation, here.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Normalisation before hashing, per DEV-CONTRACTS §5.2.
 *
 * CRLF is folded because the same file hashes differently on Windows and in CI otherwise, and a
 * gate that is stale only on one machine is worse than no staleness detection at all. Trailing
 * whitespace goes because editors add and remove it without anyone meaning anything by it.
 */
export function normalise(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n');
}

export function sha256(text) {
  return createHash('sha256').update(normalise(text), 'utf8').digest('hex');
}

/**
 * Split a document into front matter and body.
 *
 * The front matter is the first `---` block, and only when the file opens with it. Everything after
 * that block is the body — which is what gets hashed, so that `updated:` ticking over and the
 * reviewer writing `status: approved` do not both invalidate the review that just happened.
 */
export function parseDoc(text) {
  const src = normalise(text);
  if (!src.startsWith('---\n')) {
    return { frontMatter: {}, hasFrontMatter: false, body: src, bodyHash: sha256(src) };
  }
  const end = src.indexOf('\n---', 4);
  if (end === -1) {
    return { frontMatter: {}, hasFrontMatter: false, body: src, bodyHash: sha256(src) };
  }
  const raw = src.slice(4, end);
  const body = src.slice(src.indexOf('\n', end + 1) + 1);
  return {
    frontMatter: parseFrontMatter(raw),
    hasFrontMatter: true,
    rawFrontMatter: raw,
    body,
    bodyHash: sha256(body),
  };
}

export function readDoc(path) {
  return parseDoc(readFileSync(path, 'utf8'));
}

/**
 * A deliberately small YAML subset: scalars, inline maps and sequences, and lists of maps.
 *
 * This bundle's front matter is defined by DEV-CONTRACTS §3.1 and §5.1 — a fixed, known shape — so a
 * full YAML parser would be a dependency carried for no benefit, and would also accept constructs
 * the contract does not allow. Anything this parser cannot read is a front-matter the linter should
 * be rejecting anyway, which is why unparseable input returns a marker rather than throwing.
 */
export function parseFrontMatter(raw) {
  const out = {};
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }

    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!match) {
      out.__unparsed__ = (out.__unparsed__ ?? []).concat(line);
      i += 1;
      continue;
    }

    const [, key, rest] = match;

    if (rest.trim() === '') {
      // Either a list of maps, or an empty value.
      const items = [];
      i += 1;
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const item = {};
        const first = /^\s*-\s*(.*)$/.exec(lines[i])[1];
        applyPair(item, first);
        i += 1;
        while (i < lines.length && /^\s{4,}\S/.test(lines[i]) && !/^\s*-\s/.test(lines[i])) {
          applyPair(item, lines[i].trim());
          i += 1;
        }
        items.push(item);
      }
      out[key] = items.length ? items : null;
      continue;
    }

    out[key] = parseScalar(rest.trim());
    i += 1;
  }

  return out;
}

function applyPair(target, text) {
  const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(text);
  if (m) target[m[1]] = parseScalar(m[2].trim());
}

function parseScalar(value) {
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;

  if (value.startsWith('{') && value.endsWith('}')) {
    const obj = {};
    for (const part of splitTop(value.slice(1, -1))) {
      const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(part);
      if (m) obj[m[1]] = parseScalar(m[2].trim());
    }
    return obj;
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? splitTop(inner).map((v) => parseScalar(v.trim())) : [];
  }

  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  // Only short digit runs are numbers. A sha256 that happens to be all digits — or any long
  // numeric identifier — is a string, and coercing it to 0 turns "present" into "missing".
  if (/^-?\d{1,15}$/.test(value)) return Number(value);

  return value;
}

/** Split on commas that are not inside a nested brace, bracket or quote. */
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Read a GitHub-flavoured markdown table under a given `## heading` into row objects keyed by
 * column name. Tasks, requirements and decisions are all tables, and every stage writes them from
 * the same templates, so one reader serves all three.
 */
export function readTable(body, heading) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return [];

  const rows = [];
  let headers = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;

    const cells = splitCells(line);
    if (!headers) {
      headers = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (cells.every((c) => c === '')) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

/**
 * A table row's cells, trimmed, as GitHub renders them: every unescaped `|` splits, even inside a
 * code span, and `\|` is a literal pipe. The outer pipes are optional.
 */
export function splitCells(line) {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Strip markdown emphasis and backticks from a cell so ids compare cleanly. */
export function plain(cell) {
  return String(cell ?? '')
    .replace(/[`*_]/g, '')
    .trim();
}

/**
 * The one answer to "what is this artifact's hash", shared by the builder, the reviewer's
 * `--hash` helper and anything else that needs one.
 *
 * DEV-CONTRACTS §5.2 draws the line by file type, not by content: a markdown artifact is hashed
 * over its BODY so that `updated:` and the `status:` the reviewer itself writes cannot make a gate
 * stale the moment it passes, while a non-markdown artifact — `openapi.yaml`, a `.proto`, a raw
 * verification log — is hashed whole, because it has no front matter to exclude.
 *
 * Deciding by extension rather than by "does it start with ---" matters: a perfectly ordinary
 * OpenAPI document may open with a `---` document marker, and treating that as front matter would
 * silently drop the first stanza of the contract from the hash. A gate would then record a PASS
 * over bytes it never saw.
 */
export function hashArtifact(path) {
  const text = readFileSync(path, 'utf8');
  return path.toLowerCase().endsWith('.md') ? parseDoc(text).bodyHash : sha256(normalise(text));
}

/**
 * A gate-log reference may cite only some rows of the decision ledger (DEV-CONTRACTS §5.2):
 * `dev/decisions/<slug>.md#DEC-012,DEC-031`. Answering one decision then stales only the gates that
 * relied on it, and a new row nobody cites stales nothing.
 *
 * @returns {{ file: string, ids: string[] | null }} ids is null for a whole-file reference
 */
export function splitRef(path) {
  const hash = String(path).indexOf('#');
  if (hash === -1) return { file: String(path), ids: null };
  const ids = String(path).slice(hash + 1).split(',').map((s) => s.trim()).filter(Boolean);
  return { file: String(path).slice(0, hash), ids };
}

/**
 * The hash of the cited rows of a ledger's `## Decisions` table: each row's cells trimmed and
 * re-joined (so realigning the table changes nothing), in id order, one per line. Null when a cited
 * row does not exist — a reference to a decision that is gone cannot be current.
 */
export function decisionRowsHash(text, ids) {
  const lines = parseDoc(text).body.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === '## decisions');
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const rows = new Map();
  for (const line of lines.slice(start + 1, end === -1 ? undefined : end)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().split('|').slice(1, -1).map((c) => c.trim());
    rows.set(plain(cells[0]), cells.join(' | '));
  }
  const picked = [];
  for (const id of [...new Set(ids)].sort()) {
    if (!rows.has(id)) return null;
    picked.push(rows.get(id));
  }
  return sha256(`${picked.join('\n')}\n`);
}

/**
 * The ledger rows a gate log relied on (DEV-CONTRACTS §5.2), read against the ledger as the log saw
 * it: every DEC id the log's body cites, plus every row whose `Blocks` cell names the log's gate.
 * Only ids that ledger has, sorted. An empty list means the log relied on no row in particular.
 */
export function reliedOnRows(ledgerText, logBody, gate) {
  const rows = readTable(parseDoc(ledgerText).body, 'Decisions');
  const known = new Set(rows.map((r) => plain(r.id)).filter((id) => /^DEC-\d+$/.test(id)));
  const ids = new Set((String(logBody ?? '').match(/\bDEC-\d{3,}\b/g) ?? []).filter((id) => known.has(id)));
  const gateWord = gate ? new RegExp(`\\b${gate}\\b`) : null;
  for (const r of rows) {
    if (gateWord && known.has(plain(r.id)) && gateWord.test(plain(r.blocks))) ids.add(plain(r.id));
  }
  return [...ids].sort();
}

/** hashArtifact, extended to a row-scoped ledger reference (`<path>#DEC-…`). Throws if the file is missing. */
export function hashRef(pathWithFragment) {
  const { file, ids } = splitRef(pathWithFragment);
  if (!ids) return hashArtifact(file);
  return decisionRowsHash(readFileSync(file, 'utf8'), ids);
}
