/**
 * ui-score.mjs — the UI score of DEV-CONTRACTS §13.13: criteria, weights, and the result rule.
 * One definition for ui-score.mjs (which fills the rows a checker can decide) and lint-dev.mjs
 * E145 (which recomputes a gate log's table and fails one whose result or verdict disagrees).
 *
 * Row shape, shared with any sibling scorer so a later refactor can share the code:
 *   { section, criterion, status, weight, evidence }   (+ id, mandatory, gates, source)
 */

export const STATUSES = ['PASS', 'FAIL', 'NOT_RUN', 'UNKNOWN', 'N/A'];
export const RESULTS = ['PASS', 'REVIEW', 'BLOCKED', 'NEEDS_CLARIFICATION'];
export const PASS_AT = 90;
export const REVIEW_AT = 75;

/**
 * `source` names who decides the row: a checker key ui-score.mjs reads (`spec`, `rubric`, …) or
 * `reviewer`. `gates` are the gates the row applies to; elsewhere it is N/A. Weights sum to 100.
 */
export const CRITERIA = [
  { id: 'U01', section: 'Requirements and flows', criterion: 'every screen traces to a REQ and every user-visible REQ has a screen; flows cover cancel, back, refresh, deep link', weight: 5, mandatory: false, gates: ['G5'], source: 'reviewer' },
  { id: 'U02', section: 'Roles and permissions', criterion: 'roles matrix: every screen and action per role, each operation in the contract, nothing hidden that is still fetched', weight: 10, mandatory: true, gates: ['G5', 'G7'], source: 'spec' },
  { id: 'U03', section: 'States and errors', criterion: 'states matrix: all nine states per screen, filled or N/A with a reason', weight: 10, mandatory: true, gates: ['G5', 'G7'], source: 'spec' },
  { id: 'U04', section: 'States and errors', criterion: 'Error-UX matrix: every problem type and required status has a surface, component, copy key and retry', weight: 5, mandatory: false, gates: ['G5', 'G7'], source: 'spec' },
  { id: 'U05', section: 'Design system and components', criterion: 'built from the kit: kit-check, classes and ui-inventory clean', weight: 8, mandatory: true, gates: ['G7'], source: 'kit' },
  { id: 'U06', section: 'Design system and components', criterion: 'one computed value per role across screens (ui-consistency)', weight: 4, mandatory: false, gates: ['G7', 'G8'], source: 'consistency' },
  { id: 'U07', section: 'Layout and hierarchy', criterion: 'one primary action per view, no rubric hard fail on hierarchy, advisories answered', weight: 5, mandatory: false, gates: ['G5', 'G7'], source: 'rubric' },
  { id: 'U08', section: 'Interaction and navigation', criterion: 'every UB row is named by a test and every pattern obligation holds', weight: 5, mandatory: false, gates: ['G7'], source: 'trace' },
  { id: 'U09', section: 'Forms and validation', criterion: 'forms follow the form pattern: required marking, labels not placeholders, blur validation, error summary, one submit', weight: 5, mandatory: false, gates: ['G5', 'G7'], source: 'reviewer' },
  { id: 'U10', section: 'Responsive', criterion: 'no overflow or clipped column at 1024, 768 and 360; a responsive row per token breakpoint', weight: 8, mandatory: false, gates: ['G5', 'G7', 'G8'], source: 'rubric' },
  { id: 'U11', section: 'Accessibility', criterion: 'WCAG 2.2 AA: axe-core run with no serious or critical violation, targets ≥ 24 px, focus not obscured', weight: 10, mandatory: true, gates: ['G5', 'G7', 'G8'], source: 'rubric' },
  { id: 'U12', section: 'Content and localisation', criterion: 'copy catalogue clean, and the pseudo-locale run (+40%) has no overflow or clipping', weight: 5, mandatory: false, gates: ['G7'], source: 'copy' },
  { id: 'U13', section: 'Performance and rendering', criterion: 'web-perf within budget (JS, LCP, TBT, CLS); long lists paginated or virtualised; images sized; reduced motion holds', weight: 5, mandatory: false, gates: ['G7', 'G8'], source: 'perf' },
  { id: 'U14', section: 'Security and privacy', criterion: 'ui-privacy clean: no secret in console, URL or web storage; destructive actions confirm or undo', weight: 5, mandatory: false, gates: ['G7'], source: 'privacy' },
  { id: 'U15', section: 'Handoff and readiness', criterion: 'traceability: every screen → component → operation → AC / UB ids; open questions are DEC rows', weight: 5, mandatory: false, gates: ['G5'], source: 'spec' },
  { id: 'U16', section: 'UI QA', criterion: 'visual regression: golden shots of the critical screens within threshold', weight: 3, mandatory: false, gates: ['G8'], source: 'golden' },
  { id: 'U17', section: 'UI QA', criterion: 'browsers: Chromium measured; Firefox and WebKit measured or NOT_RUN with the reason; critical journeys handed to QA', weight: 2, mandatory: false, gates: ['G8'], source: 'reviewer' },
  { id: 'U18', section: 'Gate', criterion: 'no open BLOCKER or MAJOR usability, accessibility or security finding; Product, Design, Engineering and Accessibility approvals by name', weight: 0, mandatory: true, gates: ['G5', 'G7', 'G8'], source: 'reviewer' },
];

