---
name: dev-defining-design-system
description: Use in /sdlc-design-system to render design tokens, tokens.css and ui-patterns.md from a preset, a shadcn theme, a Figma file or existing code.
---

# Design system — once per repository

Without a design system, G5 wrote excellent specs about states, pagination and accessibility, and
said nothing about what the product looks like, because `docs/design-tokens.md` was a file every
stage assumed and none produced. G7 then chose colours, spacing and layout per screen, and the
product ended up looking like it was built by twelve people who never met.

This skill closes that gap with three things, in this order:

1. **Tokens.** One source of colour, type, spacing, radius, elevation, motion, breakpoints and
   control sizes (§13.3).
2. **A kit.** Which component library each stack builds from, so nobody hand-rolls a dropdown.
3. **Patterns.** Ten page shapes and four app shells (`ui-patterns.md`). Every screen starts from
   one of them. This is the part that fixes "ugly". Mismatched colours are noticeable, but a primary
   action that moves around from page to page is what makes a product feel unfinished.

## The kit ships with the bundle

`kit/` in this skill is the reference implementation of the kit for the shadcn stacks: every
primitive a screen needs, wired to the schema-2 tokens through `kit/tailwind.preset.ts`, with
`lib/format`, `lib/problem-to-ui`, the copy catalogue `copy/en.ts`, an ESLint fragment and one test
file per primitive. Naming a kit is not enough (§13.3): G6 plans copying it into the project as
its first UI task, per `kit/README.md`. Copy is written to [copy-style.md](copy-style.md).

## Where the files live

| File | Written by | Read by |
|---|---|---|
| `<root>/docs/design-tokens.json` | `design-system.mjs render` | the script's `check`, and you, when changing a token |
| `<root>/docs/design-tokens.md` | `design-system.mjs render`, never by hand | G5 author and reviewer, G7 implementer and reviewer |
| `tokens.css` (path from `--css`, default `<root>/docs/tokens.css`) | `design-system.mjs render` | the app, imported once at the root |
| `<root>/docs/ui-patterns.md` | copied from this skill's `ui-patterns.md` | G5 (the `Pattern` column), G7 (the layout to build) |
| `<root>/docs/brand-assets.md` | you, from `brand/README.md` ("Brand slots" below) | G5 (every brand use is a slot), G6 (brand tasks), G7 |

The json is the source. The md and the css are renders of it. `check` fails when the md was not
rendered from the current json, so a hand edit is caught and not believed.

## The choice belongs to a human

Which preset to use is a product decision, in the same class as a `DEC-NNN` (§15.2). It changes how
every customer sees the product. `render` refuses to run without `--chosen-by "<name>"`, and the
name must be a person's, never an agent's or a skill's. Your job is to make the choice **easy and
informed**, not to make it.

When the person has not chosen yet:

1. Run `node <root>/scripts/design-system.mjs list --presets <this skill>/presets`.
2. Print `DEV-PROFILE` §Project and §Stacks (`profile.mjs`) and read, if they exist, `requirements/*/prd.md`, to see who the users are and
   where they work.
3. Recommend **one** preset and say why in two sentences tied to those users. Name the runner-up and
   what would make it the better pick.
4. Stop and ask. Do not render.

**Show, do not describe.** `presets/shots/` holds every preset's starter page (shell, one primary
action, stat cards, a table with status badges, a form, an empty state) at 1280 and 360, with
`index.html` setting them side by side. Show the shots of the recommendation and the runner-up. A
changed or new preset is re-shot with `node <root>/scripts/design-system.mjs preview <id> --presets <this
skill>/presets --out <this skill>/presets/shots` (in the bundle repo); a test fails while its shots are stale.

### Choosing — the short version

| If the users mostly… | Recommend | Why |
|---|---|---|
| work in tables all day on desktop (ops, dispatch, finance, admin) | `dense-enterprise` | 32px rows and 13px body fit about twice the rows of a consumer preset. Power users want that density. |
| use a modern B2B tool a few times a day | `clean-saas` | Quiet and neutral, and the safest default when nobody has a strong view. |
| arrive without training (self-serve, booking, portals) | `friendly-consumer` | 16px body, 44px targets, warmth. It forgives. |
| are on a phone, outdoors, one-handed (technicians, drivers) | `field-mobile` | 48px targets, bottom tabs, high contrast, system fonts that work offline. |
| read (docs, marketing, reports) | `editorial` | Serif display, 18px body, a wide measure. |
| are developers, or use the product next to GitHub | `primer-product` | GitHub's Primer palette and scale, so it is already familiar. MIT-licensed values. |
| work in a regulated enterprise and want a system to follow to the letter | `carbon-enterprise` | IBM Carbon's White and Gray 100 themes: flat, square corners, IBM Plex, an 8px grid. Apache-2.0 values. |

