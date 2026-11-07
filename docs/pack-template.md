# Pack template — adding a product type

Written for: a contributor bringing a new kind of product to the bundle (desktop, mobile, editor
extension, CLI, data pipeline, …). DEV-CONTRACTS §25 is the rule; this is the checklist.

The gates G0–G11 do not change per product type. What changes is what a few of them mean: where code
goes, how it is tested, how it ships, and what "operate" watches. A pack is those parts, nothing more.
If a pack seems to need a new gate, the gate is web-shaped. Generalise it instead.

## The six parts

| Part | Where | What it answers |
|---|---|---|
| 1. Blueprint | `skills/dev-resolving-code-placement/blueprints/<type>-<stack>.md`, ending in the JSON `## Rules` block | Where each kind of code goes; what the "API contract" is for this type (IPC messages for Electron, contribution points for an editor extension, flags and exit codes for a CLI, data contracts for a pipeline) |
| 2. Code skill | `skills/dev-writing-<lang>-code/` + an adapter in `lib/langs.mjs` (CONTRIBUTING "Adding a language") — only if the language is new | Idioms, error handling, threading or process model, packaging |
| 3. Verify recipe | a reference file under `dev-running-verification/` | How it is tested end to end: drive the window, the store build, the CLI with fixtures, the pipeline with data tests |
| 4. Release | a reference file under `dev-packaging-release/` and `dev-planning-deployment/` | Signing, the installer or package, the update channel, the rollback (an older build, a feature flag, an un-publish) |
| 5. Operate | a reference file under `dev-designing-observability/` | What replaces SLOs: crash-free rate, update adoption, activation errors, data freshness |
| 6. Registry | `lib/coverage.mjs` `PACKS[<type>]` + the `Product type` line in `DEV-PROFILE.md` | Moves the type from `generic` to `preview`, and a stack from `preview` to `full` |

## The proof a pack needs

A pack lands in `PACKS` only after, on a real repository of that type:

1. `/sdlc-onboard` builds the six knowledge cards and GK passes.
2. One `change` initiative passes G6–G9 with the pack's references in use.
3. `bench.mjs score` on that repository is recorded in `docs/evidence/`, next to the web baseline.

Until then the type stays `preview` in `doctor.mjs`, and the bundle says so instead of implying it knows.

## Proving grounds in this workspace

| Pack | Repository |
|---|---|
| desktop (Electron) | screen-spider, meeting-capture |
| extension (VS Code) | editor/vscode-sdlc, afx-router |
| cli, library | cli-afx, vietlott-lab |
| ai | rag-reference-guide, recall's AI layer |
| data | dbt-elt, spack-elt |
