/**
 * lib/rounds.mjs — how many full reviews a gate has had since it last passed (DEV-CONTRACTS §4.3).
 *
 * A round is a gate log that is not a reaffirm, a skip or a G7 slice review. Rounds are counted per
 * gate across runs, because a new run after CHANGES_REQUESTED is the same disagreement with a new
 * id; a PASS or a human override starts the count again. Past ROUND_CAP the human decides, and the
 * third round's log cites that decision as `round_decision` (lint E045). The board reads the same
 * count (build-state), so what lint refuses and what the dashboard shows cannot disagree.
 */

export const ROUND_CAP = 2;

const set = (v) => v != null && String(v) !== 'null' && String(v) !== '';

/**
 * logs: [{ fm }] for one slug, any gates. Returns { perLog: Map(log → round, 0 when not a round),
 * open: Map(gate → rounds since its last PASS or override) }.
 */
export function roundsOf(logs) {
  const perLog = new Map();
  const open = new Map();
  const ordered = [...logs].sort((a, b) => String(a.fm.run_id ?? '').localeCompare(String(b.fm.run_id ?? '')) || Number(a.fm.attempt ?? 1) - Number(b.fm.attempt ?? 1));
  for (const l of ordered) {
    const gate = String(l.fm.gate);
    const verdict = String(l.fm.verdict ?? '');
    if (set(l.fm.revalidated_from) || verdict === 'SKIPPED' || set(l.fm.scope)) {
      perLog.set(l, 0);
      if (verdict === 'PASS') open.set(gate, 0);
      continue;
    }
    const round = (open.get(gate) ?? 0) + 1;
    perLog.set(l, round);
    open.set(gate, verdict === 'PASS' || set(l.fm.override) ? 0 : round);
  }
  return { perLog, open };
}
