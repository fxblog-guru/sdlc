# Blueprint: vscode-extension (preview)

A VS Code extension: an extension host entry, optional webviews, and the `contributes` block of
`package.json` as the public contract. `preview` until proven on afx-router or editor/vscode-sdlc;
the pack's verify, release and operate parts are `dev-packaging-release/vscode-extension.md`.

## Standards it follows

| Area | Standard | What it decides here |
|---|---|---|
| Contract | [Contribution points](https://code.visualstudio.com/api/references/contribution-points), [activation events](https://code.visualstudio.com/api/references/activation-events) | commands, settings and views in `package.json` are the API; renaming one is breaking |
| Lifecycle | [Extension anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy) | `activate` registers and returns fast; everything is pushed to `context.subscriptions` |
| Webviews | [Webview guide](https://code.visualstudio.com/api/extension-guides/webview) | a CSP with a nonce, `localResourceRoots`, messages validated both ways |
| Tests | [@vscode/test-electron](https://code.visualstudio.com/api/working-with-extensions/testing-extension) | integration tests run in a real VS Code |
| Shared parts | `README.md` §What every blueprint shares | — |

## The tree

```
.
├── src/
│   ├── extension.ts     activate / deactivate only: register, return
│   ├── commands/        one file per command id in contributes.commands
│   ├── services/        what commands call; no vscode.window in here
│   └── webview/         webview host side; the page lives in media/ or webview-ui/
├── media/  (or webview-ui/)   the webview's HTML, CSS, JS
├── test/{suite,fixtures}/     runs inside VS Code
├── docs/  dev/
├── package.json  tsconfig.json  .vscodeignore  CHANGELOG.md
```

## Rules beyond the shared ones

1. `activate` awaits nothing slow. Work starts lazily, on the first command or view.
2. A listening socket, a timer or a child process is a disposable in `context.subscriptions`;
   one that outlives `deactivate` keeps the extension host from exiting.
3. Child processes get an explicit `env`, never the host's: it carries `ELECTRON_RUN_AS_NODE`.

## Rules

```json
{
  "name": "vscode-extension",
  "requiredDirs": ["src", "test", "docs", "dev"],
  "requiredFiles": ["README.md", "CHANGELOG.md", "package.json", ".vscodeignore"],
  "codeRoots": ["src", "media", "webview-ui", "test", "scripts", "dev"],
  "rootCode": ["tsconfig.json", "esbuild.js", "esbuild.mjs", "eslint.config.mjs", ".vscode-test.mjs"],
  "tests": { "root": "test", "tiers": ["suite", "fixtures"], "rootFiles": ["README.md"], "placement": [] },
  "packageCeiling": 40,
  "imports": [
    { "lang": "ts", "from": "src/services/**", "deny": ["src/commands/**", "src/extension.ts"], "why": "services are called by commands, never the other way round" },
    { "lang": "ts", "from": "media/**", "deny": ["vscode", "src/**"], "why": "the webview page runs in a browser sandbox; it talks by postMessage" }
  ]
}
```
