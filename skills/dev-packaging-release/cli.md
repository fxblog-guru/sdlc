# CLI and library pack: verify, release, operate (preview)

Read this when `DEV-PROFILE` `Product type` is `cli` or `library`. The tree is
`dev-resolving-code-placement/blueprints/cli.md`. G9 row 24 cites this file. A CLI's users are
scripts as often as people: a changed exit code or a reworded `--json` field breaks someone's
pipeline without a message.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Exit codes, flags and `--json` are the API | Scripts depend on them; changing one is a MAJOR | Output marked experimental |
| 2 | stdout is data, stderr is talk | Piping breaks when progress messages land in stdout | — |
| 3 | Golden tests per command | Exact stdout, stderr and exit code catch the change a unit test misses | — |
| 4 | Works on every OS it claims | Paths with spaces, `\` vs `/`, encodings and line endings break on Windows first | A tool that names one OS |
| 5 | Safe by default | Destructive commands ask, or need `--yes`; `--dry-run` exists | — |
| 6 | Install from the published artifact in CI | A wheel or binary that installs on a clean machine is the real test | — |
| 7 | Deprecate before removing | A flag warns for a minor version before it goes | — |
| 8 | Errors say what to do | "config not found at X; run `tool init`" beats a stack trace | — |

## Verify, release, operate

| Part | What G8–G11 expect |
|---|---|
| Verify (G8) | golden tests per command, a run on each OS it claims, an install from the built wheel or binary |
| Release (G9) | semver from the contract diff, `CHANGELOG.md`, the published artifact named (PyPI, npm, release binaries) |
| Operate (G11) | downloads by version, issues by version, the oldest version still in use |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Exit code changed in a patch | A different exit code for the same case with no MAJOR |
| Progress text on stdout | `--json` output preceded by log lines |
| Tested only from the source tree | No install-from-artifact step |
| `rm` without confirmation | A destructive command with no prompt, `--yes` or `--dry-run` |

G9 fails a CLI release that commits one of these.
