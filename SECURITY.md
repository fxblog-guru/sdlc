# Security

This bundle is a set of Markdown instructions, Node scripts and templates that run inside Claude
Code on your machine. It ships no server and makes no network calls of its own. Telemetry is
**opt-in**: two hooks call the `recall` CLI (team memory and usage) only where it is installed and
`RECALL_URL` is set, and exit silently otherwise. The only things it executes are the scripts under `workspace/dev/scripts/` and `hooks/`, and
the quality-gate commands **you** list in `DEV-PROFILE.md §Quality gates`.

## What the bundle will not do

- Write a secret into an artifact, a gate log, or a commit (`DEV-CONTRACTS.md §12.5`).
- Run a migration, push, deploy or publish without a human's confirmation — those commands are in
  `settings.json → permissions.ask`, never `allow`.
- Let an agent override a gate. `override:` requires a human name and reason (§4.5).

## Reporting

Open a confidential issue on the GitLab project, or email the maintainers listed in the project
page. Please include the bundle version (`VERSION`), the command that was running, and the gate log
if one was written. We aim to acknowledge within five working days.

## Supply chain

Skills adapted from third parties are listed with their upstream commit in `docs/skill-sources.md`;
design-token presets derived from GitHub Primer (MIT) and IBM Carbon (Apache-2.0) say so in the
preset file. The bundle's own tests (`node --test tests/*.test.mjs`) run in CI on every change.
