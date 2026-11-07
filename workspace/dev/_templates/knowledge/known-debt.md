---
template_for: known-debt
gate: GK
authored_by: dev-analysing-source
reviewed_by: dev-reviewing-knowledge
---

<!--
What not to touch, what is mid-change, and why. Every stage reads this card, because the fastest way
to lose a week is to build on a module that is being replaced, or to "fix" something that is the way
it is for a reason nobody wrote down until now.

Each row needs an owner and a status. Debt with no owner is not tracked debt; it is a surprise
scheduled for later.
-->

---
stage: knowledge
artifact: known-debt
status: draft
authored_by: dev-analysing-source
reviewed_by: pending
grounded_at: <commit sha>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
---

## Do not touch

<Code that is fragile, load-bearing and poorly tested, where the right move is to work around it and schedule a proper change. Say what happens when it is touched carelessly.>

| Area | Path | Why it is dangerous | Owner | Plan |
|---|---|---|---|---|

## Mid-migration

<Anything currently in the expand or contract phase of a change: dual-writes, deprecated columns still read, flags that gate half-finished features. New work must not assume either the old or the new shape is the only one.>

| What | State | Since | Owner | Completes when |
|---|---|---|---|---|

## Deprecated but alive

<Endpoints, modules and patterns that are officially replaced but still in use, and by whom.>

## Decisions with unwritten reasons

<Things that look wrong and are deliberate. The reason belongs here or in an ADR — until it is written down, every new engineer will try to fix it.>

## Open incidents and postmortems

<Recent production failures relevant to this code, and the actions still open from them.>

## Sources and gaps

<What you read to write this card, what you could not reach and why, and what you deliberately left out. A card that is silent about its gaps is read as complete — which is how a later stage designs against two thirds of a system without knowing it.>
