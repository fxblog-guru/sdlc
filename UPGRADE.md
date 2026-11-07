# Upgrading agentic-fx-dev

Written for: someone whose project already has the bundle installed and who has been told an update
exists, by the session-start line, the VS Code board, or `afx`. What changed is in
[CHANGELOG.md](CHANGELOG.md); this file says what to *do*.

## How you hear about an update

`afx` records the installed version in `.claude/.agentic-fx.json` and, when it checks, writes
`.claude/.agentic-fx-updates.json`. The bundle only reads that file and never goes to the network
itself:

- the SessionStart hook prints one line, for example
  `agentic-fx-dev 1.6.0 available (installed 1.5.0, minor) — afx update --bundle dev · <changelog>`;
  a MAJOR adds `MAJOR: read UPGRADE.md first`;
- the VS Code board turns its version pill amber ("update"); click it to open the changelog, run
  the update in a terminal, or dismiss that version.

Set `AFX_NO_UPDATE_CHECK=1` to silence both.

## Every upgrade, whatever the kind

`<root>` is the SDLC root (DEV-CONTRACTS §2): `.sdlc` on a new project, `dev` on one installed
before 1.6.0.

1. Commit or stash your work. The installer replaces bundle files under `.claude/` and `<root>/scripts/`;
   your artifacts, gate logs and `DEV-PROFILE.md` are yours and are not touched.
2. Read the CHANGELOG entries between your version and the new one. For a MAJOR, read its section
   below first.
3. Run `afx update --bundle dev`.
4. Run `node <root>/scripts/doctor.mjs` and do what it lists. `--prune` shows files a renamed skill,
   agent or command left behind; `--prune --yes` removes them.
5. Run `node <root>/scripts/build-state.mjs` so the board and `DASHBOARD.md` come from the new builder.
6. Run `node <root>/scripts/lint-dev.mjs`. New rules fire as warnings on logs judged before them; an
   error means something the release notes call out as a migration step.

| Kind | What it means | Extra steps |
|---|---|---|
| PATCH (x.y.**Z**) | wording, fixes; no rule changes | none |
| MINOR (x.**Y**.0) | new sections, rules, checkers; old gates stay PASS | the version's section below, if any |
| MAJOR (**X**.0.0) | a contract section renumbered or removed, a command or artifact renamed | always the version's section below; the CHANGELOG has a `### Breaking` list |

## Unreleased (MINOR)

The deploy target binds from G0. The new errors fire on lint; adding the new section stales G2 (step 1).

1. Every `architecture.md` needs a `## Deploy target` section after `## Interfaces` (E004 until it
   has one) with five lines: `Host:`, `Shape:`, `Environments:`, `Pipeline:`, `Who deploys:` (E041).
   For a slug already past G2, `Host: unchanged — <link>` is enough. A new `##` heading is outside
   the reaffirm bound (§4.4), so G2 goes `STALE` and re-runs for an open slug; for a shipped slug,
   add the section in the same commit as the upgrade and record why in its next change.
2. An open `initiative` plan with no pipeline task (`Pipeline` or `Walking skeleton`) fails lint (E042); one with more than
   five `assumed` decisions past G2 fails (E044). Ask with `/sdlc-ask`, or plan the task.
3. A gate whose log in force is its third or later full review since it last passed fails lint
   (E045) until that log cites an answered `round_decision: DEC-NNN`. Older rounds in superseded
   logs are warnings only. Put the open findings to the owner (`/sdlc-ask`) and record the answer.
4. Optional: a project already past G6 can copy the skeleton's `.gitlab-ci.yml` deploy stages,
   `ops/deploy.sh` and `ops/compose.prod.yaml` from `<root>/_templates/skeleton/`; set the CI
   variables `ops/deploy.sh` names (SSH key, known hosts, host and URL per environment).
5. `env-doctor.mjs` now refuses a display name in an `email` key (`Name <a@b.dev>`) and fails a mail
   sender key (`*_SMTP_FROM`, `*_MAIL_FROM`, `*_EMAIL_FROM`) on a free-mailbox domain or a domain
   with no DMARC record. Set the sender's Format in `ops/config/keys.md` to `email-sender` (or a
   `/regex/` if the app takes a display name), run `env-doctor.mjs --env <env>` once with DNS, and
   pass `--dkim-selector` with the provider's selector if it warns on DKIM. A shipped product that
   sends from a free mailbox records the move to its own domain as a task.
