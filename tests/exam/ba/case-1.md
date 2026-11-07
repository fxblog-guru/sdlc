# requirements.md + glossary.md (excerpt) — release approvals

## Glossary

| Term | Meaning | Not |
|---|---|---|
| Release | A set of changes shipped together | deploy, version |
| Account | The account | user |

REQ-003: an account signs in with SSO. REQ-009: the account is invoiced monthly for its seats.

## Process

Approval: `draft → submitted` (author) · `submitted → approved | rejected` (approver) · `submitted → expired` after 72 hours (timer) · `rejected → draft` (author) · `submitted → draft` when the author withdraws. Forbidden: `approved → draft`. AC-010 rejection, AC-011 expiry, AC-012 withdrawal.
