# Public pages: search and sharing (G5)

Read this when a screen can be reached without signing in and should be found: a landing page, a blog
post, documentation, a product or listing page. Signed-in app screens skip this file; they should be
`noindex`.

## Each public page specifies

| Item | Rule |
|---|---|
| `<title>` | unique per page, the specific thing first, the site name last, ≤ 60 characters |
| meta description | unique, says what the page answers, ≤ 155 characters; it is the snippet people read before they click |
| canonical URL | one per piece of content; every variant (query strings, trailing slashes, pagination) points at it |
| headings | exactly one `h1`, matching the page's subject; `h2`/`h3` in order. The heading outline is how a crawler and a screen reader both understand the page |
| URL | readable, stable, lowercase kebab: `/blog/frieren-review`, not `/p?id=482`. A URL that changes gets a 301 to the new one, never a 404 |
| language | `<html lang>` set, and `hreflang` alternates when the page exists in other languages (`i18n.md`) |
| sharing | Open Graph and Twitter card tags: title, description, an image at 1200×630 with its alt text |
| structured data | JSON-LD for the page's type where one fits (`Article`, `Product`, `BreadcrumbList`, `FAQPage`), validated |
| images | descriptive `alt`, explicit width and height (no layout shift), modern format, lazy below the fold |

## Rendering

A crawler must see the content without running a client-side app: render public pages on the server
or at build time (SSR or SSG). A page whose text appears only after JavaScript runs is indexed late or
not at all, and its share preview is blank.

## Site-wide, once

- `sitemap.xml` listing every public canonical URL, regenerated on publish, referenced from `robots.txt`.
- `robots.txt` that blocks nothing public and everything private (`/app`, `/api`, admin).
- Signed-in and private pages send `noindex`, and are excluded from the sitemap.
- A real 404 page that returns status 404, not a 200 with "not found" text.

## Speed is ranking, and ranking is G8

Search engines rank on Core Web Vitals. The budgets live in `DEV-PROFILE §Defaults` and `web-perf.mjs`
measures them at G8 (§13.7): LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms (TBT as its lab proxy). A public page
over budget is a G8 failure, not an SEO nice-to-have.

G5 fails a public page whose spec has no title, description and canonical URL, or that renders its
content only on the client.
