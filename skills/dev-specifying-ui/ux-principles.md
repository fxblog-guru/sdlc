# Experience at principal level (G5)

Read this when a change adds a screen, a navigation entry, a form or a dialog. The G5 checklist rows
33–34 cite this file. A junior spec matches the mock-up. A principal spec makes the product easy to
find your way in, for everyone, including people who use a keyboard or a screen reader.

## Principles

| # | Principle | Why | When it does not hold |
|---|---|---|---|
| 1 | Structure before screens | Information architecture (what exists, where, called what) decides whether people find anything | A one-screen tool |
| 2 | Users' words, not ours | Labels come from the glossary and from how users talk, never from table names | — |
| 3 | Important things are visible | Nothing a user needs lives only behind a hover, a long-press or an unlabelled icon | Shortcuts that duplicate a visible control |
| 4 | Every task has a shortest path, stated | "Reach any release in two steps from home" can be checked | — |
| 5 | Keyboard first | Everything works with Tab, Enter, Space and Escape in a sensible order | — |
| 6 | Focus follows the user's attention | A dialog takes focus and returns it on close; an error moves focus to itself | — |
| 7 | Changes are announced | A saved toast, a loaded list or a failed upload reaches a screen reader through a live region | — |
| 8 | Recognition over recall | Show options and recent items; do not make people remember ids | — |
| 9 | Errors say what happened and what to do | "Something went wrong" is not a message (copy style guide) | — |
| 10 | Consistency beats novelty | The same action looks and works the same everywhere (the kit, §13.3) | — |

## Trade-offs

| Choice | Choose the first when | Choose the second when |
|---|---|---|
| Deep · flat navigation | Many items with a clear hierarchy | Few items used often |
| Modal · inline | The user must decide before going on | The task can continue around it |
| Icon only · icon with label | Universal symbols (close, search) with an accessible name | Everything else |
| Progressive disclosure · everything at once | Experts and novices share a screen | A short form |

## Anti-patterns

| What a junior does | How the reviewer spots it |
|---|---|
| Actions that appear only on hover | A row's edit or delete control visible only on mouse-over |
| Labels from the database | `rel_train_id`, "Entity", "Record" in the copy |
| A dialog that leaves focus behind it | Opening a dialog with no focus target, closing it with no return |
| A toast nobody hears | Status shown visually only, no live region |
| Mystery-meat icons | Icon buttons with no label and no accessible name |

G5 fails a spec that commits one of these.
