# Mutation testing at G8

Written for: whoever sets up a project's `DEV-PROFILE §Quality gates` mutation row, and for the G8
verifier running it on Windows. The rule is DEV-CONTRACTS §13.10; the gate is
`dev-running-verification`.

## What it measures, and why on changed modules only

A mutant is a small deliberate bug (a flipped condition, a `+` that became `-`). A test suite that
still passes has a test that cannot fail on that line. Mutating a whole repository takes hours and
says nothing about this change, so G8 mutates only the files `git diff <base>...HEAD` names, and
`mutation-score.mjs` reports per module (the directory of a source file):

```
score = (killed + timed out) / (killed + timed out + survived + no coverage)
```

Compile errors, ignored and not-viable mutants are left out. A changed module with no mutant in any
report is `NOT RUN`.

## Web / TypeScript — Stryker

Dev dependencies of the web project, not of the bundle:

```bash
npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner   # or @stryker-mutator/jest-runner
```

`stryker.config.json` beside `package.json`:

```json
{
  "testRunner": "vitest",
  "reporters": ["json", "clear-text"],
  "coverageAnalysis": "perTest",
  "concurrency": 4,
  "thresholds": { "high": 80, "low": 60, "break": null }
}
```

Mutate only the changed files. In Git Bash:

```bash
BASE=$(git merge-base origin/main HEAD)
FILES=$(git diff --name-only "$BASE"...HEAD -- 'web/src/**/*.ts' 'web/src/**/*.tsx' \
  | grep -vE '\.(test|spec)\.tsx?$' | sed 's#^web/##' | paste -sd, -)
(cd web && npx stryker run --mutate "$FILES" 2>&1) | tee <root>/verification/<slug>/runs/<run-id>/logs/mutation-web.txt
```

Leave `break` null: the threshold is applied per module by `mutation-score.mjs`, not by Stryker's
global score.

## Go — gremlins

```bash
go install github.com/go-gremlins/gremlins/cmd/gremlins@v0.5.0   # pin the version DEV-PROFILE names
gremlins unleash --diff "$BASE" --output gremlins.json ./... 2>&1 | tee <root>/verification/<slug>/runs/<run-id>/logs/mutation-go.txt
```

`--diff` restricts mutants to changed lines. `go-mutesting` works too, but it has no JSON report;
use gremlins so the reduction is mechanical.

## Reduce and record

```bash
node <root>/scripts/mutation-score.mjs \
  --report web/reports/mutation/mutation.json --prefix src=web/src \
  --report gremlins.json \
  --base "$BASE" --threshold 60
```

Paste its table into `coverage.md` `## Mutation score`, and the line into `verify.md`'s
`Mutation score` row. Exit 1 means a changed module is below the threshold or was not measured.

## Windows

- Run the commands in Git Bash, not `cmd.exe`: the `$(...)` file lists and `tee` need it. In
  PowerShell, `npx stryker run` works but build the `--mutate` list with
  `(git diff --name-only $BASE...HEAD) -join ','`.
- `unset ELECTRON_RUN_AS_NODE` first when the shell was opened from VS Code; Node child
  processes otherwise start as Electron's Node and Stryker's workers fail with an error that names
  the wrong file.
- Stryker copies the project into `.stryker-tmp/`. Antivirus scanning that copy is the usual reason
  a run is ten times slower on Windows: exclude the folder, or set `"tempDirName"` to a path that is
  excluded. Add `.stryker-tmp/` and `reports/` to `.gitignore`.
- Long paths: `git config core.longpaths true` and keep the checkout near the drive root if
  `node_modules` copies fail with `ENAMETOOLONG`.
- gremlins needs a C toolchain only when the package uses cgo; `go env CGO_ENABLED=0` avoids it.
- Use a lower `concurrency` (2–4) on a laptop; every worker runs the whole test runner.