6. Every `pull-request.md`, `slices.md` and `release-plan.md` needs `## Rollout and rollback` (E004
   until it has one): in `pull-request.md` after `## Risk and rollout`, in `slices.md` before
   `## Decisions`, in `release-plan.md` before `## Migration ordering`. A slug with no DB or API
   change writes `deploy_impact: none`. A new `##` heading stales G9 (and G10) for an open slug, as
   in step 1. Add the `sdlc:deploy-plan` job from `<root>/ci/gitlab-ci.yml` (or the GitHub
   step) if your pipeline copies jobs rather than including the file. Optional: copy
   `ops/snapshot.sh` and the `DB_SNAPSHOT` line of `ops/deploy.sh` from the skeleton.

## 1.11.0 (MINOR, from 1.10.x)

Nothing changes for an initiative already under way: the new rows apply when a gate next runs.

1. `npx agentic-fx@latest update --bundle dev` (or `afx update --bundle dev`), then
   `node <root>/scripts/doctor.mjs`.
2. For an `initiative` whose G0 has not passed yet, G0 now asks for the production host, the
   environments, who deploys and the secret store. Each gap becomes a `DEC-NNN` that blocks G2.
3. Before the next deploy, list the keys in `ops/config/keys.md` (template in
   `_templates/skeleton/ops/config/`) and run `node <root>/scripts/env-doctor.mjs`. `/sdlc-deploy`
   stops with `BLOCKED` on a finding. Move any production value out of a local `.env` into the
   host's store: G10 row 28 fails on it.
4. Optional: `/sdlc-intake --class fast|refactor|spike` for new work that fits those classes.

## 1.10.0 (MINOR, from 1.9.x)

Three judgment checks become lint errors, and work is sized before it starts. Gates that already
passed stay `PASS`; the new errors fire when an artifact is next written.

1. `afx update --bundle dev`, then `node <root>/scripts/doctor.mjs`.
2. Set `Token budget` under `DEV-PROFILE §Gate policy` (or `SDLC_BUDGET_TOKENS`). Without one,
   `size.mjs estimate` never stops a stage.
3. For each open initiative, run `node <root>/scripts/size.mjs estimate <slug>` once. Until then,
   stage preflight reports `no estimate`.
4. An open `initiative` with no `Kill:` line now fails lint (`E038`). A `release-plan.md` with an
   empty `## Rollback` fails (`E035`). An `UNVERIFIED:` claim inside `## Decision` fails (`E037`).
   Fix these before the next gate run.
5. Optional: record actual tokens per gate with `size.mjs actual`, so `bench.mjs` and the G11
   cost check have numbers to compare.

## 1.8.0 (MINOR, from 1.7.x)

The project now learns from its own reviews, and the gates check more. Nothing already `PASS` goes
`STALE`: every new checklist row is appended, so existing numbers hold, and new lint rules are
warnings (`W095`–`W098`).

1. `afx update --bundle dev`, then `node <root>/scripts/doctor.mjs`. A stack with no language adapter
   used to fail here; it is now a `generic` warning that says what it means. Set `Product type` in
   `DEV-PROFILE §Stacks` if the project is not a web app.
2. Commit `<root>/learnings/` and `<root>/ideas.md` when they appear. `<root>/logs/` stays ignored.
3. The next session opens with `learn.mjs brief`. Signals it names become lessons through
   `/sdlc-learn`.
4. For an open `initiative`, add the `Kill:` line (`W097`, an error `E038` from 1.10.0) and `## Pillars` (`W098`) to `problem.md`
   before its next G0 run. G0 rows 13–17 now fail without them.
5. Optional: record an `Actual` column in `progress.md`, so `bench.mjs score` can calibrate the next
   plan's estimates.

## 1.7.0 (MINOR, from 1.6.x)

Presets gain an optional `host_theme`, so an editor-hosted UI can follow the host's theme. A
preset without it renders exactly as before. One thing gets stricter: `design-system.mjs check` now
compares `tokens.css` with `design-tokens.json`, so a project whose tokens.css was edited by hand,
or rendered by an older bundle, fails `check` until it is re-rendered.

