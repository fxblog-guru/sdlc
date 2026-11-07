---
slug: demo
stage: monitoring
artifact: observability
status: draft
authored_by: dev-designing-observability
reviewed_by: pending
tracker: none
created: 2026-10-01
updated: 2026-10-01
requirements: [REQ-010]
---

## Metrics

| Metric | Type | Labels | Cardinality | Serves |
|---|---|---|---|---|
| demo_release_created_total | counter | none | 1 | business |
| demo_http_request_duration_seconds | histogram | route, method, status_class | 50 | RED |

## Log events

| Event | Level | Fields | Emitted when |
|---|---|---|---|
| release.release_created | info | name_len | a release is created |
| http.request_completed | info | http.request.method, http.route, http.response.status_code | once per request |
