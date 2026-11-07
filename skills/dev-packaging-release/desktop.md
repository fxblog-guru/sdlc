# Desktop pack: verify, release, operate (preview)

Read this when `DEV-PROFILE` `Product type` is `desktop`. The tree is
`dev-resolving-code-placement/blueprints/electron.md`. G9 row 22 cites this file. A web release
replaces itself; a desktop release lives on machines you cannot reach. So a desktop release must be
signed, must update itself, and must be able to go back.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Sign and notarise every build | An unsigned app is blocked by SmartScreen and Gatekeeper, and users learn to click through warnings | Internal builds on managed machines with a policy that allows them |
| 2 | Auto-update with a staged rollout | Users never update by hand; a bad build to 100 % has no undo | — |
| 3 | A rollback is a newer build that restores the older behaviour | Clients cannot be forced to downgrade; keep the last good build ready to re-publish | — |
| 4 | Lock the renderer down | `contextIsolation`, `sandbox`, no `nodeIntegration`, a CSP (the blueprint) | — |
| 5 | Validate every IPC message in main | The renderer shows web content; treat its messages as untrusted input | — |
| 6 | Crash reports with consent | You cannot see a crash on a laptop otherwise; collect only with the user's agreement | — |
| 7 | Test the packaged app, not the dev server | Paths, permissions and native modules break only once packaged | — |
| 8 | Data lives in the user-data folder and survives updates | An update that wipes settings loses trust | — |

## Verify, release, operate

| Part | What G8–G11 expect |
|---|---|
| Verify (G8) | e2e on the packaged build, driving the real window (Playwright `_electron`); a smoke test per OS that ships |
| Release (G9) | signed installers per OS, a release channel (beta, stable), a staged rollout percentage, the last good build named |
| Operate (G11) | crash-free sessions, update adoption per version, consented crash reports |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Unsigned installer | No signing identity or notarisation step in the release |
| `nodeIntegration: true` | The renderer can `require('fs')` |
| Update to everyone at once | No channel or rollout percentage |
| Tested only with `npm start` | No test against the packaged build |

G9 fails a desktop release that commits one of these.
