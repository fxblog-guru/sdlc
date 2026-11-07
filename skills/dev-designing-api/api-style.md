# API style — one answer per question (§13.1, §13.11)

Every row below is a choice two reasonable designers make differently. The rule is that this
service makes it once, so consistency between operations is a finding even where either style
alone would be fine. Sources: Google AIP-131 to 136 (standard and custom methods), AIP-154 (ETags),
AIP-193 (errors), and the Zalando RESTful API Guidelines. `api-style-check.mjs` and
`<root>/ci/spectral.yaml` check every row a machine can see.

## Methods and statuses per verb class

| Verb class | operationId | Method and path | Success | Notes |
|---|---|---|---|---|
| get | `get<Resource>` | `GET /{collection}/{id}` | 200 + `ETag` | AIP-131; `ETag` on every resource that has a write (AIP-154) |
| list | `list<Resources>` | `GET /{collection}` | 200 | AIP-132; paginated (§13.1) |
| create | `create<Resource>` | `POST /{collection}` | 201 + `Location` + `ETag` | AIP-133 |
| update | `update<Resource>` | `PATCH /{collection}/{id}` | 200 with the resource | AIP-134; `If-Match` |
| delete | `delete<Resource>` | `DELETE /{collection}/{id}` | 204 | AIP-135 |
| state | `set<State>` / `unset<State>` | `PUT` / `DELETE /{collection}/{id}/<state-noun>` | 204 | a flag the caller sets or clears: pin, star, follow, mute |
| membership | `add<Member>` / `remove<Member>` | `PUT` / `DELETE /{collection}/{id}/<members>/{member_id}` | 204 | adding an existing record to a set: scope item, release in a train |
| action | `<verb><Resource>` | `POST /{collection}/{id}/<verb>` | 200 with the result, 202 + status resource above 2 s | AIP-136; the verb is the last path segment |

A toggle is never `POST` to set and `DELETE` to clear: set is idempotent, so it is `PUT`.
`search<Resources>` is the one action that may be a `GET`, because it only reads.

## The closed verb list

`get` `list` `create` `update` `delete` · `set` `unset` `add` `remove` · `approve` `reject` `cancel`
`archive` `restore` `move` `start` `complete` `send` `verify` `refresh` `undo` `export` `import`
`search`.

A synonym is not a new verb: `remove`/`clear`/`detach`/`revoke` of a record is `delete`; `edit`/
`change`/`replace` is `update`; `post`/`record`/`upload` of a new record is `create`. A genuinely new
verb is a change to §13.11's table — or, for one project, DEV-PROFILE `Extra action verbs` with a
`DEC-NNN`.

## Parameters

| Question | Answer |
|---|---|
| Boolean filter | `is_<adjective>` or `has_<noun>`: `is_open`, `is_starred`, `has_release`. Never a bare adjective (`open`, `live`) |
| Id parameter | `<noun>_id`, snake_case, in path and query alike: `release_id`, never `releaseId` or `id` alone below the first level |
| Page size | `limit`, default and maximum from DEV-PROFILE `## Defaults` `Page size`, else 20 / 100, on every list. One number per service |
| Sort | `sort=field,-field`, whitelisted, tiebreaker last (§13.1). Never `order_by` or `sort_by` |
| Totals | `include=total`, opt-in |

## Every write declares two things

```yaml
post:
  operationId: approveRelease
  x-idempotency: required            # or exempt:<why a retry is safe without a key>
  x-concurrency: if-match            # or lww:ADR-NNN, or none:<why no lost update is possible>
  parameters:
    - $ref: '#/components/parameters/IdempotencyKey'
    - $ref: '#/components/parameters/IfMatch'
  responses:
    '200': …
    '412': { $ref: '#/components/responses/Problem' }
```

`required` needs an `Idempotency-Key` parameter; `if-match` needs an `If-Match` parameter and a
412. Writing the reason for an exemption is the point: the absent key on a create is then a
decision someone reviewed, not a gap.

## Errors

Every 4xx/5xx is `application/problem+json` with a `type` from `api/<slug>/problems.yaml`, and the
contract's `ProblemType` enum lists exactly the catalogue's types. Write the catalogue in the same
sitting as the contract, from `<root>/_templates/problems.yaml`:

1. One row per refusal the requirements describe, named `<noun>-<state>` with the §13.11 suffix
   for its meaning. Five words for "cannot be used" is five types a client must learn.
2. One status per type. If two operations answer the same condition differently, one is wrong.
3. A rule about one field is `validation` with a `FieldError.code` from the one enum; the enum is
   what the `fielderr` package is generated from.
4. Titles in sentence case, fixed per type.
5. `client_ux` per type, so G5's error-UX matrix has something to check against.

Then run `node <root>/scripts/problems-check.mjs <slug>`, `api-style-check.mjs <slug>` and
`api-contract-check.mjs <slug>`; all three go in the validation evidence, and `api-score.mjs` reads
their `--json` at G4.