1. `afx update --bundle dev`, then `node <root>/scripts/doctor.mjs`.
2. `node <root>/scripts/design-system.mjs check` (add `--tokens <root>/docs/<surface>`, and `--css
   <path>` if tokens.css lives outside the tokens directory). If it reports that tokens.css is not
   what the json renders, look at the line it names. A hand edit belongs in the json. Then re-render
   with `render --preset <root>/docs/design-tokens.json --chosen-by "<the recorded chooser>"`.
3. For a VS Code webview, add `host_theme` as `dev-defining-design-system` Source 3 describes, then
   re-render.
4. A G4 left `CHANGES_REQUESTED` only because rows 28, 30 and 37 were `NOT_RUN` on a project with
   no `openapi.yaml`: if an answered DEC rules OpenAPI out, write those rows `N/A — <reason>
   (DEC-NNN)` and re-score with `--exit api-contract-check=2` (`dev-reviewing-api`, §13.12). Nothing
   else changes for G4 logs already judged.

## 1.6.0 (MINOR, from 1.5.x)

The process folder gets a name of its own, the **SDLC root**: `.sdlc/` for a new project, `dev/`
still accepted. Nothing has to move, and every gate stays PASS. In the steps above and below,
`<root>` is your root, `dev` for a project installed before 1.6.0.

1. `afx update --bundle dev`, then `node dev/scripts/doctor.mjs`.
2. Optional: move the root out of the product's tree with
   `node dev/scripts/migrate-root.mjs --to .sdlc` (a dry run), then again with `--write`. It runs the
   `git mv`, sets DEV-PROFILE `SDLC root`, rewrites gate-log front matter (bodies, and so hashes,
   are untouched), rewires CI, `package.json`, `.gitignore` and `core.hooksPath`, and rebuilds the
   index.
3. A Go + React product may move to the `fullstack-go-react` blueprint by
   `refactor-go-react-to-fullstack.md` (`dev-resolving-code-placement`). A profile that names
   `go-react` keeps it.
4. VS Code add-on 0.4.1 finds `.sdlc/` and `dev/` projects by itself; clear a `sdlc.statePath` you
   set only to say `dev/state.json`.

## 1.5.0 (MINOR, from 1.4.x)

Nothing old breaks: gates stay PASS and `lint-dev` keeps 0 errors. What you gain are two scored
standards (API at G4, UI at G5/G7/G8) and the checkers behind them.

1. `afx update --bundle dev`, then `node dev/scripts/doctor.mjs`.
2. Run the new checkers once to see the debt: `node dev/scripts/api-contract-check.mjs`,
   `contract-compat.mjs`, `api-score.mjs`, `ui-score.mjs`, `ui-privacy.mjs`.
3. If the debt is too large to fix now, record it so only new findings fail:
   `node dev/scripts/<checker>.mjs --write-baseline dev/ci/baselines/<checker>.json`, then pass
   `--baseline` with the same path in CI. Plan the paydown as tasks (DEV-CONTRACTS §13.11).
4. The next G4 review scores the contract; the next G5 or G7 review needs the ui-spec's roles
   matrix, nine-state matrix, traceability table and responsive rows. Add them before that review.

## 1.4.0 (MINOR, from 1.3.x)

See "Migrating from 1.3.0" in [CHANGELOG.md](CHANGELOG.md#140--2026-10-14): untrack
`dev/state.json` and `dev/DASHBOARD.md` once, copy the new `DEV-PROFILE` sections, set the id
prefixes and commit scopes, and enable `git config core.hooksPath dev/ci/git-hooks`.

## Template

Copy this for every MINOR that needs steps and for **every** MAJOR (CONTRIBUTING.md, "Releasing").
The heading must name the version, e.g. `## 2.0.0 (MAJOR, from 1.x)`.

```markdown
## X.Y.0 (MAJOR|MINOR, from <previous>)

One paragraph: what breaks or what you gain, and who is affected.

1. `afx update --bundle dev`, then `node <root>/scripts/doctor.mjs` (and `--prune --yes` if it lists leftovers).
2. <each manual step, as a command or a file to edit, in order>
3. <what to expect afterwards: which warnings, which gates re-run>

Rollback: `afx update --bundle dev --ref v<previous>` restores the old bundle files; artifacts written
under the new version may fail the old linter.
```
