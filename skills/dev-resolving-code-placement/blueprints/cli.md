# Blueprint: cli (preview)

A command-line tool or a library with a CLI. Its contract is its flags, its exit codes and its
`--json` output; changing any of them is a breaking change, judged at G4 like an API. `preview`
until proven on cli-afx; the pack's verify, release and operate parts are `dev-packaging-release/cli.md`.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Interface | [Command Line Interface Guidelines](https://clig.dev/) | `--help` on every command, `--json` for machines, stdout for data and stderr for messages |
| Exit codes | `0` ok · `1` the check or task failed · `2` usage error | the same three in every command |
| Versioning | [Semantic Versioning](https://semver.org/) + [Keep a Changelog](https://keepachangelog.com/) | a removed flag or a changed exit code is MAJOR |
| Layout | [PyPA src layout](https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/), Go `cmd/` + `internal/` | the entry point is thin; logic is importable and tested without the shell |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── src/<pkg>/   (Python)   or   cmd/<tool>/ + internal/   (Go)
│   ├── cli/          argument parsing and output formatting only
│   ├── commands/     one module per command: parse → call core → render
│   └── core/         the logic; never prints, never reads argv, never exits
├── tests/{unit,integration,golden,fixtures}/   golden: exact stdout, stderr and exit code per case
├── docs/  dev/
├── pyproject.toml  (or go.mod)   CHANGELOG.md
```

## Rules beyond the shared ones

1. `core/` never prints, reads `sys.argv` or calls `exit`. Only `cli/` and `commands/` touch the shell.
2. Every command has a golden test of its `--help`, one success and one usage error.

## Rules

```json
{
  "name": "cli",
  "requiredDirs": ["tests", "docs", "dev"],
  "requiredFiles": ["README.md", "CHANGELOG.md", ["pyproject.toml", "go.mod", "package.json", "Cargo.toml"]],
  "codeRoots": ["src", "cmd", "internal", "tests", "scripts", "dev"],
  "rootCode": ["setup.py", "noxfile.py"],
  "tests": { "root": "tests", "tiers": ["unit", "integration", "golden", "fixtures"], "rootFiles": ["README.md", "conftest.py"], "placement": [] },
  "packageCeiling": 40,
  "imports": [
    { "lang": "python", "from": "src/*/core/**", "deny": ["src/*/cli/**", "src/*/commands/**", "click", "typer", "argparse"], "why": "core is importable without the shell" },
    { "lang": "go", "from": "internal/core/**", "deny": ["internal/cli/**", "flag", "github.com/spf13/cobra"], "why": "core is importable without the shell" }
  ]
}
```
