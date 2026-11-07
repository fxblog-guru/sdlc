# Comments in the code an author writes

The next reader of this code is usually another agent with none of this session's context. The code
already tells it **what** happens; a comment exists only for what the code cannot say.

## Write one when the reason is invisible

- **A workaround or a trap:** what breaks if the obvious version is used. `// Edge, not Chrome:
  the Chrome driver is removed on this machine`.
- **An outside constraint:** a vendor quirk, a spec clause, a limit set somewhere else.
  `// the proxy appends "data: [DONE]"; skip it before JSON.parse`.
- **The rejected obvious alternative,** so nobody "simplifies" it back: why not a join, why the
  lock, why the sleep is a poll.
- **A decision with a trade-off:** cite its id instead of retelling it (`// DEC-007`, `// ADR-003`,
  `// AC-109: 422 keeps the input`).
- **A suppression:** every `_ =`, `# type: ignore[...]`, `eslint-disable`, `noqa`, `@ts-expect-error`
  says why on the same or the line above. The language skills already require this.

## Do not write

- A restatement of the next line (`// increment i`, `// get the user by id`).
- A banner, a section divider, or a docstring that repeats the signature.
- History: who changed it, when, "was X before", "fixed bug" — that is the commit message.
- Commented-out code. Delete it; git keeps it.
- A `TODO` with no owner and no `TASK-NNN` / `DEC-NNN`.

## Keep them true

- Match the comment density and style of the file you are in. Do not introduce a new convention
  (JSDoc everywhere, header blocks) that `knowledge/conventions.md` does not show.
- When you change code, fix or delete the comment above it in the same diff. A comment that no
  longer matches the code is a finding, not a harmless leftover.
- A public API keeps the doc comment its language's tooling reads (godoc, docstrings, TSDoc) when
  the conventions card shows one; say what callers must know (units, errors, nil/empty), not how.
