# release-packet.md (excerpt) — afx-router 1.1 (extension)

## Release

Activation: `onCommand:afxRouter.start` and `onView:afxRouter.accounts`. The proxy server, the refresh timer and the helper process are pushed to `context.subscriptions`. The helper is spawned with `env: { PATH, HOME }` only. Contributions are unchanged from 1.0.0 (diffed); version 1.1.0.