`primer-product` and `carbon-enterprise` carry a `provenance` block: the source package and
version, the licence, and every value adapted to fit this schema (one colour serves as both button
and link here, and every non-text pair must reach 3:1). They look like GitHub and IBM software on
purpose. That helps an internal tool and hurts a customer-facing product that needs its own identity.
Say this when you recommend one.

One product can have two surfaces, for example a `dense-enterprise` back office and a `field-mobile`
technician app. Render each into its own directory (`<root>/docs/` and `<root>/docs/mobile/`) and have
each screen's ui-spec say which one it follows. Do not blend two presets into one.

## Source 1: a preset

```bash
node <root>/scripts/design-system.mjs render \
  --preset .claude/skills/dev-defining-design-system/presets/<id>.json \
  --out <root>/docs --chosen-by "<the person's name>" \
  --patterns .claude/skills/dev-defining-design-system/ui-patterns.md \
  --css <style root from DEV-PROFILE §Stacks layout, e.g. app/styles/tokens.css>
```

Every preset already passes all 30 contrast checks (15 pairs × 2 themes), plus any
`extra_contrast_pairs` it declares (see "Extra roles"). If a team wants the
preset with its own brand colour, copy the json to `<root>/docs/presets/<id>-custom.json`, change
`primary`, `primary-hover`, `primary-fg` and `focus` in **both** themes, and render from the copy.
`render` refuses a preset whose new colour fails a pair, with the ratio and the ratio it needs. The
fix is a darker or lighter shade of the brand colour. Lowering the requirement is never the fix.

## Source 1b: a shadcn/ui or tweakcn theme

Many teams already have a theme they like: shadcn's built-in themes, one of tweakcn's presets
(tweakcn.com, Apache-2.0), or a theme exported from another shadcn project. All of them are the
same shape, a `:root { … }` and a `.dark { … }` block of CSS variables. Save the CSS to a file and:

```bash
node <root>/scripts/design-system.mjs import-shadcn --css theme.css \
  --base .claude/skills/dev-defining-design-system/presets/<closest preset>.json \
  --id <kebab-name> --name "<Name>" --source "<where the theme came from, with licence>" \
  --out <root>/docs/presets/<kebab-name>.json
```

The theme supplies the colours, radius and fonts. The base preset supplies everything a shadcn
theme does not have: the spacing scale, density, control sizes, motion, shell, and the `success`,
`warning` and `info` roles. The importer reads oklch, hsl, rgb, hex and shadcn v3's bare
`H S% L%`. It flattens translucent borders over the background, and lists every role it filled,
derived or substituted.

Expect it to report contrast failures, and pass them on without fixing them. shadcn's own default
`--input` border is 1.26:1 on white, well short of the 3:1 WCAG 1.4.11 asks of a control's edge.
Most published themes inherit that. The fix is a darker `border-strong` in the json, made by or with
the person choosing the theme, then `render`.

## Source 2: Figma

When the design team already has a file, their tokens win over any preset.

1. Call `get_variable_defs` (Figma MCP) on the file or on the frame holding the variables. Call
   `get_design_context` on one representative screen to find the kit and the spacing rhythm.
2. Map the variables onto the preset schema: start from the closest preset's json, which gives you
   the shape and every required key, and overwrite values. Colour roles map by meaning, not by name.
   Figma's `Neutral/900` becomes `text` because it is used for text.
3. A role the Figma file does not define (often `border-strong`, `focus`, `danger-fg`) is **not
   invented silently**. Take the preset's value, and list every role you filled this way in your
   report so the designer can confirm or replace it.
4. Write `<root>/docs/presets/figma-<file-key>.json` with `"id": "figma-<file-key>"` and render from
   it. Contrast failures in the designer's palette are reported to the human as findings, with
   pair, ratio and requirement. You do not adjust their colours yourself.

