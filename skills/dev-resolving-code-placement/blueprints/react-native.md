# Blueprint: react-native (preview)

A mobile app on React Native (Expo or bare). Permissions, deep links and push are its contract with
the operating system; the store build is the release. It stays `preview` until a real mobile app is
built, because this workspace has no proving repository yet. The pack's verify, release and operate
parts are `dev-packaging-release/mobile.md`.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Structure | [Expo Router](https://docs.expo.dev/router/introduction/) | `app/` holds screens only; features own their logic |
| Platform rules | [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play policy](https://play.google.com/about/developer-content-policy/) | permissions asked in context with a reason; account deletion inside the app |
| Offline | the app opens and shows its last data with no network | a network error is a state every screen has |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── app/               screens and navigation only (Expo Router)
├── src/
│   ├── features/<feature>/   components, hooks and API calls for one feature
│   ├── components/    the kit
│   ├── services/      api client, storage, push, permissions — one wrapper each
│   └── lib/  config/
├── assets/
├── tests/{unit,e2e,fixtures}/   e2e on a device or simulator (Maestro or Detox)
├── docs/  dev/
├── app.json (or app.config.ts)  eas.json  package.json
```

## Rules

```json
{
  "name": "react-native",
  "requiredDirs": ["app", "src", "tests", "docs", "dev"],
  "requiredFiles": ["README.md", "package.json", ["app.json", "app.config.ts", "app.config.js"]],
  "codeRoots": ["app", "src", "assets", "tests", "scripts", "dev"],
  "rootCode": ["eas.json", "babel.config.js", "metro.config.js", "tsconfig.json", "eslint.config.mjs"],
  "tests": { "root": "tests", "tiers": ["unit", "e2e", "fixtures"], "rootFiles": ["README.md"], "placement": [] },
  "packageCeiling": 40,
  "imports": [
    { "lang": "ts", "from": "src/features/{f}/**", "deny": ["src/features/!{f}/**", "app/**"], "why": "features never import each other; screens compose them" },
    { "lang": "ts", "from": "src/components/**", "deny": ["src/features/**", "app/**"], "why": "the kit never imports a feature" }
  ]
}
```
