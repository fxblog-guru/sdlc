# Blueprint: electron (preview)

A desktop app on Electron: a main process, a preload bridge and a renderer. The IPC channels between
them are the app's API, held to G4 like HTTP. `preview` until proven on meeting-capture or
screen-spider (`docs/pack-template.md`); the pack's verify, release and operate parts are
`dev-packaging-release/desktop.md`.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Process model | [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model) | `src/main/` (Node), `src/preload/` (the only bridge), `src/renderer/` (web, no Node) |
| Security | [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a CSP, no `remote` |
| IPC as the contract | [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) | every channel is declared once in `src/shared/ipc.ts`, typed, and validated in main |
| Packaging | [electron-builder](https://www.electron.build/) or [Electron Forge](https://www.electronforge.io/) | one config at the root; signed builds per OS |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── src/
│   ├── main/            windows, menus, native APIs, IPC handlers; validates every message
│   ├── preload/         contextBridge.exposeInMainWorld only: the typed API the renderer sees
│   ├── renderer/        the UI (React or plain web); never imports electron or node:*
│   └── shared/          ipc.ts (channel names and payload types), shared types; no runtime code
├── build/               icons, entitlements, installer resources
├── tests/{integration,e2e,fixtures}/   e2e drives the real window (Playwright _electron)
├── deploy/  ops/  docs/  dev/
├── package.json  electron-builder.yml (or forge.config.ts)
```

## Rules beyond the shared ones

1. `src/renderer/**` never imports `electron` or a Node built-in. It talks through the preload API.
2. `src/main/**` never imports `src/renderer/**`.
3. Every IPC channel is named in `src/shared/ipc.ts`; a string channel elsewhere is a finding.

## Rules

```json
{
  "name": "electron",
  "requiredDirs": ["src/main", "src/preload", "src/renderer", "src/shared", "tests", "deploy", "ops", "docs", "dev"],
  "requiredFiles": ["README.md", "CONTRIBUTING.md", ".editorconfig", "package.json"],
  "codeRoots": ["src", "build", "tests", "deploy", "scripts", "ci", "dev"],
  "rootCode": ["electron-builder.yml", "forge.config.ts", "forge.config.js", "vite.config.ts", "eslint.config.mjs", "playwright.config.ts", "tsconfig.json"],
  "tests": { "root": "tests", "tiers": ["integration", "e2e", "fixtures"], "rootFiles": ["README.md"], "placement": [{ "name": "\\.spec\\.ts$", "under": ["tests/e2e/"], "why": "window-driving journeys live in tests/e2e/" }] },
  "packageCeiling": 40,
  "imports": [
    { "lang": "ts", "from": "src/renderer/**", "deny": ["electron", "node:*", "fs", "path", "child_process", "src/main/**"], "why": "the renderer has no Node; it uses the preload API" },
    { "lang": "ts", "from": "src/main/**", "deny": ["src/renderer/**"], "why": "main never reaches into the UI" },
    { "lang": "ts", "from": "src/shared/**", "deny": ["electron", "src/main/**", "src/renderer/**", "src/preload/**"], "why": "shared holds types and channel names only" }
  ]
}
```