## Source 3: the codebase (brownfield)

The tokens already exist in some form: `tailwind.config.*` `theme`, `:root` CSS variables, a MUI or
Chakra theme object, a SCSS `_variables` file. Read `<root>/knowledge/conventions.md` first, since GK
may already have found them.

1. Extract what is **used**, not only what is declared. `design-system.mjs scan <src>` shows the
   hard-coded values. The five most frequent colours in the scan are usually the real palette.
2. Map them onto the schema as in Source 2, citing `file:line` for each role in your report.
3. The rendered `tokens.css` does not replace the existing theme on day one. It is a new file. The
   report proposes the migration (theme values become `var(--color-*)`) as a `change`-class
   initiative, because rewriting a live theme is a change with a blast radius and deserves its own
   G2 and G7.
4. **An editor-hosted UI** (a VS Code webview) takes its colours from the host's theme, not from
   hex: the code reads `var(--vscode-editor-background)` and the like. Record each such role in a
   `host_theme` block instead of collapsing it to a hex:

   ```json
   "host_theme": { "kind": "vscode", "roles": { "bg": "--vscode-editor-background",
     "text": "--vscode-foreground", "primary": "--vscode-button-background", "focus": "--vscode-focusBorder" } }
   ```

   - A key is a colour role (built-in or `extra_roles`); a value is the host's custom property name,
     `--vscode-*` for `kind: vscode`. Cite the `file:line` that reads it.
   - The `color.light` / `color.dark` hex stays required for every role. It is the fallback outside
     the editor, the value contrast is measured on, and what the shots render with. Take it from
     the host's default Light+ / Dark+ theme, and say so in the report.
   - `tokens.css` writes `--color-<role>: var(<host var>, <hex>)` and switches theme on
     `body.vscode-light`, `body.vscode-dark`, `body.vscode-high-contrast` and
     `body.vscode-high-contrast-light`, ahead of `prefers-color-scheme`; `data-theme` still wins.
     `theme_selectors: { "light": [...], "dark": [...] }` replaces those selectors for a host that
     marks its theme differently.
   - `check` fails when `tokens.css` no longer matches the json, so a hand edit that drops a
     `var()` is caught.

## An approved visual design comes first; a wireframe never does

A **wireframe** (`kind: wireframe`) binds content and layout, never look (§13.3). Its greys, type
sizes and radii are placeholders, so tokens are never derived from one: choose a preset, and let
the G5 visual-design step (`dev-designing-visuals`) decide the look on top of it.
`design-system.mjs derive` refuses a source that calls itself a wireframe, low-fi, a draft for
discussion or placeholder, or carries `<meta name="fidelity">` other than `high`.

