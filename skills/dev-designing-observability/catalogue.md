# The event and metric catalogue (§13.5, §13.11)

`monitoring/<slug>/observability.md` `## Log events` and `## Metrics` are the closed list of what
the code emits. `obs-check.mjs` fails a name in the code and not in the list, a list entry the code
never uses, a name built at runtime, and a log line written through a second API.

## When it is written

| Gate | Who | Does |
|---|---|---|
| G2 | `dev-solution-architect`, with this skill | seeds both sections from the architecture's flows: one event per business outcome and failure, the RED metrics, the business counters. Not listed under G2's outputs |
| G6 | `dev-delivery-planner` | one task row per event and metric, or a task that owns a group of them |
| G7 | `dev-implementer` | revises the list in the commit that changes the code, and runs `obs-check.mjs <slug>` |
| G11 | this skill | completes the artifact (SLOs, dashboards, alerts, runbook links) and it is reviewed whole |

## Events

`<domain>.<noun>_<verb>`, lowercase, one dot. The verb is past tense from the closed set:
`created` `updated` `deleted` `completed` `failed` `started` `refused` `skipped` `retried` `expired`
`sent` `received`. A project adds a verb in DEV-PROFILE `Extra event verbs` with a `DEC-NNN`; it
never invents one inline.

| Not | But | Why |
|---|---|---|
| `bug.attached` | `bug.link_created` | the noun says what the row is about; one verb per meaning |
| `backup.done`, `backup.ok`, `backup.completed` | `backup.run_completed` | three spellings are three queries |
| `signin`, `sign_in`, `sign-in` | `session.sign_in_completed` | one spelling of the noun |
| `"account." + verb + "d"` | `account.account_deactivated` written out | a built name cannot be found by grep or by a dashboard |

Each event has **one level** in the table, and the code writes it at that level: `error` is paged
or fixed, `warn` is degraded, `info` is a business event, `debug` is never in the catalogue.

One logging API, named in DEV-PROFILE `Event API` (`obs.Event` by default), copied from
`<root>/_templates/code/<lang>/obs` rather than written per project. It takes the context,
the literal name and typed fields; it adds `trace_id`, `span_id`, `request_id` and `user_id`. A
direct `slog.Info("x.y", …)` beside it is a second logging path.

**The request line.** Every service has `http.request_completed` at `info`, once per request, with
the OTel HTTP semantic-convention attributes — `http.request.method`, `http.route` (the template,
never the raw path), `http.response.status_code`, `url.scheme`, `server.address`, duration in
milliseconds — and `request_id`. The same middleware echoes the request id in `X-Request-Id` on
every response, so a user's report and the log line meet.

## Metrics

`<app>_<noun>_<unit>`, the Prometheus and OpenTelemetry naming rules together:

| Kind | Ends in | Example |
|---|---|---|
| counter | `_total` | `rm_release_created_total` |
| latency histogram | `_duration_seconds` | `rm_http_request_duration_seconds` |
| size histogram | `_bytes` | `rm_attachment_upload_bytes` |
| gauge | its unit, or a state noun | `rm_outbox_pending`, `rm_outbox_oldest_age_seconds` |

`<app>` is DEV-PROFILE `Metric prefix`. Base units only: seconds, never milliseconds; bytes, never
kilobytes. Labels are bounded (§13.5): `route` is the matched template, `status_class` is `2xx`…`5xx`.
