# release-packet.md (excerpt) — meeting-capture 0.9 (desktop)

## Release

Windows installer signed with the company certificate; macOS build signed and notarised. Channel `beta` first, then `stable` at 10 % → 50 % → 100 % over a week. Last good build 0.8.3 kept ready to re-publish as 0.9.1. The e2e suite ran against the packaged build on Windows and macOS. BrowserWindow: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
