/**
 * error-ux.mjs — the ui-spec's Error-UX matrix against the API contract's ProblemType enum
 * (DEV-CONTRACTS §13.3, lint E080 / E081 / W080).
 *
 * release-management handled 46 problem types in about 30 places, one of them 13 times with six
 * different sentences, because the spec said "show the error" and every screen decided what that
 * meant. The matrix decides it once: one row per problem type and per status, saying where it
 * shows, in which component, with which copy key, and whether the user can retry.
 */

/** The statuses every matrix covers, whatever the contract declares. */
export const REQUIRED_STATUSES = ['401', '403', '404', '409', '412', '422', '429', '5xx', 'offline', 'unknown'];
export const MATRIX_COLUMNS = ['Problem', 'Surface', 'Component', 'Copy key', 'Retry'];
export const MATRIX_HEADING = '### Error-UX matrix';

/**
 * The `ProblemType` enum of an OpenAPI document, read without a YAML parser: the `enum:` list
 * under the first `ProblemType:` key. Null when the contract has no such schema.
 */
export function problemTypes(yaml) {
  const lines = yaml.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^\s*ProblemType:\s*$/.test(l));
  if (start === -1) return null;
  const indent = lines[start].match(/^\s*/)[0].length;
  const out = [];
  let inEnum = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.match(/^\s*/)[0].length;
    if (ind <= indent) break;
    if (/^\s*enum:\s*$/.test(l)) { inEnum = true; continue; }
    const inline = /^\s*enum:\s*\[(.*)\]\s*$/.exec(l);
    if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    if (inEnum) {
      const item = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(l);
      if (item) out.push(item[1].trim());
      else if (/^\s*\w[\w-]*:/.test(l)) inEnum = false;
    }
  }
  return out;
}

/** A problem's short name: `/problems/not-found` and `https://x/problems/not-found` are `not-found`. */
export const shortProblem = (t) => String(t).replace(/[`*]/g, '').trim().replace(/^.*\/problems\//, '').replace(/^\//, '');

/**
 * The matrix: the first table after `### Error-UX matrix`, up to the next heading. Null when the
 * heading is absent. Rows are `{ problem, cells: { surface, component, 'copy key', retry }, line }`.
 */
export function readMatrix(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === MATRIX_HEADING.toLowerCase());
  if (start === -1) return null;
  let headers = null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^#{2,3} /.test(line)) break;
    if (!line.startsWith('|')) { if (headers && rows.length && line) break; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const row = {};
    headers.forEach((h, k) => { row[h] = cells[k] ?? ''; });
    rows.push({ problem: shortProblem(row.problem ?? ''), cells: row, line: i });
  }
  return { headers: headers ?? [], rows, line: start };
}

/**
 * Findings for one ui-spec body against the contract's problem types (null: no contract).
 * Each is `{ rule, line (0-based in body), message }`.
 */
export function checkMatrix(body, types) {
  const out = [];
  const m = readMatrix(body);
  if (!m) {
    if (types) out.push({ rule: 'E080', line: 0, message: `no \`${MATRIX_HEADING}\` under \`## States\` — the contract declares ${types.length} problem type(s); each, and ${REQUIRED_STATUSES.join(', ')}, needs a row: ${MATRIX_COLUMNS.join(' | ')} (DEV-CONTRACTS §13.3)` });
    return out;
  }
  const missingCols = MATRIX_COLUMNS.filter((c) => !m.headers.includes(c.toLowerCase()));
  if (missingCols.length) {
    out.push({ rule: 'E080', line: m.line, message: `the Error-UX matrix lacks the column(s) ${missingCols.join(', ')} — columns are ${MATRIX_COLUMNS.join(' | ')} (DEV-CONTRACTS §13.3)` });
    return out;
  }
  const have = new Set(m.rows.map((r) => r.problem.toLowerCase()));
  const needed = [...REQUIRED_STATUSES, ...(types ?? []).map(shortProblem)];
  const missing = needed.filter((n) => !have.has(n.toLowerCase()));
  if (types && missing.length) {
    out.push({ rule: 'E080', line: m.line, message: `the Error-UX matrix has no row for ${missing.length}: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''} (DEV-CONTRACTS §13.3)` });
  }
  for (const r of m.rows) {
    const empty = MATRIX_COLUMNS.slice(1).filter((c) => !String(r.cells[c.toLowerCase()] ?? '').replace(/[`*—–-]/g, '').trim());
    if (empty.length) out.push({ rule: 'E081', line: r.line, message: `Error-UX row \`${r.problem}\` has no ${empty.join(', ')} — every row says where it shows, in what, with which copy key, and whether to retry (DEV-CONTRACTS §13.3)` });
  }
  if (types) {
    const known = new Set([...REQUIRED_STATUSES, ...types.map(shortProblem)].map((x) => x.toLowerCase()));
    for (const r of m.rows) {
      if (r.problem && !known.has(r.problem.toLowerCase()) && !/^\d{3}$/.test(r.problem)) {
        out.push({ rule: 'W080', line: r.line, message: `Error-UX row \`${r.problem}\` names a problem type the contract does not declare — renamed, or removed at G4? (DEV-CONTRACTS §13.3)` });
      }
    }
  }
  return out;
}
