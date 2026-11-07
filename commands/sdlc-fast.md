---
description: Fast track · decide once (G0, G1, the look), then build usable slices on a deploying skeleton.
disable-model-invocation: true
argument-hint: <slug> [--slice <n>]
---

Fast-track `$1`.

The requester wants a product they can use now. The gates that stay are the ones that are
expensive to get wrong late: G0 (the problem, and where it runs and where its keys live), G1 (what
is built, with acceptance criteria) and the look at G5 when there is UI. The analysis gates in
between (G2, G3, G4, G6) are replaced by one file, `<root>/plan/$1/slices.md`, and each slice is
built, tested, started and smoked before the next one starts (§15.1).

## Preflight

0. The slug is class `fast`. With no slug yet, run `/sdlc-intake $1 --class fast` first: it frames
   G0 and writes the G2, G3, G4, G6 and G11 skips by class, so this command never writes one.
1. The requester asked for the fast track in writing. Their words and the date go in
   `## Requested`; without them, stop and ask. "Go fast" from anyone else is not a request.
2. G0 and G1 `PASS`. G5 `PASS` or `SKIPPED` (its reviewer decides whether there is UI). A G1
   `CHANGES_REQUESTED` is not fast-tracked past; it is fixed.
3. `node <root>/scripts/build-state.mjs --quiet`.

## Plan the slices, once

Copy `<root>/_templates/slices.md` to `<root>/plan/$1/slices.md` and fill it:

- **Slice 1 is the deploying skeleton**, before any feature: the pipeline that builds the image,
  deploys `staging` on every merge and `production` as a manual job; every key in
  `ops/config/keys.md` with its value in the store; `env-doctor.mjs` in the deploy job (§13.4).
  Start from `<root>/_templates/skeleton/` and the CI template `DEV-PROFILE §Delivery` names.
- **Every later slice is something a user can do on its own.** "A user can then" is an action, not
  a layer: "write a note and find it", never "the notes table". Order by what the requester needs
  first.
- **Escalates.** A slice touching sign-in or permissions, secrets, money or personal data names
  `G2`; a migration that is not purely additive names `G3`; a breaking change to a published API
  names `G4`. Run that gate for that slice before its G7 — `/sdlc-design $1`, `/sdlc-data $1` or
  `/sdlc-api $1`, writing only the threat model, the migration plan or the contract diff.
- **Decisions you take for the requester** are `DEC-NNN` rows, `status: assumed`, in
  `<root>/decisions/$1.md`, and listed in `## Decisions`.
- **Rollout and rollback.** `slices.md` starts at `deploy_impact: none`. The slice that first
  touches a migration, a schema file, a contract or an event schema fills the section the way
  `_templates/pull-request.md` shows it (the key lines, same names and values, then the snapshot command for this
  host, migrate on `staging` before `production`, rollback per layer, a decider by name), and adds
  `### Data` when it changes rows already there. Escalating G3 or G4 does not replace it: the gate
  judges the design, the section says how this slice deploys.

`node <root>/scripts/fast-check.mjs $1` must exit 0 before slice 1 starts, and again before each
slice. It checks the request, the skeleton, the columns, the escalations and the decisions.

## Build, one slice at a time

For slice `n` (or `--slice <n>`), run `/sdlc-implement $1` with the slice's row as the brief. The
implementer works on the feature branch, commits per change (`feat(<scope>): …`, §18.1), and ends
the slice only when:

1. the full test suite is green on the slice's head commit;
2. the app builds and starts from a clean checkout;
3. the slice's Smoke runs against the started app (or `staging`, from slice 2) and passes.
4. `node <root>/scripts/deploy-plan-check.mjs $1 --base <the slice's base sha>` exits 0: a slice
   that touched the database or an API states how it deploys and comes back.

The reviewer writes a G7 slice log, `scope: slice-<n>` (§5.5), with the base and head shas in
`## Scope`, and also judges the slice's row (`dev-reviewing-implementation`, rows F1–F4). A slice
that fails goes back to its own row; the next slice does not start on a red one.

## After the last slice

The final G7 log (no `scope`) reviews the whole branch. Then `/sdlc-verify $1` (G8), `/sdlc-release
$1` (G9), and `/sdlc-deploy $1 staging` then `production` (G10), which deploy through the slice-1
pipeline, never from a laptop.

Say the next command as the thing that happens next (§4.1a), then
`node <root>/scripts/status.mjs $1` verbatim.

## Refuse

- To start a feature slice before the skeleton deploys to `staging`. A pipeline added at the end is
  the deploy that breaks on release day.
- To build a slice that escalates while its gate is still `SKIPPED`.
- To fast-track without the requester's words. The class drops reviews; only the person who owns
  the product can trade them for speed.
- To keep going when the work outgrows the class: a second service, or a data model nobody can draw
  in one table, is an `initiative` (§15.1). Say so and re-classify.
