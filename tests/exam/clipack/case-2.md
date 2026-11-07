# release-packet.md (excerpt) — afx 2.4 (cli)

## Release

Contract diff against 2.3.0: one new flag `--bundle`, no exit code or `--json` field changed, so 2.4.0. `--json` writes only JSON to stdout; progress goes to stderr. CI installs the built wheel on Windows and Linux and runs the golden tests. `afx remove` asks for confirmation, or takes `--yes`.
