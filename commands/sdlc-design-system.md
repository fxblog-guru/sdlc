---
description: Decide the design system once per repository: tokens, kit, page patterns. G5 will not run without it.
disable-model-invocation: true
argument-hint: [<preset-id> | --from-shadcn <theme.css> | --from-figma <url> | --from-code] [--surface <name>] [--check]
---

Establish, or check, the design system that every screen in this repository is built from.

G5 and G7 both depend on `<root>/docs/design-tokens.md` and `<root>/docs/ui-patterns.md` (§13.3). This is
the command that produces them. Run it once per repository, before the first `/sdlc-ui`, and again
only when the design system itself changes.

## Preflight

1. Print `DEV-PROFILE` §Stacks (`profile.mjs Stacks`). If §Stacks enables neither `react` nor `nextjs` and nothing else renders a
   UI, stop and say so, because a repository with no UI needs no design system. Stop with a
   `> **Project setup required:**` callout if `Name` is still a `<placeholder>`.
2. Locate the skill's files: `.claude/skills/dev-defining-design-system/` in an installed project, or
   `skills/dev-defining-design-system/` in the bundle repository.
3. `--check`: run `node <root>/scripts/design-system.mjs check` (add `--tokens <root>/docs/<surface>` for
   a named surface), show its output verbatim, and stop.
4. If `<root>/docs/design-tokens.json` already exists and this is not an intentional change, show
   `check`'s output and ask whether the person means to **replace** the design system. Replacing
   it turns every G5 that read the old tokens `STALE` (§4.4), and they should hear that before
   saying yes.

## Mode: no argument — help the person choose

Choosing is a product decision, so this mode recommends and then **stops**.

1. `node <root>/scripts/design-system.mjs list --presets <skill>/presets` and show it.
2. Show the reference shots so the person chooses by looking: `<skill>/presets/shots/<id>-1280.png`
   and `<id>-360.png` for your recommendation and the runner-up (read them, or link them), and
   `<skill>/presets/shots/index.html`, which sets all seven side by side.
3. Print `DEV-PROFILE` §Project and read any `<root>/requirements/*/prd.md` for who the users are and where they
   work. Invoke `dev-defining-design-system` for its choosing table.
4. Recommend one preset in two sentences tied to those users, and name the runner-up.
5. Mention that a Figma file (`--from-figma <url>`) or an existing theme in the code (`--from-code`)
   can be used instead of a preset.
6. Ask the person to reply with `/sdlc-design-system <preset-id>` and to say the name that should be
   recorded as having chosen it. End here. Do not render on your own recommendation.

## Mode: `<preset-id>`

1. The id must match a file in `<skill>/presets/`. If it does not, list the ids and stop.
2. You need the chooser's name. Use it if the person gave it in this conversation. If they did not,
   ask for it. **Never** fill it with your own name, a skill name, `user` or `admin`.
3. Decide the `--css` path from `DEV-PROFILE §Stacks` layout (the styles folder of the frontend
   root). If the layout is still a placeholder, use `<root>/docs/tokens.css` and say that it still
   needs importing at the app root.
4. Render:
   ```bash
   node <root>/scripts/design-system.mjs render --preset <skill>/presets/<id>.json \
     --out <root>/docs[/<surface>] --chosen-by "<name>" \
     --patterns <skill>/ui-patterns.md --css <path>
   ```
5. `node <root>/scripts/design-system.mjs check [--tokens <root>/docs/<surface>]`. It must pass.

## Mode: `--from-shadcn <theme.css>`

A shadcn/ui or tweakcn theme the person already likes. This mode is mechanical, so no author is
needed.

1. Pick the closest preset as `--base` (it supplies spacing, density, shell and the status colours)
   and say which one you picked and why in one line.
2. Run `design-system.mjs import-shadcn` as in `dev-defining-design-system` Source 1b, with `--source`
   naming where the theme came from and under which licence.
3. Show every note it printed. If it reports contrast failures, stop there: show the pairs and let
   the person choose the darker shade, or approve a suggestion you make, written into
   `<root>/docs/presets/<id>.json`. Then render as in the preset mode, with the chooser's name.

## Mode: `--from-figma <url>`, `--from-code` or `--from-visual <file>`

An author maps someone else's palette onto the schema; the script checks it. Use `--from-visual` whenever the requester approved a
wireframe or mockup, even if a preset was already discussed: the approved picture wins on look
(§13.3).

Spawn **`dev-ui-designer`** with a fresh run-id, the mode, the Figma URL, the source root or the
visual's path, `DEV-PROFILE.md`, `<root>/knowledge/conventions.md` where it exists, and the skill
directory. Tell it to invoke `dev-defining-design-system` (Source 2, Source 3, or "An approved
visual comes first"), write `<root>/docs/presets/<figma-key | from-code | visual-<slug>>.json`, and
hand back: the path, every colour role it had to fill from a preset because the source did not
define it, every contrast failure in the source palette, and for a visual, the themes it draws and
every token that differs from it, with the reason. For an editor-hosted UI (`--from-code` on a VS
Code webview), it also hands back the `host_theme` roles it recorded.

Then show the person that hand-back. Contrast failures are theirs to resolve with the designer.
The author does not fix someone else's palette. Once the palette passes and the person has given
their name, render and check as in the preset mode, using the new json as `--preset`.

## `--surface <name>`

A product with two genuinely different surfaces, such as a back office and a technician phone app,
gets one design system per surface under `<root>/docs/<name>/`. Each ui-spec then states which surface
it follows. Use this only when the users and devices really differ. Two design systems for one
audience is the inconsistency this command exists to remove.

## After

Say the next command as the thing that happens next, with one clause on what it produces — never as "do you want me to…?" (§4.1a). Offer a choice only where a human decision genuinely exists, and then as options with a recommended default, the way `/sdlc-ask` does.

Show the files written and the `check` line. Then at most three lines:

- the one import the app needs (`import '<css path>'` at the root layout)
- the kit to install for the enabled stack, from the `## Kit` table in `design-tokens.md`
- the next command: `/sdlc-ui <slug>` if an initiative is waiting at G5, otherwise `/sdlc-status`

Commit the outputs: `git add <root>/docs <css path> && git commit -m "design system: <id> (chosen by <name>)"`.
G5 logs hash `docs/design-tokens.md` as an input, so an uncommitted token file cannot be diffed by
`--reaffirm` later.

## Refuse

- To choose the preset, or to record a chooser nobody named.
- To hand-edit `design-tokens.md` or `tokens.css`. Change the json and re-render.
- To lower a contrast requirement, or to "nudge" a designer's colour without telling them.
- To create a design system inside `/sdlc-ui` or `/sdlc-implement` as a side effect. It is a
  repository-wide decision and gets its own command so that it is visible.
