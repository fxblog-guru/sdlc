/**
 * ui-spec.mjs — the ui-spec tables DEV-CONTRACTS §13.13 makes countable: states, roles,
 * traceability and responsive rows. One reader for lint-dev.mjs (E140–E144, W140–W141) and
 * ui-score.mjs, so the two never disagree on what a row is.
 *
 * release-management's spec had 49 screens and a states table of eight columns. "No results" and
 * "long text" were not columns, so they were nobody's job, and the roles a screen served were a
 * sentence per screen that no check could compare with the contract's `x-authz`.
 */

export const STATE_COLUMNS = ['Screen', 'Loading', 'Empty', 'No results', 'Error', 'Partial / stale', 'No permission', 'Offline', 'Long text / missing data', 'Populated'];
export const ROLE_VALUES = ['enabled', 'disabled', 'hidden', 'read-only', '—', '-'];
export const ROLES_HEADING = '### Roles matrix';
export const TRACE_HEADING = '### Traceability';
const FIXED_ROLE_COLUMNS = ['screen', 'action', 'operation'];

const clean = (c) => String(c ?? '').replace(/[`*_]/g, '').trim();

/**
 * The first markdown table after the line `heading` (a `##` or `###` line), stopping at the next
 * heading of the same or a higher level. `{ headers, rows: [{ cells: {header: text}, line }] }`
 * with 1-based lines within `body`, or null when the heading is absent.
 */
export function firstTable(body, heading) {
  const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
  const want = heading.trim().toLowerCase();
  const level = heading.trim().match(/^#+/)[0].length;
  const start = lines.findIndex((l) => l.trim().toLowerCase() === want);
  if (start === -1) return null;
  let headers = null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const h = /^(#+) /.exec(line);
    if (h && h[1].length <= level) break;
    if (!line.startsWith('|')) {
      if (headers) break;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells; continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const row = {};
    headers.forEach((hd, k) => { row[hd] = cells[k] ?? ''; });
    rows.push({ cells: row, line: i + 1 });
  }
  return { headers: headers ?? [], rows, line: start + 1 };
}

/**
 * How a screen is named across tables: its leading id (`S01`, `SCR-3`) when it has one, else its
 * text. `S01 Sign in` and `S01` are one screen; `Sign in` and `sign in` are one screen.
 */
export function screenKey(cell) {
  const t = clean(cell);
  const id = /^([A-Z][A-Z0-9]*-?\d+)\b/.exec(t);
  return (id ? id[1] : t).toLowerCase();
}

/** Every screen of `## Screens` (its first table), as `{ key, name, line }`. */
export function screens(body) {
  const t = firstTable(body, '## Screens');
  if (!t) return [];
  const col = t.headers[0];
  return t.rows.map((r) => ({ key: screenKey(r.cells[col]), name: clean(r.cells[col]), line: r.line })).filter((s) => s.name);
}

/** The keys a cell lists: several screens in one cell (`S01, S02`) each count. */
function keysOf(cell) {
  const t = clean(cell);
  const ids = [...t.matchAll(/\b([A-Z][A-Z0-9]*-?\d+)\b/g)].map((m) => m[1].toLowerCase());
  return ids.length ? ids : [screenKey(t)];
}

/** Findings over the states table: `{ rule, line, message }` (1-based line in body). */
export function checkStates(body) {
  const out = [];
  const t = firstTable(body, '## States');
  if (!t || !t.headers.length) {
    out.push({ rule: 'E140', line: 1, message: `\`## States\` has no states table — columns: ${STATE_COLUMNS.join(' | ')} (DEV-CONTRACTS §13.13)` });
    return out;
  }
  const have = t.headers.map((h) => clean(h).toLowerCase());
  const missing = STATE_COLUMNS.filter((c) => !have.includes(c.toLowerCase()));
  if (missing.length) {
    out.push({ rule: 'E140', line: t.line, message: `the states table lacks the column(s) ${missing.map((m) => `\`${m}\``).join(', ')} — every screen declares all nine states, or N/A with a reason (DEV-CONTRACTS §13.13)` });
    return out;
  }
  const covered = new Set();
  for (const r of t.rows) {
    const name = r.cells[t.headers[0]];
    for (const k of keysOf(name)) covered.add(k);
    for (const h of t.headers.slice(1)) {
      const v = clean(r.cells[h]);
      if (!STATE_COLUMNS.map((c) => c.toLowerCase()).includes(clean(h).toLowerCase())) continue;
      if (!v) out.push({ rule: 'E141', line: r.line, message: `\`${clean(name)}\` has no \`${clean(h)}\` state — fill it, or write N/A — <reason> (DEV-CONTRACTS §13.13)` });
      else if (/^N\/?A\.?$/i.test(v)) out.push({ rule: 'W140', line: r.line, message: `\`${clean(name)}\` \`${clean(h)}\` is N/A with no reason — say why the state cannot occur` });
    }
  }
  for (const s of screens(body)) {
    if (!covered.has(s.key)) out.push({ rule: 'E141', line: s.line, message: `screen \`${s.name}\` has no row in the states table (DEV-CONTRACTS §13.13)` });
  }
  return out;
}

const operationsIn = (cell) => clean(cell).split(/[\s,;·]+/).map((s) => s.replace(/\(.*$/, '')).filter((s) => s && !/^[—-]$/.test(s));

/**
 * Findings over the roles matrix. `operations` is the set of the contract's operationIds, or null
 * when the slug has no contract (then E143 is not judged).
 */
export function checkRoles(body, operations = null) {
  const out = [];
  const t = firstTable(body, ROLES_HEADING);
  if (!t || !t.headers.length) {
    out.push({ rule: 'E142', line: 1, message: `no \`${ROLES_HEADING}\` under \`## Screens\` — one row per screen and action, a column per role: enabled · disabled · hidden · read-only · — (DEV-CONTRACTS §13.13)` });
    return out;
  }
  const lower = t.headers.map((h) => clean(h).toLowerCase());
  const opCol = t.headers[lower.indexOf('operation')];
  const roleCols = t.headers.filter((h, k) => !FIXED_ROLE_COLUMNS.includes(lower[k]));
  if (!roleCols.length || !lower.includes('screen')) {
    out.push({ rule: 'E142', line: t.line, message: 'the roles matrix needs `Screen | Action | Operation` and one column per role (DEV-CONTRACTS §13.13)' });
    return out;
  }
  const covered = new Set();
  const screenCol = t.headers[lower.indexOf('screen')];
  for (const r of t.rows) {
    for (const k of keysOf(r.cells[screenCol])) covered.add(k);
    for (const c of roleCols) {
      const v = clean(r.cells[c]).toLowerCase();
      const head = v.split(/[\s(—]/)[0] || v;
      if (!ROLE_VALUES.includes(v) && !ROLE_VALUES.includes(head)) {
        out.push({ rule: 'E142', line: r.line, message: `role \`${clean(c)}\` on \`${clean(r.cells[screenCol])}\` is \`${clean(r.cells[c]) || '(empty)'}\` — one of enabled, disabled, hidden, read-only, — (DEV-CONTRACTS §13.13)` });
      }
    }
    if (operations && opCol) {
      for (const op of operationsIn(r.cells[opCol])) {
        if (!operations.has(op)) out.push({ rule: 'E143', line: r.line, message: `roles matrix: \`${op}\` is not an operationId of the contract — the matrix reflects the server's authorisation, it never invents an operation (DEV-CONTRACTS §13.13)` });
      }
    }
  }
  for (const s of screens(body)) {
    if (!covered.has(s.key)) out.push({ rule: 'E142', line: s.line, message: `screen \`${s.name}\` has no row in the roles matrix (DEV-CONTRACTS §13.13)` });
  }
  return out;
}

/** Findings over the traceability table. `ubIds` is the set of UB ids the spec defines. */
export function checkTrace(body, operations = null, ubIds = new Set()) {
  const out = [];
  const t = firstTable(body, TRACE_HEADING);
  if (!t || !t.headers.length) {
    out.push({ rule: 'E144', line: 1, message: `no \`${TRACE_HEADING}\` under \`## Components\` — Screen | Component | Operation | Ids, one row per screen at least (DEV-CONTRACTS §13.13)` });
    return out;
  }
  const lower = t.headers.map((h) => clean(h).toLowerCase());
  const col = (name) => t.headers[lower.indexOf(name)];
  const covered = new Set();
  for (const r of t.rows) {
    for (const k of keysOf(r.cells[col('screen')] ?? r.cells[t.headers[0]])) covered.add(k);
    if (operations && col('operation')) {
      for (const op of operationsIn(r.cells[col('operation')])) {
        if (!operations.has(op)) out.push({ rule: 'E143', line: r.line, message: `traceability: \`${op}\` is not an operationId of the contract (DEV-CONTRACTS §13.13)` });
      }
    }
    for (const m of clean(r.cells[col('ids')] ?? '').matchAll(/\bUB-\d{3,}\b/g)) {
      if (!ubIds.has(m[0])) out.push({ rule: 'E144', line: r.line, message: `traceability cites \`${m[0]}\`, which \`## Interaction and feedback\` does not define (DEV-CONTRACTS §13.13)` });
    }
  }
  for (const s of screens(body)) {
    if (!covered.has(s.key)) out.push({ rule: 'E144', line: s.line, message: `screen \`${s.name}\` has no traceability row: component → operation → AC / UB ids (DEV-CONTRACTS §13.13)` });
  }
  return out;
}

/** W141: each token breakpoint (`{ sm: 360, … }`) has a `## Responsive behaviour` row naming `bp.<name>`. */
export function checkResponsive(body, breakpoints) {
  if (!breakpoints || typeof breakpoints !== 'object') return [];
  const t = firstTable(body, '## Responsive behaviour');
  const firstCells = t ? t.rows.map((r) => clean(r.cells[t.headers[0]])).join(' ') : '';
  return Object.keys(breakpoints)
    .filter((name) => !new RegExp(`\\bbp\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(firstCells))
    .map((name) => ({ rule: 'W141', line: t?.line ?? 1, message: `breakpoint \`bp.${name}\` (${breakpoints[name]}px) has no \`## Responsive behaviour\` row — say what changes at it, or that nothing does (DEV-CONTRACTS §13.13)` }));
}
