/**
 * Behaviour rows — DEV-CONTRACTS §1, §6, §13.3.
 *
 * A ui-spec writes each observable interaction (Esc, focus return, Back, refresh, URL state, double
 * submit, permission denial) as one `UB-NNN` row in `## Interaction and feedback`. The linter checks
 * the ids are unique, trace.mjs requires a test to name each one, and the exploratory pass walks
 * them per role. One reader, so the three never disagree on what a row is.
 */

export const UB_ID = /^UB-\d{3,}$/;
const SECTION = '## Interaction and feedback';

/**
 * Every table row in the section whose first cell is a `UB-NNN`, with the cells named by that
 * table's header row. `line` is 1-based within `body`.
 */
export function behaviourRows(body) {
  const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === SECTION);
  if (start === -1) return [];
  const rows = [];
  let headers = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^## /.test(line)) break;
    if (!line.startsWith('|')) { headers = null; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const id = cells[0].replace(/[`*_]/g, '').trim();
    if (!UB_ID.test(id)) continue;
    const row = { id, line: i + 1 };
    headers.forEach((h, k) => { row[h] = cells[k] ?? ''; });
    rows.push(row);
  }
  return rows;
}
