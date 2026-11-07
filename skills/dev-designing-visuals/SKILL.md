---
name: dev-designing-visuals
description: Use in /sdlc-ui after ui-spec.md, before G6: asks the brand, then builds high-fi screens on kit and tokens, shot at 1440/1024/360 for approval.
---

# Visual design — the look, decided before anyone plans to build it

The wireframe and the ui-spec decide what is on each screen. Nothing before this step decides what
it looks like, so the look used to be inherited from whatever picture was nearest: a low-fi
wireframe whose greys were placeholders. release-management shipped exactly that: flat type, boxes
nested four deep, no primary action, tables clipped at 1024, blank empty states, an unbranded
sign-in, with every gate green. This step makes the look a picture someone approved.

> `DEV-CONTRACTS.md` §13.3 (a wireframe binds content, a visual design binds look; precedence),
> §3.1 (`visual_reference`, `approved_by`). Print only those: `node <root>/scripts/contracts.mjs 3.1 13.3`.

## What you receive

`ui/<slug>/ui-spec.md`, the wireframe if there is one, `docs/design-tokens.{json,md}` (schema 2),
`docs/ui-patterns.md`, the visual-design template, and this skill's `starter/index.html`.

## Ask two questions before you build

The look of a product's brand and of its back office are product decisions. On one product the header
logo was drawn as the theme's glyph and nobody asked; when the owner chose a brand, six approved
screens and the built code were redrawn. The admin area's look was never asked either. So, first:

1. **The brand.** Ask the requester which is true, recommending one:
   - **(a) a brand kit exists:** use it. Map its files onto the slots below, and its colours onto
     `--brand-*` (`dev-defining-design-system`, "Brand slots"). Never redraw or "improve" it.
   - **(b) none, make one now:** run `dev-making-brands` first. It ends with the owner choosing a
     direction and a built kit in `<repo>/brand/`. Then build the screens on it.
   - **(c) none, later:** run `brand.mjs placeholder --name "<product>" --out <repo>/brand`, draw on
     that neutral kit, and record a `DEC-NNN` (open, never answered by you) listing **every screen
     and every slot file that will change** when the brand arrives. G6 then plans a brand-swap task.
2. **The secondary areas.** For each area that is not the product's face (admin, back office,
   internal tools), ask whether it shares the product's look or stays plain (the design system
   without brand colour or illustrations). Recommend plain for internal-only areas.

Write both answers in `visual-design.md` `## Basis` as `Brand: (a|b|c) — <kit path or DEC-NNN>` and
`Areas: <area> — themed | plain`, one line per secondary area, or `Areas: none`. A question
nobody answered yet is a `DEC-NNN`. The G5 reviewer fails a visual without these lines.

**Every brand use is a slot.** The mark, the wordmark, the favicon set, the share image, the 404
and empty-state illustrations, the email logo and the brand colours are referenced by path from
`<repo>/brand/` (`<img src="brand/logo/wordmark.svg">`, `var(--brand-primary)`), never drawn inline
in a screen: no inline `<svg>` logo, no hex, no glyph from an icon set standing in for the mark. A
later brand is then a file and token swap. The slot table is in `dev-making-brands`.

## Build it

1. Start from the starter, on this project's tokens:
   ```bash
   node <root>/scripts/design-system.mjs starter --from .claude/skills/dev-designing-visuals/starter/index.html \
     --tokens <root>/docs --out <root>/ui/<slug>/visual --product "<product name>"
   ```
   It holds the six archetypes, one `.screen` each: `#shell` (sidebar shell + dashboard),
   `#list` (data table), `#detail`, `#form` (dialog over the list), `#empty`, `#sign-in`. The
   anatomy is shadcn/ui new-york's; with `kit_base: radix-themes` keep the anatomy and use Radix
   Themes' proportions, which the tokens already carry.
2. Replace the sample content with this product's: the ui-spec's real screen names, columns, fields,
   states and copy, the wireframe's regions in the wireframe's order. Add a `.screen` per further
   screen the spec needs to show a distinct look; six is the floor, not the set.
3. Use tokens only: `var(--type-*)`, `--space-*`, `--radius-*`, `--shadow-0..3`, `--neutral-*`,
   `--color-*` (with `tint-*` for status fills), `--dataviz-*`, `--icon-*`, `--density-*`. A value
   you need and cannot find is a token change for `/sdlc-design-system`, not a literal.
4. Keep the rules the design checklist measures (`dev-reviewing-ui/design-checklist.md`): one
   primary action per view (`data-variant="primary"`), at most two bordered levels, the page title a
   type role at least 1.25× body, status as hue + icon + text (`data-status`), an empty state with
   icon, sentence and action (`data-empty`), a branded sign-in (`data-brand`), table columns with a
   priority (`col-p1..p3`, hidden lowest first), numbers right-aligned and tabular, the header down
   to a menu and the primary at 360.

## Measure it, shoot it, look at it

```bash
node <root>/scripts/ui-rubric.mjs --url shell=<root>/ui/<slug>/visual/index.html#shell … \
  --widths 1440,1024,360 --tokens <root>/docs --out <root>/ui/<slug>/visual/rubric.json
node <root>/scripts/ui-snap.mjs --reference <root>/ui/<slug>/visual/index.html \
  --widths 1440,1024,360 --out <root>/ui/<slug>/visual/shots
```

The requester clicks through the visual, so every in-page link must reach a screen: name the
screen as its links do, or resolve the link in the mock's router. `ui-snap` lists the link targets
that reach none; that list is empty before you hand over. Keep one shell per area (one admin
sidebar, one reader header) on every screen of that area, so screens read as one product.

A hard fail (overflow, a clipped column, two primaries in a view) is fixed before you go on.
Fix every advisory too, or write in `## Rubric` why it stands. Then open the shots yourself, at
all three widths, and compare them with a current SaaS product of the same kind (Linear, Vercel,
Stripe dashboard, GitHub): hierarchy you can read from across the room, one obvious next action,
generous but not empty space, tables that fit. Say in `## Decisions` where it falls short and why.
A rubric that is green on a page that still looks unfinished means the picture is not done.

## Write it down and hand it to the requester

1. Copy `_templates/visual-design.md` to `<root>/ui/<slug>/visual-design.md` and fill every section.
2. Record the visual in the ui-spec: add
   `{ path: <root>/ui/<slug>/visual/index.html, sha256: <build-state.mjs --hash>, kind: visual }` to
   `visual_reference`, beside the wireframe's `kind: wireframe` entry.
3. Hand back the `compare.html` path and the shots for the requester. You never approve it: the
   requester's name and date go into `approved_by` / `approved_on` when they say yes (E029), and
   G6 does not start while `## Approval` says pending. A screen they reject goes back to step 2 of
   "Build it", and the hash in the ui-spec is updated.

## Do not

- Copy a wireframe's colours, greys, sizes or radii. They are placeholders (§13.3).
- Shrink the kit's controls or corners below the tokens (`kit_base` floors) to fit more in.
- Mix a colour in CSS (`color-mix`, an opacity on a token). A colour the design needs is a token.
- Add a screen, field or action the ui-spec does not have. That is a G5 change, not a look.
- Write application code. These screens are the picture G7 builds to, not the app.
- Draw a logo, favicon or illustration inline, or choose a brand for the requester. Ask, then use
  the slots.
