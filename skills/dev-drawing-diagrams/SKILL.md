---
name: dev-drawing-diagrams
description: Use when an artifact needs a diagram (C4, sequence, activity, ER, DFD, deploy, CI/CD, screen flow): mermaid, checked by diagram.mjs.
---

# Drawing diagrams

A diagram carries a structure that prose carries badly: topology, ordering, containment,
cardinality, who talks to whom. The reasoning behind that structure (why this shape, what it gives
up, what breaks) stays in the prose, because a reviewer can quote prose in a finding and cannot
quote a picture.

The rule runs both ways (§13.8). No gate fails for lacking a diagram; `dev-reviewing-design` grades
that objection `MINOR` at most. No gate passes on a diagram whose claims the prose does not also
make.

## How: mermaid, inside the artifact

Every diagram is a ` ```mermaid ` block inside the artifact it illustrates, under the section it
supports. It is not a separate file. That keeps it text, so it diffs, a reviewer reads it in the
same pass, and it is hashed with the artifact. GitLab, GitHub and VS Code render it in place. No
third-party software is needed.

Give every block a title in front matter:

````
```mermaid
---
title: Place order — sequence
---
sequenceDiagram
    ...
```
````

Then run the checker. A finding from it is a finding at review:

```
node <root>/scripts/diagram.mjs check  <slug>      # every artifact of the slug, no browser
node <root>/scripts/diagram.mjs render <slug>      # check + draw → <root>/diagrams/<slug>/
```

- **`check`** runs static rules without a browser. It requires a known type and a title, declared
  lifelines, a failure path in every sequence, a guard on every decision branch, and a PK on every
  entity. Every participant, entity and C4 element you draw must also be named in the prose.
- **`render`** parses each block with mermaid in headless Edge or Chrome. A block mermaid cannot
  parse is `E703`, so **run `render` before you hand the artifact to review**. If you are offline,
  pass `--mermaid <local mermaid.min.js>`.

**Everything rendered lands in one place, `<root>/diagrams/<slug>/`**, and it is rebuilt on every run:

```
<root>/diagrams/<slug>/
  index.html                                   ← open this one: contents table by gate, then every diagram
  01-G2-architecture-system-context.svg
  02-G2-architecture-place-order-sequence.svg
  03-G3-data-model-orders-er.svg
  04-G5-ui-spec-checkout-screen-flow.svg
  05-G10-release-plan-production-deployment.svg
```

Each file is named number, gate, artifact, then the slug of its title, so the folder sorts in
reading order. Each entry in `index.html` links back to the artifact and line that own it. Tell the
requester one path: `<root>/diagrams/<slug>/index.html`.

The rendered files are derived, like `DASHBOARD.md`. Do not list them in the gate log `outputs:`.
The artifact is listed there, and it already contains the diagram source.

## The standard each diagram is drawn to

The notation is the industry's, not ours. `catalogue.md` holds a correct minimal example of each.
Copy one and adapt it rather than drawing from memory.

| # | Diagram | Notation (mermaid type) | Gate · artifact · section |
|---|---|---|---|
| 1 | Architecture overview | C4 level 1, context (`C4Context`) | G2 `architecture.md` `## Overview` |
| 2 | Component | C4 level 2 containers, and level 3 where one container is non-trivial (`C4Container`, `C4Component`) | G2 `architecture.md` `## Components` |
| 3 | Sequence | UML 2.5 sequence (`sequenceDiagram`) | G2 `architecture.md` `## Flows`, one per core use case |
| 4 | Activity | UML activity, as `flowchart TD` with UML shapes | G1 `requirements.md` `## Functional requirements`, or G2 `## Flows` |
| 5 | State machine | UML state (`stateDiagram-v2`) | G2 `## Flows`, or G5 for a screen with more than the standard states |
| 6 | ER | crow's foot, with PK/FK/UK (`erDiagram`) | G3 `data-model.md` `## Relationships` |
| 7 | Data flow (DFD) | Yourdon/DeMarco level 0–1 with trust boundaries, as `flowchart LR` | G2 `threat-model.md` `## Trust boundaries` |
| 8 | API | **none — the contract is the picture.** `openapi.yaml` (G4) is the standard; a sequence in `## Flows` shows how it is called | G4 |
| 9 | Screen flow | `flowchart LR`, one node per screen, edges labelled with the user action | G5 `ui-spec.md` `## User flows` |
| 10 | Deployment | C4 deployment (`C4Deployment`), or `flowchart` with nested subgraphs per environment and zone | G10 `release-plan.md` `## Release` |
| 11 | CI/CD pipeline | `flowchart LR`, one subgraph per stage, with gates as decisions | G10 `release-plan.md` `## Deploy steps` |
| 12 | Migration timeline | `flowchart LR` of expand → migrate → contract against the deploys | G3 `migration-plan.md` |
| 13 | Task dependencies | `flowchart LR` of `TASK-NNN` | G6 `tasks.md` `## Sequence`, when it is not a straight line |
| 14 | Runbook | `flowchart TD`: symptom → check → action | G11 `runbook.md` `## Alert responses` |

