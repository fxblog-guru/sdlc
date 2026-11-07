# release-packet.md (excerpt) — export notes

## Release notes

Exports now include each release's notes. The `--format` flag of `afx export` replaces `--type`; to upgrade, change `--type csv` to `--format csv` (the old flag stops working in 2.0). Help: `afx export --help` and `docs/how-to/export.md`; its examples run in CI (`tests/docs.test.mjs`).
