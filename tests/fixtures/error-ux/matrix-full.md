### Error-UX matrix

| Problem | Surface | Component | Copy key | Retry |
|---|---|---|---|---|
| validation | inline field + form summary | Field, ErrorSummary | errors.validation | no |
| not-found | page | EmptyState (not found) | errors.notFound | no |
| not-a-project-member | page | EmptyState (not a member) | errors.notMember | no |
| precondition-failed | notice | Notice (warning) | errors.stale | yes, after reload |
| 401 | sign-in redirect | — redirect | errors.signedOut | no |
| 403 | page | EmptyState (no permission) | errors.noPermission | no |
| 404 | page | EmptyState (not found) | errors.notFound | no |
| 409 | notice | Notice (warning) | errors.conflict | no |
| 412 | notice | Notice (warning) | errors.stale | yes, after reload |
| 422 | inline field + form summary | Field, ErrorSummary | errors.validation | no |
| 429 | toast | Toast | errors.rateLimited | after Retry-After |
| 5xx | notice | Notice (danger) | errors.server | yes |
| offline | notice | Notice (warning) | errors.offline | yes |
| unknown | notice | Notice (danger) | errors.unknown | yes |
