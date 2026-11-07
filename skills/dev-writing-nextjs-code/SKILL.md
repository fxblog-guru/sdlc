---
name: dev-writing-nextjs-code
description: Use in /sdlc-implement (G7) for App Router work under app/: server/client boundary, caching, loading/error boundaries, server actions.
---

# Writing Next.js — G7

Next.js fails differently from React, and almost always in the same place: **the boundary between
what runs on the server and what runs in the browser.** Everything in this skill is downstream of
getting that boundary right and writing it down.

`dev-writing-react-code` owns the component: state, hooks, accessibility, the seven UI states inside
a view. This skill owns what is above it — where code runs, what is cached, what is revalidated, and
what the page tells the browser before any component renders.

> `DEV-CONTRACTS.md` §13.3 (UI standards and the nine states of §13.13), §13.1 (pagination, which the server
> component is usually the one calling). `ui-spec.md` from G5 and the API contract from G4 are
> inputs, not suggestions.

## The server/client boundary is a decision, so record it

Every component is a server component until something forces otherwise. The things that force it are
finite and worth naming, because "I added `'use client'` and it worked" is how an entire tree ends up
in the bundle:

| Forces a client component | Does not |
|---|---|
| `useState`, `useReducer`, `useEffect`, `useRef` on a DOM node | reading data |
| an event handler passed to a DOM element | rendering a child that is itself a client component |
| a browser API — `window`, `localStorage`, `IntersectionObserver` | formatting, branching, mapping |
| a library that does any of the above internally | passing a server action down as a prop |

`'use client'` marks a **boundary, not a file**: everything imported below it goes to the browser
too. So push it down as far as it will go. The common repair is to keep the data-fetching parent on
the server and make only the interactive leaf a client component — which usually means passing
already-shaped data down rather than an ID the leaf then fetches.

**A secret read in a client component is a leaked secret**, not a bug you fix later. Anything under
a `'use client'` boundary, including values interpolated into props, is readable in the browser.
`NEXT_PUBLIC_` is a statement that a value is public; treat adding that prefix as a decision that
needs a reason in the change summary.

## Caching: say what you chose, because the default is not obvious

The failures here are not crashes. They are a page that shows yesterday's data to a customer, or a
dashboard that hammers the database on every request — both of which look fine in development and
diverge in production, which is where the cost lands.

For each `fetch` or data read, state one of:

- **static** — safe to serve until the next deploy. Say what makes that true.
- **revalidated after N seconds** — say where N came from. A number with no reasoning is copied
  forever.
- **per-request / uncached** — anything user-specific, anything behind auth, anything a write just
  changed.
- **tagged**, revalidated explicitly after a mutation — the right default when a write should be
  visible immediately.

A mutation that changes what a cached page shows must invalidate it in the same action. A server
action that writes and returns without revalidating produces the single most confusing bug in this
stack: the write succeeded, the database is correct, and the screen still shows the old value.

## Loading and error boundaries are the states, at route level

The ui-spec's states (§13.13) are a component-level rule; the App Router gives you three of them as files,
and leaving them out does not mean "no loading state" — it means the loading state is a blank page.

- `loading.tsx` — the skeleton for this segment. Its shape should match what replaces it, or the
  layout jumps and the page reads as broken.
- `error.tsx` — a client component by requirement. It gets `reset()`; use it, because an error
  boundary with no way out is a dead end with a nicer font. It must not leak the raw error to the
  user while also not hiding it from the logs.
- `not-found.tsx` — the empty state for "this id does not exist", which is a different state from
  "this list is empty" and is routinely conflated with it.

The remaining states — partial, offline/stale, permission-denied — live in the components, and
`ui-spec.md` says what each looks like.

The shell from `docs/ui-patterns.md` is the root `layout.tsx` (or the route group's). It is built
once, and `tokens.css` is imported there. A `loading.tsx` skeleton follows the loading default of
the pattern the screen names, so every list in the product loads the same way.

## Server actions are public endpoints

This is the sentence to keep. A server action compiles to an HTTP endpoint, and the fact that your
UI only calls it from one form is not an access control.

So: validate the input inside the action, with a schema, against the same rules the API contract
states — never trust the client's shape. Check authorisation inside the action, not in the component
that renders the form. Return typed results rather than throwing for expected failures, so the form
can show the error state §13.3 requires rather than tripping the error boundary. And obey §13.2's
error shape where the action's failure surfaces as one.

## The things a page owes

`metadata` or `generateMetadata` on every route that a person can link to — a title and description
at minimum, because a route without them silently inherits the layout's, and every page in the
product ends up named the same thing in a browser tab and in a shared link.

Dynamic routes that can be enumerated declare `generateStaticParams`, or state why they cannot.
Images go through `next/image` with explicit dimensions; layout shift is a measurable regression and
G8 measures it.

## Do not

- Do not make a component a client component to silence an error you have not read. The error nearly
  always names the exact hook or API that forced it, and the fix is usually to move that one line.
- Do not fetch in a client component what the server component above it could fetch — that is a
  waterfall, and it is visible to the user as a second spinner.
- Do not read `searchParams` or `params` in a way that opts a whole route out of static rendering
  without saying so. It is a legitimate choice with a real cost, and it must be a stated one.
- **Do not resolve an open `DEC-NNN` by picking a caching policy.** §15.2 — write what the decision
  does not touch, mark the rest `N/A — blocked by DEC-NNN`.
- Do not revise `ui-spec.md` because the implementation would be simpler. That is a finding, and
  editing it turns G5 `STALE` (§4.4).
- Do not write e2e tests. That tier belongs to `agentic-fx-qa` (§9).
- Do not ship a unit test for an `AC-NNN` or `UB-NNN` without the id in its title, or raise a
  timeout or add a retry without `// slow-test: <cause>` (§13.10; tests follow `dev-writing-react-code`).