The rest of the twelve-item design checklist is a document, not a diagram, and other skills own it.
ADRs belong to `dev-brainstorming-architecture`, the threat model to `dev-modeling-threats`, the
OpenAPI contract to `dev-designing-api`, and wireframes and visual design to `dev-specifying-ui` and
`dev-designing-visuals`. Requirement → design → test traceability is §6, the ui-spec
`### Traceability` table, and the QA handoff.

## Rules that make a diagram correct, not just drawn

These are the rules a reviewer checks. The ones marked ✓ are also checked by `diagram.mjs`.

**Sequence**
- Declare every lifeline in reading order: actor, then client, service, store, and externals last ✓.
- Use a solid arrow `->>` for a call and a dashed arrow `-->>` for a return. Use `-)` for an async
  message and `-x` for a lost one.
- Mark activation (`+` / `-`) where a call holds a thread, a lock or a transaction.
- Draw the failure path as `alt` / `else` (or `opt`, `break`) ✓: timeout, 4xx, 5xx, retry. Name the
  status and the timeout value. Showing only the happy path is how partial failure gets discovered
  in production.
- A message names the real operation: `POST /orders` or the `operationId`, and the event or topic
  name. It should match G4.

**Activity**
- Start and end are stadium nodes `([Start])` / `([End])`, an action is `[Verb object]`, and a
  decision is `{Question?}`.
- Every edge out of a decision carries a guard `-->|yes|` ✓. The guards must be exhaustive, so if
  there are three outcomes, draw three edges.
- Fork and join for parallel work: `subgraph` per lane, or a `[[fork]]` node. Swimlanes are a
  `subgraph` per actor.

**ER**
- Every entity has a `PK` ✓, and every FK column is marked `FK`. Natural keys are `UK`.
- Cardinality uses crow's foot on both ends (`||--o{`, `}|--||`). The relationship verb reads left
  to right (`CUSTOMER ||--o{ ORDER : places`).
- Entity names match `ENT-*` in `## Entities` ✓. The cardinality must agree with `## Relationships`,
  because a contradiction there is a G3 finding, not a style one.

**C4 (overview, component, deployment)**
- Draw one level per diagram. Never mix systems and components in one picture.
- Every element has a name, a technology and, where useful, a one-line responsibility. Every `Rel`
  has a verb and a protocol (`"Reads/writes", "SQL"`).
- Mark external systems `_Ext`. Mark data stores `*Db` and queues `*Queue`.

**DFD**
- Externals are `[/External/]`, processes `(Process)`, and stores `[(Store)]`. Every flow is
  labelled with the data it carries, never a verb.
- Each trust boundary is a `subgraph` named after `## Trust boundaries`. A flow that crosses one is
  a row in the STRIDE table.

**Deployment and CI/CD**
- In a deployment diagram, nest node → environment → runtime → container, and give the real
  numbers: replicas, region, zone.
- In a pipeline diagram, a gate (approval, quality gate, smoke) is a decision with pass and fail
  edges, and the fail edge goes somewhere: stop, rollback or notify.

**All of them**
- Keep each diagram to 20 elements or fewer ✓. Beyond that, split by use case or go one C4 level
  down.
- Use names from the artifact: the same component, entity and screen names as the prose ✓. No
  `Service1` or `DB`.
- No colour carries meaning on its own, and no `style` / `classDef` hard-codes theme colours.
  `render` uses a neutral theme so the output reads in print and in dark mode.

## When not to draw

Most of the time. The cost of a diagram is maintaining it, and an out-of-date diagram misleads in a
way out-of-date prose usually does not.

- Skip it for three boxes in a row, or a list that happens to be vertical. Write the sentence.
- Do not draw to look thorough, or for something still being decided, because drawing makes it
  feel settled.

The test is whether this diagram lets a reader answer a question the prose cannot answer quickly.
If you cannot name that question, do not draw it.

## Accuracy

A diagram makes claims, and the reviewer checks them against the prose and the code. An arrow that
is not in the design, a boundary in the wrong place, or a cardinality that contradicts the data
model is each a finding at the severity of the claim it gets wrong. In a brownfield repo, a diagram
of the existing system is held to the citation standard of the knowledge card it illustrates.

If the artifact's prose and its diagram disagree, **the prose is right** and the diagram is the
defect.
