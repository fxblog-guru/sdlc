# Autonomy — running the protocol unattended (DEV-CONTRACTS §4.6)

Read this when `node <root>/scripts/autonomy.mjs mode` prints `assisted` or `full`. With `off`, the
protocol runs as written and this file does not apply.

The run is told its run-id. A human started it with `autonomy.mjs start --run <run-id> --by <name>`;
if `autonomy.mjs assume` says the run was never started, stop and report it.

## What changes

- **Preflight step 6 and §4 step 1 (a DEC that only a human can answer).** Do not stop for it.
  Run `autonomy.mjs assume <slug> <DEC-NNN> --run <run-id> --reason "<one line: why the default
  is safe for now>"`. Exit 0 means the row is `assumed`, so carry on. Exit 3 means the mode says ask
  (in `assisted`, a DEC that blocks a gate). Stop there and report that DEC.
- **§5 step 2.** Do not end the turn after a PASS. Run the next stage's command and keep going until
  G9, a hard stop, or a gate that has not converged after attempt 2.
- **Before every outward step**, run `autonomy.mjs check <action> --run <run-id> --slug <slug>`:
  `push-main`, `merge-main`, `deploy-prod`, `delete-data`, `spend`, a scanner suppression
  (`suppress-scanner`), a permission widened (`widen-access`), the G5 approval (`ui-approval`), and
  the G9 sign-off (`release-signoff`).
  - Exit 0: go on.
  - Exit 4: provisional. Record the sign-off as pending in the gate log's Override row and go on,
    on the branch only.
  - Exit 3: stop now. Say which action and why, in one line.
- **After every spawn**, add its token count with `autonomy.mjs budget --run <run-id> --tokens <n>`.
  Exit 3 means stop.

## What does not change

Reviews still run in a fresh context, and only the reviewer decides a verdict or a `SKIPPED`.
Attempt 2 is still the last attempt, and tests still have to be green. An agent never writes
`override:`, never answers a DEC outright (only `assume` through the script), and never edits a
passed upstream artifact. At the end, `autonomy.mjs report --run <run-id>` writes the report that
becomes the merge request description. Only a human runs `autonomy.mjs
resolve`, after reviewing the stops.