export const byId = new Map(CRITERIA.map((c) => [c.id, c]));

/** A status cell → `PASS` … `N/A`, with whether an N/A carries its reason; null when unreadable. */
export function readStatus(cell) {
  const t = String(cell ?? '').replace(/[`*_]/g, '').trim();
  const na = /^N\/A(?:\s*[—–-]\s*(.+))?$/i.exec(t);
  if (na) return { status: 'N/A', reason: (na[1] ?? '').trim() };
  const s = t.toUpperCase().replace(/\s+/g, '_');
  return STATUSES.includes(s) ? { status: s, reason: '' } : null;
}

/**
 * The score and the result of a set of rows (§13.13). Rows carry `status`, `weight`, `mandatory`,
 * and `evidence`; an UNKNOWN whose evidence cites a DEC is waiting for a human's answer.
 */
export function judge(rows) {
  const counted = rows.filter((r) => r.status !== 'N/A');
  const total = counted.reduce((a, r) => a + r.weight, 0);
  const passed = counted.filter((r) => r.status === 'PASS').reduce((a, r) => a + r.weight, 0);
  const score = total ? Math.round((passed / total) * 1000) / 10 : 0;
  const mandatory = counted.filter((r) => r.mandatory);
  const why = [];
  let result;
  if (mandatory.some((r) => r.status === 'FAIL') || score < REVIEW_AT) {
    result = 'BLOCKED';
    for (const r of mandatory.filter((m) => m.status === 'FAIL')) why.push(`mandatory ${r.id ?? r.criterion} FAIL`);
    if (score < REVIEW_AT) why.push(`score ${score} < ${REVIEW_AT}`);
  } else if (counted.some((r) => r.status === 'UNKNOWN' && /\bDEC-\d{3,}\b/.test(r.evidence ?? ''))) {
    result = 'NEEDS_CLARIFICATION';
    why.push('a criterion waits on an open DEC');
  } else if (score < PASS_AT || mandatory.some((r) => r.status !== 'PASS') || counted.some((r) => r.status === 'UNKNOWN')) {
    result = 'REVIEW';
    if (score < PASS_AT) why.push(`score ${score} < ${PASS_AT}`);
    for (const r of counted.filter((m) => (m.mandatory && m.status !== 'PASS') || m.status === 'UNKNOWN')) why.push(`${r.id ?? r.criterion} ${r.status}`);
  } else result = 'PASS';
  return { score, result, why };
}

/** The verdicts a result allows (§13.13): only PASS may ride a `PASS` verdict. */
export function verdictsFor(result) {
  return result === 'PASS' ? ['PASS', 'CHANGES_REQUESTED', 'BLOCKED'] : ['CHANGES_REQUESTED', 'BLOCKED'];
}

/** Rows as the gate log's markdown table, plus the result line E145 reads. */
export function toMarkdown(rows, { score, result }) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const L = ['| Section | Criterion | Status | Weight | Evidence |', '|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${esc(r.section)} | ${esc(`${r.id} ${r.criterion}`)} | ${r.status === 'N/A' ? `N/A — ${esc(r.reason || r.evidence)}` : r.status} | ${r.weight} | ${esc(r.evidence)} |`);
  L.push('', `**UI score:** ${score} · ${result}`);
  return L.join('\n');
}

export const RESULT_LINE = /\*\*UI score:\*\*\s*(\d+(?:\.\d+)?)\s*·\s*([A-Z_]+)/;
