---
template_for: codebase-map
gate: GK
authored_by: dev-analysing-source
reviewed_by: dev-reviewing-knowledge
---

<!--
The map answers "where does this live, and who owns it?" for someone who has never opened the repo.
Every claim cites a path, because a map that is merely plausible is worse than none — it is trusted
and wrong. `grounded_at` is the commit these paths were read at; when the cited files change, this
card is stale and `/sdlc-onboard --refresh` rebuilds it.
-->

---
stage: knowledge
artifact: codebase-map
status: draft
authored_by: dev-analysing-source
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Shape

<The repository in one paragraph: monolith or services, languages, how a request enters and leaves. What a new engineer needs before opening a file.>

## Modules

<One row per module or package that a change could land in. Ownership is the column people will actually look up.>

| Module | Path | Responsibility | Owner | Depends on | Depended on by |
|---|---|---|---|---|---|

## Entry points

<Where execution starts: binaries, HTTP routers, job schedulers, queue consumers, CLI commands.>

| Entry point | Path | Kind | Wires |
|---|---|---|---|

## Layering

<The dependency direction the code actually follows, and where it is violated. Cite the violations — they are where a new change is most likely to make things worse.>

## Cross-cutting concerns

<Where auth, logging, config, error mapping, tracing and migrations live. A change that reimplements one of these is the most common brownfield mistake. With a UI, one row `Brand`: the logo, favicon, manifest, share image and theme colours found, each cited, or "none found".>

| Concern | Lives in | Use it via |
|---|---|---|

## Build and run

<The commands that build, test and run this repo locally, and where CI defines them.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
