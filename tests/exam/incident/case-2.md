# post-release.md (excerpt) — payments

## Incident readiness

Severity: SEV1 payments failing for any user, SEV2 degraded over 5 %, SEV3 one customer. On call: the payments rotation, commander Dee for the launch week. Every alert in observability.md links its runbook; the first step of each is "switch off the `new-checkout` flag", then diagnose.
