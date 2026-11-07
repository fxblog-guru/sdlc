# Mobile pack: verify, release, operate (preview)

Read this when `DEV-PROFILE` `Product type` is `mobile`. The tree is
`dev-resolving-code-placement/blueprints/react-native.md`. G9 row 26 cites this file. A mobile
release goes through a store review you do not control, reaches users on old versions for months,
and runs on bad networks and small batteries.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Staged rollout in the store | A bad build at 100 % has no fast undo; store review delays the fix | — |
| 2 | Old versions stay in use | The API must serve the oldest supported app version; a forced update is the last resort | — |
| 3 | Ask for permissions in context, with a reason | Asked at launch, they are denied, and the store may reject the app | — |
| 4 | Offline is a state, not an error | The app opens and shows its last data | Online-only by nature (a live call) |
| 5 | Respect battery and data | Background work is batched; large downloads wait for Wi-Fi | — |
| 6 | Store rules are requirements | Account deletion, privacy labels and payments rules are checked like any AC | — |
| 7 | Test on real devices and the oldest OS supported | Simulators hide performance and permission behaviour | — |
| 8 | Over-the-air updates only for JavaScript, never to bypass review | Stores allow fixes, not new features, by OTA | Bare apps with no OTA |

## Verify, release, operate

| Part | What G8–G11 expect |
|---|---|
| Verify (G8) | e2e on a device or simulator (Maestro or Detox), the oldest supported OS, an offline run |
| Release (G9) | store builds, a staged rollout percentage, privacy labels, the minimum supported version stated |
| Operate (G11) | crash-free users, store rating, adoption per version, the oldest version in use |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Release to 100 % in the store | No staged rollout |
| All permissions requested at first launch | A permission prompt with no context |
| A breaking API change for the new app version | The server drops a field old app versions read |
| No offline state | Screens with only "loading" and "error" |

G9 fails a mobile release that commits one of these.
