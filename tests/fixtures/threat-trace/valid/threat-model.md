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

| Id | Boundary | Category | Threat | Likelihood | Impact | Mitigation | Enforced at | Test |
|---|---|---|---|---|---|---|---|---|
| THR-001 | B1 browser → API | Spoofing | session fixation: a planted session id survives sign-in | low | high | new 256-bit id from crypto/rand after the password check; the old cookie is replaced | internal/http session middleware | `TestSignInReplacesPresetSession` |
| THR-002 | B1 browser → API | Elevation of privilege | IDOR: a member changes the release id in the URL to another project's release | med | high | every query is scoped by project_id from the session, 404 otherwise | internal/release repository | `internal/release/repo_test.go:TestOtherProjectReleaseIsNotFound` |
| THR-003 | B1 browser → API | Information disclosure | missing security headers on an error page | low | med | CSP, HSTS and nosniff on every response, including problem+json | internal/http | gate:DAST baseline |
| THR-004 | B2 API → Jira | Denial of service | a slow Jira site holds request goroutines | low | med | 5 s client timeout, breaker after 5 failures | internal/tracker | accepted: Luan |

## Residual risk

THR-004 — the breaker is accepted as sufficient for an internal tool by Luan, until 2026-12-31.
