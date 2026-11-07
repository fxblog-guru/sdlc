# VS Code extension pack: verify, release, operate (preview)

Read this when `DEV-PROFILE` `Product type` is `extension`. The tree is
`dev-resolving-code-placement/blueprints/vscode-extension.md`. G9 row 23 cites this file. An
extension runs inside someone else's editor. A slow activation slows their editor, a leaked
resource keeps it from closing, and a renamed command breaks their keybindings.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Activate late and fast | `*` or `onStartupFinished` with slow work makes every window slower | An extension whose whole job starts with the editor |
| 2 | Dispose everything | A socket, timer or child process left open keeps the extension host alive | — |
| 3 | Contributions are a public API | A renamed command, setting or view id breaks users' keybindings and settings: a MAJOR | — |
| 4 | Never pass the host environment to a child | It carries `ELECTRON_RUN_AS_NODE`; the child then runs as Node and fails far from the cause | — |
| 5 | Webviews are untrusted pages | A CSP with a nonce, `localResourceRoots`, validated messages | — |
| 6 | Workspace trust is respected | Running workspace code in an untrusted folder is the attack | — |
| 7 | Test in a real VS Code | Activation and contribution bugs do not show in unit tests | — |
| 8 | Keep the package small | `.vscodeignore` excludes sources, tests and maps; a bundled `dist/` ships | — |

## Verify, release, operate

| Part | What G8–G11 expect |
|---|---|
| Verify (G8) | `@vscode/test-electron` suite on the minimum supported VS Code, activation time measured |
| Release (G9) | `vsce package`, version and `CHANGELOG.md` agree, contributions diffed against the last release, `.vsix` size stated |
| Operate (G11) | install count, activation errors, issues by version |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| `"activationEvents": ["*"]` | Activation on every window with no reason |
| A server started in `activate` and never closed | No disposable pushed for it |
| `spawn(cmd, { env: process.env })` | The child inherits the host environment |
| A command id renamed in a minor version | `contributes` changed with no MAJOR bump |

G9 fails an extension release that commits one of these.
