---
name: dev-making-brands
description: Use at G5 when there is no brand kit and the requester wants one now: brand.json, directions to pick from, every slot asset.
---

# Making a brand — one file, every asset

On one product the G5 visual drew the header logo as the active theme's glyph, and nobody asked
about a brand. When the owner chose one, six approved screens and the built code were redrawn. A
brand is cheap to change only when it is **code and slots**: one `brand.json` draws every asset,
and screens reference the assets by path. A new colour is then a rebuild, not a redraw.

> `DEV-CONTRACTS.md` §13.3 (brand slots, and the brand question G5 asks). Print it with
> `node <root>/scripts/contracts.mjs 13.3`.

## When this runs

`dev-designing-visuals` asks the requester about the brand before it builds a screen. This skill
runs for answer **(b) "none, make one now"**, before the visual is drawn. It also runs to build a
**placeholder** kit for answer (c), and when a brand changes mid-project (a change request, §13.3).
For answer (a), an existing kit, do not run it: map that kit's files onto the slots below.

## Steps

1. **Ask, then write `brand.json`** in the product repo, default `<repo>/brand/brand.json`. Ask for
   the name as it is written, a one-line tagline, and anything that already exists: colours, a
   font, an old logo, the site's theme. Reuse before inventing. Never invent a name or tagline.
   ```json
   { "name": "Larkspur", "tagline": "Field service scheduling that crews trust",
     "colors": { "primary": "#3f6fd8", "accent": "#b8690a", "ink": "#16213a",
                 "muted": "#5a6478", "paper": "#ffffff", "bg": "#f6f8fc" },
     "mark": { "style": "tile" } }
   ```
   `paper` is the light colour on the mark's tile and the email logo's ground, and `bg` is the page.
   `dark` (optional) overrides any colour for the dark theme; without it the dark page is `ink`
   and the rest is derived to pass. `fonts.display` / `fonts.text` (optional) are
   `{ "file": "<.ttf or .woff>", "license": "OFL-1.1" }`. The bundled font is Nunito (SIL OFL).
   `mark.letter` overrides the initial.
2. **Check it:** `node <root>/scripts/brand.mjs validate --brand <repo>/brand/brand.json`. Every
   pair is held to WCAG 2.2 AA in light and dark: text 4.5:1, the mark and the accent shapes 3:1
   against the page, and the letter on the tile 4.5:1. A failure prints the passing shade **of the
   same hue**. Never lower the bar. Either the owner picks another colour, or `build --adjust`
   moves it and lists each change in `brand.json` `adjusted` and the README for the owner to confirm.
3. **Show directions, then stop.** `brand.mjs concepts --brand <brand.json>` draws the four mark
   styles (`tile`, `ring`, `stack`, `spark`), each at 160 px and 32 px, on light and dark, on one
   sheet (`concepts.png`). Show it. The owner picks one. Picking is theirs, not yours: record it in
   `mark.style` only when they say which.
4. **Build:** `brand.mjs build --brand <brand.json>` writes every slot (table below), `brand.css`,
   `README.md` (slot table, tokens, contrast) and `preview.png`. PNG and ICO are rendered in
   headless Edge over the same DevTools pipe as `ui-snap`. Chrome is never used. `brand.mjs check
   --out <repo>/brand` confirms every slot file exists, each PNG is its size and none is blank.
5. **Look at every picture yourself.** Open `preview.png` and view each icon at its real size. The
   16, 32 and 48 px icons are also shown at 4×, pixelated, and the dark variants sit on the dark
   page. Fix anything clipped, blurred, illegible or off-centre at its source (`brand.json`, or the
   drawing in `brand.mjs`) and rebuild. A green `check` on a picture that looks wrong is not done.
6. **Hand back** the `concepts.png` the owner chose from, `preview.png`, the README's slot table,
   and every `adjusted` colour for the owner to confirm. Then `/sdlc-design-system` maps
   `--brand-*` onto the design system's colour roles (`dev-defining-design-system`, "Brand slots").

## The slots

| Slot | Files (under `brand/`) | Referenced by |
|---|---|---|
| mark | `logo/mark.svg`, `logo/mark-small.svg` (≤ 48 px, its own simpler drawing) | sign-in, about, splash |
| wordmark, lockup | `logo/wordmark{,-dark}.svg`, `logo/lockup{,-dark}.svg` | header, footer, sign-in panel |
| favicon set | `icons/favicon.{svg,ico}`, `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`, `site.webmanifest` | `<head>` |
| share image | `social/share-card.{svg,png}` (1200 × 630) | `og:image`, `twitter:image` |
| illustrations | `illustrations/{404,empty,no-results}{,-dark}.svg` | the not-found page, empty states |
| email logo | `email/logo-email.png` (240 × 60), `@2x` (480 × 120) | email header (no SVG in mail clients) |
| colour tokens | `brand.css` (`--brand-*`, light and dark) | the design system |

The placeholder kit (`brand.mjs placeholder --name "<product>" --out <repo>/brand`) writes the
same files in neutral greys with `placeholder: true`, so the later brand is a rebuild into the
same paths and no screen changes.

## Do not

- Pick the direction, the name, the tagline or the colours. Offer, recommend one, and ask.
- Draw a brand use inline in a screen (an inline `<svg>` logo, a hex in a component). Every use
  is a slot file or a `--brand-*` token, or a later brand change touches every screen.
- Use a font whose licence does not allow outlining and embedding (`validate` refuses it), or a
  font missing a letter of the name (`build` refuses it; for Vietnamese or CJK names give a font
  that covers them).
- Put a real person's name, email or face on a public asset without asking.
- Copy assets into the app here. That is a G6 task (the brand-swap or brand task), reviewed at G7.
