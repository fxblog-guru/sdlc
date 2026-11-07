# Design checklist — the look, as facts a reviewer can fail

Read by `dev-reviewing-ui` (checks 22, 23 and 35, on `visual-design.md` and its `visual/index.html`)
and by `dev-reviewing-implementation` (check 21, on the built screens). Each row says how to decide
it; `ui-rubric.mjs` decides the ones a browser can measure, and its rule id is in the last column.
The fixtures that prove each row are `tests/fixtures/broken/ui-rubric/<page>.html` (must be
reported) and `tests/fixtures/valid/ui-rubric/` (must not be).

Evidence: release-management (2026-10-01..13), G8 `ui-snap` shots in `rm-g8/ui-snap-png/app/`.
Flat type, four-deep nested 1px boxes, no primary action, tables that wrapped and clipped at
1024px, blank empty states and an unbranded sign-in all shipped through G5 and G7 with every gate
green, because the only look check was "matches the approved visual" and the approved visual was a
low-fi wireframe.

| # | Row | How to decide | `ui-rubric` rule | Broken fixture |
|---|---|---|---|---|
| D1 | One primary action per view (the page, and each open dialog) | count `[data-variant=primary]` / the kit's primary button per view; 0 on a screen whose pattern has a primary action is a FAIL too | `primary-count` (hard) | `two-primaries` |
| D2 | Bordered containers nest at most two deep | the rubric's nesting depth; a card inside a card inside a panel is three | `nesting` | `flat-nested` |
| D3 | The page title is at least 1.25× body, and every heading step is a type role | rubric `heading-ratio` and `type-off-scale`; tokens enforce ≥ 1.2 per step | `heading-ratio`, `type-off-scale` | `flat-nested` |
| D4 | Spacing is on the 4/8 grid or a token step | rubric `space-off-grid` | `space-off-grid` | `flat-nested` |
| D5 | Tables: columns have a priority (what hides first below `bp.lg`), long text truncates with the full value recoverable (title or tooltip), numbers are right-aligned and tabular, and nothing is clipped or overflows at 1024 | rubric at 1024 and 360; read the ui-spec's column priority | `clipped-column` (hard), `overflow` (hard), `numeric-alignment`, `wrapping-link` | `clipped`, `overflow`, `numbers-left`, `wrapping-link` |
| D6 | Status is hue + icon + text, and the status hues are ΔE00 ≥ 20 apart | rubric; tokens enforce the ΔE on the palette | `status-encoding`, `status-delta-e` | `status-colour-only`, `status-close` |
| D7 | An empty state has an icon or illustration, one sentence saying why it is empty, and the action that fills it | rubric on `[data-empty]` | `empty-state` | `empty-blank` |
| D8 | Sign-in and the other no-shell pages carry the product's mark and name | rubric on a page with a password field | `auth-branding` | `sign-in-unbranded` |
| D9 | At 360px the header's actions collapse to at most two visible controls (the primary and a menu) on one row | rubric at 360 | `header-actions` | `header-crowded` |
| D10 | One value per role across screens: button height per variant and size, h1/h2/h3 size, table row height, status pill colour per status word, gap per kit slot | `ui-consistency.mjs` over every screen; a second value is a FAIL unless the ui-spec declares it | — (`ui-consistency.mjs`) | `tests/fixtures/consistency/broken/` |
| D11 | Every pointer target is at least 24 × 24 px, or has 24 px of clearance from the next (WCAG 2.5.8); no focused control is entirely hidden under a sticky or fixed bar (WCAG 2.4.11) | rubric at 1024, 768 and 360 | `target-size` (hard), `focus-obscured` (hard) | `small-targets`, `focus-obscured` |
| D12 | A list shows at most 200 rows at once (paginate or virtualise); images declare width and height, are not served over twice their shown size, and load lazily below the fold; nothing animates under reduced motion | rubric | `long-list`, `image-assets`, `motion-reduce` | `long-list`, `image-assets`, `motion-reduce` |
| D14 | One way to say each thing. Every screen has the same title row (title, one-line purpose, actions on the right). A button role keeps its label everywhere (`Save`, never `Save` here and `Update` there). Tables share one pager. A status word maps to one badge. Empty, error and denied states use the kit's three components. Dates and numbers use one format each, and words come from the glossary. A notice (a banner, a toast, an inline message) appears in one place only, never both a banner and a toast | `ui-consistency.mjs` for the measurable half; for labels, formats and notices, list each one across screens and read the list. Two spellings of one thing is a FAIL | — (`ui-consistency.mjs`) | `tests/fixtures/consistency/broken/` |
| D15 | The pictures are of the right thing: mocks hold one project's data and never another's, and every screenshot uses the approved skin at the stated viewports with the prototype banner hidden | open each picture. Headless Edge defaults to the dark scheme, so name the approved skin explicitly. Below about 496 px, `ui-snap` already captures through an iframe at the target width | — (`ui-snap.mjs`) | — |
| D16 | The brand is slots, not drawings: the mark, wordmark, favicon set, share image, 404 and empty-state art and email logo are files under `brand/`, brand colours are `--brand-*` tokens, and `visual-design.md` records the brand answer (a kit, a new kit, or a placeholder with a `DEC-NNN`) and the admin-look answer | read `## Basis`; grep the visual for an inline logo `<svg>`, an icon-set glyph standing in for the mark, or a brand hex | — (reviewer; `brand.mjs check` on the kit) | — |
| D13 | Text 40% longer, with accents, still fits: no overflow or clipping in the pseudo-locale run | `ui-rubric --pseudo` | `overflow`, `clipped-column` under `~pseudo` | `pseudo-truncation` |

A row the rubric reports as advisory is still a `FAIL` on the checklist when the reviewer confirms
it on the picture; the rubric finds it, the reviewer decides it. A hard fail is a `FAIL` with no
reading needed. `PASS` needs the rubric's summary line in the evidence cell.