A **high-fidelity visual** the requester approved (`kind: visual`: the visual-design shots, a
designer's mockup) outranks every source above on look. A design system defined without reading it
ships a product that does not look like the picture the user signed off, with every gate green.
Precedence: a recorded deviation, then the wireframe on content, then the visual on look, then the
tokens, then the patterns. Before customising a preset to one:

1. `node <root>/scripts/design-system.mjs derive --from <visual.html> --base <closest preset> --id
   visual-<slug> --out <root>/docs/presets/visual-<slug>.json`, then read its stylesheet and measure
   it rendered (`node <root>/scripts/ui-snap.mjs --reference <file>`).
   Extract the colour roles, the type scale, radii, the spacing rhythm, the dialog width and the
   scrim (the overlay behind a dialog), and **which themes it draws**.
2. Map them onto the closest preset's json, as in Source 2, into
   `<root>/docs/presets/visual-<slug>.json`. Set `control.dialog-max` (rendered as
   `--control-dialog-max`) and `"scrim": { "light": "<colour>", "dark": "<colour>" }` (rendered as
   `--color-scrim`). A scrim is its own literal colour, never the text colour at an opacity: in a
   dark theme that brightens the page instead of dimming it, and `render` refuses a `var()`.
3. **Every colour the visual draws is a role.** If one of the 16 built-in roles does not name it
   (tint fills behind badges and pills, a selected-row wash), put it in `extra_roles`, and put
   every pair it is used in into `extra_contrast_pairs`, so that `check` measures it. See "Extra
   roles" below.
4. **Do not ship a theme the reference does not draw.** If it is light only, set
   `"themes": ["light"]`: `tokens.css` then has no dark block and the OS setting changes nothing.
   A dark theme is a later product decision, not a default.
5. Every token that intentionally differs from the reference (a colour darkened to pass contrast,
   a type step rounded to the scale) goes in your report as `token — reference value → chosen value
   — reason`, for the person signing `--chosen-by` to confirm.

## Brand slots

The brand lives in the design system as tokens plus a table of asset files, so screens reference a
slot and never draw the brand. The kit itself sits in `<repo>/brand/` (built by `brand.mjs`, see
`dev-making-brands`, or an existing kit mapped onto the same paths).

1. **Tokens.** `brand/brand.css` defines `--brand-primary`, `-accent`, `-ink`, `-muted`, `-paper`
   and `-bg`, light and dark. The preset's colour roles take them: `primary` ← brand primary,
   `primary-fg` ← paper, `text` ← ink, `text-muted` ← muted, `bg` ← bg, and `focus` a shade of
   primary. Copy the preset to `<root>/docs/presets/<id>-brand.json` with those hexes in **both**
   themes and render with the owner's `--chosen-by`. `accent` that a screen uses goes in
   `extra_roles` as `brand-accent`, with its pairs in `extra_contrast_pairs`. `check` holds them
   to AA like any other role.
2. **The asset table.** Add `<root>/docs/brand-assets.md`, a copy of the slot table in the kit's
   `brand/README.md`: slot, file, where it goes (`<head>` link, header, sign-in, `og:image`, the
   404 page, empty states, the email template). G5 screens and G7 code reference these paths
   only. A placeholder kit (`"placeholder": true` in `brand.json`) has the same table, so the later
   brand is a rebuild and a token re-render with no screen changed.
3. **Areas.** A secondary area the requester called **plain** (an admin, a back office) uses the
   design system without the brand roles: neutral `primary`, no illustrations, the wordmark only in
   the shell header. Record it in `brand-assets.md` as `Area: <name> — plain`.

## Skins: themes a person picks

When the product lets each person choose a look (a reading site's themes, not light/dark), the
base design system stays the one rendered into `<root>/docs/`. Each skin is a full preset json in
`<root>/docs/skins/<id>.json`, rendered with the same contrast checks and a scope:

```bash
node <root>/scripts/design-system.mjs render --preset <root>/docs/skins/<id>.json   --out <root>/docs/skins/<id> --chosen-by "<name>" --css <styles>/skins/<id>.css --scope '[data-skin="<id>"]'
```

Every block in the css, dark and reduced motion included, is under `:root[data-skin="<id>"]`, so
the server sets `data-skin` on `<html>` and no skin leaks into another. A skin changes values, never
roles: components read the same `--color-*` names whichever skin is on. Each skin passes `check`
on its own (`check --tokens <root>/docs/skins/<id>`).

## Extra roles

A preset may add colour roles beyond the 16 built-in ones, and contrast pairs beyond the 15. Both
keys are optional. A preset without them renders exactly as before.

```jsonc
"extra_roles": {
  "tint-success": { "light": "#e1f0e5", "dark": "#14301f", "use": "success badge and pill fill" },
  "tint-danger":  { "light": "#fbe4e4", "dark": "#3a1717" }
  // light-only preset: "tint-info": "#e0ecf8" is shorthand for { "light": "#e0ecf8" }
},
"extra_contrast_pairs": [
  { "fg": "text",    "bg": "tint-success", "kind": "text" },     // 4.5:1, WCAG 1.4.3
  { "fg": "success", "bg": "tint-success", "kind": "non-text" }  // 3:1, WCAG 1.4.11
]
```

- A role name is lowercase kebab-case. It renders as `--color-<role>` in every shipped theme of
  `tokens.css`, and as a row of the colour table in `design-tokens.md`. `use` is optional and
  fills that row's "Use for" column.
- Each value is a literal hex for every theme in `themes`. `render` refuses a `color-mix()`, a
  `var()`, a missing dark value, or a name that is already a built-in role (or `scrim`).
- `fg` and `bg` can name any role, built-in or extra. `kind` is `text` (4.5:1) or `non-text`
  (3:1), the same bars as the built-in pairs. `render` and `check` report a failing extra pair
  with its ratio, marked `(extra_contrast_pairs)`, and fail on it. `check` prints how many pairs
  it measured, built-in and extra.
- Add a pair for every way a screen uses the role: the text on a tint, and the icon on it.

## Starting points worth knowing

Tokens and patterns decide the look. These open-source projects show the patterns built, and are
useful as a reference implementation, or as a starting codebase for a new frontend. Check each
licence yourself before copying code, since licences can change after this list was written.

| Project | Licence | Useful for |
|---|---|---|
| `satnaing/shadcn-admin` (github.com/satnaing/shadcn-admin) | MIT | `shell.sidebar`, `list` with TanStack Table, `settings`, `auth`, command palette, RTL. Vite + TanStack Router |
| `Kiranism/next-shadcn-dashboard-starter` (github.com/Kiranism/next-shadcn-dashboard-starter) | MIT | the same patterns on Next.js App Router, with server-side table search, filtering and pagination (§13.1-honest) and a `board` |
| `@primer/react` (github.com/primer/react) | MIT | the native component kit for `primer-product` |
| `@carbon/react` (github.com/carbon-design-system/carbon) | Apache-2.0 | the native component kit for `carbon-enterprise`. Its UI Shell is `shell.topbar-sidebar` |
| tweakcn (github.com/jnsahaj/tweakcn) | Apache-2.0 | a visual editor for shadcn themes. Export its CSS and run `import-shadcn` |
| `Self-made-Orange/self-made-design-ops` | code MIT, corpus CC BY 4.0 | measured token values from 100+ public design systems, handy when a stakeholder says "make it like X" |

A starter's layout replaces none of the gates. Copy a starter's `list` page and it still needs its
nine states filled in at G5 and its pagination bound to the contract at G4, and the starter's own
colours have to be replaced by `tokens.css` before G7 passes the scan.

## Schema 2 — the decisions a flat token set left open

Every preset is `"schema": 2`: type roles (`display`, `h1`–`h3`, `body`, `small`, `mono`,
`tabular`, each size / line / weight / tracking) on a scale whose every heading step is at least
1.2× the one below; elevation steps `0`–`3`; a `neutral` ramp `50`–`950`; status colours at
least ΔE00 20 apart; an eight-series `dataviz` palette; an `icon` set and sizes; `density_modes`;
and a `kit_base` (`shadcn-new-york` or `radix-themes`) whose control heights and radius are floors.
`render` and `check` refuse a file that breaks any of these. A schema 1 file (a project's
`design-tokens.json` from before) still checks, with a warning: run
`design-system.mjs migrate --from <root>/docs/design-tokens.json`, show the person who chose the
design system every value it filled or invented, and re-render with their name. `starter` renders
the G5 visual-design screens on the tokens (`dev-designing-visuals`).

## Changing a token later

Edit `design-tokens.json`, re-run `render` with the same `--chosen-by` (or the name of whoever
approved the change) and commit all three outputs together. A token change is a product change. Any
G5 log that listed `docs/design-tokens.md` among its inputs goes `STALE` by the ordinary hashing
rule (§4.4), which is correct, because the screens it approved were approved against different
tokens.

## Adding a pattern

`ui-patterns.md` is a contract as much as the tokens are. A new pattern is added when G5 records a
`DEC-NNN` saying no existing pattern fits, and a human agrees. It gets the same sections as the
others: when to use, anatomy, the seven default states, responsive, kit, and what it prevents. Edit
`<root>/docs/ui-patterns.md` in the project. The skill's copy is the starting point, not the project's
record.

## Do not

- Pick the preset, or write a name into `--chosen-by` that you were not given.
- Hand-edit `design-tokens.md` or `tokens.css`. They are renders.
- Relax a contrast requirement to make a palette pass.
- Leave a colour the approved visual draws out of the tokens for code to mix. Make it an
  `extra_roles` entry, with its pairs in `extra_contrast_pairs`.
- Blend two presets, for example dense-enterprise spacing with friendly-consumer colours. The
  presets are internally consistent, and the consistency is the product.
- Design a screen. That is G5, which now starts from these files.
- Invent a logo or a brand colour. Take them from the kit in `brand/`, or leave the slot to a
  placeholder and a `DEC-NNN`.
