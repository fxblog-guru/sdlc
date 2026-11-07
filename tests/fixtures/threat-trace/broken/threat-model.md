---
slug: demo
stage: design
artifact: threat-model
status: draft
authored_by: dev-modeling-threats
reviewed_by: pending
tracker: none
created: 2026-10-13
updated: 2026-10-13
requirements: []
---

## STRIDE analysis

The release-management shape: the mitigation names the gate, and the gate names no test.

| Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at |
|---|---|---|---|---|---|---|
| B1 | Spoofing | Session fixation: an attacker plants a session id before the victim signs in | low | high | Session id generated server-side only after a successful password check | G7 (`internal/identity` + `internal/http` session middleware tests) |
| B1 | Tampering | IDOR on a release id | med | high | project-scoped queries | G7 |

## Residual risk

None accepted.
