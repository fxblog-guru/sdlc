# Error-UX matrix — one row per problem, decided once

Read by `dev-specifying-ui` when writing `## States`, and by `dev-reviewing-ui` (check 24).
`lint-dev.mjs` enforces the shape (E080, E081, W080; DEV-CONTRACTS §13.3).

Evidence: release-management (2026-10-13). 46 problem types were handled in about 30 places. The
release-status conflict was handled 13 times, in six different sentences. There were 68 fallback
strings for a failed mutation, no branch for a 5xx, and "no permission" and "not found" were drawn
in the same red. The spec said "show the error" and every screen decided what that meant.

## The table

Put it under `## States`, as `### Error-UX matrix`, after the states table.

| Problem | Surface | Component | Copy key | Retry |
|---|---|---|---|---|
| `validation` | inline field + form summary | `Field`, `ErrorSummary` | `errors.validation` | no — fix the field |
| `precondition-failed` (412) | notice above the form | `Notice` (warning) | `errors.stale` | yes, after reload |
| 429 | toast | `Toast` | `errors.rateLimited` | after `Retry-After` |

1. One row per `ProblemType` enum value in `api/<slug>/openapi.yaml`, written by its short name
   (`not-found`, not `/problems/not-found`).
2. One row for each of `401`, `403`, `404`, `409`, `412`, `422`, `429`, `5xx`, `offline`,
   `unknown`. A status row is the fallback for a problem type the client does not recognise.
3. **Surface** is one of: `inline field`, `form summary`, `notice`, `toast`, `page`,
   `sign-in redirect`. A mutation error never replaces the page. A load error replaces only the
   region that failed.
4. **Component** names a kit primitive (`Field`, `ErrorSummary`, `Notice`, `Toast`,
   `EmptyState`, `ConfirmDialog`). A bespoke one needs the same justification as anywhere else.
5. **Copy key** is a key in `copy/en.ts` (`{area}.{screen}.{element}`, or `errors.*` for the
   shared ones). Two rows may share a key; a key never carries two sentences.
6. **Retry** is `yes`, `no`, `after Retry-After`, or `yes, after reload`. A retryable row has a
   retry action in its component; a terminal row says what to do instead.

## Three looks that must differ

| Case | Look | Why |
|---|---|---|
| no permission (403, `role-required`, `owner-only`) | neutral `EmptyState`, lock icon, names the role needed and who grants it | the thing exists; the user cannot reach it |
| not found (404, `not-found`) | neutral `EmptyState`, search icon, a link back to the list | nothing is there; nobody is at fault |
| not a member (`not-a-project-member`) | neutral `EmptyState`, people icon, names who can add them | the user is in the wrong place, not blocked by a rule |

None of the three is red: red is for something that went wrong and can be fixed by acting.
`role="alert"` on none of them, because no user action produced them on that render.

## In code

The kit's `lib/problem-to-ui.ts` maps a problem to its row. Screens call `problemToUi(problem)`
and render what it returns; no screen switches on `problem.type`. The map is generated from, or
checked against, this table, so the two cannot drift.

## Standard sentences

From the copy style guide (`dev-defining-design-system/copy-style.md`):

- 412: "Someone else changed this [object] while you were editing. Reload to see their changes,
  then make yours again."
- 429: "Too many requests. Wait [n] seconds, then try again."
- 5xx and unknown: "[Object] could not be [verb]. Try again." with the trace id in a
  "Details" disclosure, never as the message.
- offline: "You are offline. Changes are not saved until you reconnect."
