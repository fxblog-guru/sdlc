---
template_for: visual-design
gate: G5
authored_by: dev-designing-visuals
reviewed_by: dev-reviewing-ui
---

<!--
The wireframe decided what is on each screen. This document decides what it looks like, and it is
the picture G7 builds to and G8 compares against. A low-fi wireframe taken as the look is how a
product ships grey, with flat type and four nested boxes, while every gate is green. The screens
here are real HTML on the kit, rendered and shot, not a description of a look.
-->

---
slug: <slug>
stage: ui
artifact: visual-design
status: draft
authored_by: dev-designing-visuals
reviewed_by: pending
tracker: <KEY | none>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
requirements: []
# approved_by: <the requester's name>   # set only when the requester has approved the shots (§3.1)
# approved_on: <YYYY-MM-DD>
# approvals: { design: <name>, engineering: <name>, accessibility: <name> }   # the other three UI sign-offs, humans only (§13.13)
---

## Basis

<The kit base (shadcn/ui new-york or Radix Themes, from design-tokens.md §Kit), the preset and the docs/design-tokens.json sha256 it renders, the wireframe it follows on content, and the ui-spec screens it draws. Then one line `Brand: (a) <kit path> | (b) <repo>/brand/ | (c) placeholder — DEC-NNN` and one `Areas: <area> — themed | plain` per secondary area (admin, back office), or `Areas: none`. Every brand use is a slot under brand/, never inline.>

## Screens

<One row per high-fi screen in visual/index.html: the archetype it covers (shell, list/table, detail/dashboard, form/dialog, empty state, sign-in), the ui-spec screen it is drawn from, and its anchor.>

| Archetype | ui-spec screen | Anchor | Notes |
|---|---|---|---|

## Shots

<Every ui-snap PNG at 1440, 1024 and 360, by path under visual/shots/, and the compare.html that links them.>

| Screen | 1440 | 1024 | 360 |
|---|---|---|---|

## Rubric

<The ui-rubric.mjs summary line for visual/index.html at each width, and every advisory finding left standing, with the reason. A hard fail (overflow, a clipped column, more than one primary button in a view) does not leave this step.>

## Decisions

<Every look choice the tokens and the patterns did not already make: the hero number, the status treatment, the table density, the empty-state illustration style. Each one either cites a token or is raised as a token change.>

## Approval

<Who approved the shots, when, and the screens they did not approve with the reason; or "pending — sent to <name> on <date>". G6 does not start while this says pending. Then the usability pass (§23): `Usability: <task> — <who> — <time> — <where they hesitated>`, one task a named person walked on the preview, not the agent.>
