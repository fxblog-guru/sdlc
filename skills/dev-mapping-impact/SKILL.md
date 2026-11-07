---
name: dev-mapping-impact
description: Use in /sdlc-design (G2) to write impact.md: every module, table, endpoint, screen, job and test touched, found by searching the code.
---

# Mapping impact — G2

You are answering one question about a change that has not been built yet: **what else does this
touch?**

It is the question a design review can verify and a designer routinely gets wrong, because the honest
answer requires searching and the plausible answer requires only thinking. A reviewer at G2 is
instructed to spot-check your claims with `grep`. Write this document so that check passes.

## What you are producing

`<root>/design/<slug>/impact.md` from its template, alongside `architecture.md`.

## Search. Do not reason.

The failure mode is specific and it is not carelessness: you know the system, you consider what
depends on this, you list what comes to mind, and it reads as complete. The three call sites you
remembered are real. The fourth — in a scheduled job somebody added last quarter — is the one that
breaks, and nothing in your document hints that it was never looked for.

So every row cites what you ran or what you opened.

| Claim | The evidence that belongs next to it |
|---|---|
| "three call sites use this function" | `grep -rn "FetchJobs(" --include=*.go` → 3, with paths |
| "no other screen reads this field" | the search across the frontend, with its scope |
| "nothing references this table" | the grep across queries **and** migrations **and** any generated code |
| "this endpoint has no external consumers" | how you established that — a gateway config, access logs, or say you could not |

That last row matters. "I could not determine external consumers from this repository" is a valid
and valuable entry. An empty consumers section that means the same thing is not, because a reader
cannot tell it apart from "none".

## Where to look, in order

1. **Direct references.** The symbol, the type, the endpoint path, the table name. Search generated
   code and fixtures too — they are code, and they break.
2. **Indirect references.** String literals, reflection, dependency-injection registration, config
   keys, feature flags, SQL in non-code files. A `grep` for the symbol misses every one of these,
   and they are where the surprises live.
3. **The database.** Foreign keys pointing at the table, views and materialised views over it,
   triggers, stored procedures, and anything reading it outside this repository — a report, an ELT
   job, an analytics pipeline. The last category is invisible from the code and is exactly what a
   column rename breaks.
4. **The contract surface.** Endpoints whose response shape changes, events whose payload changes,
   and anyone consuming them. Removing a field is breaking even when nothing in this repository
   reads it.
5. **The UI.** Screens, components and states that render this data or call this endpoint.
6. **Tests.** Which existing tests cover the touched paths — they are your regression surface, and
   their absence is itself a finding worth writing down.
7. **Operations.** Dashboards, alerts and runbook entries that reference what you are changing. An
   alert whose query silently returns nothing after a rename is worse than a broken alert, because
   nobody notices.

## Say what breaks, not just what is touched

A list of affected files is an inventory. The document is useful when each row says what happens if
this goes wrong:

- **Breaking** — an existing caller stops working. Name the caller and what it sees.
- **Behavioural** — it keeps working but does something different. Say what, and whether anyone
  depends on the old behaviour.
- **Compatible** — additive, nothing observable changes. Say why you are confident.

Then the two that G10 will need: **what does rollback look like** once this is deployed, and **is
there a window where old and new code run simultaneously** — because in any rolling deploy there
is one, and a change that is only correct after every instance has restarted is a migration problem,
not a deploy problem (§7).

## Scope it to what is true

An impact map that lists everything is as useless as one that lists nothing; both make the reader do
the work again. Be specific about what you searched: the directories, the file types, the terms. A
reviewer can then judge whether the search was wide enough, which is a question they can answer —
unlike "is this list complete", which they cannot.

Where you know a search was incomplete, say so with what would complete it. That converts an unknown
into a task somebody can pick up.

## Greenfield

With `project_maturity: greenfield` and no existing system, most sections are legitimately
`N/A — no existing system`. Write it and move on. What is never `N/A` is impact on anything already
shipped, however small the codebase is — the first module you wrote is already a dependency for the
second.

## Do not

Write code, change anything you find, set `status: approved`, or write a gate log. Where your search
turns up a real problem — an existing bug, a table nobody uses, a dead endpoint — record it in
`## Notes` rather than fixing it here. A cleanup smuggled into a feature change is a cleanup nobody
reviewed.
