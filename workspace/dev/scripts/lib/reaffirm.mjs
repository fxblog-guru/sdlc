/**
 * The mechanical half of the bounded self-edit reaffirm (DEV-CONTRACTS §4.4).
 *
 * A gate's own artifact may change after its review and be reaffirmed instead of re-run, but only
 * inside a bound a script can check: few changed lines, no heading touched, no id appearing or
 * disappearing, no row that defines an id edited. What a script cannot see — whether the edit
 * touches something a checklist row judged — stays with the reviewer.
 */

import { parseDoc } from './doc.mjs';

export const MAX_CHANGED_LINES = 40;

const ID = /\b(?:(?:REQ|ADR|TASK|CR|DEC|SLO|AC)-\d{3,}|MIG-\d{12}|ENT-[A-Z][A-Z0-9_]*|API-[A-Z]+-[a-z0-9-]+)\b/g;
const ID_ROW = /^\|\s*`?((?:REQ|ADR|TASK|CR|DEC|SLO|AC)-\d{3,}|MIG-\d{12}|ENT-[A-Z][A-Z0-9_]*|API-[A-Z]+-[a-z0-9-]+)`?\s*\|/;
const AMENDMENTS = '## Amendments';

/** A line diff of two bodies: [{ op: ' ' | '-' | '+', text, section }], by longest common subsequence. */
function lineDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    // `at` is the line's index in the document it belongs to: the new one for ' ' and '+', the old for '-'.
    if (i < n && j < m && a[i] === b[j]) { out.push({ op: ' ', text: b[j], at: j }); i += 1; j += 1; }
    else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) { out.push({ op: '+', text: b[j], at: j }); j += 1; }
    else { out.push({ op: '-', text: a[i], at: i }); i += 1; }
  }
  return out;
}

/** For each line, the `## ` heading it sits under ('' before the first). */
function sections(lines) {
  let current = '';
  return lines.map((l) => {
    if (/^## /.test(l)) current = l.trim();
    return current;
  });
}

/**
 * @returns {{ ok: boolean, changedLines: number, amendmentOnly: boolean, reasons: string[], diff: string }}
 */
export function boundedDiff(oldText, newText, maxLines = MAX_CHANGED_LINES) {
  const a = parseDoc(oldText).body.split('\n');
  const b = parseDoc(newText).body.split('\n');
  const secA = sections(a);
  const secB = sections(b);
  const diff = lineDiff(a, b);
  const changed = diff.filter((d) => d.op !== ' ');
  const reasons = [];

  // Where a changed line sits: a removed line in the old document, an added one in the new.
  const sectionOf = (d) => (d.op === '+' ? secB[d.at] : secA[d.at]);
  const inAmendments = (d) => sectionOf(d) === AMENDMENTS;
  const amendmentOnly = changed.length > 0 && changed.every((d) => d.op === '+' && (inAmendments(d) || d.text.trim() === '' || d.text.trim() === AMENDMENTS));

  if (changed.length > maxLines) reasons.push(`${changed.length} changed lines, more than ${maxLines}`);

  for (const d of changed) {
    if (/^## /.test(d.text) && !(amendmentOnly && d.text.trim() === AMENDMENTS)) {
      reasons.push(`heading ${d.op === '+' ? 'added' : 'removed'}: \`${d.text.trim()}\``);
    }
    if (d.op === '-' && inAmendments(d) && d.text.trim()) reasons.push('`## Amendments` is append-only — an existing entry was changed or removed');
    const row = ID_ROW.exec(d.text.trim());
    if (row && !inAmendments(d)) reasons.push(`the row defining ${row[1]} changed`);
  }

  // Ids cited in a new amendment are citations, not changes to what the artifact defines.
  const idsOf = (lines, secs) => new Set(lines.filter((_, k) => secs[k] !== AMENDMENTS).flatMap((l) => l.match(ID) ?? []));
  const before = idsOf(a, secA);
  const after = idsOf(b, secB);
  const added = [...after].filter((x) => !before.has(x));
  const removed = [...before].filter((x) => !after.has(x));
  if (added.length || removed.length) {
    reasons.push(`ids changed: ${[...added.map((x) => `+${x}`), ...removed.map((x) => `-${x}`)].join(' ')}`);
  }

  return {
    ok: reasons.length === 0,
    changedLines: changed.length,
    amendmentOnly,
    reasons: [...new Set(reasons)],
    diff: changed.map((d) => `${d.op} ${d.text}`).join('\n'),
  };
}

/**
 * Plan a batch reaffirm (DEV-CONTRACTS §4.4, `--reaffirm-all`) from one initiative's derived stages.
 *
 * `locate(path, recordedSha256)` returns the commit of the reviewed version of an input, or null when
 * history does not have it. `dependsOn` is the §4.2 graph (`{ G6: ['G3', 'G4', 'G5'], … }`): a gate
 * that depends on an excluded gate waits for it. Pure apart from `locate`, so the grouping is
 * testable without git.
 *
 * @returns {{ reaffirm: Array<{ gate, log, inputs: Array<{ path, was, now, commit }> }>,
 *             follows: Array<{ gate, origin }>, excluded: Array<{ gate, reason }> }}
 */
export function planCascade(stages, locate, dependsOn = {}) {
  const plan = { reaffirm: [], follows: [], excluded: [] };
  const held = new Set();
  const waitsOn = (gate) => {
    const seen = new Set();
    const walk = (g) => (dependsOn[g] ?? []).find((d) => held.has(d) || (!seen.has(d) && seen.add(d) && walk(d)));
    return walk(gate);
  };
  const exclude = (gate, reason) => { held.add(gate); plan.excluded.push({ gate, reason }); };

  for (const s of stages) {
    if (s.state !== 'STALE') continue;
    const because = s.stale_because ?? [];
    const output = because.find((b) => b.role === 'output');
    if (output) {
      exclude(s.gate, `its own output changed (${output.path}) — single-gate --reaffirm within the self-edit bound, or re-run the stage`);
      continue;
    }
    const upstream = because.find((b) => b.role === 'upstream');
    if (upstream) {
      plan.follows.push({ gate: s.gate, origin: String(upstream.path).replace(/^\(upstream (G\w+)\)$/, '$1') });
      continue;
    }
    const blocker = waitsOn(s.gate);
    if (blocker) {
      exclude(s.gate, `waits for ${blocker}, which is excluded — reaffirm once ${blocker} has a new log in force`);
      continue;
    }
    const inputs = [];
    let missing = null;
    for (const b of because) {
      const commit = locate(b.path, b.was);
      if (!commit) { missing = b.path; break; }
      inputs.push({ path: b.path, was: b.was, now: b.now, commit });
    }
    if (missing) exclude(s.gate, `the reviewed version of ${missing} is not in git history — re-run the stage`);
    else plan.reaffirm.push({ gate: s.gate, log: s.log, inputs });
  }
  return plan;
}
