---
template_for: api-as-is
gate: GK
authored_by: dev-analysing-source
reviewed_by: dev-reviewing-knowledge
---

<!--
The contracts actually in production — the baseline that G4's contract-diff.md compares against.
Where a published spec exists, cite it and note where the running service disagrees with it; where
none exists, this card is the spec, reconstructed from routes and handlers with a path cited for
each.

Consumers matter more than endpoints. An endpoint with an unknown caller cannot be changed safely,
and finding that out at G4 is far cheaper than finding out from a mobile crash report.
-->

---
stage: knowledge
artifact: api-as-is
status: draft
authored_by: dev-analysing-source
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Provenance

<Where this came from: a published OpenAPI file, gateway config, route registration in code — with paths. Note where the running service disagrees with the published spec.>

## Conventions in force

<How this API actually behaves today: pagination style, error shape, auth, versioning, naming. Where it diverges from DEV-CONTRACTS §13.1, say so — new endpoints follow the contract, and the divergence becomes known debt.>

## Endpoints

<One row per endpoint, with the code that handles it and who is known to call it.>

| Endpoint | Handler (file:line) | Auth | Consumers | Evidence of consumers |
|---|---|---|---|---|

## Events and queues

<Published events, consumed queues, their schemas, and their producers and consumers.>

## Deprecations in flight

<Anything already marked deprecated, its removal date, and who has not migrated yet.>

## Hazards

<Endpoints with unknown callers, undocumented behaviour clients depend on, responses that leak internals — anything a change here could break silently.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
