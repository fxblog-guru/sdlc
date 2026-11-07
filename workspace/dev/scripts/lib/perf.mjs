/**
 * The `x-perf` budget on each OpenAPI operation (DEV-CONTRACTS §13.1, §13.7) — one reader, shared by
 * lint-dev.mjs (is every operation budgeted?) and perf-smoke.mjs (is every budget met?).
 *
 *   paths:
 *     /releases:
 *       get:
 *         operationId: listReleases
 *         x-perf: { p95_ms: 300, max_queries: 4, max_payload_kb: 64 }
 *
 * The bundle has no dependencies, so this is not a YAML parser. It reads the one shape a contract
 * has under `paths:` — path keys, method keys, and the operation's own keys — by indentation, and
 * the `x-perf` value as a flow map (`{ a: 1, b: 2 }`) or a block map one level deeper. A `.json`
 * contract is parsed as JSON. Anything it cannot read is reported as unread, never as budgeted.
 */

export const PERF_KEYS = ['p95_ms', 'max_queries', 'max_payload_kb'];
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const indentOf = (line) => line.length - line.trimStart().length;
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

/** `key: value # comment` → [key, value]; null for a line that is not a mapping entry. */
function entry(line) {
  const t = line.trim();
  if (!t || t.startsWith('#') || t.startsWith('- ')) return null;
  const m = /^((?:'[^']*'|"[^"]*"|[^:#\s][^:#]*?)):(?:\s+(.*))?$/.exec(t);
  if (!m) return null;
  return [unquote(m[1]), stripComment(m[2] ?? '')];
}

function stripComment(v) {
  let quote = null;
  for (let i = 0; i < v.length; i += 1) {
    const c = v[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i).trim();
  }
  return v.trim();
}

/** `{ p95_ms: 300, max_queries: 4 }` → { p95_ms: '300', max_queries: '4' }; null when not a flow map. */
function flowMap(v) {
  const m = /^\{(.*)\}$/.exec(v.trim());
  if (!m) return null;
  const out = {};
  for (const part of m[1].split(',')) {
    if (!part.trim()) continue;
    const kv = /^\s*([^:]+):\s*(.*)$/.exec(part);
    if (!kv) return null;
    out[unquote(kv[1])] = unquote(kv[2]);
  }
  return out;
}

/**
 * Every operation under `paths:`.
 * @returns {{ method: string, path: string, operationId: string|null, line: number, perf: object|null, timeoutMs: number|null, cache: string|null }[]}
 *   `perf` holds the raw values as written (strings), or null when the operation has no `x-perf`;
 *   `timeoutMs` and `cache` are the operation's `x-timeout-ms` and `x-cache` (§13.7), or null.
 */
export function readOperations(text, file = '') {
  if (/\.json$/i.test(file) || /^\s*\{/.test(text)) return readJson(text);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const ops = [];
  const start = lines.findIndex((l) => /^paths:\s*(#.*)?$/.test(l));
  if (start === -1) return ops;

  let pathIndent = null;
  let methodIndent = null;
  let keyIndent = null;
  let path = null;
  let op = null;
  let perfBlock = null; // { indent } while reading a block-style x-perf

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const ind = indentOf(line);
    if (ind === 0) break; // the next top-level key: `paths:` is over
    const kv = entry(line);

    if (perfBlock) {
      if (ind > perfBlock.indent) {
        if (kv) op.perf[kv[0]] = unquote(kv[1]);
        continue;
      }
      perfBlock = null;
    }
    if (pathIndent === null) pathIndent = ind;

    if (ind === pathIndent) {
      path = kv && kv[0].startsWith('/') ? kv[0] : null;
      op = null;
      methodIndent = null;
      continue;
    }
    if (!path) continue;
    if (methodIndent === null && ind > pathIndent) methodIndent = ind;
    if (ind === methodIndent) {
      op = null;
      keyIndent = null;
      if (kv && METHODS.has(kv[0].toLowerCase())) {
        op = { method: kv[0].toUpperCase(), path, operationId: null, line: i + 1, perf: null, timeoutMs: null, cache: null };
        ops.push(op);
      }
      continue;
    }
    if (!op || !kv) continue;
    if (keyIndent === null && ind > methodIndent) keyIndent = ind;
    if (ind !== keyIndent) continue;
    if (kv[0] === 'operationId') op.operationId = unquote(kv[1]);
    if (kv[0] === 'x-timeout-ms' && Number(unquote(kv[1])) > 0) op.timeoutMs = Number(unquote(kv[1]));
    if (kv[0] === 'x-cache') op.cache = unquote(kv[1]);
    if (kv[0] === 'x-perf') {
      if (kv[1] === '') {
        op.perf = {};
        perfBlock = { indent: ind };
      } else {
        op.perf = flowMap(kv[1]) ?? { __unread__: kv[1] };
      }
    }
  }
  return ops;
}

function readJson(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return [];
  }
  const ops = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, o] of Object.entries(item ?? {})) {
      if (!METHODS.has(method) || typeof o !== 'object' || !o) continue;
      const perf = o['x-perf'] && typeof o['x-perf'] === 'object' ? Object.fromEntries(Object.entries(o['x-perf']).map(([k, v]) => [k, String(v)])) : null;
      ops.push({ method: method.toUpperCase(), path, operationId: o.operationId ?? null, line: 1, perf, timeoutMs: Number(o['x-timeout-ms']) > 0 ? Number(o['x-timeout-ms']) : null, cache: o['x-cache'] ?? null });
    }
  }
  return ops;
}

/**
 * The problems with one operation's budget, as sentences; [] for a complete one. A budget is
 * complete when each of PERF_KEYS is a positive number.
 */
export function budgetProblems(perf) {
  if (!perf) return ['no `x-perf` budget'];
  if (perf.__unread__ !== undefined) return [`\`x-perf: ${perf.__unread__}\` is not a map`];
  const out = [];
  for (const k of PERF_KEYS) {
    if (perf[k] === undefined || perf[k] === '') out.push(`\`${k}\` missing`);
    else if (!(Number(perf[k]) > 0)) out.push(`\`${k}: ${perf[k]}\` is not a positive number`);
  }
  return out;
}

/** The numeric budget of a complete `x-perf`, or null. */
export function budgetOf(perf) {
  if (budgetProblems(perf).length) return null;
  return Object.fromEntries(PERF_KEYS.map((k) => [k, Number(perf[k])]));
}

/** How a person names an operation in a message: `listReleases (GET /releases)`. */
export function opName(op) {
  return op.operationId ? `${op.operationId} (${op.method} ${op.path})` : `${op.method} ${op.path}`;
}
