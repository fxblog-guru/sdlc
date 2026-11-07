// Grades a role exam (roadmap Step 9). The answers are what an independent reviewer reported per case:
// the checklist rows it failed. A role passes only when every seeded flaw is found, the clean case
// passes, and no case is failed on a row the key does not expect. A reviewer that fails everything
// scores no better than one that fails nothing.
//   node tests/exam/grade.mjs <answers.json>          answers: { role: { case: [row, …] } }
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** { role: { pass, found, of, missed: [case row], falseAlarms: [case row] } } */
export function grade(key, answers) {
  const out = {};
  for (const [role, k] of Object.entries(key)) {
    const given = answers[role] ?? {};
    const missed = [];
    const falseAlarms = [];
    let found = 0;
    let of = 0;
    for (const [name, want] of Object.entries(k.cases)) {
      const got = new Set((given[name] ?? []).map(Number));
      for (const row of want) { of++; if (got.has(row)) found++; else missed.push(`${name} row ${row}`); }
      for (const row of got) if (!want.includes(row)) falseAlarms.push(`${name} row ${row}`);
    }
    out[role] = { pass: !missed.length && !falseAlarms.length, found, of, missed, falseAlarms };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const key = JSON.parse(readFileSync(join(HERE, 'key.json'), 'utf8'));
  const answers = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const g = grade(key, answers.roles ?? answers);
  for (const [role, r] of Object.entries(g)) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${role.padEnd(10)} ${r.found}/${r.of} flaws found, ${r.falseAlarms.length} false alarm(s)`);
    for (const m of r.missed) console.log(`        missed      ${m}`);
    for (const f of r.falseAlarms) console.log(`        false alarm ${f}`);
  }
  process.exit(Object.values(g).every((r) => r.pass) ? 0 : 1);
}
