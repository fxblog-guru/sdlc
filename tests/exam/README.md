# Role exams (roadmap Step 9, DEV-CONTRACTS §24.3)

One folder per role. Each holds one clean artifact excerpt and one variant per checklist row the
role owns; a variant breaks that row and nothing else. `key.json` says which case breaks which row.

    node tests/exam/build.mjs                  rewrite the cases and key.json from build.mjs's table
    node tests/exam/grade.mjs <answers.json>   grade a run: { roles: { <role>: { <case>: [rows] } } }

**Taking the exam.** Spawn one `dev-gate-reviewer` per role with the case files, the reviewing skill
and the principles file named in `key.json`, and the rows to judge. Never give it `key.json`,
`build.mjs` or this folder's tests. It answers, per case, the rows the case fails. A role passes only
when every seeded flaw is found and the clean case passes; a false alarm fails it too.

**When to rerun.** Whenever a principles file or a reviewer row it cites changes. Record the answers in
`docs/evidence/exam/answers-<date>.json`; `tests/role-packs.test.mjs` grades the latest run.

**Adding a role or a row.** Add the row to the reviewing skill citing the principles file, then a
flaw to `ROLES` in `build.mjs` that breaks one section of the clean case, then rebuild and rerun.
