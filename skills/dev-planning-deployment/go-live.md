# Go-live checklist — a public web release (G10)

The first release a stranger can reach needs things no gate before G10 asks for. Each one blocks the
launch if it is missing, and each one is usually found by hand on release day. Copy the rows that
apply into the release plan's `## Preconditions`, each with its evidence (a URL, a command and its
output, a screenshot path). A row that does not apply says why in one line.

| Area | What must be true | Evidence |
|---|---|---|
| Legal pages | A privacy page and terms page are published and linked from every page's footer; the privacy page names each third party that receives data (analytics, ads, mail, sign-in) | the two URLs answer 200; the footer link |
| Sign-in provider | The OAuth consent screen names the product, its home page, the privacy and terms URLs, and the production domain is an authorised domain; the redirect URIs list production, not only localhost | the provider's console values |
| Search | The domain is verified in a search console; `robots.txt` and the sitemap answer 200 on production | the verification record; two URLs |
| Ads | Where ads are served, `ads.txt` answers 200 with the publisher line, and consent rules for the regions served are met | the URL and its body |
| First admin | The first administrator is created by a person at the terminal, with a second factor enrolled; the recovery path (unlock, recovery codes) has been tried once | the command run, not the secret |
| Mail | Mail is sent from a domain the product owns, never a free mailbox; the provider's DKIM, DMARC (`p=none` with a `rua` at least), SPF or return-path and verification records are in DNS and verified; `env-doctor.mjs` with DNS has no finding on the sender key; a real message reached a Gmail and an Outlook inbox (`secrets-and-environments.md`, G10 row 32) | the DNS records; the two messages' headers with `dkim=pass` and `dmarc=pass` |
| Backup | The production database has a backup, and one restore has been run with its time recorded (`sre-principles.md`) | the restore command and its duration |
| Environment | `node <root>/scripts/env-doctor.mjs --env production --file <env file> --clock-url <production URL>` prints `READY`: every key set, the clock within 30 s (time-based codes fail beyond it), the production host resolves, no `WARN` for git rewriting line endings or for a transaction pooler where the app sets session parameters | its output |
| Hosting | Production does not run on a developer's machine. If it must for a while, an answered `DEC-NNN` names it as interim with an end date and the move is a task | the DEC |

## Not

- Not a design review: whether the privacy text is right is the owner's call. This list asks only
  that it exists and is reachable.
- Not a place to keep secrets. Evidence is the command and its result, never a key, password or code.
